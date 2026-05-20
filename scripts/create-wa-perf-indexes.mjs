#!/usr/bin/env node
/**
 * Creates MongoDB indexes required for WA dashboard performance.
 *
 * Indexes created (per collection):
 *   itm.marketingwa                            → { firestore_id: 1 }
 *   ITM_BS.interaktWhatsappWebhookEvents       → { stage:1 }, { type:1 }, { event_timestamp:1 }, { stage:1, event_timestamp:1 }
 *   ITM_IHM.interaktWhatsappWebhookEvents      → same
 *   ITM_IDM.interaktWhatsappWebhookEvents      → same
 *
 * Usage:
 *   node scripts/create-wa-perf-indexes.mjs
 *   node scripts/create-wa-perf-indexes.mjs --waDb ITM_IHM --waCollection interaktWhatsappWebhookEvents
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : []))
    .filter(Boolean),
)

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

async function indexWaCol(db, col, { mbaCallback = false } = {}) {
  const c = client.db(db).collection(col)
  console.log(`\n=== ${db}.${col} ===`)
  await ensureIndex(c, { stage: 1 })
  await ensureIndex(c, { type: 1 })
  await ensureIndex(c, { event_timestamp: 1 })
  await ensureIndex(c, { stage: 1, event_timestamp: 1 })
  await ensureIndex(c, { createdAt: 1 })
  await ensureIndex(c, { createdAt: 1, phone_number: 1 })
  await ensureIndex(c, { template_name: 1 })
  await ensureIndex(c, { phone_number: 1 })
  await ensureIndex(c, { 'data.customer.phone_number': 1 })
  if (mbaCallback) {
    await ensureIndex(c, { source: 1 })
    await ensureIndex(c, { source: 1, phone_number: 1 })
    await ensureIndex(c, { City: 1 })
    await ensureIndex(c, { State: 1 })
    await ensureIndex(c, { city: 1 })
    await ensureIndex(c, { state: 1 })
    await ensureIndex(c, { 'data.message.meta_data.source_data.callback_data': 1 })
    await ensureIndex(c, {
      'data.message.meta_data.source_data.callback_data': 1,
      createdAt: 1,
    })
    await ensureIndex(c, { 'data.customer.phone_number': 1 })
  }
}

async function indexCrmLeads() {
  const c = client.db('itm-crm').collection('leads')
  console.log('\n=== itm-crm.leads (MBA lead filter) ===')
  await ensureIndex(c, { 'source.channel': 1 })
  await ensureIndex(c, { '_source.source': 1 })
  await ensureIndex(c, { 'source.utmSource': 1 })
  await ensureIndex(c, { 'source.channel': 1, 'stage.current': 1 })
}


// 1. itm.marketingwa — firestore_id (used by fetchMarketingwaButtonsByFirestoreId)
const mwaCol = client.db('itm').collection('marketingwa')
console.log('=== itm.marketingwa ===')
await ensureIndex(mwaCol, { firestore_id: 1 })

// 2. If called with explicit --waDb / --waCollection flags, only index that collection
if (args.waDb) {
  await indexWaCol(args.waDb, args.waCollection ?? 'interaktWhatsappWebhookEvents')
} else {
  // Index all known WA event collections
  await indexWaCol('ITM_BS', 'interaktWhatsappWebhookEvents', { mbaCallback: true }) // MBA
  await indexWaCol('ITM_IHM', 'interaktWhatsappWebhookEvents')         // IHM
  await indexWaCol('ITM_IDM', 'interaktWhatsappWebhookEvents')         // IDM
  await indexWaCol('ITM_ISU', 'interaktWhatsappWebhookEventsBBA')      // BBA
  await indexWaCol('ITM_ISU', 'interaktWhatsappWebhookEventsBTech')    // BTECH
  await indexCrmLeads()
}

await client.close()
console.log('\nDone.')
