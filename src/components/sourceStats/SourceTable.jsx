'use client'

import { useState, useMemo } from 'react'
import { cn } from '../../lib/utils'

const COLUMNS = [
  { key: 'source', label: 'Source', align: 'left' },
  { key: 'totalLeads', label: 'Leads', align: 'right' },
  { key: 'totalCalls', label: 'Calls', align: 'right' },
  { key: 'avgCallsPerLead', label: 'Avg Calls/Lead', align: 'right' },
  { key: 'maxCalls', label: 'Max Calls', align: 'right' },
  { key: 'zeroCallLeads', label: 'Zero-Call Leads', align: 'right' },
  { key: 'connectedLeadsPct', label: 'Connected %', align: 'right' },
]

const SourceTable = ({ rows, loading, dateLabel }) => {
  const [sortKey, setSortKey] = useState('totalCalls')
  const [sortDir, setSortDir] = useState('desc')
  const [search, setSearch] = useState('')
  const [hideZeroCalls, setHideZeroCalls] = useState(false)

  const isFiltered = dateLabel && dateLabel !== 'All time'

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    if (!rows) return []
    let result = rows
    if (search) {
      const s = search.toLowerCase()
      result = result.filter((r) => r.source?.toLowerCase().includes(s))
    }
    if (hideZeroCalls || isFiltered) {
      result = result.filter((r) => r.totalCalls > 0)
    }
    return [...result].sort((a, b) => {
      const aVal = a[sortKey] ?? 0
      const bVal = b[sortKey] ?? 0
      if (typeof aVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [rows, search, sortKey, sortDir, hideZeroCalls, isFiltered])

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      "bg-white dark:bg-slate-900/60",
      "border-slate-200/80 dark:border-slate-800"
    )}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Source Breakdown
          </h3>
          {isFiltered && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
              Calls: {dateLabel}
            </span>
          )}
          {!isFiltered && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hideZeroCalls}
                onChange={(e) => setHideZeroCalls(e.target.checked)}
                className="w-3 h-3 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Hide zero-call</span>
            </label>
          )}
        </div>
        <input
          type="text"
          placeholder="Search source..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(
            "px-3 py-1.5 rounded-lg border text-xs w-48",
            "bg-white dark:bg-slate-800",
            "border-slate-200 dark:border-slate-700",
            "text-slate-700 dark:text-slate-300",
            "placeholder:text-slate-400 dark:placeholder:text-slate-500",
            "focus:outline-none focus:border-brand-400 dark:focus:border-brand-500"
          )}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    "px-5 py-3 font-semibold text-[11px] uppercase tracking-wider cursor-pointer select-none transition-colors",
                    "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300",
                    col.align === 'right' ? 'text-right' : 'text-left'
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <svg className={cn("w-3 h-3 transition-transform", sortDir === 'asc' && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && filtered.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-5 py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                  Loading source data...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-5 py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                  No sources found
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr
                  key={row.source}
                  className={cn(
                    "border-b last:border-b-0 transition-colors",
                    "border-slate-50 dark:border-slate-800/50",
                    "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  )}
                >
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        i < 3 ? "bg-brand-600" : i < 8 ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                      )} />
                      {row.source}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                    {row.totalLeads.toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                    {row.totalCalls.toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs">
                    <span className={cn(
                      "inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold",
                      row.avgCallsPerLead >= 3
                        ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : row.avgCallsPerLead >= 1
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                      {row.avgCallsPerLead}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                    {row.maxCalls}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">
                    {row.zeroCallLeads.toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                        <div
                          className="h-full bg-brand-600 rounded-full transition-all duration-500"
                          style={{ width: `${row.connectedLeadsPct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400 w-12 text-right">
                        {row.connectedLeadsPct}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500">
          Showing {filtered.length} of {rows?.length ?? 0} sources
        </div>
      )}
    </div>
  )
}

export default SourceTable
