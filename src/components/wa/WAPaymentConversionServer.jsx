'use client'

import { maskPhone } from '../../lib/userManagement'

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
      {items.map((item) => (
        <span
          key={item}
          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium max-w-[160px] truncate ${color}`}
          title={item}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

export default function WAPaymentConversionServer({ data, theme, dataMasked }) {
  const isDark = theme === 'dark'
  const mp = (phone) => dataMasked ? maskPhone(phone) : phone

  if (!data) return null

  const {
    totalClicked = 0,
    formSubmitted = 0,
    conversionRate = 0,
    formSubmittedDetails = [],
  } = data

  const funnelSteps = [
    { label: 'Clicked', value: totalClicked, color: 'text-amber-500' },
    { label: 'Form Submitted', value: formSubmitted, color: 'text-blue-500' },
  ]

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-white border-slate-200'}`}>
      <div className="px-6 py-5">
        <h3 className={`text-sm font-semibold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Form conversion</h3>
        <p className={`text-[11px] mb-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Clicked users with an MBA application (application no.) after first template send/deliver.
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
            Click → Form rate: <span className="font-bold text-blue-500">{conversionRate}%</span>
          </p>
        )}
      </div>

      {(formSubmittedDetails?.length || 0) > 0 && (
        <div className={`border-t ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
          <div className="px-6 pt-4 pb-2">
            <p className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Form submitted ({formSubmittedDetails.length})
            </p>
          </div>
          <div className="px-6 pb-4">
            <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className={isDark ? 'bg-slate-800 sticky top-0' : 'bg-white sticky top-0'}>
                    <tr>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>#</th>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mobile</th>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Template Clicked</th>
                      <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Button Clicked</th>
                    </tr>
                  </thead>
                  <tbody className={isDark ? 'divide-y divide-slate-800' : 'divide-y divide-slate-200'}>
                    {(formSubmittedDetails || []).map((u, idx) => (
                      <tr key={u.mobile}>
                        <td className={`px-3 py-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{idx + 1}</td>
                        <td className={`px-3 py-2 font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{mp(u.mobile)}</td>
                        <td className="px-3 py-2">
                          <TagList items={u.clickedTemplates} color={isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-700'} isDark={isDark} />
                        </td>
                        <td className="px-3 py-2">
                          <TagList items={u.clickedButtons} color={isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-50 text-amber-700'} isDark={isDark} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`px-6 py-3 border-t text-[10px] ${isDark ? 'border-slate-800 text-slate-600' : 'border-slate-100 text-slate-400'}`}>
        Form counts only include applications with timestamps on or after the first sent/delivered WhatsApp for that number. npfMbaApplications + marketingwa.
      </div>
    </div>
  )
}
