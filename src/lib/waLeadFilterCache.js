/**
 * In-memory TTL cache for WA lead-filter options and MBA callback stage groups.
 * Speeds up repeated page loads and Apply without Redis.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000

/** @type {Map<string, { expires: number, value: unknown }>} */
const store = new Map()

function cacheKey(parts) {
  return parts.join(':')
}

export function getLeadFilterCache(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) {
    store.delete(key)
    return null
  }
  return entry.value
}

export function setLeadFilterCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expires: Date.now() + ttlMs })
}

export function leadFilterOptionsCacheKey(workspace) {
  return cacheKey(['lead_filter_options', workspace])
}

export function mbaStageGroupsCacheKey() {
  return cacheKey(['mba', 'wa_stage_groups'])
}

/** @param {Map<string, string[]>} map */
export function serializeStageGroups(map) {
  return Object.fromEntries(map)
}

/** @param {Record<string, string[]>|null|undefined} obj */
export function deserializeStageGroups(obj) {
  if (!obj || typeof obj !== 'object') return new Map()
  return new Map(Object.entries(obj))
}
