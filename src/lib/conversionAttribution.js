/**
 * Parse values from MongoDB / SES / NPF into a valid Date, or null.
 * @param {Date | string | number | null | undefined} value
 * @returns {Date | null}
 */
export function parseOptDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? null : value
  }
  const d = new Date(value)
  const t = d.getTime()
  return Number.isNaN(t) ? null : d
}

/**
 * True if event happened on or after anchor (e.g. form after first template send).
 * @param {Date | string | number | null | undefined} eventDate
 * @param {Date | string | number | null | undefined} anchorDate
 */
export function isOnOrAfter(eventDate, anchorDate) {
  const e = parseOptDate(eventDate)
  const a = parseOptDate(anchorDate)
  if (!e || !a) return false
  return e.getTime() >= a.getTime()
}
