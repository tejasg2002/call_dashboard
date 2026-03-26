'use client'

import { cn } from '../../lib/utils'

function stripEmail(name) {
  if (!name) return name
  return String(name).replace(/\s*\([^)]*@[^)]*\)/g, '').trim()
}

const COLS = [
  { key: 'ownerDisplay', label: 'Owner', align: 'left' },
  { key: 'todayLeads', label: 'Today Leads', align: 'right' },
  { key: 'targetAttempts', label: 'Target Attempts', align: 'right' },
  { key: 'achievedAttempts', label: 'Achieved Attempts', align: 'right' },
  { key: 'yesterdayLeads', label: 'Yesterday Leads', align: 'right' },
  { key: 'yesterdayTargetAttempts', label: 'Yest Target Attempts', align: 'right' },
  { key: 'yesterdayAttempts', label: 'Yesterday Attempts', align: 'right' },
  { key: 'dayBeforeYesterdayLeads', label: 'Day B4 Yest Leads', align: 'right' },
  { key: 'dayBeforeYesterdayTargetAttempts', label: 'Day B4 Yest Target', align: 'right' },
  { key: 'dayBeforeYesterdayAttempts', label: 'Day B4 Yest Attempts', align: 'right' },
  { key: 'totalIe', label: 'Total I&E', align: 'right' },
  { key: 'ieAttempted', label: 'I&E Attempted', align: 'right' },
]

function fmt(n) {
  if (n == null || n === '') return '—'
  return typeof n === 'number' ? n.toLocaleString('en-IN') : String(n)
}

export default function SourceOwnerAttemptTable({
  rows,
  theme,
  dateNote,
  loading,
}) {
  const list = Array.isArray(rows) ? rows : []
  const hasRows = list.length > 0
  const totalRow = hasRows
    ? list.reduce(
      (acc, row) =>       ({
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
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Owner attempts (CRM pool)
          </h3>
          {dateNote && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
              {dateNote}
            </p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1040px]">
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
              list.map((row) => (
                <tr
                  key={row.owner}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2 text-slate-800 dark:text-slate-200',
                        c.align === 'right'
                          ? 'text-right font-mono tabular-nums'
                          : 'font-medium',
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
    </div>
  )
}
