/**
 * Maps raw lead "source" strings (CRM / NPF webhooks) to **Primary** labels for WhatsApp
 * lead filters, using `leadFilterSourcePrimaryRows.json` (built from the mapping CSV).
 */

import ROWS from './leadFilterSourcePrimaryRows.json'
import {
  canonicalLeadText,
  leadFilterValueVariants,
  normalizeLeadFilterList,
} from './waLeadMongo.js'

/** @type {Record<string, Array<[string, string]>>} */
const BY_WS = ROWS

/**
 * @param {string} workspace
 * @returns {boolean}
 */
export function workspaceUsesLeadSourcePrimaryMap(workspace) {
  const ws = String(workspace || '')
    .toLowerCase()
    .trim()
  return Array.isArray(BY_WS[ws]) && BY_WS[ws].length > 0
}

/**
 * @param {string} workspace
 * @returns {{
 *   exactRawToPrimary: Map<string, string>
 *   canonRawToPrimary: Map<string, string>
 *   primaryCanonToLabel: Map<string, string>
 *   primaryCanonToRaws: Map<string, Set<string>>
 * }}
 */
function buildIndex(workspace) {
  const ws = String(workspace || '')
    .toLowerCase()
    .trim()
  const rows = BY_WS[ws] || []
  const exactRawToPrimary = new Map()
  const canonRawToPrimary = new Map()
  const primaryCanonToLabel = new Map()
  const primaryCanonToRaws = new Map()

  for (const pair of rows) {
    const raw = String(pair[0] ?? '').trim()
    let primary = String(pair[1] ?? '').trim()
    if (!raw) continue
    if (!primary) primary = raw

    exactRawToPrimary.set(raw, primary)
    const rawC = canonicalLeadText(raw)
    if (rawC) canonRawToPrimary.set(rawC, primary)

    const pc = canonicalLeadText(primary)
    if (!pc) continue
    if (!primaryCanonToLabel.has(pc)) primaryCanonToLabel.set(pc, primary)
    if (!primaryCanonToRaws.has(pc)) primaryCanonToRaws.set(pc, new Set())
    primaryCanonToRaws.get(pc).add(raw)
  }

  return { exactRawToPrimary, canonRawToPrimary, primaryCanonToLabel, primaryCanonToRaws }
}

const indexCache = new Map()

function getIndex(workspace) {
  const ws = String(workspace || '')
    .toLowerCase()
    .trim()
  if (!indexCache.has(ws)) indexCache.set(ws, buildIndex(ws))
  return indexCache.get(ws)
}

/**
 * Map one raw source value from Mongo to its Primary label (passthrough if unknown).
 * @param {string} workspace
 * @param {unknown} rawValue
 * @returns {string}
 */
export function mapLeadSourceRawToPrimaryForWorkspace(workspace, rawValue) {
  if (!workspaceUsesLeadSourcePrimaryMap(workspace)) return String(rawValue ?? '').trim()
  const s = String(rawValue ?? '').trim()
  if (!s) return ''
  const { exactRawToPrimary, canonRawToPrimary } = getIndex(workspace)
  if (exactRawToPrimary.has(s)) return exactRawToPrimary.get(s)
  const c = canonicalLeadText(s)
  return (c && canonRawToPrimary.get(c)) || s
}

/**
 * Dedupe + sort Primary labels for the lead source multiselect.
 * @param {string} workspace
 * @param {string[]} rawSources
 * @returns {string[]}
 */
export function mapLeadSourcesToPrimaryOptions(workspace, rawSources) {
  const list = rawSources || []
  if (!workspaceUsesLeadSourcePrimaryMap(workspace)) {
    return [...new Set(list.map((x) => String(x || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    )
  }
  const out = new Set()
  for (const v of list) {
    const p = mapLeadSourceRawToPrimaryForWorkspace(workspace, v)
    if (p) out.add(p)
  }
  return [...out].sort((a, b) => a.localeCompare(b))
}

/**
 * When the user picks Primary label(s), expand to all raw source strings in that bucket
 * (plus variants) so Mongo `$match` still hits CRM / webhook docs that store raw values.
 * @param {string} workspace
 * @param {string[]|string|null|undefined} picks
 * @returns {string[]}
 */
export function expandLeadFilterSourcePicksForMatch(workspace, picks) {
  const list = normalizeLeadFilterList(picks)
  if (!workspaceUsesLeadSourcePrimaryMap(workspace) || list.length === 0) return list

  const { primaryCanonToLabel, primaryCanonToRaws } = getIndex(workspace)
  const expanded = new Set()

  for (const pick of list) {
    for (const v of leadFilterValueVariants(pick)) {
      if (v) expanded.add(v)
    }

    const pickCanon = canonicalLeadText(pick)
    for (const [pc, raws] of primaryCanonToRaws) {
      const label = primaryCanonToLabel.get(pc) || ''
      const labelCanon = canonicalLeadText(label)
      let hit = false
      if (pickCanon && (pickCanon === pc || pickCanon === labelCanon)) hit = true
      if (!hit && pick === label) hit = true
      if (!hit) {
        for (const r of raws) {
          if (r === pick || canonicalLeadText(r) === pickCanon) {
            hit = true
            break
          }
        }
      }
      if (!hit) continue
      if (label) {
        expanded.add(label)
        for (const lv of leadFilterValueVariants(label)) if (lv) expanded.add(lv)
      }
      for (const r of raws) {
        expanded.add(r)
        for (const rv of leadFilterValueVariants(r)) if (rv) expanded.add(rv)
      }
    }
  }

  return [...expanded].filter(Boolean)
}
