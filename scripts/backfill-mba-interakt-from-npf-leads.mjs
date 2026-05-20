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
  const out = { dryRun: true, csvPath: DEFAULT_CSV, only: null }
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') out.dryRun = false
    else if (a === '--dry-run') out.dryRun = true
    else if (a.startsWith('--csv=')) out.csvPath = resolve(a.slice('--csv='.length))
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

  const { dryRun, csvPath, only } = parseArgs()
  console.log(`CSV: ${csvPath}`)
  console.log(`Target: ${MBA_INTERAKT_DB}.${MBA_INTERAKT_COLLECTION} (all templates)`)
  if (only?.size) console.log(`Fields: ${[...only].join(', ')}`)
  console.log(dryRun ? '\n*** DRY RUN (pass --apply to write) ***\n' : '\n*** APPLYING UPDATES ***\n')

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

  const client = new MongoClient(uri)
  await client.connect()
  const col = client.db(MBA_INTERAKT_DB).collection(MBA_INTERAKT_COLLECTION)

  let totalMatched = 0
  let totalModified = 0
  let batches = 0

  let gi = 0
  for (const { lead: setFields, phones } of groups.values()) {
    gi += 1
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

      const res = await col.updateMany(filter, { $set: setFields })
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
