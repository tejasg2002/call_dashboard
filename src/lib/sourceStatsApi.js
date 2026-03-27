export async function fetchSourceStats({ mode = 'cached', startDate, endDate } = {}) {
  const params = new URLSearchParams({ mode })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)

  const res = await fetch(`/api/sourceStats?${params.toString()}`)
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text()
    throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}
