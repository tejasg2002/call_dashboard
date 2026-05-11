/**
 * Same rules as app/api/wa-dashboard/compute.js — WA events and CRM phones
 * often disagree on formatting (+91, 91 prefix, spaces, dashes).
 */

export function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim()
  if (n.startsWith('+')) n = n.slice(1)
  n = n.replace(/\D/g, '')
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

/** Values for Mongo `$in` when matching WA `_waPhone` (raw + normalised + 91…). */
export function waPhoneVariantsForMatch(rawList) {
  const out = new Set()
  for (const raw of rawList || []) {
    if (raw == null || raw === '') continue
    const s = String(raw).trim()
    if (!s) continue
    out.add(s)
    const n = normaliseMobile(s)
    if (n) {
      out.add(n)
      if (n.length === 10) {
        out.add(`91${n}`)
        out.add(`+91${n}`)
      }
    }
  }
  return [...out]
}
