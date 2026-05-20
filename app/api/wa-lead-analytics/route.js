/**
 * GET /api/wa-lead-analytics
 * Lead-filtered WA template aggregates (MBA / BBA / BTECH / IDM).
 * Phone matching aligns with wa-dashboard/compute.js (_waPhone + variants).
 * Repeat leadStage=…, source=…, city=…, and/or state=… for multi-select (OR within each; AND across dimensions).
 */

import clientPromise from '../../../src/lib/mongodb'
import { waWorkspaceConfig, normalizeWAWorkspace } from '../../../src/lib/waWorkspace'
import { normaliseMobile } from '../../../src/lib/waPhoneMatch'
import { expandLeadFilterSourcePicksForMatch } from '../../../src/lib/leadFilterSourcePrimary.js'
import { normalizeMbaWaSourcePicks } from '../../../src/lib/mbaWaCallbackLeadFilter.js'
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
import {
  runMbaLeadFilterApply,
  buildDatePreStages,
  TEMPLATE_GROUP_STAGES,
} from '../../../src/lib/waLeadFilterMba.js'
import { LEAD_FILTER_AGG_OPTS } from '../../../src/lib/waLeadFilterAggOpts.js'
import { aggregateWaByPhoneCohort, fetchCrmPhonesCached } from '../../../src/lib/waLeadCohortPhones.js'

const LATEST_SORT = { createdAt: -1, Updated_Date: -1, updatedAt: -1, _id: -1 }
const CRM_FETCH_OPTS = { allowDiskUse: true, maxTimeMS: 120_000 }

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
      CRM_FETCH_OPTS,
    )
    .toArray()
  return rows.map((r) => r._id).filter(Boolean)
}

async function fetchWebhookPhones(col, leadStagesIn, sourcesIn, phoneStrExpr, stageExpr, sourceExpr = leadSourceExpr) {
  if (leadStagesIn.length === 0 && sourcesIn.length > 0) {
    const sourceOnlyMatch = buildLeadStageSourceMatchInsensitive([], sourcesIn)
    const rows = await col
      .aggregate(
        [
          ...(Object.keys(sourceOnlyMatch).length ? [{ $match: sourceOnlyMatch }] : []),
          { $project: { phone: phoneStrExpr } },
          { $match: { phone: { $nin: [null, ''] } } },
          { $group: { _id: '$phone' } },
        ],
        LEAD_FILTER_AGG_OPTS,
      )
      .toArray()
    return rows.map((r) => r._id).filter(Boolean)
  }

  const rows = await col
    .aggregate(
      [
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
      ],
      LEAD_FILTER_AGG_OPTS,
    )
    .toArray()
  return rows.map((r) => r._id).filter(Boolean)
}

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
    const pickedLeadStages = normalizeLeadFilterList(searchParams.getAll('leadStage'))
    const pickedSources = normalizeLeadFilterList(searchParams.getAll('source'))
    const pickedCities = normalizeLeadFilterList(searchParams.getAll('city'))
    const pickedStates = normalizeLeadFilterList(searchParams.getAll('state'))
    const cfg = waWorkspaceConfig(workspace)
    const isMbaItmCrm = cfg.crmLeadFilterSchema === 'itm_crm_leads'
    const isMbaWaCallback = cfg.leadFilterUsesWaCallbackData === true
    const mbaSourcesOnWa = cfg.leadFilterSourcesOnWaEvents === true
    const expandedSources = mbaSourcesOnWa
      ? normalizeMbaWaSourcePicks(pickedSources)
      : expandLeadFilterSourcePicksForMatch(workspace, pickedSources)
    let startDate = (searchParams.get('startDate') || '').trim()
    let endDate = (searchParams.get('endDate') || '').trim()

    if (!cfg.crmSnapshotCollection && !cfg.leadWebhookCollection && !isMbaWaCallback) {
      return Response.json({ error: 'Lead analytics not available for this workspace' }, { status: 400 })
    }

    const client = await clientPromise
    const waDb = client.db(cfg.dataDb)
    const leadDb = client.db(cfg.leadFilterDataDb ?? cfg.dataDb)
    const crmCol = cfg.crmSnapshotCollection ? leadDb.collection(cfg.crmSnapshotCollection) : null
    const webhookCol = cfg.leadWebhookCollection ? leadDb.collection(cfg.leadWebhookCollection) : null
    const waCol = waDb.collection(cfg.waCollection)
    const st = resolveLeadStageFilterContext(cfg)
    const phoneExpr = isMbaItmCrm ? mbaItmCrmLeadPhoneExpr : buildLeadPhoneExpr(cfg.leadPhoneField)
    const phoneStrExpr = leadPhoneStringExpr(phoneExpr)
    const stageExpr = isMbaItmCrm ? mbaItmCrmLeadStageExpr : st.stageExpr
    const sourceExpr = isMbaItmCrm ? mbaItmCrmLeadSourceExpr : leadSourceExpr
    const stageMatchFields = isMbaItmCrm ? MBA_ITM_CRM_STAGE_MATCH_FIELDS : st.stageMatchFields
    const matchExtras = isMbaItmCrm ? mbaItmCrmLeadFilterMatchExtras() : null

    if (isMbaWaCallback) {
      const mbaResult = await runMbaLeadFilterApply({
        client,
        waCol,
        pickedLeadStages,
        waSourcePicks: expandedSources,
        waCityPicks: pickedCities,
        waStatePicks: pickedStates,
        startDate,
        endDate,
      })
      return Response.json({
        templateRows: mbaResult.templateRows,
        kpi: mbaResult.kpi,
        totalLeads: mbaResult.totalLeads,
        paymentConversion: mbaResult.paymentConversion,
        filteredBy: {
          leadStages: pickedLeadStages,
          sources: pickedSources,
          cities: pickedCities,
          states: pickedStates,
        },
      })
    }

    const stageKey = pickedLeadStages.join('\x1f')
    const sourceKey = expandedSources.join('\x1f')

    const [crmPhones, webhookPhones] = await Promise.all([
      crmCol
        ? fetchCrmPhonesCached(workspace, stageKey, sourceKey, () =>
            fetchCrmPhones(crmCol, pickedLeadStages, expandedSources, phoneStrExpr, stageMatchFields, matchExtras),
          )
        : [],
      webhookCol
        ? fetchWebhookPhones(webhookCol, pickedLeadStages, expandedSources, phoneStrExpr, stageExpr, sourceExpr).then(
            (raw) => {
              const seen = new Set()
              const out = []
              for (const p of raw) {
                const n = normaliseMobile(p)
                if (!n || seen.has(n)) continue
                seen.add(n)
                out.push(n)
              }
              return out
            },
          )
        : [],
    ])

    const normalizedPhones = mergePhonesForWaJoin(crmPhones, webhookPhones)

    if (normalizedPhones.length === 0) {
      const emptyKpi = { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, ctr: 0, sdr: 0, str: 0, readRate: 0 }
      return Response.json({
        templateRows: [],
        kpi: emptyKpi,
        totalLeads: 0,
        filteredBy: { leadStages: pickedLeadStages, sources: pickedSources },
      })
    }

    if (!startDate && !endDate) {
      const d = new Date()
      d.setDate(d.getDate() - 14)
      startDate = d.toISOString().slice(0, 10)
    }

    const { templateRows, totalLeads: cohortLeadCount } = await aggregateWaByPhoneCohort(waCol, {
      normalizedPhones,
      datePreStages: buildDatePreStages(startDate, endDate),
      callbackStagePreMatch: null,
      templateGroupStages: TEMPLATE_GROUP_STAGES,
      aggOpts: LEAD_FILTER_AGG_OPTS,
    })

    const kpi = templateRows.reduce(
      (acc, r) => ({
        sent: acc.sent + (r.sent || 0),
        delivered: acc.delivered + (r.delivered || 0),
        read: acc.read + (r.read || 0),
        clicked: acc.clicked + (r.clicked || 0),
        failed: acc.failed + (r.failed || 0),
      }),
      { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0 },
    )

    kpi.ctr = kpi.delivered > 0 ? (kpi.clicked / kpi.delivered) * 100 : 0
    kpi.sdr = kpi.sent > 0 ? (kpi.delivered / kpi.sent) * 100 : 0
    kpi.str = kpi.sent > 0 ? (kpi.read / kpi.sent) * 100 : 0
    kpi.readRate = kpi.delivered > 0 ? (kpi.read / kpi.delivered) * 100 : 0

    return Response.json({
      templateRows,
      kpi,
      totalLeads: cohortLeadCount || normalizedPhones.length,
      filteredBy: { leadStages: pickedLeadStages, sources: pickedSources },
    })
  } catch (err) {
    console.error('[api/wa-lead-analytics]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
