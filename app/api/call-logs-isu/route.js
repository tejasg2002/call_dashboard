import clientPromise from '../../../src/lib/mongodb'
import { normalizeWAWorkspace, workspaceUsesIsuCallLogs } from '../../../src/lib/waWorkspace'

const DB = 'analytics'
const COL = 'call_logs_isu'

function toDate(raw) {
  if (!raw) return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  if (typeof raw?.toDate === 'function') {
    const d = raw.toDate()
    return Number.isNaN(d?.getTime?.()) ? null : d
  }
  if (typeof raw === 'object' && typeof raw._seconds === 'number') {
    const d = new Date(raw._seconds * 1000)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function getCallDateFromDoc(doc) {
  return (
    toDate(doc.Date) ||
    toDate(doc.call_timestamp) ||
    toDate(doc.created_at) ||
    toDate(doc.createdAt) ||
    toDate(doc.call_date) ||
    toDate(doc.callDate) ||
    null
  )
}

function mapDoc(doc, idx) {
  const id = doc._id != null ? String(doc._id) : `isu-${idx}`
  const durationSec =
    doc.Duration?.seconds ??
    (typeof doc.duration_seconds === 'number' ? doc.duration_seconds : null) ??
    (typeof doc.duration === 'number' ? doc.duration : null) ??
    0

  const dispositionRaw =
    doc.Disposition?.counselor ??
    doc.disposition ??
    doc.counselor_disposition ??
    doc.Disposition_counselor ??
    ''

  const dispositionObj =
    doc.Disposition && typeof doc.Disposition === 'object'
      ? doc.Disposition
      : dispositionRaw
        ? { counselor: String(dispositionRaw).toLowerCase().replace(/\s+/g, '_') }
        : {}

  const overall =
    doc.scores?.overall ??
    (typeof doc.overall_score === 'number' ? doc.overall_score : null) ??
    (typeof doc.score === 'number' ? doc.score : null) ??
    0

  return {
    id,
    Name: doc.Name ?? doc.name ?? doc.lead_name ?? doc.Lead_Name ?? '',
    Lead_id: doc.Lead_id ?? doc.lead_id ?? doc.Lead_ID ?? '',
    Lead_owner: doc.Lead_owner ?? doc.lead_owner ?? '',
    City: doc.City ?? doc.city ?? '',
    State: doc.State ?? doc.state ?? '',
    Date: doc.Date ?? doc.call_timestamp ?? doc.createdAt ?? doc.call_date,
    call_timestamp: doc.call_timestamp,
    created_at: doc.created_at,
    createdAt: doc.createdAt,
    call_date: doc.call_date,
    Duration: typeof durationSec === 'number' ? { seconds: durationSec } : doc.Duration ?? { seconds: 0 },
    scores: doc.scores && typeof doc.scores === 'object' ? doc.scores : { overall: Number(overall) || 0 },
    Disposition: dispositionObj,
    Call_type: doc.Call_type ?? doc.call_type,
    lead_stage: doc.lead_stage ?? doc.leadStage,
    course: doc.course ?? doc.Course ?? '',
    Recording_Url: doc.Recording_Url ?? doc.recording_url ?? doc.recordingUrl ?? doc.audio_url ?? '',
  }
}

function workspaceMongoFilter(workspace) {
  const w = normalizeWAWorkspace(workspace)
  if (w !== 'bba' && w !== 'btech') return null
  const re = new RegExp(`^${w}$`, 'i')
  return {
    $or: [
      { program: re },
      { bu: re },
      { workspace: re },
      { branch: re },
      { course: re },
    ],
  }
}

export const maxDuration = 120

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspace = normalizeWAWorkspace(searchParams.get('workspace'))
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    if (!workspaceUsesIsuCallLogs(workspace)) {
      return Response.json(
        { error: 'workspace must be bba or btech' },
        { status: 400 },
      )
    }

    const client = await clientPromise
    const col = client.db(DB).collection(COL)

    const wsFilter = workspaceMongoFilter(workspace)
    let docs = wsFilter ? await col.find(wsFilter).maxTimeMS(120000).toArray() : []
    if (wsFilter && docs.length === 0) {
      docs = await col.find({}).maxTimeMS(120000).toArray()
    }

    const start = startDate ? new Date(startDate) : null
    let end = endDate ? new Date(endDate) : null
    if (end) {
      end = new Date(end)
      end.setDate(end.getDate() + 1)
    }

    if (start || end) {
      docs = docs.filter((d) => {
        const cd = getCallDateFromDoc(d)
        if (!cd) return !(start || end)
        if (start && cd < start) return false
        if (end && cd >= end) return false
        return true
      })
    }

    const calls = docs.map((d, i) => mapDoc(d, i))
    return Response.json({ calls, count: calls.length, workspace })
  } catch (err) {
    console.error('[api/call-logs-isu]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
