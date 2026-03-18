import clientPromise from '../../../src/lib/mongodb'

const DB = 'itm'
const SMS_COL = 'marketingSms'
const CACHE_COL = 'sms_dashboard_cache'

const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)

function deriveStage(doc) {
  const e = (doc.event || doc.eventName || '').toLowerCase()
  if (e === 'delivered') return 'delivered'
  if (e === 'failed') return 'failed'
  return 'sent'
}

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

export async function computeSmsDashboard({ mode = 'cached', startDate, endDate } = {}) {
  const start = Date.now()
  const client = await clientPromise
  const db = client.db(DB)
  const cacheCol = db.collection(CACHE_COL)

  if (mode === 'cached' && !startDate && !endDate) {
    const cached = await cacheCol.findOne({ _id: 'sms_latest' })
    if (cached) {
      return { ...cached, _id: undefined, fromCache: true, elapsed: Date.now() - start }
    }
  }

  const col = db.collection(SMS_COL)

  const matchFilter = {}
  if (startDate || endDate) {
    matchFilter.requestedAt = {}
    if (startDate) matchFilter.requestedAt.$gte = new Date(startDate).toISOString()
    if (endDate) {
      const end = new Date(endDate)
      end.setDate(end.getDate() + 1)
      matchFilter.requestedAt.$lt = end.toISOString()
    }
  }

  const allDocs = await col.find(matchFilter).toArray()
  const totalDocs = allDocs.length

  let sent = 0
  let delivered = 0
  let failed = 0
  let totalCost = 0

  const campaignMap = {}
  const failureReasons = {}
  const phoneSet = new Set()

  for (const doc of allDocs) {
    const stage = deriveStage(doc)
    if (stage === 'delivered') delivered++
    else if (stage === 'failed') failed++
    sent++

    totalCost += parseFloat(doc.credit || 0)

    if (doc.telNum) phoneSet.add(normaliseMobile(doc.telNum))

    const campaign = doc.campaignName || doc.senderId || 'Unknown'
    if (!campaignMap[campaign]) {
      campaignMap[campaign] = { campaign, sent: 0, delivered: 0, failed: 0, cost: 0, phones: new Set(), failureReasons: {} }
    }
    const c = campaignMap[campaign]
    c.sent++
    if (stage === 'delivered') c.delivered++
    if (stage === 'failed') {
      c.failed++
      const reason = doc.failureReason || 'Unknown'
      c.failureReasons[reason] = (c.failureReasons[reason] || 0) + 1
      failureReasons[reason] = (failureReasons[reason] || 0) + 1
    }
    c.cost += parseFloat(doc.credit || 0)
    if (doc.telNum) c.phones.add(normaliseMobile(doc.telNum))
  }

  const kpi = {
    sent,
    delivered,
    failed,
    deliveryRate: pct(delivered, sent),
    failureRate: pct(failed, sent),
    totalCost: parseFloat(totalCost.toFixed(2)),
    uniquePhones: phoneSet.size,
  }

  const campaignRows = Object.values(campaignMap)
    .map((c) => ({
      campaign: c.campaign,
      sent: c.sent,
      delivered: c.delivered,
      failed: c.failed,
      deliveryRate: pct(c.delivered, c.sent),
      cost: parseFloat(c.cost.toFixed(2)),
      uniquePhones: c.phones.size,
      failureReasons: Object.entries(c.failureReasons).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.sent - a.sent)

  const topFailures = Object.entries(failureReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const funnel = [
    { label: 'Sent', value: sent },
    { label: 'Delivered', value: delivered },
    { label: 'Failed', value: failed },
  ]

  const dashboard = {
    channel: 'sms',
    kpi,
    campaignRows,
    funnel,
    topFailures,
    rawDocCount: totalDocs,
    computedAt: new Date().toISOString(),
  }

  if (mode !== 'range') {
    await cacheCol.updateOne(
      { _id: 'sms_latest' },
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
