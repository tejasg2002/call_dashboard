/**
 * IHM WhatsApp form conversion: count only applications that reached a terminal stage
 * (SRF Paid, Enrolled when SRF Paid is not used, or Submitted) or have payment marked approved.
 */

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

/** True when NPF application stage counts toward IHM WA conversion. */
export function ihmApplicationStageQualifies(stageRaw) {
  const s = norm(stageRaw)
  if (!s) return false
  if (s === 'submitted' || s === 'enrolled' || s === 'srf paid') return true
  if (s.includes('submitted')) return true
  if (s.includes('enrolled')) return true
  if (s.includes('srf') && s.includes('paid')) return true
  return false
}

/** True when payment webhook row is "Payment Approved" (NPF IHM wording). */
export function ihmPaymentStatusIsApproved(paymentRow) {
  if (!paymentRow?.paymentStatus) return false
  const s = norm(paymentRow.paymentStatus)
  return s === 'payment approved' || (s.includes('payment') && s.includes('approved'))
}

function paymentKeysForLookup(applicationNo, leadIdRaw) {
  const keys = []
  if (applicationNo != null && String(applicationNo).trim() !== '') {
    const a = String(applicationNo).trim()
    keys.push(a)
    if (/^\d+$/.test(a) && Number.isSafeInteger(Number(a))) keys.push(Number(a))
  }
  if (leadIdRaw != null && String(leadIdRaw).trim() !== '') {
    const l = String(leadIdRaw).trim()
    keys.push(l)
    if (/^\d+$/.test(l) && Number.isSafeInteger(Number(l))) keys.push(Number(l))
  }
  return keys
}

export function ihmPickPaymentRow(paymentByKey, applicationNo, leadIdRaw) {
  for (const k of paymentKeysForLookup(applicationNo, leadIdRaw)) {
    const p = paymentByKey.get(k)
    if (p) return p
  }
  return null
}

/**
 * @param {{ applicationStage?: string|null, applicationNo?: unknown, leadIdRaw?: unknown }} row — NPF app aggregate row
 * @param {Map<string|number, { paymentStatus?: string|null }>} paymentByKey — from npfPaymentWebhookEvents
 */
export function ihmWaConversionRowQualifies(row, paymentByKey) {
  if (ihmApplicationStageQualifies(row.applicationStage)) return true
  const pay = ihmPickPaymentRow(paymentByKey, row.applicationNo, row.leadIdRaw)
  return !!(pay && ihmPaymentStatusIsApproved(pay))
}
