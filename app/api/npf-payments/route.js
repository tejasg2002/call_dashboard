import clientPromise from '../../../src/lib/mongodb'

const DB_NAME = 'itm'
const COLLECTION = 'npfPayments'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const client = await clientPromise
    const db = client.db(DB_NAME)
    const col = db.collection(COLLECTION)

    const debug = searchParams.get('debug') === 'true'

    if (debug) {
      const totalCount = await col.estimatedDocumentCount()

      const statusAgg = await col.aggregate([
        { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]).toArray()

      return Response.json({
        collection: COLLECTION,
        database: DB_NAME,
        totalDocuments: totalCount,
        statusDistribution: statusAgg.map((s) => ({
          status: s._id,
          count: s.count,
        })),
      })
    }

    const leadIdsParam = searchParams.get('lead_ids')

    const filter = {
      paymentStatus: { $regex: /^complete$/i },
    }
    if (leadIdsParam) {
      const ids = leadIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
      if (ids.length > 0) {
        filter.lead_id = { $in: ids }
      }
    }

    const docs = await col.find(filter, {
      projection: { lead_id: 1, paymentStatus: 1, createdAt: 1 },
    }).toArray()

    const serialized = docs.map((d) => ({
      _id: d._id.toString(),
      lead_id: d.lead_id,
      paymentStatus: d.paymentStatus,
      createdAt: d.createdAt,
    }))

    return Response.json({
      payments: serialized,
      total: serialized.length,
    })
  } catch (err) {
    console.error('[api/npf-payments]', err)
    return Response.json(
      { error: err.message || 'Failed to fetch payments' },
      { status: 500 },
    )
  }
}
