/**
 * Client helper for the server-side email dashboard API.
 * Replaces the old "fetch all raw docs → aggregate in browser" flow.
 */

export async function fetchEmailDashboard({ mode = 'cached', startDate, endDate } = {}) {
  const params = new URLSearchParams({ mode })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)

  const res = await fetch(`/api/email-dashboard?${params.toString()}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}
