/**
 * GET /api/wa-lead-filter
 *
 * mode=options  → { leadStages: string[], sources: string[] }
 * mode=phones   → { phones: string[], count: number }
 *                 Repeat query params leadStage=… and source=… for multi-select (OR within each).
 */

import clientPromise from '../../../src/lib/mongodb'
import { waWorkspaceConfig, normalizeWAWorkspace } from '../../../src/lib/waWorkspace'
import {
  buildLeadPhoneExpr,
  leadPhoneStringExpr,
  leadSourceExpr,
  buildLeadStageSourceMatchInsensitive,
  buildGroupedLeadFilterMatch,
  normalizeLeadFilterList,
  distinctNonEmptyStrings,
  resolveLeadStageFilterContext,
  LEAD_SOURCE_DISTINCT_PATHS,
} from '../../../src/lib/waLeadMongo'
import { normaliseMobile } from '../../../src/lib/waPhoneMatch'

const LATEST_SORT = { createdAt: -1, Updated_Date: -1, updatedAt: -1, _id: -1 }

async function fetchOptions(col, stageExpr) {
  const rows = await col
    .aggregate([
      { $project: { leadStage: stageExpr, source: leadSourceExpr } },
      {
        $group: {
          _id: null,
          stages: { $addToSet: '$leadStage' },
          sources: { $addToSet: '$source' },
        },
      },
    ])
    .toArray()

  if (!rows[0]) return { stages: [], sources: [] }
  return {
    stages: (rows[0].stages || []).filter((s) => s != null && String(s).trim() !== ''),
    sources: (rows[0].sources || []).filter((s) => s != null && String(s).trim() !== ''),
  }
}

async function fetchWebhookOptions(col, phoneStrExpr, stageExpr) {
  const rows = await col
    .aggregate([
      { $sort: LATEST_SORT },
      {
        $group: {
          _id: phoneStrExpr,
          leadStage: { $first: stageExpr },
          source: { $first: leadSourceExpr },
        },
      },
      { $match: { _id: { $nin: [null, ''] } } },
      {
        $group: {
          _id: null,
          stages: { $addToSet: '$leadStage' },
          sources: { $addToSet: '$source' },
        },
      },
    ])
    .toArray()

  if (!rows[0]) return { stages: [], sources: [] }
  return {
    stages: (rows[0].stages || []).filter((s) => s != null && String(s).trim() !== ''),
    sources: (rows[0].sources || []).filter((s) => s != null && String(s).trim() !== ''),
  }
}

async function fetchCrmPhones(col, leadStagesIn, sourcesIn, phoneStrExpr, stageMatchFields) {
  const match = buildLeadStageSourceMatchInsensitive(leadStagesIn, sourcesIn, stageMatchFields)
  const rows = await col
    .aggregate([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      { $project: { phone: phoneStrExpr } },
      { $match: { phone: { $nin: [null, ''] } } },
      { $group: { _id: '$phone' } },
    ])
    .toArray()
  return rows.map((r) => r._id).filter(Boolean)
}

async function fetchWebhookPhones(col, leadStagesIn, sourcesIn, phoneStrExpr, stageExpr) {
  const rows = await col
    .aggregate([
      { $sort: LATEST_SORT },
      {
        $group: {
          _id: phoneStrExpr,
          leadStage: { $first: stageExpr },
          source: { $first: leadSourceExpr },
        },
      },
      { $match: { _id: { $nin: [null, ''] } } },
      ...buildGroupedLeadFilterMatch(leadStagesIn, sourcesIn),
    ])
    .toArray()
  return rows.map((r) => r._id).filter(Boolean)
}

/** Dedupe by same rules as WA matching — one row per subscriber (VLOOKUP key). */
function mergePhonesForWaJoin(crmPhones, webhookPhones) {
  const seen = new Set()
  const out = []
  for (const raw of [...crmPhones, ...webhookPhones]) {
    const n = normaliseMobile(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspace = normalizeWAWorkspace(searchParams.get('workspace'))
    const mode = searchParams.get('mode') || 'options'
    const pickedLeadStages = normalizeLeadFilterList(searchParams.getAll('leadStage'))
    const pickedSources = normalizeLeadFilterList(searchParams.getAll('source'))

    const cfg = waWorkspaceConfig(workspace)

    if (!cfg.crmSnapshotCollection && !cfg.leadWebhookCollection) {
      return Response.json({ error: 'Lead stage filter is not available for this workspace' }, { status: 400 })
    }

    const client = await clientPromise
    const leadDb = client.db(cfg.leadFilterDataDb ?? cfg.dataDb)
    const crmCol = cfg.crmSnapshotCollection ? leadDb.collection(cfg.crmSnapshotCollection) : null
    const webhookCol = cfg.leadWebhookCollection ? leadDb.collection(cfg.leadWebhookCollection) : null
    const phoneStrExpr = leadPhoneStringExpr(buildLeadPhoneExpr(cfg.leadPhoneField))
    const st = resolveLeadStageFilterContext(cfg)

    if (mode === 'options') {
      const [
        crmOpts,
        webhookOpts,
        crmStagesDist,
        crmSourcesDist,
        whStagesDist,
        whSourcesDist,
      ] = await Promise.all([
        crmCol ? fetchOptions(crmCol, st.stageExpr) : { stages: [], sources: [] },
        webhookCol ? fetchWebhookOptions(webhookCol, phoneStrExpr, st.stageExpr) : { stages: [], sources: [] },
        crmCol ? distinctNonEmptyStrings(crmCol, st.stageDistinctPaths) : [],
        crmCol ? distinctNonEmptyStrings(crmCol, LEAD_SOURCE_DISTINCT_PATHS) : [],
        webhookCol ? distinctNonEmptyStrings(webhookCol, st.stageDistinctPaths) : [],
        webhookCol ? distinctNonEmptyStrings(webhookCol, LEAD_SOURCE_DISTINCT_PATHS) : [],
      ])

      const leadStages = [
        ...new Set([
          ...crmOpts.stages,
          ...webhookOpts.stages,
          ...crmStagesDist,
          ...whStagesDist,
        ]),
      ].sort((a, b) => String(a).localeCompare(String(b)))

      const sources = [
        ...new Set([
          ...crmOpts.sources,
          ...webhookOpts.sources,
          ...crmSourcesDist,
          ...whSourcesDist,
        ]),
      ].sort((a, b) => String(a).localeCompare(String(b)))

      return Response.json({ leadStages, sources })
    }

    if (mode === 'phones') {
      const [crmPhones, webhookPhones] = await Promise.all([
        crmCol ? fetchCrmPhones(crmCol, pickedLeadStages, pickedSources, phoneStrExpr, st.stageMatchFields) : [],
        webhookCol ? fetchWebhookPhones(webhookCol, pickedLeadStages, pickedSources, phoneStrExpr, st.stageExpr) : [],
      ])
      const phones = mergePhonesForWaJoin(crmPhones, webhookPhones)
      return Response.json({ phones, count: phones.length })
    }

    return Response.json({ error: 'Invalid mode. Use mode=options or mode=phones' }, { status: 400 })
  } catch (err) {
    console.error('[api/wa-lead-filter]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
