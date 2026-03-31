import clientPromise from '../../../src/lib/mongodb'

const ITM_DB = 'itm'
const ITM_CRM_DB = 'itm-crm'
const CALLQ_DB = 'callQ'
const ANALYTICS_DB = 'analytics'
const LEADS_COL = 'leads'
const WEBHOOK_COL = 'callerDtWebhookLogs'
const RECORDINGS_COL = 'callrecordings'
const SMARTPING_COL = 'smartping_database'
const CRM_SNAPSHOT_COL = 'crmSnapshotMarch23'
const CACHE_COL = 'call_dashboard_cache'

const DAY_BUCKET_COUNT = 8
const DAY_LABELS = ['Day 0', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7+']
const MS_PER_DAY = 86400000
const TOP_DAILY_SOURCES = 25
/** Daily dial target vs today’s new leads (spreadsheet heuristic: 3× today leads). */
const OWNER_TARGET_ATTEMPTS_MULTIPLIER = 3
const OWNER_IE_LOOKBACK_DAYS = 30
/** Without an explicit date range, only load recent callrecordings (full scan + $unwind is very slow). */
const SOURCE_STATS_RECORDINGS_LOOKBACK_DAYS = 120

function istYmdToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function shiftIstYmd(ymd, deltaDays) {
  const t = Date.parse(`${ymd}T12:00:00+05:30`) + deltaDays * MS_PER_DAY
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function normOwnerKeyLabel(s) {
  if (s == null || s === '') return 'unassigned'
  return String(s)
    .trim()
    .replace(/\s*\([^)]*@[^)]*\)/g, '')  // strip "(email@domain.com)" suffixes
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    || 'unassigned'
}


const IE_STAGE_REGEX = /interested\s*[&and]+\s*eligible|i\s*[&\/]\s*e\b|^i&e$|^ie$/i

/** Shared CRM lead projection for registration cohort + owner activity (itm-crm.leads). */
const CRM_LEAD_REGISTRATION_PROJECT = {
  stageCurrent: { $ifNull: ['$stage.current', '$_source.Lead Stage'] },
  ownerKeyRaw: {
    $ifNull: [
      '$assignment.assignedToName',
      {
        $ifNull: [
          '$npfData.firstLeadOwner',
          {
            $ifNull: [
              '$_source.Lead Owner',
              { $ifNull: ['$_source.First Lead Owner', '$assignment.assignedTo'] },
            ],
          },
        ],
      },
    ],
  },
  phoneRaw: {
    $ifNull: [
      '$personal.phone',
      {
        $ifNull: [
          '$phone',
          {
            $ifNull: [
              '$npfData.phone',
              {
                $ifNull: ['$_source.Registered Mobile', '$_source.Alternate Mobile'],
              },
            ],
          },
        ],
      },
    ],
  },
  assignedAtRaw: {
    $ifNull: [
      '$npfData.latestRegDate',
      {
        $ifNull: [
          '$_source.User Registration Date',
          {
            $ifNull: [
              '$npfData.registrationAttemptDate',
              {
                $ifNull: [
                  '$createdAt',
                  { $ifNull: ['$createdDate', '$_source.Latest Registration Date'] },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}



function normaliseMobile(raw) {
  if (raw == null || raw === '') return ''
  const digits = String(raw).replace(/[^\d]/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length > 10) return digits.slice(-10)
  return ''
}

function parseDateFlexible(raw) {
  if (raw == null || raw === '') return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  if (typeof raw === 'number') {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  }

  const s = String(raw).trim().replace(/^`+/, '')
  if (!s) return null

  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM))?$/i,
  )
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2]) - 1
    const year = Number(m[3])
    let hour = Number(m[4] ?? 12)
    const minute = Number(m[5] ?? 0)
    const second = Number(m[6] ?? 0)
    const meridiem = (m[7] || 'AM').toUpperCase()

    if (meridiem === 'PM' && hour !== 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0

    const utcMs = Date.UTC(year, month, day, hour - 5, minute - 30, second)
    const d2 = new Date(utcMs)
    if (!isNaN(d2.getTime())) return d2
  }

  const d1 = new Date(s)
  if (!isNaN(d1.getTime())) return d1

  return null
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

/** Registration calendar day in Asia/Kolkata (matches IST day labels for owner attempt table). */
function toDateStrIst(d) {
  const t = d instanceof Date ? d : new Date(d)
  if (isNaN(t.getTime())) return ''
  return t.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function crmProjectOwnerFromDoc(doc) {
  const raw =
    doc.project_owner
    ?? doc.projectOwner
    ?? doc.owner
    ?? doc.Owner
    ?? doc.Lead_owner
    ?? doc.lead_owner
    ?? doc.assignedTo
    ?? doc.assigned_to
  if (raw == null || String(raw).trim() === '') return 'Unassigned'
  return String(raw).trim()
}

/**
 * Owner / attempt grid from CRM snapshot phones (+ itm-crm lead overlay) + leadRegDates + SmartPing calls (IST days).
 * @param {Array|null} crmSnapshotDocs - if provided, skip loading `crmSnapshotMarch23` (use parallel prefetch from caller).
 */
async function computeOwnerAttemptRows(client, itmDb, leadRegDates, crmLeadDocs = [], ieCountByNormOwner = new Map(), crmSnapshotDocs = null) {
  const todayIst = istYmdToday()
  const tomorrowIst = shiftIstYmd(todayIst, 1)
  const yesterdayIst = shiftIstYmd(todayIst, -1)
  const dayBeforeYesterdayIst = shiftIstYmd(todayIst, -2)
  const istSevenStart = shiftIstYmd(todayIst, -6)

  const crmCol = itmDb.collection(CRM_SNAPSHOT_COL)
  const crmDocs = crmSnapshotDocs != null
    ? crmSnapshotDocs
    : await crmCol
      .find({
        $or: [
          { mobile: { $exists: true, $nin: [null, '', 'NA'] } },
          { alternate_mobile: { $exists: true, $nin: [null, '', 'NA'] } },
        ],
      })
      .project({
        mobile: 1,
        alternate_mobile: 1,
        project_owner: 1,
        projectOwner: 1,
        owner: 1,
        Owner: 1,
        Lead_owner: 1,
        lead_owner: 1,
        assignedTo: 1,
        assigned_to: 1,
      })
      .toArray()

  /** normalised phone -> normalised owner key */
  const phoneToOwnerNorm = new Map()
  /** normalised owner key -> Set of distinct normalised phones from CRM */
  const ownerCrmPhones = new Map()
  /** normalised owner key -> best display label (prefer the one with email) */
  const ownerDisplayNames = new Map()

  function registerCrmOwner(rawLabel, phone) {
    const norm = normOwnerKeyLabel(rawLabel)
    if (!norm || norm === 'unassigned') return
    if (!phoneToOwnerNorm.has(phone)) phoneToOwnerNorm.set(phone, norm)
    if (!ownerCrmPhones.has(norm)) ownerCrmPhones.set(norm, new Set())
    ownerCrmPhones.get(norm).add(phone)
    const existing = ownerDisplayNames.get(norm)
    const candidate = String(rawLabel).replace(/_/g, ' ').trim()
    if (!existing || (candidate.includes('@') && !existing.includes('@'))) {
      ownerDisplayNames.set(norm, candidate)
    }
  }

  for (const doc of crmDocs) {
    const rawOwner = crmProjectOwnerFromDoc(doc)
    const seen = new Set()
    for (const raw of [doc.mobile, doc.alternate_mobile]) {
      const n = normaliseMobile(raw)
      if (!n || seen.has(n)) continue
      seen.add(n)
      registerCrmOwner(rawOwner, n)
    }
  }

  /** Phones present in `itm-crm.leads` but missing from snapshot still need an owner + pool row. */
  for (const d of crmLeadDocs) {
    const n = normaliseMobile(d.phoneRaw)
    if (!n) continue
    const rawOwner = d.ownerKeyRaw
    if (!rawOwner || String(rawOwner).trim() === '') continue
    registerCrmOwner(rawOwner, n)
  }

  const ownerLeadDayCounts = new Map()
  function ensureLeadCounts(normOwner) {
    if (!ownerLeadDayCounts.has(normOwner)) {
      ownerLeadDayCounts.set(normOwner, { today: 0, yesterday: 0, dbYest: 0 })
    }
    return ownerLeadDayCounts.get(normOwner)
  }

  for (const [mobile, regDate] of leadRegDates) {
    const normOwner = phoneToOwnerNorm.get(mobile)
    if (!normOwner) continue
    const ymd = toDateStrIst(regDate)
    if (!ymd) continue
    const c = ensureLeadCounts(normOwner)
    if (ymd === todayIst) c.today += 1
    if (ymd === yesterdayIst) c.yesterday += 1
    if (ymd === dayBeforeYesterdayIst) c.dbYest += 1
  }

  /**
   * Build per-owner cohort phone sets from leadRegDates:
   *   ownerDayPhones[normOwner][day] = Set of phones registered on that day (IST)
   * We only need today / yesterday / dayBefore cohorts.
   */
  const ownerCohortPhones = new Map() // normOwner -> { today: Set, yesterday: Set, dbYest: Set }
  for (const [phone, regDate] of leadRegDates) {
    const normOwner = phoneToOwnerNorm.get(phone)
    if (!normOwner) continue
    const ymd = toDateStrIst(regDate)
    if (!ymd) continue
    if (ymd !== todayIst && ymd !== yesterdayIst && ymd !== dayBeforeYesterdayIst) continue
    if (!ownerCohortPhones.has(normOwner)) {
      ownerCohortPhones.set(normOwner, { today: new Set(), yesterday: new Set(), dbYest: new Set() })
    }
    const c = ownerCohortPhones.get(normOwner)
    if (ymd === todayIst) c.today.add(phone)
    if (ymd === yesterdayIst) c.yesterday.add(phone)
    if (ymd === dayBeforeYesterdayIst) c.dbYest.add(phone)
  }

  /**
   * Fetch attempts from SmartPing (`analytics.smartping_database`).
   * Each doc = one call event with `customer_number`, `call_start_time` (IST string "YYYY-MM-DD HH:mm:ss").
   * Group by call_id to deduplicate (multiple events per call).
   */
  const smartpingCol = client.db(ANALYTICS_DB).collection(SMARTPING_COL)

  const [todayFacet, last7CallsByPhone] = await Promise.all([
    smartpingCol
      .aggregate([
        { $match: { call_start_time: { $gte: todayIst, $lt: tomorrowIst } } },
        {
          $facet: {
            todayCallsByPhone: [
              { $match: { customer_number: { $exists: true, $nin: [null, ''] } } },
              { $group: { _id: { callId: '$call_id', phone: '$customer_number' } } },
              { $group: { _id: '$_id.phone', count: { $sum: 1 } } },
            ],
            todayAgentPhonePairs: [
              {
                $match: {
                  customer_number: { $exists: true, $nin: [null, ''] },
                  agent_name: { $exists: true, $nin: [null, '', '{agent_name}'] },
                },
              },
              { $group: { _id: { phone: '$customer_number', agent: '$agent_name' } } },
            ],
            smartpingAgentStatsRaw: [
              { $match: { agent_name: { $exists: true, $nin: [null, '', '{agent_name}'] } } },
              { $group: { _id: { callId: '$call_id', agent: '$agent_name', event: '$event_name' } } },
              { $group: { _id: { agent: '$_id.agent', event: '$_id.event' }, count: { $sum: 1 } } },
            ],
          },
        },
      ])
      .toArray(),

    smartpingCol
      .aggregate([
        { $match: { customer_number: { $exists: true, $nin: [null, ''] }, call_start_time: { $gte: istSevenStart } } },
        { $group: { _id: { callId: '$call_id', phone: '$customer_number' } } },
        { $group: { _id: '$_id.phone' } },
      ])
      .toArray(),
  ])

  const facet0 = todayFacet[0] || {}
  const todayCallsByPhone = facet0.todayCallsByPhone || []
  const todayAgentPhonePairs = facet0.todayAgentPhonePairs || []
  const smartpingAgentStatsRaw = facet0.smartpingAgentStatsRaw || []

  /**
   * Build mappings to merge SmartPing agent names into existing CRM owner rows.
   * Strategy: match via CRM email prefix (e.g. "Iqra_k" → "iqrak" → matches "iqrak@itm.edu"
   * from "Iqra (iqrak@itm.edu)"), then fallback to unique first-name match.
   */
  const emailPrefixToNorm = new Map()
  const firstNameToNorms = new Map()
  for (const [norm, display] of ownerDisplayNames) {
    const emailMatch = String(display).match(/\(([^@]+)@/)
    if (emailMatch) emailPrefixToNorm.set(emailMatch[1].toLowerCase(), norm)
    const firstName = norm.split(' ')[0]
    if (firstName) {
      if (!firstNameToNorms.has(firstName)) firstNameToNorms.set(firstName, [])
      firstNameToNorms.get(firstName).push(norm)
    }
  }

  function resolveSmartpingAgent(rawAgent) {
    const spaced = String(rawAgent).replace(/_/g, ' ').trim()
    const directNorm = normOwnerKeyLabel(spaced)
    if (ownerDisplayNames.has(directNorm)) return directNorm

    const joined = spaced.replace(/\s+/g, '').toLowerCase()
    if (emailPrefixToNorm.has(joined)) return emailPrefixToNorm.get(joined)

    const parts = spaced.toLowerCase().split(/\s+/)
    if (parts.length >= 2) {
      const firstPlusInitials = parts[0] + parts.slice(1).map(p => p[0]).join('')
      if (emailPrefixToNorm.has(firstPlusInitials)) return emailPrefixToNorm.get(firstPlusInitials)
      const firstPlusLastInitial = parts[0] + parts[parts.length - 1][0]
      if (emailPrefixToNorm.has(firstPlusLastInitial)) return emailPrefixToNorm.get(firstPlusLastInitial)
    }

    const firstName = parts[0]
    const candidates = firstNameToNorms.get(firstName)
    if (candidates && candidates.length === 1) return candidates[0]

    return directNorm
  }

  const smartpingAttributedPhones = new Set()
  for (const pair of todayAgentPhonePairs) {
    const normPhone = normaliseMobile(pair._id.phone)
    if (!normPhone) continue
    if (phoneToOwnerNorm.has(normPhone)) continue
    const agentRaw = pair._id.agent
    if (!agentRaw || agentRaw === '{agent_name}') continue
    const normAgent = resolveSmartpingAgent(agentRaw)
    if (!normAgent || normAgent === 'unassigned') continue
    phoneToOwnerNorm.set(normPhone, normAgent)
    smartpingAttributedPhones.add(normPhone)
    if (!ownerCrmPhones.has(normAgent)) ownerCrmPhones.set(normAgent, new Set())
    ownerCrmPhones.get(normAgent).add(normPhone)
    const agentDisplay = String(agentRaw).replace(/_/g, ' ').trim()
    if (!ownerDisplayNames.has(normAgent)) ownerDisplayNames.set(normAgent, agentDisplay)
  }

  for (const [mobile, regDate] of leadRegDates) {
    if (!smartpingAttributedPhones.has(mobile)) continue
    const normOwner = phoneToOwnerNorm.get(mobile)
    if (!normOwner) continue
    const ymd = toDateStrIst(regDate)
    if (!ymd) continue

    const lc = ensureLeadCounts(normOwner)
    if (ymd === todayIst) lc.today += 1
    if (ymd === yesterdayIst) lc.yesterday += 1
    if (ymd === dayBeforeYesterdayIst) lc.dbYest += 1

    if (ymd !== todayIst && ymd !== yesterdayIst && ymd !== dayBeforeYesterdayIst) continue
    if (!ownerCohortPhones.has(normOwner)) {
      ownerCohortPhones.set(normOwner, { today: new Set(), yesterday: new Set(), dbYest: new Set() })
    }
    const cohort = ownerCohortPhones.get(normOwner)
    if (ymd === todayIst) cohort.today.add(mobile)
    if (ymd === yesterdayIst) cohort.yesterday.add(mobile)
    if (ymd === dayBeforeYesterdayIst) cohort.dbYest.add(mobile)
  }

  /** normPhone -> today's call count */
  const todayCallCount = new Map()
  for (const r of todayCallsByPhone) {
    const norm = normaliseMobile(r._id)
    if (norm) todayCallCount.set(norm, (todayCallCount.get(norm) || 0) + r.count)
  }

  /** normPhone -> had any call in last 7 IST days */
  const phoneHadCallLast7Ist = new Set()
  for (const r of last7CallsByPhone) {
    const norm = normaliseMobile(r._id)
    if (norm) phoneHadCallLast7Ist.add(norm)
  }

  const ownerNorms = new Set([
    ...ownerCrmPhones.keys(),
    ...ownerLeadDayCounts.keys(),
  ])

  const rows = [...ownerNorms]
    .filter((norm) => norm != null && norm !== 'unassigned' || ownerLeadDayCounts.has('unassigned'))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((norm) => {
      const displayLabel = ownerDisplayNames.get(norm) || norm
      const lc = ownerLeadDayCounts.get(norm) || { today: 0, yesterday: 0, dbYest: 0 }
      const cohorts = ownerCohortPhones.get(norm) || { today: new Set(), yesterday: new Set(), dbYest: new Set() }

      // Achieved = today's calls to today-registered phones of this owner
      let achievedAttempts = 0
      for (const phone of cohorts.today) {
        achievedAttempts += todayCallCount.get(phone) || 0
      }

      // Yesterday Attempts = today's calls to yesterday-registered phones of this owner
      let yesterdayAttempts = 0
      for (const phone of cohorts.yesterday) {
        yesterdayAttempts += todayCallCount.get(phone) || 0
      }

      // Day before yesterday Attempts = today's calls to day-before-registered phones of this owner
      let dayBeforeYesterdayAttempts = 0
      for (const phone of cohorts.dbYest) {
        dayBeforeYesterdayAttempts += todayCallCount.get(phone) || 0
      }

      // I&E Attempted = phones in owner's CRM pool that had any call in last 7 days
      const crmPhones = ownerCrmPhones.get(norm) || new Set()
      let ieAttempted = 0
      for (const phone of crmPhones) {
        if (phoneHadCallLast7Ist.has(phone)) ieAttempted += 1
      }

      const todayLeads = lc.today
      const targetAttempts = todayLeads > 0 ? todayLeads * OWNER_TARGET_ATTEMPTS_MULTIPLIER : 0
      const yesterdayTargetAttempts = lc.yesterday > 0 ? lc.yesterday * OWNER_TARGET_ATTEMPTS_MULTIPLIER : 0
      const dayBeforeYesterdayTargetAttempts = lc.dbYest > 0 ? lc.dbYest * OWNER_TARGET_ATTEMPTS_MULTIPLIER : 0

      return {
        owner: displayLabel,
        ownerDisplay: displayLabel,
        todayLeads,
        targetAttempts,
        achievedAttempts,
        yesterdayLeads: lc.yesterday,
        yesterdayTargetAttempts,
        yesterdayAttempts,
        dayBeforeYesterdayLeads: lc.dbYest,
        dayBeforeYesterdayTargetAttempts,
        dayBeforeYesterdayAttempts,
        totalIe: ieCountByNormOwner.get(norm) || 0,
        ieAttempted,
      }
    })
    .filter((r) =>
      r.todayLeads || r.achievedAttempts || r.yesterdayLeads || r.yesterdayAttempts ||
      r.dayBeforeYesterdayLeads || r.dayBeforeYesterdayAttempts || r.totalIe || r.ieAttempted
    )

  const spAgentMap = {}
  for (const r of smartpingAgentStatsRaw) {
    const agent = String(r._id.agent).replace(/_/g, ' ').trim()
    const event = r._id.event
    if (!spAgentMap[agent]) spAgentMap[agent] = { agent, totalCalls: 0, Ringing: 0, Answered: 0, Hangup: 0, 'User Call Hangup': 0, abandoned: 0, 'Abandoned on IVR': 0 }
    spAgentMap[agent][event] = (spAgentMap[agent][event] || 0) + r.count
  }
  for (const a of Object.values(spAgentMap)) {
    a.totalCalls = a.Ringing + a.Answered + a.Hangup + a['User Call Hangup'] + a.abandoned + a['Abandoned on IVR']
  }
  const smartpingCallStats = Object.values(spAgentMap).sort((a, b) => b.totalCalls - a.totalCalls)

  return {
    rows,
    meta: {
      todayIst,
      yesterdayIst,
      dayBeforeYesterdayIst,
    },
    smartpingCallStats,
  }
}

export async function computeSourceStats({ mode = 'cached', startDate, endDate } = {}) {
  const start = Date.now()
  const client = await clientPromise

  const itmDb = client.db(ITM_DB)
  const itmCrmDb = client.db(ITM_CRM_DB)
  const callQDb = client.db(CALLQ_DB)
  const analyticsDb = client.db(ANALYTICS_DB)
  const cacheCol = analyticsDb.collection(CACHE_COL)

  const hasDateFilter = Boolean(startDate || endDate)

  /**
   * Same idea as WA dashboard (`computeWADashboard`): default path reads `call_dashboard_cache`
   * so the UI stays fast (~ms). Only `mode: 'full'` (or `range` / date filters) bypasses cache.
   * `fresh` is treated like `cached` — older UI used `fresh` for “reload” but that skipped cache and
   * forced a 60–120s compute; WA never does that on routine refresh.
   */
  const readFromCache = !hasDateFilter && (mode === 'cached' || mode === 'fresh')
  if (readFromCache) {
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
  } else {
    const lookbackCutoff = new Date(Date.now() - SOURCE_STATS_RECORDINGS_LOOKBACK_DAYS * MS_PER_DAY)
    recordingsDateFilter.createdAt = { $gte: lookbackCutoff }
  }

  const crmSnapshotQuery = itmDb.collection(CRM_SNAPSHOT_COL).find({
    $or: [
      { mobile: { $exists: true, $nin: [null, '', 'NA'] } },
      { alternate_mobile: { $exists: true, $nin: [null, '', 'NA'] } },
    ],
  }).project({
    mobile: 1,
    alternate_mobile: 1,
    project_owner: 1,
    projectOwner: 1,
    owner: 1,
    Owner: 1,
    Lead_owner: 1,
    lead_owner: 1,
    assignedTo: 1,
    assigned_to: 1,
  })

  // Match `createdAt` first so Mongo can use { createdAt: 1 } index before $unwind (WA-style: tight $match then group).
  const recordingsAgg = itmDb.collection(RECORDINGS_COL).aggregate(
    [
      { $match: { ...recordingsDateFilter } },
      { $match: { 'body.data.call.phone_number': { $exists: true } } },
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
    ],
    { allowDiskUse: true },
  )

  const crmLeadsAgg = itmCrmDb
    .collection(LEADS_COL)
    .aggregate([{ $project: CRM_LEAD_REGISTRATION_PROJECT }], { allowDiskUse: true })

  const [crmLeadDocs, callQLeads, webhookLeads, callsByPhone, crmSnapshotDocs] = await Promise.all([
    crmLeadsAgg.toArray(),

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

    recordingsAgg.toArray(),

    crmSnapshotQuery.toArray(),
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

  /** CRM `User Registration Date` (IST) wins over CallQ/webhook for owner-attempt lead-day counts.
   *  Also build per-owner I&E lead count (stage.current = "Interested & Eligible"). */
  const ieCountByNormOwner = new Map()
  for (const d of crmLeadDocs) {
    const norm = normaliseMobile(d.phoneRaw)
    const regDate = parseDateFlexible(d.assignedAtRaw)
    if (norm && regDate) leadRegDates.set(norm, regDate)

    const ownerNorm = normOwnerKeyLabel(d.ownerKeyRaw)
    if (ownerNorm && IE_STAGE_REGEX.test(String(d.stageCurrent || '').trim())) {
      ieCountByNormOwner.set(ownerNorm, (ieCountByNormOwner.get(ownerNorm) || 0) + 1)
    }
  }

  const ownerAttemptBundle = await computeOwnerAttemptRows(client, itmDb, leadRegDates, crmLeadDocs, ieCountByNormOwner, crmSnapshotDocs)

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

  const cohortDays = 7
  const cohortCutoff = new Date()
  cohortCutoff.setDate(cohortCutoff.getDate() - cohortDays)
  const cohortCutoffStr = toDateStr(cohortCutoff)
  const OLDER_KEY = '_older'

  const cohortMatrix = {}
  for (const srcKey of topSourceKeys) {
    const display = sourceDisplayNames[srcKey]
    const matrix = {}
    const regDateLeads = {}
    let olderLeadCount = 0

    for (const [mobile, src] of leadMap) {
      if (src !== srcKey) continue
      const regDate = leadRegDates.get(mobile)
      if (!regDate) continue
      const regStr = toDateStr(regDate)
      const isRecent = regStr >= cohortCutoffStr
      const rowKey = isRecent ? regStr : OLDER_KEY

      if (isRecent) {
        regDateLeads[regStr] = (regDateLeads[regStr] || 0) + 1
      } else {
        olderLeadCount++
      }

      const callData = callMap.get(mobile)
      if (!callData) continue
      if (!matrix[rowKey]) matrix[rowKey] = {}
      for (const { day, count } of callData.dailyCalls) {
        if (day < cohortCutoffStr) continue
        if (!matrix[rowKey][day]) matrix[rowKey][day] = { calls: 0, leads: new Set() }
        matrix[rowKey][day].calls += count
        matrix[rowKey][day].leads.add(mobile)
      }
    }

    if (olderLeadCount > 0) {
      regDateLeads[OLDER_KEY] = olderLeadCount
    }

    const cells = []
    for (const [regDate, callDays] of Object.entries(matrix)) {
      for (const [callDate, data] of Object.entries(callDays)) {
        cells.push({ regDate, callDate, calls: data.calls, leadsContacted: data.leads.size })
      }
    }
    if (cells.length > 0 || Object.keys(regDateLeads).length > 0) {
      cohortMatrix[display] = { cells, regDateLeads }
    }
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
    recordingsLookbackDays: hasDateFilter ? null : SOURCE_STATS_RECORDINGS_LOOKBACK_DAYS,
  }

  const smartpingCallStats = ownerAttemptBundle.smartpingCallStats

  const dashboard = {
    channel: 'sourceStats',
    kpi,
    sourceRows,
    dailyActivity,
    cohortMatrix,
    ownerAttemptRows: ownerAttemptBundle.rows,
    ownerAttemptMeta: ownerAttemptBundle.meta,
    smartpingCallStats,
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
