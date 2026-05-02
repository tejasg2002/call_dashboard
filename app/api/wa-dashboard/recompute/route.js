import { computeWADashboard } from '../compute'
import { normalizeWAWorkspace } from '../../../../src/lib/waWorkspace'

// Long timeout — recompute can take 30-90s; must not be subject to the 60s public read limit
export const maxDuration = 300

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspace = normalizeWAWorkspace(searchParams.get('workspace'))

    const result = await computeWADashboard({ mode: 'full', workspace })

    return Response.json({
      ok: true,
      workspace: result.workspace,
      rawDocCount: result.rawDocCount,
      elapsed: result.elapsed,
      computedAt: result.computedAt,
    })
  } catch (err) {
    console.error('[api/wa-dashboard/recompute]', err)
    return Response.json({ error: err.message || 'Recompute failed' }, { status: 500 })
  }
}
