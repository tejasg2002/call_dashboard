export async function fetchSmsDashboard({ mode = 'cached', startDate, endDate } = {}) {
  const params = new URLSearchParams({ mode })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)

  const res = await fetch(`/api/smsDashboard?${params.toString()}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}
