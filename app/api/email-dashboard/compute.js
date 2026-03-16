import clientPromise from '../../../src/lib/mongodb'

const DB = 'itm'
const EMAIL_COL = 'aws_ses_webhook_ibs'
const CACHE_COL = 'email_dashboard_cache'

const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)

const STAGE_MAP = {
  Send: 'sent',
  Delivery: 'delivered',
  Open: 'opened',
  Click: 'clicked',
  Bounce: 'bounced',
  Complaint: 'complained',
}

export async function computeEmailDashboard({ mode = 'cached', startDate, endDate } = {}) {
  const start = Date.now()

  const client = await clientPromise
  const db = client.db(DB)
  const cacheCol = db.collection(CACHE_COL)

  if (mode === 'cached' && !startDate && !endDate) {
    const cached = await cacheCol.findOne({ _id: 'email_latest' })
    if (cached) {
      return { ...cached, _id: undefined, fromCache: true, elapsed: Date.now() - start }
    }
  }

  const col = db.collection(EMAIL_COL)

  const matchFilter = {}
  if (startDate || endDate) {
    matchFilter.time = {}
    if (startDate) matchFilter.time.$gte = new Date(startDate).toISOString()
    if (endDate) {
      const end = new Date(endDate)
      end.setDate(end.getDate() + 1)
      matchFilter.time.$lt = end.toISOString()
    }
  }

  const validEventTypes = Object.keys(STAGE_MAP)

  const [kpiResult, subjectResult, clickResult, totalDocs] = await Promise.all([
    col.aggregate([
      { $match: { ...matchFilter, 'detail.eventType': { $in: validEventTypes } } },
      {
        $group: {
          _id: null,
          sent: { $sum: { $cond: [{ $eq: ['$detail.eventType', 'Send'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$detail.eventType', 'Delivery'] }, 1, 0] } },
          opened: { $sum: { $cond: [{ $eq: ['$detail.eventType', 'Open'] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $eq: ['$detail.eventType', 'Click'] }, 1, 0] } },
          bounced: { $sum: { $cond: [{ $eq: ['$detail.eventType', 'Bounce'] }, 1, 0] } },
          complained: { $sum: { $cond: [{ $eq: ['$detail.eventType', 'Complaint'] }, 1, 0] } },
        },
      },
    ]).toArray(),

    col.aggregate([
      { $match: { ...matchFilter, 'detail.eventType': { $in: validEventTypes } } },
      {
        $group: {
          _id: {
            subject: '$detail.mail.commonHeaders.subject',
            eventType: '$detail.eventType',
          },
          count: { $sum: 1 },
          firstSeen: { $min: '$time' },
          lastSeen: { $max: '$time' },
          sampleSource: { $first: '$detail.mail.source' },
          sampleFrom: { $first: { $arrayElemAt: ['$detail.mail.commonHeaders.from', 0] } },
          sampleDate: { $first: '$detail.mail.commonHeaders.date' },
          templateId: { $first: { $arrayElemAt: ['$detail.mail.tags.templateId', 0] } },
          emails: { $addToSet: { $arrayElemAt: ['$detail.mail.destination', 0] } },
        },
      },
    ]).toArray(),

    col.aggregate([
      { $match: { ...matchFilter, 'detail.eventType': 'Click' } },
      {
        $group: {
          _id: {
            subject: '$detail.mail.commonHeaders.subject',
            email: { $arrayElemAt: ['$detail.mail.destination', 0] },
          },
          links: { $addToSet: '$detail.click.link' },
          lastClick: { $max: '$time' },
        },
      },
    ]).toArray(),

    Object.keys(matchFilter).length === 0
      ? col.estimatedDocumentCount()
      : col.countDocuments(matchFilter),
  ])

  const rawKpi = kpiResult[0] || { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }
  delete rawKpi._id
  rawKpi.deliveryRate = pct(rawKpi.delivered, rawKpi.sent)
  rawKpi.openRate = pct(rawKpi.opened, rawKpi.delivered)
  rawKpi.clickRate = pct(rawKpi.clicked, rawKpi.delivered)
  rawKpi.bounceRate = pct(rawKpi.bounced, rawKpi.sent)

  const subjectMap = {}
  for (const r of subjectResult) {
    const subject = r._id.subject
    if (!subject) continue
    const stage = STAGE_MAP[r._id.eventType]
    if (!stage) continue

    if (!subjectMap[subject]) {
      subjectMap[subject] = {
        subject,
        templateId: '',
        sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0,
        firstSeen: null,
        lastSeen: null,
        sampleMail: null,
        _allEmails: new Set(),
      }
    }
    const row = subjectMap[subject]
    row[stage] = (row[stage] || 0) + r.count

    if (r.firstSeen && (!row.firstSeen || r.firstSeen < row.firstSeen)) row.firstSeen = r.firstSeen
    if (r.lastSeen && (!row.lastSeen || r.lastSeen > row.lastSeen)) row.lastSeen = r.lastSeen
    if (!row.templateId && r.templateId) row.templateId = r.templateId
    if (r.emails) r.emails.forEach((e) => { if (e) row._allEmails.add(e.toLowerCase()) })

    if (!row.sampleMail && r._id.eventType === 'Send') {
      row.sampleMail = {
        from: r.sampleSource || r.sampleFrom || '',
        subject,
        date: r.sampleDate || r.firstSeen || '',
        templateId: r.templateId || '',
      }
    }
  }

  const clicksBySubjectEmail = {}
  for (const r of clickResult) {
    const subject = r._id.subject
    const email = r._id.email
    if (!subject || !email) continue
    if (!clicksBySubjectEmail[subject]) clicksBySubjectEmail[subject] = {}
    clicksBySubjectEmail[subject][email.toLowerCase()] = {
      links: (r.links || []).filter(Boolean),
      lastClick: r.lastClick,
    }
  }

  const templateRows = Object.values(subjectMap).map((row) => {
    const { _allEmails, ...rest } = row
    return {
      ...rest,
      deliveryRate: pct(row.delivered, row.sent),
      openRate: pct(row.opened, row.delivered),
      clickRate: pct(row.clicked, row.delivered),
      bounceRate: pct(row.bounced, row.sent),
    }
  }).sort((a, b) => b.sent - a.sent)

  const subjectEmails = {}
  for (const [subject, row] of Object.entries(subjectMap)) {
    if (row._allEmails.size > 0) {
      subjectEmails[subject] = [...row._allEmails]
    }
  }

  const funnel = [
    { label: 'Sent', value: rawKpi.sent },
    { label: 'Delivered', value: rawKpi.delivered },
    { label: 'Opened', value: rawKpi.opened },
    { label: 'Clicked', value: rawKpi.clicked },
    { label: 'Bounced', value: rawKpi.bounced },
  ]

  const lastDoc = await col.find({}).sort({ time: -1 }).limit(1).project({ time: 1 }).toArray()
  const lastRawDocTime = lastDoc[0]?.time || new Date().toISOString()

  const dashboard = {
    channel: 'email',
    kpi: rawKpi,
    templateRows,
    funnel,
    subjectEmails,
    clicksBySubjectEmail,
    rawDocCount: totalDocs,
    lastRawDocTime,
    computedAt: new Date().toISOString(),
  }

  if (mode !== 'range') {
    await cacheCol.updateOne(
      { _id: 'email_latest' },
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
