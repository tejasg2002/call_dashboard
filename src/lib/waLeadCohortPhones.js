/**
 * CRM cohort cache + batched WA aggregation (indexed phone $in — no per-doc $lookup).
 */

import { createHash } from 'node:crypto'
import { normaliseMobile } from './waPhoneMatch.js'
import { getLeadFilterCache, setLeadFilterCache } from './waLeadFilterCache.js'
import { waStageExpr } from './waLeadAnalyticsExpr.js'

const CRM_PHONES_CACHE_TTL_MS = 30 * 60 * 1000
/** Phones per batch → ~4–6k variant values for $in (uses phone_number index). */
const PHONE_BATCH_SIZE = 1_200
const BATCH_CONCURRENCY = 3
const SINGLE_QUERY_PHONE_MAX = 2_000
const MAX_COHORT_PHONES = 80_000

function crmPhonesCacheKey(workspace, stageKey, sourceKey) {
  return `crm_phones:${workspace}:${stageKey}:${sourceKey}`
}

/**
 * Cached CRM phone list (distinct normalized 10-digit strings).
 */
export async function fetchCrmPhonesCached(workspace, stageKey, sourceKey, fetchFn) {
  const key = crmPhonesCacheKey(workspace, stageKey, sourceKey)
  const hit = getLeadFilterCache(key)
  if (hit) return hit

  const rows = await fetchFn()
  const normalized = []
  const seen = new Set()
  for (const raw of rows) {
    const n = normaliseMobile(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)
    normalized.push(n)
  }
  setLeadFilterCache(key, normalized, CRM_PHONES_CACHE_TTL_MS)
  return normalized
}

/** Mongo $in values for raw WA phone fields (no regex normalization on every row). */
export function buildPhoneFieldVariants(normalizedPhones) {
  const variants = new Set()
  for (const n of normalizedPhones) {
    if (!n) continue
    variants.add(n)
    if (n.length === 10) {
      variants.add(`91${n}`)
      variants.add(`+91${n}`)
      variants.add(`+91-${n}`)
      const as10 = Number(n)
      const as12 = Number(`91${n}`)
      if (Number.isSafeInteger(as10)) variants.add(as10)
      if (Number.isSafeInteger(as12)) variants.add(as12)
    }
  }
  return [...variants]
}

export function buildIndexedPhoneMatchStage(variantList) {
  if (!variantList?.length) return []
  return [
    {
      $match: {
        $or: [
          { phone_number: { $in: variantList } },
          { 'data.customer.phone_number': { $in: variantList } },
          { 'data.customer.channel_phone_number': { $in: variantList } },
        ],
      },
    },
  ]
}

/** Lightweight projection — avoids regexFind on raw_template (major timeout source). */
export function buildLightweightWaShapeStages() {
  return [
    {
      $addFields: {
        _waPhoneNorm: {
          $let: {
            vars: {
              raw: {
                $toString: {
                  $ifNull: [
                    '$phone_number',
                    { $ifNull: ['$data.customer.phone_number', '$data.customer.channel_phone_number'] },
                  ],
                },
              },
            },
            in: {
              $cond: [
                {
                  $and: [
                    { $eq: [{ $substrCP: ['$$raw', 0, 2] }, '91'] },
                    { $eq: [{ $strLenCP: '$$raw' }, 12] },
                  ],
                },
                { $substrCP: ['$$raw', 2, 10] },
                '$$raw',
              ],
            },
          },
        },
        _waStage: { $ifNull: ['$stage', waStageExpr()] },
        _templateName: { $ifNull: ['$template_name', '(unknown)'] },
      },
    },
    { $match: { _waStage: { $ne: null }, _waPhoneNorm: { $nin: [null, ''] } } },
  ]
}

function mergeTemplateRow(acc, row) {
  const name = row.template_name || '(unknown)'
  let t = acc.get(name)
  if (!t) {
    acc.set(name, {
      template_name: name,
      source: 'api',
      sent: row.sent || 0,
      delivered: row.delivered || 0,
      read: row.read || 0,
      clicked: row.clicked || 0,
      failed: row.failed || 0,
      firstSeen: row.firstSeen,
      lastSeen: row.lastSeen,
    })
    return
  }
  t.sent += row.sent || 0
  t.delivered += row.delivered || 0
  t.read += row.read || 0
  t.clicked += row.clicked || 0
  t.failed += row.failed || 0
  if (row.firstSeen && (!t.firstSeen || row.firstSeen < t.firstSeen)) t.firstSeen = row.firstSeen
  if (row.lastSeen && (!t.lastSeen || row.lastSeen > t.lastSeen)) t.lastSeen = row.lastSeen
}

function finalizeTemplateRows(acc) {
  return [...acc.values()]
    .map((t) => {
      const ctr = t.delivered > 0 ? (t.clicked / t.delivered) * 100 : 0
      const sdr = t.sent > 0 ? (t.delivered / t.sent) * 100 : 0
      const str = t.sent > 0 ? (t.read / t.sent) * 100 : 0
      const readRate = t.delivered > 0 ? (t.read / t.delivered) * 100 : 0
      return { ...t, ctr, sdr, str, readRate }
    })
    .sort((a, b) => b.sent - a.sent)
}

/**
 * Run WA template aggregation in batches (parallel) so each query stays under Mongo time limit.
 */
export async function aggregateWaByPhoneCohort(waCol, {
  normalizedPhones = [],
  datePreStages = [],
  callbackStagePreMatch = null,
  templateGroupStages,
  aggOpts,
}) {
  const phones = normalizedPhones.slice(0, MAX_COHORT_PHONES)
  const matchedPhones = new Set()
  const templateAcc = new Map()

  const basePrefix = [
    ...datePreStages,
    ...(callbackStagePreMatch ? [{ $match: callbackStagePreMatch }] : []),
  ]

  async function runPipeline(extraStages) {
    const pipeline = [...basePrefix, ...extraStages, ...buildLightweightWaShapeStages(), ...templateGroupStages]
    return waCol.aggregate(pipeline, aggOpts).toArray()
  }

  if (phones.length === 0) {
    const rows = await runPipeline([])
    for (const r of rows) mergeTemplateRow(templateAcc, r)
    let totalLeads = 0
    if (callbackStagePreMatch) {
      const countRows = await waCol
        .aggregate(
          [
            ...basePrefix,
            ...buildLightweightWaShapeStages(),
            { $group: { _id: '$_waPhoneNorm' } },
            { $count: 'n' },
          ],
          aggOpts,
        )
        .toArray()
      totalLeads = countRows[0]?.n ?? 0
    }
    return { templateRows: finalizeTemplateRows(templateAcc), totalLeads }
  }

  if (phones.length <= SINGLE_QUERY_PHONE_MAX) {
    const variants = buildPhoneFieldVariants(phones)
    const rows = await runPipeline(buildIndexedPhoneMatchStage(variants))
    for (const r of rows) mergeTemplateRow(templateAcc, r)
    for (const p of phones) matchedPhones.add(p)
    return { templateRows: finalizeTemplateRows(templateAcc), totalLeads: matchedPhones.size }
  }

  const batches = []
  for (let i = 0; i < phones.length; i += PHONE_BATCH_SIZE) {
    batches.push(phones.slice(i, i + PHONE_BATCH_SIZE))
  }

  async function runBatch(batch) {
    const variants = buildPhoneFieldVariants(batch)
    if (!variants.length) return
    const rows = await runPipeline(buildIndexedPhoneMatchStage(variants))
    for (const r of rows) mergeTemplateRow(templateAcc, r)
    for (const p of batch) matchedPhones.add(p)
  }

  for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
    await Promise.all(batches.slice(i, i + BATCH_CONCURRENCY).map(runBatch))
  }

  return { templateRows: finalizeTemplateRows(templateAcc), totalLeads: matchedPhones.size }
}

/** Filter dashboard payment conversion to cohort (server-side). */
export function filterPaymentConversionForCohort(paymentConversion, clickBreakdown, normalizedPhones) {
  if (!paymentConversion) return null
  const normSet = new Set(normalizedPhones)
  if (normSet.size === 0) {
    return {
      ...paymentConversion,
      totalClicked: 0,
      formSubmitted: 0,
      conversionRate: 0,
      formSubmittedMobiles: [],
      formSubmittedDetails: [],
    }
  }
  const details = (paymentConversion.formSubmittedDetails || []).filter((d) => {
    const n = normaliseMobile(d.mobile)
    return n && normSet.has(n)
  })
  let totalClicked = 0
  for (const row of clickBreakdown || []) {
    const n = normaliseMobile(row.phone)
    if (n && normSet.has(n)) totalClicked += 1
  }
  const formSubmitted = details.length
  const conversionRate =
    totalClicked > 0 ? parseFloat(((formSubmitted / totalClicked) * 100).toFixed(2)) : 0
  return {
    ...paymentConversion,
    totalClicked,
    formSubmitted,
    conversionRate,
    formSubmittedMobiles: details.map((d) => d.mobile).filter(Boolean),
    formSubmittedDetails: details,
  }
}

export async function loadMbaDashboardPaymentSlice(client) {
  const doc = await client
    .db('itm')
    .collection('wa_dashboard_cache')
    .findOne(
      { _id: 'wa_latest_mba' },
      { projection: { paymentConversion: 1, clickBreakdown: 1 } },
    )
  return {
    paymentConversion: doc?.paymentConversion ?? null,
    clickBreakdown: doc?.clickBreakdown ?? [],
  }
}
