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

// ── Fetch by date range (server-side filtering) ─────────────────────────────
export async function fetchEmailEventsRange(startDate, endDate, onProgress) {
  let allDocs = []
  let page = 0
  let hasMore = true
  let total = 0

  while (hasMore) {
    const url = new URL('/api/email-events', window.location.origin)
    url.searchParams.set('page', page.toString())
    if (startDate) url.searchParams.set('startDate', startDate)
    if (endDate) url.searchParams.set('endDate', endDate)

    const res = await fetch(url.toString())
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

// (Filter-option helpers were only used in the old raw-event UI and are no
// longer needed in the snapshot-based dashboards.)
