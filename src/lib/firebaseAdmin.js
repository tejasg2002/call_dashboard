import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function readServiceAccount() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (rawJson) {
    try {
      return JSON.parse(rawJson)
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${error.message}`)
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey }
  }

  return null
}

function getFirebaseAdminApp() {
  const existing = getApps()[0]
  if (existing) return existing

  const serviceAccount = readServiceAccount()
  if (serviceAccount) {
    return initializeApp({ credential: cert(serviceAccount) })
  }

  /**
   * `applicationDefault()` often “works” until the first Firestore call, then throws
   * “Unable to detect a Project Id” on laptops without gcloud/ADC — confusing.
   * Opt in with FIREBASE_ADMIN_USE_ADC=1 (GCP metadata / gcloud auth).
   */
  if (process.env.FIREBASE_ADMIN_USE_ADC !== '1') {
    throw new Error(
      'Firebase Admin is not configured for server routes (e.g. /api/call-dashboard). ' +
        'Add FIREBASE_SERVICE_ACCOUNT_JSON (full service account JSON string) or all of: ' +
        'FIREBASE_ADMIN_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY. ' +
        'NEXT_PUBLIC_FIREBASE_* alone is client-only and does not authenticate the Admin SDK. ' +
        'To try Application Default Credentials instead, set FIREBASE_ADMIN_USE_ADC=1.',
    )
  }

  try {
    return initializeApp({ credential: applicationDefault() })
  } catch (error) {
    throw new Error(
      `Firebase Admin (ADC): ${error.message}. Check gcloud auth or GOOGLE_APPLICATION_CREDENTIALS.`,
    )
  }
}

export function getAdminDb() {
  return getFirestore(getFirebaseAdminApp())
}
