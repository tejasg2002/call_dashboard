/**
 * MBA template-stage filter: values from
 * data.message.meta_data.source_data.callback_data on ITM_BS Interakt events.
 */

import { normalizeLeadFilterList } from './waLeadMongo.js'
import { normaliseMobile } from './waPhoneMatch.js'

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
 * Phones with ≥1 WA event whose callback_data matches picked stages.
 */
export async function fetchMbaWaPhonesByCallbackStages(waCol, pickedStages, stageGroups) {
  const stageMatch = buildMbaWaLeadStageMatch(pickedStages, stageGroups)
  if (!Object.keys(stageMatch).length) return []

  const rows = await waCol
    .aggregate(
      [
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
