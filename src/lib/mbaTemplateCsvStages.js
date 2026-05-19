/**
 * MBA template → lead stage mapping from Template _ - Sheet1.csv (workspace_slug = mba).
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export const DEFAULT_MBA_TEMPLATE_CSV = resolve(
  __dirname,
  '../../Template _ - Sheet1.csv',
)

function parseCsvLine(line) {
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

/** @returns {{ slugIdx: number, tplIdx: number, stageIdx: number, startRow: number }} */
function resolveCsvColumns(lines) {
  const header = parseCsvLine(lines[0])
  const tplIdx = header.findIndex((h) => /^template_name$/i.test(h.trim()))
  const stageIdx = header.findIndex((h) => /lead\s*stage/i.test(h.trim()))
  if (tplIdx >= 0 && stageIdx >= 0) {
    return {
      slugIdx: header.findIndex((h) => /^workspace_slug$/i.test(h.trim())),
      tplIdx,
      stageIdx,
      startRow: 1,
    }
  }
  // Headerless export: mba,MBA,<template>,<volume>,<lead stage>
  const first = parseCsvLine(lines[0])
  if (first[0]?.trim().toLowerCase() === 'mba' && first.length >= 5) {
    return { slugIdx: 0, tplIdx: 2, stageIdx: 4, startRow: 0 }
  }
  throw new Error(
    `CSV must have template_name and Lead Stage columns, or headerless mba rows; got: ${header.join(', ')}`,
  )
}

/**
 * @param {string} [csvPath]
 * @param {string} [workspaceFilter]
 * @returns {Map<string, string>} template_name → lead stage
 */
export function loadMbaTemplateStageMap(csvPath = DEFAULT_MBA_TEMPLATE_CSV, workspaceFilter = 'mba') {
  const text = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const { slugIdx, tplIdx, stageIdx, startRow } = resolveCsvColumns(lines)

  const map = new Map()
  for (let i = startRow; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const slug = (slugIdx >= 0 ? cols[slugIdx] : cols[0])?.trim().toLowerCase()
    if (slug !== workspaceFilter) continue
    const template = cols[tplIdx]?.trim()
    const stage = cols[stageIdx]?.trim()
    if (!template || !stage) continue
    if (!map.has(template)) map.set(template, stage)
  }
  return map
}

