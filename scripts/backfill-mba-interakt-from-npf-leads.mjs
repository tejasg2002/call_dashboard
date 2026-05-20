#!/usr/bin/env node
/**
 * MBA: backfill top-level lead fields on ITM_BS.interaktWhatsappWebhookEvents from NPF CSV.
 *
 * Maps by phone (all templates):
 *   - Traffic_Channel → source (if column present)
 *   - City → City + city (if column present)
 *   - State → State + state (if column present)
 *
 * Usage:
 *   node scripts/backfill-mba-interakt-from-npf-leads.mjs --dry-run
 *   node scripts/backfill-mba-interakt-from-npf-leads.mjs --apply
 *   node scripts/backfill-mba-interakt-from-npf-leads.mjs --apply --csv=ITM_BS.npfLeadsWebhookEvents.csv
 *   node scripts/backfill-mba-interakt-from-npf-leads.mjs --apply --only=city,state
 *   node scripts/backfill-mba-interakt-from-npf-leads.mjs --apply --only=city,state --start-group=1000
 *   node scripts/backfill-mba-interakt-from-npf-leads.mjs --verify --only=city,state
 */

import 'dotenv/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'
import {
  MBA_INTERAKT_COLLECTION,
  MBA_INTERAKT_DB,
  groupPhonesByLeadFields,
  loadNpfLeadPhoneMap,
  mongoSetFromLeadFields,
  phoneMatchFilter,
  variantsForPhoneBatch,
} from './lib/mbaInteraktNpfCsv.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_CSV = resolve(__dirname, '..', 'ITM_BS.npfLeadsWebhookEvents.csv')
const PHONE_BATCH = 150

function parseArgs() {
  const out = { dryRun: true, csvPath: DEFAULT_CSV, only: null, startGroup: 1, verify: false }
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') out.dryRun = false
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--verify') out.verify = true
    else if (a.startsWith('--csv=')) out.csvPath = resolve(a.slice('--csv='.length))
    else if (a.startsWith('--start-group=')) {
      out.startGroup = Math.max(1, parseInt(a.slice('--start-group='.length), 10) || 1)
    }
    else if (a.startsWith('--only=')) {
      out.only = new Set(
        a
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    }
  }
  return out
}

async function updateManyWithRetry(col, filter, setFields, maxAttempts = 4) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await col.updateMany(filter, { $set: setFields })
    } catch (err) {
      lastErr = err
      const retryable =
        err?.errorLabelSet?.has?.('PoolRequestedRetry') ||
        err?.name === 'MongoNetworkTimeoutError' ||
        /timed out|network|ECONNRESET/i.test(String(err.message))
      if (!retryable || attempt === maxAttempts) throw err
      const wait = attempt * 3000
      console.warn(`  [retry ${attempt}/${maxAttempts - 1}] ${err.message?.slice(0, 80)} — waiting ${wait}ms`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

function filterLeadByOnly(lead, only) {
  if (!only?.size) return lead
  const out = {}
  if (only.has('source') && lead.source) out.source = lead.source
  if (only.has('city') && lead.city) out.city = lead.city
  if (only.has('state') && lead.state) out.state = lead.state
  return out
}

async function main() {
  const uri = process.env.COMMUNITY_URI
  if (!uri) {
    console.error('COMMUNITY_URI is not set in .env')
    process.exit(1)
  }

  const { dryRun, csvPath, only, startGroup, verify } = parseArgs()
  console.log(`CSV: ${csvPath}`)
  console.log(`Target: ${MBA_INTERAKT_DB}.${MBA_INTERAKT_COLLECTION} (all templates)`)
  if (only?.size) console.log(`Fields: ${[...only].join(', ')}`)
  if (verify) console.log('\n*** VERIFY ONLY (no writes) ***\n')
  else if (dryRun) console.log('\n*** DRY RUN (pass --apply to write) ***\n')
  else {
    console.log('\n*** APPLYING UPDATES ***\n')
    if (startGroup > 1) console.log(`  Resuming from group ${startGroup} (skipping 1–${startGroup - 1})\n`)
  }

  const { phoneToLead: rawMap, stats, columns } = await loadNpfLeadPhoneMap(csvPath)

  const phoneToLead = new Map()
  for (const [phone, lead] of rawMap) {
    const filtered = filterLeadByOnly(lead, only)
    if (Object.keys(mongoSetFromLeadFields(filtered)).length > 0) {
      phoneToLead.set(phone, filtered)
    }
  }

  const groups = groupPhonesByLeadFields(phoneToLead)

  console.log('--- CSV ---')
  console.log(`  Data rows:         ${stats.csvRows.toLocaleString()}`)
  console.log(`  Unique phones:     ${rawMap.size.toLocaleString()}`)
  console.log(`  Phones w/ fields:  ${phoneToLead.size.toLocaleString()}`)
  console.log(`  Skipped no phone:  ${stats.skippedNoPhone.toLocaleString()}`)
  console.log(`  Duplicate phones:  ${stats.duplicatePhones.toLocaleString()} (last row wins)`)
  console.log(`  Columns:           source=${columns.hasSource} city=${columns.hasCity} state=${columns.hasState}`)
  console.log(`  Update groups:     ${groups.size.toLocaleString()}`)

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 60_000,
    socketTimeoutMS: 300_000,
    maxPoolSize: 10,
  })
  await client.connect()
  const col = client.db(MBA_INTERAKT_DB).collection(MBA_INTERAKT_COLLECTION)

  if (verify) {
    const withCity = await col.countDocuments({ City: { $nin: [null, ''] } })
    const withState = await col.countDocuments({ State: { $nin: [null, ''] } } })
    const withEither = await col.countDocuments({
      $or: [{ City: { $nin: [null, ''] } }, { State: { $nin: [null, ''] } }],
    })
    const totalDocs = await col.estimatedDocumentCount()
    console.log('--- Mongo (Interakt) ---')
    console.log(`  Est. total docs:     ${totalDocs.toLocaleString()}`)
    console.log(`  With City set:       ${withCity.toLocaleString()}`)
    console.log(`  With State set:      ${withState.toLocaleString()}`)
    console.log(`  With City or State:  ${withEither.toLocaleString()}`)
    console.log(`  CSV phones w/ loc:   ${phoneToLead.size.toLocaleString()}`)
    console.log(`  Update groups:       ${groups.size.toLocaleString()}`)
    if (startGroup > 1) {
      console.log(`\n  To finish remaining groups only (~${groups.size - startGroup + 1} from #${startGroup}):`)
      console.log(
        `  npm run backfill:mba-interakt-location:apply -- --start-group=${startGroup}`,
      )
    }
    await client.close()
    return
  }

  let totalMatched = 0
  let totalModified = 0
  let batches = 0
  let skippedGroups = 0

  let gi = 0
  for (const { lead: setFields, phones } of groups.values()) {
    gi += 1
    if (gi < startGroup) {
      skippedGroups += 1
      continue
    }
    const label = [
      setFields.source && `source=${setFields.source}`,
      setFields.City && `city=${setFields.City}`,
      setFields.State && `state=${setFields.State}`,
    ]
      .filter(Boolean)
      .join(' · ')

    if (gi <= 20 || gi % 500 === 0) {
      console.log(`\n[${gi}/${groups.size}] ${label} (${phones.length.toLocaleString()} phones)`)
    }

    for (let i = 0; i < phones.length; i += PHONE_BATCH) {
      const batch = phones.slice(i, i + PHONE_BATCH)
      const variants = variantsForPhoneBatch(batch)
      if (!variants.length) continue
      batches += 1
      const filter = phoneMatchFilter(variants)

      if (dryRun) {
        totalMatched += await col.countDocuments(filter)
        continue
      }

      const res = await updateManyWithRetry(col, filter, setFields)
      totalMatched += res.matchedCount
      totalModified += res.modifiedCount
    }
  }

  const sample = await col
    .find(
      { $or: [{ City: { $exists: true } }, { State: { $exists: true } }] },
      { projection: { phone_number: 1, source: 1, City: 1, State: 1, template_name: 1 } },
    )
    .limit(5)
    .toArray()

  console.log('\n--- Summary ---')
  if (skippedGroups) console.log(`  Groups skipped:      ${skippedGroups.toLocaleString()} (resume head)`)
  console.log(`  Groups processed:    ${(gi - skippedGroups).toLocaleString()} / ${groups.size.toLocaleString()}`)
  console.log(`  Update batches:      ${batches.toLocaleString()}`)
  console.log(`  Documents matched:   ${totalMatched.toLocaleString()}`)
  if (!dryRun) console.log(`  Documents modified:  ${totalModified.toLocaleString()}`)

  if (sample.length) {
    console.log('\n  Sample docs:')
    for (const d of sample) {
      console.log(
        `    ${d.phone_number || '?'} | ${d.source || '—'} | ${d.City || '—'} | ${d.State || '—'} | ${d.template_name || ''}`,
      )
    }
  }

  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
