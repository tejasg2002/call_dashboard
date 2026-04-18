/**
 * BBA/BTECH: call logs from Mongo analytics.call_logs_isu (see /api/call-logs-isu).
 */

export async function fetchCallLogsIsu(workspace, { startDate, endDate } = {}) {
  const params = new URLSearchParams()
  if (workspace) params.set('workspace', workspace)
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const qs = params.toString()
  const res = await fetch(`/api/call-logs-isu${qs ? `?${qs}` : ''}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.calls || []
}
