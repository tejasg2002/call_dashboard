import clientPromise from '../../../src/lib/mongodb'

const DB = 'itm'
const WA_COL = 'marketingwa'
const APPS_COL = 'npfMbaApplications'
const CACHE_COL = 'wa_dashboard_cache'

const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

export async function computeWADashboard({ mode = 'cached', startDate, endDate } = {}) {
  const start = Date.now()

  const client = await clientPromise
  const db = client.db(DB)
  const cacheCol = db.collection(CACHE_COL)

  if (mode === 'cached' && !startDate && !endDate) {
    const cached = await cacheCol.findOne({ _id: 'wa_latest' })
    if (cached) {
      return { ...cached, _id: undefined, fromCache: true, elapsed: Date.now() - start }
    }
  }

  const waCol = db.collection(WA_COL)

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
      { $match: { ...matchFilter, stage: 'clicked', button_text: { $nin: [null, ''] } } },
      {
        $group: {
          _id: { template_name: '$template_name', button_text: '$button_text' },
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

  const appsCol = db.collection(APPS_COL)

  const [formSubmittedResult, paidResult] = await Promise.all([
    normalisedClickedMobiles.length > 0
      ? appsCol.aggregate([
          {
            $match: {
              'personal_details.mobile_number': { $in: normalisedClickedMobiles },
              'application_detail.application_no': { $ne: '' },
            },
          },
          { $group: { _id: '$personal_details.mobile_number' } },
        ]).toArray()
      : Promise.resolve([]),

    normalisedClickedMobiles.length > 0
      ? appsCol.aggregate([
          {
            $match: {
              'personal_details.mobile_number': { $in: normalisedClickedMobiles },
              'payment_details.payment_receipt_no1': { $nin: [null, ''] },
            },
          },
          {
            $group: {
              _id: '$personal_details.mobile_number',
              application_no: { $first: '$application_detail.application_no' },
              payment_amount: { $first: '$payment_details.payment_amount1' },
            },
          },
        ]).toArray()
      : Promise.resolve([]),
  ])

  const formSubmittedCount = formSubmittedResult.length
  const paidCount = paidResult.length
  const formSubmittedMobiles = formSubmittedResult.map((r) => r._id)
  const paidMobiles = paidResult.map((r) => r._id)

  const paymentConversion = {
    totalClicked: clickedPhones.length,
    formSubmitted: formSubmittedCount,
    paid: paidCount,
    conversionRate: clickedPhones.length > 0
      ? parseFloat(((paidCount / clickedPhones.length) * 100).toFixed(2))
      : 0,
    formSubmittedMobiles,
    paidMobiles,
    paidDetails: paidResult.map((r) => ({
      mobile: r._id,
      application_no: r.application_no,
      payment_amount: r.payment_amount,
    })),
  }

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

  const templatePhoneResult = await waCol.aggregate([
    { $match: { ...matchFilter, stage: 'clicked', template_name: { $nin: [null, ''] } } },
    { $group: { _id: '$template_name', phones: { $addToSet: '$phone_number' } } },
  ]).toArray()

  const templatePhones = {}
  for (const r of templatePhoneResult) {
    if (r._id) templatePhones[r._id] = r.phones || []
  }

  const lastDoc = await waCol.find({}).sort({ event_timestamp: -1 }).limit(1).toArray()
  const lastRawDocTime = lastDoc[0]?.event_timestamp
    ? new Date(lastDoc[0].event_timestamp).toISOString()
    : new Date().toISOString()

  const dashboard = {
    channel: 'wa',
    kpi: rawKpi,
    funnel,
    templateRows,
    ctaRows,
    costPerClick,
    totalCost,
    engagementSummary,
    buttonPhones,
    templatePhones,
    rawDocCount: totalDocs,
    lastRawDocTime,
    formSubmittedCount,
    paymentConversion,
    computedAt: new Date().toISOString(),
  }

  if (mode !== 'range') {
    await cacheCol.updateOne(
      { _id: 'wa_latest' },
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
