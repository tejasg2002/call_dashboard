async function parseJsonResponse(res, label) {
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`${label} returned non-JSON (${res.status})`)
  }
  if (data.error) throw new Error(data.error)
  if (!res.ok) throw new Error(data.error || `${label} failed (${res.status})`)
  return data
}

/** Legacy monolithic snapshot (Firestore recompute on cache miss). */
export async function fetchCallDashboard({ mode = 'cached', startDate, endDate, signal } = {}) {
  const params = new URLSearchParams({ mode })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const res = await fetch(`/api/call-dashboard?${params.toString()}`, { signal })
  return parseJsonResponse(res, 'Call dashboard')
}

/**
 * Fast MBA call overview — one cache read (or one Firestore pass on cold cache).
 */
export async function fetchCallDashboardSlices({ mode = 'cached', startDate, endDate, signal } = {}) {
  const params = new URLSearchParams({ mode })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const res = await fetch(`/api/call-dashboard/overview?${params.toString()}`, { signal })
  return parseJsonResponse(res, 'Call overview')
}
