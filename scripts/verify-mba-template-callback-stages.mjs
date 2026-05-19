#!/usr/bin/env node
/**
 * Report callback_data backfill status for every MBA template in the CSV.
 *
 *   node scripts/verify-mba-template-callback-stages.mjs
 *   node scripts/verify-mba-template-callback-stages.mjs --csv="Template _ - Sheet1.csv"
 */

import 'dotenv/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'
import { loadMbaTemplateStageMap } from '../src/lib/mbaTemplateCsvStages.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DB = 'ITM_BS'
const COLLECTION = 'interaktWhatsappWebhookEvents'
const CALLBACK_PATH = 'data.message.meta_data.source_data.callback_data'

function parseArgs() {
  const out = { csvPath: resolve(__dirname, '..', 'Template _ - Sheet1.csv') }
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--csv=')) out.csvPath = resolve(a.slice('--csv='.length))
  }
  return out
}

async function main() {
  const uri = process.env.COMMUNITY_URI
  if (!uri) {
    console.error('COMMUNITY_URI is not set in .env')
    process.exit(1)
  }

  const { csvPath } = parseArgs()
  const templateToStage = loadMbaTemplateStageMap(csvPath, 'mba')
  const csvTemplates = [...templateToStage.keys()]
  console.log(`MBA templates in CSV: ${templateToStage.size}\n`)

  const client = new MongoClient(uri)
  await client.connect()
  const col = client.db(DB).collection(COLLECTION)

  console.log('Aggregating by template_name + callback_data…')
  const aggRows = await col
    .aggregate(
      [
        { $match: { template_name: { $in: csvTemplates } } },
        {
          $group: {
            _id: {
              template: '$template_name',
              callback: `$${CALLBACK_PATH}`,
            },
            count: { $sum: 1 },
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray()

  /** @type {Map<string, { total: number, correct: number, missing: number, wrong: number }>} */
  const statsByTemplate = new Map()
  for (const tpl of csvTemplates) {
    statsByTemplate.set(tpl, { total: 0, correct: 0, missing: 0, wrong: 0 })
  }

  for (const row of aggRows) {
    const template = row._id?.template
    const callback = row._id?.callback
    const count = row.count || 0
    if (!template || !statsByTemplate.has(template)) continue
    const expected = templateToStage.get(template)
    const s = statsByTemplate.get(template)
    s.total += count
    if (callback === expected) s.correct += count
    else if (callback == null || callback === '') s.missing += count
    else s.wrong += count
  }

  const rows = csvTemplates.sort().map((templateName) => ({
    templateName,
    stage: templateToStage.get(templateName),
    ...statsByTemplate.get(templateName),
  }))

  let sumTotal = 0
  let sumCorrect = 0
  let sumMissing = 0
  let sumWrong = 0
  for (const r of rows) {
    sumTotal += r.total
    sumCorrect += r.correct
    sumMissing += r.missing
    sumWrong += r.wrong
  }

  const complete = rows.filter((r) => r.total > 0 && r.correct === r.total)
  const partial = rows.filter((r) => r.total > 0 && r.correct > 0 && r.correct < r.total)
  const notUpdated = rows.filter((r) => r.total > 0 && r.correct === 0)
  const noDocs = rows.filter((r) => r.total === 0)

  console.log('\n--- Per template (top-level template_name) ---\n')
  for (const r of rows) {
    if (r.total === 0) {
      console.log(`  [no docs]  ${r.templateName} → "${r.stage}"`)
      continue
    }
    const pct = ((r.correct / r.total) * 100).toFixed(1)
    const flag = r.correct === r.total ? '✓' : r.correct === 0 ? '✗' : '~'
    console.log(
      `  ${flag} ${r.templateName} → "${r.stage}": ${r.correct}/${r.total} correct (${pct}%)` +
        (r.wrong ? `, wrong=${r.wrong}` : '') +
        (r.missing ? `, missing=${r.missing}` : ''),
    )
  }

  console.log('\n--- Summary ---')
  console.log(`Templates in CSV:              ${templateToStage.size}`)
  console.log(`Fully updated (100%):          ${complete.length}`)
  console.log(`Partially updated:             ${partial.length}`)
  console.log(`Has docs but 0% updated:       ${notUpdated.length}`)
  console.log(`No docs at template_name:      ${noDocs.length}`)
  console.log(`Documents (template_name):     ${sumTotal.toLocaleString()}`)
  console.log(`  with correct callback_data:  ${sumCorrect.toLocaleString()}`)
  console.log(`  missing callback_data:       ${sumMissing.toLocaleString()}`)
  console.log(`  wrong callback_data:         ${sumWrong.toLocaleString()}`)

  if (notUpdated.length) {
    console.log('\nNot updated (have docs, 0 correct):')
    notUpdated.forEach((r) => console.log(`  - ${r.templateName} (${r.total} docs)`))
  }
  if (partial.length) {
    console.log('\nPartially updated:')
    partial.forEach((r) =>
      console.log(`  - ${r.templateName}: ${r.correct}/${r.total} → "${r.stage}"`),
    )
  }
  if (noDocs.length) {
    console.log('\nNo documents (template_name not set on any doc):')
    noDocs.forEach((r) => console.log(`  - ${r.templateName} → "${r.stage}"`))
  }

  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
