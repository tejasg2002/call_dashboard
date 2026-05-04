#!/usr/bin/env node
/**
 * Creates MongoDB indexes required for WA dashboard performance.
 *
 * Indexes created:
 *   itm.marketingwa           → { firestore_id: 1 }
 *   <waDb>.<waCollection>     → { stage: 1 }
 *   <waDb>.<waCollection>     → { type: 1 }                  // native Interakt docs that lack `stage`
 *   <waDb>.<waCollection>     → { event_timestamp: 1 }
 *   <waDb>.<waCollection>     → { stage: 1, event_timestamp: 1 }
 *
 * Usage:
 *   node scripts/create-wa-perf-indexes.mjs
 *   node scripts/create-wa-perf-indexes.mjs --waDb ITM_BS --waCollection interaktWhatsappWebhookEvents
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : []))
    .filter(Boolean),
)

const WA_DB = args.waDb ?? process.env.WA_DB ?? 'ITM_BS'
const WA_COL = args.waCollection ?? process.env.WA_COLLECTION ?? 'interaktWhatsappWebhookEvents'

const uri = process.env.COMMUNITY_URI
if (!uri) { console.error('COMMUNITY_URI missing in .env'); process.exit(1) }

const client = new MongoClient(uri)
await client.connect()
console.log('Connected.\n')

async function ensureIndex(col, spec, options = {}) {
  const name = Object.entries(spec).map(([k, v]) => `${k}_${v}`).join('_')
  try {
    const result = await col.createIndex(spec, { background: true, ...options })
    console.log(`  ✓ ${col.collectionName}.${name} → ${result}`)
  } catch (err) {
    console.error(`  ✗ ${col.collectionName}.${name} → ${err.message}`)
  }
}

// 1. itm.marketingwa — firestore_id (used by fetchMarketingwaButtonsByFirestoreId)
const mwaCol = client.db('itm').collection('marketingwa')
console.log('=== itm.marketingwa ===')
await ensureIndex(mwaCol, { firestore_id: 1 })

// 2. WA events collection
const waCol = client.db(WA_DB).collection(WA_COL)
console.log(`\n=== ${WA_DB}.${WA_COL} ===`)
await ensureIndex(waCol, { stage: 1 })
await ensureIndex(waCol, { type: 1 })
await ensureIndex(waCol, { event_timestamp: 1 })
await ensureIndex(waCol, { stage: 1, event_timestamp: 1 })

await client.close()
console.log('\nDone.')
