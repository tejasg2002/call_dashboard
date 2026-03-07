import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'

// Required for Firestore + Auth (VITE_FIREBASE_DATABASE_URL in .env is for Realtime DB only; this app uses Firestore)
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]
const missing = requiredEnvVars.filter((key) => !import.meta.env[key]?.trim())
if (missing.length > 0) {
  throw new Error(
    `Firebase config incomplete. Missing in .env: ${missing.join(', ')}. Add them and restart the dev server.`
  )
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

/**
 * Fetches all call documents from the 'Call_logs' collection
 * @returns {Promise<Array>} Array of call documents with their IDs
 */
export async function fetchCalls() {
  try {
    const callsCollection = collection(db, 'Call_logs')
    const snapshot = await getDocs(callsCollection)
    
    const calls = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    
    return calls
  } catch (error) {
    const code = error?.code
    const msg = error?.message || ''
    // Log full error so you can see exact reason in browser Console (F12)
    console.error('[Firestore] Error fetching Call_logs:', { code, message: msg, error })
    const e = new Error(
      code === 'permission-denied'
        ? 'Database not accessible: Firestore rules are blocking read. Allow read on Call_logs for signed-in users. See FIRESTORE_RULES.md.'
        : code === 'not-found'
          ? 'Database not accessible: Call_logs collection or Firestore not found. Ensure Firestore is enabled and collection "Call_logs" exists.'
          : code === 'unavailable' || msg.includes('unavailable')
            ? 'Database not accessible: Firestore unavailable (network/service). Check internet and try again.'
            : code === 'failed-precondition' || msg.includes('failed-precondition')
              ? 'Database not accessible: Firestore may be disabled. In Firebase Console → Firestore, enable Firestore for this project.'
              : `Database not accessible: ${msg || 'Unknown error'}`
    )
    e.code = code || 'unknown'
    e.rawMessage = msg
    throw e
  }
}

export { db, auth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
