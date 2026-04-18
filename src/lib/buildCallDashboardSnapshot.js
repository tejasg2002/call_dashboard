/** @param {Record<string, unknown>} call */
export function getCallDateFromCall(call) {
  const raw =
    call.Date ||
    call.call_timestamp ||
    call.created_at ||
    call.createdAt ||
    call.call_date ||
    call.callDate ||
    null
  if (!raw) return null
  if (typeof raw.toDate === 'function') {
    const d = raw.toDate()
    return Number.isNaN(d?.getTime?.()) ? null : d
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function buildOwnerStats(sourceCalls) {
  const ownerMap = {}
  sourceCalls.forEach((call) => {
    const owner = call.Lead_owner || 'Unassigned'
    if (!ownerMap[owner]) ownerMap[owner] = { owner, totalCalls: 0, totalScore: 0, maxScore: 0 }
    const score = call.scores?.overall || 0
    ownerMap[owner].totalCalls += 1
    ownerMap[owner].totalScore += score
    ownerMap[owner].maxScore = Math.max(ownerMap[owner].maxScore, score)
  })

  return Object.values(ownerMap)
    .map((item) => ({
      owner: item.owner,
      totalCalls: item.totalCalls,
      avgScore: item.totalCalls > 0 ? Math.round(item.totalScore / item.totalCalls) : 0,
      maxScore: item.maxScore,
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls)
}

/**
 * Same KPI / owner breakdown shape as `/api/call-dashboard` fallback (Firestore).
 * @param {unknown[]} calls
 * @param {{ fromCache?: boolean, fallback?: boolean }} [opts]
 */
export function buildCallDashboardSnapshotFromCalls(calls, opts = {}) {
  const { fromCache = false, fallback = false } = opts
  const totalCalls = calls.length
  const totalScore = calls.reduce((sum, call) => sum + (call.scores?.overall || 0), 0)
  const averageScore = totalCalls > 0 ? Math.round(totalScore / totalCalls) : 0
  const interestedCount = calls.filter(
    (call) => call.Disposition?.counselor === 'interested' || call.lead_stage === 'Interested',
  ).length
  const notInterestedCount = calls.filter(
    (call) => call.Disposition?.counselor === 'not_interested' || call.lead_stage === 'Not Interested',
  ).length

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  return {
    kpi: {
      totalCalls,
      averageScore,
      interestedCount,
      notInterestedCount,
      interestedPct: totalCalls > 0 ? Math.round((interestedCount / totalCalls) * 100) : 0,
      notInterestedPct: totalCalls > 0 ? Math.round((notInterestedCount / totalCalls) * 100) : 0,
    },
    ownerStatsToday: buildOwnerStats(
      calls.filter((call) => {
        const callDate = getCallDateFromCall(call)
        return callDate && callDate >= startOfToday
      }),
    ),
    ownerStatsMonth: buildOwnerStats(
      calls.filter((call) => {
        const callDate = getCallDateFromCall(call)
        return callDate && callDate >= monthStart
      }),
    ),
    ownerStatsOverall: buildOwnerStats(calls),
    rawDocCount: totalCalls,
    filteredDocCount: totalCalls,
    fromCache,
    fallback,
  }
}
