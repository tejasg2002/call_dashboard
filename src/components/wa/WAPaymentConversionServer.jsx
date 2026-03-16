'use client'

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

export default function WAPaymentConversionServer({ data, theme }) {
  const isDark = theme === 'dark'
  if (!data) return null

  const { totalClicked = 0, formSubmitted = 0, paid = 0, conversionRate = 0, paidDetails = [] } = data

  const funnelSteps = [
    { label: 'Clicked', value: totalClicked, color: 'text-amber-500' },
    { label: 'Form Submitted', value: formSubmitted, color: 'text-blue-500' },
    { label: 'Paid', value: paid, color: 'text-emerald-500' },
  ]

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-white border-slate-200'}`}>
      <div className="px-6 py-5">
        <div className="grid grid-cols-3 gap-8 mb-6">
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
            Click → Payment conversion rate: <span className="font-bold text-emerald-500">{conversionRate}%</span>
          </p>
        )}
      </div>

      {paidDetails.length > 0 && (
        <div className={`border-t ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
          <div className="px-6 py-4">
            <h4 className={`text-xs font-semibold mb-3 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              Paid users ({paidDetails.length})
            </h4>
            <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className={isDark ? 'bg-slate-800' : 'bg-white'}>
                    <tr>
                      <th className={`px-4 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>#</th>
                      <th className={`px-4 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mobile</th>
                      <th className={`px-4 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Application No</th>
                      <th className={`px-4 py-2 text-right font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className={isDark ? 'divide-y divide-slate-800' : 'divide-y divide-slate-200'}>
                    {paidDetails.map((u, idx) => (
                      <tr key={u.mobile}>
                        <td className={`px-4 py-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{idx + 1}</td>
                        <td className={`px-4 py-1.5 font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{u.mobile}</td>
                        <td className={`px-4 py-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{u.application_no || '—'}</td>
                        <td className={`px-4 py-1.5 text-right font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                          {u.payment_amount ? `₹${Number(u.payment_amount).toLocaleString('en-IN')}` : '—'}
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
        Data sourced entirely from MongoDB (npfMbaApplications). Auto-refreshed every hour via cron.
      </div>
    </div>
  )
}
