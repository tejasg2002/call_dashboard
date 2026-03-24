/**
 * Minimal RFC-style CSV line parser (handles quoted fields and doubled quotes).
 * @param {string} line
 * @returns {string[]}
 */
export function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === ',') {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

/**
 * @param {string} text - full CSV body
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  let first = lines[0]
  if (first.charCodeAt(0) === 0xfeff) first = first.slice(1)

  const headers = parseCsvLine(first).map((h) => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    if (cells.every((c) => c.trim() === '')) continue
    const obj = {}
    headers.forEach((h, j) => {
      obj[h] = (cells[j] ?? '').trim()
    })
    rows.push(obj)
  }
  return { headers, rows }
}
