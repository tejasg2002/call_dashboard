import { collection, onSnapshot, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'whatsapp_webhooks'

/**
 * Subscribe to ALL whatsapp_webhooks docs in real-time.
 * All filtering (template, event type, date, phone) is done in-memory in the dashboard
 * so that filter dropdowns always show the full option list regardless of active filters.
 * @returns {() => void} Unsubscribe function
 */
export function subscribeWhatsAppWebhooks(callback) {
  const q = query(collection(db, COLLECTION))
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      callback(docs, null)
    },
    (err) => {
      console.error('[whatsapp_webhooks] subscription error:', err)
      callback([], err)
    }
  )
  return () => unsub()
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
      if (filters.startDate && date < new Date(filters.startDate)) return false
      if (filters.endDate) {
        const end = new Date(filters.endDate)
        end.setHours(23, 59, 59, 999)
        if (date > end) return false
      }
      return true
    })
  }
  return result
}

/**
 * Look up a lead in crmSnapshot by mobile number.
 * Returns { lead_id, ...otherFields } or null if not found.
 */
export async function fetchLeadByMobile(mobileNumber) {
  if (!mobileNumber || mobileNumber === '—') return null
  const mobile = String(mobileNumber).trim()
  try {
    const q = query(
      collection(db, 'crmSnapshot'),
      where('mobile', '==', mobile),
      limit(1)
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    const data = snap.docs[0].data()
    return { docId: snap.docs[0].id, ...data }
  } catch (err) {
    console.error('[crmSnapshot] lookup error:', err)
    return null
  }
}

export { db }
