import { computeWADashboard } from './compute'
import { normalizeWAWorkspace, workspacePayloadMatchesExpected } from '../../../src/lib/waWorkspace'

export const maxDuration = 60

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'cached'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const workspace = normalizeWAWorkspace(searchParams.get('workspace'))

    const result = await computeWADashboard({ mode, startDate, endDate, workspace })
    if (!workspacePayloadMatchesExpected(result, workspace)) {
      console.error('[api/wa-dashboard] payload workspace mismatch', { requested: workspace, got: result?.workspace })
      return Response.json(
        { error: 'Workspace mismatch between request and analytics payload' },
        { status: 500 },
      )
    }
    return Response.json(result)
  } catch (err) {
    console.error('[api/wa-dashboard]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
