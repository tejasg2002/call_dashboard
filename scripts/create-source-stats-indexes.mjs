/**
 * Create MongoDB indexes for Source Stats dashboard performance.
 * Run once: node scripts/create-source-stats-indexes.mjs
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.COMMUNITY_URI

const COLLECTIONS = [
  {
    db: 'analytics',
    collection: 'smartping_database',
    indexes: [
      { key: { call_start_time: 1 }, name: 'idx_call_start_time' },
      { key: { call_start_time: 1, agent_name: 1 }, name: 'idx_call_start_agent' },
      { key: { call_start_time: 1, customer_number: 1 }, name: 'idx_call_start_customer' },
    ],
  },
  {
    db: 'itm',
    collection: 'callrecordings',
    indexes: [
      { key: { createdAt: 1 }, name: 'idx_createdAt' },
    ],
  },
  {
    db: 'itm',
    collection: 'crmSnapshotMarch23',
    indexes: [
      { key: { mobile: 1 }, name: 'idx_mobile' },
    ],
  },
]

async function main() {
  const client = new MongoClient(MONGO_URI)
  await client.connect()

  for (const { db, collection, indexes } of COLLECTIONS) {
    const col = client.db(db).collection(collection)
    console.log(`\nCreating indexes on ${db}.${collection}...`)

    for (const idx of indexes) {
      try {
        await col.createIndex(idx.key, { name: idx.name, background: true })
        console.log(`  Created: ${idx.name}`)
      } catch (err) {
        if (err.code === 85 || err.code === 86) {
          console.log(`  Skipped (already exists): ${idx.name}`)
        } else {
          console.error(`  Error for ${idx.name}:`, err.message)
        }
      }
    }

    const existing = await col.indexes()
    console.log(`  Current indexes:`)
    existing.forEach((idx) => console.log(`    ${idx.name}: ${JSON.stringify(idx.key)}`))
  }

  await client.close()
}

main().catch((err) => { console.error(err); process.exit(1) })
