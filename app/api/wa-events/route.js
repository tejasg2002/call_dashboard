import clientPromise from '../../../src/lib/mongodb'
import { waWorkspaceConfig, normalizeWAWorkspace } from '../../../src/lib/waWorkspace'

const DEFAULT_PAGE_SIZE = 50_000

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const client = await clientPromise
    const cfg = waWorkspaceConfig(normalizeWAWorkspace(searchParams.get('workspace')))
    const db = client.db(cfg.dataDb)
    const col = db.collection(cfg.waCollection)

    const filter = {}

    const since = searchParams.get('since')
    if (since) {
      filter.event_timestamp = { $gt: new Date(since) }
    }

    const templateName = searchParams.get('template_name')
    if (templateName) filter.template_name = templateName

    const stage = searchParams.get('stage')
    if (stage) filter.stage = stage

    const source = searchParams.get('source')
    if (source) filter.source = source

    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if (startDate || endDate) {
      if (!filter.event_timestamp) filter.event_timestamp = {}
      if (startDate) filter.event_timestamp.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setDate(end.getDate() + 1)
        filter.event_timestamp.$lt = end
      }
    }

    const page = parseInt(searchParams.get('page') || '0', 10)
    const pageSize = parseInt(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE, 10)

    const isIncremental = !!since
    const isTemplateQuery = !!templateName
    const isUnpaginated = isIncremental || isTemplateQuery
    const limitParam = searchParams.get('limit')
    const hardLimit = limitParam ? parseInt(limitParam, 10) : 0

    const [total, docs] = await Promise.all([
      isUnpaginated
        ? (hardLimit ? Promise.resolve(hardLimit) : col.countDocuments(filter))
        : Object.keys(filter).length === 0
          ? col.estimatedDocumentCount()
          : col.countDocuments(filter),

      isUnpaginated
        ? (hardLimit
            ? col.find(filter).sort({ event_timestamp: -1 }).limit(hardLimit).toArray()
            : col.find(filter).sort({ event_timestamp: -1 }).toArray())
        : col.find(filter).sort({ event_timestamp: -1 }).skip(page * pageSize).limit(pageSize).toArray(),
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
      hasMore: isUnpaginated ? false : (page + 1) * pageSize < total,
    })
  } catch (err) {
    console.error('[api/wa-events]', err)
    return Response.json(
      { error: err.message || 'Failed to fetch WA events' },
      { status: 500 },
    )
  }
}
