import 'dotenv/config'
import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore'

// Initialise Firebase using the same env vars as the app
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

if (!firebaseConfig.projectId) {
  console.error('Missing Firebase env vars. Please check your .env.')
  process.exit(1)
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function main() {
  console.log('Checking callerDetails where lead_stage == "form submitted"...')

  const q = query(
    collection(db, 'callerDetails'),
    where('lead_stage', '==', 'form submitted'),
    limit(50),
  )

  const snap = await getDocs(q)

  console.log(`Total matching docs (first page): ${snap.size}`)
  if (snap.empty) {
    console.log('No callerDetails with lead_stage == "form submitted" found.')
  } else {
    console.log('Sample docs:')
    snap.docs.forEach((doc) => {
      const data = doc.data()
      console.log({
        id: doc.id,
        mobile: data.mobile,
        lead_stage: data.lead_stage,
      })
    })
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('Debug script failed:', err)
  process.exit(1)
})

