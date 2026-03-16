import { computeWADashboard } from './compute'

export const maxDuration = 60

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'cached'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const result = await computeWADashboard({ mode, startDate, endDate })
    return Response.json(result)
  } catch (err) {
    console.error('[api/wa-dashboard]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
