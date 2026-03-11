import clientPromise from '../../../src/lib/mongodb'

const DB_NAME = 'itm'
const COLLECTION = 'aws_ses_webhook_ibs'

const PROJECTION = {
  'detail.eventType': 1,
  'detail.mail.commonHeaders': 1,
  'detail.mail.destination': 1,
  'detail.mail.messageId': 1,
  'detail.mail.source': 1,
  'detail.mail.tags': 1,
  'detail.click': 1,
  time: 1,
  createdAt: 1,
}

const DEFAULT_PAGE_SIZE = 50_000

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const client = await clientPromise
    const db = client.db(DB_NAME)
    const col = db.collection(COLLECTION)

    const filter = {}

    const since = searchParams.get('since')
    if (since) {
      filter.time = { $gt: since }
    }

    const eventType = searchParams.get('eventType')
    if (eventType) filter['detail.eventType'] = eventType

    const subject = searchParams.get('subject')
    if (subject) filter['detail.mail.commonHeaders.subject'] = subject

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if (startDate || endDate) {
      if (!filter.time) filter.time = {}
      if (startDate) filter.time.$gte = new Date(startDate).toISOString()
      if (endDate) {
        const end = new Date(endDate)
        end.setDate(end.getDate() + 1)
        filter.time.$lt = end.toISOString()
      }
    }

    const page = parseInt(searchParams.get('page') || '0', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE, 10)

    const isIncremental = !!since
    const [total, docs] = await Promise.all([
      isIncremental
        ? col.countDocuments(filter)
        : Object.keys(filter).length === 0
          ? col.estimatedDocumentCount()
          : col.countDocuments(filter),

      isIncremental
        ? col.find(filter, { projection: PROJECTION }).sort({ time: -1 }).toArray()
        : col.find(filter, { projection: PROJECTION }).sort({ time: -1 }).skip(page * pageSize).limit(pageSize).toArray(),
    ])

    const serialized = docs.map((doc) => ({
      ...doc,
      _id: doc._id.toString(),
    }))

    return Response.json({
      docs: serialized,
      page,
      pageSize,
      total,
      hasMore: isIncremental ? false : (page + 1) * pageSize < total,
    })
  } catch (err) {
    console.error('[api/email-events]', err)
    return Response.json(
      { error: err.message || 'Failed to fetch email events' },
      { status: 500 },
    )
  }
}
