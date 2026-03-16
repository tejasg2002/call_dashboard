import 'dotenv/config'
import { MongoClient } from 'mongodb'
import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore'

// ---- Mongo (marketingwa + npfPayments) --------------------------------------

const mongoUri = process.env.COMMUNITY_URI
if (!mongoUri) {
  console.error('COMMUNITY_URI is not set in .env')
  process.exit(1)
}

const mongoClient = new MongoClient(mongoUri, {})

// ---- Firebase (callerDetails) ----------------------------------------------

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

if (!firebaseConfig.projectId) {
  console.error('Missing Firebase env vars. Please check NEXT_PUBLIC_FIREBASE_* in .env.')
  process.exit(1)
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

function normaliseMobile(raw) {
  let n = String(raw || '').trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

async function fetchLeadIdFromCallerDetails(mobile) {
  const m = normaliseMobile(mobile)
  if (!m) return null

  const q = query(
    collection(db, 'callerDetails'),
    where('mobile', '==', m),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const data = snap.docs[0].data()
  return data.lead_id || null
}

async function main() {
  await mongoClient.connect()
  const mdb = mongoClient.db('itm')

  console.log('1) Fetching clicked WhatsApp users from marketingwa...')
  const marketingCol = mdb.collection('marketingwa')

  // All clicked events (same as { event_type: /clicked/i })
  const clickedCursor = marketingCol.aggregate([
    { $match: { event_type: { $regex: 'clicked', $options: 'i' } } },
    {
      $group: {
        _id: '$phone_number',
        any: { $first: '$$ROOT' },
      },
    },
  ])

  const uniquePhones = []
  for await (const doc of clickedCursor) {
    if (doc._id) uniquePhones.push(String(doc._id))
  }

  console.log(`   Unique clicked phones: ${uniquePhones.length}`)

  console.log('2) Resolving lead_id from Firebase callerDetails...')
  const phoneToLeadId = new Map()

  let resolved = 0
  for (const phone of uniquePhones) {
    const leadId = await fetchLeadIdFromCallerDetails(phone)
    if (leadId) phoneToLeadId.set(phone, leadId)
    resolved++
    if (resolved % 50 === 0) {
      console.log(`   Resolved ${resolved}/${uniquePhones.length} phones...`)
    }
  }

  const allLeadIds = [...new Set(phoneToLeadId.values())]
  console.log(`   Phones with lead_id: ${phoneToLeadId.size}`)
  console.log(`   Unique lead_ids: ${allLeadIds.length}`)

  console.log('3) Checking payments in npfPayments (paymentStatus: "complete")...')
  const payCol = mdb.collection('npfPayments')
  const completedLeadIds = new Set()

  const BATCH = 200
  for (let i = 0; i < allLeadIds.length; i += BATCH) {
    const chunk = allLeadIds.slice(i, i + BATCH)
    const docs = await payCol.find({
      paymentStatus: { $regex: '^complete$', $options: 'i' },
      lead_id: { $in: chunk },
    }).project({ lead_id: 1, paymentStatus: 1, createdAt: 1 }).toArray()

    docs.forEach((d) => {
      if (d.lead_id) completedLeadIds.add(d.lead_id)
    })
    console.log(`   Checked payments for leads ${i + 1}-${Math.min(i + BATCH, allLeadIds.length)} (matched ${completedLeadIds.size} so far)`)
  }

  console.log('\n=== WhatsApp → Form Submitted Debug Summary ===')
  console.log('Total unique clicked phones      :', uniquePhones.length)
  console.log('Phones with callerDetails lead_id:', phoneToLeadId.size)
  console.log('Unique lead_ids                  :', allLeadIds.length)
  console.log('Lead_ids with completed payment  :', completedLeadIds.size)

  if (completedLeadIds.size > 0) {
    console.log('\nSample completed lead_ids:')
    console.log([...completedLeadIds].slice(0, 10))
  }

  await mongoClient.close()
}

main().catch((err) => {
  console.error('debug-wa-form-submitted failed:', err)
  process.exit(1)
})

