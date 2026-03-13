import { collection, query, where, getDocs, limit, startAfter, getCountFromServer } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'whatsapp_webhooks'
const WA_PAGE_SIZE = 5_000

/**
 * Fetch only docs created after `timestamp` (ISO string or Firestore timestamp).
 * Used by the Refresh flow to get incremental data.
 */
export async function fetchWhatsAppSince(timestamp) {
  const col = collection(db, COLLECTION)
  const q = query(col, where('event_timestamp', '>', timestamp))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Fetch all docs for a specific template name (for on-demand stageUsers).
 */
export async function fetchTemplateUsers(templateName) {
  const col = collection(db, COLLECTION)
  const q = query(col, where('template_name', '==', templateName))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Fetch ALL whatsapp_webhooks in batches using cursor-based pagination.
 * Calls onProgress after each batch so the UI can show a progress bar.
 */
export async function fetchWhatsAppBatched(onProgress) {
  const col = collection(db, COLLECTION)

  let total = 0
  try {
    const countSnap = await getCountFromServer(query(col))
    total = countSnap.data().count
  } catch (e) {
    console.warn('[WA] getCountFromServer failed:', e)
  }

  let allDocs = []
  let lastSnap = null
  let hasMore = true

  while (hasMore) {
    const q = lastSnap
      ? query(col, startAfter(lastSnap), limit(WA_PAGE_SIZE))
      : query(col, limit(WA_PAGE_SIZE))

    const snapshot = await getDocs(q)
    const batch = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    allDocs = allDocs.concat(batch)

    hasMore = snapshot.docs.length === WA_PAGE_SIZE
    if (hasMore) lastSnap = snapshot.docs[snapshot.docs.length - 1]

    if (onProgress) onProgress({ loaded: allDocs.length, total, done: !hasMore })
  }

  return allDocs
}

/**
 * Apply active filters to raw docs in-memory.
 */
export function applyFilters(docs, filters = {}) {
  let result = docs
  if (filters.templateName) result = result.filter((d) => d.template_name === filters.templateName)
  if (filters.eventType) result = result.filter((d) => d.event_type === filters.eventType)
  if (filters.phoneNumber?.trim()) result = result.filter((d) => (d.phone_number || '').trim() === filters.phoneNumber.trim())
  if (filters.startDate || filters.endDate) {
    result = result.filter((d) => {
      const ts = d.event_timestamp || d.timestamp || ''
      if (!ts) return true
      const date = new Date(ts)
      if (isNaN(date.getTime())) return true
      if (filters.startDate) {
        const [sy, sm, sd] = filters.startDate.split('-').map(Number)
        const start = new Date(sy, sm - 1, sd)
        if (date < start) return false
      }
      if (filters.endDate) {
        const [ey, em, ed] = filters.endDate.split('-').map(Number)
        const end = new Date(ey, em - 1, ed, 23, 59, 59, 999)
        if (date > end) return false
      }
      return true
    })
  }
  return result
}

// In-memory cache: normalised mobile → lead data (or null if not found)
const _leadCache = new Map()

/**
 * Normalise a WhatsApp phone number to a bare 10-digit Indian mobile.
 * Handles: +919876543210  →  9876543210
 *          919876543210   →  9876543210
 *          9876543210     →  9876543210  (already 10-digit)
 */
function normaliseMobile(raw) {
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  // strip 91 country code only if it leaves exactly 10 digits
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

/**
 * Look up a lead by mobile number.
 * 1. First checks the local Firestore crmSnapshot collection.
 * 2. If not found there, falls back to the ITM Lead API.
 * Returns { lead_id, name, mobile, ... } or null if not found anywhere.
 */
export async function fetchLeadByMobile(mobileNumber) {
  if (!mobileNumber || mobileNumber === '—') return null
  const mobile = normaliseMobile(mobileNumber)
  if (!mobile) return null

  // Return cached result immediately (including cached nulls)
  if (_leadCache.has(mobile)) return _leadCache.get(mobile)

  // --- Step 1: check Firestore crmSnapshot ---
  try {
    const q = query(
      collection(db, 'crmSnapshot'),
      where('mobile', '==', mobile),
      limit(1)
    )
    const snap = await getDocs(q)
    if (!snap.empty) {
      const lead = { docId: snap.docs[0].id, ...snap.docs[0].data() }
      _leadCache.set(mobile, lead)
      return lead
    }
  } catch (err) {
    console.error('[crmSnapshot] lookup error:', err)
  }

  // --- Step 2: fall back to ITM Lead API (with retry on 429) ---
  const apiKey = process.env.NEXT_PUBLIC_ITM_API_KEY
  if (!apiKey) {
    console.warn('[ITM API] API key not set in .env')
    _leadCache.set(mobile, null)
    return null
  }

  const MAX_RETRIES = 3
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://api.itm.edu/v1/npf/lead/mobile/mba?mobile=${encodeURIComponent(mobile)}`,
        { method: 'GET', headers: { 'x-api-key': apiKey } }
      )
      if (res.status === 429) {
        const wait = Math.min(1000 * Math.pow(2, attempt), 8000)
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      if (!res.ok) {
        _leadCache.set(mobile, null)
        return null
      }
      const json = await res.json()
      const lead = json?.results?.data?.[0] ?? null
      _leadCache.set(mobile, lead)
      return lead
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error('[ITM API] fetch error after retries:', err)
        _leadCache.set(mobile, null)
        return null
      }
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
  _leadCache.set(mobile, null)
  return null
}

// In-memory cache: normalised email → lead data (or null)
const _leadEmailCache = new Map()

/**
 * Look up a lead by email address.
 * Checks Firestore crmSnapshot first; no external API fallback for email yet.
 */
export async function fetchLeadByEmail(emailAddress) {
  if (!emailAddress || emailAddress.includes('*')) return null
  const email = emailAddress.trim().toLowerCase()
  if (!email) return null

  if (_leadEmailCache.has(email)) return _leadEmailCache.get(email)

  try {
    const q = query(
      collection(db, 'crmSnapshot'),
      where('email', '==', email),
      limit(1)
    )
    const snap = await getDocs(q)
    if (!snap.empty) {
      const lead = { docId: snap.docs[0].id, ...snap.docs[0].data() }
      _leadEmailCache.set(email, lead)
      return lead
    }
  } catch (err) {
    console.error('[crmSnapshot email] lookup error:', err)
  }

  _leadEmailCache.set(email, null)
  return null
}

export { db }
