'use client'

import { cn } from '../lib/utils'

export default function PaginationBar({
  page,
  setPage,
  totalPages,
  total,
  pageSize,
  className = '',
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const btn =
    'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
    'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 ' +
    'hover:bg-slate-100 dark:hover:bg-slate-800'

  if (total === 0) return null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[11px]',
        'border-t border-slate-200/80 dark:border-slate-700/80',
        'bg-slate-50/80 dark:bg-slate-900/40',
        className,
      )}
    >
      <span className="text-slate-500 dark:text-slate-400">
        Showing <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">{start}</span>
        –
        <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">{end}</span>
        {' '}of <span className="font-mono font-semibold tabular-nums">{total.toLocaleString('en-IN')}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Prev
        </button>
        <span className="tabular-nums px-1 text-slate-600 dark:text-slate-400 font-medium min-w-[4.5rem] text-center">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className={btn}
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  )
}
