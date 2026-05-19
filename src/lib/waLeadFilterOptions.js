/**
 * Lead filter dropdown options (lead stage + source) — same logic as GET /api/wa-lead-filter?mode=options.
 * Used by the API route and by export scripts so CSVs stay aligned with the UI.
 */

import {
  buildLeadPhoneExpr,
  leadPhoneStringExpr,
  leadSourceExpr,
  distinctNonEmptyStrings,
  resolveLeadStageFilterContext,
  LEAD_SOURCE_DISTINCT_PATHS,
  mbaItmCrmLeadPhoneExpr,
  mbaItmCrmLeadStageExpr,
  mbaItmCrmLeadSourceExpr,
  MBA_ITM_CRM_STAGE_DISTINCT_PATHS,
  MBA_ITM_CRM_SOURCE_DISTINCT_PATHS,
  isExcludedMbaLeadStageDropdownValue,
  isExcludedIdmLeadStageDropdownValue,
  isExcludedIhmLeadSourceDropdownValue,
} from './waLeadMongo.js'
import {
  normalizeWAWorkspace,
  waWorkspaceConfig,
  WA_WORKSPACE_IDM,
  WA_WORKSPACE_IHM,
} from './waWorkspace.js'
import { mapLeadSourcesToPrimaryOptions } from './leadFilterSourcePrimary.js'
import { loadMbaLeadFilterOptionsFast } from './waLeadFilterMba.js'
import {
  getLeadFilterCache,
  setLeadFilterCache,
  leadFilterOptionsCacheKey,
} from './waLeadFilterCache.js'

const LATEST_SORT = { createdAt: -1, Updated_Date: -1, updatedAt: -1, _id: -1 }

async function fetchOptions(col, stageExpr, sourceExpr = leadSourceExpr) {
  const rows = await col
    .aggregate([
      { $project: { leadStage: stageExpr, source: sourceExpr } },
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

async function fetchWebhookOptions(col, phoneStrExpr, stageExpr, sourceExpr = leadSourceExpr) {
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

/** Distinct scalar strings per field path (same rules as waLeadMongo.distinctNonEmptyStrings, but keeps path). */
async function distinctStringsByPaths(col, paths) {
  const out = []
  if (!col || !paths?.length) return out
  for (const fieldPath of paths) {
    try {
      const vals = await col.distinct(fieldPath)
      for (const v of vals) {
        if (v == null) continue
        if (
          typeof v === 'object' &&
          !(v instanceof Date) &&
          v?.constructor?.name !== 'ObjectId'
        ) {
          continue
        }
        const s = String(v).trim()
        if (s && s !== '[object Object]') out.push({ fieldPath, value: s })
      }
    } catch {
      /* invalid path for this collection */
    }
  }
  return out
}

/**
 * @param {import('mongodb').MongoClient} client
 * @param {string} workspace
 * @param {{ includeSourceProvenance?: boolean }} [opts]
 * @returns {Promise<{ leadStages: string[], sources: string[], unavailable?: string, sourceProvenance?: Array<{ bucket: string, fieldPath: string, value: string }> }>}
 */
export async function loadLeadFilterOptions(client, workspace, opts = {}) {
  const { includeSourceProvenance = false } = opts
  const ws = normalizeWAWorkspace(workspace)
  const cfg = waWorkspaceConfig(ws)
  const isMbaItmCrm = cfg.crmLeadFilterSchema === 'itm_crm_leads'
  const isMbaWaCallback = cfg.leadFilterUsesWaCallbackData === true

  if (isMbaWaCallback && !includeSourceProvenance) {
    return loadMbaLeadFilterOptionsFast()
  }

  const optionsCacheKey = leadFilterOptionsCacheKey(ws)
  const cached = getLeadFilterCache(optionsCacheKey)
  if (cached && !includeSourceProvenance) {
    return cached
  }

  if (!cfg.crmSnapshotCollection && !cfg.leadWebhookCollection && !isMbaWaCallback) {
    return {
      leadStages: [],
      sources: [],
      unavailable: 'Lead stage filter is not available for this workspace',
    }
  }

  const leadDb = client.db(cfg.leadFilterDataDb ?? cfg.dataDb)
  const crmCol = cfg.crmSnapshotCollection ? leadDb.collection(cfg.crmSnapshotCollection) : null
  const webhookCol = cfg.leadWebhookCollection ? leadDb.collection(cfg.leadWebhookCollection) : null
  const st = resolveLeadStageFilterContext(cfg)
  const phoneExpr = isMbaItmCrm ? mbaItmCrmLeadPhoneExpr : buildLeadPhoneExpr(cfg.leadPhoneField)
  const phoneStrExpr = leadPhoneStringExpr(phoneExpr)
  const stageExpr = isMbaItmCrm ? mbaItmCrmLeadStageExpr : st.stageExpr
  const sourceExpr = isMbaItmCrm ? mbaItmCrmLeadSourceExpr : leadSourceExpr
  const crmStagePaths = isMbaItmCrm ? [...MBA_ITM_CRM_STAGE_DISTINCT_PATHS] : st.stageDistinctPaths
  const crmSourcePaths = isMbaItmCrm ? [...MBA_ITM_CRM_SOURCE_DISTINCT_PATHS] : LEAD_SOURCE_DISTINCT_PATHS

  const [
    crmOpts,
    webhookOpts,
    crmStagesDist,
    crmSourcesDistRows,
    whStagesDist,
    whSourcesDistRows,
  ] = await Promise.all([
    crmCol ? fetchOptions(crmCol, stageExpr, sourceExpr) : { stages: [], sources: [] },
    webhookCol ? fetchWebhookOptions(webhookCol, phoneStrExpr, stageExpr, sourceExpr) : { stages: [], sources: [] },
    crmCol ? distinctNonEmptyStrings(crmCol, crmStagePaths) : [],
    crmCol ? distinctStringsByPaths(crmCol, crmSourcePaths) : [],
    webhookCol ? distinctNonEmptyStrings(webhookCol, st.stageDistinctPaths) : [],
    webhookCol ? distinctStringsByPaths(webhookCol, LEAD_SOURCE_DISTINCT_PATHS) : [],
  ])

  const crmSourcesDist = [...new Set(crmSourcesDistRows.map((r) => r.value))]
  const whSourcesDist = [...new Set(whSourcesDistRows.map((r) => r.value))]

  let leadStagesRaw = [
    ...new Set([
      ...crmOpts.stages,
      ...webhookOpts.stages,
      ...crmStagesDist,
      ...whStagesDist,
    ]),
  ].sort((a, b) => String(a).localeCompare(String(b)))

  let leadStages = leadStagesRaw
  if (isMbaItmCrm && !isMbaWaCallback) {
    leadStages = leadStagesRaw.filter((s) => !isExcludedMbaLeadStageDropdownValue(s))
  } else if (ws === WA_WORKSPACE_IDM) {
    leadStages = leadStagesRaw.filter((s) => !isExcludedIdmLeadStageDropdownValue(s))
  }

  const sourcesRawUnion = [
    ...crmOpts.sources,
    ...webhookOpts.sources,
    ...crmSourcesDist,
    ...whSourcesDist,
  ]
  const sourcesRawFiltered =
    ws === WA_WORKSPACE_IHM
      ? sourcesRawUnion.filter((s) => !isExcludedIhmLeadSourceDropdownValue(s))
      : sourcesRawUnion

  const sourcesRaw = [...new Set(sourcesRawFiltered.map((x) => String(x || '').trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  )

  const sources = mapLeadSourcesToPrimaryOptions(ws, sourcesRaw)

  /** @type {Array<{ bucket: string, fieldPath: string, value: string }>} */
  let sourceProvenance
  if (includeSourceProvenance) {
    sourceProvenance = []
    for (const v of crmOpts.sources) {
      sourceProvenance.push({ bucket: 'crm_leadSourceExpr_aggregate', fieldPath: '', value: String(v) })
    }
    for (const v of webhookOpts.sources) {
      sourceProvenance.push({ bucket: 'webhook_leadSourceExpr_aggregate', fieldPath: '', value: String(v) })
    }
    for (const { fieldPath, value } of crmSourcesDistRows) {
      sourceProvenance.push({ bucket: 'crm_distinct_field', fieldPath, value })
    }
    for (const { fieldPath, value } of whSourcesDistRows) {
      sourceProvenance.push({ bucket: 'webhook_distinct_field', fieldPath, value })
    }
  }

  const result = {
    leadStages,
    sources,
    ...(includeSourceProvenance ? { sourceProvenance } : {}),
  }

  if (!includeSourceProvenance) {
    setLeadFilterCache(optionsCacheKey, result)
  }

  return result
}
