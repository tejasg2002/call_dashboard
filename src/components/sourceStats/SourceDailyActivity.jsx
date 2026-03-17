'use client'

import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'

const SourceDailyActivity = ({ sourceRows, dailyActivity, loading }) => {
  const [selectedSource, setSelectedSource] = useState('')

  const sourceOptions = useMemo(() => {
    if (!sourceRows) return []
    return sourceRows.filter((r) => r.totalCalls > 0).map((r) => r.source)
  }, [sourceRows])

  const activeSource = selectedSource || sourceOptions[0] || ''

  const dailyRows = useMemo(() => {
    if (!dailyActivity || !activeSource) return []
    return dailyActivity[activeSource] || []
  }, [dailyActivity, activeSource])

  const summary = useMemo(() => {
    if (dailyRows.length === 0) return null
    let totalNewLeads = 0
    let totalCalls = 0
    let totalLeadsCalled = 0
    let activeDays = 0
    for (const d of dailyRows) {
      totalNewLeads += d.newLeads
      totalCalls += d.calls
      totalLeadsCalled += d.leadsCalled
      if (d.calls > 0) activeDays++
    }
    return {
      totalNewLeads,
      totalCalls,
      avgCallsPerDay: activeDays > 0 ? (totalCalls / activeDays).toFixed(1) : '0',
      activeDays,
      totalDays: dailyRows.length,
    }
  }, [dailyRows])

  const maxCalls = useMemo(() => {
    if (dailyRows.length === 0) return 1
    return Math.max(...dailyRows.map((d) => d.calls), 1)
  }, [dailyRows])

  if (loading && (!sourceRows || sourceRows.length === 0)) {
    return (
      <div className={cn(
        "rounded-xl border p-6 h-[300px] flex items-center justify-center",
        "bg-white dark:bg-slate-900/60",
        "border-slate-200/80 dark:border-slate-800"
      )}>
        <p className="text-xs text-slate-400 dark:text-slate-500">Loading daily activity...</p>
      </div>
    )
  }

  if (!sourceRows || sourceOptions.length === 0) return null

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      "bg-white dark:bg-slate-900/60",
      "border-slate-200/80 dark:border-slate-800"
    )}>
      <div className="flex items-center justify-between px-5 pt-5 pb-4 gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Daily Activity
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Day-by-day new leads, calls, and leads contacted for a source
          </p>
        </div>
        <select
          value={activeSource}
          onChange={(e) => setSelectedSource(e.target.value)}
          className={cn(
            "px-3 py-2 rounded-lg border text-xs font-medium min-w-[180px]",
            "bg-white dark:bg-slate-800",
            "border-slate-200 dark:border-slate-700",
            "text-slate-800 dark:text-slate-200",
            "focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-400"
          )}
        >
          {sourceOptions.map((src) => (
            <option key={src} value={src}>{src}</option>
          ))}
        </select>
      </div>

      {summary && (
        <div className="px-5 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total New Leads', value: summary.totalNewLeads.toLocaleString('en-IN') },
            { label: 'Total Calls', value: summary.totalCalls.toLocaleString('en-IN') },
            { label: 'Avg Calls / Active Day', value: summary.avgCallsPerDay },
            { label: 'Active Days', value: `${summary.activeDays} of ${summary.totalDays}` },
          ].map((item) => (
            <div
              key={item.label}
              className={cn(
                "rounded-lg px-3 py-2.5",
                "bg-slate-50 dark:bg-slate-800/50"
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {item.label}
              </p>
              <p className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto max-h-[440px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className={cn(
              "border-y",
              "border-slate-100 dark:border-slate-800",
              "bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm"
            )}>
              <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Date
              </th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                New Leads
              </th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Calls
              </th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Leads Called
              </th>
              <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 w-[200px]">
                Call Volume
              </th>
            </tr>
          </thead>
          <tbody>
            {dailyRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                  No daily data available for this source
                </td>
              </tr>
            ) : (
              dailyRows.map((d) => {
                const barPct = Math.max((d.calls / maxCalls) * 100, 0)
                const dateObj = new Date(d.date + 'T00:00:00')
                const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'short' })
                const dateDisplay = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                return (
                  <tr
                    key={d.date}
                    className={cn(
                      "border-b last:border-b-0 transition-colors",
                      "border-slate-50 dark:border-slate-800/50",
                      "hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                    )}
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 w-7">
                          {dayName}
                        </span>
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {dateDisplay}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn(
                        "text-xs font-mono",
                        d.newLeads > 0 ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-slate-400 dark:text-slate-500"
                      )}>
                        {d.newLeads > 0 ? d.newLeads.toLocaleString('en-IN') : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {d.calls > 0 ? d.calls.toLocaleString('en-IN') : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={cn(
                        "text-xs font-mono",
                        d.leadsCalled > 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-slate-400 dark:text-slate-500"
                      )}>
                        {d.leadsCalled > 0 ? d.leadsCalled.toLocaleString('en-IN') : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500 dark:bg-brand-500 transition-all duration-300"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default SourceDailyActivity
