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
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180)
    throw new Error(
      `WA dashboard returned non-JSON (${res.status}). Often a timeout or platform error page, not your API body. Snippet: ${snippet || '(empty)'}`,
    )
  }
  if (data.error) throw new Error(data.error)
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
