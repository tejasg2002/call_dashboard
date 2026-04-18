import clientPromise from '../../../src/lib/mongodb'
import { isOnOrAfter, parseOptDate } from '../../../src/lib/conversionAttribution'
import {
  WA_DASHBOARD_CACHE_ID_MBA_LEGACY,
  waWorkspaceConfig,
  workspacePayloadMatchesExpected,
} from '../../../src/lib/waWorkspace'

const ITM_DB = 'itm'
const APPS_COL = 'npfMbaApplications'
const CRM_SNAPSHOT_COL = 'crmSnapshotMarch23'
/** Cached snapshots in itm.wa_dashboard_cache — MBA + one doc per entry in ANALYTICS_WA_DEFINITIONS (see waWorkspace.js). */
const CACHE_COL = 'wa_dashboard_cache'

const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

const IHM_PAYMENT_STATUS_HINTS = ['complete', 'success', 'paid', 'captured', 'successful']

function ihmWebhookStatusLower(doc) {
  return String(doc.paymentStatus ?? doc.status ?? doc.payment_status ?? doc.eventType ?? doc.event_type ?? '').toLowerCase()
}

function ihmWebhookIsCompleted(doc) {
  const s = ihmWebhookStatusLower(doc)
  if (!s) return false
  return IHM_PAYMENT_STATUS_HINTS.some((h) => s.includes(h))
}

function ihmWebhookMobileRaw(doc) {
  if (!doc || typeof doc !== 'object') return ''
  return (
    doc.mobile_number ??
    doc.mobile ??
    doc.phone_number ??
    doc.phone ??
    doc.mobileno ??
    doc?.personal_details?.mobile_number ??
    doc?.personal_details?.mobile ??
    doc?.data?.mobile ??
    ''
  )
}

function ihmWebhookPaidAt(doc) {
  return parseOptDate(
    doc.event_timestamp ??
      doc.payment_completed_at ??
      doc.paid_at ??
      doc.paidAt ??
      doc.createdAt ??
      doc.updatedAt ??
      doc.timestamp,
  )
}

function ihmWebhookLeadId(doc) {
  const v = doc.lead_id ?? doc.leadId ?? doc.leadID ?? doc.npf_lead_id ?? doc?.data?.lead_id
  if (v == null || v === '') return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * IHM: clicked users with a completed payment in itm.npfPaymentWebhookEvents after first outbound
 * and on/after last WA click (same ordering rules as MBA form conversion).
 */
async function buildIhmPaymentConversion({
  client,
  clickedPhones,
  clickedPhoneDedup,
  normalisedClickedMobiles,
  waCol,
}) {
  const itmDb = client.db(ITM_DB)
  const ihmCol = itmDb.collection('npfPaymentWebhookEvents')

  const firstOutboundResult = clickedPhoneDedup.length > 0
    ? await waCol
        .aggregate([
          {
            $match: {
              phone_number: { $in: clickedPhoneDedup },
              stage: { $in: ['sent', 'delivered'] },
            },
          },
          {
            $group: {
              _id: '$phone_number',
              firstOutbound: { $min: '$event_timestamp' },
            },
          },
        ])
        .toArray()
    : []

  const firstOutboundByNorm = new Map()
  for (const row of firstOutboundResult) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const anchor = parseOptDate(row.firstOutbound)
    if (!anchor) continue
    const prev = firstOutboundByNorm.get(norm)
    if (!prev || anchor.getTime() < prev.getTime()) firstOutboundByNorm.set(norm, anchor)
  }

  const lastClickResult = clickedPhoneDedup.length > 0
    ? await waCol
        .aggregate([
          { $match: { phone_number: { $in: clickedPhoneDedup }, stage: 'clicked' } },
          {
            $addFields: {
              _clickAt: { $ifNull: ['$click_timestamp', '$event_timestamp'] },
            },
          },
          {
            $group: {
              _id: '$phone_number',
              lastClickAt: { $max: '$_clickAt' },
            },
          },
        ])
        .toArray()
    : []

  const lastClickByNorm = new Map()
  for (const row of lastClickResult) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const t = parseOptDate(row.lastClickAt)
    if (!t) continue
    const prev = lastClickByNorm.get(norm)
    if (!prev || t.getTime() > prev.getTime()) lastClickByNorm.set(norm, t)
  }

  const phoneVariantSet = new Set()
  for (const raw of clickedPhoneDedup) {
    const n = normaliseMobile(raw)
    if (!n) continue
    phoneVariantSet.add(n)
    if (n.length === 10) phoneVariantSet.add(`91${n}`)
  }
  const variants = [...phoneVariantSet]

  const completedByNorm = new Map()
  const MOBILE_KEYS = ['mobile_number', 'mobile', 'phone_number', 'phone']
  const CHUNK = 400
  for (let i = 0; i < variants.length; i += CHUNK) {
    const chunk = variants.slice(i, i + CHUNK)
    const orConds = MOBILE_KEYS.map((k) => ({ [k]: { $in: chunk } }))
    const chunkDocs = await ihmCol.find({ $or: orConds }).maxTimeMS(120000).toArray()
    for (const doc of chunkDocs) {
      if (!ihmWebhookIsCompleted(doc)) continue
      const norm = normaliseMobile(ihmWebhookMobileRaw(doc))
      if (!norm) continue
      const paidAt = ihmWebhookPaidAt(doc)
      if (!paidAt) continue
      const prev = completedByNorm.get(norm)
      const lead = ihmWebhookLeadId(doc)
      if (!prev || paidAt.getTime() > prev.paidAt.getTime()) {
        completedByNorm.set(norm, {
          paidAt,
          leadId: lead || prev?.leadId || null,
        })
      }
    }
  }

  const normToRawPhone = new Map()
  for (const raw of clickedPhones) {
    const n = normaliseMobile(raw)
    if (!n || normToRawPhone.has(n)) continue
    normToRawPhone.set(n, raw)
  }

  const ihmRows = []
  for (const norm of normalisedClickedMobiles) {
    const pay = completedByNorm.get(norm)
    if (!pay) continue
    const outboundAnchor = firstOutboundByNorm.get(norm)
    const lastClick = lastClickByNorm.get(norm)
    if (!outboundAnchor || !lastClick) continue
    if (!isOnOrAfter(pay.paidAt, outboundAnchor)) continue
    if (!isOnOrAfter(pay.paidAt, lastClick)) continue
    ihmRows.push({
      norm,
      mobile: normToRawPhone.get(norm) || norm,
      paidAt: pay.paidAt,
      leadId: pay.leadId,
    })
  }

  const formSubmittedMobiles = ihmRows.map((r) => r.mobile)
  const convertedMobiles = [...new Set(formSubmittedMobiles)]

  const clickAttrResult = convertedMobiles.length > 0
    ? await waCol
        .aggregate([
          { $match: { stage: 'clicked', phone_number: { $in: convertedMobiles } } },
          {
            $group: {
              _id: '$phone_number',
              templates: { $addToSet: '$template_name' },
              buttons: { $addToSet: '$button_text' },
            },
          },
        ])
        .toArray()
    : []

  const clickAttrMap = new Map()
  for (const r of clickAttrResult) {
    clickAttrMap.set(normaliseMobile(r._id), {
      templates: (r.templates || []).filter(Boolean),
      buttons: (r.buttons || []).filter(Boolean),
    })
  }

  const clickBreakdownResult =
    convertedMobiles.length > 0
      ? await waCol
          .aggregate([
            { $match: { stage: 'clicked', phone_number: { $in: convertedMobiles } } },
            { $sort: { event_timestamp: 1 } },
            {
              $group: {
                _id: '$phone_number',
                events: {
                  $push: {
                    template: '$template_name',
                    button: '$button_text',
                    clickAt: { $ifNull: ['$click_timestamp', '$event_timestamp'] },
                  },
                },
              },
            },
          ])
          .toArray()
      : []

  const MAX_TIMELINE_EVENTS = 40
  const clickTimelineByNorm = new Map()
  for (const row of clickBreakdownResult) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const rawEvents = row.events || []
    const slice = rawEvents.length > MAX_TIMELINE_EVENTS ? rawEvents.slice(-MAX_TIMELINE_EVENTS) : rawEvents
    const events = slice.map((e) => {
      const dt = parseOptDate(e.clickAt)
      return {
        template: e.template || '',
        button: e.button || '',
        clickAtIso: dt ? dt.toISOString() : null,
        clickAtDisplay: dt
          ? dt.toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            })
          : '—',
      }
    })
    clickTimelineByNorm.set(norm, events)
  }

  const formMetaByNorm = new Map()
  for (const row of ihmRows) {
    const dt = row.paidAt
    formMetaByNorm.set(row.norm, {
      formSubmittedAtIso: dt ? dt.toISOString() : null,
      formSubmittedAtDisplay: dt
        ? dt.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })
        : '—',
      leadIdFromNpf: row.leadId,
    })
  }

  const n = ihmRows.length
  const rate = clickedPhones.length > 0 ? parseFloat(((n / clickedPhones.length) * 100).toFixed(2)) : 0

  return {
    conversionKind: 'ihm_payment_webhook',
    totalClicked: clickedPhones.length,
    formSubmitted: n,
    conversionRate: rate,
    formSubmittedMobiles,
    formSubmittedDetails: formSubmittedMobiles.map((m) => {
      const norm = normaliseMobile(m)
      const attr = clickAttrMap.get(norm)
      const meta = formMetaByNorm.get(norm)
      return {
        mobile: m,
        leadId: meta?.leadIdFromNpf || null,
        formSubmittedAtIso: meta?.formSubmittedAtIso ?? null,
        formSubmittedAtDisplay: meta?.formSubmittedAtDisplay ?? '—',
        clickedTemplates: attr?.templates || [],
        clickedButtons: attr?.buttons || [],
        clickTimeline: clickTimelineByNorm.get(norm) || [],
      }
    }),
  }
}

export async function computeWADashboard({ mode = 'cached', startDate, endDate, workspace } = {}) {
  const start = Date.now()
  const cfg = waWorkspaceConfig(workspace)

  const client = await clientPromise
  const db = client.db(ITM_DB)
  const cacheCol = db.collection(CACHE_COL)

  if (mode === 'cached' && !startDate && !endDate) {
    let cached = await cacheCol.findOne({ _id: cfg.cacheKey })
    if (!cached && cfg.includeMbaConversion) {
      cached = await cacheCol.findOne({ _id: WA_DASHBOARD_CACHE_ID_MBA_LEGACY })
    }
    if (cached && workspacePayloadMatchesExpected(cached, cfg.workspace)) {
      return { ...cached, _id: undefined, fromCache: true, elapsed: Date.now() - start }
    }
  }

  const waDb = client.db(cfg.dataDb)
  const waCol = waDb.collection(cfg.waCollection)

  const matchFilter = {}
  if (startDate || endDate) {
    matchFilter.event_timestamp = {}
    if (startDate) matchFilter.event_timestamp.$gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setDate(end.getDate() + 1)
      matchFilter.event_timestamp.$lt = end
    }
  }

  const [
    kpiResult, templateResult, ctaResult,
    clickedPhonesResult, totalDocs,
    templateBtnResult, failureResult,
  ] = await Promise.all([
    waCol.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          sent: { $sum: { $cond: [{ $eq: ['$stage', 'sent'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$stage', 'delivered'] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$stage', 'read'] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $eq: ['$stage', 'clicked'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$stage', 'failed'] }, 1, 0] } },
          cost: { $sum: { $ifNull: ['$cost', 0] } },
        },
      },
    ]).toArray(),

    waCol.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { template_name: '$template_name', source: '$source' },
          sent: { $sum: { $cond: [{ $eq: ['$stage', 'sent'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$stage', 'delivered'] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$stage', 'read'] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $eq: ['$stage', 'clicked'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$stage', 'failed'] }, 1, 0] } },
          cost: { $sum: { $ifNull: ['$cost', 0] } },
          category: { $first: '$template_category' },
          firstSeen: { $min: '$event_timestamp' },
          lastSeen: { $max: '$event_timestamp' },
        },
      },
      { $sort: { clicked: -1 } },
    ]).toArray(),

    waCol.aggregate([
      { $match: { ...matchFilter, stage: 'clicked', button_text: { $nin: [null, ''] } } },
      {
        $group: {
          _id: { button_text: '$button_text', source: '$source' },
          total_clicks: { $sum: 1 },
          unique_users: { $addToSet: '$phone_number' },
          templates: { $addToSet: '$template_name' },
        },
      },
      { $sort: { total_clicks: -1 } },
    ]).toArray(),

    waCol.aggregate([
      { $match: { ...matchFilter, stage: 'clicked' } },
      { $group: { _id: '$phone_number' } },
    ]).toArray(),

    Object.keys(matchFilter).length === 0
      ? waCol.estimatedDocumentCount()
      : waCol.countDocuments(matchFilter),

    waCol.aggregate([
      { $match: { ...matchFilter, stage: 'clicked' } },
      {
        $addFields: {
          _btn: {
            $cond: [
              { $and: [{ $ne: ['$button_text', null] }, { $ne: ['$button_text', ''] }] },
              '$button_text',
              '(Other clicks)',
            ],
          },
        },
      },
      {
        $group: {
          _id: { template_name: '$template_name', button_text: '$_btn' },
          total_clicks: { $sum: 1 },
          unique_users: { $addToSet: '$phone_number' },
        },
      },
      { $sort: { total_clicks: -1 } },
    ]).toArray(),

    waCol.aggregate([
      { $match: { ...matchFilter, stage: 'failed', failure_reason: { $nin: [null, ''] } } },
      {
        $group: {
          _id: { template_name: '$template_name', failure_reason: '$failure_reason' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]).toArray(),
  ])

  const rawKpi = kpiResult[0] || { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0 }
  delete rawKpi._id
  rawKpi.ctr = pct(rawKpi.clicked, rawKpi.delivered)
  rawKpi.readRate = pct(rawKpi.read, rawKpi.delivered)
  rawKpi.sdr = pct(rawKpi.delivered, rawKpi.sent)
  rawKpi.str = pct(rawKpi.read, rawKpi.sent)

  const tplBtnMap = {}
  for (const r of templateBtnResult) {
    const tpl = r._id.template_name
    if (!tplBtnMap[tpl]) tplBtnMap[tpl] = []
    tplBtnMap[tpl].push({
      button_text: r._id.button_text,
      total_clicks: r.total_clicks,
      unique_users: r.unique_users?.length || 0,
    })
  }

  const tplFailMap = {}
  for (const r of failureResult) {
    const tpl = r._id.template_name
    if (!tplFailMap[tpl]) tplFailMap[tpl] = []
    tplFailMap[tpl].push({ reason: r._id.failure_reason, count: r.count })
  }

  const templateRows = templateResult
    .filter((r) => r._id.template_name)
    .map((r) => ({
      template_name: r._id.template_name,
      source: r._id.source || 'api',
      sent: r.sent,
      delivered: r.delivered,
      read: r.read,
      clicked: r.clicked,
      failed: r.failed,
      total_cost: r.cost,
      category: r.category || '—',
      ctr: pct(r.clicked, r.delivered),
      readRate: pct(r.read, r.delivered),
      sdr: pct(r.delivered, r.sent),
      str: pct(r.read, r.sent),
      firstSeen: r.firstSeen ? new Date(r.firstSeen).toISOString() : null,
      lastSeen: r.lastSeen ? new Date(r.lastSeen).toISOString() : null,
      failureReasons: tplFailMap[r._id.template_name] || [],
      templateBtnStats: tplBtnMap[r._id.template_name] || [],
    }))

  const ctaRows = ctaResult.map((r) => ({
    button_text: r._id.button_text,
    source: r._id.source || 'api',
    total_clicks: r.total_clicks,
    unique_users: r.unique_users?.length || 0,
    template_used: (r.templates || []).filter(Boolean).join(', ') || '—',
    links: [],
    click_types: '',
  }))

  const funnel = {
    sent: rawKpi.sent,
    delivered: rawKpi.delivered,
    read: rawKpi.read,
    clicked: rawKpi.clicked,
  }

  const costPerClick = rawKpi.clicked > 0 ? rawKpi.cost / rawKpi.clicked : 0
  const totalCost = rawKpi.cost

  const clickedPhones = clickedPhonesResult.map((r) => String(r._id)).filter(Boolean)
  const normalisedClickedMobiles = [...new Set(clickedPhones.map(normaliseMobile).filter(Boolean))]
  const clickedPhoneDedup = [...new Set(clickedPhones.filter(Boolean))]

  const engagementSummary = {
    total: clickedPhones.length,
    clickedCount: clickedPhones.length,
  }

  const buttonPhones = {}
  for (const r of ctaResult) {
    if (r._id.button_text) {
      buttonPhones[r._id.button_text] = r.unique_users || []
    }
  }

  let templatePhones = {}
  let clickBreakdown = []
  let formSubmittedCount = 0
  let paymentConversion

  if (!cfg.includeMbaConversion) {
    const templatePhoneResultIhm = await waCol.aggregate([
      { $match: { ...matchFilter, stage: 'clicked', template_name: { $nin: [null, ''] } } },
      { $group: { _id: '$template_name', phones: { $addToSet: '$phone_number' } } },
    ]).toArray()

    for (const r of templatePhoneResultIhm) {
      if (r._id) templatePhones[r._id] = r.phones || []
    }

    const clickBreakdownResultIhm = await waCol.aggregate([
      { $match: { ...matchFilter, stage: 'clicked' } },
      { $sort: { event_timestamp: -1 } },
      {
        $group: {
          _id: '$phone_number',
          clicks: {
            $push: {
              template: '$template_name',
              button: '$button_text',
              link: '$button_link',
              type: '$click_type',
              time: '$click_timestamp',
            },
          },
        },
      },
    ]).toArray()

    clickBreakdown = clickBreakdownResultIhm
      .filter((r) => r._id)
      .map((r) => ({
        phone: r._id,
        leadId: null,
        totalClicks: r.clicks.length,
        clicks: r.clicks.slice(0, 20),
      }))
      .sort((a, b) => b.totalClicks - a.totalClicks)

    if (cfg.ihmPaymentWebhookCollection) {
      paymentConversion = await buildIhmPaymentConversion({
        client,
        clickedPhones,
        clickedPhoneDedup,
        normalisedClickedMobiles,
        waCol,
      })
      formSubmittedCount = paymentConversion.formSubmitted
    } else {
      paymentConversion = {
        totalClicked: clickedPhones.length,
        formSubmitted: 0,
        conversionRate: 0,
        formSubmittedMobiles: [],
        formSubmittedDetails: [],
      }
    }
  } else {
  /** Earliest outbound (sent/delivered) per normalised mobile — full history, not date-filtered */
  const firstOutboundResult = clickedPhoneDedup.length > 0
    ? await waCol.aggregate([
        {
          $match: {
            phone_number: { $in: clickedPhoneDedup },
            stage: { $in: ['sent', 'delivered'] },
          },
        },
        {
          $group: {
            _id: '$phone_number',
            firstOutbound: { $min: '$event_timestamp' },
          },
        },
      ]).toArray()
    : []

  const firstOutboundByNorm = new Map()
  for (const row of firstOutboundResult) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const anchor = parseOptDate(row.firstOutbound)
    if (!anchor) continue
    const prev = firstOutboundByNorm.get(norm)
    if (!prev || anchor.getTime() < prev.getTime()) firstOutboundByNorm.set(norm, anchor)
  }

  /** Latest WA click per phone (full history, not date-filtered) — form must be on/after this so post-form clicks do not count. */
  const lastClickResult = clickedPhoneDedup.length > 0
    ? await waCol.aggregate([
        {
          $match: {
            phone_number: { $in: clickedPhoneDedup },
            stage: 'clicked',
          },
        },
        {
          $addFields: {
            _clickAt: { $ifNull: ['$click_timestamp', '$event_timestamp'] },
          },
        },
        {
          $group: {
            _id: '$phone_number',
            lastClickAt: { $max: '$_clickAt' },
          },
        },
      ]).toArray()
    : []

  const lastClickByNorm = new Map()
  for (const row of lastClickResult) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const t = parseOptDate(row.lastClickAt)
    if (!t) continue
    const prev = lastClickByNorm.get(norm)
    if (!prev || t.getTime() > prev.getTime()) lastClickByNorm.set(norm, t)
  }

  const appsCol = db.collection(APPS_COL)

  const formSubmittedAgg = normalisedClickedMobiles.length > 0
    ? await appsCol.aggregate([
        {
          $match: {
            'personal_details.mobile_number': { $in: normalisedClickedMobiles },
            'application_detail.application_no': { $ne: '' },
          },
        },
        {
          $addFields: {
            _sortAt: { $ifNull: ['$createdAt', '$updatedAt'] },
            _npfLead: {
              $ifNull: [
                '$other_info.lead_id',
                { $ifNull: ['$npfData.lead_id', '$npfData.leadId'] },
              ],
            },
          },
        },
        { $sort: { _sortAt: 1 } },
        {
          $group: {
            _id: '$personal_details.mobile_number',
            formSubmittedAt: { $max: '$_sortAt' },
            leadIdRaw: { $last: '$_npfLead' },
          },
        },
      ]).toArray()
    : []

  const formSubmittedResult = formSubmittedAgg.filter((r) => {
    const norm = normaliseMobile(r._id)
    const outboundAnchor = firstOutboundByNorm.get(norm)
    const lastClick = lastClickByNorm.get(norm)
    if (!outboundAnchor || !lastClick || r.formSubmittedAt == null) return false
    if (!isOnOrAfter(r.formSubmittedAt, outboundAnchor)) return false
    return isOnOrAfter(r.formSubmittedAt, lastClick)
  })

  formSubmittedCount = formSubmittedResult.length
  const formSubmittedMobiles = formSubmittedResult.map((r) => r._id)

  const convertedMobiles = [...new Set(formSubmittedMobiles)]
  const clickAttrResult = convertedMobiles.length > 0
    ? await waCol.aggregate([
        { $match: { stage: 'clicked', phone_number: { $in: convertedMobiles } } },
        {
          $group: {
            _id: '$phone_number',
            templates: { $addToSet: '$template_name' },
            buttons: { $addToSet: '$button_text' },
          },
        },
      ]).toArray()
    : []

  const clickAttrMap = new Map()
  for (const r of clickAttrResult) {
    clickAttrMap.set(normaliseMobile(r._id), {
      templates: (r.templates || []).filter(Boolean),
      buttons: (r.buttons || []).filter(Boolean),
    })
  }

  const formConversionRate = clickedPhones.length > 0
    ? parseFloat(((formSubmittedCount / clickedPhones.length) * 100).toFixed(2))
    : 0

  const templatePhoneResult = await waCol.aggregate([
    { $match: { ...matchFilter, stage: 'clicked', template_name: { $nin: [null, ''] } } },
    { $group: { _id: '$template_name', phones: { $addToSet: '$phone_number' } } },
  ]).toArray()

  templatePhones = {}
  for (const r of templatePhoneResult) {
    if (r._id) templatePhones[r._id] = r.phones || []
  }

  const clickBreakdownResult = await waCol.aggregate([
    { $match: { ...matchFilter, stage: 'clicked' } },
    { $sort: { event_timestamp: -1 } },
    {
      $group: {
        _id: '$phone_number',
        clicks: {
          $push: {
            template: '$template_name',
            button: '$button_text',
            link: '$button_link',
            type: '$click_type',
            time: '$click_timestamp',
          },
        },
      },
    },
  ]).toArray()

  const phoneVariantsForLead = [
    ...new Set([
      ...clickBreakdownResult
        .map((r) => r._id)
        .filter(Boolean)
        .flatMap((p) => {
          const n = normaliseMobile(p)
          if (!n) return []
          const v = [n]
          if (n.length === 10) v.push(`91${n}`)
          return v
        }),
      ...formSubmittedMobiles.flatMap((p) => {
        const n = normaliseMobile(p)
        if (!n) return []
        const v = [n]
        if (n.length === 10) v.push(`91${n}`)
        return v
      }),
    ]),
  ]

  const crmSnapshotCol = db.collection(CRM_SNAPSHOT_COL)
  const leadByNormMobile = new Map()
  if (phoneVariantsForLead.length > 0) {
    const leadDocs = await crmSnapshotCol
      .find({
        $or: [
          { mobile: { $in: phoneVariantsForLead } },
          { alternate_mobile: { $in: phoneVariantsForLead } },
        ],
      })
      .sort({ _id: -1 })
      .project({ mobile: 1, alternate_mobile: 1, lead_id: 1 })
      .toArray()
    for (const doc of leadDocs) {
      const lid = doc.lead_id != null && String(doc.lead_id).trim() !== '' ? String(doc.lead_id) : ''
      if (!lid) continue
      for (const raw of [doc.mobile, doc.alternate_mobile]) {
        const key = normaliseMobile(raw)
        if (key && !leadByNormMobile.has(key)) leadByNormMobile.set(key, lid)
      }
    }
  }

  clickBreakdown = clickBreakdownResult
    .filter((r) => r._id)
    .map((r) => ({
      phone: r._id,
      leadId: leadByNormMobile.get(normaliseMobile(r._id)) || null,
      totalClicks: r.clicks.length,
      clicks: r.clicks.slice(0, 20),
    }))
    .sort((a, b) => b.totalClicks - a.totalClicks)

  function stringifyLeadId(raw) {
    if (raw == null || raw === '') return null
    const s = String(raw).trim()
    return s === '' ? null : s
  }

  const formMetaByNorm = new Map()
  for (const row of formSubmittedResult) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const dt = parseOptDate(row.formSubmittedAt)
    formMetaByNorm.set(norm, {
      formSubmittedAtIso: dt ? dt.toISOString() : null,
      formSubmittedAtDisplay: dt
        ? dt.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })
        : '—',
      leadIdFromNpf: stringifyLeadId(row.leadIdRaw),
    })
  }

  const clickTimelineByNorm = new Map()
  const MAX_TIMELINE_EVENTS = 40
  if (convertedMobiles.length > 0) {
    const clickTimelineResult = await waCol.aggregate([
      { $match: { ...matchFilter, stage: 'clicked', phone_number: { $in: convertedMobiles } } },
      { $sort: { event_timestamp: 1 } },
      {
        $group: {
          _id: '$phone_number',
          events: {
            $push: {
              template: '$template_name',
              button: '$button_text',
              clickAt: { $ifNull: ['$click_timestamp', '$event_timestamp'] },
            },
          },
        },
      },
    ]).toArray()

    for (const row of clickTimelineResult) {
      const norm = normaliseMobile(row._id)
      if (!norm) continue
      const rawEvents = row.events || []
      const slice = rawEvents.length > MAX_TIMELINE_EVENTS
        ? rawEvents.slice(-MAX_TIMELINE_EVENTS)
        : rawEvents
      const events = slice.map((e) => {
        const dt = parseOptDate(e.clickAt)
        return {
          template: e.template || '',
          button: e.button || '',
          clickAtIso: dt ? dt.toISOString() : null,
          clickAtDisplay: dt
            ? dt.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Kolkata',
              })
            : '—',
        }
      })
      clickTimelineByNorm.set(norm, events)
    }
  }

  paymentConversion = {
    conversionKind: 'mba_form',
    totalClicked: clickedPhones.length,
    formSubmitted: formSubmittedCount,
    conversionRate: formConversionRate,
    formSubmittedMobiles,
    formSubmittedDetails: formSubmittedMobiles.map((m) => {
      const norm = normaliseMobile(m)
      const attr = clickAttrMap.get(norm)
      const meta = formMetaByNorm.get(norm)
      const npfLead = meta?.leadIdFromNpf
      const crmLead = leadByNormMobile.get(norm)
      return {
        mobile: m,
        leadId: npfLead || crmLead || null,
        formSubmittedAtIso: meta?.formSubmittedAtIso ?? null,
        formSubmittedAtDisplay: meta?.formSubmittedAtDisplay ?? '—',
        clickedTemplates: attr?.templates || [],
        clickedButtons: attr?.buttons || [],
        clickTimeline: clickTimelineByNorm.get(norm) || [],
      }
    }),
  }

  }

  const lastDoc = await waCol.find({}).sort({ event_timestamp: -1 }).limit(1).toArray()
  const lastRawDocTime = lastDoc[0]?.event_timestamp
    ? new Date(lastDoc[0].event_timestamp).toISOString()
    : new Date().toISOString()

  const dashboard = {
    channel: 'wa',
    workspace: cfg.workspace,
    kpi: rawKpi,
    funnel,
    templateRows,
    ctaRows,
    costPerClick,
    totalCost,
    engagementSummary,
    buttonPhones,
    templatePhones,
    clickBreakdown,
    rawDocCount: totalDocs,
    lastRawDocTime,
    formSubmittedCount,
    paymentConversion,
    computedAt: new Date().toISOString(),
  }

  if (mode !== 'range') {
    await cacheCol.updateOne(
      { _id: cfg.cacheKey },
      { $set: dashboard },
      { upsert: true },
    )
    if (cfg.includeMbaConversion) {
      await cacheCol.deleteOne({ _id: WA_DASHBOARD_CACHE_ID_MBA_LEGACY })
    }
  }

  return {
    ...dashboard,
    fromCache: false,
    elapsed: Date.now() - start,
  }
}
