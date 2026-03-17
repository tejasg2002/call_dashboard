'use client'

import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'

function getHeatBg(ratio) {
  if (ratio === 0) return 'bg-slate-50 dark:bg-slate-800/30'
  if (ratio < 0.05) return 'bg-brand-50 dark:bg-brand-950/40'
  if (ratio < 0.15) return 'bg-brand-100 dark:bg-brand-900/40'
  if (ratio < 0.35) return 'bg-brand-200 dark:bg-brand-800/50'
  if (ratio < 0.6) return 'bg-brand-400 dark:bg-brand-700/60'
  return 'bg-brand-600 dark:bg-brand-600'
}

function getHeatText(ratio) {
  if (ratio === 0) return 'text-slate-300 dark:text-slate-600'
  if (ratio < 0.35) return 'text-brand-700 dark:text-brand-300'
  return 'text-white'
}

function fmtDate(str) {
  const d = new Date(str + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function fmtDay(str) {
  const d = new Date(str + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'short' })
}

function buildLast7Days() {
  const days = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    days.push(`${y}-${m}-${day}`)
  }
  return days
}

const SourceCohortMatrix = ({ sourceRows, cohortMatrix, loading }) => {
  const [selectedSource, setSelectedSource] = useState('')
  const [hoveredCell, setHoveredCell] = useState(null)

  const sourceOptions = useMemo(() => {
    if (!sourceRows || !cohortMatrix) return []
    return sourceRows.filter((r) => cohortMatrix[r.source]).map((r) => r.source)
  }, [sourceRows, cohortMatrix])

  const activeSource = selectedSource || sourceOptions[0] || ''

  const last7 = useMemo(() => buildLast7Days(), [])

  const { cellMap, regLeadCounts } = useMemo(() => {
    if (!cohortMatrix || !activeSource || !cohortMatrix[activeSource]) {
      return { cellMap: {}, regLeadCounts: {} }
    }
    const { cells, regDateLeads } = cohortMatrix[activeSource]
    const map = {}
    for (const { regDate, callDate, calls, leadsContacted } of cells) {
      map[`${regDate}|${callDate}`] = { calls, leadsContacted }
    }
    return { cellMap: map, regLeadCounts: regDateLeads || {} }
  }, [cohortMatrix, activeSource])

  if (loading && (!sourceRows || sourceRows.length === 0)) {
    return (
      <div className={cn(
        "rounded-xl border p-6 h-[300px] flex items-center justify-center",
        "bg-white dark:bg-slate-900/60",
        "border-slate-200/80 dark:border-slate-800"
      )}>
        <p className="text-xs text-slate-400 dark:text-slate-500">Loading cohort data...</p>
      </div>
    )
  }

  if (!cohortMatrix || sourceOptions.length === 0) return null

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      "bg-white dark:bg-slate-900/60",
      "border-slate-200/80 dark:border-slate-800"
    )}>
      <div className="flex items-center justify-between px-5 pt-5 pb-3 gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Lead Registration vs Call Date — Last 7 Days
          </h3>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Cell = leads contacted / total calls — hover for % ratio
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

      <div className="overflow-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-slate-50/95 dark:bg-slate-900/95">
              <th className={cn(
                "sticky left-0 z-20 px-3 py-2.5 text-left font-semibold min-w-[100px]",
                "text-slate-400 dark:text-slate-500",
                "bg-slate-50 dark:bg-slate-900 border-b border-r",
                "border-slate-200 dark:border-slate-800"
              )}>
                <div className="leading-tight">
                  <span className="block text-[9px] uppercase tracking-wider">Reg Date ↓</span>
                  <span className="block text-[9px] text-slate-300 dark:text-slate-600 uppercase tracking-wider">Call Date →</span>
                </div>
              </th>
              {last7.map((cd) => (
                <th
                  key={cd}
                  className={cn(
                    "px-1 py-2.5 text-center font-semibold whitespace-nowrap",
                    "text-slate-400 dark:text-slate-500",
                    "border-b border-slate-200 dark:border-slate-800"
                  )}
                >
                  <div className="leading-tight">
                    <span className="block text-[9px] text-slate-300 dark:text-slate-600">{fmtDay(cd)}</span>
                    <span className="block">{fmtDate(cd)}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...last7, '_older'].map((rd) => {
              const isOlder = rd === '_older'
              const totalLeadsForDate = regLeadCounts[rd] || 0
              if (isOlder && totalLeadsForDate === 0) return null
              return (
                <tr key={rd} className={cn(
                  "hover:bg-slate-50/50 dark:hover:bg-slate-800/20",
                  isOlder && "border-t-2 border-slate-200 dark:border-slate-700"
                )}>
                  <td className={cn(
                    "sticky left-0 z-10 px-3 py-1.5 font-medium whitespace-nowrap",
                    "bg-white dark:bg-slate-900 border-r",
                    "border-slate-100 dark:border-slate-800"
                  )}>
                    <div className="flex items-center gap-2">
                      {isOlder ? (
                        <span className="text-slate-500 dark:text-slate-400 text-[10px]">Older leads</span>
                      ) : (
                        <div>
                          <span className="text-[9px] text-slate-300 dark:text-slate-600 block">{fmtDay(rd)}</span>
                          <span className="text-slate-700 dark:text-slate-300">{fmtDate(rd)}</span>
                        </div>
                      )}
                      {totalLeadsForDate > 0 && (
                        <span className={cn(
                          "text-[9px] font-semibold px-1.5 py-0.5 rounded",
                          isOlder
                            ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            : "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                          {totalLeadsForDate.toLocaleString('en-IN')}L
                        </span>
                      )}
                    </div>
                  </td>
                  {last7.map((cd) => {
                    const key = `${rd}|${cd}`
                    const cell = cellMap[key]
                    const leads = cell?.leadsContacted || 0
                    const calls = cell?.calls || 0
                    const ratio = totalLeadsForDate > 0 ? calls / totalLeadsForDate : 0
                    const isHovered = hoveredCell === key
                    const bg = getHeatBg(ratio)
                    const text = getHeatText(ratio)

                    return (
                      <td
                        key={cd}
                        className="p-0.5 relative"
                        onMouseEnter={() => setHoveredCell(key)}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div className={cn(
                          "h-16 rounded-lg flex flex-col items-center justify-center transition-all cursor-default",
                          bg,
                          isHovered && "ring-2 ring-brand-400/60 shadow-sm z-10"
                        )}>
                          {calls > 0 ? (
                            <>
                              <span className={cn("text-[11px] font-bold tabular-nums leading-none", text)}>
                                {totalLeadsForDate}/{calls}
                              </span>
                              <span className={cn("text-[9px] leading-none mt-1 font-medium opacity-70", text)}>
                                {(ratio * 100).toFixed(0)}% reach
                              </span>
                              <span className={cn("text-[9px] leading-none mt-0.5 font-bold", text)}>
                                ~{(calls / leads).toFixed(1)}/user
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-200 dark:text-slate-700 text-sm">·</span>
                          )}
                        </div>

                        {isHovered && calls > 0 && (
                          <div className={cn(
                            "absolute z-30 bottom-full mb-1 left-1/2 -translate-x-1/2 w-56",
                            "rounded-lg border px-3 py-2.5 shadow-xl pointer-events-none",
                            "bg-white dark:bg-slate-800",
                            "border-slate-200 dark:border-slate-700"
                          )}>
                            <p className="text-[11px] font-semibold text-slate-900 dark:text-white mb-1.5">
                              {activeSource}
                            </p>
                            <div className="space-y-1 text-[10px]">
                              <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400">Registered</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{isOlder ? 'Before last 7 days' : `${fmtDay(rd)} ${fmtDate(rd)}`}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400">Called on</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{fmtDay(cd)} {fmtDate(cd)}</span>
                              </div>
                              <div className="border-t border-slate-100 dark:border-slate-700 pt-1 mt-1 space-y-0.5">
                                <div className="flex justify-between">
                                  <span className="text-slate-500 dark:text-slate-400">Total leads (reg day)</span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">{totalLeadsForDate}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 dark:text-slate-400">Leads contacted</span>
                                  <span className="font-bold text-blue-600 dark:text-blue-400">{leads}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 dark:text-slate-400">Total calls</span>
                                  <span className="font-bold text-brand-600 dark:text-brand-400">{calls}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-500 dark:text-slate-400">Calls / total leads</span>
                                  <span className="font-bold text-amber-600 dark:text-amber-400">{(ratio * 100).toFixed(1)}%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">Low</span>
          {[
            'bg-slate-100 dark:bg-slate-700',
            'bg-brand-100 dark:bg-brand-900/40',
            'bg-brand-200 dark:bg-brand-800/50',
            'bg-brand-400 dark:bg-brand-700/60',
            'bg-brand-600',
          ].map((c, i) => (
            <div key={i} className={cn("w-5 h-3 rounded-sm", c)} />
          ))}
          <span className="text-[10px] text-slate-400 dark:text-slate-500">High</span>
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          Last 7 days · 7×7 matrix
        </span>
      </div>
    </div>
  )
}

export default SourceCohortMatrix
