/**
 * GET /api/wa-lead-filter
 *
 * mode=options  → { leadStages: string[], sources: string[] }
 * mode=phones   → { phones: string[], count: number }
 *                 Repeat query params leadStage=… and source=… for multi-select (OR within each).
 */

import clientPromise from '../../../src/lib/mongodb'
import { waWorkspaceConfig, normalizeWAWorkspace } from '../../../src/lib/waWorkspace'
import { loadLeadFilterOptions } from '../../../src/lib/waLeadFilterOptions.js'
import { expandLeadFilterSourcePicksForMatch } from '../../../src/lib/leadFilterSourcePrimary.js'
import {
  buildLeadPhoneExpr,
  leadPhoneStringExpr,
  leadSourceExpr,
  buildLeadStageSourceMatchInsensitive,
  buildGroupedLeadFilterMatch,
  normalizeLeadFilterList,
  resolveLeadStageFilterContext,
  mbaItmCrmLeadPhoneExpr,
  mbaItmCrmLeadStageExpr,
  mbaItmCrmLeadSourceExpr,
  MBA_ITM_CRM_STAGE_MATCH_FIELDS,
  mbaItmCrmLeadFilterMatchExtras,
} from '../../../src/lib/waLeadMongo'
import { normaliseMobile } from '../../../src/lib/waPhoneMatch'
import { runMbaLeadFilterApply, LEAD_FILTER_AGG_OPTS } from '../../../src/lib/waLeadFilterMba.js'

async function fetchCrmPhones(col, leadStagesIn, sourcesIn, phoneStrExpr, stageMatchFields, matchExtras) {
  const match = buildLeadStageSourceMatchInsensitive(leadStagesIn, sourcesIn, stageMatchFields, matchExtras)
  const rows = await col
    .aggregate(
      [
        ...(Object.keys(match).length ? [{ $match: match }] : []),
        { $project: { phone: phoneStrExpr } },
        { $match: { phone: { $nin: [null, ''] } } },
        { $group: { _id: '$phone' } },
      ],
      LEAD_FILTER_AGG_OPTS,
    )
    .toArray()
  return rows.map((r) => r._id).filter(Boolean)
}

const LATEST_SORT = { createdAt: -1, Updated_Date: -1, updatedAt: -1, _id: -1 }

async function fetchWebhookPhones(col, leadStagesIn, sourcesIn, phoneStrExpr, stageExpr, sourceExpr = leadSourceExpr) {
  const rows = await col
    .aggregate([
      { $sort: LATEST_SORT },
      {
        $group: {
          _id: phoneStrExpr,
          leadStage: { $first: stageExpr },
          source: { $first: sourceExpr },
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
    const expandedSources = expandLeadFilterSourcePicksForMatch(workspace, pickedSources)

    const cfg = waWorkspaceConfig(workspace)
    const isMbaItmCrm = cfg.crmLeadFilterSchema === 'itm_crm_leads'
    const isMbaWaCallback = cfg.leadFilterUsesWaCallbackData === true

    if (!cfg.crmSnapshotCollection && !cfg.leadWebhookCollection && !isMbaWaCallback) {
      return Response.json({ error: 'Lead stage filter is not available for this workspace' }, { status: 400 })
    }

    const client = await clientPromise
    const waCol =
      isMbaWaCallback ? client.db(cfg.dataDb).collection(cfg.waCollection) : null
    const leadDb = client.db(cfg.leadFilterDataDb ?? cfg.dataDb)
    const crmCol = cfg.crmSnapshotCollection ? leadDb.collection(cfg.crmSnapshotCollection) : null
    const webhookCol = cfg.leadWebhookCollection ? leadDb.collection(cfg.leadWebhookCollection) : null
    const st = resolveLeadStageFilterContext(cfg)
    const phoneExpr = isMbaItmCrm ? mbaItmCrmLeadPhoneExpr : buildLeadPhoneExpr(cfg.leadPhoneField)
    const phoneStrExpr = leadPhoneStringExpr(phoneExpr)
    const stageExpr = isMbaItmCrm ? mbaItmCrmLeadStageExpr : st.stageExpr
    const sourceExpr = isMbaItmCrm ? mbaItmCrmLeadSourceExpr : leadSourceExpr
    const stageMatchFields = isMbaItmCrm ? MBA_ITM_CRM_STAGE_MATCH_FIELDS : st.stageMatchFields
    const matchExtras = isMbaItmCrm ? mbaItmCrmLeadFilterMatchExtras() : null

    if (mode === 'options') {
      const { leadStages, sources, unavailable } = await loadLeadFilterOptions(client, workspace)
      if (unavailable) {
        return Response.json({ error: unavailable }, { status: 400 })
      }
      return Response.json({ leadStages, sources })
    }

    if (mode === 'phones') {
      if (isMbaWaCallback && waCol) {
        const mbaResult = await runMbaLeadFilterApply({
          waCol,
          crmCol,
          pickedLeadStages,
          expandedSources,
          startDate: '',
          endDate: '',
          fetchCrmPhones,
          phoneStrExpr,
          stageMatchFields,
          matchExtras,
        })
        return Response.json({ phones: mbaResult.phones, count: mbaResult.phones.length })
      }

      const [crmPhones, webhookPhones] = await Promise.all([
        crmCol ? fetchCrmPhones(crmCol, pickedLeadStages, expandedSources, phoneStrExpr, stageMatchFields, matchExtras) : [],
        webhookCol ? fetchWebhookPhones(webhookCol, pickedLeadStages, expandedSources, phoneStrExpr, stageExpr, sourceExpr) : [],
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
