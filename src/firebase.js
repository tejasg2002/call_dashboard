import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firestore & Auth
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
    console.error('Error fetching calls:', error)
    throw error
  }
}

/**
 * Converts a Firestore Timestamp or other value to a JavaScript Date.
 * @param {*} value - created_at, updated_at, or similar
 * @returns {Date|null}
 */
function toDate(value) {
  if (value == null) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  return null
}

/**
 * Returns true if the given date falls within today (local timezone, start to end of day).
 * @param {Date} date
 * @returns {boolean}
 */
function isToday(date) {
  if (!date || Number.isNaN(date.getTime())) return false
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return date >= startOfToday && date <= endOfToday
}

/**
 * Fetches all Hot and Warm leads from 'hot_warm_lead' collection.
 * Uses two separate queries (Hot, Warm) to avoid Firestore 'in' index issues.
 * @returns {Promise<Array>} Array of lead documents (tag Hot or Warm)
 */
export async function fetchHotWarmLeads() {
  const hotWarmRef = collection(db, 'hot_warm_lead')
  const toLead = (doc) => ({ id: doc.id, lead_id: doc.id, ...doc.data() })

  const [hotSnap, warmSnap] = await Promise.all([
    getDocs(query(hotWarmRef, where('tag', '==', 'Hot'))),
    getDocs(query(hotWarmRef, where('tag', '==', 'Warm'))),
  ])

  const hotLeads = hotSnap.docs.map(toLead)
  const warmLeads = warmSnap.docs.map(toLead)
  return [...hotLeads, ...warmLeads]
}

/** For backward compatibility: fetches Hot leads with created_at/updated_at today */
export async function fetchHotLeadsToday() {
  const leads = await fetchHotWarmLeads()
  return leads.filter((lead) => {
    const created = toDate(lead.created_at)
    const updated = toDate(lead.updated_at)
    return (lead.tag === 'Hot' || lead.tag === 'Warm') && (isToday(created) || isToday(updated))
  })
}

export { db, auth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
