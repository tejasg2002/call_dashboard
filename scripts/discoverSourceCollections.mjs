#!/usr/bin/env node

/**
 * Discovery script: Sample documents from callerDtWebhookLogs, leads, npfLeads, callrecordings
 * to identify exact field names (mobile, source, etc.)
 *
 * Usage: node scripts/discoverSourceCollections.mjs
 */

import 'dotenv/config'
import { MongoClient } from 'mongodb'

const uri = process.env.COMMUNITY_URI
if (!uri) {
  console.error('COMMUNITY_URI not set in .env')
  process.exit(1)
}

const COLLECTIONS = [
  { db: 'itm', col: 'callerDtWebhookLogs' },
  { db: 'callQ', col: 'leads' },
  { db: 'itm', col: 'npfLeads' },
  { db: 'itm', col: 'callrecordings' },
]

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  console.log('Connected to MongoDB\n')

  for (const { db, col } of COLLECTIONS) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`DB: ${db} | Collection: ${col}`)
    console.log('='.repeat(60))

    const collection = client.db(db).collection(col)
    const count = await collection.estimatedDocumentCount()
    console.log(`Estimated doc count: ${count}`)

    const samples = await collection.find({}).limit(3).toArray()
    if (samples.length === 0) {
      console.log('  (empty collection)')
      continue
    }

    for (let i = 0; i < samples.length; i++) {
      console.log(`\n--- Sample ${i + 1} ---`)
      console.log(`Top-level keys: ${Object.keys(samples[i]).join(', ')}`)
      console.log(JSON.stringify(samples[i], null, 2).slice(0, 3000))
    }
  }

  await client.close()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
