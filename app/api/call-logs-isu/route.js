import clientPromise from '../../../src/lib/mongodb'
import { normalizeWAWorkspace, workspaceUsesIsuCallLogs } from '../../../src/lib/waWorkspace'

const DB = 'analytics'
const COL_BBA   = 'call_logs_bba'
const COL_BTECH = 'call_logs_btech'

function collectionForWorkspace(workspace) {
  return workspace === 'btech' ? COL_BTECH : COL_BBA
}

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

const BOGUS_URL = new Set(['null', 'undefined', '-', 'n/a', 'na', 'none', 'false', '0'])

function isPlausibleRecordingCandidate(s) {
  const t = String(s).trim()
  if (!t) return false
  if (BOGUS_URL.has(t.toLowerCase())) return false
  return true
}

/** Prefer explicit recording fields; generic `file_url` / `media_url` last (often not audio). */
function pickRecordingUrl(doc) {
  const rec = doc.recording
  if (Array.isArray(rec)) {
    for (const item of rec) {
      if (typeof item === 'string' && isPlausibleRecordingCandidate(item)) return item.trim()
      if (item && typeof item === 'object') {
        const nested = [item.url, item.file_url, item.fileUrl, item.recording_url, item.href, item.src]
        for (const v of nested) {
          if (typeof v === 'string' && isPlausibleRecordingCandidate(v)) return v.trim()
        }
      }
    }
  }
  const recObjNested =
    rec && typeof rec === 'object' && !Array.isArray(rec)
      ? [rec.url, rec.file_url, rec.fileUrl, rec.s3_url, rec.s3Url, rec.href, rec.src]
      : []
  const recordingCap =
    doc.Recording && typeof doc.Recording === 'object'
      ? [doc.Recording.url, doc.Recording.file_url, doc.Recording.recording_url]
      : []
  const flat = [
    doc.Recording_Url,
    typeof doc.Recording === 'string' ? doc.Recording : null,
    doc.recording_url,
    doc.recordingUrl,
    doc.recording_link,
    doc.recordingLink,
    doc.audio_url,
    doc.audioUrl,
    doc.call_recording_url,
    doc.callRecordingUrl,
    doc.record_file_url,
    doc.recordFileUrl,
    typeof rec === 'string' ? rec : null,
    ...recordingCap,
    ...recObjNested,
    doc.media_url,
    doc.mediaUrl,
    doc.file_url,
    doc.fileUrl,
  ]
  for (const v of flat) {
    if (typeof v === 'string' && isPlausibleRecordingCandidate(v)) return v.trim()
  }
  return ''
}

/**
 * If Mongo stores `/path/to/file.mp3` or `recordings/x.wav`, set ISU_RECORDING_URL_BASE in .env
 * (no trailing slash), e.g. https://cdn.example.com — server only, not NEXT_PUBLIC_*.
 */
function absolutizeRecordingUrl(raw) {
  const url = typeof raw === 'string' ? raw.trim() : ''
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:')) return url
  if (url.startsWith('//')) return `https:${url}`
  const base = (process.env.ISU_RECORDING_URL_BASE || '').replace(/\/$/, '')
  if (!base) return url
  if (url.startsWith('/')) return `${base}${url}`
  return `${base}/${url}`
}

/** LeadDetail expects `summary.one_line` (+ optional what_went_* / top_3_fixes). */
function pickSummary(doc) {
  const raw = doc.summary ?? doc.Summary ?? doc.ai_summary ?? doc.AI_summary
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const merged = { ...raw }
    const fill =
      (typeof doc.summary_one_line === 'string' && doc.summary_one_line.trim()) ||
      (typeof doc.one_line_summary === 'string' && doc.one_line_summary.trim()) ||
      ''
    if (fill && !merged.one_line) merged.one_line = fill
    return merged
  }
  const line =
    (typeof raw === 'string' && raw.trim()) ||
    (typeof doc.summary_one_line === 'string' && doc.summary_one_line.trim()) ||
    (typeof doc.one_line_summary === 'string' && doc.one_line_summary.trim()) ||
    (typeof doc.call_summary === 'string' && doc.call_summary.trim()) ||
    (typeof doc.ai_summary_one_line === 'string' && doc.ai_summary_one_line.trim()) ||
    ''
  return line ? { one_line: line } : undefined
}

function pickTranscript(doc) {
  const t =
    doc.Transcript ??
    doc.transcript ??
    doc.call_transcript ??
    doc.callTranscript ??
    doc.transcription ??
    doc.transcript_text ??
    doc.transcription_text
  if (typeof t !== 'string') {
    const nested = doc.transcript_obj ?? doc.transcriptObject
    if (nested && typeof nested === 'object') {
      const inner = nested.text ?? nested.full ?? nested.body ?? nested.content
      if (typeof inner === 'string' && inner.trim()) return inner.trim()
    }
    return ''
  }
  return t.trim()
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

  const summaryObj = pickSummary(doc)

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
    Recording_Url: absolutizeRecordingUrl(pickRecordingUrl(doc)),
    ...(summaryObj ? { summary: summaryObj } : {}),
    Transcript: pickTranscript(doc),
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
    const col = client.db(DB).collection(collectionForWorkspace(workspace))

    let docs = await col.find({}).maxTimeMS(120000).toArray()

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
