#!/usr/bin/env node

/**
 * Migration script: Firestore whatsapp_webhooks → MongoDB marketingwa
 *
 * Reads all documents from Firestore, transforms them into a flat,
 * query-friendly schema, and bulk-inserts into MongoDB.
 *
 * Usage:  node scripts/migrate-wa-to-mongo.mjs
 *
 * Requires .env with Firebase config (NEXT_PUBLIC_FIREBASE_*) and COMMUNITY_URI.
 */

import 'dotenv/config'
import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  query,
  getDocs,
  limit,
  startAfter,
  getCountFromServer,
} from 'firebase/firestore'
import { MongoClient } from 'mongodb'

// ── Config ──────────────────────────────────────────────────────────────────

const FIRESTORE_COLLECTION = 'whatsapp_webhooks'
const MONGO_DB = 'itm'
const MONGO_COLLECTION = 'marketingwa'
const BATCH_SIZE = 5_000
const MONGO_INSERT_BATCH = 1_000

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const mongoUri = process.env.COMMUNITY_URI
if (!mongoUri) {
  console.error('COMMUNITY_URI is not set in .env')
  process.exit(1)
}

// ── Parsing helpers (mirrored from waAnalytics.js) ──────────────────────────

function eventSource(doc) {
  return (doc.event_type || '').toLowerCase().startsWith('message_campaign_')
    ? 'campaign'
    : 'api'
}

function eventStage(doc) {
  const et = (doc.event_type || '').toLowerCase()
  const ms = (doc.message_status || '').toLowerCase()
  if (et.includes('click') || et === 'message_api_clicked') return 'clicked'
  if (et.includes('read') || ms === 'read') return 'read'
  if (et.includes('deliver') || ms === 'delivered') return 'delivered'
  if (et.includes('sent') || ms === 'sent') return 'sent'
  if (et.includes('fail') || ms === 'failed') return 'failed'
  if (ms) return ms
  if (et) return et
  return null
}

function toDate(raw) {
  if (!raw) return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  if (typeof raw === 'number') {
    const ms = raw < 1e10 ? raw * 1000 : raw
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d
  }
  let s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !s.endsWith('Z') && !s.includes('+')) {
    s = s.replace(' ', 'T') + 'Z'
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function safeParsePayload(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return null }
}

function extractCost(d, stage) {
  if (stage !== 'delivered') return 0
  if (typeof d.cost === 'number' && d.cost > 0) return d.cost
  if (d.cost && !isNaN(parseFloat(d.cost))) return parseFloat(d.cost)
  const rp = safeParsePayload(d.raw_payload)
  if (!rp) return 0
  const mc = rp?.data?.message?.meta_data?.message_cost
  const val = mc?.actual_message_cost ?? mc?.whatsapp_cost ?? null
  if (val != null && !isNaN(parseFloat(val))) return parseFloat(val)
  return 0
}

function extractButtonText(d) {
  if (d.button_text) return d.button_text
  const rp = safeParsePayload(d.raw_payload)
  return rp?.data?.message?.button_text || null
}

function extractClickTimestamp(d) {
  if (d.click_timestamp) return toDate(d.click_timestamp)
  const rp = safeParsePayload(d.raw_payload)
  if (!rp) return null
  const clickTs =
    rp?.data?.event?.click_timestamp ||
    (rp?.data?.message?.meta_data?.cta_click_info &&
      Object.values(rp.data.message.meta_data.cta_click_info)[0]?.clicked_at_utc) ||
    rp?.data?.message?.seen_at_utc ||
    rp?.data?.message?.seen_at
  return clickTs ? toDate(clickTs) : null
}

function extractFailureInfo(d) {
  let reason = ''
  let code = ''

  const rp = safeParsePayload(d.raw_payload)
  if (rp) {
    const msg = rp?.data?.message
    reason = msg?.channel_failure_reason || ''
    code = msg?.channel_error_code || ''

    if (!reason) {
      const msgErrors = msg?.errors
      if (Array.isArray(msgErrors) && msgErrors.length > 0) {
        const e = msgErrors[0]
        reason = e.message || e.title || e.description || ''
        if (!code) code = e.code ? String(e.code) : ''
      }
    }
    if (!reason) {
      const meta = msg?.meta_data
      reason = meta?.error_message || meta?.failure_reason || meta?.error_title || ''
    }
    if (!reason) {
      const rpErr = rp?.error || rp?.data?.error || msg?.error
      if (rpErr) reason = typeof rpErr === 'string' ? rpErr : (rpErr.message || rpErr.title || '')
    }
  }

  if (!reason) {
    reason =
      d.failure_reason ||
      d.channel_failure_reason ||
      d.error_message ||
      d.error_title ||
      d.reason ||
      d.delivery_error_message ||
      ''
  }
  if (!code) code = d.channel_error_code || d.error_code || ''

  return {
    failure_reason: reason.trim() || null,
    error_code: code ? String(code) : null,
  }
}

function extractCampaignInfo(d) {
  let name = d.campaign_name || ''
  let id = d.campaign_id || ''
  if (!name || !id) {
    const rp = safeParsePayload(d.raw_payload)
    if (rp) {
      const msg = rp?.data?.message
      if (!name) name = msg?.campaign_name || ''
      if (!id) id = msg?.campaign_id || ''
    }
  }
  return {
    campaign_name: name || null,
    campaign_id: id || null,
  }
}

function extractTemplateCategory(d) {
  if (d.template_category) return String(d.template_category).toUpperCase()
  const rp = safeParsePayload(d.raw_payload)
  if (!rp) return null
  try {
    const rawTpl = rp?.data?.message?.raw_template
    const tpl = rawTpl ? (typeof rawTpl === 'string' ? JSON.parse(rawTpl) : rawTpl) : null
    const cat = tpl?.category || ''
    return cat ? cat.toUpperCase() : null
  } catch {
    return null
  }
}

// ── Transform a single Firestore doc into the flat MongoDB schema ───────────

function transformDoc(d) {
  const stage = eventStage(d)
  const source = eventSource(d)
  const eventTs = toDate(d.event_timestamp) || toDate(d.timestamp) || null
  const cost = extractCost(d, stage)
  const buttonText = stage === 'clicked' ? extractButtonText(d) : null
  const clickTs = stage === 'clicked' ? extractClickTimestamp(d) : null
  const { failure_reason, error_code } = stage === 'failed' ? extractFailureInfo(d) : { failure_reason: null, error_code: null }
  const { campaign_name, campaign_id } = source === 'campaign' ? extractCampaignInfo(d) : { campaign_name: null, campaign_id: null }
  const templateCategory = extractTemplateCategory(d)

  return {
    firestore_id: d.id || null,
    template_name: d.template_name || null,
    phone_number: d.phone_number || null,
    event_type: d.event_type || null,
    message_status: d.message_status || null,
    stage,
    source,
    event_timestamp: eventTs,
    click_timestamp: clickTs,
    button_text: buttonText,
    button_link: d.button_link || null,
    click_type: d.click_type || null,
    cost,
    failure_reason,
    error_code,
    campaign_name,
    campaign_id,
    template_category: templateCategory,
    raw_payload: d.raw_payload || null,
    migrated_at: new Date(),
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now()
  console.log('=== WhatsApp Firestore → MongoDB Migration ===\n')

  // Connect Firebase
  console.log('[1/5] Connecting to Firebase...')
  const app = initializeApp(firebaseConfig, 'migration-script')
  const firestore = getFirestore(app)
  const col = collection(firestore, FIRESTORE_COLLECTION)

  // Get total count
  let totalFirestore = 0
  try {
    const countSnap = await getCountFromServer(query(col))
    totalFirestore = countSnap.data().count
  } catch (e) {
    console.warn('  Could not get count from server:', e.message)
  }
  console.log(`  Firestore collection: ${FIRESTORE_COLLECTION}`)
  console.log(`  Total documents: ${totalFirestore.toLocaleString()}\n`)

  // Connect MongoDB
  console.log('[2/5] Connecting to MongoDB...')
  const mongo = new MongoClient(mongoUri)
  await mongo.connect()
  const db = mongo.db(MONGO_DB)
  const mongCol = db.collection(MONGO_COLLECTION)

  const existingCount = await mongCol.estimatedDocumentCount()
  console.log(`  MongoDB collection: ${MONGO_DB}.${MONGO_COLLECTION}`)
  console.log(`  Existing documents: ${existingCount.toLocaleString()}\n`)

  // Read all Firestore docs in batches
  console.log('[3/5] Reading from Firestore & transforming...')
  let allDocs = []
  let lastSnap = null
  let hasMore = true
  let fetchedCount = 0

  while (hasMore) {
    const q = lastSnap
      ? query(col, startAfter(lastSnap), limit(BATCH_SIZE))
      : query(col, limit(BATCH_SIZE))

    const snapshot = await getDocs(q)
    const batch = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    allDocs = allDocs.concat(batch)
    fetchedCount += batch.length

    hasMore = snapshot.docs.length === BATCH_SIZE
    if (hasMore) lastSnap = snapshot.docs[snapshot.docs.length - 1]

    const pct = totalFirestore > 0 ? Math.round((fetchedCount / totalFirestore) * 100) : '?'
    process.stdout.write(`\r  Fetched: ${fetchedCount.toLocaleString()} / ${totalFirestore.toLocaleString()} (${pct}%)`)
  }
  console.log(`\n  Total fetched: ${allDocs.length.toLocaleString()}\n`)

  // Transform
  console.log('[4/5] Transforming & inserting into MongoDB...')
  let inserted = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < allDocs.length; i += MONGO_INSERT_BATCH) {
    const chunk = allDocs.slice(i, i + MONGO_INSERT_BATCH)
    const transformed = chunk.map(transformDoc)

    try {
      const result = await mongCol.insertMany(transformed, { ordered: false })
      inserted += result.insertedCount
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key errors — count inserted and skipped
        inserted += err.result?.insertedCount || 0
        skipped += chunk.length - (err.result?.insertedCount || 0)
      } else {
        console.error(`\n  Batch error at offset ${i}:`, err.message)
        errors += chunk.length
      }
    }

    const total = inserted + skipped + errors
    const pct = allDocs.length > 0 ? Math.round((total / allDocs.length) * 100) : 0
    process.stdout.write(`\r  Progress: ${total.toLocaleString()} / ${allDocs.length.toLocaleString()} (${pct}%) — inserted: ${inserted.toLocaleString()}, skipped: ${skipped.toLocaleString()}`)
  }
  console.log('\n')

  // Create indexes
  console.log('[5/5] Creating indexes...')
  const indexes = [
    { key: { firestore_id: 1 }, unique: true, name: 'idx_firestore_id' },
    { key: { event_timestamp: -1 }, name: 'idx_event_timestamp' },
    { key: { template_name: 1, stage: 1 }, name: 'idx_template_stage' },
    { key: { phone_number: 1 }, name: 'idx_phone_number' },
    { key: { stage: 1 }, name: 'idx_stage' },
    { key: { source: 1 }, name: 'idx_source' },
  ]

  for (const idx of indexes) {
    try {
      await mongCol.createIndex(idx.key, { unique: idx.unique || false, name: idx.name, background: true })
      console.log(`  ✓ ${idx.name}`)
    } catch (err) {
      console.log(`  ✗ ${idx.name}: ${err.message}`)
    }
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  const finalCount = await mongCol.estimatedDocumentCount()

  console.log('\n=== Migration Complete ===')
  console.log(`  Firestore docs read:   ${allDocs.length.toLocaleString()}`)
  console.log(`  MongoDB inserted:      ${inserted.toLocaleString()}`)
  console.log(`  Duplicates skipped:    ${skipped.toLocaleString()}`)
  console.log(`  Errors:                ${errors.toLocaleString()}`)
  console.log(`  Final MongoDB count:   ${finalCount.toLocaleString()}`)
  console.log(`  Time elapsed:          ${elapsed}s`)

  await mongo.close()
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
