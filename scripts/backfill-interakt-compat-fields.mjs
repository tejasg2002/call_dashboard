#!/usr/bin/env node
import 'dotenv/config'
import { MongoClient } from 'mongodb'

function parseArgs(argv) {
  const out = {
    uri: process.env.COMMUNITY_URI,
    db: 'ITM_BS',
    collection: 'interaktWhatsappWebhookEvents',
    dryRun: false,
    limit: null,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--uri' && argv[i + 1]) out.uri = argv[++i]
    else if (a === '--db' && argv[i + 1]) out.db = argv[++i]
    else if (a === '--collection' && argv[i + 1]) out.collection = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--limit' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10)
      out.limit = Number.isNaN(n) ? null : n
    }
  }
  return out
}

function safeJsonParse(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function stageFromType(type, status) {
  const t = String(type || '').toLowerCase()
  const s = String(status || '').toLowerCase()
  if (t.includes('click')) return 'clicked'
  if (t.includes('read') || s === 'read') return 'read'
  if (t.includes('deliver') || s === 'delivered') return 'delivered'
  if (t.includes('sent') || s === 'sent') return 'sent'
  if (t.includes('fail') || s === 'failed') return 'failed'
  return s || null
}

function sourceFromType(type) {
  const t = String(type || '').toLowerCase()
  return t.startsWith('message_campaign_') ? 'campaign' : 'api'
}

function toDate(raw) {
  if (raw == null) return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function compatFromDoc(doc) {
  const msg = doc?.data?.message || {}
  const customer = doc?.data?.customer || {}
  const rawTpl = safeJsonParse(msg.raw_template)
  const stage = stageFromType(doc.type, msg.message_status)
  const source = sourceFromType(doc.type)
  const eventTs = toDate(doc.createdAt) || toDate(doc.timestamp) || new Date()
  const clickTs = toDate(msg?.meta_data?.cta_click_info?.link?.clicked_at_utc) || (stage === 'clicked' ? eventTs : null)
  const actualCost = parseFloat(msg?.meta_data?.message_cost?.actual_message_cost || '0')
  const category = (rawTpl?.category || '').toString().toUpperCase() || null
  const templateName = rawTpl?.name || null
  const previewButtons = safeJsonParse(rawTpl?.buttons) || []

  return {
    firestore_id: doc.firestore_id ?? doc?.data?.message?.meta_data?.marketingwa_source?.firestore_id ?? null,
    template_name: templateName,
    phone_number: customer.phone_number || null,
    event_type: doc.type || null,
    message_status: msg.message_status || null,
    stage,
    source,
    event_timestamp: eventTs,
    click_timestamp: clickTs,
    button_text: msg.button_text || null,
    button_link: msg?.meta_data?.cta_click_info?.link?.url || null,
    click_type: msg.button_text ? 'CTA' : null,
    cost: stage === 'delivered' && !Number.isNaN(actualCost) ? actualCost : 0,
    failure_reason: msg.channel_failure_reason || null,
    error_code: msg.channel_error_code != null ? String(msg.channel_error_code) : null,
    campaign_name: msg.campaign_name || null,
    campaign_id: msg.campaign_id || null,
    template_category: category,
    template_preview: {
      name: templateName,
      category,
      language: rawTpl?.language || 'en',
      header_format: rawTpl?.header_format || null,
      header_image_url: msg.media_url || rawTpl?.header_handle_file_url || null,
      header_text: rawTpl?.header_text || null,
      body: rawTpl?.body || null,
      footer: rawTpl?.footer || null,
      buttons: Array.isArray(previewButtons) ? previewButtons : [],
    },
    migrated_at: doc.migrated_at || new Date(),
  }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.uri) {
    console.error('COMMUNITY_URI missing (or pass --uri)')
    process.exit(1)
  }

  const client = new MongoClient(args.uri)
  await client.connect()
  const col = client.db(args.db).collection(args.collection)

  const filter = {
    $or: [
      { stage: { $exists: false } },
      { template_name: { $exists: false } },
      { event_timestamp: { $exists: false } },
    ],
  }
  const total = await col.countDocuments(filter)
  console.log(`Backfill target: ${args.db}.${args.collection}`)
  console.log(`Documents needing compat fields: ${total.toLocaleString()}`)
  if (total === 0) {
    await client.close()
    return
  }

  const cursor = col.find(filter).sort({ _id: 1 })
  let processed = 0
  let updated = 0
  let ops = []
  const BATCH = 500

  for await (const doc of cursor) {
    if (args.limit != null && processed >= args.limit) break
    processed++
    const compat = compatFromDoc(doc)
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: compat },
      },
    })
    if (ops.length >= BATCH) {
      if (!args.dryRun) {
        const res = await col.bulkWrite(ops, { ordered: false })
        updated += res.modifiedCount
      } else {
        updated += ops.length
      }
      ops = []
      process.stdout.write(`\rProcessed: ${processed.toLocaleString()} | updated: ${updated.toLocaleString()}`)
    }
  }

  if (ops.length) {
    if (!args.dryRun) {
      const res = await col.bulkWrite(ops, { ordered: false })
      updated += res.modifiedCount
    } else {
      updated += ops.length
    }
  }
  process.stdout.write(`\rProcessed: ${processed.toLocaleString()} | updated: ${updated.toLocaleString()}\n`)
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

