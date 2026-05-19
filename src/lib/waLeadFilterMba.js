/**
 * Fast MBA lead-filter: static options, single-pass WA analytics ($facet), TTL caches.
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
  buildMbaWaLeadStageMatch,
  loadMbaLeadStageFilterOptions,
  normalizeMbaCallbackStageKey,
} from './mbaWaCallbackLeadFilter.js'
import { waStageExpr } from './waLeadAnalyticsExpr.js'
import { normaliseMobile, waPhoneVariantsForMatch } from './waPhoneMatch.js'

/** @type {import('mongodb').AggregateOptions} */
export const LEAD_FILTER_AGG_OPTS = { allowDiskUse: true, maxTimeMS: 45_000 }

const MBA_ANALYTICS_CACHE_TTL_MS = 3 * 60 * 1000

/** Primary source labels for MBA dropdown (from mapping JSON — no CRM scan). */
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

function mbaAnalyticsCacheKey(stageKey, sourceKey, startDate, endDate) {
  return `mba_analytics:${stageKey}:${sourceKey}:${startDate}:${endDate}`
}

/**
 * Dropdown options — instant (no Mongo).
 */
export function loadMbaLeadFilterOptionsFast() {
  const cacheKey = leadFilterOptionsCacheKey('mba')
  const hit = getLeadFilterCache(cacheKey)
  if (hit) return hit

  const result = {
    leadStages: [...MBA_DB_LEAD_STAGE_ORDER],
    sources: getMbaPrimarySourceOptions(),
  }
  setLeadFilterCache(cacheKey, result)
  return result
}

/**
 * Stage alias groups: static map immediately; optional background refresh from DB.
 */
export function getMbaStageGroupsCached(waCol) {
  const key = mbaStageGroupsCacheKey()
  const hit = getLeadFilterCache(key)
  if (hit) return deserializeStageGroups(hit)

  const staticGroups = buildStaticMbaStageGroups()
  setLeadFilterCache(key, serializeStageGroups(staticGroups))

  if (waCol) {
    void loadMbaLeadStageFilterOptions(waCol)
      .then(({ stageGroups }) => {
        if (stageGroups.size > 0) {
          setLeadFilterCache(key, serializeStageGroups(stageGroups))
        }
      })
      .catch(() => {})
  }

  return staticGroups
}

function buildDatePreStages(startDate, endDate) {
  if (!startDate && !endDate) return []
  const f = {}
  if (startDate) f.$gte = new Date(startDate)
  if (endDate) {
    const end = new Date(endDate)
    end.setDate(end.getDate() + 1)
    f.$lt = end
  }
  return [{ $match: { $or: [{ event_timestamp: f }, { createdAt: f }] } }]
}

/**
 * One Mongo round-trip: template KPI rows + distinct phones for cohort.
 * @param {import('mongodb').Collection} waCol
 * @param {{ callbackStagePreMatch?: object, phoneVariants?: string[], startDate?: string, endDate?: string, stageKey?: string, sourceKey?: string }} opts
 */
export async function runMbaLeadFilteredAnalytics(waCol, opts = {}) {
  const {
    callbackStagePreMatch = null,
    phoneVariants = [],
    startDate = '',
    endDate = '',
    stageKey = '',
    sourceKey = '',
  } = opts

  const cacheKey = mbaAnalyticsCacheKey(stageKey, sourceKey, startDate, endDate)
  const cached = getLeadFilterCache(cacheKey)
  if (cached) return cached

  const preMatch = [
    ...(callbackStagePreMatch ? [{ $match: callbackStagePreMatch }] : []),
    ...buildDatePreStages(startDate, endDate),
    {
      $addFields: {
        _waPhone: {
          $ifNull: [
            '$phone_number',
            '$data.customer.phone_number',
            '$data.customer.channel_phone_number',
          ],
        },
      },
    },
    { $match: { _waPhone: { $nin: [null, ''] } } },
    ...(phoneVariants.length > 0 ? [{ $match: { _waPhone: { $in: phoneVariants } } }] : []),
    {
      $addFields: {
        _waStage: { $ifNull: ['$stage', waStageExpr()] },
        _templateName: {
          $ifNull: [
            '$template_name',
            {
              $let: {
                vars: {
                  m: {
                    $regexFind: {
                      input: { $ifNull: ['$data.message.raw_template', ''] },
                      regex: '"name"\\s*:\\s*"([^"]+)"',
                    },
                  },
                },
                in: { $ifNull: [{ $arrayElemAt: ['$$m.captures', 0] }, '(unknown)'] },
              },
            },
          ],
        },
      },
    },
    { $addFields: { _templateName: { $ifNull: ['$_templateName', '(unknown)'] } } },
    { $match: { _waStage: { $ne: null } } },
  ]

  const facetPipeline = [
    ...preMatch,
    {
      $facet: {
        templates: [
          {
            $group: {
              _id: { template: '$_templateName', phone: '$_waPhone' },
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
              ctr: {
                $cond: [
                  { $gt: ['$delivered', 0] },
                  { $multiply: [{ $divide: ['$clicked', '$delivered'] }, 100] },
                  0,
                ],
              },
              sdr: {
                $cond: [{ $gt: ['$sent', 0] }, { $multiply: [{ $divide: ['$delivered', '$sent'] }, 100] }, 0],
              },
              str: {
                $cond: [{ $gt: ['$sent', 0] }, { $multiply: [{ $divide: ['$read', '$sent'] }, 100] }, 0],
              },
              readRate: {
                $cond: [
                  { $gt: ['$delivered', 0] },
                  { $multiply: [{ $divide: ['$read', '$delivered'] }, 100] },
                  0,
                ],
              },
            },
          },
          { $sort: { sent: -1 } },
        ],
        phones: [{ $group: { _id: '$_waPhone' } }, { $limit: 80_000 }],
      },
    },
  ]

  const [facetRow] = await waCol.aggregate(facetPipeline, LEAD_FILTER_AGG_OPTS).toArray()
  const templateRows = (facetRow?.templates || []).map((r) => ({ ...r, _id: undefined }))
  const phones = (facetRow?.phones || [])
    .map((r) => normaliseMobile(r._id))
    .filter(Boolean)

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

  const result = { templateRows, kpi, phones }
  setLeadFilterCache(cacheKey, result, MBA_ANALYTICS_CACHE_TTL_MS)
  return result
}

/**
 * MBA apply path: resolve filters then one analytics query.
 */
export async function runMbaLeadFilterApply({
  waCol,
  crmCol,
  pickedLeadStages,
  expandedSources,
  startDate,
  endDate,
  fetchCrmPhones,
  phoneStrExpr,
  stageMatchFields,
  matchExtras,
}) {
  const mbaStageGroups = getMbaStageGroupsCached(waCol)
  let callbackStagePreMatch = null
  if (pickedLeadStages.length > 0) {
    callbackStagePreMatch = buildMbaWaLeadStageMatch(pickedLeadStages, mbaStageGroups)
  }

  let phoneVariants = []
  if (expandedSources.length > 0 && crmCol) {
    const crmPhones = await fetchCrmPhones(
      crmCol,
      [],
      expandedSources,
      phoneStrExpr,
      stageMatchFields,
      matchExtras,
    )
    phoneVariants = waPhoneVariantsForMatch(crmPhones)
  }

  if (!callbackStagePreMatch && phoneVariants.length === 0) {
    return {
      templateRows: [],
      kpi: { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, ctr: 0, sdr: 0, str: 0, readRate: 0 },
      phones: [],
      totalLeads: 0,
    }
  }

  let effectiveStart = startDate
  let effectiveEnd = endDate
  if (!effectiveStart && !effectiveEnd) {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    effectiveStart = d.toISOString().slice(0, 10)
  }

  const { templateRows, kpi, phones } = await runMbaLeadFilteredAnalytics(waCol, {
    callbackStagePreMatch,
    phoneVariants,
    startDate: effectiveStart,
    endDate: effectiveEnd,
    stageKey: pickedLeadStages.join('\x1f'),
    sourceKey: expandedSources.join('\x1f'),
  })

  return {
    templateRows,
    kpi,
    phones,
    totalLeads: phones.length,
  }
}
