#!/usr/bin/env node
/**
 * CSV of unique WhatsApp template names per BU (same resolution as wa-dashboard compute).
 *
 * Requires COMMUNITY_URI in .env.
 *
 * Usage:
 *   node scripts/export-wa-templates.mjs
 *   node scripts/export-wa-templates.mjs --out=/tmp
 *
 * Output (default ./exports):
 *   wa_templates_unique.csv — workspace_slug, workspace_name, template_name, event_count
 */

import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'
import { isJunkTemplateLabel } from '../src/lib/waInteraktTemplate.js'
import {
  ALL_BU_WORKSPACE_SLUGS,
  workspaceDisplayLabel,
  waWorkspaceConfig,
} from '../src/lib/waWorkspace.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const uri = process.env.COMMUNITY_URI
if (!uri) {
  console.error('COMMUNITY_URI is not set in .env')
  process.exit(1)
}

/** Same _waTemplate expr as app/api/wa-dashboard/compute.js */
const WA_TEMPLATE_EXPR = {
  $ifNull: [
    '$template_name',
    {
      $let: {
        vars: {
          m: {
            $regexFind: {
              input: { $ifNull: ['$data.message.raw_template', ''] },
              regex: '"name"\\s*:\\s*"([^"]+)"',
            },
          },
        },
        in: { $arrayElemAt: ['$$m.captures', 0] },
      },
    },
  ],
}

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

function normalizeTemplateName(raw) {
  const t = String(raw ?? '').trim()
  if (!t || isJunkTemplateLabel(t)) return null
  return t
}

/**
 * @param {import('mongodb').Collection} col
 * @returns {Promise<Map<string, number>>}
 */
async function distinctTemplatesFromCollection(col) {
  const byName = new Map()

  const addRows = (rows) => {
    for (const row of rows) {
      const name = normalizeTemplateName(row._id)
      if (!name) continue
      byName.set(name, (byName.get(name) || 0) + (row.count || 0))
    }
  }

  const resolved = await col
    .aggregate([
      { $addFields: { _waTemplate: WA_TEMPLATE_EXPR } },
      { $match: { _waTemplate: { $nin: [null, ''] } } },
      { $group: { _id: '$_waTemplate', count: { $sum: 1 } } },
    ], { allowDiskUse: true })
    .toArray()
  addRows(resolved)

  for (const field of ['template_name', 'data.message.template_name']) {
    try {
      const vals = await col.distinct(field)
      for (const v of vals) {
        const name = normalizeTemplateName(v)
        if (!name || byName.has(name)) continue
        const n = await col.countDocuments({ [field]: v })
        byName.set(name, n)
      }
    } catch {
      /* path missing on this collection */
    }
  }

  return byName
}

async function templatesForWorkspace(client, workspaceSlug) {
  const cfg = waWorkspaceConfig(workspaceSlug)
  const col = client.db(cfg.dataDb).collection(cfg.waCollection)
  const counts = await distinctTemplatesFromCollection(col)
  const label = workspaceDisplayLabel(workspaceSlug)
  const rows = []
  for (const [template_name, event_count] of counts) {
    rows.push({
      workspace_slug: workspaceSlug,
      workspace_name: label,
      template_name,
      event_count,
    })
  }
  rows.sort((a, b) => a.template_name.localeCompare(b.template_name))
  return rows
}

async function main() {
  const outDir = parseOutDir()
  mkdirSync(outDir, { recursive: true })

  const client = new MongoClient(uri)
  await client.connect()
  console.log('Connected. Collecting templates from', ALL_BU_WORKSPACE_SLUGS.join(', '))

  const allRows = []
  for (const ws of ALL_BU_WORKSPACE_SLUGS) {
    const cfg = waWorkspaceConfig(ws)
    if (!cfg.waCollection) {
      console.log(`  ${ws}: (call-only — skip)`)
      continue
    }
    console.log(`  ${ws}: ${cfg.dataDb}.${cfg.waCollection}`)
    const rows = await templatesForWorkspace(client, ws)
    console.log(`    → ${rows.length} unique templates`)
    allRows.push(...rows)
  }

  allRows.sort((a, b) => {
    const c = a.workspace_slug.localeCompare(b.workspace_slug)
    if (c !== 0) return c
    return a.template_name.localeCompare(b.template_name)
  })

  const lines = ['workspace_slug,workspace_name,template_name,event_count']
  for (const r of allRows) {
    lines.push(
      [
        csvEscape(r.workspace_slug),
        csvEscape(r.workspace_name),
        csvEscape(r.template_name),
        csvEscape(r.event_count),
      ].join(','),
    )
  }

  const outPath = join(outDir, 'wa_templates_unique.csv')
  writeFileSync(outPath, `\ufeff${lines.join('\n')}`, 'utf8')

  const globalUnique = new Set(allRows.map((r) => r.template_name))
  console.log(`\nWrote ${allRows.length} rows (${globalUnique.size} globally unique names) → ${outPath}`)

  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
