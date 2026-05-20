#!/usr/bin/env node
/**
 * MBA: set top-level `source` on ITM_BS.interaktWhatsappWebhookEvents from NPF leads export.
 *
 * Phone match (any template / event):
 *   - phone_number
 *   - data.customer.phone_number
 *   - data.customer.channel_phone_number
 *
 * Source value: Traffic_Channel from ITM_BS.npfLeadsWebhookEvents (CSV export).
 *
 * Usage:
 *   node scripts/backfill-mba-interakt-source-from-npf-leads.mjs --dry-run
 *   node scripts/backfill-mba-interakt-source-from-npf-leads.mjs --apply
 *   node scripts/backfill-mba-interakt-source-from-npf-leads.mjs --apply --csv=exports/ITM_BS.npfLeadsWebhookEvents.csv
 */

import 'dotenv/config'
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'
import { MongoClient } from 'mongodb'
import { normaliseMobile, waPhoneVariantsForMatch } from '../src/lib/waPhoneMatch.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const DB = 'ITM_BS'
const WA_COLLECTION = 'interaktWhatsappWebhookEvents'
const DEFAULT_CSV = resolve(__dirname, '..', 'exports/ITM_BS.npfLeadsWebhookEvents.csv')
/** Phones per updateMany ($in size stays index-friendly). */
const PHONE_BATCH = 150

function parseArgs() {
  const out = { dryRun: true, csvPath: DEFAULT_CSV }
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') out.dryRun = false
    else if (a === '--dry-run') out.dryRun = true
    else if (a.startsWith('--csv=')) out.csvPath = resolve(a.slice('--csv='.length))
  }
  return out
}

function parseCsvLine(line) {
  const parts = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  return parts
}

/**
 * @returns {Promise<{ phoneToSource: Map<string, string>, stats: Record<string, number> }>}
 */
async function loadPhoneSourceMap(csvPath) {
  const phoneToSource = new Map()
  let csvRows = 0
  let skippedNoPhone = 0
  let skippedNoSource = 0
  let duplicatePhones = 0

  const rl = readline.createInterface({
    input: createReadStream(csvPath, { encoding: 'utf8' }),
    crlfDelay: true,
  })

  let header = null
  let mobileIdx = -1
  let channelIdx = -1

  for await (const line of rl) {
    if (!line.trim()) continue
    const cols = parseCsvLine(line)
    if (!header) {
      header = cols.map((c) => c.trim())
      mobileIdx = header.findIndex((h) => /^registered_mobile$/i.test(h))
      channelIdx = header.findIndex((h) => /^traffic_channel$/i.test(h))
      if (mobileIdx < 0 || channelIdx < 0) {
        throw new Error(
          `CSV must have Registered_Mobile and Traffic_Channel columns; got: ${header.join(', ')}`,
        )
      }
      continue
    }

    csvRows += 1
    const mobile = cols[mobileIdx]?.trim()
    const channel = cols[channelIdx]?.trim()
    const norm = normaliseMobile(mobile)
    if (!norm) {
      skippedNoPhone += 1
      continue
    }
    if (!channel) {
      skippedNoSource += 1
      continue
    }
    if (phoneToSource.has(norm)) duplicatePhones += 1
    phoneToSource.set(norm, channel)
  }

  return {
    phoneToSource,
    stats: { csvRows, skippedNoPhone, skippedNoSource, duplicatePhones },
  }
}

/** Group normalized phones by traffic channel. */
function groupPhonesBySource(phoneToSource) {
  /** @type {Map<string, string[]>} */
  const bySource = new Map()
  for (const [phone, source] of phoneToSource) {
    const list = bySource.get(source) || []
    list.push(phone)
    bySource.set(source, list)
  }
  return bySource
}

function variantsForPhoneBatch(phones10) {
  const out = new Set()
  for (const p of phones10) {
    for (const v of waPhoneVariantsForMatch([p, `91${p}`, `+91${p}`])) out.add(v)
  }
  return [...out]
}

function phoneMatchFilter(variants) {
  return {
    $or: [
      { phone_number: { $in: variants } },
      { 'data.customer.phone_number': { $in: variants } },
      { 'data.customer.channel_phone_number': { $in: variants } },
    ],
  }
}

async function main() {
  const uri = process.env.COMMUNITY_URI
  if (!uri) {
    console.error('COMMUNITY_URI is not set in .env')
    process.exit(1)
  }

  const { dryRun, csvPath } = parseArgs()
  console.log(`CSV: ${csvPath}`)
  console.log(`Target: ${DB}.${WA_COLLECTION} (all templates)`)
  console.log(dryRun ? '\n*** DRY RUN (pass --apply to write) ***\n' : '\n*** APPLYING UPDATES ***\n')

  const { phoneToSource, stats: csvStats } = await loadPhoneSourceMap(csvPath)
  const bySource = groupPhonesBySource(phoneToSource)

  console.log('--- CSV ---')
  console.log(`  Data rows:           ${csvStats.csvRows.toLocaleString()}`)
  console.log(`  Unique phones:       ${phoneToSource.size.toLocaleString()}`)
  console.log(`  Skipped (no phone):  ${csvStats.skippedNoPhone.toLocaleString()}`)
  console.log(`  Skipped (no source): ${csvStats.skippedNoSource.toLocaleString()}`)
  console.log(`  Duplicate phones:    ${csvStats.duplicatePhones.toLocaleString()} (last row wins)`)
  console.log(`  Traffic channels:    ${bySource.size}`)

  const client = new MongoClient(uri)
  await client.connect()
  const col = client.db(DB).collection(WA_COLLECTION)

  let totalMatched = 0
  let totalModified = 0
  let batches = 0

  const channels = [...bySource.keys()].sort((a, b) => a.localeCompare(b))
  for (const channel of channels) {
    const phones = bySource.get(channel) || []
    console.log(`\n[${channel}] ${phones.length.toLocaleString()} phones`)

    for (let i = 0; i < phones.length; i += PHONE_BATCH) {
      const batch = phones.slice(i, i + PHONE_BATCH)
      const variants = variantsForPhoneBatch(batch)
      if (!variants.length) continue
      batches += 1

      const filter = phoneMatchFilter(variants)

      if (dryRun) {
        const n = await col.countDocuments(filter)
        totalMatched += n
        if (batches % 50 === 0 || i + PHONE_BATCH >= phones.length) {
          process.stdout.write(
            `  batch ${Math.floor(i / PHONE_BATCH) + 1}: ~${n.toLocaleString()} docs (running total ${totalMatched.toLocaleString()})\r`,
          )
        }
        continue
      }

      const res = await col.updateMany(filter, { $set: { source: channel } })
      totalMatched += res.matchedCount
      totalModified += res.modifiedCount
      if (batches % 20 === 0 || i + PHONE_BATCH >= phones.length) {
        console.log(
          `  batch ${Math.floor(i / PHONE_BATCH) + 1}/${Math.ceil(phones.length / PHONE_BATCH)}: matched=${res.matchedCount.toLocaleString()} modified=${res.modifiedCount.toLocaleString()}`,
        )
      }
    }
  }

  const sample = await col
    .find({ source: { $nin: [null, ''] } }, { projection: { phone_number: 1, source: 1, template_name: 1 } })
    .limit(5)
    .toArray()

  console.log('\n--- Summary ---')
  console.log(`  Update batches:      ${batches.toLocaleString()}`)
  console.log(`  Documents matched:   ${totalMatched.toLocaleString()}`)
  if (!dryRun) console.log(`  Documents modified:  ${totalModified.toLocaleString()}`)

  if (sample.length) {
    console.log('\n  Sample docs after backfill:')
    for (const d of sample) {
      console.log(`    ${d.phone_number || '?'} | ${d.source} | ${d.template_name || '(no template)'}`)
    }
  }

  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
