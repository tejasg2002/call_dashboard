'use client'

import { cn } from '../lib/utils'

const MetricsCards = ({ kpi, loading, dateLabel = 'All time' }) => {
  const totalCalls = kpi?.totalCalls ?? 0
  const averageScore = kpi?.averageScore ?? 0
  const interestedCount = kpi?.interestedCount ?? 0
  const notInterestedCount = kpi?.notInterestedCount ?? 0
  const interestedPct = kpi?.interestedPct ?? 0
  const notInterestedPct = kpi?.notInterestedPct ?? 0
  const scorePct = Math.min(averageScore, 100)
  const isEmpty = loading && !kpi

  const cards = [
    {
      label: 'Total Calls',
      value: isEmpty ? '—' : totalCalls.toLocaleString('en-IN'),
      sub: dateLabel,
      accent: 'brand',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
        </svg>
      ),
      detail: totalCalls > 0 && (
        <div className="mt-4 space-y-2">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden flex">
            <div className="h-full bg-brand-600 rounded-full transition-all duration-700" style={{ width: `${interestedPct}%` }} />
            <div className="h-full bg-red-400 rounded-full transition-all duration-700" style={{ width: `${notInterestedPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />
              Interested {interestedCount}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Not interested {notInterestedCount}
            </span>
          </div>
        </div>
      ),
    },
    {
      label: 'Avg. Score',
      value: isEmpty ? '—' : averageScore,
      sub: `out of 100`,
      accent: 'blue',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
      detail: !isEmpty && (
        <div className="mt-4">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-700"
              style={{ width: `${scorePct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">{scorePct}% of max</p>
        </div>
      ),
    },
    {
      label: 'Interested',
      value: isEmpty ? '—' : interestedCount.toLocaleString('en-IN'),
      sub: totalCalls > 0 ? `${interestedPct}% of total` : '—',
      accent: 'green',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      detail: totalCalls > 0 && (
        <div className="mt-4">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${interestedPct}%` }} />
          </div>
        </div>
      ),
    },
    {
      label: 'Not Interested',
      value: isEmpty ? '—' : notInterestedCount.toLocaleString('en-IN'),
      sub: totalCalls > 0 ? `${notInterestedPct}% of total` : '—',
      accent: 'red',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      detail: totalCalls > 0 && (
        <div className="mt-4">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            <div className="h-full bg-red-400 rounded-full transition-all duration-700" style={{ width: `${notInterestedPct}%` }} />
          </div>
        </div>
      ),
    },
  ]

  const iconBg = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "relative rounded-xl border p-5 transition-all duration-200",
            "bg-white dark:bg-slate-900/60",
            "border-slate-200/80 dark:border-slate-800",
            "hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700"
          )}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {card.label}
              </p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono tracking-tight">
                {card.value}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{card.sub}</p>
            </div>
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", iconBg[card.accent])}>
              {card.icon}
            </div>
          </div>
          {card.detail}
        </div>
      ))}
    </div>
  )
}

export default MetricsCards
