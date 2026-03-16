'use client'

import { cn } from '../lib/utils'

const PerformanceCharts = ({ ownerStats }) => {
  if (!ownerStats || ownerStats.length === 0) return null

  const topByCalls = ownerStats.slice(0, 5)
  const sortedByScore = [...ownerStats].sort((a, b) => b.avgScore - a.avgScore)
  const topByScore = sortedByScore.slice(0, 5)

  const maxCalls = topByCalls[0]?.totalCalls || 1
  const maxScore = topByScore[0]?.avgScore || 1

  const formatOwner = (owner) =>
    owner.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const chartCard = (title, data, maxVal, getVal, getLabel, barColor) => (
    <div className={cn(
      "rounded-xl border p-5 transition-all duration-200",
      "bg-white dark:bg-slate-900/60",
      "border-slate-200/80 dark:border-slate-800",
      "hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700"
    )}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
        {title}
      </p>
      <div className="space-y-3">
        {data.map((item, i) => {
          const val = getVal(item)
          const pct = Math.max(8, Math.round((val / maxVal) * 100))
          return (
            <div key={item.owner} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0",
                    i === 0
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  )}>
                    {i + 1}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 truncate text-[12px]">
                    {formatOwner(item.owner)}
                  </span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[12px] shrink-0 ml-2">
                  {getLabel(item)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/50 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", barColor)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {chartCard(
        'Calls by Counselor',
        topByCalls,
        maxCalls,
        (item) => item.totalCalls,
        (item) => `${item.totalCalls} calls`,
        'bg-brand-600'
      )}
      {chartCard(
        'Score by Counselor',
        topByScore,
        maxScore,
        (item) => item.avgScore,
        (item) => `${item.avgScore} avg`,
        'bg-blue-500'
      )}
    </div>
  )
}

export default PerformanceCharts
