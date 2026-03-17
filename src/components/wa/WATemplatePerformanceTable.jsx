'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

const COLUMNS = [
  { key: 'template_name', label: 'Template name',  sortable: true },
  { key: 'category',      label: 'Category',        sortable: true },
  { key: 'sent',          label: 'Sent',            sortable: true },
  { key: 'delivered',     label: 'Delivered',       sortable: true },
  { key: 'read',          label: 'Read',            sortable: true },
  { key: 'clicked',       label: 'Clicked',         sortable: true },
  { key: 'failed',        label: 'Failed',          sortable: true },
  { key: 'sdr',           label: 'STD %',           sortable: true, title: 'Sent → Delivered' },
  { key: 'str',           label: 'STR %',           sortable: true, title: 'Sent → Read' },
  { key: 'readRate',      label: 'DTR %',           sortable: true, title: 'Delivered → Read' },
  { key: 'ctr',           label: 'CTR %',           sortable: true, title: 'Clicked / Delivered' },
  { key: 'total_cost',    label: 'Cost',            sortable: true },
  { key: 'content',       label: 'Content',         sortable: false },
]

function SortIcon({ dir }) {
  if (!dir) return (
    <span className="inline-flex flex-col gap-[1px] ml-1 opacity-30">
      <svg className="w-2.5 h-2.5" viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L0 6h10z"/></svg>
      <svg className="w-2.5 h-2.5" viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0h10z"/></svg>
    </span>
  )
  if (dir === 'asc') return (
    <span className="inline-flex ml-1">
      <svg className="w-3 h-3" viewBox="0 0 10 6" fill="currentColor"><path d="M5 0L0 6h10z"/></svg>
    </span>
  )
  return (
    <span className="inline-flex ml-1">
      <svg className="w-3 h-3" viewBox="0 0 10 6" fill="currentColor"><path d="M5 6L0 0h10z"/></svg>
    </span>
  )
}

export default function WATemplatePerformanceTable({ rows, ctaRows = [], theme, dataMasked }) {
  const isDark = theme === 'dark'
  const [sortKey, setSortKey] = useState('ctr')
  const [sortDir, setSortDir] = useState('desc')
  const router = useRouter()

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? (typeof a[sortKey] === 'string' ? '' : -Infinity)
      const bv = b[sortKey] ?? (typeof b[sortKey] === 'string' ? '' : -Infinity)
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return sorted
  }, [rows, sortKey, sortDir])

  const thBase = `px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider select-none ${isDark ? 'text-slate-400 bg-slate-800' : 'text-slate-500 bg-slate-50'}`
  const thSortable = `cursor-pointer hover:${isDark ? 'text-slate-200' : 'text-slate-800'} transition-colors`
  const tdClass = `px-4 py-3 text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`
  const tableWrap = `rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`

  return (
      <div className={tableWrap}>
        <div className={`px-4 py-2.5 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Template Performance</h3>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Click any column header to sort · click <span className="font-medium">Preview</span> to see template content
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    title={col.title}
                    className={`${thBase} ${col.sortable ? thSortable : ''}`}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className="inline-flex items-center">
                      {col.label}
                      {col.sortable && (
                        <SortIcon dir={sortKey === col.key ? sortDir : null} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-200'}`}>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className={`${tdClass} py-8 text-center`}>No data</td>
                </tr>
              ) : (
                sortedRows.map((r) => (
                  <tr key={r.template_name} className={isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}>
                    <td className={tdClass}>
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-brand-300' : 'bg-brand-50 text-brand-700'}`}>
                        {r.template_name}
                      </span>
                    </td>
                    <td className={tdClass}>
                      {r.category && r.category !== '—' ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                          r.category === 'MARKETING'
                            ? isDark ? 'bg-amber-800/40 text-amber-300' : 'bg-amber-50 text-amber-700'
                            : r.category === 'UTILITY'
                              ? isDark ? 'bg-blue-800/40 text-blue-300' : 'bg-blue-50 text-blue-700'
                              : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                        }`}>{r.category}</span>
                      ) : <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>—</span>}
                    </td>
                    <td className={tdClass}>{r.sent}</td>
                    <td className={tdClass}>{r.delivered}</td>
                    <td className={tdClass}>{r.read}</td>
                    <td className={tdClass}>{r.clicked}</td>
                    <td className={tdClass}>
                      {r.failureReasons?.length > 0 ? (
                        <span
                          className="group relative cursor-help"
                          title={r.failureReasons.map((f) => `${f.reason} (${f.count}×)`).join('\n')}
                        >
                          <span className="text-rose-500 font-semibold underline decoration-dotted">
                            {r.failed}
                          </span>
                          {/* Hover tooltip */}
                          <span className={`pointer-events-none absolute left-0 top-full mt-1 z-20 hidden group-hover:flex flex-col gap-1.5 min-w-[260px] max-w-[380px] rounded-xl px-3 py-2.5 shadow-lg text-[11px] ${isDark ? 'bg-slate-700 border border-slate-600 text-slate-200' : 'bg-white border border-slate-200 text-slate-700'}`}>
                            <span className={`font-semibold mb-0.5 ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>Why failed</span>
                            {r.failureReasons.map((f) => (
                              <span key={f.reason} className="flex items-start justify-between gap-2">
                                <span className="whitespace-normal break-words leading-snug">{f.reason}</span>
                                <span className={`shrink-0 font-bold ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{f.count}×</span>
                              </span>
                            ))}
                          </span>
                        </span>
                      ) : (
                        r.failed
                      )}
                    </td>
                    <td className={tdClass}>
                      <span className={r.sdr >= 80 ? 'text-brand-600 dark:text-brand-400 font-semibold' : ''}>
                        {r.sdr != null ? `${r.sdr.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={r.str >= 50 ? 'text-brand-600 dark:text-brand-400 font-semibold' : ''}>
                        {r.str != null ? `${r.str.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={r.readRate >= 50 ? 'text-cyan-600 dark:text-cyan-400 font-semibold' : ''}>
                        {r.readRate != null ? `${r.readRate.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={r.ctr >= 5 ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : ''}>
                        {r.ctr != null ? `${r.ctr.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className={tdClass}>₹{(r.total_cost ?? 0).toFixed(2)}</td>
                    <td className={tdClass}>
                      <button
                        onClick={() => {
                          router.push(`/wa/templates/${encodeURIComponent(r.template_name)}`)
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                          isDark ? 'border-brand-600 bg-brand-700/30 text-brand-300 hover:bg-brand-700/60' : 'border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100'
                        }`}
                        title="View template breakdown"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Preview
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
  )
}
