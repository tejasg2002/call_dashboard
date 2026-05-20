/**
 * Fast MBA lead-filter: static options, batched WA analytics, TTL caches.
 */

import ROWS from './leadFilterSourcePrimaryRows.json'
import {
  getLeadFilterCache,
  setLeadFilterCache,
  leadFilterOptionsCacheKey,
  mbaStageGroupsCacheKey,
  serializeStageGroups,
  deserializeStageGroups,
} from './waLeadFilterCache.js'
import {
  MBA_DB_LEAD_STAGE_ORDER,
  fetchMbaWaPhonesByCallbackStages,
  fetchMbaWaPhonesByWaLocation,
  fetchMbaWaPhonesByWaSource,
  intersectPhoneLists,
  loadMbaInteraktCityOptions,
  loadMbaInteraktSourceOptions,
  loadMbaInteraktStateOptions,
  loadMbaLeadStageFilterOptions,
  normalizeMbaCallbackStageKey,
} from './mbaWaCallbackLeadFilter.js'
import { normaliseMobile } from './waPhoneMatch.js'
import {
  aggregateWaByPhoneCohort,
  filterPaymentConversionForCohort,
  loadMbaDashboardPaymentSlice,
} from './waLeadCohortPhones.js'
import { LEAD_FILTER_AGG_OPTS } from './waLeadFilterAggOpts.js'
import { buildWaEventDatePreStages } from './waLeadAnalyticsExpr.js'

export { LEAD_FILTER_AGG_OPTS } from './waLeadFilterAggOpts.js'

const MBA_ANALYTICS_CACHE_TTL_MS = 5 * 60 * 1000
/** Default window when user does not pick dates (keeps scans under Mongo time limit). */
const DEFAULT_LOOKBACK_DAYS = 14

export function getMbaPrimarySourceOptions() {
  const set = new Set()
  for (const pair of ROWS.mba || []) {
    const primary = String(pair[1] ?? '').trim()
    if (primary) set.add(primary)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function buildStaticMbaStageGroups() {
  const stageGroups = new Map()
  for (const label of MBA_DB_LEAD_STAGE_ORDER) {
    const key = normalizeMbaCallbackStageKey(label)
    if (!key) continue
    stageGroups.set(key, [label])
  }
  return stageGroups
}

function mbaAnalyticsCacheKey(stageKey, sourceKey, cityKey, stateKey, startDate, endDate) {
  return `mba_analytics:v6:${stageKey}:${sourceKey}:${cityKey}:${stateKey}:${startDate}:${endDate}`
}

export function loadMbaLeadFilterOptionsFast() {
  const cacheKey = leadFilterOptionsCacheKey('mba')
  const hit = getLeadFilterCache(cacheKey)
  if (hit) return hit

  const result = {
    leadStages: [],
    sources: getMbaPrimarySourceOptions(),
  }
  setLeadFilterCache(cacheKey, result)
  return result
}

/** Load stageGroups from Mongo callback_data (cached); fallback to static CSV labels. */
export async function resolveMbaStageGroups(waCol) {
  const key = mbaStageGroupsCacheKey()
  const hit = getLeadFilterCache(key)
  if (hit) {
    const groups = deserializeStageGroups(hit)
    if (groups.size > 0) return groups
  }

  if (waCol) {
    const { stageGroups } = await loadMbaLeadStageFilterOptions(waCol)
    if (stageGroups.size > 0) {
      setLeadFilterCache(key, serializeStageGroups(stageGroups))
      return stageGroups
    }
  }

  const staticGroups = buildStaticMbaStageGroups()
  setLeadFilterCache(key, serializeStageGroups(staticGroups))
  return staticGroups
}

/** @deprecated Use resolveMbaStageGroups (async). */
export function getMbaStageGroupsCached(waCol) {
  void resolveMbaStageGroups(waCol).catch(() => {})
  return buildStaticMbaStageGroups()
}

/** MBA dropdown: stages that exist in WA callback_data + sources list. */
export async function loadMbaLeadFilterOptionsFromDb(waCol) {
  const cacheKey = leadFilterOptionsCacheKey('mba')
  const hit = getLeadFilterCache(cacheKey)
  if (hit) return hit

  const [{ leadStages, stageGroups }, sources, cities, states] = await Promise.all([
    loadMbaLeadStageFilterOptions(waCol),
    loadMbaInteraktSourceOptions(waCol),
    loadMbaInteraktCityOptions(waCol),
    loadMbaInteraktStateOptions(waCol),
  ])
  if (stageGroups.size > 0) {
    setLeadFilterCache(mbaStageGroupsCacheKey(), serializeStageGroups(stageGroups))
  }
  const result = {
    leadStages: leadStages.length ? leadStages : [...MBA_DB_LEAD_STAGE_ORDER],
    sources: sources.length ? sources : getMbaPrimarySourceOptions(),
    cities,
    states,
  }
  setLeadFilterCache(cacheKey, result)
  return result
}

/** @see buildWaEventDatePreStages — matches event_timestamp / createdAt like main WA dashboard. */
export function buildDatePreStages(startDate, endDate) {
  return buildWaEventDatePreStages(startDate, endDate)
}

export const TEMPLATE_GROUP_STAGES = [
  {
    $group: {
      _id: { template: '$_templateName', phone: '$_waPhoneNorm' },
      stages: { $addToSet: '$_waStage' },
      firstSeen: { $min: { $ifNull: ['$event_timestamp', '$createdAt'] } },
      lastSeen: { $max: { $ifNull: ['$event_timestamp', '$createdAt'] } },
    },
  },
  {
    $group: {
      _id: '$_id.template',
      sent: { $sum: { $cond: [{ $in: ['sent', '$stages'] }, 1, 0] } },
      delivered: { $sum: { $cond: [{ $in: ['delivered', '$stages'] }, 1, 0] } },
      read: { $sum: { $cond: [{ $in: ['read', '$stages'] }, 1, 0] } },
      clicked: { $sum: { $cond: [{ $in: ['clicked', '$stages'] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $in: ['failed', '$stages'] }, 1, 0] } },
      firstSeen: { $min: '$firstSeen' },
      lastSeen: { $max: '$lastSeen' },
    },
  },
  {
    $project: {
      template_name: '$_id',
      source: { $literal: 'api' },
      sent: 1,
      delivered: 1,
      read: 1,
      clicked: 1,
      failed: 1,
      firstSeen: 1,
      lastSeen: 1,
    },
  },
]

export async function runMbaLeadFilteredAnalytics(waCol, _client, opts = {}) {
  const {
    callbackStagePreMatch = null,
    normalizedPhones = [],
    startDate = '',
    endDate = '',
    stageKey = '',
    sourceKey = '',
    cityKey = '',
    stateKey = '',
  } = opts

  const cacheKey = mbaAnalyticsCacheKey(stageKey, sourceKey, cityKey, stateKey, startDate, endDate)
  const cached = getLeadFilterCache(cacheKey)
  if (cached) return cached

  const { templateRows, totalLeads } = await aggregateWaByPhoneCohort(waCol, {
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

  const result = { templateRows, kpi, totalLeads, normalizedPhones }
  setLeadFilterCache(cacheKey, result, MBA_ANALYTICS_CACHE_TTL_MS)
  return result
}

export async function runMbaLeadFilterApply({
  client,
  waCol,
  pickedLeadStages,
  waSourcePicks = [],
  waCityPicks = [],
  waStatePicks = [],
  startDate,
  endDate,
}) {
  const stageKey = pickedLeadStages.join('\x1f')
  const sourceKey = waSourcePicks.join('\x1f')
  const cityKey = waCityPicks.join('\x1f')
  const stateKey = waStatePicks.join('\x1f')

  const mbaStageGroups = await resolveMbaStageGroups(waCol)

  let effectiveStart = startDate
  let effectiveEnd = endDate
  const userPickedRange = !!(startDate || endDate)
  if (!userPickedRange) {
    const d = new Date()
    d.setDate(d.getDate() - DEFAULT_LOOKBACK_DAYS)
    effectiveStart = d.toISOString().slice(0, 10)
  }

  let normalizedPhones = []

  const applyCohort = (phones) => {
    const norm = [...new Set(phones.map(normaliseMobile).filter(Boolean))]
    if (normalizedPhones.length > 0) {
      normalizedPhones = intersectPhoneLists(normalizedPhones, norm)
    } else {
      normalizedPhones = norm
    }
  }

  if (waSourcePicks.length > 0) {
    applyCohort(await fetchMbaWaPhonesByWaSource(waCol, waSourcePicks, effectiveStart, effectiveEnd))
  }

  if (waCityPicks.length > 0 || waStatePicks.length > 0) {
    applyCohort(
      await fetchMbaWaPhonesByWaLocation(waCol, waCityPicks, waStatePicks, effectiveStart, effectiveEnd),
    )
  }

  if (pickedLeadStages.length > 0) {
    applyCohort(
      await fetchMbaWaPhonesByCallbackStages(
        waCol,
        pickedLeadStages,
        mbaStageGroups,
        effectiveStart,
        effectiveEnd,
      ),
    )
  }

  if (
    normalizedPhones.length === 0 &&
    pickedLeadStages.length === 0 &&
    waSourcePicks.length === 0 &&
    waCityPicks.length === 0 &&
    waStatePicks.length === 0
  ) {
    return {
      templateRows: [],
      kpi: { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, ctr: 0, sdr: 0, str: 0, readRate: 0 },
      totalLeads: 0,
      paymentConversion: null,
    }
  }

  const { templateRows, kpi, totalLeads } = await runMbaLeadFilteredAnalytics(waCol, client, {
    normalizedPhones,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    stageKey,
    sourceKey,
    cityKey,
    stateKey,
  })

  let paymentConversion = null
  if (normalizedPhones.length > 0) {
    const { paymentConversion: pc, clickBreakdown } = await loadMbaDashboardPaymentSlice(client)
    paymentConversion = filterPaymentConversionForCohort(pc, clickBreakdown, normalizedPhones)
  }

  return {
    templateRows,
    kpi,
    totalLeads,
    paymentConversion,
  }
}
