#!/usr/bin/env node
/**
 * Copy WhatsApp analytics rows from a marketingwa-style source collection into
 * an Interakt webhook-style target collection.
 * in the Interakt webhook envelope shape (createdAt, version, timestamp, type, data.{customer,message,...}).
 *
 * marketingwa is a flattened projection (see migrate-wa-to-mongo.mjs); raw Interakt payloads are not stored.
 * This script reconstructs compatible fields from template_preview, phone, campaign, cost, and timestamps.
 *
 * Usage:
 *   node scripts/migrate-marketingwa-to-interakt-webhooks.mjs
 *   node scripts/migrate-marketingwa-to-interakt-webhooks.mjs --dry-run
 *   node scripts/migrate-marketingwa-to-interakt-webhooks.mjs --limit 100
 *   node scripts/migrate-marketingwa-to-interakt-webhooks.mjs --uri "$COMMUNITY_URI"
 *   node scripts/migrate-marketingwa-to-interakt-webhooks.mjs --source-db analytics --source-collection IDMmarketingwa --target-db ITM_IDM
 *
 * Requires COMMUNITY_URI in .env (same Mongo cluster as other scripts).
 *
 * Idempotency: each inserted doc sets data.message.meta_data.marketingwa_source = { firestore_id, marketingwa_id }.
 * Re-runs skip documents whose firestore_id (or marketingwa_id fallback) already exists in the target.
 */

import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb'
import { createHash } from 'node:crypto'

const DEFAULT_SOURCE_DB = 'itm'
const DEFAULT_SOURCE_COLLECTION = 'marketingwa'
const DEFAULT_TARGET_DB = 'ITM_BS'
const DEFAULT_TARGET_COLLECTION = 'interaktWhatsappWebhookEvents'
const BATCH_READ = 2_000

/** Same cost split ratios as a typical Interakt row (whatsapp + markup ≈ actual). */
const COST_RATIO_WA = 0.86 / 0.94941
const COST_RATIO_MARKUP = 0.09 / 0.94941

function parseArgs(argv) {
  const out = {
    dryRun: false,
    limit: null,
    uri: process.env.COMMUNITY_URI,
    sourceDb: DEFAULT_SOURCE_DB,
    sourceCollection: DEFAULT_SOURCE_COLLECTION,
    targetDb: DEFAULT_TARGET_DB,
    targetCollection: DEFAULT_TARGET_COLLECTION,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--limit' && argv[i + 1]) {
      out.limit = parseInt(argv[++i], 10)
      if (Number.isNaN(out.limit)) out.limit = null
    } else if (a === '--uri' && argv[i + 1]) out.uri = argv[++i]
    else if (a === '--source-db' && argv[i + 1]) out.sourceDb = argv[++i]
    else if (a === '--source-collection' && argv[i + 1]) out.sourceCollection = argv[++i]
    else if (a === '--target-db' && argv[i + 1]) out.targetDb = argv[++i]
    else if (a === '--target-collection' && argv[i + 1]) out.targetCollection = argv[++i]
  }
  return out
}

function toDate(raw) {
  if (raw == null) return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/** Top-level timestamp string like 2026-04-22T11:56:37.503723 (no Z). */
function toTimestampString(d) {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt.getTime())) return null
  const iso = dt.toISOString()
  const withoutZ = iso.endsWith('Z') ? iso.slice(0, -1) : iso
  const dot = withoutZ.indexOf('.')
  if (dot === -1) return `${withoutZ}.000000`
  const head = withoutZ.slice(0, dot)
  let frac = withoutZ.slice(dot + 1)
  frac = frac.padEnd(6, '0').slice(0, 6)
  return `${head}.${frac}`
}

/** Message timestamps in target examples omit trailing Z. */
function toUtcSqlStyle(d) {
  if (!d) return null
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt.getTime())) return null
  return dt.toISOString().replace('Z', '')
}

function deterministicUuid(namespace, value) {
  const hash = createHash('sha256').update(`${namespace}\0${String(value)}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = bytes.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

function normalizePhoneParts(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length >= 12 && digits.startsWith('91')) {
    return { country_code: '+91', channel_phone_number: digits, phone_number: digits.slice(2) }
  }
  if (digits.length === 10) {
    return { country_code: '+91', channel_phone_number: `91${digits}`, phone_number: digits }
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    const n = digits.slice(1)
    return { country_code: '+91', channel_phone_number: `91${n}`, phone_number: n }
  }
  if (!digits) {
    return { country_code: '+91', channel_phone_number: '', phone_number: '' }
  }
  return { country_code: '+91', channel_phone_number: digits, phone_number: digits.slice(-10) || digits }
}

function splitMessageCost(total) {
  const n = typeof total === 'number' ? total : parseFloat(total)
  if (n == null || Number.isNaN(n) || n <= 0) return null
  const wa = (n * COST_RATIO_WA).toFixed(2)
  const mk = (n * COST_RATIO_MARKUP).toFixed(2)
  return {
    whatsapp_cost: wa,
    interakt_markup: mk,
    actual_message_cost: String(n),
  }
}

function buildRawTemplateObject(mw) {
  const preview = mw.template_preview && typeof mw.template_preview === 'object' ? mw.template_preview : {}
  let buttons = preview.buttons
  if (Array.isArray(buttons)) {
    try {
      buttons = JSON.stringify(buttons)
    } catch {
      buttons = '[]'
    }
  } else if (typeof buttons === 'string') {
    // already JSON string
  } else {
    buttons = '[]'
  }

  return {
    id: deterministicUuid('wa_template', mw.template_name + ':' + (preview.name || '')),
    name: preview.name || mw.template_name || null,
    language: preview.language || 'en',
    category: (preview.category || mw.template_category || 'MARKETING').toString().toUpperCase(),
    sub_category: null,
    header_format: preview.header_format || null,
    header: null,
    header_text: preview.header_text || null,
    body: preview.body || null,
    footer: preview.footer || null,
    buttons,
    organization_id: null,
    approval_status: 'APPROVED',
    channel_type: 'Whatsapp',
    header_handle_file_url: preview.header_image_url || null,
    meta_data: {},
  }
}

function inferEventType(mw) {
  if (mw.event_type) return mw.event_type
  const stage = (mw.stage || '').toLowerCase()
  const src = (mw.source || 'api').toLowerCase() === 'campaign' ? 'campaign' : 'api'
  const prefix = src === 'campaign' ? 'message_campaign_' : 'message_api_'
  if (stage === 'clicked') return `${prefix}clicked`
  if (stage === 'read') return `${prefix}read`
  if (stage === 'sent') return `${prefix}sent`
  if (stage === 'failed') return `${prefix}failed`
  return `${prefix}delivered`
}

function messageTimestampsForStage(mw, eventDt) {
  const ts = toUtcSqlStyle(eventDt)
  const stage = (mw.stage || '').toLowerCase()
  const out = {
    received_at_utc: null,
    delivered_at_utc: null,
    seen_at_utc: null,
  }
  if (!ts) return out
  if (stage === 'sent') {
    out.received_at_utc = ts
  } else if (stage === 'delivered') {
    out.received_at_utc = ts
    out.delivered_at_utc = ts
  } else if (stage === 'read') {
    out.received_at_utc = ts
    out.delivered_at_utc = ts
    out.seen_at_utc = ts
  } else if (stage === 'clicked') {
    out.received_at_utc = ts
    out.delivered_at_utc = ts
  } else if (stage === 'failed') {
    out.received_at_utc = ts
  } else {
    out.received_at_utc = ts
    if (mw.message_status && String(mw.message_status).toLowerCase() === 'delivered') {
      out.delivered_at_utc = ts
    }
  }
  return out
}

function transformMarketingwaToInterakt(mw, namespace) {
  const eventDt = toDate(mw.event_timestamp) || toDate(mw.migrated_at) || new Date()
  const createdAt = eventDt
  const firestoreId = mw.firestore_id || null
  const marketingwaId = mw._id != null ? String(mw._id) : null
  const dedupeKey = firestoreId || marketingwaId || deterministicUuid('wa_row', JSON.stringify(mw))

  const phone = normalizePhoneParts(mw.phone_number)
  const customerId = deterministicUuid(`${namespace}_customer`, phone.channel_phone_number || mw.phone_number)
  const messageId = deterministicUuid(`${namespace}_message`, dedupeKey)

  const rawTplObj = buildRawTemplateObject(mw)
  const rawTemplateStr = JSON.stringify(rawTplObj)
  const preview = mw.template_preview && typeof mw.template_preview === 'object' ? mw.template_preview : {}
  const mediaUrl = preview.header_image_url || null

  const stage = (mw.stage || '').toLowerCase()
  const isCampaign = (mw.source || '').toLowerCase() === 'campaign'
  const campaignId = isCampaign ? (mw.campaign_id || null) : null
  const campaignName = isCampaign ? (mw.campaign_name || '') : ''

  const costMeta = stage === 'delivered' ? splitMessageCost(mw.cost) : null
  const { received_at_utc, delivered_at_utc, seen_at_utc } = messageTimestampsForStage(mw, eventDt)

  const type = inferEventType(mw)

  const message = {
    id: messageId,
    chat_message_type: isCampaign ? 'CampaignMessage' : 'PublicApiMessage',
    channel_failure_reason: stage === 'failed' ? (mw.failure_reason || null) : null,
    message_status: mw.message_status || null,
    received_at_utc,
    delivered_at_utc,
    seen_at_utc,
    campaign_id: campaignId,
    campaign_name: campaignName,
    is_template_message: true,
    raw_template: rawTemplateStr,
    channel_error_code: stage === 'failed' ? (mw.error_code != null ? String(mw.error_code) : null) : null,
    message_content_type: 'Template',
    media_url: mediaUrl,
    message: '[]',
    meta_data: {
      source: isCampaign ? 'Campaign' : 'PublicInterakt',
      source_data: { callback_data: null },
      msg_source: isCampaign ? 'Campaign' : 'PublicInterakt',
      ...(costMeta ? { message_cost: costMeta } : {}),
      marketingwa_source: {
        firestore_id: firestoreId,
        marketingwa_id: marketingwaId,
      },
    },
    source_message_id: null,
  }

  if (stage === 'clicked') {
    message.button_text = mw.button_text || null
    if (mw.button_link) {
      try {
        message.meta_data = {
          ...message.meta_data,
          cta_click_info: {
            link: { clicked_at_utc: toUtcSqlStyle(toDate(mw.click_timestamp) || eventDt), url: mw.button_link },
          },
        }
      } catch {
        // ignore
      }
    }
  }

  return {
    _id: new ObjectId(),
    createdAt,
    version: '1.0',
    timestamp: toTimestampString(createdAt),
    type,
    // Backward-compatible flat fields so existing WA dashboard queries keep working.
    // New Interakt-shaped payload remains the source of truth in `data`.
    firestore_id: firestoreId,
    template_name: rawTplObj.name || mw.template_name || null,
    phone_number: phone.phone_number || null,
    event_type: type,
    message_status: mw.message_status || null,
    stage,
    source: isCampaign ? 'campaign' : 'api',
    event_timestamp: eventDt,
    click_timestamp: toDate(mw.click_timestamp) || (stage === 'clicked' ? eventDt : null),
    button_text: message.button_text || null,
    button_link: mw.button_link || null,
    click_type: mw.click_type || null,
    cost: stage === 'delivered' ? (typeof mw.cost === 'number' ? mw.cost : parseFloat(mw.cost || '0') || 0) : 0,
    failure_reason: message.channel_failure_reason || null,
    error_code: message.channel_error_code || null,
    campaign_name: campaignName || null,
    campaign_id: campaignId || null,
    template_category: rawTplObj.category || null,
    template_preview: {
      name: rawTplObj.name || null,
      category: rawTplObj.category || null,
      language: rawTplObj.language || 'en',
      header_format: rawTplObj.header_format || null,
      header_image_url: mediaUrl,
      header_text: rawTplObj.header_text || null,
      body: rawTplObj.body || null,
      footer: rawTplObj.footer || null,
      buttons: (() => {
        try {
          return rawTplObj.buttons ? JSON.parse(rawTplObj.buttons) : []
        } catch {
          return []
        }
      })(),
    },
    migrated_at: new Date(),
    data: {
      customer: {
        id: customerId,
        channel_phone_number: phone.channel_phone_number,
        phone_number: phone.phone_number,
        country_code: phone.country_code,
        traits: {
          name: '',
          whatsapp_opted_in: true,
          source_id: null,
          source_url: null,
          _internal_lead_source: 'Whatsapp',
          contact_owner: {},
          chat_assignee: {},
          lead_status: null,
        },
      },
      message,
      channel_type: 'Whatsapp',
      is_fallback_message: false,
      next_fallback_channel: null,
    },
  }
}

async function fetchExistingKeys(targetCol, keys) {
  const firestoreIds = keys.filter((k) => k.firestore_id).map((k) => k.firestore_id)
  const mongoIds = keys.filter((k) => !k.firestore_id && k.marketingwa_id).map((k) => k.marketingwa_id)
  const existing = new Set()
  if (firestoreIds.length) {
    const docs = await targetCol
      .find({ 'data.message.meta_data.marketingwa_source.firestore_id': { $in: firestoreIds } })
      .project({ 'data.message.meta_data.marketingwa_source': 1 })
      .toArray()
    for (const d of docs) {
      const id = d?.data?.message?.meta_data?.marketingwa_source?.firestore_id
      if (id) existing.add(`fs:${id}`)
    }
  }
  if (mongoIds.length) {
    const docs = await targetCol
      .find({ 'data.message.meta_data.marketingwa_source.marketingwa_id': { $in: mongoIds } })
      .project({ 'data.message.meta_data.marketingwa_source': 1 })
      .toArray()
    for (const d of docs) {
      const id = d?.data?.message?.meta_data?.marketingwa_source?.marketingwa_id
      if (id) existing.add(`mw:${id}`)
    }
  }
  return existing
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.uri) {
    console.error('COMMUNITY_URI is not set (use .env or --uri).')
    process.exit(1)
  }

  console.log('=== marketingwa → interaktWhatsappWebhookEvents ===')
  console.log(`  Source: ${args.sourceDb}.${args.sourceCollection}`)
  console.log(`  Target: ${args.targetDb}.${args.targetCollection}`)
  if (args.dryRun) console.log('  Mode: DRY RUN (no writes)')
  if (args.limit) console.log(`  Limit: ${args.limit} documents`)
  console.log('')

  const client = new MongoClient(args.uri)
  await client.connect()
  const sourceCol = client.db(args.sourceDb).collection(args.sourceCollection)
  const targetCol = client.db(args.targetDb).collection(args.targetCollection)
  const namespace = `${args.sourceDb}_${args.sourceCollection}`.toLowerCase()

  const totalSource = await sourceCol.estimatedDocumentCount()
  console.log(`Source estimated count: ${totalSource.toLocaleString()}\n`)

  const cursor = sourceCol.find({}, { sort: { event_timestamp: 1, _id: 1 } })
  let processed = 0
  let inserted = 0
  let skipped = 0
  let buffer = []

  async function flushBuffer() {
    if (!buffer.length) return
    const keys = buffer.map((mw) => ({
      firestore_id: mw.firestore_id || null,
      marketingwa_id: mw._id != null ? String(mw._id) : null,
    }))
    const existing = await fetchExistingKeys(targetCol, keys)
    const dupInBatch = new Set()
    const toInsert = []
    for (const mw of buffer) {
      const fs = mw.firestore_id || null
      const mid = mw._id != null ? String(mw._id) : null
      const k = fs ? `fs:${fs}` : mid ? `mw:${mid}` : null
      if (k && dupInBatch.has(k)) {
        skipped++
        continue
      }
      if (k && existing.has(k)) {
        skipped++
        continue
      }
      if (k) dupInBatch.add(k)
      toInsert.push(transformMarketingwaToInterakt(mw, namespace))
    }
    if (args.dryRun) {
      inserted += toInsert.length
    } else if (toInsert.length) {
      try {
        const res = await targetCol.insertMany(toInsert, { ordered: false })
        inserted += res.insertedCount
      } catch (err) {
        const partial =
          typeof err.insertedCount === 'number'
            ? err.insertedCount
            : err.result?.insertedCount
        if (typeof partial === 'number' && partial > 0) {
          inserted += partial
          skipped += toInsert.length - partial
        } else if (err.code === 11000) {
          skipped += toInsert.length
        } else {
          throw err
        }
      }
    }
    buffer = []
  }

  try {
    for await (const doc of cursor) {
      if (args.limit != null && processed >= args.limit) break
      buffer.push(doc)
      processed++
      if (buffer.length >= BATCH_READ) {
        await flushBuffer()
        process.stdout.write(`\r  Processed: ${processed.toLocaleString()} | inserted: ${inserted.toLocaleString()} | skipped (dup): ${skipped.toLocaleString()}`)
      }
    }
    await flushBuffer()
    process.stdout.write(`\r  Processed: ${processed.toLocaleString()} | inserted: ${inserted.toLocaleString()} | skipped (dup): ${skipped.toLocaleString()}\n`)
  } finally {
    await client.close()
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
