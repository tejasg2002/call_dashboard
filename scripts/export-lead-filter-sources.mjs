#!/usr/bin/env node
/**
 * One CSV: every (workspace, source) pair from WhatsApp lead filter options
 * (GET /api/wa-lead-filter?mode=options → `sources` per BU).
 *
 * Requires COMMUNITY_URI in .env.
 *
 * Usage:
 *   node scripts/export-lead-filter-sources.mjs
 *   node scripts/export-lead-filter-sources.mjs --out=/tmp
 *
 * Output (default --out=./exports):
 *   lead_filter_sources_unique.csv  — workspace_slug, workspace_name, source; deduped per (slug, source); sorted
 */

import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'
import { loadLeadFilterOptions } from '../src/lib/waLeadFilterOptions.js'
import { workspaceDisplayLabel } from '../src/lib/waWorkspace.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const uri = process.env.COMMUNITY_URI
if (!uri) {
  console.error('COMMUNITY_URI is not set in .env')
  process.exit(1)
}

const WORKSPACES = ['mba', 'mba_ai', 'bba', 'btech', 'idm', 'ihm']

function parseOutDir() {
  const arg = process.argv.find((a) => a.startsWith('--out='))
  if (arg) return resolve(arg.slice('--out='.length))
  return resolve(__dirname, '..', 'exports')
}

function csvEscape(cell) {
  const s = String(cell ?? '')
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function main() {
  const outDir = parseOutDir()
  mkdirSync(outDir, { recursive: true })

  const client = new MongoClient(uri)
  await client.connect()
  console.log('Connected. Collecting sources from', WORKSPACES.join(', '))

  /** Dedupe by (workspace, source) — same label in two BUs stays two rows. */
  const pairKey = new Set()
  const rows = []
  for (const ws of WORKSPACES) {
    const res = await loadLeadFilterOptions(client, ws)
    if (res.unavailable) {
      console.warn(`[skip] ${ws}: ${res.unavailable}`)
      continue
    }
    for (const s of res.sources) {
      const t = String(s ?? '').trim()
      if (!t) continue
      const k = `${ws}\t${t}`
      if (pairKey.has(k)) continue
      pairKey.add(k)
      rows.push({
        workspace_slug: ws,
        workspace_name: workspaceDisplayLabel(ws),
        source: t,
      })
    }
    console.log(`  ${ws}: ${res.sources.length} sources in filter list`)
  }

  rows.sort((a, b) => {
    const c = a.workspace_slug.localeCompare(b.workspace_slug)
    if (c !== 0) return c
    return a.source.localeCompare(b.source)
  })

  const lines = ['workspace_slug,workspace_name,source']
  for (const r of rows) {
    lines.push(
      `${csvEscape(r.workspace_slug)},${csvEscape(r.workspace_name)},${csvEscape(r.source)}`,
    )
  }
  const outPath = join(outDir, 'lead_filter_sources_unique.csv')
  writeFileSync(outPath, `\ufeff${lines.join('\n')}`, 'utf8')
  console.log(`\nWrote ${rows.length} rows → ${outPath}`)

  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
