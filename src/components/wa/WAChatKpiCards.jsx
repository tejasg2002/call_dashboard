'use client'

import { cn } from '../../lib/utils'

export default function WAChatKpiCards({ stats, theme }) {
  const isDark = theme === 'dark'
  if (!stats) return null

  const {
    totalLeads = 0,
    uniqueLeadIds = 0,
    formSubmitted = 0,
    formSubmittedNpf = 0,
  } = stats

  const pctOfRows =
    totalLeads > 0 ? ((formSubmitted / totalLeads) * 100).toFixed(1) : null

  const cards = [
    {
      label: 'Leads',
      value: totalLeads.toLocaleString('en-IN'),
      sub:
        uniqueLeadIds > 0
          ? `${uniqueLeadIds.toLocaleString('en-IN')} unique Lead Id${uniqueLeadIds === 1 ? '' : 's'}`
          : 'Rows in sheet',
      color: 'blue',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
    {
      label: 'Form submitted',
      value: formSubmitted.toLocaleString('en-IN'),
      sub: [
        pctOfRows != null ? `${pctOfRows}% of rows (Lead Stage in sheet)` : 'From Lead Stage column',
        totalLeads > 0
          ? `${formSubmittedNpf.toLocaleString('en-IN')} with app no. in NPF (Lead Id match)`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      color: 'amber',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
    },
  ]

  const iconStyles = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  }
  const valueStyles = {
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={cn(
            'rounded-xl border p-4',
            isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200/80',
          )}
        >
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', iconStyles[c.color])}>
            {c.icon}
          </div>
          <p className={cn('text-2xl font-bold font-mono tracking-tight', valueStyles[c.color])}>{c.value}</p>
          <p className={cn('text-[11px] font-medium mt-0.5', isDark ? 'text-slate-400' : 'text-slate-500')}>{c.label}</p>
          <p className={cn('text-[10px] mt-1 leading-snug', isDark ? 'text-slate-600' : 'text-slate-400')}>{c.sub}</p>
        </div>
      ))}
    </div>
  )
}
