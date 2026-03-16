/**
 * Email analytics data fetching via the /api/email-events MongoDB API route.
 */

const PAGE_SIZE = 50_000

/**
 * Fetch ALL email events (or events since a timestamp) from MongoDB.
 * @param {string|null} since - ISO timestamp for incremental fetch, or null for full fetch
 * @param {function|null} onProgress - progress callback { loaded, total, done }
 */
export async function fetchEmailEvents(since, onProgress) {
  let allDocs = []
  let page = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (since) params.set('since', since)

    const res = await fetch(`/api/email-events?${params.toString()}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)

    allDocs = allDocs.concat(data.docs)
    total = data.total
    hasMore = data.hasMore
    page++

    if (onProgress) onProgress({ loaded: allDocs.length, total, done: !hasMore })
  }

  return allDocs
}

/**
 * Fetch email events within a specific date range (server-side filtering).
 */
export async function fetchEmailEventsRange(startDate, endDate, onProgress) {
  let allDocs = []
  let page = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    const res = await fetch(`/api/email-events?${params.toString()}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)

    allDocs = allDocs.concat(data.docs)
    total = data.total
    hasMore = data.hasMore
    page++

    if (onProgress) onProgress({ loaded: allDocs.length, total, done: !hasMore })
  }

  return allDocs
}
