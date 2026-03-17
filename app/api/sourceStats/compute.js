import clientPromise from '../../../src/lib/mongodb'

const ITM_DB = 'itm'
const CALLQ_DB = 'callQ'
const LEADS_COL = 'leads'
const WEBHOOK_COL = 'callerDtWebhookLogs'
const RECORDINGS_COL = 'callrecordings'
const CACHE_COL = 'source_stats_cache'

const DAY_BUCKET_COUNT = 8
const DAY_LABELS = ['Day 0', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7+']
const MS_PER_DAY = 86400000
const TOP_DAILY_SOURCES = 25

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n.length === 10 ? n : ''
}

function normaliseSource(raw) {
  if (!raw || raw === 'NA') return 'unknown'
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function titleCase(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

function makeDayBuckets() {
  return Array.from({ length: DAY_BUCKET_COUNT }, () => ({ calls: 0, leads: new Set() }))
}

function toDateOnly(d) {
  const dt = new Date(d)
  dt.setHours(0, 0, 0, 0)
  return dt
}

function toDateStr(d) {
  return new Date(d).toISOString().slice(0, 10)
}

export async function computeSourceStats({ mode = 'cached', startDate, endDate } = {}) {
  const start = Date.now()
  const client = await clientPromise

  const itmDb = client.db(ITM_DB)
  const callQDb = client.db(CALLQ_DB)
  const cacheCol = itmDb.collection(CACHE_COL)

  const hasDateFilter = Boolean(startDate || endDate)

  if (mode === 'cached' && !hasDateFilter) {
    const cached = await cacheCol.findOne({ _id: 'source_stats_latest' })
    if (cached) {
      return { ...cached, _id: undefined, fromCache: true, elapsed: Date.now() - start }
    }
  }

  const recordingsDateFilter = {}
  if (hasDateFilter) {
    recordingsDateFilter.createdAt = {}
    if (startDate) recordingsDateFilter.createdAt.$gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setDate(end.getDate() + 1)
      recordingsDateFilter.createdAt.$lt = end
    }
  }

  const [callQLeads, webhookLeads, callsByPhone] = await Promise.all([
    callQDb.collection(LEADS_COL).aggregate([
      { $match: { phone: { $exists: true, $ne: null } } },
      { $project: { phone: 1, source: 1, createdDate: 1 } },
    ]).toArray(),

    itmDb.collection(WEBHOOK_COL).aggregate([
      { $match: { mobile: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$mobile',
          source: { $first: '$source' },
          createdAt: { $min: '$createdAt' },
        },
      },
      { $match: { _id: { $ne: null } } },
    ]).toArray(),

    itmDb.collection(RECORDINGS_COL).aggregate([
      { $match: { 'body.data.call.phone_number': { $exists: true }, ...recordingsDateFilter } },
      { $unwind: '$body.data' },
      {
        $group: {
          _id: {
            phone: '$body.data.call.phone_number',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.phone',
          totalCalls: { $sum: '$count' },
          dailyCalls: { $push: { day: '$_id.day', count: '$count' } },
        },
      },
      { $match: { _id: { $ne: null } } },
    ]).toArray(),
  ])

  const callMap = new Map()
  for (const rec of callsByPhone) {
    const norm = normaliseMobile(rec._id)
    if (norm) {
      callMap.set(norm, { totalCalls: rec.totalCalls, dailyCalls: rec.dailyCalls || [] })
    }
  }

  const leadMap = new Map()
  const leadRegDates = new Map()

  for (const doc of callQLeads) {
    const norm = normaliseMobile(doc.phone)
    if (norm && !leadMap.has(norm)) {
      leadMap.set(norm, normaliseSource(doc.source))
      if (doc.createdDate) {
        const d = new Date(doc.createdDate)
        if (!isNaN(d.getTime())) leadRegDates.set(norm, d)
      }
    }
  }

  let webhookOnlyCount = 0
  for (const doc of webhookLeads) {
    const norm = normaliseMobile(doc._id)
    if (norm && !leadMap.has(norm)) {
      leadMap.set(norm, normaliseSource(doc.source))
      if (doc.createdAt) {
        const d = new Date(doc.createdAt)
        if (!isNaN(d.getTime())) leadRegDates.set(norm, d)
      }
      webhookOnlyCount++
    }
  }

  const sourceAgg = {}
  const sourceDisplayNames = {}
  const sourceDailyMap = {}

  for (const [mobile, srcKey] of leadMap) {
    if (!sourceAgg[srcKey]) {
      sourceAgg[srcKey] = {
        totalLeads: 0,
        totalCalls: 0,
        maxCalls: 0,
        zeroCallLeads: 0,
        dayBuckets: makeDayBuckets(),
      }
      sourceDisplayNames[srcKey] = titleCase(srcKey)
      sourceDailyMap[srcKey] = {}
    }

    const callData = callMap.get(mobile)
    const calls = callData?.totalCalls || 0
    const s = sourceAgg[srcKey]

    s.totalLeads += 1
    s.totalCalls += calls
    if (calls > s.maxCalls) s.maxCalls = calls
    if (calls === 0) s.zeroCallLeads += 1

    const regDate = leadRegDates.get(mobile)

    if (regDate) {
      const regDateStr = toDateStr(regDate)
      if (!sourceDailyMap[srcKey][regDateStr]) {
        sourceDailyMap[srcKey][regDateStr] = { newLeads: 0, calls: 0, leadsCalledSet: new Set() }
      }
      sourceDailyMap[srcKey][regDateStr].newLeads += 1
    }

    if (callData) {
      if (regDate) {
        const regDay = toDateOnly(regDate)
        for (const { day, count } of callData.dailyCalls) {
          const callDay = toDateOnly(day)
          const offset = Math.round((callDay - regDay) / MS_PER_DAY)
          if (offset < 0) continue
          const bucket = offset >= 7 ? 7 : offset
          s.dayBuckets[bucket].calls += count
          s.dayBuckets[bucket].leads.add(mobile)
        }
      }

      for (const { day, count } of callData.dailyCalls) {
        if (!sourceDailyMap[srcKey][day]) {
          sourceDailyMap[srcKey][day] = { newLeads: 0, calls: 0, leadsCalledSet: new Set() }
        }
        sourceDailyMap[srcKey][day].calls += count
        sourceDailyMap[srcKey][day].leadsCalledSet.add(mobile)
      }
    }
  }

  const sourceRows = Object.entries(sourceAgg)
    .map(([key, s]) => ({
      source: sourceDisplayNames[key],
      totalLeads: s.totalLeads,
      totalCalls: s.totalCalls,
      avgCallsPerLead: s.totalLeads > 0
        ? parseFloat((s.totalCalls / s.totalLeads).toFixed(2))
        : 0,
      maxCalls: s.maxCalls,
      zeroCallLeads: s.zeroCallLeads,
      connectedLeadsPct: s.totalLeads > 0
        ? parseFloat((((s.totalLeads - s.zeroCallLeads) / s.totalLeads) * 100).toFixed(1))
        : 0,
      dayBreakdown: s.dayBuckets.map((b, i) => ({
        day: i,
        label: DAY_LABELS[i],
        totalCalls: b.calls,
        leadsContacted: b.leads.size,
        avgCallsPerLead: s.totalLeads > 0
          ? parseFloat((b.calls / s.totalLeads).toFixed(3))
          : 0,
      })),
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls)

  const topSourceKeys = sourceRows.slice(0, TOP_DAILY_SOURCES).map((r) => normaliseSource(r.source))
  const dailyActivity = {}
  for (const srcKey of topSourceKeys) {
    const display = sourceDisplayNames[srcKey]
    const dayMap = sourceDailyMap[srcKey]
    if (!dayMap) continue
    dailyActivity[display] = Object.entries(dayMap)
      .map(([date, d]) => ({
        date,
        newLeads: d.newLeads,
        calls: d.calls,
        leadsCalled: d.leadsCalledSet.size,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  const totalLeads = leadMap.size
  const totalCalls = sourceRows.reduce((sum, r) => sum + r.totalCalls, 0)
  const totalSources = sourceRows.length
  const avgCallsPerLead = totalLeads > 0
    ? parseFloat((totalCalls / totalLeads).toFixed(2))
    : 0
  const totalZeroCallLeads = sourceRows.reduce((sum, r) => sum + r.zeroCallLeads, 0)

  const kpi = {
    totalSources,
    totalLeads,
    totalCalls,
    avgCallsPerLead,
    totalZeroCallLeads,
    connectedLeadsPct: totalLeads > 0
      ? parseFloat((((totalLeads - totalZeroCallLeads) / totalLeads) * 100).toFixed(1))
      : 0,
  }

  const collectionCounts = {
    callQLeads: callQLeads.length,
    webhookLeads: webhookLeads.length,
    webhookOnlyLeads: webhookOnlyCount,
    uniqueLeads: totalLeads,
    callRecordingPhones: callsByPhone.length,
  }

  const dashboard = {
    channel: 'sourceStats',
    kpi,
    sourceRows,
    dailyActivity,
    collectionCounts,
    dateRange: hasDateFilter ? { startDate, endDate } : null,
    computedAt: new Date().toISOString(),
  }

  if (!hasDateFilter && mode !== 'range') {
    await cacheCol.updateOne(
      { _id: 'source_stats_latest' },
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
