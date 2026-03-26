'use client'

import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'

const COLS = [
  { key: 'ownerDisplay', label: 'Owner', align: 'left' },
  { key: 'todayLeads', label: 'Today Leads', align: 'right' },
  { key: 'targetAttempts', label: 'Target Attempts', align: 'right' },
  { key: 'achievedAttempts', label: 'Achieved Attempts', align: 'right' },
  { key: 'yesterdayLeads', label: 'Yesterday Leads', align: 'right' },
  { key: 'yesterdayAttempts', label: 'Yesterday Attempts', align: 'right' },
  { key: 'dayBeforeYesterdayLeads', label: 'Day B4 Yest Leads', align: 'right' },
  { key: 'dayBeforeYesterdayAttempts', label: 'Day before Yest Attempts', align: 'right' },
  { key: 'totalIe', label: 'Total I&E', align: 'right' },
  { key: 'ieAttemptedToday', label: 'I&E Attempted', align: 'right' },
]

function fmt(n) {
  if (n == null || n === '') return '—'
  return typeof n === 'number' ? n.toLocaleString('en-IN') : String(n)
}

export default function SourceOwnerActivityTable({ ownerActivity, loading }) {
  const [search, setSearch] = useState('')
  const [hideAllZero, setHideAllZero] = useState(false)

  const rows = ownerActivity?.rows
  const labels = ownerActivity?.istDateLabels

  const filtered = useMemo(() => {
    if (!rows?.length) return []
    let r = rows
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter((row) => row.ownerDisplay?.toLowerCase().includes(q) || row.owner?.toLowerCase().includes(q))
    }
    if (hideAllZero) {
      r = r.filter(
        (row) =>
          row.todayLeads
          || row.targetAttempts
          || row.achievedAttempts
          || row.yesterdayLeads
          || row.yesterdayAttempts
          || row.dayBeforeYesterdayLeads
          || row.dayBeforeYesterdayAttempts
          || row.totalIe
          || row.ieAttemptedToday,
      )
    }
    return r
  }, [rows, search, hideAllZero])

  const totalRow = useMemo(() => {
    if (!filtered.length) return null
    return filtered.reduce(
      (acc, row) => ({
        owner: '__total__',
        ownerDisplay: 'Total',
        todayLeads: acc.todayLeads + (Number(row.todayLeads) || 0),
        targetAttempts: acc.targetAttempts + (Number(row.targetAttempts) || 0),
        achievedAttempts: acc.achievedAttempts + (Number(row.achievedAttempts) || 0),
        yesterdayLeads: acc.yesterdayLeads + (Number(row.yesterdayLeads) || 0),
        yesterdayAttempts: acc.yesterdayAttempts + (Number(row.yesterdayAttempts) || 0),
        dayBeforeYesterdayLeads: acc.dayBeforeYesterdayLeads + (Number(row.dayBeforeYesterdayLeads) || 0),
        dayBeforeYesterdayAttempts:
          acc.dayBeforeYesterdayAttempts + (Number(row.dayBeforeYesterdayAttempts) || 0),
        totalIe: acc.totalIe + (Number(row.totalIe) || 0),
        ieAttemptedToday: acc.ieAttemptedToday + (Number(row.ieAttemptedToday) || 0),
      }),
      {
        owner: '__total__',
        ownerDisplay: 'Total',
        todayLeads: 0,
        targetAttempts: 0,
        achievedAttempts: 0,
        yesterdayLeads: 0,
        yesterdayAttempts: 0,
        dayBeforeYesterdayLeads: 0,
        dayBeforeYesterdayAttempts: 0,
        totalIe: 0,
        ieAttemptedToday: 0,
      },
    )
  }, [filtered])

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        'bg-white dark:bg-slate-900/60',
        'border-slate-200/80 dark:border-slate-800',
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Owner activity
          </h3>
          {labels && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              IST calendar days · Today {labels.today} · Yesterday {labels.yesterday} · Day before {labels.dayBeforeYesterday}
            </p>
          )}
          {ownerActivity?.note && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-3xl leading-relaxed">
              {ownerActivity.note}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg border text-xs w-40 sm:w-48',
              'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
              'text-slate-700 dark:text-slate-300 placeholder:text-slate-400',
              'focus:outline-none focus:border-brand-400',
            )}
          />
          <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={hideAllZero}
              onChange={(e) => setHideAllZero(e.target.checked)}
              className="w-3 h-3 rounded border-slate-300 text-brand-600"
            />
            Hide all-zero
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[980px]">
          <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-[1]">
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-3 py-2.5 font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap',
                    c.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={COLS.length} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && !rows?.length && (
              <tr>
                <td colSpan={COLS.length} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">
                  No owner activity data. Recompute Source Stats after deploy, or check CallQ / callrecordings field mapping.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((row) => (
                <tr
                  key={row.owner}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2 text-slate-800 dark:text-slate-200',
                        c.align === 'right' ? 'text-right font-mono tabular-nums' : 'font-medium',
                      )}
                    >
                      {c.key === 'ownerDisplay' ? (
                        <span className="capitalize">{row.ownerDisplay || row.owner}</span>
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
                      'px-3 py-2.5 text-slate-900 dark:text-slate-100 font-semibold',
                      c.align === 'right' ? 'text-right font-mono tabular-nums' : 'text-left',
                    )}
                  >
                    {c.key === 'ownerDisplay' ? totalRow.ownerDisplay : fmt(totalRow[c.key])}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length === 0 && rows?.length > 0 && (
        <p className="text-center py-3 text-[10px] text-slate-400 dark:text-slate-500">
          No rows match filters.
        </p>
      )}
    </div>
  )
}
