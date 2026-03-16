'use client'

import { cn } from '../lib/utils'

const PerformanceCards = ({ ownerStatsToday, ownerStatsMonth }) => {
  if (
    (!ownerStatsToday || ownerStatsToday.length === 0) &&
    (!ownerStatsMonth || ownerStatsMonth.length === 0)
  ) {
    return null
  }

  const formatOwner = (owner) =>
    owner.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const topToday = ownerStatsToday?.[0]
  const topMonth = ownerStatsMonth?.[0]

  const cards = [
    topToday && {
      title: 'Top Performer',
      period: 'Today',
      name: formatOwner(topToday.owner),
      calls: topToday.totalCalls,
      avgScore: topToday.avgScore,
      maxScore: topToday.maxScore,
    },
    topMonth && {
      title: 'Top Performer',
      period: 'This Month',
      name: formatOwner(topMonth.owner),
      calls: topMonth.totalCalls,
      avgScore: topMonth.avgScore,
      maxScore: topMonth.maxScore,
    },
  ].filter(Boolean)

  if (cards.length === 0) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {cards.map((card) => (
        <div
          key={card.period}
          className={cn(
            "rounded-xl border p-5 transition-all duration-200",
            "bg-white dark:bg-slate-900/60",
            "border-slate-200/80 dark:border-slate-800",
            "hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700"
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {card.title}
            </p>
            <span className={cn(
              "px-2 py-0.5 rounded text-[10px] font-semibold",
              "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
            )}>
              {card.period}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
              "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
            )}>
              {card.name?.[0] || '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{card.name}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {card.calls} calls &middot; avg score {card.avgScore}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-slate-900 dark:text-white">{card.calls}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Calls</p>
            </div>
            <div className="text-center border-x border-slate-100 dark:border-slate-800">
              <p className="text-lg font-bold font-mono text-slate-900 dark:text-white">{card.avgScore}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Avg Score</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold font-mono text-slate-900 dark:text-white">{card.maxScore}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">Best</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default PerformanceCards
