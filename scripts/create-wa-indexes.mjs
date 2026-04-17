/**
 * Create MongoDB indexes on WhatsApp marketing collections for fast aggregation.
 * Run once: node scripts/create-wa-indexes.mjs
 *
 * - itm.marketingwa (MBA workspace)
 * - analytics.IHMmarketingwa (IHM workspace)
 * - analytics.IDMmarketingwa (IDM workspace)
 * - analytics.BBAmarketingwa (BBA workspace)
 * - analytics.BTECHmarketingwa (BTECH workspace)
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.COMMUNITY_URI

const TARGETS = [
  { db: 'itm', collection: 'marketingwa' },
  { db: 'analytics', collection: 'IHMmarketingwa' },
  { db: 'analytics', collection: 'IDMmarketingwa' },
  { db: 'analytics', collection: 'BBAmarketingwa' },
  { db: 'analytics', collection: 'BTECHmarketingwa' },
]

const INDEXES = [
  { key: { stage: 1, template_name: 1, source: 1 }, name: 'idx_stage_tpl_src' },
  { key: { stage: 1, button_text: 1, source: 1 }, name: 'idx_stage_btn_src' },
  { key: { stage: 1, phone_number: 1 }, name: 'idx_stage_phone' },
  { key: { stage: 1, event_timestamp: -1 }, name: 'idx_stage_ts' },
  { key: { template_name: 1, stage: 1 }, name: 'idx_tpl_stage' },
]

async function main() {
  const client = new MongoClient(MONGO_URI)
  await client.connect()

  for (const { db: dbName, collection: colName } of TARGETS) {
    const db = client.db(dbName)
    const col = db.collection(colName)

    console.log(`\nCreating indexes on ${dbName}.${colName}...`)

    for (const idx of INDEXES) {
      try {
        await col.createIndex(idx.key, { name: idx.name })
        console.log(`  Created: ${idx.name}`)
      } catch (err) {
        if (err.code === 85 || err.code === 86) {
          console.log(`  Skipped (already exists): ${idx.name}`)
        } else {
          console.error(`  Error for ${idx.name}:`, err.message)
        }
      }
    }

    const indexes = await col.indexes()
    console.log('Current indexes:')
    indexes.forEach((idx) => console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`))
  }

  await client.close()
}

main().catch((err) => { console.error(err); process.exit(1) })
