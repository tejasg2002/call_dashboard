'use client'

import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'

const DAY_HEADERS = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7+']
const DAY_FULL = ['Registration Day', 'Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7+']

function fmt(n) {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function getHeatColor(value, maxVal) {
  if (value === 0) return { bg: 'bg-slate-50 dark:bg-slate-800/30', text: 'text-slate-300 dark:text-slate-600' }
  const ratio = Math.min(value / Math.max(maxVal, 1), 1)
  if (ratio < 0.1) return { bg: 'bg-brand-50 dark:bg-brand-950/50', text: 'text-brand-500 dark:text-brand-400' }
  if (ratio < 0.25) return { bg: 'bg-brand-100 dark:bg-brand-900/50', text: 'text-brand-600 dark:text-brand-400' }
  if (ratio < 0.5) return { bg: 'bg-brand-200 dark:bg-brand-800/50', text: 'text-brand-700 dark:text-brand-200' }
  if (ratio < 0.75) return { bg: 'bg-brand-400 dark:bg-brand-700/70', text: 'text-white' }
  return { bg: 'bg-brand-600 dark:bg-brand-600', text: 'text-white' }
}

const SourceCadenceHeatmap = ({ rows, loading }) => {
  const [hoveredCell, setHoveredCell] = useState(null)

  const { topRows, globalMax } = useMemo(() => {
    if (!rows) return { topRows: [], globalMax: 0 }
    const sliced = rows.filter((r) => r.totalCalls > 0).slice(0, 15)
    let max = 0
    for (const row of sliced) {
      if (row.dayBreakdown) {
        for (const d of row.dayBreakdown) {
          if (d.totalCalls > max) max = d.totalCalls
        }
      }
    }
    return { topRows: sliced, globalMax: max }
  }, [rows])

  if (loading && (!rows || rows.length === 0)) {
    return (
      <div className={cn(
        "rounded-xl border p-6 h-[300px] flex items-center justify-center",
        "bg-white dark:bg-slate-900/60",
        "border-slate-200/80 dark:border-slate-800"
      )}>
        <p className="text-xs text-slate-400 dark:text-slate-500">Loading cadence data...</p>
      </div>
    )
  }

  if (!rows || topRows.length === 0) return null

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      "bg-white dark:bg-slate-900/60",
      "border-slate-200/80 dark:border-slate-800"
    )}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Calling Cadence
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Total calls by day since lead registered — hover for details
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">Low</span>
          {[
            'bg-brand-50 dark:bg-brand-900/40',
            'bg-brand-200 dark:bg-brand-800/50',
            'bg-brand-400 dark:bg-brand-700/70',
            'bg-brand-600',
          ].map((c, i) => (
            <div key={i} className={cn("w-5 h-3 rounded-sm", c)} />
          ))}
          <span className="text-[10px] text-slate-400 dark:text-slate-500">High</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 w-[170px]">
                Source
              </th>
              {DAY_HEADERS.map((h, i) => (
                <th
                  key={h}
                  className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
                  title={DAY_FULL[i]}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topRows.map((row, ri) => (
              <tr
                key={row.source}
                className="border-t border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
              >
                <td className="px-5 py-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      ri < 3 ? "bg-brand-600" : ri < 8 ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                    )} />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate max-w-[130px]">
                      {row.source}
                    </span>
                  </div>
                </td>
                {(row.dayBreakdown || []).map((d, di) => {
                  const color = getHeatColor(d.totalCalls, globalMax)
                  const isHovered = hoveredCell?.row === ri && hoveredCell?.col === di
                  return (
                    <td
                      key={di}
                      className="py-1 px-1 relative"
                      onMouseEnter={() => setHoveredCell({ row: ri, col: di })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div className={cn(
                        "h-9 rounded-lg flex items-center justify-center transition-all duration-100 cursor-default",
                        color.bg,
                        isHovered && "ring-2 ring-brand-400/60 shadow-sm"
                      )}>
                        <span className={cn("text-[11px] font-bold font-mono tabular-nums", color.text)}>
                          {d.totalCalls > 0 ? fmt(d.totalCalls) : '—'}
                        </span>
                      </div>
                      {isHovered && (
                        <div className={cn(
                          "absolute z-30 bottom-full mb-1 left-1/2 -translate-x-1/2 w-48",
                          "rounded-lg border px-3 py-2.5 shadow-xl pointer-events-none",
                          "bg-white dark:bg-slate-800",
                          "border-slate-200 dark:border-slate-700"
                        )}>
                          <p className="text-[11px] font-semibold text-slate-900 dark:text-white mb-1.5">
                            {row.source} — {DAY_FULL[di]}
                          </p>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">Total calls</span>
                              <span className="text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200">{d.totalCalls.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">Leads reached</span>
                              <span className="text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200">{d.leadsContacted.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">Avg per lead</span>
                              <span className="text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200">{d.avgCallsPerLead.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default SourceCadenceHeatmap
