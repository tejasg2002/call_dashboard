/**
 * MBA template-stage filter: values from
 * data.message.meta_data.source_data.callback_data on ITM_BS Interakt events.
 */

import { normalizeLeadFilterList } from './waLeadMongo.js'
import { normaliseMobile } from './waPhoneMatch.js'
import { buildWaEventDatePreStages } from './waLeadAnalyticsExpr.js'

/** Legacy Interakt compat values — not NPF traffic channels. */
const LEGACY_WA_SOURCE_VALUES = new Set(['api', 'campaign'])

/** Mongo path to template-assigned lead stage on ITM_BS Interakt events. */
export const MBA_WA_CALLBACK_DATA_PATH =
  'data.message.meta_data.source_data.callback_data'

/**
 * Canonical sort order for stages present in Mongo (user-provided list).
 * Dropdown only shows values that exist in DB; order follows this list.
 */
export const MBA_DB_LEAD_STAGE_ORDER = Object.freeze([
  'All Stages',
  'AI Chatbot',
  'Interested & Eligible',
  'Application Stage : Not Interested',
  'Form Status : Incomplete',
  'Application Stage : In process',
  'Application Stage : Offer Letter',
  'Not Connected',
  'Not Interested',
  'Untouched',
  'Follow Up',
  'Not Eligible',
  'All Stage',
])

export function mbaWaCallbackStageExpr() {
  return `$${MBA_WA_CALLBACK_DATA_PATH}`
}

/** Trim + group aliases such as "All Stages", "All Stage", "All Stages ". */
export function normalizeMbaCallbackStageKey(raw) {
  const t = String(raw ?? '').trim()
  if (!t) return ''
  if (/^all stages?$/i.test(t)) return 'all_stages'
  return t.toLowerCase()
}

function pickDisplayLabel(rawValues) {
  const trimmed = rawValues.map((r) => String(r).trim()).filter(Boolean)
  for (const preferred of MBA_DB_LEAD_STAGE_ORDER) {
    if (trimmed.some((t) => t === preferred)) return preferred
  }
  return trimmed[0] || String(rawValues[0] ?? '').trim()
}

function sortDisplayLabels(labels) {
  const order = MBA_DB_LEAD_STAGE_ORDER
  const set = new Set(labels)
  const ordered = order.filter((s) => set.has(s))
  const rest = [...set].filter((s) => !order.includes(s)).sort((a, b) => a.localeCompare(b))
  return [...ordered, ...rest]
}

/**
 * Load distinct callback_data from Mongo; one dropdown row per alias group.
 * @returns {Promise<{ leadStages: string[], stageGroups: Map<string, string[]> }>}
 */
export async function loadMbaLeadStageFilterOptions(waCol, callbackPath = MBA_WA_CALLBACK_DATA_PATH) {
  if (!waCol) {
    return { leadStages: [], stageGroups: new Map() }
  }

  let rawDistinct = []
  try {
    rawDistinct = await waCol.distinct(callbackPath, {
      [callbackPath]: { $nin: [null, ''] },
    })
  } catch {
    rawDistinct = []
  }

  const allowedKeys = new Set(MBA_DB_LEAD_STAGE_ORDER.map((s) => normalizeMbaCallbackStageKey(s)))

  const stageGroups = new Map()
  for (const raw of rawDistinct) {
    if (raw == null || String(raw).trim() === '') continue
    const key = normalizeMbaCallbackStageKey(raw)
    if (!key || !allowedKeys.has(key)) continue
    const list = stageGroups.get(key) || []
    if (!list.includes(raw)) list.push(raw)
    stageGroups.set(key, list)
  }

  const leadStages = sortDisplayLabels(
    [...stageGroups.values()].map((rawValues) => pickDisplayLabel(rawValues)),
  )

  return { leadStages, stageGroups }
}

/**
 * Map UI picks → all raw Mongo callback_data strings to match.
 * @param {string[]} pickedStages
 * @param {Map<string, string[]>} stageGroups from loadMbaLeadStageFilterOptions
 * @param {string[]} [rawDistinct] optional; loaded when stageGroups empty
 */
export function expandMbaStagePicksToDbValues(pickedStages, stageGroups, rawDistinct = []) {
  const picks = normalizeLeadFilterList(pickedStages)
  if (!picks.length) return []

  const pickKeys = new Set(picks.map((p) => normalizeMbaCallbackStageKey(p)))

  if (stageGroups.size > 0) {
    const out = new Set()
    for (const [key, rawValues] of stageGroups) {
      const label = pickDisplayLabel(rawValues)
      if (pickKeys.has(key) || picks.includes(label)) {
        for (const v of rawValues) out.add(v)
      }
    }
    return [...out]
  }

  return rawDistinct.filter((raw) => pickKeys.has(normalizeMbaCallbackStageKey(raw)))
}

/**
 * @param {string[]} pickedStages
 * @param {Map<string, string[]>} [stageGroups]
 */
export function buildMbaWaLeadStageMatch(pickedStages, stageGroups) {
  const dbValues = expandMbaStagePicksToDbValues(pickedStages, stageGroups || new Map())
  if (dbValues.length) {
    return { [MBA_WA_CALLBACK_DATA_PATH]: { $in: dbValues } }
  }
  const picks = normalizeLeadFilterList(pickedStages)
  if (!picks.length) return {}
  return { [MBA_WA_CALLBACK_DATA_PATH]: { $in: picks } }
}

/** @deprecated */
export function buildMbaWaCallbackStageMatch(pickedStages, stageGroups) {
  return buildMbaWaLeadStageMatch(pickedStages, stageGroups)
}

/** @deprecated */
export async function loadMbaCallbackLeadStages(waCol) {
  const { leadStages } = await loadMbaLeadStageFilterOptions(waCol)
  return leadStages
}

/**
 * Distinct traffic-channel values on top-level `source` (post backfill).
 * @returns {Promise<string[]>}
 */
export async function loadMbaInteraktSourceOptions(waCol) {
  if (!waCol) return []
  let raw = []
  try {
    raw = await waCol.distinct('source', { source: { $nin: [null, ''] } })
  } catch {
    return []
  }
  return [...new Set(
    raw
      .map((s) => String(s ?? '').trim())
      .filter((s) => s && !LEGACY_WA_SOURCE_VALUES.has(s.toLowerCase())),
  )].sort((a, b) => a.localeCompare(b))
}

/** MBA source filter: exact picks match interakt `source` (no CRM primary-map expansion). */
export function normalizeMbaWaSourcePicks(pickedSources) {
  return normalizeLeadFilterList(pickedSources)
}

/**
 * Phones with ≥1 WA event whose top-level `source` is in picked traffic channels.
 */
function buildWaLocationMatch(pickedCities, pickedStates) {
  const cities = normalizeLeadFilterList(pickedCities)
  const states = normalizeLeadFilterList(pickedStates)
  const clauses = []
  if (cities.length) {
    clauses.push({ $or: [{ City: { $in: cities } }, { city: { $in: cities } }] })
  }
  if (states.length) {
    clauses.push({ $or: [{ State: { $in: states } }, { state: { $in: states } }] })
  }
  if (!clauses.length) return null
  return clauses.length === 1 ? clauses[0] : { $and: clauses }
}

async function distinctInteraktField(waCol, fieldCap, fieldLower) {
  const capPath = '$' + fieldCap
  const lowerPath = '$' + fieldLower
  const rows = await waCol
    .aggregate(
      [
        {
          $match: {
            $or: [
              { [fieldCap]: { $nin: [null, ''] } },
              { [fieldLower]: { $nin: [null, ''] } },
            ],
          },
        },
        {
          $group: {
            _id: { $ifNull: [capPath, lowerPath] },
          },
        },
        { $match: { _id: { $nin: [null, ''] } } },
        { $sort: { _id: 1 } },
      ],
      { allowDiskUse: true, maxTimeMS: 60_000 },
    )
    .toArray()
  return rows.map((r) => String(r._id).trim()).filter(Boolean)
}

/** @returns {Promise<string[]>} */
export async function loadMbaInteraktCityOptions(waCol) {
  if (!waCol) return []
  try {
    return await distinctInteraktField(waCol, 'City', 'city')
  } catch {
    return []
  }
}

/** @returns {Promise<string[]>} */
export async function loadMbaInteraktStateOptions(waCol) {
  if (!waCol) return []
  try {
    return await distinctInteraktField(waCol, 'State', 'state')
  } catch {
    return []
  }
}

export function normalizeMbaWaLocationPicks(pickedCities, pickedStates) {
  return {
    cities: normalizeLeadFilterList(pickedCities),
    states: normalizeLeadFilterList(pickedStates),
  }
}

/**
 * Phones with ≥1 WA event matching backfilled City / State (AND across dimensions when both set).
 */
export async function fetchMbaWaPhonesByWaLocation(
  waCol,
  pickedCities,
  pickedStates,
  startDate = '',
  endDate = '',
) {
  const locMatch = buildWaLocationMatch(pickedCities, pickedStates)
  if (!locMatch) return []

  const rows = await waCol
    .aggregate(
      [
        ...buildWaEventDatePreStages(startDate, endDate),
        { $match: locMatch },
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
        { $group: { _id: '$_waPhone' } },
      ],
      { allowDiskUse: true, maxTimeMS: 90_000 },
    )
    .toArray()

  return rows.map((r) => r._id).filter(Boolean)
}

export async function fetchMbaWaPhonesByWaSource(waCol, pickedSources, startDate = '', endDate = '') {
  const sources = normalizeMbaWaSourcePicks(pickedSources)
  if (!sources.length) return []

  const rows = await waCol
    .aggregate(
      [
        ...buildWaEventDatePreStages(startDate, endDate),
        { $match: { source: { $in: sources } } },
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
        { $group: { _id: '$_waPhone' } },
      ],
      { allowDiskUse: true, maxTimeMS: 90_000 },
    )
    .toArray()

  return rows.map((r) => r._id).filter(Boolean)
}

export async function fetchMbaWaPhonesByCallbackStages(
  waCol,
  pickedStages,
  stageGroups,
  startDate = '',
  endDate = '',
) {
  const stageMatch = buildMbaWaLeadStageMatch(pickedStages, stageGroups)
  if (!Object.keys(stageMatch).length) return []

  const rows = await waCol
    .aggregate(
      [
      ...buildWaEventDatePreStages(startDate, endDate),
      { $match: stageMatch },
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
      { $group: { _id: '$_waPhone' } },
    ],
      { allowDiskUse: true },
    )
    .toArray()

  return rows.map((r) => r._id).filter(Boolean)
}

export function intersectPhoneLists(a, b) {
  if (!a?.length) return []
  if (!b?.length) return []
  const setB = new Set(b.map(normaliseMobile).filter(Boolean))
  const seen = new Set()
  const out = []
  for (const raw of a) {
    const n = normaliseMobile(raw)
    if (!n || !setB.has(n) || seen.has(n)) continue
    seen.add(n)
    out.push(raw)
  }
  return out
}
