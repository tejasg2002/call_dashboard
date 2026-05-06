/**
 * Debug script for IDM WA form-submitted / payment conversion.
 * Inspects ITM_IDM.interaktWhatsappWebhookEvents, npfApplicationsWebhookEvents,
 * and npfPaymentWebhookEvents to reveal actual field names and match counts.
 *
 * Run: node scripts/debug-wa-idm.mjs
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const mongoUri = process.env.COMMUNITY_URI
if (!mongoUri) {
  console.error('COMMUNITY_URI is not set in .env')
  process.exit(1)
}

const client = new MongoClient(mongoUri, {})

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

function waPhoneVariants(norm) {
  return [norm, `91${norm}`, `+91${norm}`, `+91-${norm}`, `0${norm}`]
}

async function main() {
  await client.connect()
  const idmDb = client.db('ITM_IDM')

  // ─── 1. Sample WA events ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════')
  console.log('1) ITM_IDM.interaktWhatsappWebhookEvents — field inspection')
  console.log('══════════════════════════════════════════════════════')
  const waCol = idmDb.collection('interaktWhatsappWebhookEvents')
  const waSample = await waCol.find({}).limit(3).toArray()
  if (waSample.length === 0) {
    console.log('   ⚠  Collection is EMPTY or does not exist.')
  } else {
    waSample.forEach((doc, i) => {
      console.log(`\n  Doc ${i + 1} top-level keys:`, Object.keys(doc))
      // Show phone-like fields
      const phoneKeys = Object.keys(doc).filter((k) =>
        /phone|mobile|number|contact/i.test(k),
      )
      if (phoneKeys.length) console.log(`   Phone-related fields:`, Object.fromEntries(phoneKeys.map((k) => [k, doc[k]])))
      if (doc.data && typeof doc.data === 'object') {
        console.log(`   doc.data keys:`, Object.keys(doc.data))
        if (doc.data.customer) console.log(`   doc.data.customer:`, doc.data.customer)
      }
      if (doc.event_type || doc.eventType) console.log(`   event_type/eventType:`, doc.event_type || doc.eventType)
      if (doc.type) console.log(`   type:`, doc.type)
    })
  }

  // Count clicked events
  const clickedCount = await waCol.countDocuments({
    $or: [
      { event_type: { $regex: 'click', $options: 'i' } },
      { type: { $regex: 'click', $options: 'i' } },
      { 'data.type': { $regex: 'click', $options: 'i' } },
    ],
  })
  console.log(`\n  Clicked events (any click field): ${clickedCount}`)

  const totalWa = await waCol.countDocuments({})
  console.log(`  Total WA docs: ${totalWa}`)

  // ─── 2. Sample application docs ─────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════')
  console.log('2) ITM_IDM.npfApplicationsWebhookEvents — field inspection')
  console.log('══════════════════════════════════════════════════════')
  const appsCol = idmDb.collection('npfApplicationsWebhookEvents')
  const totalApps = await appsCol.countDocuments({})
  console.log(`  Total app docs: ${totalApps}`)

  const appSample = await appsCol.find({}).limit(3).toArray()
  if (appSample.length === 0) {
    console.log('   ⚠  Collection is EMPTY or does not exist.')
  } else {
    appSample.forEach((doc, i) => {
      console.log(`\n  Doc ${i + 1} top-level keys:`, Object.keys(doc))
      const phoneKeys = Object.keys(doc).filter((k) => /phone|mobile|number|contact/i.test(k))
      if (phoneKeys.length) console.log(`   Phone-related fields:`, Object.fromEntries(phoneKeys.map((k) => [k, doc[k]])))
      const appKeys = Object.keys(doc).filter((k) => /application|app_no|appno/i.test(k))
      if (appKeys.length) console.log(`   Application-related fields:`, Object.fromEntries(appKeys.map((k) => [k, doc[k]])))
      const leadKeys = Object.keys(doc).filter((k) => /lead/i.test(k))
      if (leadKeys.length) console.log(`   Lead-related fields:`, Object.fromEntries(leadKeys.map((k) => [k, doc[k]])))
    })
  }

  // Check how many docs have each phone field
  const mobileNoAltCount = await appsCol.countDocuments({ Mobile_No_Alt: { $nin: [null, ''] } })
  const mobileNumberCount = await appsCol.countDocuments({ Mobile_Number: { $nin: [null, ''] } })
  const mobileNoCount = await appsCol.countDocuments({ mobile_number: { $nin: [null, ''] } })
  console.log(`\n  Docs with Mobile_No_Alt (what code uses): ${mobileNoAltCount}`)
  console.log(`  Docs with Mobile_Number:                   ${mobileNumberCount}`)
  console.log(`  Docs with mobile_number (lowercase):       ${mobileNoCount}`)

  // Check app number fields
  const autoGenCount = await appsCol.countDocuments({ Application_Number_Auto_Generated: { $nin: [null, ''] } })
  const appNumCount = await appsCol.countDocuments({ Application_Number: { $nin: [null, ''] } })
  console.log(`\n  Docs with Application_Number_Auto_Generated: ${autoGenCount}`)
  console.log(`  Docs with Application_Number:                 ${appNumCount}`)

  // ─── 3. Sample payment docs ──────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════')
  console.log('3) ITM_IDM.npfPaymentWebhookEvents — field inspection')
  console.log('══════════════════════════════════════════════════════')
  const payCol = idmDb.collection('npfPaymentWebhookEvents')
  const totalPay = await payCol.countDocuments({})
  console.log(`  Total payment docs: ${totalPay}`)

  const paySample = await payCol.find({}).limit(3).toArray()
  if (paySample.length === 0) {
    console.log('   ⚠  Collection is EMPTY or does not exist.')
  } else {
    paySample.forEach((doc, i) => {
      console.log(`\n  Doc ${i + 1} top-level keys:`, Object.keys(doc))
      const appKeys = Object.keys(doc).filter((k) => /application|app_no/i.test(k))
      if (appKeys.length) console.log(`   Application fields:`, Object.fromEntries(appKeys.map((k) => [k, doc[k]])))
      const payKeys = Object.keys(doc).filter((k) => /payment|status|amount|transaction/i.test(k))
      if (payKeys.length) console.log(`   Payment fields:`, Object.fromEntries(payKeys.map((k) => [k, doc[k]])))
      const leadKeys = Object.keys(doc).filter((k) => /lead/i.test(k))
      if (leadKeys.length) console.log(`   Lead fields:`, Object.fromEntries(leadKeys.map((k) => [k, doc[k]])))
    })
  }

  // ─── 4. Cross-match: WA clicked phones vs app docs ───────────────────────────
  console.log('\n══════════════════════════════════════════════════════')
  console.log('4) Cross-match: WA clicked phones → npfApplicationsWebhookEvents')
  console.log('══════════════════════════════════════════════════════')

  // Pull clicked phones from WA (try multiple structures)
  const clickedPipeline = [
    {
      $match: {
        $or: [
          { event_type: { $regex: 'click', $options: 'i' } },
          { type: { $regex: 'click', $options: 'i' } },
          { 'data.type': { $regex: 'click', $options: 'i' } },
        ],
      },
    },
    {
      $group: {
        _id: {
          $ifNull: [
            '$phone_number', '$phoneNumber', '$mobile',
            '$data.customer.channel_phone_number',
            '$customer.channel_phone_number',
          ],
        },
      },
    },
  ]

  const clickedRaw = await waCol.aggregate(clickedPipeline).toArray()
  const clickedPhones = [...new Set(
    clickedRaw.map((r) => normaliseMobile(r._id)).filter(Boolean),
  )]
  console.log(`  WA clicked phones (normalised): ${clickedPhones.length}`)

  if (clickedPhones.length > 0) {
    // Try matching with Mobile_No_Alt (what code currently uses)
    const variantsNoAlt = clickedPhones.flatMap(waPhoneVariants)
    const matchAlt = await appsCol.countDocuments({ Mobile_No_Alt: { $in: variantsNoAlt } })
    // Try matching with Mobile_Number
    const matchNum = await appsCol.countDocuments({ Mobile_Number: { $in: variantsNoAlt } })

    console.log(`\n  Matching apps using Mobile_No_Alt (current config): ${matchAlt}`)
    console.log(`  Matching apps using Mobile_Number:                   ${matchNum}`)

    if (matchAlt === 0 && matchNum > 0) {
      console.log('\n  ⚠  FIX NEEDED: isuAppsPhoneField should be "Mobile_Number" not "Mobile_No_Alt" for IDM')
    } else if (matchAlt === 0 && matchNum === 0) {
      console.log('\n  ⚠  No matches found with either phone field. Sample clicked phones:')
      clickedPhones.slice(0, 5).forEach((p) => console.log(`    ${p}`))
      // Show what phone values exist in the apps collection
      const appPhoneSample = await appsCol.find(
        { Mobile_No_Alt: { $nin: [null, ''] } },
        { projection: { Mobile_No_Alt: 1, Mobile_Number: 1, _id: 0 } },
      ).limit(5).toArray()
      if (appPhoneSample.length) {
        console.log('  Sample app phone values:')
        appPhoneSample.forEach((d) => console.log(`    Mobile_No_Alt=${d.Mobile_No_Alt}  Mobile_Number=${d.Mobile_Number}`))
      }
    }
  }

  await client.close()
  console.log('\nDone.')
}

main().catch((err) => {
  console.error('debug-wa-idm failed:', err)
  process.exit(1)
})
