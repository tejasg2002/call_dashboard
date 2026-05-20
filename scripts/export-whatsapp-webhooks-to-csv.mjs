import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env from the app root (.env sits next to package.json)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const COLLECTION = 'whatsapp_webhooks'

function createFirebaseApp() {
  const {
    NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID,
  } = process.env

  if (!NEXT_PUBLIC_FIREBASE_API_KEY || !NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error('Firebase client env vars are missing in .env')
  }

  const firebaseConfig = {
    apiKey: NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: NEXT_PUBLIC_FIREBASE_APP_ID,
  }

  return initializeApp(firebaseConfig)
}

async function initFirestoreWithClientSdk() {
  const app = createFirebaseApp()
  const auth = getAuth(app)

  const email = process.env.FIREBASE_EXPORT_EMAIL
  const password = process.env.FIREBASE_EXPORT_PASSWORD

  if (!email || !password) {
    throw new Error(
      'Set FIREBASE_EXPORT_EMAIL and FIREBASE_EXPORT_PASSWORD in .env for a user that has read access to whatsapp_webhooks.'
    )
  }

  console.log(`Signing in as ${email}...`)
  await signInWithEmailAndPassword(auth, email, password)
  console.log('Signed in successfully.')

  return getFirestore(app)
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return ''

  let v = value
  if (v instanceof Date) v = v.toISOString()
  else if (typeof v === 'object') v = JSON.stringify(v)
  else v = String(v)

  if (/["\n,]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

async function exportWhatsappWebhooks() {
  const db = await initFirestoreWithClientSdk()
  console.log(`Connected to Firestore (client SDK). Exporting collection "${COLLECTION}"...`)

  const snapshot = await getDocs(collection(db, COLLECTION))
  if (snapshot.empty) {
    console.log('No documents found. Nothing to export.')
    return
  }

  const docs = snapshot.docs.map((doc) => {
    const data = doc.data()

    // Convert Firestore Timestamps to ISO strings for CSV
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && typeof v.toDate === 'function') {
        data[k] = v.toDate().toISOString()
      }
    }

    return { id: doc.id, ...data }
  })

  const allKeys = new Set()
  for (const doc of docs) {
    Object.keys(doc).forEach((k) => allKeys.add(k))
  }

  // Stable header order: id first, then alphabetically
  const headers = ['id', ...[...allKeys].filter((k) => k !== 'id').sort()]

  const lines = []
  lines.push(headers.join(','))

  for (const doc of docs) {
    const row = headers.map((key) => escapeCsvValue(doc[key]))
    lines.push(row.join(','))
  }

  const outPath = path.resolve(__dirname, '../whatsapp_webhooks.csv')
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')

  console.log(`Exported ${docs.length} documents from "${COLLECTION}" to:\n${outPath}`)
  console.log('\nNext step: import this CSV into MongoDB using mongoimport or your preferred tool.')
}

exportWhatsappWebhooks().catch((err) => {
  console.error('Error exporting whatsapp_webhooks:', err)
  process.exitCode = 1
})

