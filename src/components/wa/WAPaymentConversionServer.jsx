'use client'

import { maskPhone } from '../../lib/userManagement'
import { WA_WORKSPACE_MBA_AI } from '../../lib/waWorkspace'
import { useClientPagination } from '../../hooks/useClientPagination'
import PaginationBar from '../PaginationBar'

function FunnelStep({ label, value, total, color, isLast, isDark }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="flex-1">
        <div className="flex items-baseline justify-between mb-1">
          <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
          <span className={`text-xs font-bold ${color}`}>{value.toLocaleString('en-IN')}</span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
          <div className={`h-full rounded-full transition-all duration-700 ${color.replace('text-', 'bg-')}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!isLast && (
        <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )
}

function TagList({ items, color, isDark }) {
  if (!items || items.length === 0) return <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span
          key={`${i}-${String(item)}`}
          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium max-w-[160px] truncate ${color}`}
          title={item}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

/** Click events in chronological order — date and time only (IST labels from API). */
function ClickTimeline({ events, isDark }) {
  const list = Array.isArray(events) ? events : []
  if (list.length === 0) {
    return <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>—</span>
  }
  return (
    <ul className={`space-y-1 max-h-48 overflow-y-auto pr-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
      {list.map((ev, i) => (
        <li
          key={`${ev.clickAtIso || i}-${i}`}
          className={`text-[10px] font-mono tabular-nums ${isDark ? 'text-slate-300' : 'text-slate-800'}`}
        >
          {ev.clickAtDisplay || '—'}
        </li>
      ))}
    </ul>
  )
}

export default function WAPaymentConversionServer({ data, theme, dataMasked, workspace }) {
  const isDark = theme === 'dark'
  const mp = (phone) => (dataMasked ? maskPhone(phone) : phone)

  const formSubmittedDetails = data?.formSubmittedDetails ?? []
  const { page, setPage, totalPages, total, pageSize, paginated } = useClientPagination(formSubmittedDetails, 10)

  if (!data) return null

  const {
    totalClicked = 0,
    formSubmitted = 0,
    conversionRate = 0,
    conversionKind = 'mba_form',
  } = data

  const isIhmPayment = conversionKind === 'ihm_payment_webhook'
  const isIsuForm = conversionKind === 'isu_form'
  const hasStageCol = (isIsuForm || !isIhmPayment) && formSubmittedDetails.some((u) => u.applicationStage != null)
  const hasPaymentCol = !isIhmPayment && formSubmittedDetails.some((u) => u.paymentDone !== null && u.paymentDone !== undefined)
  const secondLabel = isIhmPayment ? 'Payment completed' : 'Form Submitted'
  const title = isIhmPayment ? 'Payment conversion' : 'Form conversion'
  const subtitle = isIhmPayment
    ? 'Clicked users with a completed payment in itm.npfPaymentWebhookEvents, after first template send/deliver and on or after their last WhatsApp click. Lead ID from the webhook when present. Click timeline is IST.'
    : isIsuForm
    ? 'Clicked users who submitted an application (npfApplicationsWebhookEvents) after first template send/deliver and on or after their last WhatsApp click. Click timeline is IST.'
    : 'Clicked users with an MBA application (application no.) after first template send/deliver. Lead ID is always shown in full. Click timeline lists date and time only (IST), using the selected date range when filtered.'

  const funnelSteps = [
    { label: 'Clicked', value: totalClicked, color: 'text-amber-500' },
    { label: secondLabel, value: formSubmitted, color: 'text-blue-500' },
  ]

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-white border-slate-200'}`}>
      <div className="px-6 py-5">
        <h3 className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
        <p className={`text-[11px] mb-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {subtitle}
        </p>

        <div className="grid grid-cols-2 gap-8 mb-6">
          {funnelSteps.map((s) => (
            <div key={s.label} className="text-center">
              <p className={`text-2xl font-bold tracking-tight ${s.color}`}>{s.value.toLocaleString('en-IN')}</p>
              <p className={`text-[11px] font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {funnelSteps.map((s, i) => (
            <FunnelStep
              key={s.label}
              label={s.label}
              value={s.value}
              total={totalClicked}
              color={s.color}
              isLast={i === funnelSteps.length - 1}
              isDark={isDark}
            />
          ))}
        </div>

        {conversionRate > 0 && (
          <p className={`text-center text-xs mt-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {isIhmPayment ? 'Click → payment rate' : 'Click → Form rate'}:{' '}
            <span className="font-bold text-blue-500">{conversionRate}%</span>
          </p>
        )}
      </div>

      {(formSubmittedDetails?.length || 0) > 0 && (
        <div className={`border-t ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
          <div className="px-6 pt-4 pb-2">
            <p className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {isIhmPayment ? 'Payment completed' : 'Form submitted'} ({formSubmittedDetails.length})
            </p>
          </div>
          <div className="px-6 pb-4">
            <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="max-h-[32rem] overflow-x-auto overflow-y-auto">
                <table className="w-full text-[11px] min-w-[900px]">
                  <thead className={isDark ? 'bg-slate-800 sticky top-0 z-[1]' : 'bg-white sticky top-0 z-[1]'}>
                    <tr>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>#</th>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Lead ID</th>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mobile</th>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {isIhmPayment ? 'Payment completed' : 'Form submitted'}
                      </th>
                      {hasStageCol && (
                        <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Application Stage</th>
                      )}
                      {hasPaymentCol && (
                        <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Payment</th>
                      )}
                      <th className={`px-3 py-2 text-left font-medium min-w-[200px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Click timeline</th>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Template Clicked</th>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Button Clicked</th>
                    </tr>
                  </thead>
                  <tbody className={isDark ? 'divide-y divide-slate-800' : 'divide-y divide-slate-200'}>
                    {paginated.map((u, idx) => (
                      <tr key={`${u.leadId || ''}-${u.mobile}-${(page - 1) * pageSize + idx}`}>
                        <td className={`px-3 py-2 align-top ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          {(page - 1) * pageSize + idx + 1}
                        </td>
                        <td className={`px-3 py-2 align-top font-mono text-xs font-semibold ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>
                          {u.leadId ? (
                            <span title={u.leadId}>{u.leadId}</span>
                          ) : (
                            <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>—</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 align-top font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{mp(u.mobile)}</td>
                        <td className={`px-3 py-2 align-top font-mono tabular-nums ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {u.formSubmittedAtDisplay || '—'}
                        </td>
                        {hasStageCol && (
                          <td className={`px-3 py-2 align-top text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {u.applicationStage ? (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                /submit|complete|enroll|paid/i.test(u.applicationStage)
                                  ? isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-700'
                                  : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {u.applicationStage}
                              </span>
                            ) : (
                              <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>—</span>
                            )}
                          </td>
                        )}
                        {hasPaymentCol && (
                          <td className="px-3 py-2 align-top">
                            {u.paymentDone === null || u.paymentDone === undefined ? (
                              <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>—</span>
                            ) : u.paymentDone ? (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-700'}`}>
                                ✓ {u.paymentStatus || 'Paid'}
                              </span>
                            ) : (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600'}`}>
                                {u.paymentStatus || 'Not paid'}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2 align-top">
                          <ClickTimeline events={u.clickTimeline} isDark={isDark} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <TagList items={u.clickedTemplates} color={isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-700'} isDark={isDark} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <TagList items={u.clickedButtons} color={isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-50 text-amber-700'} isDark={isDark} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {formSubmittedDetails.length > 0 && (
                <PaginationBar
                  page={page}
                  setPage={setPage}
                  totalPages={totalPages}
                  total={total}
                  pageSize={pageSize}
                  className={isDark ? 'border-slate-700/50' : ''}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`px-6 py-3 border-t text-[10px] ${isDark ? 'border-slate-800 text-slate-600' : 'border-slate-100 text-slate-400'}`}>
        {isIhmPayment ? (
          <>
            Counts use <code className="font-mono">itm.npfPaymentWebhookEvents</code> (completed payment statuses) matched by mobile to IHM WhatsApp clicks, with payment time on or after first send/deliver and last click.
          </>
        ) : isIsuForm ? (
          <>
            {workspace === WA_WORKSPACE_MBA_AI ? (
              <>
                Form counts use <code className="font-mono">ITM_BS.npfApplicationsWebhookEvents_mba_ai</code> matched by <code className="font-mono">Mobile_Number</code> (and variants). Payment context may load from <code className="font-mono">npfPaymentWebhookEvents_mba_ai</code>. Only applications with completion on or after first WA send/deliver/read and last click are counted.
              </>
            ) : (
              <>
                Form counts use <code className="font-mono">ITM_ISU.npfApplicationsWebhookEventsBBA/BTech</code> matched by <code className="font-mono">Mobile_Number</code>. Only applications with completion date on or after first WA send and last click are counted.
              </>
            )}
          </>
        ) : (
          <>
            Form counts only include applications with timestamps on or after the first sent/delivered WhatsApp for that number. npfMbaApplications + marketingwa. Lead ID from NPF (<code className="font-mono">other_info.lead_id</code>) or CRM snapshot when missing.
          </>
        )}
      </div>
    </div>
  )
}
