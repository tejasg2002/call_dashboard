/**
 * Create MongoDB indexes on WhatsApp marketing collections for fast aggregation.
 * Run once: node scripts/create-wa-indexes.mjs
 *
 * - itm.marketingwa (MBA workspace)
 * - analytics.IHMmarketingwa (IHM workspace)
 * - analytics.IDMmarketingwa (IDM workspace)
 * - analytics.BBAmarketingwa (BBA workspace)
 * - analytics.BTECHmarketingwa (BTECH workspace)
 * - itm.npfPaymentWebhookEvents (IHM payment conversion lookups)
 * - analytics.call_logs_isu (BBA/BTECH call review — optional; tune keys to match your schema)
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const MONGO_URI = process.env.COMMUNITY_URI

const WA_INDEXES = [
  { key: { stage: 1, template_name: 1, source: 1 }, name: 'idx_stage_tpl_src' },
  { key: { stage: 1, button_text: 1, source: 1 }, name: 'idx_stage_btn_src' },
  { key: { stage: 1, phone_number: 1 }, name: 'idx_stage_phone' },
  { key: { stage: 1, event_timestamp: -1 }, name: 'idx_stage_ts' },
  { key: { template_name: 1, stage: 1 }, name: 'idx_tpl_stage' },
]

const IHM_PAYMENT_INDEXES = [
  { key: { mobile_number: 1 }, name: 'idx_ihm_pay_mobile_number' },
  { key: { mobile: 1 }, name: 'idx_ihm_pay_mobile' },
  { key: { phone_number: 1 }, name: 'idx_ihm_pay_phone_number' },
  { key: { phone: 1 }, name: 'idx_ihm_pay_phone' },
]

/** BBA/BTECH call logs — adjust if your documents use different date / BU fields. */
const CALL_LOGS_ISU_INDEXES = [
  { key: { program: 1, call_timestamp: -1 }, name: 'idx_isu_program_call_ts' },
  { key: { bu: 1, createdAt: -1 }, name: 'idx_isu_bu_created' },
  { key: { Lead_id: 1 }, name: 'idx_isu_lead_id' },
]

const TARGETS = [
  { db: 'itm', collection: 'marketingwa', indexes: WA_INDEXES },
  { db: 'analytics', collection: 'IHMmarketingwa', indexes: WA_INDEXES },
  { db: 'analytics', collection: 'IDMmarketingwa', indexes: WA_INDEXES },
  { db: 'analytics', collection: 'BBAmarketingwa', indexes: WA_INDEXES },
  { db: 'analytics', collection: 'BTECHmarketingwa', indexes: WA_INDEXES },
  { db: 'itm', collection: 'npfPaymentWebhookEvents', indexes: IHM_PAYMENT_INDEXES },
  { db: 'analytics', collection: 'call_logs_isu', indexes: CALL_LOGS_ISU_INDEXES },
  { db: 'analytics', collection: 'call_logs_bba', indexes: CALL_LOGS_ISU_INDEXES },
  { db: 'analytics', collection: 'call_logs_btech', indexes: CALL_LOGS_ISU_INDEXES },
  { db: 'analytics', collection: 'call_logs_mca', indexes: CALL_LOGS_ISU_INDEXES },
]

async function main() {
  const client = new MongoClient(MONGO_URI)
  await client.connect()

  for (const target of TARGETS) {
    const { db: dbName, collection: colName } = target
    const db = client.db(dbName)
    const col = db.collection(colName)

    console.log(`\nCreating indexes on ${dbName}.${colName}...`)

    for (const idx of target.indexes || WA_INDEXES) {
      try {
        await col.createIndex(idx.key, { name: idx.name })
        console.log(`  Created: ${idx.name}`)
      } catch (err) {
        if (err.code === 85 || err.code === 86) {
          console.log(`  Skipped (already exists): ${idx.name}`)
        } else {
          console.error(`  Error for ${idx.name}:`, err.message)
        }
      }
    }

    const indexes = await col.indexes()
    console.log('Current indexes:')
    indexes.forEach((idx) => console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`))
  }

  await client.close()
}

main().catch((err) => { console.error(err); process.exit(1) })
