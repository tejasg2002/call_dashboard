import { useState, useMemo, useEffect } from 'react'
import { maskPhone } from '../../lib/userManagement'
import { fetchLeadByMobile } from '../../lib/firebase'

const TIERS = ['Clicked', 'Read', 'Delivered', 'Sent only']

const TIER_META = {
  'Clicked': {
    icon: '🖱️',
    label: 'Clicked',
    desc: 'Received, read & clicked a button',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
    bar: 'bg-amber-400',
  },
  'Read': {
    icon: '👁️',
    label: 'Read',
    desc: 'Received & opened the message',
    dot: 'bg-violet-500',
    badge: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700',
    bar: 'bg-violet-400',
  },
  'Delivered': {
    icon: '✅',
    label: 'Delivered',
    desc: 'Delivered but not yet read',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
    bar: 'bg-emerald-400',
  },
  'Sent only': {
    icon: '📤',
    label: 'Sent only',
    desc: 'Sent but not yet delivered',
    dot: 'bg-blue-400',
    badge: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
    bar: 'bg-blue-400',
  },
}

function formatRelTime(ts) {
  if (!ts) return null
  const d = new Date(ts)
  if (isNaN(d)) return null
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function StageDots({ stages, isDark }) {
  const order = ['sent', 'delivered', 'read', 'clicked']
  const colors = {
    sent: 'bg-blue-400',
    delivered: 'bg-emerald-500',
    read: 'bg-violet-500',
    clicked: 'bg-amber-500',
  }
  return (
    <div className="flex items-center gap-1">
      {order.map((s) => (
        <span
          key={s}
          title={s}
          className={`w-2 h-2 rounded-full ${stages.has(s) ? colors[s] : isDark ? 'bg-slate-700' : 'bg-slate-200'}`}
        />
      ))}
    </div>
  )
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export default function WAEngagementSection({ engagementRows = [], theme, dataMasked }) {
  const isDark = theme === 'dark'
  const [activeTier, setActiveTier] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const tierCounts = useMemo(() =>
    TIERS.reduce((acc, t) => {
      acc[t] = engagementRows.filter((r) => r.tier === t).length
      return acc
    }, {}),
  [engagementRows])

  const filtered = useMemo(() => {
    let rows = engagementRows
    if (activeTier !== 'all') rows = rows.filter((r) => r.tier === activeTier)
    if (search.trim()) rows = rows.filter((r) => r.phone_number.includes(search.trim()))
    return rows
  }, [engagementRows, activeTier, search])

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(filtered.length / pageSize)

  // Fetch lead IDs fresh for every page — no cross-page caching
  const [leadMap, setLeadMap] = useState({})   // phone → lead_id | null | 'loading'

  useEffect(() => {
    if (paginated.length === 0) { setLeadMap({}); return }

    // Reset map to 'loading' for all phones on this page
    const phones = paginated.map((r) => r.phone_number)
    setLeadMap(Object.fromEntries(phones.map((p) => [p, 'loading'])))

    let cancelled = false
    phones.forEach((phone) => {
      fetchLeadByMobile(phone).then((result) => {
        if (cancelled) return
        setLeadMap((m) => ({ ...m, [phone]: result?.lead_id || null }))
      })
    })
    return () => { cancelled = true }
  }, [page, pageSize, activeTier, search])

  const totalUsers = engagementRows.length
  const clickedUsers = tierCounts['Clicked'] || 0
  const readUsers    = (tierCounts['Read'] || 0) + clickedUsers
  const deliveredUsers = (tierCounts['Delivered'] || 0) + readUsers

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`}>
      {/* Header */}
      <div className={`px-5 py-4 border-b ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-100 bg-slate-50'}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>User Engagement</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {totalUsers} unique users · ranked by engagement depth
            </p>
          </div>
          {/* Search */}
          <div className="relative">
            <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder="Search phone"
              className={`pl-8 pr-3 py-1.5 rounded-lg border text-xs w-44 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900'}`}
            />
          </div>
        </div>

        {/* Engagement funnel bars */}
        {totalUsers > 0 && (
          <div className="mt-4 space-y-2">
            {[
              { label: 'Delivered', count: deliveredUsers, color: 'bg-emerald-500' },
              { label: 'Read',      count: readUsers,      color: 'bg-violet-500' },
              { label: 'Clicked',   count: clickedUsers,   color: 'bg-amber-500' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`text-[11px] w-16 text-right ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
                <div className={`flex-1 h-2 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  <div
                    className={`h-2 rounded-full ${color} transition-all`}
                    style={{ width: `${totalUsers > 0 ? (count / totalUsers) * 100 : 0}%` }}
                  />
                </div>
                <span className={`text-[11px] w-20 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {count} <span className="opacity-60">({totalUsers > 0 ? ((count / totalUsers) * 100).toFixed(0) : 0}%)</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tier filter pills */}
      <div className={`px-5 py-3 flex flex-wrap gap-2 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <button
          onClick={() => { setActiveTier('all'); setPage(0) }}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${activeTier === 'all'
            ? 'bg-slate-700 text-white border-slate-700 dark:bg-slate-500'
            : isDark ? 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
        >
          All <span className="opacity-70 ml-1">{totalUsers}</span>
        </button>
        {TIERS.map((tier) => {
          const meta = TIER_META[tier]
          const isActive = activeTier === tier
          return (
            <button
              key={tier}
              onClick={() => { setActiveTier(tier); setPage(0) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${isActive
                ? meta.badge
                : isDark ? 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.icon} {meta.label}
              <span className="opacity-70">{tierCounts[tier] || 0}</span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {paginated.length === 0 ? (
          <div className={`py-12 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm">No users match the current filter.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={`text-[11px] uppercase tracking-wide ${isDark ? 'bg-slate-800 text-slate-500 border-b border-slate-700' : 'bg-slate-50 text-slate-400 border-b border-slate-100'}`}>
                <th className="text-left px-5 py-2.5 font-medium">Phone</th>
                <th className="text-left px-4 py-2.5 font-medium">CRM Lead ID</th>
                <th className="text-left px-4 py-2.5 font-medium">Engagement</th>
                <th className="text-left px-4 py-2.5 font-medium">Stages</th>
                <th className="text-left px-4 py-2.5 font-medium">Templates</th>
                <th className="text-left px-4 py-2.5 font-medium">Button clicked</th>
                <th className="text-right px-5 py-2.5 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-100'}`}>
              {paginated.map((row) => {
                const meta = TIER_META[row.tier]
                const displayPhone = dataMasked ? maskPhone(row.phone_number) : row.phone_number
                const relTime = formatRelTime(row.lastActivity)
                return (
                  <tr key={row.phone_number} className={`${isDark ? 'hover:bg-slate-700/40' : 'hover:bg-slate-50'} transition-colors`}>
                    {/* Phone */}
                    <td className="px-5 py-3">
                      <span className={`font-mono text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{displayPhone}</span>
                    </td>
                    {/* CRM Lead ID */}
                    <td className="px-4 py-3">
                      {leadMap[row.phone_number] === 'loading' ? (
                        <span className={`inline-flex items-center gap-1 text-xs ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
                          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        </span>
                      ) : leadMap[row.phone_number] ? (
                        <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] px-2 py-0.5 rounded-lg border ${isDark ? 'bg-indigo-900/20 border-indigo-700/40 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          {leadMap[row.phone_number]}
                        </span>
                      ) : (
                        <span className={`text-xs ${isDark ? 'text-slate-700' : 'text-slate-300'}`}>—</span>
                      )}
                    </td>
                    {/* Tier badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${meta.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                    {/* Stage dots */}
                    <td className="px-4 py-3">
                      <StageDots stages={row.stages} isDark={isDark} />
                    </td>
                    {/* Templates */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="flex flex-wrap gap-1">
                        {row.templates.slice(0, 2).map((t) => (
                          <span key={t} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-violet-300' : 'bg-violet-50 text-violet-700'}`}>
                            {t}
                          </span>
                        ))}
                        {row.templates.length > 2 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                            +{row.templates.length - 2}
                          </span>
                        )}
                        {row.templates.length === 0 && <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>—</span>}
                      </div>
                    </td>
                    {/* Buttons clicked */}
                    <td className="px-4 py-3 max-w-[160px]">
                      <div className="flex flex-wrap gap-1">
                        {row.buttons.slice(0, 2).map((b) => (
                          <span key={b} className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                            {b}
                          </span>
                        ))}
                        {row.buttons.length > 2 && (
                          <span className={`text-[10px] px-1 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                            +{row.buttons.length - 2}
                          </span>
                        )}
                        {row.buttons.length === 0 && <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>—</span>}
                      </div>
                    </td>
                    {/* Last activity */}
                    <td className="px-5 py-3 text-right">
                      <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{relTime || '—'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination footer — always visible */}
      <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50'}`}>
        {/* Left: count + rows-per-page */}
        <div className="flex items-center gap-3">
          <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {filtered.length === 0
              ? 'No users'
              : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length} users`}
          </span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}
            className={`text-xs rounded-lg border px-2 py-1 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>Show {n}</option>
            ))}
          </select>
        </div>

        {/* Right: page buttons */}
        <div className="flex items-center gap-1">
          <button
            disabled={page === 0}
            onClick={() => setPage(0)}
            className={`px-2 py-1 rounded-lg border text-xs disabled:opacity-30 transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
          >«</button>
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className={`px-2.5 py-1 rounded-lg border text-xs disabled:opacity-30 transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
          >‹ Prev</button>

          {/* Page number pills */}
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum
            if (totalPages <= 7) {
              pageNum = i
            } else if (page < 4) {
              pageNum = i
            } else if (page > totalPages - 5) {
              pageNum = totalPages - 7 + i
            } else {
              pageNum = page - 3 + i
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-7 h-7 rounded-lg text-xs font-medium border transition-colors ${
                  pageNum === page
                    ? 'bg-violet-600 text-white border-violet-600'
                    : isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {pageNum + 1}
              </button>
            )
          })}

          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className={`px-2.5 py-1 rounded-lg border text-xs disabled:opacity-30 transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
          >Next ›</button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(totalPages - 1)}
            className={`px-2 py-1 rounded-lg border text-xs disabled:opacity-30 transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
          >»</button>
        </div>
      </div>
    </div>
  )
}
