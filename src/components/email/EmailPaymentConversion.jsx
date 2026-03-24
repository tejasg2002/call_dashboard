'use client'

import { useMemo } from 'react'

function HeroMetric({ value, label, sub, accent, isDark }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
      <p className={`text-[11px] font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
      {sub && <p className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  )
}

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

export default function EmailPaymentConversion({ data, theme }) {
  const isDark = theme === 'dark'

  if (!data || data.totalClicked === 0) return null

  const { totalClicked, formSubmitted, conversionRate, perSubject } = data

  const sortedSubjects = useMemo(() => {
    if (!perSubject) return []
    return Object.entries(perSubject)
      .map(([subject, stats]) => ({ subject, ...stats }))
      .sort((a, b) => b.formSubmitted - a.formSubmitted || b.clicked - a.clicked)
  }, [perSubject])

  const maxClicked = sortedSubjects.length > 0 ? Math.max(...sortedSubjects.map((s) => s.clicked)) : 1

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
      <div className={`px-6 py-5 ${isDark ? 'bg-gradient-to-r from-slate-800 to-slate-800/50' : 'bg-gradient-to-r from-brand-50/80 to-white'}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? 'bg-brand-500/10' : 'bg-brand-100'}`}>
            <svg className={`w-4 h-4 ${isDark ? 'text-brand-400' : 'text-brand-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <div>
            <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Form conversion</h3>
            <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Clicked users with an MBA application (application no.) after the SES send for that subject.
            </p>
          </div>
        </div>

        <div className={`mt-5 grid grid-cols-3 gap-3 py-4 px-2 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-white/80 shadow-inner'}`}>
          <HeroMetric
            value={totalClicked.toLocaleString('en-IN')}
            label="Clicked Users"
            accent={isDark ? 'text-blue-400' : 'text-blue-600'}
            isDark={isDark}
          />
          <HeroMetric
            value={formSubmitted.toLocaleString('en-IN')}
            label="Form Submitted"
            sub={totalClicked > 0 ? `${((formSubmitted / totalClicked) * 100).toFixed(1)}% of clicked` : ''}
            accent={isDark ? 'text-amber-400' : 'text-amber-600'}
            isDark={isDark}
          />
          <HeroMetric
            value={`${conversionRate}%`}
            label="Click → Form rate"
            sub="of clicked users"
            accent={formSubmitted > 0 ? (isDark ? 'text-brand-400' : 'text-brand-600') : (isDark ? 'text-slate-500' : 'text-slate-400')}
            isDark={isDark}
          />
        </div>

        <div className="flex items-center gap-2 mt-4">
          <FunnelStep label="Clicked" value={totalClicked} total={totalClicked} color="text-blue-500" isDark={isDark} />
          <FunnelStep label="Form" value={formSubmitted} total={totalClicked} color="text-amber-500" isLast isDark={isDark} />
        </div>
      </div>

      <div className="px-6 py-4">
        <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          By Email Subject ({sortedSubjects.length})
        </p>

        {sortedSubjects.length > 0 ? (
          <div className="space-y-1">
            {sortedSubjects.map((row) => {
              const barWidth = maxClicked > 0 ? (row.clicked / maxClicked) * 100 : 0

              return (
                <div
                  key={row.subject}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-colors ${
                    isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`} title={row.subject}>{row.subject}</span>
                      {row.formSubmitted > 0 && (
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>
                          {row.formSubmitted} forms
                        </span>
                      )}
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-amber-500 transition-all duration-700" style={{ width: `${barWidth}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-center w-14">
                      <p className={`text-sm font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{row.clicked.toLocaleString('en-IN')}</p>
                      <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Clicked</p>
                    </div>
                    <div className="text-center w-14">
                      <p className={`text-sm font-bold ${row.formSubmitted > 0 ? (isDark ? 'text-amber-400' : 'text-amber-600') : isDark ? 'text-slate-600' : 'text-slate-300'}`}>{row.formSubmitted.toLocaleString('en-IN')}</p>
                      <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Forms</p>
                    </div>
                    <div className={`text-center w-14 px-2 py-1 rounded-lg ${row.formRate > 0 ? (isDark ? 'bg-amber-900/30' : 'bg-amber-50') : ''}`}>
                      <p className={`text-sm font-bold ${row.formRate > 0 ? (isDark ? 'text-amber-400' : 'text-amber-600') : isDark ? 'text-slate-600' : 'text-slate-300'}`}>{row.formRate}%</p>
                      <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Form %</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className={`text-xs text-center py-6 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>No clicked users found</p>
        )}
      </div>
    </div>
  )
}
