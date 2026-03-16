import clientPromise from '../../../src/lib/mongodb'

const DB_NAME = 'itm'
const COLLECTION = 'npfMbaApplications'

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const mobilesParam = searchParams.get('mobiles') || ''

    const rawMobiles = mobilesParam
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)

    if (rawMobiles.length === 0) {
      return Response.json({ mobiles: [], total: 0 })
    }

    const mobiles = [...new Set(rawMobiles.map(normaliseMobile).filter(Boolean))]

    const client = await clientPromise
    const db = client.db(DB_NAME)
    const col = db.collection(COLLECTION)

    const cursor = col.aggregate([
      {
        $match: {
          'personal_details.mobile_number': { $in: mobiles },
          // Treat non-empty application_no as "application submitted"
          'application_detail.application_no': { $ne: '' },
        },
      },
      {
        $group: {
          _id: '$personal_details.mobile_number',
        },
      },
    ])

    const foundMobiles = []
    for await (const doc of cursor) {
      if (doc._id) foundMobiles.push(String(doc._id))
    }

    return Response.json({
      mobiles: foundMobiles,
      total: foundMobiles.length,
    })
  } catch (err) {
    console.error('[api/npf-applications]', err)
    return Response.json(
      { error: err.message || 'Failed to fetch applications' },
      { status: 500 },
    )
  }
}

