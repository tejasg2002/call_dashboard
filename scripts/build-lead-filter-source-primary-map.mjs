/**
 * Reads lead_filter_sources_unique CSV (with Primary column) and writes
 * src/lib/leadFilterSourcePrimaryRows.json for WhatsApp lead source dropdown + filter expansion.
 *
 * Usage:
 *   node scripts/build-lead-filter-source-primary-map.mjs [path/to.csv]
 *
 * Default input: ../lead_filter_sources_unique - lead_filter_sources_unique.csv
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const defaultInput = path.join(root, 'lead_filter_sources_unique - lead_filter_sources_unique.csv')
const input = path.resolve(process.argv[2] || defaultInput)
const output = path.join(root, 'src', 'lib', 'leadFilterSourcePrimaryRows.json')

if (!fs.existsSync(input)) {
  console.error('Input not found:', input)
  process.exit(1)
}

const text = fs.readFileSync(input, 'utf8')
const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
const header = lines[0]
if (!/\bPrimary\b/i.test(header)) {
  console.error('Expected a "Primary" column in the CSV header:', header)
  process.exit(1)
}

/** slug, name, source, Primary — source may not contain commas; Primary must not contain commas. */
function parseRow(line) {
  const i1 = line.indexOf(',')
  const i2 = line.indexOf(',', i1 + 1)
  const i3 = line.lastIndexOf(',')
  if (i1 < 0 || i2 <= i1 || i3 <= i2) return null
  const slug = line.slice(0, i1).trim().toLowerCase()
  const source = line.slice(i2 + 1, i3).trim()
  let primary = line.slice(i3 + 1).trim()
  if (!source) return null
  if (!primary) primary = source
  return { slug, source, primary }
}

const byWs = {}
for (let i = 1; i < lines.length; i++) {
  const row = parseRow(lines[i])
  if (!row) continue
  if (!byWs[row.slug]) byWs[row.slug] = []
  byWs[row.slug].push([row.source, row.primary])
}

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(byWs) + '\n', 'utf8')
console.log('Wrote', output)
for (const k of Object.keys(byWs).sort()) {
  console.log(`  ${k}: ${byWs[k].length} rows`)
}
