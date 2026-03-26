import clientPromise from '../../../src/lib/mongodb'

const ITM_DB = 'itm'
const ITM_CRM_DB = 'itm-crm'
const CALLQ_DB = 'callQ'
const LEADS_COL = 'leads'
const WEBHOOK_COL = 'callerDtWebhookLogs'
const RECORDINGS_COL = 'callrecordings'
const CRM_SNAPSHOT_COL = 'crmSnapshotMarch23'
const CACHE_COL = 'source_stats_cache'

const DAY_BUCKET_COUNT = 8
const DAY_LABELS = ['Day 0', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7+']
const MS_PER_DAY = 86400000
const TOP_DAILY_SOURCES = 25
/** Daily dial target vs today’s new leads (spreadsheet heuristic: 3× today leads). */
const OWNER_TARGET_ATTEMPTS_MULTIPLIER = 3
const OWNER_IE_LOOKBACK_DAYS = 30

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

/** Inclusive IST calendar bounds for a YYYY-MM-DD string. */
function istIntervalForYmd(ymd) {
  return {
    start: new Date(Date.parse(`${ymd}T00:00:00+05:30`)),
    end: new Date(Date.parse(`${ymd}T23:59:59.999+05:30`)),
  }
}

/** Aggregation helper: coerce a field to Date or null. */
function exprToDate(path) {
  return {
    $switch: {
      branches: [
        { case: { $eq: [{ $type: path }, 'date'] }, then: path },
        {
          case: { $eq: [{ $type: path }, 'string'] },
          then: { $convert: { input: path, to: 'date', onError: null, onNull: null } },
        },
        {
          case: { $in: [{ $type: path }, ['long', 'int', 'double', 'decimal']] },
          then: { $toDate: path },
        },
      ],
      default: null,
    },
  }
}

/** First assignment-related timestamp on CallQ lead; falls back to created date. */
function leadAssignmentAtExpr() {
  return {
    $ifNull: [
      '$assignment_date',
      {
        $ifNull: [
          '$assignmentDate',
          {
            $ifNull: [
              '$Assignment_date',
              {
                $ifNull: [
                  '$first_owner_assigned_date',
                  {
                    $ifNull: [
                      '$firstOwnerAssignedDate',
                      {
                        $ifNull: [
                          '$owner_assigned_date',
                          {
                            $ifNull: [
                              '$Owner_assigned_date',
                              {
                                $ifNull: [
                                  '$assigned_at',
                                  {
                                    $ifNull: [
                                      '$Assigned_at',
                                      { $ifNull: ['$createdDate', '$createdAt'] },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}

/** Mongo expression: owner string from CallQ lead doc (common field names). */
function leadOwnerCoalesceExpr() {
  return {
    $let: {
      vars: {
        raw: {
          $ifNull: [
            '$owner',
            {
              $ifNull: [
                '$Owner',
                {
                  $ifNull: [
                    '$Lead_owner',
                    {
                      $ifNull: [
                        '$lead_owner',
                        {
                          $ifNull: [
                            '$assignedTo',
                            { $ifNull: ['$assigned_to', ''] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      in: {
        $cond: [
          { $or: [{ $eq: ['$$raw', null] }, { $eq: ['$$raw', ''] }] },
          'Unassigned',
          { $trim: { input: { $toString: '$$raw' } } },
        ],
      },
    },
  }
}

/** Mongo expression: owner on a callrecording row after body.data is normalized */
function recordingOwnerCoalesceExpr() {
  return {
    $let: {
      vars: {
        raw: {
          $ifNull: [
            '$body.data.call.agent_name',
            {
              $ifNull: [
                '$body.data.call.agentName',
                {
                  $ifNull: [
                    '$body.data.agent_name',
                    {
                      $ifNull: [
                        '$body.data.Lead_owner',
                        {
                          $ifNull: [
                            '$body.data.lead_owner',
                            {
                              $ifNull: [
                                '$body.data.call.Lead_owner',
                                {
                                  $ifNull: [
                                    '$body.data.call.agent_email',
                                    { $ifNull: ['$body.data.agent_email', ''] },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      in: {
        $cond: [
          { $or: [{ $eq: ['$$raw', null] }, { $eq: ['$$raw', ''] }] },
          'Unassigned',
          { $trim: { input: { $toString: '$$raw' } } },
        ],
      },
    },
  }
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
                  {
                    $ifNull: [
                      '$assignment.assignedAt',
                      {
                        $ifNull: [
                          '$first_owner_assigned_date',
                          {
                            $ifNull: [
                              '$firstOwnerAssignedDate',
                              {
                                $ifNull: [
                                  '$npfData.firstOwnerAssignedDate',
                                  {
                                    $ifNull: [
                                      '$_source.First Lead Owner Assigned Date',
                                      {
                                        $ifNull: [
                                          '$_source.Re-assigned On',
                                          { $ifNull: ['$createdDate', '$_source.Latest Registration Date'] },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}

/**
 * Per-owner snapshot: leads bucketed by assignment day (IST); attempt columns count
 * today’s callrecordings events (IST) where agent matches owner and callee is in that cohort’s phone set.
 */
async function computeOwnerActivityTable(crmDb, itmDb, preloadedLeadDocs = null) {
  const todayStr = istYmdToday()
  const yesterdayStr = shiftIstYmd(todayStr, -1)
  const dayBeforeStr = shiftIstYmd(todayStr, -2)
  const { start: todayStart, end: todayEnd } = istIntervalForYmd(todayStr)

  const lookbackStart = new Date()
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - OWNER_IE_LOOKBACK_DAYS)

  const leadsCol = crmDb.collection(LEADS_COL)
  const recordingsCol = itmDb.collection(RECORDINGS_COL)

  const leadDocsPromise =
    preloadedLeadDocs != null
      ? Promise.resolve(preloadedLeadDocs)
      : leadsCol.aggregate([{ $project: CRM_LEAD_REGISTRATION_PROJECT }]).toArray()

  const [leadDocs, recFacetArr] = await Promise.all([
    leadDocsPromise,

    /** Attempts: `itm.callrecordings` only — unwind `body.data`, derive phone + eventAtDate (IST), then facet today vs 30d I&E. */
    recordingsCol
      .aggregate([
        {
          $match: {
            $or: [
              { body: { $exists: true, $ne: null } },
              { phone_number: { $exists: true, $nin: [null, ''] } },
            ],
          },
        },
        {
          $addFields: {
            _dataItems: {
              $cond: [
                { $isArray: '$body.data' },
                '$body.data',
                {
                  $cond: [
                    { $eq: [{ $type: '$body.data' }, 'object'] },
                    ['$body.data'],
                    {
                      $cond: [
                        {
                          $gt: [
                            {
                              $strLenCP: {
                                $trim: {
                                  input: { $toString: { $ifNull: ['$phone_number', ''] } },
                                },
                              },
                            },
                            0,
                          ],
                        },
                        [{ call: { phone_number: '$phone_number' } }],
                        [],
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        { $unwind: '$_dataItems' },
        {
          $addFields: {
            'body.data': '$_dataItems',
          },
        },
        {
          $addFields: {
            _phoneRaw: {
              $trim: {
                input: {
                  $toString: {
                    $ifNull: [
                      '$body.data.call.phone_number',
                      {
                        $ifNull: [
                          '$body.data.phone_number',
                          {
                            $ifNull: [
                              '$body.data.call.customer_number',
                              {
                                $ifNull: [
                                  '$body.data.mobile',
                                  {
                                    $ifNull: [
                                      '$body.data.phone',
                                      {
                                        $ifNull: [
                                          '$phone_number',
                                          { $ifNull: ['$customer_phone', ''] },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
            eventAt: {
              $ifNull: [
                '$createdAt',
                {
                  $ifNull: [
                    '$created_at',
                    {
                      $ifNull: [
                        '$updatedAt',
                        {
                          $ifNull: [
                            '$body.data.call.start_time',
                            {
                              $ifNull: [
                                '$body.data.call.created_at',
                                {
                                  $ifNull: [
                                    '$body.data.timestamp',
                                    { $ifNull: ['$body.data.call.timestamp', '$timestamp'] },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          $addFields: {
            eventAtDate: exprToDate('$eventAt'),
          },
        },
        {
          $match: {
            _phoneRaw: { $nin: [null, '', 'null', 'undefined'] },
            eventAtDate: { $ne: null, $gte: lookbackStart },
          },
        },
        {
          $addFields: {
            ownerKey: recordingOwnerCoalesceExpr(),
            dispBlob: {
              $toLower: {
                $concat: [
                  { $ifNull: ['$body.data.call.disposition', ''] },
                  ' ',
                  { $ifNull: [{ $toString: '$body.data.disposition' }, ''] },
                  ' ',
                  { $ifNull: ['$body.data.Disposition.counselor', ''] },
                  ' ',
                  { $ifNull: [{ $toString: '$body.data.Disposition' }, ''] },
                ],
              },
            },
          },
        },
        {
          $addFields: {
            isIe: {
              $cond: [
                { $lte: [{ $strLenCP: { $trim: { input: '$dispBlob' } } }, 0] },
                false,
                {
                  $regexMatch: {
                    input: { $trim: { input: '$dispBlob' } },
                    regex:
                      'i\\s*&\\s*e|i\\s*/\\s*e|information|enquiry|i\\.e\\.|\\binquiry\\b',
                    options: 'i',
                  },
                },
              ],
            },
          },
        },
        {
          $facet: {
            todayTouches: [
              {
                $match: {
                  eventAtDate: { $gte: todayStart, $lte: todayEnd },
                },
              },
              {
                $project: {
                  _id: 0,
                  ownerKey: 1,
                  _phoneRaw: 1,
                  isIe: 1,
                },
              },
            ],
            totalIeByOwner: [
              {
                $group: {
                  _id: '$ownerKey',
                  ieAttempts: { $sum: { $cond: ['$isIe', 1, 0] } },
                },
              },
            ],
          },
        },
      ])
      .toArray(),
  ])

  const facetRow = recFacetArr[0] || { todayTouches: [], totalIeByOwner: [] }
  const todayTouches = facetRow.todayTouches || []
  const totalIeByOwner = facetRow.totalIeByOwner || []

  const normToDisplay = new Map()
  function registerOwner(raw) {
    const n = normOwnerKeyLabel(raw)
    if (n === 'unassigned') { normToDisplay.set(n, 'Unassigned'); return }
    const candidate = raw == null || raw === ''
      ? 'Unassigned'
      : String(raw).replace(/_/g, ' ').trim() || 'Unassigned'
    const existing = normToDisplay.get(n)
    // Prefer display label that contains an email (more specific), otherwise first seen wins
    if (!existing || (candidate.includes('@') && !existing.includes('@'))) {
      normToDisplay.set(n, candidate)
    }
  }

  const leadCountByNormOwnerDay = new Map()
  const leadPhonesByNormOwnerDay = new Map()

  for (const d of leadDocs) {
    registerOwner(d.ownerKeyRaw)
    const norm = normOwnerKeyLabel(d.ownerKeyRaw)
    const phone = normaliseMobile(d.phoneRaw)
    const assignedAt = parseDateFlexible(d.assignedAtRaw)
    const day = assignedAt ? toDateStrIst(assignedAt) : null
    if (!phone || !day) continue
    const k = `${norm}\t${day}`
    leadCountByNormOwnerDay.set(k, (leadCountByNormOwnerDay.get(k) || 0) + 1)
    if (!leadPhonesByNormOwnerDay.has(k)) leadPhonesByNormOwnerDay.set(k, new Set())
    leadPhonesByNormOwnerDay.get(k).add(phone)
  }

  const ieByNormOwner = new Map()
  for (const r of totalIeByOwner) {
    registerOwner(r._id)
    const norm = normOwnerKeyLabel(r._id)
    ieByNormOwner.set(norm, (ieByNormOwner.get(norm) || 0) + (r.ieAttempts || 0))
  }

  for (const t of todayTouches) registerOwner(t.ownerKey)

  const norms = new Set([
    ...[...leadCountByNormOwnerDay.keys()].map((k) => k.split('\t')[0]),
    ...ieByNormOwner.keys(),
    ...todayTouches.map((t) => normOwnerKeyLabel(t.ownerKey)),
  ])

  function countTodayTouchesIntoPhones(norm, phoneSet, requireIe) {
    if (!phoneSet || phoneSet.size === 0) return 0
    let n = 0
    for (const t of todayTouches) {
      if (normOwnerKeyLabel(t.ownerKey) !== norm) continue
      const p = normaliseMobile(t._phoneRaw)
      if (!p || !phoneSet.has(p)) continue
      if (requireIe && !t.isIe) continue
      n += 1
    }
    return n
  }

  const rows = [...norms]
    .filter((n) => n != null && n !== '')
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((norm) => {
      const ownerDisplay = normToDisplay.get(norm) || norm
      const todayLeads = leadCountByNormOwnerDay.get(`${norm}\t${todayStr}`) || 0
      const yesterdayLeads = leadCountByNormOwnerDay.get(`${norm}\t${yesterdayStr}`) || 0
      const dayBeforeLeads = leadCountByNormOwnerDay.get(`${norm}\t${dayBeforeStr}`) || 0

      const phonesToday = leadPhonesByNormOwnerDay.get(`${norm}\t${todayStr}`) || new Set()
      const phonesYest = leadPhonesByNormOwnerDay.get(`${norm}\t${yesterdayStr}`) || new Set()
      const phonesDb4 = leadPhonesByNormOwnerDay.get(`${norm}\t${dayBeforeStr}`) || new Set()

      const targetAttempts = todayLeads * OWNER_TARGET_ATTEMPTS_MULTIPLIER

      return {
        owner: ownerDisplay,
        ownerDisplay,
        todayLeads,
        targetAttempts,
        achievedAttempts: countTodayTouchesIntoPhones(norm, phonesToday, false),
        yesterdayLeads,
        yesterdayAttempts: countTodayTouchesIntoPhones(norm, phonesYest, false),
        dayBeforeYesterdayLeads: dayBeforeLeads,
        dayBeforeYesterdayAttempts: countTodayTouchesIntoPhones(norm, phonesDb4, false),
        totalIe: ieByNormOwner.get(norm) || 0,
        ieAttemptedToday: countTodayTouchesIntoPhones(norm, phonesToday, true),
      }
    })

  return {
    istDateLabels: { today: todayStr, yesterday: yesterdayStr, dayBeforeYesterday: dayBeforeStr },
    targetAttemptsMultiplier: OWNER_TARGET_ATTEMPTS_MULTIPLIER,
    ieLookbackDays: OWNER_IE_LOOKBACK_DAYS,
    note:
      'Leads: `itm-crm.leads` cohort day (IST) uses `npfData.latestRegDate` first (same notion as Compass range on that field), then `_source.User Registration Date` and other fallbacks. Today/Yesterday/Day-before attempt columns = today’s `callrecordings` dials (IST) by that agent to phones in the matching cohort. Target = Today leads × 3. Total I&E / I&E Attempted: disposition regex over the lookback window; I&E Attempted today is subset of today’s cohort dials.',
    rows,
  }
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
 * Owner / attempt grid from CRM snapshot phones (+ itm-crm lead overlay) + leadRegDates + callrecordings (IST days).
 */
async function computeOwnerAttemptRows(itmDb, leadRegDates, crmLeadDocs = [], ieCountByNormOwner = new Map()) {
  const todayIst = istYmdToday()
  const yesterdayIst = shiftIstYmd(todayIst, -1)
  const dayBeforeYesterdayIst = shiftIstYmd(todayIst, -2)
  const istSevenStart = shiftIstYmd(todayIst, -6)

  const crmCol = itmDb.collection(CRM_SNAPSHOT_COL)
  const crmDocs = await crmCol
    .find({})
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
   * Resilient phone extraction pipeline stage reused for both today + last-7 queries.
   * Handles body.data as array or single object, plus root phone_number fallback.
   */
  const phoneExtractionStages = [
    {
      $addFields: {
        _dataItems: {
          $cond: [
            { $isArray: '$body.data' },
            '$body.data',
            {
              $cond: [
                { $eq: [{ $type: '$body.data' }, 'object'] },
                ['$body.data'],
                {
                  $cond: [
                    { $gt: [{ $strLenCP: { $trim: { input: { $toString: { $ifNull: ['$phone_number', ''] } } } } }, 0] },
                    [{ call: { phone_number: '$phone_number' } }],
                    [],
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    { $unwind: '$_dataItems' },
    {
      $addFields: {
        _phoneRaw: {
          $trim: {
            input: {
              $toString: {
                $ifNull: [
                  '$_dataItems.call.phone_number',
                  {
                    $ifNull: [
                      '$_dataItems.phone_number',
                      {
                        $ifNull: [
                          '$_dataItems.call.customer_number',
                          {
                            $ifNull: [
                              '$_dataItems.mobile',
                              {
                                $ifNull: [
                                  '$_dataItems.phone',
                                  { $ifNull: ['$phone_number', { $ifNull: ['$customer_phone', ''] }] },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
    { $match: { _phoneRaw: { $nin: [null, '', 'null', 'undefined'] } } },
  ]

  /**
   * Fetch today's calls only from callrecordings, grouped by phone.
   * Also fetch last-7-day calls for ieAttempted.
   */
  const { start: todayCallStart, end: todayCallEnd } = istIntervalForYmd(todayIst)
  const last7Start = new Date(Date.parse(`${istSevenStart}T00:00:00+05:30`))
  const recordingsCol = itmDb.collection(RECORDINGS_COL)
  const [todayCallsByPhone, last7CallsByPhone] = await Promise.all([
    recordingsCol
      .aggregate([
        {
          $match: {
            $or: [{ body: { $exists: true, $ne: null } }, { phone_number: { $exists: true, $nin: [null, ''] } }],
            createdAt: { $gte: todayCallStart, $lte: todayCallEnd },
          },
        },
        ...phoneExtractionStages,
        // Deduplicate: one recording doc (_id) counts as one attempt per phone, even if body.data is an array
        { $group: { _id: { recordingId: '$_id', phone: '$_phoneRaw' } } },
        { $group: { _id: '$_id.phone', count: { $sum: 1 } } },
      ])
      .toArray(),

    recordingsCol
      .aggregate([
        {
          $match: {
            $or: [{ body: { $exists: true, $ne: null } }, { phone_number: { $exists: true, $nin: [null, ''] } }],
            createdAt: { $gte: last7Start },
          },
        },
        ...phoneExtractionStages,
        // Deduplicate per recording doc before checking last-7-days presence
        { $group: { _id: { recordingId: '$_id', phone: '$_phoneRaw' } } },
        { $group: { _id: '$_id.phone' } },
      ])
      .toArray(),
  ])

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

  return {
    rows,
    meta: {
      todayIst,
      yesterdayIst,
      dayBeforeYesterdayIst,
    },
  }
}

export async function computeSourceStats({ mode = 'cached', startDate, endDate } = {}) {
  const start = Date.now()
  const client = await clientPromise

  const itmDb = client.db(ITM_DB)
  const itmCrmDb = client.db(ITM_CRM_DB)
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

  const crmLeadDocs = await itmCrmDb
    .collection(LEADS_COL)
    .aggregate([{ $project: CRM_LEAD_REGISTRATION_PROJECT }])
    .toArray()

  const [callQLeads, webhookLeads, callsByPhone, ownerActivity] = await Promise.all([
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

    computeOwnerActivityTable(itmCrmDb, itmDb, crmLeadDocs),
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

  const ownerAttemptBundle = await computeOwnerAttemptRows(itmDb, leadRegDates, crmLeadDocs, ieCountByNormOwner)

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
  }

  const dashboard = {
    channel: 'sourceStats',
    kpi,
    sourceRows,
    dailyActivity,
    cohortMatrix,
    ownerActivity,
    ownerAttemptRows: ownerAttemptBundle.rows,
    ownerAttemptMeta: ownerAttemptBundle.meta,
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
