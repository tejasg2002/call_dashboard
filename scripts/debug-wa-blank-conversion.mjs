#!/usr/bin/env node
/**
 * Debug WA Form Conversion blank rows: for each phone we expect to have click data,
 * inspect what's actually stored in the WA collection to figure out why our queries miss it.
 *
 * Usage:
 *   node scripts/debug-wa-blank-conversion.mjs
 *   node scripts/debug-wa-blank-conversion.mjs --phones 8369012279,8767977297
 *   node scripts/debug-wa-blank-conversion.mjs --waDb ITM_BS --waCollection interaktWhatsappWebhookEvents
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : []))
    .filter(Boolean),
)

const WA_DB = args.waDb ?? process.env.WA_DB ?? 'ITM_BS'
const WA_COL = args.waCollection ?? process.env.WA_COLLECTION ?? 'interaktWhatsappWebhookEvents'

const phones = (args.phones || '8369012279,8767977297,8422045463,7378861061,8160434696')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const uri = process.env.COMMUNITY_URI
if (!uri) { console.error('COMMUNITY_URI missing in .env'); process.exit(1) }

const client = new MongoClient(uri)
await client.connect()
console.log(`Connected to ${WA_DB}.${WA_COL}\n`)

const waCol = client.db(WA_DB).collection(WA_COL)

function variants(p) {
  const ten = String(p).replace(/\D/g, '').slice(-10)
  return [ten, `91${ten}`, `+91${ten}`, ` 91${ten}`, `0091${ten}`]
}

for (const phone of phones) {
  const v = variants(phone)
  console.log(`\n========== ${phone} ==========`)

  // Search across all known phone storage locations
  const orQuery = { $or: [
    { phone_number: { $in: v } },
    { 'data.customer.phone_number': { $in: v } },
    { 'data.customer.channel_phone_number': { $in: v } },
  ]}

  const total = await waCol.countDocuments(orQuery)
  console.log(`Total docs found across all phone fields: ${total}`)

  if (total === 0) {
    // Try regex fallback to catch any unexpected formatting
    const re = new RegExp(phone + '$')
    const fuzzy = await waCol.countDocuments({ $or: [
      { phone_number: re },
      { 'data.customer.phone_number': re },
      { 'data.customer.channel_phone_number': re },
    ]})
    console.log(`Fuzzy regex match (ends-with ${phone}): ${fuzzy}`)
    continue
  }

  // Group by stage / type to see distribution
  const dist = await waCol.aggregate([
    { $match: orQuery },
    { $group: {
        _id: { stage: '$stage', type: '$type', message_status: '$message_status' },
        count: { $sum: 1 },
        sample: { $first: '$_id' },
    } },
    { $sort: { count: -1 } },
  ]).toArray()

  console.log('Stage/type distribution:')
  for (const d of dist) {
    console.log(`  stage=${JSON.stringify(d._id.stage)} type=${JSON.stringify(d._id.type)} status=${JSON.stringify(d._id.message_status)} → ${d.count}`)
  }

  // Look for click events specifically
  const clickQuery = { $and: [orQuery, { $or: [
    { stage: 'clicked' },
    { type: { $in: ['message_api_clicked', 'message_campaign_clicked'] } },
  ]}]}
  const clickCount = await waCol.countDocuments(clickQuery)
  console.log(`Click events (stage=clicked OR type=message_*_clicked): ${clickCount}`)

  if (clickCount > 0) {
    const sample = await waCol.findOne(clickQuery, { projection: {
      stage: 1, type: 1, phone_number: 1, template_name: 1, button_text: 1, firestore_id: 1,
      'data.customer.phone_number': 1,
      'data.customer.channel_phone_number': 1,
      'data.message.button_text': 1,
      'data.message.meta_data.cta_click_info': 1,
      'data.message.raw_template': 1,
      event_timestamp: 1, click_timestamp: 1, createdAt: 1,
    }})
    console.log('Sample click doc keys:', Object.keys(sample || {}))
    console.log('  stage:', sample?.stage)
    console.log('  type:', sample?.type)
    console.log('  phone_number:', sample?.phone_number)
    console.log('  data.customer.phone_number:', sample?.data?.customer?.phone_number)
    console.log('  data.customer.channel_phone_number:', sample?.data?.customer?.channel_phone_number)
    console.log('  template_name:', sample?.template_name)
    console.log('  button_text:', sample?.button_text)
    console.log('  data.message.button_text:', sample?.data?.message?.button_text)
    const cci = sample?.data?.message?.meta_data?.cta_click_info
    if (cci) {
      console.log('  cta_click_info keys:', Object.keys(cci))
      for (const [k, v] of Object.entries(cci)) {
        console.log(`    [${k}] button_text=${JSON.stringify(v?.button_text)} link=${JSON.stringify(v?.link)}`)
      }
    }
    if (sample?.data?.message?.raw_template) {
      const rt = sample.data.message.raw_template
      const m = typeof rt === 'string' ? rt.match(/"name"\s*:\s*"([^"]+)"/) : null
      console.log('  raw_template name:', m?.[1] || '(none)')
    }
    console.log('  event_timestamp:', sample?.event_timestamp)
    console.log('  click_timestamp:', sample?.click_timestamp)
    console.log('  createdAt:', sample?.createdAt)
    console.log('  firestore_id:', sample?.firestore_id)
  } else {
    // No click events but other events exist — maybe they were called clickers due to a different doc
    console.log('  (No click events found for this phone - they should NOT be in form-conversion table)')
  }
}

await client.close()
console.log('\nDone.')
