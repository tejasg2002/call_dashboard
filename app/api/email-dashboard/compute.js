import clientPromise from '../../../src/lib/mongodb'
import { isOnOrAfter } from '../../../src/lib/conversionAttribution'

const DB = 'itm'
const EMAIL_COL = 'aws_ses_webhook_ibs'
const APPS_COL = 'npfMbaApplications'
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

function emailSubjectKey(emailLower, subject) {
  return `${emailLower}\u{1e}${subject}`
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

  const [subjectResult, clickedEmailsResult, clickBreakdownResult, totalDocs] = await Promise.all([
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
        },
      },
    ]).toArray(),

    col.aggregate([
      { $match: { ...matchFilter, 'detail.eventType': 'Click' } },
      { $sort: { time: -1 } },
      {
        $addFields: {
          _emailLower: {
            $toLower: {
              $trim: {
                input: { $ifNull: [{ $arrayElemAt: ['$detail.mail.destination', 0] }, ''] },
              },
            },
          },
          _buttonLabel: {
            $cond: {
              if: { $gt: [{ $size: { $ifNull: ['$detail.click.linkTags', []] } }, 0] },
              then: {
                $let: {
                  vars: { ft: { $arrayElemAt: ['$detail.click.linkTags', 0] } },
                  in: {
                    $trim: {
                      input: {
                        $ifNull: [
                          '$$ft.value',
                          { $ifNull: ['$$ft.name', ''] },
                        ],
                      },
                    },
                  },
                },
              },
              else: '',
            },
          },
        },
      },
      { $match: { _emailLower: { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$_emailLower',
          clicks: {
            $push: {
              template: {
                $cond: {
                  if: {
                    $gt: [
                      { $strLenCP: { $ifNull: ['$detail.mail.commonHeaders.subject', ''] } },
                      0,
                    ],
                  },
                  then: '$detail.mail.commonHeaders.subject',
                  else: {
                    $ifNull: [
                      { $arrayElemAt: ['$detail.mail.tags.templateId', 0] },
                      '(no subject)',
                    ],
                  },
                },
              },
              templateId: { $ifNull: [{ $arrayElemAt: ['$detail.mail.tags.templateId', 0] }, ''] },
              button: {
                $cond: {
                  if: { $gt: [{ $strLenCP: { $ifNull: ['$_buttonLabel', ''] } }, 0] },
                  then: '$_buttonLabel',
                  else: 'Link',
                },
              },
              link: { $ifNull: ['$detail.click.link', ''] },
              type: 'click',
              time: '$time',
            },
          },
        },
      },
    ]).toArray(),

    Object.keys(matchFilter).length === 0
      ? col.estimatedDocumentCount()
      : col.countDocuments(matchFilter),
  ])

  const rawKpi = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }
  const subjectMap = {}

  for (const r of subjectResult) {
    const subject = r._id.subject
    const eventType = r._id.eventType
    if (!subject) continue
    const stage = STAGE_MAP[eventType]
    if (!stage) continue

    rawKpi[stage] += r.count

    if (!subjectMap[subject]) {
      subjectMap[subject] = {
        subject,
        templateId: '',
        sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0,
        firstSeen: null,
        lastSeen: null,
        sampleMail: null,
      }
    }
    const row = subjectMap[subject]
    row[stage] += r.count

    if (r.firstSeen && (!row.firstSeen || r.firstSeen < row.firstSeen)) row.firstSeen = r.firstSeen
    if (r.lastSeen && (!row.lastSeen || r.lastSeen > row.lastSeen)) row.lastSeen = r.lastSeen
    if (!row.templateId && r.templateId) row.templateId = r.templateId

    if (!row.sampleMail && eventType === 'Send') {
      row.sampleMail = {
        from: r.sampleSource || r.sampleFrom || '',
        subject,
        date: r.sampleDate || r.firstSeen || '',
        templateId: r.templateId || '',
      }
    }
  }

  rawKpi.deliveryRate = pct(rawKpi.delivered, rawKpi.sent)
  rawKpi.openRate = pct(rawKpi.opened, rawKpi.delivered)
  rawKpi.clickRate = pct(rawKpi.clicked, rawKpi.delivered)
  rawKpi.bounceRate = pct(rawKpi.bounced, rawKpi.sent)

  const clickedBySubject = {}
  const allClickedEmails = new Set()
  for (const r of clickedEmailsResult) {
    const subject = r._id.subject
    const email = r._id.email
    if (!subject || !email) continue
    const lower = email.toLowerCase()
    allClickedEmails.add(lower)
    if (!clickedBySubject[subject]) clickedBySubject[subject] = new Set()
    clickedBySubject[subject].add(lower)
  }
  const clickedEmailList = [...allClickedEmails]

  const emailToSubjects = new Map()
  for (const [subject, emailSet] of Object.entries(clickedBySubject)) {
    for (const e of emailSet) {
      if (!emailToSubjects.has(e)) emailToSubjects.set(e, new Set())
      emailToSubjects.get(e).add(subject)
    }
  }

  /** First SES Send time per (email, subject); not limited to dashboard date range */
  const firstSendRows = clickedEmailList.length > 0
    ? await col.aggregate([
        { $match: { 'detail.eventType': 'Send' } },
        {
          $addFields: {
            em: {
              $toLower: {
                $trim: {
                  input: { $ifNull: [{ $arrayElemAt: ['$detail.mail.destination', 0] }, ''] },
                },
              },
            },
          },
        },
        { $match: { em: { $in: clickedEmailList } } },
        {
          $group: {
            _id: {
              email: '$em',
              subject: '$detail.mail.commonHeaders.subject',
            },
            firstSent: { $min: '$time' },
          },
        },
      ]).toArray()
    : []

  const firstSendMap = new Map()
  for (const row of firstSendRows) {
    const em = row._id?.email
    const sub = row._id?.subject
    if (!em || !sub) continue
    firstSendMap.set(emailSubjectKey(em, sub), row.firstSent)
  }

  function emailQualifiesAfterSend(emailLower, eventTime) {
    const subs = emailToSubjects.get(emailLower)
    if (!subs || eventTime == null) return false
    for (const sub of subs) {
      const sent = firstSendMap.get(emailSubjectKey(emailLower, sub))
      if (sent != null && isOnOrAfter(eventTime, sent)) return true
    }
    return false
  }

  const clickBreakdown = clickBreakdownResult
    .filter((r) => r._id)
    .map((r) => ({
      email: r._id,
      totalClicks: r.clicks.length,
      clicks: r.clicks.slice(0, 20),
    }))
    .sort((a, b) => b.totalClicks - a.totalClicks)

  const templateRows = Object.values(subjectMap).map((row) => ({
    ...row,
    deliveryRate: pct(row.delivered, row.sent),
    openRate: pct(row.opened, row.delivered),
    clickRate: pct(row.clicked, row.delivered),
    bounceRate: pct(row.bounced, row.sent),
  })).sort((a, b) => b.sent - a.sent)

  const appsCol = db.collection(APPS_COL)

  const [formSubmittedAgg, paidAgg] = await Promise.all([
    clickedEmailList.length > 0
      ? appsCol.aggregate([
          {
            $match: {
              'personal_details.email_id': { $in: clickedEmailList },
              'application_detail.application_no': { $ne: '' },
            },
          },
          {
            $group: {
              _id: { $toLower: '$personal_details.email_id' },
              formSubmittedAt: { $max: { $ifNull: ['$createdAt', '$updatedAt'] } },
            },
          },
        ]).toArray()
      : Promise.resolve([]),

    clickedEmailList.length > 0
      ? appsCol.aggregate([
          {
            $match: {
              'personal_details.email_id': { $in: clickedEmailList },
              'payment_details.payment_receipt_no1': { $nin: [null, ''] },
            },
          },
          {
            $group: {
              _id: { $toLower: '$personal_details.email_id' },
              paidAt: {
                $max: {
                  $ifNull: [
                    '$payment_details.payment_date',
                    '$application_detail.payment_date',
                  ],
                },
              },
              docCreated: { $max: '$createdAt' },
              application_no: { $first: '$application_detail.application_no' },
              payment_amount: { $first: '$payment_details.payment_amount1' },
            },
          },
        ]).toArray()
      : Promise.resolve([]),
  ])

  const formByEmail = new Map(formSubmittedAgg.map((r) => [r._id, r.formSubmittedAt]))
  const paidByEmail = new Map(paidAgg.map((r) => [r._id, r]))

  const formSubmittedResult = formSubmittedAgg.filter((r) =>
    emailQualifiesAfterSend(r._id, r.formSubmittedAt),
  )
  const paidResult = paidAgg.filter((r) => {
    const paidTs = r.paidAt != null ? r.paidAt : r.docCreated
    return emailQualifiesAfterSend(r._id, paidTs)
  })

  const perSubjectConversion = {}
  for (const [subject, emailSet] of Object.entries(clickedBySubject)) {
    const emails = [...emailSet]
    let formCount = 0
    let paidCount = 0
    for (const e of emails) {
      const sendT = firstSendMap.get(emailSubjectKey(e, subject))
      const formAt = formByEmail.get(e)
      if (formAt && sendT && isOnOrAfter(formAt, sendT)) formCount++
      const paidRow = paidByEmail.get(e)
      const payTs = paidRow ? (paidRow.paidAt != null ? paidRow.paidAt : paidRow.docCreated) : null
      if (payTs && sendT && isOnOrAfter(payTs, sendT)) paidCount++
    }
    perSubjectConversion[subject] = {
      clicked: emails.length,
      formSubmitted: formCount,
      paid: paidCount,
      rate: emails.length > 0 ? parseFloat(((paidCount / emails.length) * 100).toFixed(1)) : 0,
    }
  }

  const emailPaymentConversion = {
    totalClicked: clickedEmailList.length,
    formSubmitted: formSubmittedResult.length,
    paid: paidResult.length,
    conversionRate: clickedEmailList.length > 0
      ? parseFloat(((paidResult.length / clickedEmailList.length) * 100).toFixed(2))
      : 0,
    paidDetails: paidResult.map((r) => ({
      email: r._id,
      application_no: r.application_no,
      payment_amount: r.payment_amount,
    })),
    perSubject: perSubjectConversion,
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
    emailPaymentConversion,
    clickBreakdown,
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
