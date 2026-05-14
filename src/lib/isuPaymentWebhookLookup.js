import { parseOptDate } from './conversionAttribution'

/**
 * Load NPF payment webhook rows for ISU/IHM/IDM application keys (same keys as wa-dashboard compute).
 * @param {Array<{ applicationNo?: unknown, leadIdRaw?: unknown, leadId?: unknown }>} rows
 */
export async function fetchIsuPaymentByKeyMap(client, isuAppsDb, isuPaymentCollection, rows) {
  const paymentByKey = new Map()
  if (!isuPaymentCollection || !rows?.length) return paymentByKey

  const appNos = rows.map((r) => r.applicationNo).filter(Boolean)
  const leadIds = rows.map((r) => r.leadIdRaw ?? r.leadId).filter(Boolean)

  if (appNos.length === 0 && leadIds.length === 0) return paymentByKey

  const payCol = client.db(isuAppsDb).collection(isuPaymentCollection)
  const payDocs = await payCol.find({
    $or: [
      ...(appNos.length > 0 ? [{ Application_Number: { $in: appNos } }] : []),
      ...(appNos.length > 0 ? [{ application_number: { $in: appNos } }] : []),
      ...(leadIds.length > 0 ? [{ Lead_ID: { $in: leadIds } }] : []),
      ...(leadIds.length > 0 ? [{ lead_id: { $in: leadIds } }] : []),
    ],
  }).toArray()

  for (const p of payDocs) {
    const key = p.Application_Number || p.application_number || p.Lead_ID || p.lead_id
    if (key == null || key === '') continue
    const existing = paymentByKey.get(key)
    const rawStatus = p.paymentStatus || p.Payment_Status || p.status || p.payment_status || ''
    const paidAt = parseOptDate(p.Payment_Approved_Date) || parseOptDate(p.createdAt)
    if (!existing || (paidAt && existing.paidAt && paidAt.getTime() > existing.paidAt.getTime())) {
      paymentByKey.set(key, {
        paymentDone: /approved|success|complete/i.test(rawStatus),
        paymentStatus: p.paymentStatus || p.Payment_Status || p.status || p.payment_status || null,
        paymentAmount: p.Payment_Amount || null,
        transactionId: p.Transaction_ID || null,
        paidAt,
        paidAtDisplay: paidAt
          ? paidAt.toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            })
          : '—',
      })
    }
  }
  return paymentByKey
}
