/**
 * GET /api/call-analytics-unified
 *
 * Merges SmartPing call events + transcript analytics for BBA/BTECH/MCA.
 * Join key: Lead_id + day, fallback phone + day.
 */

import clientPromise from '../../../src/lib/mongodb'
import {
  callLogsCollectionForWorkspace,
  normalizeWAWorkspace,
  smartpingCollectionForWorkspace,
  workspaceUsesIsuCallLogs,
} from '../../../src/lib/waWorkspace'
import { fetchUnifiedCallAnalytics } from '../../../src/lib/unifiedCallAnalytics'

const DB = 'analytics'
export const maxDuration = 120

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspace = normalizeWAWorkspace(searchParams.get('workspace'))
    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''

    const callLogsCollection = callLogsCollectionForWorkspace(workspace)
    if (!workspaceUsesIsuCallLogs(workspace) || !callLogsCollection) {
      return Response.json(
        { error: 'Unified call analytics is only available for bba, btech, or mca' },
        { status: 400 },
      )
    }

    const smartpingCollection = smartpingCollectionForWorkspace(workspace)
    const client = await clientPromise
    const db = client.db(DB)

    const start = Date.now()
    const result = await fetchUnifiedCallAnalytics(db, {
      callLogsCollection,
      smartpingCollection,
      startDate,
      endDate,
    })

    return Response.json({
      ...result,
      workspace,
      elapsed: Date.now() - start,
    })
  } catch (err) {
    console.error('[api/call-analytics-unified]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
