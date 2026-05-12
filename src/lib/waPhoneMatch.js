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

/** Values for Mongo `$in` when matching WA `_waPhone` (raw + normalised + 91… + +91-… + numeric BSON). */
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
        out.add(`+91-${n}`)
        const as10 = Number(n)
        const as12 = Number(`91${n}`)
        if (Number.isSafeInteger(as10)) out.add(as10)
        if (Number.isSafeInteger(as12)) out.add(as12)
      }
      if (n.length === 12 && n.startsWith('91')) {
        const as = Number(n)
        if (Number.isSafeInteger(as)) out.add(as)
      }
    }
  }
  return [...out]
}
