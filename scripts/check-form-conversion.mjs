#!/usr/bin/env node
/**
 * Print WhatsApp "Form conversion" metrics (mirrors app/api/wa-dashboard/compute.js).
 *
 * Clicked users (marketingwa) with npfMbaApplications application_no set,
 * where form timestamp is on/after first sent/delivered and on/after the latest
 * WA click for that phone (full click history), so clicks after submit do not count.
 *
 * Usage:
 *   npm run check-form-conversion
 *   node scripts/check-form-conversion.mjs --fresh
 *   node scripts/check-form-conversion.mjs --from 2025-01-01 --to 2025-01-31
 *
 * Env: COMMUNITY_URI in .env (repo root).
 */

import { config } from 'dotenv'
import { MongoClient } from 'mongodb'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { isOnOrAfter, parseOptDate } from '../src/lib/conversionAttribution.js'
import {
  WA_DASHBOARD_CACHE_ID_MBA,
  WA_DASHBOARD_CACHE_ID_MBA_LEGACY,
} from '../src/lib/waWorkspace.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '..', '.env') })

const DB = 'itm'
const WA_COL = 'marketingwa'
const APPS_COL = 'npfMbaApplications'

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

function parseArgs(argv) {
  const out = { fresh: false, startDate: null, endDate: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--fresh') out.fresh = true
    else if (a === '--from' && argv[i + 1]) out.startDate = argv[++i]
    else if (a === '--to' && argv[i + 1]) out.endDate = argv[++i]
    else if (a === '--help' || a === '-h') {
      console.log(`
Usage: node scripts/check-form-conversion.mjs [options]

  --fresh              Do not read wa_dashboard_cache (always query Mongo)
  --from YYYY-MM-DD    Filter WA rows by event_timestamp
  --to YYYY-MM-DD
  -h, --help

Default: try wa_latest_mba (or legacy wa_latest) paymentConversion from wa_dashboard_cache (fast), unless --fresh or date range.
`)
      process.exit(0)
    }
  }
  return out
}

async function main() {
  const uri = process.env.COMMUNITY_URI
  if (!uri) {
    console.error('COMMUNITY_URI is not set (.env)')
    process.exit(1)
  }

  const { fresh, startDate, endDate } = parseArgs(process.argv)
  const hasRange = Boolean(startDate || endDate)

  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db(DB)
  const waCol = db.collection(WA_COL)
  const cacheCol = db.collection('wa_dashboard_cache')

  try {
    if (!fresh && !hasRange) {
      let cached = await cacheCol.findOne({ _id: WA_DASHBOARD_CACHE_ID_MBA })
      if (!cached) cached = await cacheCol.findOne({ _id: WA_DASHBOARD_CACHE_ID_MBA_LEGACY })
      if (cached?.paymentConversion) {
        printResult(cached.paymentConversion, {
          source: 'wa_dashboard_cache (MBA)',
          elapsedMs: 0,
          dateRange: null,
        })
        return
      }
      console.log('(no MBA wa_dashboard_cache doc — computing…)\n')
    }

    const matchFilter = {}
    if (hasRange) {
      matchFilter.event_timestamp = {}
      if (startDate) matchFilter.event_timestamp.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setDate(end.getDate() + 1)
        matchFilter.event_timestamp.$lt = end
      }
    }

    const t0 = Date.now()

    const clickedPhonesResult = await waCol
      .aggregate([
        { $match: { ...matchFilter, stage: 'clicked' } },
        { $group: { _id: '$phone_number' } },
      ])
      .toArray()

    const clickedPhones = clickedPhonesResult.map((r) => String(r._id)).filter(Boolean)
    const normalisedClickedMobiles = [...new Set(clickedPhones.map(normaliseMobile).filter(Boolean))]
    const clickedPhoneDedup = [...new Set(clickedPhones.filter(Boolean))]

    const firstOutboundResult =
      clickedPhoneDedup.length > 0
        ? await waCol
            .aggregate([
              {
                $match: {
                  phone_number: { $in: clickedPhoneDedup },
                  stage: { $in: ['sent', 'delivered'] },
                },
              },
              {
                $group: {
                  _id: '$phone_number',
                  firstOutbound: { $min: '$event_timestamp' },
                },
              },
            ])
            .toArray()
        : []

    const firstOutboundByNorm = new Map()
    for (const row of firstOutboundResult) {
      const norm = normaliseMobile(row._id)
      if (!norm) continue
      const anchor = parseOptDate(row.firstOutbound)
      if (!anchor) continue
      const prev = firstOutboundByNorm.get(norm)
      if (!prev || anchor.getTime() < prev.getTime()) firstOutboundByNorm.set(norm, anchor)
    }

    const lastClickResult =
      clickedPhoneDedup.length > 0
        ? await waCol
            .aggregate([
              {
                $match: {
                  phone_number: { $in: clickedPhoneDedup },
                  stage: 'clicked',
                },
              },
              {
                $addFields: {
                  _clickAt: { $ifNull: ['$click_timestamp', '$event_timestamp'] },
                },
              },
              {
                $group: {
                  _id: '$phone_number',
                  lastClickAt: { $max: '$_clickAt' },
                },
              },
            ])
            .toArray()
        : []

    const lastClickByNorm = new Map()
    for (const row of lastClickResult) {
      const norm = normaliseMobile(row._id)
      if (!norm) continue
      const t = parseOptDate(row.lastClickAt)
      if (!t) continue
      const prev = lastClickByNorm.get(norm)
      if (!prev || t.getTime() > prev.getTime()) lastClickByNorm.set(norm, t)
    }

    const appsCol = db.collection(APPS_COL)
    const formSubmittedAgg =
      normalisedClickedMobiles.length > 0
        ? await appsCol
            .aggregate([
              {
                $match: {
                  'personal_details.mobile_number': { $in: normalisedClickedMobiles },
                  'application_detail.application_no': { $ne: '' },
                },
              },
              {
                $group: {
                  _id: '$personal_details.mobile_number',
                  formSubmittedAt: { $max: { $ifNull: ['$createdAt', '$updatedAt'] } },
                },
              },
            ])
            .toArray()
        : []

    const formSubmittedResult = formSubmittedAgg.filter((r) => {
      const norm = normaliseMobile(r._id)
      const outboundAnchor = firstOutboundByNorm.get(norm)
      const lastClick = lastClickByNorm.get(norm)
      if (!outboundAnchor || !lastClick || r.formSubmittedAt == null) return false
      if (!isOnOrAfter(r.formSubmittedAt, outboundAnchor)) return false
      return isOnOrAfter(r.formSubmittedAt, lastClick)
    })

    const formSubmittedCount = formSubmittedResult.length
    const formSubmittedMobiles = formSubmittedResult.map((r) => r._id)

    const convertedMobiles = [...new Set(formSubmittedMobiles)]
    const clickAttrResult =
      convertedMobiles.length > 0
        ? await waCol
            .aggregate([
              { $match: { stage: 'clicked', phone_number: { $in: convertedMobiles } } },
              {
                $group: {
                  _id: '$phone_number',
                  templates: { $addToSet: '$template_name' },
                  buttons: { $addToSet: '$button_text' },
                },
              },
            ])
            .toArray()
        : []

    const clickAttrMap = new Map()
    for (const r of clickAttrResult) {
      clickAttrMap.set(normaliseMobile(r._id), {
        templates: (r.templates || []).filter(Boolean),
        buttons: (r.buttons || []).filter(Boolean),
      })
    }

    const formConversionRate =
      clickedPhones.length > 0
        ? parseFloat(((formSubmittedCount / clickedPhones.length) * 100).toFixed(2))
        : 0

    const paymentConversion = {
      totalClicked: clickedPhones.length,
      formSubmitted: formSubmittedCount,
      conversionRate: formConversionRate,
      formSubmittedMobiles,
      formSubmittedDetails: formSubmittedMobiles.map((m) => {
        const norm = normaliseMobile(m)
        const attr = clickAttrMap.get(norm)
        return {
          mobile: m,
          clickedTemplates: attr?.templates || [],
          clickedButtons: attr?.buttons || [],
        }
      }),
    }

    printResult(paymentConversion, {
      source: 'live Mongo query',
      elapsedMs: Date.now() - t0,
      dateRange: hasRange ? { startDate, endDate } : null,
    })
  } finally {
    await client.close()
  }
}

function printResult(pc, meta) {
  const {
    totalClicked = 0,
    formSubmitted = 0,
    conversionRate = 0,
    formSubmittedMobiles = [],
    formSubmittedDetails = [],
  } = pc

  console.log('--- WA Form conversion ---')
  console.log('source:', meta.source)
  if (meta.dateRange) console.log('WA date filter:', meta.dateRange)
  console.log('elapsedMs:', meta.elapsedMs)
  console.log('')
  console.log('totalClicked:', totalClicked)
  console.log('formSubmitted:', formSubmitted)
  console.log('conversionRate %:', conversionRate)
  console.log('')

  const sample = Math.min(8, formSubmittedDetails.length)
  if (sample > 0) {
    console.log(`sample (${sample} of ${formSubmittedDetails.length}):`)
    for (let i = 0; i < sample; i++) {
      const row = formSubmittedDetails[i]
      const tpl = (row.clickedTemplates || []).slice(0, 3).join(', ') || '—'
      const btn = (row.clickedButtons || []).slice(0, 3).join(', ') || '—'
      console.log(`  ${i + 1}. ${row.mobile}  templates: ${tpl}  buttons: ${btn}`)
    }
  }
  if (formSubmittedMobiles.length > sample) {
    console.log(`  … +${formSubmittedMobiles.length - sample} more`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
