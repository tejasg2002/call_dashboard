'use client'

import { useState, useMemo } from 'react'
import { cn } from '../../lib/utils'

const EVENT_COLS = [
  { key: 'totalCalls', label: 'Total Calls', color: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200' },
  { key: 'Ringing', label: 'Ringing', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
  { key: 'Answered', label: 'Answered', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
  { key: 'Hangup', label: 'Hangup', color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
  { key: 'User Call Hangup', label: 'User Hangup', color: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
  { key: 'abandoned', label: 'Abandoned', color: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  { key: 'Abandoned on IVR', label: 'Abandoned IVR', color: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' },
]

function fmt(n) {
  return typeof n === 'number' ? n.toLocaleString('en-IN') : '0'
}

export default function SmartPingCallStats({ rows, loading }) {
  const list = Array.isArray(rows) ? rows : []
  const [selectedAgent, setSelectedAgent] = useState('__all__')

  const agents = useMemo(
    () => list.map((r) => r.agent).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [list],
  )

  const stats = useMemo(() => {
    if (selectedAgent === '__all__') {
      return list.reduce(
        (acc, r) => {
          acc.totalCalls += r.totalCalls || 0
          acc.Ringing += r.Ringing || 0
          acc.Answered += r.Answered || 0
          acc.Hangup += r.Hangup || 0
          acc['User Call Hangup'] += r['User Call Hangup'] || 0
          acc.abandoned += r.abandoned || 0
          acc['Abandoned on IVR'] += r['Abandoned on IVR'] || 0
          return acc
        },
        { totalCalls: 0, Ringing: 0, Answered: 0, Hangup: 0, 'User Call Hangup': 0, abandoned: 0, 'Abandoned on IVR': 0 },
      )
    }
    return list.find((r) => r.agent === selectedAgent) || { totalCalls: 0, Ringing: 0, Answered: 0, Hangup: 0, 'User Call Hangup': 0, abandoned: 0, 'Abandoned on IVR': 0 }
  }, [list, selectedAgent])

  const answerRate = stats.totalCalls > 0 ? ((stats.Answered / stats.totalCalls) * 100).toFixed(1) : '0.0'

  return (
    <div className="rounded-xl border overflow-hidden bg-white dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            SmartPing Call Stats
            <span className="ml-2 text-[10px] font-normal text-slate-400 dark:text-slate-500">Today (deduped by call ID)</span>
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Counselor:</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-brand-400 min-w-[160px]"
          >
            <option value="__all__">All Counselors</option>
            {agents.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Loading...</div>
      ) : (
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {EVENT_COLS.map((col) => (
              <div
                key={col.key}
                className={cn(
                  'rounded-xl px-4 py-3 text-center',
                  col.color,
                )}
              >
                <div className="text-xl font-bold tabular-nums">{fmt(stats[col.key])}</div>
                <div className="text-[10px] font-medium mt-0.5 opacity-70 uppercase tracking-wider">{col.label}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Answer rate: <span className={cn('font-semibold', parseFloat(answerRate) >= 30 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>{answerRate}%</span></span>
            <span>Agents active: <span className="font-semibold text-slate-700 dark:text-slate-300">{agents.length}</span></span>
          </div>
        </div>
      )}
    </div>
  )
}
