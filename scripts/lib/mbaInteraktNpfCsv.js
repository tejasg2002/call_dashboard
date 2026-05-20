/**
 * Shared CSV + phone match helpers for MBA Interakt NPF lead backfills.
 */

import { createReadStream } from 'node:fs'
import readline from 'node:readline'
import { normaliseMobile, waPhoneVariantsForMatch } from '../../src/lib/waPhoneMatch.js'

export const MBA_INTERAKT_DB = 'ITM_BS'
export const MBA_INTERAKT_COLLECTION = 'interaktWhatsappWebhookEvents'

export function parseCsvLine(line) {
  const parts = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  return parts
}

function findCol(header, patterns) {
  for (const re of patterns) {
    const idx = header.findIndex((h) => re.test(h.trim()))
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * @returns {Promise<{
 *   phoneToLead: Map<string, { source?: string, city?: string, state?: string }>,
 *   stats: Record<string, number>,
 *   columns: { hasSource: boolean, hasCity: boolean, hasState: boolean }
 * }>}
 */
export async function loadNpfLeadPhoneMap(csvPath) {
  const phoneToLead = new Map()
  let csvRows = 0
  let skippedNoPhone = 0
  let duplicatePhones = 0

  const rl = readline.createInterface({
    input: createReadStream(csvPath, { encoding: 'utf8' }),
    crlfDelay: true,
  })

  let header = null
  let mobileIdx = -1
  let sourceIdx = -1
  let cityIdx = -1
  let stateIdx = -1

  for await (const line of rl) {
    if (!line.trim()) continue
    const cols = parseCsvLine(line)
    if (!header) {
      header = cols.map((c) => c.trim())
      mobileIdx = findCol(header, [/^registered_mobile$/i])
      sourceIdx = findCol(header, [/^traffic_channel$/i])
      cityIdx = findCol(header, [/^city$/i])
      stateIdx = findCol(header, [/^state$/i])
      if (mobileIdx < 0) {
        throw new Error(`CSV must have Registered_Mobile column; got: ${header.join(', ')}`)
      }
      continue
    }

    csvRows += 1
    const mobile = cols[mobileIdx]?.trim()
    const norm = normaliseMobile(mobile)
    if (!norm) {
      skippedNoPhone += 1
      continue
    }

    const source = sourceIdx >= 0 ? cols[sourceIdx]?.trim() : ''
    const city = cityIdx >= 0 ? cols[cityIdx]?.trim() : ''
    const state = stateIdx >= 0 ? cols[stateIdx]?.trim() : ''

    if (phoneToLead.has(norm)) duplicatePhones += 1
    phoneToLead.set(norm, {
      ...(source ? { source } : {}),
      ...(city ? { city } : {}),
      ...(state ? { state } : {}),
    })
  }

  return {
    phoneToLead,
    stats: { csvRows, skippedNoPhone, duplicatePhones },
    columns: {
      hasSource: sourceIdx >= 0,
      hasCity: cityIdx >= 0,
      hasState: stateIdx >= 0,
    },
  }
}

export function variantsForPhoneBatch(phones10) {
  const out = new Set()
  for (const p of phones10) {
    for (const v of waPhoneVariantsForMatch([p, `91${p}`, `+91${p}`])) out.add(v)
  }
  return [...out]
}

export function phoneMatchFilter(variants) {
  return {
    $or: [
      { phone_number: { $in: variants } },
      { 'data.customer.phone_number': { $in: variants } },
      { 'data.customer.channel_phone_number': { $in: variants } },
    ],
  }
}

/** Top-level Interakt fields used by wa-dashboard compute (City/city, State/state, source). */
export function mongoSetFromLeadFields(lead) {
  const set = {}
  if (lead.source) set.source = lead.source
  if (lead.city) {
    set.City = lead.city
    set.city = lead.city
  }
  if (lead.state) {
    set.State = lead.state
    set.state = lead.state
  }
  return set
}

/** Group phones that share the same field values for batched updateMany. */
export function groupPhonesByLeadFields(phoneToLead) {
  /** @type {Map<string, { lead: object, phones: string[] }>} */
  const groups = new Map()
  for (const [phone, lead] of phoneToLead) {
    const set = mongoSetFromLeadFields(lead)
    if (Object.keys(set).length === 0) continue
    const key = JSON.stringify(set)
    const g = groups.get(key) || { lead: set, phones: [] }
    g.phones.push(phone)
    groups.set(key, g)
  }
  return groups
}
