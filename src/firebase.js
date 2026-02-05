import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
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

export { db, auth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
