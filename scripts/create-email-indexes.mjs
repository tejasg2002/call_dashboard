import { MongoClient } from 'mongodb'
import 'dotenv/config'

const uri = process.env.COMMUNITY_URI
if (!uri) { console.error('COMMUNITY_URI not set'); process.exit(1) }

const client = new MongoClient(uri)

async function run() {
  await client.connect()
  const col = client.db('itm').collection('aws_ses_webhook_ibs')

  console.log('Creating indexes on aws_ses_webhook_ibs...')

  await col.createIndex({ time: -1 }, { name: 'time_desc' })
  await col.createIndex(
    { 'detail.eventType': 1, time: -1 },
    { name: 'eventType_time' },
  )
  await col.createIndex(
    { 'detail.mail.commonHeaders.subject': 1, time: -1 },
    { name: 'subject_time' },
  )

  console.log('Done. Indexes:')
  const indexes = await col.indexes()
  indexes.forEach((idx) => console.log(` - ${idx.name}: ${JSON.stringify(idx.key)}`))

  await client.close()
}

run().catch((err) => { console.error(err); process.exit(1) })
