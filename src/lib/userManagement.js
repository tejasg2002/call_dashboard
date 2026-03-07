import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

function getSecondaryApp() {
  const existing = getApps().find((a) => a.name === 'secondary')
  if (existing) return existing
  return initializeApp(firebaseConfig, 'secondary')
}

const APP_USERS_COLLECTION = 'app_users'

/**
 * Default permissions for new users.
 */
export const DEFAULT_PERMISSIONS = {
  canViewCallReview:   false,
  canViewWhatsApp:     true,
  dataMasked:          true,
}

/**
 * Create a new app user via secondary auth instance.
 * Stores metadata + permissions in Firestore app_users collection.
 */
export async function createAppUser({ email, password, displayName, role = 'viewer', ...permissions }, adminDb) {
  const secondaryApp = getSecondaryApp()
  const secondaryAuth = getAuth(secondaryApp)

  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
  const uid = cred.user.uid

  await signOut(secondaryAuth)

  await setDoc(doc(adminDb, APP_USERS_COLLECTION, uid), {
    uid,
    email,
    displayName: displayName || '',
    role,
    canViewCallReview: permissions.canViewCallReview ?? DEFAULT_PERMISSIONS.canViewCallReview,
    canViewWhatsApp:   permissions.canViewWhatsApp   ?? DEFAULT_PERMISSIONS.canViewWhatsApp,
    dataMasked:        permissions.dataMasked        ?? DEFAULT_PERMISSIONS.dataMasked,
    createdAt: serverTimestamp(),
  })

  return uid
}

/**
 * Fetch a single user's permissions by their Firebase UID.
 * Returns null if the user has no record (e.g. admin).
 */
export async function fetchUserPermissions(db, uid) {
  try {
    const snap = await getDoc(doc(db, APP_USERS_COLLECTION, uid))
    if (!snap.exists()) return null
    return snap.data()
  } catch (err) {
    console.error('[userManagement] fetchUserPermissions error:', err)
    return null
  }
}

/**
 * Update specific permission fields for a user.
 */
export async function updateUserPermissions(db, uid, updates) {
  await updateDoc(doc(db, APP_USERS_COLLECTION, uid), updates)
}

/**
 * List all app users from Firestore app_users collection.
 */
export async function listAppUsers(db) {
  const q = query(collection(db, APP_USERS_COLLECTION), orderBy('createdAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Remove user record from Firestore.
 */
export async function removeAppUser(db, uid) {
  await deleteDoc(doc(db, APP_USERS_COLLECTION, uid))
}

/**
 * Send a password reset email to a user's email address.
 */
export async function sendResetEmail(primaryAuth, email) {
  await sendPasswordResetEmail(primaryAuth, email)
}

/**
 * Mask a phone number: show only last 3 digits.
 * e.g. 9187654321 → *******321
 */
export function maskPhone(phone) {
  if (!phone || phone === '—') return phone
  const s = String(phone)
  if (s.length <= 3) return s
  return '*'.repeat(s.length - 3) + s.slice(-3)
}

/**
 * Mask an email: show first char + *** + @domain.
 * e.g. john@example.com → j***@example.com
 */
export function maskEmail(email) {
  if (!email || !email.includes('@')) return email
  const [local, domain] = email.split('@')
  return (local[0] || '') + '***@' + domain
}
