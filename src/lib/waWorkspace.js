/** WhatsApp analytics workspace: MBA uses itm.marketingwa; IHM uses analytics.IHMmarketingwa. */

/** `itm.wa_dashboard_cache` document _id for each workspace (two separate cache docs). */
export const WA_DASHBOARD_CACHE_ID_MBA = 'wa_latest_mba'
export const WA_DASHBOARD_CACHE_ID_IHM = 'wa_latest_ihm'
/** Legacy MBA cache _id (read fallback only; new writes use WA_DASHBOARD_CACHE_ID_MBA). */
export const WA_DASHBOARD_CACHE_ID_MBA_LEGACY = 'wa_latest'

export const WA_WORKSPACE_MBA = 'mba'
export const WA_WORKSPACE_IHM = 'ihm'

export function normalizeWAWorkspace(raw) {
  const w = String(raw || '').toLowerCase().trim()
  return w === WA_WORKSPACE_IHM ? WA_WORKSPACE_IHM : WA_WORKSPACE_MBA
}

/**
 * True if a cache/API payload belongs to the expected vertical.
 * IHM payloads must include workspace ihm (never trust untagged docs for IHM).
 * MBA may omit workspace only for legacy cache; tagged ihm must never pass as MBA.
 */
export function workspacePayloadMatchesExpected(payload, expectedWorkspace) {
  const exp = normalizeWAWorkspace(expectedWorkspace)
  const gotRaw = payload?.workspace
  if (gotRaw == null || gotRaw === '') {
    return exp === WA_WORKSPACE_MBA
  }
  return normalizeWAWorkspace(gotRaw) === exp
}

const ITM_DB = 'itm'
const ANALYTICS_DB = 'analytics'

/**
 * When IHM is selected, hide MBA-only analytics; WhatsApp API Messages + template drill-downs stay.
 * /settings remains reachable (sidebar still enforces admin).
 */
export function isRouteAllowedForBuWorkspace(pathname, workspace) {
  if (normalizeWAWorkspace(workspace) === WA_WORKSPACE_MBA) return true
  let p = (pathname || '/').split('?')[0]
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1) || '/'
  if (p === '/settings') return true
  if (p === '/wa') return true
  if (p.startsWith('/wa/templates/')) return true
  return false
}

/** Append ?workspace=ihm for IHM so refreshes and links stay on the right BU. */
export function withWorkspaceQuery(href, workspace) {
  if (normalizeWAWorkspace(workspace) !== WA_WORKSPACE_IHM) return href
  const hashIdx = href.indexOf('#')
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : ''
  const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href
  const qIdx = pathPart.indexOf('?')
  const p = qIdx >= 0 ? pathPart.slice(0, qIdx) : pathPart
  const params = new URLSearchParams(qIdx >= 0 ? pathPart.slice(qIdx + 1) : '')
  params.set('workspace', 'ihm')
  return `${p}?${params.toString()}${hash}`
}

export function waWorkspaceConfig(workspace) {
  const w = normalizeWAWorkspace(workspace)
  if (w === WA_WORKSPACE_IHM) {
    return {
      workspace: WA_WORKSPACE_IHM,
      dataDb: ANALYTICS_DB,
      waCollection: 'IHMmarketingwa',
      cacheKey: WA_DASHBOARD_CACHE_ID_IHM,
      includeMbaConversion: false,
    }
  }
  return {
    workspace: WA_WORKSPACE_MBA,
    dataDb: ITM_DB,
    waCollection: 'marketingwa',
    cacheKey: WA_DASHBOARD_CACHE_ID_MBA,
    includeMbaConversion: true,
  }
}
