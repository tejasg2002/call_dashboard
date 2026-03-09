import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'email_webhook'

// ── Field extractors ────────────────────────────────────────────────────────
// Documents may be wrapped under a "document" key (MongoDB change-stream format)
// or stored flat. Be defensive and handle both.
function getInner(raw) { return raw.document || raw }
function getEventType(raw) { return getInner(raw).detail?.eventType || '' }
function getSubject(raw) { return getInner(raw).detail?.mail?.commonHeaders?.subject || '' }
function getRecipient(raw) {
  const m = getInner(raw).detail?.mail || {}
  return (m.destination?.[0] || m.commonHeaders?.to?.[0] || '').toLowerCase()
}
function getTimestamp(raw) {
  const d = getInner(raw)
  return d.time || d.createdAt || raw.timestamp || ''
}

// ── Subscription ────────────────────────────────────────────────────────────
export function subscribeEmailWebhooks(callback) {
  const q = query(collection(db, COLLECTION))
  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      callback(docs, null)
    },
    (err) => {
      console.error('[email_webhook] subscription error:', err)
      callback([], err)
    }
  )
  return () => unsub()
}

// ── In-memory filter ────────────────────────────────────────────────────────
export function applyEmailFilters(docs, filters = {}) {
  let result = docs

  if (filters.subject)
    result = result.filter((d) => getSubject(d) === filters.subject)

  if (filters.eventType)
    result = result.filter((d) => getEventType(d) === filters.eventType)

  if (filters.email?.trim()) {
    const em = filters.email.trim().toLowerCase()
    result = result.filter((d) => getRecipient(d).includes(em))
  }

  if (filters.startDate || filters.endDate) {
    result = result.filter((d) => {
      const ts = getTimestamp(d)
      if (!ts) return true
      const date = new Date(ts)
      if (isNaN(date.getTime())) return true
      if (filters.startDate) {
        const [sy, sm, sd] = filters.startDate.split('-').map(Number)
        if (date < new Date(sy, sm - 1, sd)) return false
      }
      if (filters.endDate) {
        const [ey, em2, ed] = filters.endDate.split('-').map(Number)
        if (date > new Date(ey, em2 - 1, ed, 23, 59, 59, 999)) return false
      }
      return true
    })
  }

  return result
}

// ── Filter option helpers ────────────────────────────────────────────────────
export function getEmailFilterOptions(docs) {
  const subjects = new Set()
  const eventTypes = new Set()
  docs.forEach((d) => {
    const s = getSubject(d); if (s) subjects.add(s)
    const e = getEventType(d); if (e) eventTypes.add(e)
  })
  return {
    subjects:   [...subjects].sort(),
    eventTypes: [...eventTypes].sort(),
  }
}
