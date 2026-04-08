import clientPromise from '../../../src/lib/mongodb'
import { getAdminDb } from '../../../src/lib/firebaseAdmin'

const ANALYTICS_DB = 'analytics'
const CACHE_COL = 'call_dashboard_cache'
const CACHE_KEY = 'call_overview_latest'
const CALLS_COL = 'Call_logs'

function toDate(raw) {
  if (!raw) return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  if (typeof raw?.toDate === 'function') {
    const converted = raw.toDate()
    return Number.isNaN(converted?.getTime?.()) ? null : converted
  }
  if (typeof raw === 'object' && typeof raw._seconds === 'number') {
    const converted = new Date(raw._seconds * 1000)
    return Number.isNaN(converted.getTime()) ? null : converted
  }
  const converted = new Date(raw)
  return Number.isNaN(converted.getTime()) ? null : converted
}

function getCallDate(call) {
  return (
    toDate(call.Date) ||
    toDate(call.call_timestamp) ||
    toDate(call.created_at) ||
    toDate(call.createdAt) ||
    toDate(call.call_date) ||
    toDate(call.callDate) ||
    null
  )
}

function isWithinRange(callDate, startDate, endDate) {
  if (!callDate) return !(startDate || endDate)
  if (startDate) {
    const start = new Date(startDate)
    if (callDate < start) return false
  }
  if (endDate) {
    const end = new Date(endDate)
    end.setDate(end.getDate() + 1)
    if (callDate >= end) return false
  }
  return true
}

function buildOwnerStats(calls) {
  const ownerMap = new Map()

  for (const call of calls) {
    const owner = call.Lead_owner || 'Unassigned'
    const score = call.scores?.overall || 0
    const current = ownerMap.get(owner) || { owner, totalCalls: 0, totalScore: 0, maxScore: 0 }
    current.totalCalls += 1
    current.totalScore += score
    current.maxScore = Math.max(current.maxScore, score)
    ownerMap.set(owner, current)
  }

  return [...ownerMap.values()]
    .map((item) => ({
      owner: item.owner,
      totalCalls: item.totalCalls,
      avgScore: item.totalCalls > 0 ? Math.round(item.totalScore / item.totalCalls) : 0,
      maxScore: item.maxScore,
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls)
}

function computeOverview(calls, { startDate, endDate } = {}) {
  const filteredCalls = (calls || []).filter((call) => isWithinRange(getCallDate(call), startDate, endDate))
  const totalCalls = filteredCalls.length
  const totalScore = filteredCalls.reduce((sum, call) => sum + (call.scores?.overall || 0), 0)
  const averageScore = totalCalls > 0 ? Math.round(totalScore / totalCalls) : 0

  let interestedCount = 0
  let notInterestedCount = 0

  for (const call of filteredCalls) {
    const counselorDisposition = call.Disposition?.counselor
    const leadStage = call.lead_stage
    if (counselorDisposition === 'interested' || leadStage === 'Interested') interestedCount += 1
    if (counselorDisposition === 'not_interested' || leadStage === 'Not Interested') notInterestedCount += 1
  }

  const interestedPct = totalCalls > 0 ? Math.round((interestedCount / totalCalls) * 100) : 0
  const notInterestedPct = totalCalls > 0 ? Math.round((notInterestedCount / totalCalls) * 100) : 0
  const ownerStatsOverall = buildOwnerStats(filteredCalls)

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const ownerStatsToday = startDate || endDate
    ? ownerStatsOverall
    : buildOwnerStats(filteredCalls.filter((call) => {
        const callDate = getCallDate(call)
        return callDate && callDate >= startOfToday
      }))

  const ownerStatsMonth = startDate || endDate
    ? ownerStatsOverall
    : buildOwnerStats(filteredCalls.filter((call) => {
        const callDate = getCallDate(call)
        return callDate && callDate >= monthStart
      }))

  return {
    kpi: {
      totalCalls,
      averageScore,
      interestedCount,
      notInterestedCount,
      interestedPct,
      notInterestedPct,
    },
    ownerStatsToday,
    ownerStatsMonth,
    ownerStatsOverall,
    rawDocCount: calls.length,
    filteredDocCount: filteredCalls.length,
    computedAt: new Date().toISOString(),
  }
}

async function fetchAllCallsFromFirestore() {
  const db = getAdminDb()
  const snapshot = await db.collection(CALLS_COL).get()
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

export async function computeCallDashboard({ mode = 'cached', startDate, endDate } = {}) {
  const start = Date.now()
  const client = await clientPromise
  const cacheCol = client.db(ANALYTICS_DB).collection(CACHE_COL)
  const hasDateFilter = Boolean(startDate || endDate)

  if (mode === 'cached' && !hasDateFilter) {
    const cached = await cacheCol.findOne({ _id: CACHE_KEY })
    if (cached) {
      return {
        ...cached,
        _id: undefined,
        fromCache: true,
        elapsed: Date.now() - start,
      }
    }
  }

  const calls = await fetchAllCallsFromFirestore()
  const dashboard = computeOverview(calls, { startDate, endDate })

  if (mode !== 'range') {
    await cacheCol.updateOne(
      { _id: CACHE_KEY },
      { $set: dashboard },
      { upsert: true },
    )
  }

  return {
    ...dashboard,
    fromCache: false,
    elapsed: Date.now() - start,
  }
}
