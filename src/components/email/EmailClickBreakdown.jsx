'use client'

import { useState, useMemo } from 'react'
import { maskEmail } from '../../lib/userManagement'
import { cn } from '../../lib/utils'

export default function EmailClickBreakdown({ data, theme, dataMasked }) {
  const isDark = theme === 'dark'
  const [search, setSearch] = useState('')
  const [expandedEmail, setExpandedEmail] = useState(null)
  const [filterTemplate, setFilterTemplate] = useState('')
  const [filterButton, setFilterButton] = useState('')

  const me = (email) => (dataMasked ? maskEmail(email) : email)

  const ml = (leadId) => {
    if (leadId == null || leadId === '') return '—'
    const s = String(leadId)
    if (!dataMasked) return s
    if (s.length <= 3) return '***'
    return '*'.repeat(s.length - 3) + s.slice(-3)
  }

  const allTemplates = useMemo(() => {
    if (!data) return []
    const set = new Set()
    for (const u of data) {
      for (const c of u.clicks) {
        if (c.template) set.add(c.template)
      }
    }
    return [...set].sort()
  }, [data])

  const allButtons = useMemo(() => {
    if (!data) return []
    const set = new Set()
    for (const u of data) {
      for (const c of u.clicks) {
        if (c.button) set.add(c.button)
      }
    }
    return [...set].sort()
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    let result = data
    if (search) {
      const q = search.toLowerCase().trim()
      result = result.filter(
        (u) =>
          u.email?.toLowerCase().includes(q)
          || String(u.leadId ?? '').toLowerCase().includes(q),
      )
    }
    if (filterTemplate || filterButton) {
      result = result
        .map((u) => {
          const matchedClicks = u.clicks.filter((c) => {
            if (filterTemplate && c.template !== filterTemplate) return false
            if (filterButton && c.button !== filterButton) return false
            return true
          })
          if (matchedClicks.length === 0) return null
          return { ...u, clicks: matchedClicks, totalClicks: matchedClicks.length }
        })
        .filter(Boolean)
    }
    return result
  }, [data, search, filterTemplate, filterButton])

  if (!data || data.length === 0) return null

  return (
    <div className={cn(
      'min-w-0 rounded-2xl border overflow-hidden',
      isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-white border-slate-200',
    )}
    >
      <div className="px-5 pt-5 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className={cn('text-sm font-semibold', isDark ? 'text-white' : 'text-slate-900')}>
              Click Breakdown
            </h3>
            <p className={cn('text-[11px] mt-0.5', isDark ? 'text-slate-500' : 'text-slate-400')}>
              {filtered.length} users · {filtered.reduce((s, u) => s + u.totalClicks, 0)} clicks
              <span className={cn('block mt-1 opacity-90', isDark ? 'text-slate-600' : 'text-slate-500')}>
                Same-minute times are often mailbox scanners (e.g. Microsoft Safe Links) hitting every URL when the email opens—not three human taps at once.
              </span>
            </p>
          </div>
          <input
            type="text"
            placeholder="Search email or lead ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg border text-xs w-48',
              isDark ? 'bg-slate-800 border-slate-700 text-slate-300 placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-700 placeholder:text-slate-400',
              'focus:outline-none focus:border-brand-400',
            )}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterTemplate}
            onChange={(e) => setFilterTemplate(e.target.value)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg border text-[11px] font-medium',
              isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700',
              'focus:outline-none focus:border-brand-400',
            )}
          >
            <option value="">All subjects</option>
            {allTemplates.map((t) => <option key={t} value={t}>{t.length > 80 ? `${t.slice(0, 80)}…` : t}</option>)}
          </select>
          <select
            value={filterButton}
            onChange={(e) => setFilterButton(e.target.value)}
            className={cn(
              'px-2.5 py-1.5 rounded-lg border text-[11px] font-medium',
              isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700',
              'focus:outline-none focus:border-brand-400',
            )}
          >
            <option value="">All link labels</option>
            {allButtons.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {(filterTemplate || filterButton) && (
            <button
              type="button"
              onClick={() => { setFilterTemplate(''); setFilterButton('') }}
              className="text-[10px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto overflow-y-auto max-h-[520px]">
        <table className="w-full min-w-[720px] table-fixed text-[11px]">
          <thead className={cn('sticky top-0 z-10', isDark ? 'bg-slate-800' : 'bg-slate-50')}>
            <tr>
              <th className={cn('w-[200px] px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[10px]', isDark ? 'text-slate-400' : 'text-slate-500')}>Email</th>
              <th className={cn('w-[132px] px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[10px]', isDark ? 'text-slate-400' : 'text-slate-500')}>Lead ID</th>
              <th className={cn('w-14 px-4 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px]', isDark ? 'text-slate-400' : 'text-slate-500')}>Clicks</th>
              <th className={cn('px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[10px]', isDark ? 'text-slate-400' : 'text-slate-500')}>Subject</th>
              <th className={cn('px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[10px]', isDark ? 'text-slate-400' : 'text-slate-500')}>Link label</th>
              <th className={cn('w-8 px-2 py-2.5 text-center font-semibold uppercase tracking-wider text-[10px]', isDark ? 'text-slate-400' : 'text-slate-500')}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 100).map((u) => {
              const isExpanded = expandedEmail === u.email
              const templates = [...new Set(u.clicks.map((c) => c.template).filter(Boolean))]
              const buttons = [...new Set(u.clicks.map((c) => c.button).filter(Boolean))]

              return (
                <tr key={u.email} className="group">
                  <td colSpan={6} className="p-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedEmail(isExpanded ? null : u.email)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpandedEmail(isExpanded ? null : u.email)
                        }
                      }}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-1 cursor-pointer transition-colors px-4 py-2.5',
                        isExpanded
                          ? isDark ? 'bg-slate-800/60' : 'bg-slate-50'
                          : isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50/80',
                        'border-b',
                        isDark ? 'border-slate-800/50' : 'border-slate-100',
                      )}
                    >
                      <div className="w-[200px] shrink-0 min-w-0 overflow-hidden pr-1">
                        <span className={cn('block font-mono font-medium text-[10px] truncate', isDark ? 'text-slate-200' : 'text-slate-800')} title={me(u.email)}>{me(u.email)}</span>
                      </div>
                      <div className="w-[132px] shrink-0 min-w-0 overflow-hidden pr-1">
                        <span
                          className={cn('block w-full font-mono text-[10px] truncate', isDark ? 'text-slate-300' : 'text-slate-700')}
                          title={u.leadId ? String(u.leadId) : undefined}
                        >
                          {ml(u.leadId)}
                        </span>
                      </div>
                      <div className="w-14 shrink-0 text-center">
                        <span className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold',
                          u.totalClicks >= 3
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                            : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600',
                        )}
                        >
                          {u.totalClicks}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 px-2">
                        <div className="flex flex-wrap gap-1">
                          {templates.slice(0, 2).map((t) => (
                            <span key={t} className={cn(
                              'px-1.5 py-0.5 rounded text-[9px] font-medium truncate max-w-[200px]',
                              isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-700',
                            )} title={t}>{t}</span>
                          ))}
                          {templates.length > 2 && (
                            <span className={cn('text-[9px]', isDark ? 'text-slate-500' : 'text-slate-400')}>+{templates.length - 2}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 px-2">
                        <div className="flex flex-wrap gap-1">
                          {buttons.slice(0, 3).map((b) => (
                            <span key={b} className={cn(
                              'px-1.5 py-0.5 rounded text-[9px] font-medium truncate max-w-[120px]',
                              isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-700',
                            )} title={b}>{b}</span>
                          ))}
                          {buttons.length > 3 && (
                            <span className={cn('text-[9px]', isDark ? 'text-slate-500' : 'text-slate-400')}>+{buttons.length - 3}</span>
                          )}
                        </div>
                      </div>
                      <div className="w-8 shrink-0 text-center">
                        <svg className={cn('w-3.5 h-3.5 transition-transform', isExpanded && 'rotate-90', isDark ? 'text-slate-500' : 'text-slate-400')} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={cn('min-w-0 overflow-x-auto px-4 pb-3 pt-1', isDark ? 'bg-slate-800/40' : 'bg-slate-50/80')}>
                        <table className="w-full min-w-[520px] table-fixed text-[10px]">
                          <thead>
                            <tr>
                              <th className={cn('w-7 py-1.5 pr-2 text-left font-medium', isDark ? 'text-slate-500' : 'text-slate-400')}>#</th>
                              <th className={cn('w-[26%] py-1.5 pr-2 text-left font-medium', isDark ? 'text-slate-500' : 'text-slate-400')}>Subject</th>
                              <th className={cn('w-[14%] py-1.5 pr-2 text-left font-medium', isDark ? 'text-slate-500' : 'text-slate-400')}>Link label</th>
                              <th className={cn('w-[40%] min-w-0 py-1.5 pr-2 text-left font-medium', isDark ? 'text-slate-500' : 'text-slate-400')}>URL</th>
                              <th className={cn('w-[22%] py-1.5 pl-2 text-left font-medium whitespace-nowrap', isDark ? 'text-slate-500' : 'text-slate-400')}>Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {u.clicks.map((c, i) => (
                              <tr key={i} className={cn('border-t', isDark ? 'border-slate-700/50' : 'border-slate-200/50')}>
                                <td className={cn('py-1.5 pr-2 align-top', isDark ? 'text-slate-500' : 'text-slate-400')}>{i + 1}</td>
                                <td className={cn('min-w-0 py-1.5 pr-2 align-top font-medium', isDark ? 'text-slate-200' : 'text-slate-700')}>
                                  <span className="line-clamp-2 break-words" title={c.template || ''}>{c.template || '—'}</span>
                                  {c.templateId ? (
                                    <span className={cn('block text-[9px] mt-0.5 truncate', isDark ? 'text-slate-500' : 'text-slate-400')} title={c.templateId}>ID: {c.templateId}</span>
                                  ) : null}
                                </td>
                                <td className="min-w-0 py-1.5 pr-2 align-top">
                                  <span className={cn(
                                    'inline-block max-w-full truncate px-1.5 py-0.5 rounded text-[9px] font-medium align-top',
                                    isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-700',
                                  )} title={c.button || ''}>{c.button || '—'}</span>
                                </td>
                                <td className="w-[40%] min-w-0 py-1.5 pr-2 align-top">
                                  {c.link ? (
                                    <a
                                      href={c.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block min-w-0 truncate text-brand-500 hover:underline"
                                      title={c.link}
                                    >
                                      {c.link.replace(/^https?:\/\//, '')}
                                    </a>
                                  ) : (
                                    <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>—</span>
                                  )}
                                </td>
                                <td className={cn('py-1.5 pl-2 align-top text-[9px] whitespace-nowrap', isDark ? 'text-slate-400' : 'text-slate-500')}>
                                  {c.time
                                    ? new Date(c.time).toLocaleString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length > 100 && (
          <p className={cn('text-center py-3 text-[10px]', isDark ? 'text-slate-500' : 'text-slate-400')}>
            Showing 100 of {filtered.length} users
          </p>
        )}
      </div>
    </div>
  )
}
