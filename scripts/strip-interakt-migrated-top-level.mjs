#!/usr/bin/env node
/**
 * Force every document with a `data` object into the native Interakt webhook envelope:
 *   top-level: createdAt, version, timestamp, type, data  (+ Mongo _id)
 *
 * Any other top-level field (migration flat fields, template_preview, migrated_at,
 * stray keys, __v, etc.) is $unset. The `data` subtree is not modified.
 *
 * Usage:
 *   node scripts/strip-interakt-migrated-top-level.mjs
 *   node scripts/strip-interakt-migrated-top-level.mjs --write
 *   node scripts/strip-interakt-migrated-top-level.mjs --write --limit 500
 *   node scripts/strip-interakt-migrated-top-level.mjs --uri "$COMMUNITY_URI" --db ITM_BS
 *
 * Default is dry-run. Pass --write to apply.
 * After a full run, refresh or delete MBA cache: itm.wa_dashboard_cache _id wa_latest_mba
 */

import 'dotenv/config'
import { MongoClient } from 'mongodb'

const DEFAULT_DB = 'ITM_BS'
const DEFAULT_COLLECTION = 'interaktWhatsappWebhookEvents'
const BATCH = 500

/** Exact Interakt-style root keys to keep (Mongo always keeps _id). */
const ALLOWED_ROOT = new Set(['_id', 'createdAt', 'version', 'timestamp', 'type', 'data'])

function parseArgs(argv) {
  const out = {
    uri: process.env.COMMUNITY_URI,
    db: DEFAULT_DB,
    collection: DEFAULT_COLLECTION,
    write: false,
    limit: null,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--write') out.write = true
    else if (a === '--dry-run') out.write = false
    else if (a === '--uri' && argv[i + 1]) out.uri = argv[++i]
    else if (a === '--db' && argv[i + 1]) out.db = argv[++i]
    else if (a === '--collection' && argv[i + 1]) out.collection = argv[++i]
    else if (a === '--limit' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10)
      out.limit = Number.isNaN(n) ? null : n
    }
  }
  return out
}

function buildUnsetForDoc(docWithoutDataBlob) {
  const unset = {}
  for (const k of Object.keys(docWithoutDataBlob)) {
    if (!ALLOWED_ROOT.has(k)) unset[k] = ''
  }
  return unset
}

/** Rows we can normalize to the lean envelope (must retain `data` in DB). */
function matchFilter() {
  return { data: { $exists: true, $type: 'object' } }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.uri) {
    console.error('COMMUNITY_URI missing (or pass --uri)')
    process.exit(1)
  }

  const client = new MongoClient(args.uri)
  await client.connect()
  const col = client.db(args.db).collection(args.collection)
  const filter = matchFilter()

  const withData = await col.countDocuments(filter)
  const noData = await col.countDocuments({ $nor: [filter] })

  console.log(`Target: ${args.db}.${args.collection}`)
  console.log(`Documents with root "data" (object): ${withData.toLocaleString()}`)
  if (noData) {
    console.log(`Skipped (no object "data" at root): ${noData.toLocaleString()}`)
  }

  if (!args.write) {
    const cursor = col.find(filter, { projection: { data: 0 } }).batchSize(BATCH)
    let needStrip = 0
    let scanned = 0
    const sampleStrips = []

    for await (const partial of cursor) {
      const unset = buildUnsetForDoc(partial)
      if (Object.keys(unset).length > 0) {
        needStrip++
        if (sampleStrips.length < 3) {
          sampleStrips.push({ _id: String(partial._id), unsetKeys: Object.keys(unset) })
        }
      }
      scanned++
      if (args.limit != null && scanned >= args.limit) break
    }

    console.log(`Scanned: ${scanned.toLocaleString()}`)
    console.log(`Documents with extra top-level keys to remove: ${needStrip.toLocaleString()}`)
    if (sampleStrips.length) {
      console.log('Examples (keys that would be $unset):')
      for (const s of sampleStrips) console.log(`  ${s._id}: ${s.unsetKeys.join(', ')}`)
    }
    console.log('\nDry-run only. Re-run with --write to normalize documents.')
    await client.close()
    return
  }

  let modified = 0
  let scanned = 0
  const writeCursor = col.find(filter, { projection: { data: 0 } }).batchSize(BATCH)
  let bulk = []

  for await (const partial of writeCursor) {
    if (args.limit != null && scanned >= args.limit) break
    scanned++
    const unset = buildUnsetForDoc(partial)
    if (Object.keys(unset).length === 0) continue
    bulk.push({
      updateOne: {
        filter: { _id: partial._id },
        update: { $unset: unset },
      },
    })
    if (bulk.length >= BATCH) {
      const res = await col.bulkWrite(bulk, { ordered: false })
      modified += res.modifiedCount
      bulk = []
      process.stdout.write(`\rModified: ${modified.toLocaleString()} | scanned: ${scanned.toLocaleString()}`)
    }
  }
  if (bulk.length) {
    const res = await col.bulkWrite(bulk, { ordered: false })
    modified += res.modifiedCount
  }
  console.log(`\nDone. Modified: ${modified.toLocaleString()} (scanned ${scanned.toLocaleString()})`)
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
