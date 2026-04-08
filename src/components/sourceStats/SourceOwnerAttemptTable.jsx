'use client'

import { useMemo } from 'react'
import { cn } from '../../lib/utils'
import { useClientPagination } from '../../hooks/useClientPagination'
import PaginationBar from '../PaginationBar'

function stripEmail(name) {
  if (!name) return name
  const stripped = String(name).replace(/\s*\([^)]*@[^)]*\)/g, '').trim()
  return stripped
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

const COLS = [
  { key: 'ownerDisplay', label: 'Owner', align: 'left' },
  { key: 'todayLeads', label: 'T Leads', align: 'right', heat: 'scale', title: 'Today Leads' },
  { key: 'targetAttempts', label: 'T Tgt', align: 'right', title: 'Today Target Attempts' },
  { key: 'achievedAttempts', label: 'T Att', align: 'right', heat: 'pct', targetKey: 'targetAttempts', title: 'Today Achieved Attempts' },
  { key: 'yesterdayLeads', label: 'Y Leads', align: 'right', heat: 'scale', title: 'Yesterday Leads' },
  { key: 'yesterdayTargetAttempts', label: 'Y Tgt', align: 'right', title: 'Yesterday Target Attempts' },
  { key: 'yesterdayAttempts', label: 'Y Att', align: 'right', heat: 'pct', targetKey: 'yesterdayTargetAttempts', title: 'Yesterday Attempts' },
  { key: 'dayBeforeYesterdayLeads', label: 'DB Leads', align: 'right', heat: 'scale', title: 'Day Before Yesterday Leads' },
  { key: 'dayBeforeYesterdayTargetAttempts', label: 'DB Tgt', align: 'right', title: 'Day Before Yesterday Target' },
  { key: 'dayBeforeYesterdayAttempts', label: 'DB Att', align: 'right', heat: 'pct', targetKey: 'dayBeforeYesterdayTargetAttempts', title: 'Day Before Yesterday Attempts' },
  { key: 'totalIe', label: 'I&E', align: 'right', heat: 'scale', title: 'Total I&E' },
  { key: 'ieAttempted', label: 'I&E Att', align: 'right', heat: 'scale', title: 'I&E Attempted' },
]

function fmt(n) {
  if (n == null || n === '') return '—'
  return typeof n === 'number' ? n.toLocaleString('en-IN') : String(n)
}

/** % achieved vs target → red/yellow/green */
function pctHeatBg(achieved, target) {
  if (!target || target <= 0) return ''
  const pct = achieved / target
  if (pct >= 1) return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
  if (pct >= 0.6) return 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
  if (pct > 0) return 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
  return ''
}

/** Intensity scale: higher value = stronger blue tint */
function scaleHeatBg(value, maxVal) {
  if (!value || value <= 0 || !maxVal) return ''
  const ratio = Math.min(value / maxVal, 1)
  if (ratio >= 0.75) return 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200'
  if (ratio >= 0.4) return 'bg-blue-50 dark:bg-blue-900/25 text-blue-800 dark:text-blue-300'
  if (ratio > 0) return 'bg-blue-50/50 dark:bg-blue-900/15'
  return ''
}

export default function SourceOwnerAttemptTable({
  rows,
  theme,
  dateNote,
  loading,
  onRefresh,
}) {
  const list = Array.isArray(rows) ? rows : []
  const hasRows = list.length > 0
  const { page, setPage, totalPages, total, pageSize, paginated } = useClientPagination(list, 25)

  const colMaxes = useMemo(() => {
    if (!hasRows) return {}
    const m = {}
    for (const c of COLS) {
      if (c.heat !== 'scale') continue
      let mx = 0
      for (const row of list) {
        const v = Number(row[c.key]) || 0
        if (v > mx) mx = v
      }
      m[c.key] = mx
    }
    return m
  }, [list, hasRows])

  const totalRow = hasRows
    ? list.reduce(
      (acc, row) => ({
        owner: '__total__',
        ownerDisplay: 'Total',
        todayLeads: acc.todayLeads + (Number(row.todayLeads) || 0),
        targetAttempts: acc.targetAttempts + (Number(row.targetAttempts) || 0),
        achievedAttempts: acc.achievedAttempts + (Number(row.achievedAttempts) || 0),
        yesterdayLeads: acc.yesterdayLeads + (Number(row.yesterdayLeads) || 0),
        yesterdayTargetAttempts: acc.yesterdayTargetAttempts + (Number(row.yesterdayTargetAttempts) || 0),
        yesterdayAttempts: acc.yesterdayAttempts + (Number(row.yesterdayAttempts) || 0),
        dayBeforeYesterdayLeads: acc.dayBeforeYesterdayLeads + (Number(row.dayBeforeYesterdayLeads) || 0),
        dayBeforeYesterdayTargetAttempts: acc.dayBeforeYesterdayTargetAttempts + (Number(row.dayBeforeYesterdayTargetAttempts) || 0),
        dayBeforeYesterdayAttempts: acc.dayBeforeYesterdayAttempts + (Number(row.dayBeforeYesterdayAttempts) || 0),
        totalIe: acc.totalIe + (Number(row.totalIe) || 0),
        ieAttempted: acc.ieAttempted + (Number(row.ieAttempted) || 0),
      }),
      {
        owner: '__total__',
        ownerDisplay: 'Total',
        todayLeads: 0,
        targetAttempts: 0,
        achievedAttempts: 0,
        yesterdayLeads: 0,
        yesterdayTargetAttempts: 0,
        yesterdayAttempts: 0,
        dayBeforeYesterdayLeads: 0,
        dayBeforeYesterdayTargetAttempts: 0,
        dayBeforeYesterdayAttempts: 0,
        totalIe: 0,
        ieAttempted: 0,
      },
    )
    : null

  function cellHeat(col, row) {
    if (!col.heat) return ''
    const val = Number(row[col.key]) || 0
    if (col.heat === 'pct') {
      const target = Number(row[col.targetKey]) || 0
      return pctHeatBg(val, target)
    }
    return scaleHeatBg(val, colMaxes[col.key])
  }

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        'bg-white dark:bg-slate-900/60',
        'border-slate-200/80 dark:border-slate-800',
        theme === 'dark' && 'dark',
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Owner attempts (CRM pool)
            </h3>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50',
                  'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/50 border border-brand-200 dark:border-brand-800',
                )}
                title="Reload from saved dashboard cache (fast — same as WhatsApp)"
              >
                <svg className={cn('w-3 h-3', loading && 'animate-spin')} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            )}
          </div>
          {dateNote && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {dateNote}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="inline-block w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800" />
              ≥100% target
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="inline-block w-3 h-3 rounded bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800" />
              60–99%
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="inline-block w-3 h-3 rounded bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800" />
              &lt;60%
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="inline-block w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800" />
              High value
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-[1]">
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-2 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap cursor-default relative group',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {c.label}
                  {c.title && (
                    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 z-30 hidden group-hover:block px-2 py-1 rounded-md text-[11px] font-medium normal-case tracking-normal whitespace-nowrap shadow-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900">
                      {c.title}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td
                  colSpan={COLS.length}
                  className="px-4 py-8 text-center text-slate-400 dark:text-slate-500"
                >
                  Loading…
                </td>
              </tr>
            )}
            {!loading && !hasRows && (
              <tr>
                <td
                  colSpan={COLS.length}
                  className="px-4 py-8 text-center text-slate-400 dark:text-slate-500"
                >
                  No owner attempt rows. Recompute Source Stats or check CRM snapshot / lead mapping.
                </td>
              </tr>
            )}
            {!loading &&
              paginated.map((row) => (
                <tr
                  key={row.owner}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-2 py-1.5',
                        c.align === 'right'
                          ? 'text-right font-mono tabular-nums'
                          : 'font-medium',
                        cellHeat(c, row) || 'text-slate-800 dark:text-slate-200',
                      )}
                    >
                      {c.key === 'ownerDisplay' ? (
                        <span className="capitalize">
                          {stripEmail(row.ownerDisplay || row.owner)}
                        </span>
                      ) : (
                        fmt(row[c.key])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && totalRow && (
              <tr className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-300 dark:border-slate-700">
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-2 py-2 font-semibold',
                      c.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left',
                      cellHeat(c, totalRow) || 'text-slate-900 dark:text-slate-100',
                    )}
                  >
                    {c.key === 'ownerDisplay' ? totalRow.ownerDisplay : fmt(totalRow[c.key])}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
        {!loading && hasRows && (
          <PaginationBar
            page={page}
            setPage={setPage}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
          />
        )}
      </div>
    </div>
  )
}
