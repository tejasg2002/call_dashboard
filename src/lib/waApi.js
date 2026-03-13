/**
 * Client-side helpers for fetching WhatsApp analytics data from MongoDB
 * via the /api/wa-events API route.
 *
 * Drop-in replacements for the old Firestore functions in firebase.js.
 */

const PAGE_SIZE = 50_000

/**
 * Fetch ALL WA events from MongoDB in batched pages.
 * Calls onProgress after each page so the UI can show a progress bar.
 */
export async function fetchWAEventsBatched(onProgress) {
  let allDocs = []
  let page = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const res = await fetch(`/api/wa-events?page=${page}&pageSize=${PAGE_SIZE}`)
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
 * Fetch WA events within a specific date range.
 * Filtering is done server-side in MongoDB via startDate/endDate params.
 */
export async function fetchWAEventsRange(startDate, endDate, onProgress) {
  let allDocs = []
  let page = 0
  let total = 0
  let hasMore = true

  while (hasMore) {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    const res = await fetch(`/api/wa-events?${params.toString()}`)
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
 * Fetch only WA events created after a timestamp (ISO string).
 * Used by the Refresh flow to get incremental data.
 */
export async function fetchWAEventsSince(timestamp) {
  const res = await fetch(`/api/wa-events?since=${encodeURIComponent(timestamp)}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.docs
}

/**
 * Fetch all WA events for a specific template name.
 * Used for on-demand stage user loading in WATemplatePreview.
 */
export async function fetchWATemplateUsers(templateName) {
  const res = await fetch(`/api/wa-events?template_name=${encodeURIComponent(templateName)}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.docs
}
