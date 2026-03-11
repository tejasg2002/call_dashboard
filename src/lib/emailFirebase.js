// ── Field extractors ────────────────────────────────────────────────────────
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

// ── Fetch from Next.js API route (MongoDB) — paginated ─────────────────────
export async function fetchEmailEvents(since, onProgress) {
  if (since) {
    const url = new URL('/api/email-events', window.location.origin)
    url.searchParams.set('since', since)
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    const { docs, total } = await res.json()
    if (onProgress) onProgress({ loaded: docs.length, total: docs.length, done: true })
    return docs
  }

  let allDocs = []
  let page = 0
  let hasMore = true
  let total = 0

  while (hasMore) {
    const url = new URL('/api/email-events', window.location.origin)
    url.searchParams.set('page', page.toString())

    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${res.status}`)
    }

    const data = await res.json()
    allDocs = allDocs.concat(data.docs)
    hasMore = data.hasMore
    total = data.total
    page++

    if (onProgress) onProgress({ loaded: allDocs.length, total, done: !hasMore })
  }

  return allDocs
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
