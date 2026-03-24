'use client'

import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'

function maskLeadId(id, masked) {
  if (!id) return '—'
  if (!masked) return id
  const s = String(id)
  if (s.length <= 8) return `${s.slice(0, 2)}…`
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

function maskPersonName(name, masked) {
  if (!name) return '—'
  if (!masked) return name
  return name
    .trim()
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? '•' : `${part[0]}${'•'.repeat(Math.min(part.length - 1, 6))}`))
    .join(' ')
}

export default function WAChatLeadsTable({ rows, theme, dataMasked, fetchedAt, loading, error, shareWithEmail }) {
  const isDark = theme === 'dark'
  const [q, setQ] = useState('')
  const [stageFilter, setStageFilter] = useState('')

  const stages = useMemo(() => {
    const set = new Set()
    for (const r of rows || []) {
      if (r.leadStage) set.add(r.leadStage)
    }
    return [...set].sort()
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows || []
    if (stageFilter) list = list.filter((r) => r.leadStage === stageFilter)
    if (q.trim()) {
      const n = q.trim().toLowerCase()
      list = list.filter((r) => {
        const blob = [r.slNo, r.leadId, r.registeredName, r.previousLeadStage, r.leadStage]
          .join(' ')
          .toLowerCase()
        return blob.includes(n)
      })
    }
    return list
  }, [rows, q, stageFilter])

  if (loading) {
    return (
      <div className={cn('rounded-2xl border p-12 flex justify-center', isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white')}>
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('rounded-2xl border p-6 text-sm space-y-3', isDark ? 'border-rose-800 bg-rose-950/30 text-rose-200' : 'border-rose-200 bg-rose-50 text-rose-800')}>
        <p className="whitespace-pre-wrap">{error}</p>
        {shareWithEmail && (
          <div className={cn('rounded-lg px-3 py-2 text-xs font-mono break-all', isDark ? 'bg-slate-900/80 text-brand-300' : 'bg-white text-brand-800 border border-rose-200')}>
            <span className={cn('block text-[10px] font-sans font-semibold uppercase tracking-wider mb-1', isDark ? 'text-slate-500' : 'text-slate-500')}>
              Add this email in Sheet → Share (Viewer)
            </span>
            {shareWithEmail}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('rounded-2xl border overflow-hidden', isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-white border-slate-200')}>
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between border-b border-inherit">
        <div>
          <h2 className={cn('text-sm font-semibold', isDark ? 'text-white' : 'text-slate-900')}>Lead chat sheet</h2>
          <p className={cn('text-[11px] mt-0.5', isDark ? 'text-slate-500' : 'text-slate-400')}>
            {filtered.length.toLocaleString('en-IN')} rows
            {fetchedAt && (
              <span className={cn('ml-2', isDark ? 'text-slate-600' : 'text-slate-400')}>
                · Updated {new Date(fetchedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs w-44 sm:w-52',
              isDark ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-800',
              'focus:outline-none focus:border-brand-400',
            )}
          />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg border text-[11px] font-medium',
              isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700',
            )}
          >
            <option value="">All lead stages</option>
            {stages.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className={cn('sticky top-0 z-10', isDark ? 'bg-slate-800' : 'bg-slate-50')}>
            <tr>
              {['Sl.No', 'Lead Id', 'Registered Name', 'Previous Lead Stage', 'Lead Stage'].map((h) => (
                <th
                  key={h}
                  className={cn(
                    'px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap',
                    isDark ? 'text-slate-400' : 'text-slate-500',
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={isDark ? 'divide-y divide-slate-800/80' : 'divide-y divide-slate-100'}>
            {filtered.map((r, i) => (
              <tr key={`${r.leadId}-${i}`} className={isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50/80'}>
                <td className={cn('px-4 py-2 tabular-nums', isDark ? 'text-slate-500' : 'text-slate-400')}>{r.slNo || i + 1}</td>
                <td className={cn('px-4 py-2 font-mono', isDark ? 'text-slate-200' : 'text-slate-800')}>{maskLeadId(r.leadId, dataMasked)}</td>
                <td className={cn('px-4 py-2 font-medium', isDark ? 'text-slate-200' : 'text-slate-800')}>{maskPersonName(r.registeredName, dataMasked)}</td>
                <td className={cn('px-4 py-2', isDark ? 'text-slate-400' : 'text-slate-600')}>{r.previousLeadStage || '—'}</td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      'inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold',
                      isDark ? 'bg-brand-900/40 text-brand-300' : 'bg-brand-50 text-brand-800',
                    )}
                  >
                    {r.leadStage || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className={cn('text-center py-10 text-sm', isDark ? 'text-slate-500' : 'text-slate-400')}>No rows match your filters.</p>
        )}
      </div>
    </div>
  )
}
