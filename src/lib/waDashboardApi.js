/**
 * Client helpers for the new server-side WA dashboard API.
 * Replaces the old "fetch 160k raw docs → aggregate in browser" flow.
 */

export async function fetchWADashboard({ mode = 'cached', startDate, endDate, workspace } = {}) {
  const params = new URLSearchParams({ mode })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (workspace) params.set('workspace', workspace)

  const res = await fetch(`/api/wa-dashboard?${params.toString()}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}
