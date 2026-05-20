/**
 * BBA / BTECH / MCA: merged SmartPing + transcript analytics from /api/call-analytics-unified.
 */

export async function fetchUnifiedCallAnalytics(workspace, { startDate, endDate } = {}) {
  const params = new URLSearchParams()
  if (workspace) params.set('workspace', workspace)
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const qs = params.toString()
  const res = await fetch(`/api/call-analytics-unified${qs ? `?${qs}` : ''}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}
