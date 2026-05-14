import { ihmPickPaymentRow, ihmPaymentStatusIsApproved } from './ihmFormConversionRules'

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

const BTECH_OFFER_SCHOLARSHIP = 'b.tech offer letter with scholarship'

/** True when NPF BTech application stage counts toward WA conversion (exact / safe patterns only — avoids "not submitted"). */
export function btechApplicationStageQualifies(stageRaw) {
  const s = norm(stageRaw)
  if (!s) return false
  const c = s.replace(/\s+/g, ' ')
  if (c === 'submitted' || c === 'application submitted') return true
  if (c === 'enrolled') return true
  if (c === BTECH_OFFER_SCHOLARSHIP) return true
  if (c.includes('b.tech') && c.includes('offer letter') && c.includes('scholarship')) return true
  return false
}

/**
 * BTech: Submitted, B.Tech Offer Letter with Scholarship, or Enrolled — or NPF payment Payment Approved.
 * @param {{ applicationStage?: string|null, applicationNo?: unknown, leadIdRaw?: unknown }} row
 * @param {Map<string|number, { paymentStatus?: string|null }>} paymentByKey
 */
export function btechWaConversionRowQualifies(row, paymentByKey) {
  if (btechApplicationStageQualifies(row.applicationStage)) return true
  const pay = ihmPickPaymentRow(paymentByKey, row.applicationNo, row.leadIdRaw)
  return !!(pay && ihmPaymentStatusIsApproved(pay))
}
