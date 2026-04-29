#!/usr/bin/env node
/**
 * Diagnostic: check how many click events in itm.marketingwa have button_text,
 * and sample what template names / button texts look like.
 *
 * Usage:
 *   node scripts/check-marketingwa-buttons.mjs
 *   node scripts/check-marketingwa-buttons.mjs --sample 20
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : []).filter(Boolean),
)
const SAMPLE = parseInt(args.sample ?? '10', 10)

const uri = process.env.COMMUNITY_URI
if (!uri) { console.error('COMMUNITY_URI missing'); process.exit(1) }

const client = new MongoClient(uri)
await client.connect()
const col = client.db('itm').collection('marketingwa')

// 1. Overall click counts
const totalClicks     = await col.countDocuments({ stage: 'clicked' })
const withButton      = await col.countDocuments({ stage: 'clicked', button_text: { $nin: [null, '', '[]'] } })
const withoutButton   = totalClicks - withButton

console.log('\n=== itm.marketingwa click event summary ===')
console.log(`Total click events : ${totalClicks.toLocaleString()}`)
console.log(`With button_text   : ${withButton.toLocaleString()} (${totalClicks ? ((withButton / totalClicks) * 100).toFixed(1) : 0}%)`)
console.log(`Without button_text: ${withoutButton.toLocaleString()}`)

// 2. Top template names that have button_text
console.log(`\n=== Top templates WITH button_text (sample) ===`)
const topWithBtn = await col.aggregate([
  { $match: { stage: 'clicked', button_text: { $nin: [null, '', '[]'] } } },
  { $group: { _id: '$template_name', count: { $sum: 1 }, buttons: { $addToSet: '$button_text' } } },
  { $sort: { count: -1 } },
  { $limit: 15 },
]).toArray()
for (const r of topWithBtn) {
  console.log(`  ${r._id} (${r.count}×) → ${r.buttons.slice(0, 3).join(' | ')}`)
}

// 3. Top template names WITHOUT button_text
console.log(`\n=== Top templates WITHOUT button_text ===`)
const topWithout = await col.aggregate([
  { $match: { stage: 'clicked', $or: [{ button_text: null }, { button_text: '' }, { button_text: '[]' }] } },
  { $group: { _id: '$template_name', count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 15 },
]).toArray()
for (const r of topWithout) {
  console.log(`  ${r._id} (${r.count}×)`)
}

// 4. Sample raw docs with button_text
console.log(`\n=== Sample click docs WITH button_text (${SAMPLE} docs) ===`)
const samples = await col.find(
  { stage: 'clicked', button_text: { $nin: [null, '', '[]'] } },
  { projection: { _id: 0, phone_number: 1, template_name: 1, button_text: 1, click_timestamp: 1 } },
).limit(SAMPLE).toArray()
for (const s of samples) {
  console.log(`  ${s.template_name} | ${s.button_text} | ${s.phone_number}`)
}

await client.close()
console.log('\nDone.')
