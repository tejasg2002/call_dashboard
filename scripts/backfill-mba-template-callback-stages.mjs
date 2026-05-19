#!/usr/bin/env node
/**
 * Set data.message.meta_data.source_data.callback_data from Template CSV (MBA rows only).
 *
 *   ITM_BS.interaktWhatsappWebhookEvents
 *   Match: top-level template_name ↔ CSV template_name
 *
 * Usage:
 *   node scripts/backfill-mba-template-callback-stages.mjs --dry-run
 *   node scripts/backfill-mba-template-callback-stages.mjs --apply
 *   node scripts/backfill-mba-template-callback-stages.mjs --apply --csv="Template _ - Sheet1.csv"
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
  const out = {
    dryRun: true,
    csvPath: resolve(__dirname, '..', 'Template _ - Sheet1.csv'),
    workspace: 'mba',
  }
  for (const a of process.argv.slice(2)) {
    if (a === '--apply') out.dryRun = false
    else if (a === '--dry-run') out.dryRun = true
    else if (a.startsWith('--csv=')) out.csvPath = resolve(a.slice('--csv='.length))
    else if (a.startsWith('--workspace=')) out.workspace = a.slice('--workspace='.length).toLowerCase()
  }
  return out
}

async function main() {
  const uri = process.env.COMMUNITY_URI
  if (!uri) {
    console.error('COMMUNITY_URI is not set in .env')
    process.exit(1)
  }

  const { dryRun, csvPath, workspace } = parseArgs()
  const templateToStage = loadMbaTemplateStageMap(csvPath, workspace)
  console.log(`Loaded ${templateToStage.size} ${workspace.toUpperCase()} template → stage mappings from:\n  ${csvPath}`)
  console.log(dryRun ? '\n*** DRY RUN (pass --apply to write) ***\n' : '\n*** APPLYING UPDATES ***\n')

  const client = new MongoClient(uri)
  await client.connect()
  const col = client.db(DB).collection(COLLECTION)

  let totalMatched = 0
  let totalModified = 0
  const missingInCsv = []

  for (const [templateName, stage] of [...templateToStage.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const filter = { template_name: templateName }
    const matched = await col.countDocuments(filter)
    totalMatched += matched

    if (matched === 0) {
      console.log(`  [skip] ${templateName} → "${stage}" (0 docs)`)
      continue
    }

    if (dryRun) {
      const already = await col.countDocuments({
        ...filter,
        [CALLBACK_PATH]: stage,
      })
      console.log(
        `  ${templateName} → "${stage}": ${matched} docs (${already} already set)`,
      )
      continue
    }

    const res = await col.updateMany(filter, {
      $set: { [CALLBACK_PATH]: stage },
    })
    totalModified += res.modifiedCount
    console.log(
      `  ${templateName} → "${stage}": matched=${res.matchedCount} modified=${res.modifiedCount}`,
    )
  }

  const distinctTemplates = await col.distinct('template_name', {
    template_name: { $nin: [null, ''] },
  })
  for (const t of distinctTemplates) {
    if (typeof t !== 'string' || !t.trim()) continue
    if (!templateToStage.has(t.trim())) missingInCsv.push(t.trim())
  }
  missingInCsv.sort()

  console.log('\n--- Summary ---')
  console.log(`Templates in CSV: ${templateToStage.size}`)
  console.log(`Documents matched by template_name: ${totalMatched.toLocaleString()}`)
  if (!dryRun) console.log(`Documents modified: ${totalModified.toLocaleString()}`)
  if (missingInCsv.length > 0) {
    console.log(
      `\n${missingInCsv.length} template_name values in Mongo with no CSV row (unchanged):`,
    )
    missingInCsv.slice(0, 30).forEach((t) => console.log(`  - ${t}`))
    if (missingInCsv.length > 30) console.log(`  … and ${missingInCsv.length - 30} more`)
  }

  await client.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
