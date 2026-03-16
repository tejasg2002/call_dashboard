import 'dotenv/config'
import { MongoClient } from 'mongodb'

// This script mirrors the new "Form submitted" logic based on npfMbaApplications.
// It:
// 1) Reads all unique clicked WhatsApp phones from marketingwa
// 2) Looks for matching applications in npfMbaApplications where
//    personal_details.mobile_number matches AND application_detail.application_no != ''
// 3) Prints the count and a small sample so you can verify data exists.

const mongoUri = process.env.COMMUNITY_URI
if (!mongoUri) {
  console.error('COMMUNITY_URI is not set in .env')
  process.exit(1)
}

const client = new MongoClient(mongoUri, {})

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

async function main() {
  await client.connect()
  const db = client.db('itm')

  console.log('1) Fetching unique clicked phones from marketingwa...')
  const marketingCol = db.collection('marketingwa')

  const clickedCursor = marketingCol.aggregate([
    { $match: { event_type: { $regex: 'clicked', $options: 'i' } } },
    {
      $group: {
        _id: '$phone_number',
      },
    },
  ])

  const rawPhones = []
  for await (const doc of clickedCursor) {
    if (doc._id) rawPhones.push(String(doc._id))
  }

  const mobiles = [...new Set(rawPhones.map(normaliseMobile).filter(Boolean))]
  console.log(`   Raw clicked phones : ${rawPhones.length}`)
  console.log(`   Normalised mobiles : ${mobiles.length}`)

  console.log('2) Checking npfMbaApplications for submitted applications...')
  const appsCol = db.collection('npfMbaApplications')

  const cursor = appsCol.aggregate([
    {
      $match: {
        'personal_details.mobile_number': { $in: mobiles },
        'application_detail.application_no': { $ne: '' },
      },
    },
    {
      $group: {
        _id: '$personal_details.mobile_number',
        lead_id: { $first: '$other_info.lead_id' },
        application_no: { $first: '$application_detail.application_no' },
        payment_date: { $first: '$application_detail.payment_date' },
        createdAt: { $first: '$createdAt' },
      },
    },
  ])

  const matches = []
  for await (const doc of cursor) {
    matches.push(doc)
  }

  console.log('\n=== WA → npfMbaApplications Form Submitted Debug ===')
  console.log('Clicked mobiles (normalised):', mobiles.length)
  console.log('Mobiles with submitted application:', matches.length)

  if (matches.length) {
    console.log('\nSample matches (up to 10):')
    matches.slice(0, 10).forEach((m, idx) => {
      console.log(`${idx + 1}. mobile=${m._id}, lead_id=${m.lead_id || '-'}, application_no=${m.application_no || '-'}, payment_date=${m.payment_date || '-'}`)
    })
  } else {
    console.log('\nNo matching applications found for clicked mobiles.')
  }

  await client.close()
}

main().catch((err) => {
  console.error('debug-wa-form-submitted-npf-apps failed:', err)
  process.exit(1)
})

