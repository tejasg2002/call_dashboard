'use client'

import { useState } from 'react'
import { useClientPagination } from '../../hooks/useClientPagination'
import PaginationBar from '../PaginationBar'

function LinkBadge({ url, count, isDark }) {
  const short = url.length > 45 ? url.slice(0, 45) + '…' : url
  return (
    <div className={`flex items-center justify-between gap-2 py-1 px-2 rounded text-xs ${isDark ? 'bg-slate-700/60' : 'bg-slate-100'}`}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate" title={url}>{short}</a>
      <span className={`shrink-0 font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{count}×</span>
    </div>
  )
}

function CTARow({ r, isDark, thClass, tdClass }) {
  const [expanded, setExpanded] = useState(false)
  const hasLinks = r.links && r.links.length > 0

  const templates = r.template_used
    ? r.template_used.split(', ').filter(Boolean)
    : []

  return (
    <>
      <tr
        className={`cursor-pointer ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}
        onClick={() => hasLinks && setExpanded((v) => !v)}
      >
        <td className={tdClass}>
          <div className="flex items-center gap-2">
            {hasLinks && (
              <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {expanded ? '▾' : '▸'}
              </span>
            )}
            <span className="font-medium">{r.button_text}</span>
          </div>
        </td>
        <td className={tdClass}>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>
            {r.total_clicks}
          </span>
        </td>
        <td className={tdClass}>{r.unique_users}</td>
        <td className={tdClass}>
          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.click_types}</span>
        </td>
        <td className={tdClass}>
          {templates.length > 0 ? (
            <span className="group relative inline-block cursor-default">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                isDark ? 'bg-slate-700/60 border-slate-600 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                {templates.length} template{templates.length > 1 ? 's' : ''}
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              {/* Hover tooltip listing template names */}
              <span className={`pointer-events-none absolute left-0 top-full mt-1 z-30 hidden group-hover:flex flex-col gap-1 min-w-[200px] max-w-[340px] rounded-xl px-3 py-2.5 shadow-lg text-[11px] ${
                isDark ? 'bg-slate-700 border border-slate-600 text-slate-200' : 'bg-white border border-slate-200 text-slate-700 shadow-md'
              }`}>
                <span className={`font-semibold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>Templates used</span>
                {templates.map((t) => (
                  <span key={t} className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-800 text-brand-300' : 'bg-brand-50 text-brand-700'}`}>{t}</span>
                ))}
              </span>
            </span>
          ) : (
            <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>—</span>
          )}
        </td>
      </tr>
      {expanded && hasLinks && (
        <tr className={isDark ? 'bg-slate-800/60' : 'bg-slate-50/80'}>
          <td colSpan={5} className="px-8 py-3">
            <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Button links clicked</p>
            <div className="space-y-1">
              {r.links.map((l) => (
                <LinkBadge key={l.url} url={l.url} count={l.count} isDark={isDark} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function WACTAPerformanceTable({ rows, theme }) {
  const isDark = theme === 'dark'
  const { page, setPage, totalPages, total, pageSize, paginated } = useClientPagination(rows, 10)
  const thClass = `px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400 bg-slate-800' : 'text-slate-500 bg-slate-50'}`
  const tdClass = `px-4 py-3 text-sm ${isDark ? 'text-slate-200' : 'text-slate-700'}`
  const tableWrap = `rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`

  return (
    <div className={tableWrap}>
      <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Button / CTA performance</h3>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Click a row to expand button links · hover the template badge to see template names</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead>
            <tr>
              <th className={thClass}>Button text</th>
              <th className={thClass}>Total clicks</th>
              <th className={thClass}>Unique users</th>
              <th className={thClass}>Click type</th>
              <th className={thClass}>Templates</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-200'}`}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={`${tdClass} py-8 text-center`}>No CTA clicks yet</td>
              </tr>
            ) : (
              paginated.map((r) => (
                <CTARow key={`${r.source || 'api'}-${r.button_text}`} r={r} isDark={isDark} thClass={thClass} tdClass={tdClass} />
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <PaginationBar
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          className={isDark ? 'border-slate-700' : ''}
        />
      )}
    </div>
  )
}
