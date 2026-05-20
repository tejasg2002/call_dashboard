/**
 * Unified call analytics: merge SmartPing call events + transcript analytics by Lead_id + day.
 *
 * SmartPing collection: one row per call event (Ringing / Answered / Hangup, etc.)
 *   - Dedup by call_id → one row per attempt.
 * Call-logs (transcript) collection: one row per analyzed call with Lead_id, score, summary.
 *
 * Join: prefer (Lead_id + YYYY-MM-DD).
 *       Fallback: (normalized phone + YYYY-MM-DD) when Lead_id is missing on the SmartPing side.
 */

import { normaliseMobile } from './waPhoneMatch.js'

const ANSWERED_EVENTS = new Set(['answered', 'connected', 'bridged', 'talking'])

function toDateSafe(raw) {
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

function ymd(date) {
  if (!date) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function smartpingCallDate(doc) {
  return (
    toDateSafe(doc.call_start_time) ||
    toDateSafe(doc.callStartTime) ||
    toDateSafe(doc.createdAt) ||
    toDateSafe(doc.created_at) ||
    toDateSafe(doc.Date) ||
    null
  )
}

function transcriptCallDate(doc) {
  return (
    toDateSafe(doc.Date) ||
    toDateSafe(doc.call_timestamp) ||
    toDateSafe(doc.created_at) ||
    toDateSafe(doc.createdAt) ||
    toDateSafe(doc.call_date) ||
    toDateSafe(doc.callDate) ||
    null
  )
}

function smartpingLeadId(doc) {
  return (
    doc.lead_id ??
    doc.Lead_id ??
    doc.Lead_ID ??
    doc.lead_ID ??
    doc.leadId ??
    null
  )
}

function smartpingPhone(doc) {
  return doc.customer_number ?? doc.phone_number ?? doc.phone ?? ''
}

function smartpingAgent(doc) {
  return (
    doc.agent_name ??
    doc.agent ??
    doc.agent_email ??
    doc.user_email ??
    'Unassigned'
  )
}

function smartpingEvent(doc) {
  return String(doc.event_name ?? doc.event ?? doc.status ?? '').toLowerCase()
}

function isAnsweredEvent(evt) {
  return ANSWERED_EVENTS.has(evt)
}

function ownerKey(name) {
  return String(name || 'Unassigned').trim().toLowerCase().replace(/[._-]+/g, ' ')
}

function joinKey(leadId, dayStr, fallbackPhone) {
  if (leadId) return `L:${String(leadId).trim()}:${dayStr}`
  return `P:${fallbackPhone}:${dayStr}`
}

function isInterestedTranscript(t) {
  const d = String(t.disposition || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
  const stage = String(t.leadStage || '')
  return d === 'interested' || stage === 'Interested'
}

function buildCounselorScoreStats(transcripts) {
  const map = new Map()
  for (const t of transcripts) {
    const owner = t.owner || 'Unassigned'
    const okey = ownerKey(owner)
    const o = map.get(okey) || { owner, totalCalls: 0, scoreSum: 0, scoreN: 0, maxScore: 0 }
    o.totalCalls += 1
    if (t.score > 0) {
      o.scoreSum += t.score
      o.scoreN += 1
    }
    if (t.score > o.maxScore) o.maxScore = t.score
    map.set(okey, o)
  }
  return [...map.values()]
    .map((o) => ({
      owner: o.owner,
      totalCalls: o.totalCalls,
      avgScore: o.scoreN > 0 ? Math.round(o.scoreSum / o.scoreN) : 0,
      maxScore: o.maxScore,
    }))
    .sort((a, b) => b.avgScore - a.avgScore || b.totalCalls - a.totalCalls)
}

function buildCounselorCallStats(agentTotals) {
  return [...agentTotals.values()]
    .map((a) => ({
      owner: a.agent,
      totalCalls: a.total,
      avgScore: 0,
      maxScore: 0,
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls)
}

function pickTopPerformer(counselorCalls, counselorScores) {
  if (!counselorCalls.length) return null
  const scoreByKey = new Map(counselorScores.map((s) => [ownerKey(s.owner), s]))
  const top = counselorCalls[0]
  const scores = scoreByKey.get(ownerKey(top.owner))
  return {
    owner: top.owner,
    totalCalls: top.totalCalls,
    avgScore: scores?.avgScore ?? 0,
    maxScore: scores?.maxScore ?? 0,
  }
}

/**
 * @param {import('mongodb').Db} db
 * @param {{
 *   callLogsCollection: string,
 *   smartpingCollection: string|null,
 *   startDate?: string,
 *   endDate?: string,
 *   maxTimeMS?: number,
 * }} opts
 */
export async function fetchUnifiedCallAnalytics(db, opts) {
  const {
    callLogsCollection,
    smartpingCollection,
    startDate,
    endDate,
    maxTimeMS = 60_000,
  } = opts

  const startTs = startDate ? new Date(startDate) : null
  let endTs = endDate ? new Date(endDate) : null
  if (endTs) {
    endTs = new Date(endTs)
    endTs.setDate(endTs.getDate() + 1)
  }

  const callLogsCol = db.collection(callLogsCollection)
  const smartpingCol = smartpingCollection ? db.collection(smartpingCollection) : null

  const transcriptProjection = {
    Lead_id: 1,
    Lead_owner: 1,
    Name: 1,
    Date: 1,
    call_timestamp: 1,
    created_at: 1,
    createdAt: 1,
    call_date: 1,
    Duration: 1,
    duration: 1,
    duration_seconds: 1,
    scores: 1,
    overall_score: 1,
    score: 1,
    Disposition: 1,
    disposition: 1,
    Call_type: 1,
    call_type: 1,
    lead_stage: 1,
    course: 1,
    City: 1,
    State: 1,
    customer_number: 1,
    phone_number: 1,
    phone: 1,
  }

  /** @type {Array<Record<string, any>>} */
  const transcriptDocs = await callLogsCol
    .find({}, { projection: transcriptProjection })
    .maxTimeMS(maxTimeMS)
    .toArray()

  const transcripts = []
  for (const d of transcriptDocs) {
    const callDate = transcriptCallDate(d)
    if (startTs && callDate && callDate < startTs) continue
    if (endTs && callDate && callDate >= endTs) continue
    const leadId = d.Lead_id ?? d.lead_id ?? d.Lead_ID ?? null
    const dayStr = callDate ? ymd(callDate) : ''
    const phone = normaliseMobile(d.customer_number ?? d.phone_number ?? d.phone ?? '')
    const overall =
      d.scores?.overall ??
      (typeof d.overall_score === 'number' ? d.overall_score : null) ??
      (typeof d.score === 'number' ? d.score : null) ??
      0
    const durationSec =
      d.Duration?.seconds ??
      (typeof d.duration_seconds === 'number' ? d.duration_seconds : null) ??
      (typeof d.duration === 'number' ? d.duration : 0)
    transcripts.push({
      leadId,
      owner: d.Lead_owner ?? d.lead_owner ?? 'Unassigned',
      phone,
      dayStr,
      score: Number(overall) || 0,
      durationSec: Number(durationSec) || 0,
      disposition:
        d.Disposition?.counselor ??
        d.disposition ??
        d.counselor_disposition ??
        '',
      leadStage: d.lead_stage ?? d.leadStage ?? '',
      callDate,
      raw: d,
    })
  }

  /** key → { count, answered, agents:Set, firstTs, lastTs, phones:Set, leadIds:Set } */
  const smartpingByKey = new Map()
  const dailyCounts = new Map()
  const agentTotals = new Map()
  let smartpingTotalCalls = 0
  let smartpingAnsweredCalls = 0

  if (smartpingCol) {
    const match = {}
    if (startDate || endDate) {
      const dateFilter = {}
      if (startDate) dateFilter.$gte = new Date(startDate)
      if (endTs) dateFilter.$lt = endTs

      const startStr = startDate || ''
      const endStr = endDate
        ? (() => {
            const d = new Date(endDate)
            d.setDate(d.getDate() + 1)
            return d.toISOString().slice(0, 10)
          })()
        : ''
      const stringFilter = {}
      if (startStr) stringFilter.$gte = startStr
      if (endStr) stringFilter.$lt = endStr

      match.$or = [
        ...(Object.keys(dateFilter).length
          ? [
              { call_start_time: dateFilter },
              { createdAt: dateFilter },
              { created_at: dateFilter },
            ]
          : []),
        ...(Object.keys(stringFilter).length
          ? [{ call_start_time: stringFilter }]
          : []),
      ]
    }

    const cursor = smartpingCol
      .find(match, {
        projection: {
          call_id: 1,
          callId: 1,
          customer_number: 1,
          phone_number: 1,
          phone: 1,
          agent_name: 1,
          agent: 1,
          agent_email: 1,
          user_email: 1,
          event_name: 1,
          event: 1,
          status: 1,
          call_start_time: 1,
          callStartTime: 1,
          createdAt: 1,
          created_at: 1,
          Date: 1,
          lead_id: 1,
          Lead_id: 1,
          Lead_ID: 1,
          leadId: 1,
        },
      })
      .maxTimeMS(maxTimeMS)

    /** call_id → { answered, agent, ts, phone, leadId } */
    const byCallId = new Map()
    for await (const d of cursor) {
      const callId = d.call_id ?? d.callId
      if (!callId) continue
      const evt = smartpingEvent(d)
      const answered = isAnsweredEvent(evt)
      const existing = byCallId.get(callId)
      if (existing) {
        if (answered) existing.answered = true
        if (!existing.agent || existing.agent === 'Unassigned') existing.agent = smartpingAgent(d)
        const ts = smartpingCallDate(d)
        if (ts && (!existing.ts || ts < existing.ts)) existing.ts = ts
        if (!existing.leadId) existing.leadId = smartpingLeadId(d)
        if (!existing.phone) existing.phone = normaliseMobile(smartpingPhone(d))
      } else {
        byCallId.set(callId, {
          answered,
          agent: smartpingAgent(d),
          ts: smartpingCallDate(d),
          phone: normaliseMobile(smartpingPhone(d)),
          leadId: smartpingLeadId(d),
        })
      }
    }

    for (const call of byCallId.values()) {
      smartpingTotalCalls += 1
      if (call.answered) smartpingAnsweredCalls += 1

      const dayStr = call.ts ? ymd(call.ts) : ''
      if (dayStr) dailyCounts.set(dayStr, (dailyCounts.get(dayStr) || 0) + 1)

      const ag = call.agent || 'Unassigned'
      const agStats = agentTotals.get(ag) || { agent: ag, total: 0, answered: 0 }
      agStats.total += 1
      if (call.answered) agStats.answered += 1
      agentTotals.set(ag, agStats)

      const key = joinKey(call.leadId, dayStr, call.phone)
      const bucket = smartpingByKey.get(key) || {
        attempts: 0,
        answered: 0,
        agents: new Set(),
        firstTs: null,
        lastTs: null,
      }
      bucket.attempts += 1
      if (call.answered) bucket.answered += 1
      bucket.agents.add(ag)
      if (call.ts && (!bucket.firstTs || call.ts < bucket.firstTs)) bucket.firstTs = call.ts
      if (call.ts && (!bucket.lastTs || call.ts > bucket.lastTs)) bucket.lastTs = call.ts
      smartpingByKey.set(key, bucket)
    }
  }

  let totalScoreSum = 0
  let scoreCount = 0
  let interestedCount = 0

  for (const t of transcripts) {
    if (t.score > 0) {
      totalScoreSum += t.score
      scoreCount += 1
    }
    if (isInterestedTranscript(t)) interestedCount += 1
  }

  const analyzedCalls = transcripts.length
  const averageScore = scoreCount > 0 ? Math.round(totalScoreSum / scoreCount) : 0
  const interestedPct =
    analyzedCalls > 0 ? Math.round((interestedCount / analyzedCalls) * 100) : 0

  const counselorCalls = buildCounselorCallStats(agentTotals)
  const counselorScores = buildCounselorScoreStats(transcripts)
  const topPerformer = pickTopPerformer(counselorCalls, counselorScores)

  return {
    kpi: {
      totalCalls: smartpingTotalCalls,
      averageScore,
      interestedCount,
      interestedPct,
      analyzedCalls,
    },
    topPerformer,
    counselorCalls,
    counselorScores,
    filteredDocCount: analyzedCalls,
    smartpingEnabled: !!smartpingCol,
  }
}
