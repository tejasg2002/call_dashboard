import { ihmPickPaymentRow } from './ihmFormConversionRules'

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
}

/** IDM NPF: count toward WA conversion only when payment webhook status is Complete. */
export function idmPaymentStatusIsComplete(paymentRow) {
  if (!paymentRow?.paymentStatus) return false
  return norm(paymentRow.paymentStatus) === 'complete'
}

/**
 * @param {{ applicationNo?: unknown, leadIdRaw?: unknown }} row
 * @param {Map<string|number, { paymentStatus?: string|null }>} paymentByKey
 */
export function idmWaConversionRowQualifies(row, paymentByKey) {
  const pay = ihmPickPaymentRow(paymentByKey, row.applicationNo, row.leadIdRaw)
  return !!(pay && idmPaymentStatusIsComplete(pay))
}
