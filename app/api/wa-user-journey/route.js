/**
 * GET /api/wa-user-journey?workspace=&phone=
 * Phone: digits only (10+). Matches WA rows the same way as dashboards (variants on phone fields).
 * Returns { docs, formSubmission } for a simple chronological journey UI.
 */

import clientPromise from '../../../src/lib/mongodb'
import {
  buWorkspaceLabel,
  waWorkspaceConfig,
  normalizeWAWorkspace,
  WA_WORKSPACE_MBA,
} from '../../../src/lib/waWorkspace'
import { normaliseMobile, waPhoneVariantsForMatch } from '../../../src/lib/waPhoneMatch'
import {
  coerceRawTemplateToUtf8,
  isJunkTemplateLabel,
  resolveWaTemplateName,
  resolveWaTimelineDisplayName,
} from '../../../src/lib/waInteraktTemplate'

const APPS_COL = 'npfMbaApplications'
const MBA_LEADS_WEBHOOK_COL = 'npfLeadsWebhookEvents'
const MBA_APPS_WEBHOOK_COL = 'npfApplicationsWebhookEvents'

const APPLY_BTN_KEYWORDS = ['apply', 'enquire', 'enquiry', 'register', 'admission', 'submit', 'enroll', 'book', 'apply now']

function extractClickButtonLabel(doc) {
  const primary = doc.button_text
  if (primary != null && String(primary).trim() !== '' && String(primary).trim() !== '[]') {
    return String(primary).trim()
  }
  const nested = doc?.data?.message?.button_text
  if (nested != null && String(nested).trim() !== '') return String(nested).trim()
  if (doc.raw_payload) {
    try {
      const rp = typeof doc.raw_payload === 'string' ? JSON.parse(doc.raw_payload) : doc.raw_payload
      const b = rp?.data?.message?.button_text
      if (b) return String(b).trim()
    } catch {
      /* ignore */
    }
  }
  return ''
}

/** First chronological WhatsApp click whose button text looks like apply / enquiry (Interakt only). */
function findWaInferredApplyClick(docs) {
  let bestTs = Infinity
  let best = null
  for (const doc of docs || []) {
    const stage = (doc.stage || '').toLowerCase()
    const et = String(doc.event_type || doc.type || doc?.data?.type || '').toLowerCase()
    const isClick = stage === 'clicked' || et.includes('click') || et.includes('button')
    if (!isClick) continue
    const btn = extractClickButtonLabel(doc)
    if (!btn) continue
    const low = btn.toLowerCase()
    if (!APPLY_BTN_KEYWORDS.some((k) => low.includes(k))) continue
    const rawTs = doc.event_timestamp || doc.createdAt
    if (!rawTs) continue
    const tms = new Date(rawTs).getTime()
    if (Number.isNaN(tms)) continue
    if (tms < bestTs) {
      bestTs = tms
      const d = rawTs instanceof Date ? rawTs : new Date(rawTs)
      best = { at: d.toISOString(), buttonText: btn }
    }
  }
  return best
}

/** BSON Binary raw_template becomes UTF-8 JSON in the API response so the client can parse `name`. */
function materializeJourneyDoc(doc) {
  const rt = doc?.data?.message?.raw_template
  const decoded = coerceRawTemplateToUtf8(rt)
  if (decoded == null || typeof decoded !== 'string' || decoded === rt) return doc
  return {
    ...doc,
    data: {
      ...(doc.data || {}),
      message: {
        ...(doc.data?.message || {}),
        raw_template: decoded,
      },
    },
  }
}

function waPhoneMatchFilter(variants) {
  if (!variants || variants.length === 0) return { _id: { $exists: false } }
  return {
    $or: [
      { phone_number: { $in: variants } },
      { 'data.customer.phone_number': { $in: variants } },
      { 'data.customer.channel_phone_number': { $in: variants } },
    ],
  }
}

function toIso(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function isuSubmittedWhere(workspace, cfg) {
  const bu = buWorkspaceLabel(workspace)
  const db = cfg.isuAppsDb || ''
  const col = cfg.isuAppsCollection || ''
  return `${bu} application · NPF (${db}.${col})`
}

function mbaSubmittedWhere() {
  return 'MBA application · NPF (ITM_BS.npfMbaApplications)'
}

function mbaWebhookSubmittedWhere() {
  return 'MBA application · NPF webhooks (ITM_BS.npfLeadsWebhookEvents → npfApplicationsWebhookEvents)'
}

/** All matching ISU / IHM / IDM application rows for this phone, oldest first (for journey timeline). */
async function lookupIsuFormSubmissions(client, cfg, workspace, norm10) {
  if (!cfg.isuAppsCollection || !cfg.isuAppsDb || !norm10) return []
  const appsCol = client.db(cfg.isuAppsDb).collection(cfg.isuAppsCollection)
  const phoneField = cfg.isuAppsPhoneField || 'Mobile_Number'
  const variants = [...new Set([...waPhoneVariantsForMatch([norm10]), `+91-${norm10}`])]
  const submittedWhere = isuSubmittedWhere(workspace, cfg)

  const rows = await appsCol
    .aggregate([
      {
        $match: {
          [phoneField]: { $in: variants },
          $or: [
            { Application_Number_Auto_Generated: { $nin: [null, ''] } },
            { Application_Number: { $nin: [null, ''] } },
            { application_stage: { $nin: [null, ''] } },
            { Application_Stage: { $nin: [null, ''] } },
          ],
        },
      },
      {
        $addFields: {
          _sortAt: {
            $ifNull: [
              { $dateFromString: { dateString: '$Application_Completion_Date', onError: null, onNull: null } },
              { $dateFromString: { dateString: '$Updated_Date', onError: null, onNull: null } },
              '$createdAt',
            ],
          },
        },
      },
      { $match: { _sortAt: { $ne: null } } },
      { $sort: { _sortAt: 1 } },
      { $limit: 25 },
      {
        $project: {
          _sortAt: 1,
          appNo: { $ifNull: ['$Application_Number_Auto_Generated', '$Application_Number'] },
          leadId: { $ifNull: ['$Lead_ID', '$lead_id'] },
          applicationStage: { $ifNull: ['$application_stage', '$Application_Stage'] },
          courseLabel: {
            $ifNull: [
              '$Course_Applied',
              { $ifNull: ['$Program_Name', { $ifNull: ['$Course_Name', '$Program_Applied'] }] },
            ],
          },
        },
      },
    ])
    .toArray()

  return rows
    .map((row) => {
      const at = toIso(row._sortAt)
      if (!at) return null
      const course = row.courseLabel != null ? String(row.courseLabel).trim() : ''
      return {
        at,
        applicationNo: row.appNo ? String(row.appNo) : null,
        leadId: row.leadId != null ? String(row.leadId) : null,
        applicationStage: row.applicationStage != null ? String(row.applicationStage).trim() : null,
        courseLabel: course || null,
        submittedWhere,
      }
    })
    .filter(Boolean)
}

function mbaMobileMatchClause(norm10) {
  const mobileVariants = [
    ...new Set(waPhoneVariantsForMatch([norm10, `91${norm10}`, `+91-${norm10}`])),
  ]
  const or = [
    { 'personal_details.mobile_number': { $in: mobileVariants } },
    { 'personal_details.mobile': { $in: mobileVariants } },
  ]
  if (/^\d{10}$/.test(String(norm10))) {
    const n10 = String(norm10)
    const as10 = Number(n10)
    const as12 = Number(`91${n10}`)
    if (Number.isSafeInteger(as10)) {
      or.push({ 'personal_details.mobile_number': as10 })
      or.push({ 'personal_details.mobile': as10 })
    }
    if (Number.isSafeInteger(as12)) {
      or.push({ 'personal_details.mobile_number': as12 })
      or.push({ 'personal_details.mobile': as12 })
    }
  }
  return { $or: or }
}

/** All matching MBA application rows for this phone, oldest first. */
async function lookupMbaFormSubmissions(client, dataDb, norm10) {
  if (!norm10) return []
  const appsCol = client.db(dataDb).collection(APPS_COL)
  const submittedWhere = mbaSubmittedWhere()
  const phoneClause = mbaMobileMatchClause(norm10)
  const appProgressClause = {
    $or: [
      { 'application_detail.application_no': { $nin: [null, ''] } },
      { 'application_detail.application_number': { $nin: [null, ''] } },
      { application_stage: { $nin: [null, ''] } },
      { 'application_detail.stage': { $nin: [null, ''] } },
      { 'application_detail.application_status': { $nin: [null, ''] } },
    ],
  }

  const rows = await appsCol
    .aggregate([
      {
        $match: {
          $and: [phoneClause, appProgressClause],
        },
      },
      {
        $addFields: {
          _sortAt: { $ifNull: ['$createdAt', '$updatedAt'] },
        },
      },
      { $match: { _sortAt: { $ne: null } } },
      { $sort: { _sortAt: 1 } },
      { $limit: 25 },
      {
        $project: {
          _sortAt: 1,
          applicationNo: {
            $ifNull: ['$application_detail.application_no', '$application_detail.application_number'],
          },
          leadId: {
            $ifNull: ['$other_info.lead_id', { $ifNull: ['$npfData.lead_id', '$npfData.leadId'] }],
          },
          applicationStage: {
            $ifNull: ['$application_detail.stage', '$application_stage'],
          },
          programLabel: {
            $ifNull: [
              '$application_detail.program',
              { $ifNull: ['$application_detail.course', '$application_detail.specialization'] },
            ],
          },
        },
      },
    ])
    .toArray()

  return rows
    .map((row) => {
      const at = toIso(row._sortAt)
      if (!at) return null
      const prog = row.programLabel != null ? String(row.programLabel).trim() : ''
      const stage =
        row.applicationStage != null && String(row.applicationStage).trim() !== ''
          ? String(row.applicationStage).trim()
          : null
      return {
        at,
        applicationNo: row.applicationNo ? String(row.applicationNo) : null,
        leadId: row.leadId != null ? String(row.leadId) : null,
        applicationStage: stage,
        courseLabel: prog || null,
        submittedWhere,
      }
    })
    .filter(Boolean)
}

/** Phone match on NPF lead webhook rows (Registered_Mobile is the common MBA field). */
function mbaLeadWebhookPhoneClause(norm10) {
  const variants = [
    ...new Set([...waPhoneVariantsForMatch([norm10, `91${norm10}`]), `+91-${norm10}`]),
  ]
  const or = [
    { Registered_Mobile: { $in: variants } },
    { registered_mobile: { $in: variants } },
    { Mobile_Number: { $in: variants } },
  ]
  if (/^\d{10}$/.test(String(norm10))) {
    const n10 = String(norm10)
    const as10 = Number(n10)
    const as12 = Number(`91${n10}`)
    if (Number.isSafeInteger(as10)) {
      or.push({ Registered_Mobile: as10 })
      or.push({ Mobile_Number: as10 })
    }
    if (Number.isSafeInteger(as12)) {
      or.push({ Registered_Mobile: as12 })
      or.push({ Mobile_Number: as12 })
    }
  }
  return { $or: or }
}

function collectLeadIdVariantsFromDoc(doc) {
  const raw = doc?.Lead_ID ?? doc?.lead_id ?? doc?.Lead_id
  if (raw == null) return []
  const s = String(raw).trim()
  if (!s) return []
  const out = new Set([s])
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    if (Number.isSafeInteger(n)) out.add(n)
  }
  return [...out]
}

/** Lead_ID from npfLeadsWebhookEvents by mobile, then applications from npfApplicationsWebhookEvents (MBA). */
async function lookupMbaFormSubmissionsFromNpfWebhooks(client, dataDb, norm10) {
  if (!norm10) return []
  const leadsCol = client.db(dataDb).collection(MBA_LEADS_WEBHOOK_COL)
  const phoneClause = mbaLeadWebhookPhoneClause(norm10)
  const leadDocs = await leadsCol
    .find(
      {
        $and: [
          phoneClause,
          {
            $or: [
              { Lead_ID: { $nin: [null, ''] } },
              { lead_id: { $nin: [null, ''] } },
            ],
          },
        ],
      },
      { projection: { Lead_ID: 1, lead_id: 1, createdAt: 1 } },
    )
    .limit(500)
    .toArray()

  const leadIdSet = new Set()
  for (const d of leadDocs) {
    for (const v of collectLeadIdVariantsFromDoc(d)) leadIdSet.add(v)
  }
  const leadIds = [...leadIdSet]
  if (leadIds.length === 0) return []

  const appsCol = client.db(dataDb).collection(MBA_APPS_WEBHOOK_COL)
  const submittedWhere = mbaWebhookSubmittedWhere()

  const rows = await appsCol
    .aggregate([
      {
        $match: {
          $or: [{ Lead_ID: { $in: leadIds } }, { lead_id: { $in: leadIds } }],
        },
      },
      {
        $addFields: {
          _sortAt: {
            $ifNull: [
              { $dateFromString: { dateString: '$Application_Completion_Date', onError: null, onNull: null } },
              { $dateFromString: { dateString: '$Updated_Date', onError: null, onNull: null } },
              '$createdAt',
              '$updatedAt',
              { $toDate: '$_id' },
            ],
          },
        },
      },
      { $sort: { _sortAt: 1 } },
      { $limit: 25 },
      {
        $project: {
          _sortAt: 1,
          applicationNo: { $ifNull: ['$Application_Number_Auto_Generated', '$Application_Number'] },
          leadId: { $ifNull: ['$Lead_ID', '$lead_id'] },
          applicationStage: { $ifNull: ['$application_stage', '$Application_Stage'] },
          courseLabel: {
            $ifNull: [
              '$Course_Applied',
              { $ifNull: ['$Program_Name', { $ifNull: ['$Course_Name', '$Program_Applied'] }] },
            ],
          },
        },
      },
    ])
    .toArray()

  return rows
    .map((row) => {
      const at = toIso(row._sortAt)
      if (!at) return null
      const course = row.courseLabel != null ? String(row.courseLabel).trim() : ''
      const stage =
        row.applicationStage != null && String(row.applicationStage).trim() !== ''
          ? String(row.applicationStage).trim()
          : null
      return {
        at,
        applicationNo: row.applicationNo ? String(row.applicationNo) : null,
        leadId: row.leadId != null ? String(row.leadId) : null,
        applicationStage: stage,
        courseLabel: course || null,
        submittedWhere,
      }
    })
    .filter(Boolean)
}

/** Prefer one row per application number; otherwise keep distinct lead+time rows. */
function mergeMbaFormSubmissionLists(primary, secondary) {
  const byApp = new Map()
  const rest = []
  for (const row of [...primary, ...secondary]) {
    if (!row?.at) continue
    const appNo = row.applicationNo && String(row.applicationNo).trim()
    if (appNo) {
      const prev = byApp.get(appNo)
      if (!prev || new Date(row.at).getTime() >= new Date(prev.at).getTime()) byApp.set(appNo, row)
      continue
    }
    rest.push(row)
  }
  const dedupedRest = []
  const seenLeadAt = new Set()
  for (const row of rest) {
    const simple = `${row.leadId || ''}|${row.at}`
    if (seenLeadAt.has(simple)) continue
    seenLeadAt.add(simple)
    dedupedRest.push(row)
  }
  const merged = [...byApp.values(), ...dedupedRest]
  merged.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  return merged.slice(0, 25)
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspace = normalizeWAWorkspace(searchParams.get('workspace'))
    const rawPhone = String(searchParams.get('phone') || searchParams.get('phone_number') || '').replace(/\D/g, '')
    const norm = normaliseMobile(rawPhone)

    if (!norm || norm.length < 10) {
      return Response.json({ error: 'Enter a valid phone number (at least 10 digits).' }, { status: 400 })
    }

    const cfg = waWorkspaceConfig(workspace)
    const client = await clientPromise
    const waCol = client.db(cfg.dataDb).collection(cfg.waCollection)

    const variants = waPhoneVariantsForMatch([rawPhone, norm, norm.length === 10 ? `91${norm}` : norm].filter(Boolean))

    const docsRaw = await waCol.find(waPhoneMatchFilter(variants)).limit(50_000).toArray()
    const docs = docsRaw
      .map(materializeJourneyDoc)
      .sort((a, b) => {
        const ta = new Date(a.event_timestamp || a.createdAt || 0).getTime()
        const tb = new Date(b.event_timestamp || b.createdAt || 0).getTime()
        return ta - tb
      })

    const serialized = docs.map((doc) => {
      const resolved = resolveWaTemplateName(doc)
      const timeline = resolveWaTimelineDisplayName(doc)
      return {
        ...doc,
        _id: doc._id.toString(),
        resolvedTemplateName: isJunkTemplateLabel(resolved) ? '' : resolved,
        timelineLabel: isJunkTemplateLabel(timeline) ? '' : timeline,
      }
    })

    const waApplyClick = findWaInferredApplyClick(docs)

    const n10 = norm.length >= 10 ? norm.slice(-10) : norm

    let formSubmissions = []
    if (workspace === WA_WORKSPACE_MBA) {
      const fromMbaMongo = await lookupMbaFormSubmissions(client, cfg.dataDb, n10)
      const fromNpfWebhook = await lookupMbaFormSubmissionsFromNpfWebhooks(client, cfg.dataDb, n10)
      formSubmissions = mergeMbaFormSubmissionLists(fromMbaMongo, fromNpfWebhook)
    } else if (cfg.isuAppsCollection) {
      formSubmissions = await lookupIsuFormSubmissions(client, cfg, workspace, n10)
    }

    const formSubmission =
      formSubmissions.length > 0 ? formSubmissions[formSubmissions.length - 1] : null

    return Response.json({
      docs: serialized,
      formSubmissions,
      formSubmission,
      waApplyClick,
      total: serialized.length,
    })
  } catch (err) {
    console.error('[api/wa-user-journey]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
