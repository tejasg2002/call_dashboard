import { computeCallDashboard } from './compute'

export const maxDuration = 120

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'cached'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const result = await computeCallDashboard({ mode, startDate, endDate })
    return Response.json(result)
  } catch (err) {
    console.error('[api/call-dashboard]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
