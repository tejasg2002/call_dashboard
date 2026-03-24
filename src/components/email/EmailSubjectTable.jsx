'use client'

import { useState, useMemo, useEffect } from 'react'
import { fetchLeadByEmail } from '../../lib/firebase'
import { maskEmail, maskLeadId } from '../../lib/userManagement'

// ── Generate a stable, human-readable template ID from a subject line ─────────
function generateTemplateId(subject) {
  const words = subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
  // Simple deterministic numeric suffix from the full subject string
  let hash = 0
  for (let i = 0; i < subject.length; i++) {
    hash = ((hash << 5) - hash + subject.charCodeAt(i)) | 0
  }
  const num = String(Math.abs(hash) % 1000).padStart(3, '0')
  return words.join('_') + '_' + num
}

// ── Stage meta ───────────────────────────────────────────────────────────────
const STAGE_META = {
  sent:      { title: 'Sent to',       color: 'text-blue-500',    activeCls: (d) => d ? 'bg-blue-900/30 border-blue-600'    : 'bg-blue-50 border-blue-400' },
  delivered: { title: 'Delivered to',  color: 'text-brand-500', activeCls: (d) => d ? 'bg-brand-900/30 border-brand-600' : 'bg-brand-50 border-brand-400' },
  opened:    { title: 'Opened by',     color: 'text-brand-500',  activeCls: (d) => d ? 'bg-brand-900/30 border-brand-600'  : 'bg-brand-50 border-brand-400' },
  clicked:   { title: 'Clicked by',    color: 'text-amber-500',   activeCls: (d) => d ? 'bg-amber-900/30 border-amber-600'   : 'bg-amber-50 border-amber-400' },
  bounced:   { title: 'Bounced for',   color: 'text-rose-500',    activeCls: (d) => d ? 'bg-rose-900/30 border-rose-600'     : 'bg-rose-50 border-rose-400' },
}

const PAGE_SIZE = 10

// ── User list panel (per stage) ───────────────────────────────────────────────
function UserListPanel({ stage, users, isDark, dataMasked }) {
  const [leadMap, setLeadMap]   = useState({})
  const [copiedId, setCopiedId] = useState(null)
  const [page, setPage]         = useState(0)

  const totalPages = Math.ceil(users.length / PAGE_SIZE)
  const shown      = users.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const meta       = STAGE_META[stage]

  useEffect(() => { setPage(0); setLeadMap({}) }, [stage])

  useEffect(() => {
    if (!shown.length) return
    const toFetch = shown.map((u) => u.email).filter((e) => !(e in leadMap))
    if (!toFetch.length) return
    setLeadMap((prev) => {
      const next = { ...prev }
      toFetch.forEach((e) => { next[e] = 'loading' })
      return next
    })
    toFetch.forEach((email) => {
      fetchLeadByEmail(email).then((result) => {
        setLeadMap((prev) => ({ ...prev, [email]: result?.lead_id || null }))
      })
    })
  }, [page, stage])

  const copyText = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedId(text)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!users.length) {
    return (
      <div className={`rounded-xl p-4 text-center text-xs border ${isDark ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
        No users recorded for this stage yet.
      </div>
    )
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
      {/* Header */}
      <div className={`px-3 py-2 flex items-center justify-between ${isDark ? 'bg-slate-800 border-b border-slate-700' : 'bg-slate-50 border-b border-slate-100'}`}>
        <p className={`text-xs font-semibold ${meta.color}`}>
          {meta.title} {users.length} user{users.length !== 1 ? 's' : ''}
        </p>
        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, users.length)} of {users.length}
        </span>
      </div>

      {/* Rows */}
      <div className={`divide-y ${isDark ? 'divide-slate-700/60' : 'divide-slate-100'}`}>
        {shown.map((u, idx) => {
          const leadId      = leadMap[u.email]
          const displayEmail = dataMasked ? maskEmail(u.email) : u.email
          const ts = u.timestamp
            ? new Date(u.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
            : null

          return (
            <div key={`${u.email}-${idx}`} className={`px-3 py-2.5 ${isDark ? 'bg-slate-800/50 hover:bg-slate-700/40' : 'bg-white hover:bg-slate-50'} transition-colors`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Email */}
                <span className={`text-[11px] font-mono ${isDark ? 'text-slate-200' : 'text-slate-800'} truncate max-w-[180px]`} title={displayEmail}>
                  {displayEmail}
                </span>
                {/* Lead ID */}
                {leadId === 'loading' ? (
                  <span className="inline-block w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                ) : leadId ? (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-lg border max-w-[200px] ${isDark ? 'bg-indigo-900/20 border-indigo-700/40 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}
                    title={!dataMasked ? String(leadId) : undefined}
                  >
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="truncate">{maskLeadId(leadId, dataMasked)}</span>
                    {!dataMasked && (
                      <button type="button" onClick={() => copyText(leadId)} title="Copy lead ID"
                        className={`ml-0.5 p-0.5 rounded transition-colors flex-shrink-0 ${isDark ? 'hover:bg-indigo-700/50' : 'hover:bg-indigo-100'}`}
                      >
                        {copiedId === leadId
                          ? <svg className="w-2.5 h-2.5 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          : <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        }
                      </button>
                    )}
                  </span>
                ) : (
                  <span className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>No lead</span>
                )}
              </div>
              {ts && (
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{ts}</p>
              )}
              {u.link && (
                <a
                  href={u.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-flex items-center gap-1 text-[10px] font-mono mt-0.5 truncate max-w-[240px] hover:underline
                    ${isDark ? 'text-sky-400 hover:text-sky-300' : 'text-sky-600 hover:text-sky-700'}`}
                  title={u.link}
                >
                  <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {u.link.length > 50 ? u.link.slice(0, 50) + '…' : u.link}
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={`flex items-center justify-between px-3 py-2 border-t ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50'}`}>
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium disabled:opacity-30 transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
          >‹ Prev</button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let p
              if (totalPages <= 5)     p = i
              else if (page < 3)       p = i
              else if (page > totalPages - 3) p = totalPages - 5 + i
              else p = page - 2 + i
              return (
                <button key={p} type="button" onClick={() => setPage(p)}
                  className={`w-6 h-6 rounded-lg text-[11px] font-medium border transition-colors ${p === page ? 'bg-brand-600 text-white border-brand-600' : isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                >{p + 1}</button>
              )
            })}
          </div>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium disabled:opacity-30 transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
          >Next ›</button>
        </div>
      )}
    </div>
  )
}

// ── Email envelope preview card ───────────────────────────────────────────────
function EmailEnvelopeCard({ mail, subject, isDark }) {
  if (!mail) return null
  const m = mail

  // Parse List-ID: "Default - Email <uuid.domain>" → "Default - Email"
  const listName = m.listId ? m.listId.replace(/<[^>]+>/, '').trim() : ''

  // Format the date nicely
  let sentDate = ''
  try {
    if (m.date) sentDate = new Date(m.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {}

  const fields = [
    { label: 'From',      value: m.from,        mono: true  },
    { label: 'Subject',   value: subject,       mono: false },
    { label: 'Date',      value: sentDate || m.date, mono: false },
    { label: 'List',      value: listName,      mono: false },
    { label: 'Template',  value: m.templateId,  mono: true  },
    { label: 'Journey',   value: m.journeyId !== 'sample-journey-id'  ? m.journeyId  : null, mono: true },
    { label: 'Run',       value: m.runId       !== 'sample-run-id'    ? m.runId      : null, mono: true },
    { label: 'Sender',    value: m.campaign,    mono: false },
    { label: 'Domain',    value: m.fromDomain,  mono: true  },
  ].filter((f) => f.value)

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-md"
      style={{ background: isDark ? '#1a2332' : '#f8f9fa' }}
    >
      {/* Email client top bar */}
      <div
        className="px-4 pt-4 pb-3 flex items-start gap-3"
        style={{ background: isDark ? '#1e2d3d' : '#ffffff', borderBottom: isDark ? '1px solid #2d3d50' : '1px solid #e2e8f0' }}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          {(m.from[0] || 'M').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {m.from || 'Unknown Sender'}
            </span>
            {sentDate && (
              <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sentDate}</span>
            )}
          </div>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            To: campaign recipients
          </p>
        </div>
      </div>

      {/* Subject banner */}
      <div
        className="px-4 py-3"
        style={{ background: isDark ? '#1a2332' : '#f0f4f8' }}
      >
        <p className={`text-sm font-bold leading-snug break-words whitespace-normal w-full ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
          {subject}
        </p>
      </div>

      {/* Metadata rows */}
      <div className="px-4 pb-4 pt-3 space-y-1.5" style={{ background: isDark ? '#1a2332' : '#f8f9fa' }}>
        {fields.map((f) => (
          <div key={f.label} className="flex items-start gap-2">
            <span className={`text-[10px] uppercase tracking-wide font-semibold w-16 flex-shrink-0 pt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {f.label}
            </span>
            <span className={`min-w-0 flex-1 text-[11px] break-words leading-relaxed ${f.mono ? 'font-mono break-all' : ''} ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {f.value}
            </span>
          </div>
        ))}
      </div>

      {/* AWS SES badge */}
      <div className="px-4 pb-3 flex items-center gap-2"
        style={{ background: isDark ? '#1a2332' : '#f8f9fa' }}
      >
        <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium ${isDark ? 'bg-orange-900/30 border-orange-700/40 text-orange-300' : 'bg-orange-50 border-orange-200 text-orange-700'}`}>
          <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.75 0h-13.5C2.37 0 0 2.37 0 5.25v13.5C0 21.63 2.37 24 5.25 24h13.5C21.63 24 24 21.63 24 18.75V5.25C24 2.37 21.63 0 18.75 0z"/></svg>
          AWS SES
        </span>
        {m.fromDomain && (
          <span className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{m.fromDomain}</span>
        )}
      </div>
    </div>
  )
}

// ── Preview modal ─────────────────────────────────────────────────────────────
function EmailPreviewModal({ row, isDark, onClose, dataMasked }) {
  const [activeStage, setActiveStage] = useState(null)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => { setActiveStage(null) }, [row?.subject])

  const TILES = [
    { stage: 'sent',      value: row.sent,      label: 'Sent',      color: 'text-blue-500'    },
    { stage: 'delivered', value: row.delivered, label: 'Delivered', color: 'text-brand-500' },
    { stage: 'opened',    value: row.opened,    label: 'Opened',    color: 'text-brand-500'  },
    { stage: 'clicked',   value: row.clicked,   label: 'Clicked',   color: 'text-amber-500'   },
    { stage: 'bounced',   value: row.bounced,   label: 'Bounced',   color: 'text-rose-500'    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col ${isDark ? 'bg-slate-900' : 'bg-[#f0f2f5]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className={`sticky top-0 z-10 px-4 py-3 border-b flex items-center justify-between gap-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Email Preview</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border
              ${isDark ? 'bg-slate-700/60 border-slate-600 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-700'}`}>
              <svg className="w-2.5 h-2.5 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 10V5a2 2 0 012-2z" />
              </svg>
              {generateTemplateId(row.subject)}
            </span>
          </div>
          <button onClick={onClose}
            className={`p-1.5 rounded-full ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Email envelope preview */}
        <div
          className="flex-1 px-4 pt-4 pb-3"
          style={{ background: isDark ? '#0d1117' : '#e8edf2' }}
        >
          <EmailEnvelopeCard mail={row.sampleMail} subject={row.subject} isDark={isDark} />
        </div>

        {/* Analytics section */}
        <div className={`px-4 pt-3 pb-4 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Campaign Performance
          </p>

          {/* Clickable stat tiles */}
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {TILES.map((t) => {
              const isActive = activeStage === t.stage
              const hasData  = t.value > 0
              const meta     = STAGE_META[t.stage]
              return (
                <button
                  key={t.stage}
                  type="button"
                  disabled={!hasData}
                  onClick={() => setActiveStage(isActive ? null : t.stage)}
                  className={`text-center py-2.5 px-1 rounded-xl border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    isActive
                      ? meta.activeCls(isDark)
                      : isDark ? 'border-slate-700 bg-slate-800/50 hover:bg-slate-700/50' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <p className={`text-sm font-bold ${t.color}`}>{t.value.toLocaleString()}</p>
                  <p className={`text-[10px] mt-0.5 ${isActive ? t.color : isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t.label}</p>
                  {isActive && <div className={`mx-auto mt-1.5 w-4 h-0.5 rounded-full ${t.color.replace('text-', 'bg-')}`} />}
                </button>
              )
            })}
          </div>

          {/* User list */}
          {activeStage && (
            <div className="mb-3">
              <UserListPanel
                stage={activeStage}
                users={row.stageUsers?.[activeStage] || []}
                isDark={isDark}
                dataMasked={dataMasked}
              />
            </div>
          )}

          {/* Rate metrics */}
          <div className={`grid grid-cols-4 gap-2 pt-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
            {[
              { label: 'Delivery',  value: `${row.deliveryRate.toFixed(1)}%`, color: 'text-brand-500' },
              { label: 'Open',      value: `${row.openRate.toFixed(1)}%`,     color: 'text-brand-500'  },
              { label: 'Click',     value: `${row.clickRate.toFixed(1)}%`,    color: 'text-amber-500'   },
              { label: 'Bounce',    value: `${row.bounceRate.toFixed(1)}%`,   color: 'text-rose-500'    },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{m.label} rate</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'templateId',   label: 'Template ID',    sortable: false },
  { key: 'sent',         label: 'Sent',           sortable: true },
  { key: 'delivered',    label: 'Delivered',      sortable: true },
  { key: 'opened',       label: 'Opened',         sortable: true },
  { key: 'clicked',      label: 'Clicked',        sortable: true },
  { key: 'bounced',      label: 'Bounced',        sortable: true },
  { key: 'deliveryRate', label: 'Delivery %',     sortable: true },
  { key: 'openRate',     label: 'Open %',         sortable: true },
  { key: 'clickRate',    label: 'Click %',        sortable: true },
  { key: 'bounceRate',   label: 'Bounce %',       sortable: true },
  { key: 'actions',      label: 'Details',        sortable: false },
]

function SortIcon({ dir }) {
  if (!dir) return <span className="opacity-20 ml-1">↕</span>
  return <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>
}

function RateBar({ value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-semibold w-12 text-right ${color}`}>{value.toFixed(1)}%</span>
      <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${color.replace('text-', 'bg-')} transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

export default function EmailSubjectTable({ rows, theme, dataMasked }) {
  const isDark = theme === 'dark'
  const [sortKey, setSortKey] = useState('sent')
  const [sortDir, setSortDir] = useState('desc')
  const [previewRow, setPreviewRow] = useState(null)

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [rows, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const thBase = `px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider select-none ${isDark ? 'text-slate-400 bg-slate-800' : 'text-slate-500 bg-slate-50'}`

  return (
    <>
      {previewRow && (
        <EmailPreviewModal
          row={previewRow}
          isDark={isDark}
          dataMasked={dataMasked}
          onClose={() => setPreviewRow(null)}
        />
      )}

      <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`}>
        <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Campaign / Subject Performance</h3>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Click any column header to sort · click <span className="font-semibold">Details</span> to see per-stage user lists
          </p>
        </div>

        <div className="overflow-x-auto">
          {rows.length === 0 ? (
            <div className={`py-16 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <p className="text-3xl mb-3">📭</p>
              <p className="text-sm">No email data for the selected filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`${thBase} ${col.sortable ? 'cursor-pointer hover:text-slate-200 transition-colors' : ''} ${col.key === 'subject' ? 'min-w-[260px]' : 'whitespace-nowrap'}`}
                      onClick={() => col.sortable && toggleSort(col.key)}
                    >
                      {col.label}
                      {col.sortable && <SortIcon dir={sortKey === col.key ? sortDir : null} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-50'}`}>
                {sorted.map((row) => (
                  <tr key={row.subject} className={`${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'} transition-colors`}>
                    {/* Template ID */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg border
                        ${isDark ? 'bg-slate-700/60 border-slate-600 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-700'}`}
                        title={generateTemplateId(row.subject)}
                      >
                        <svg className="w-2.5 h-2.5 opacity-60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 10V5a2 2 0 012-2z" />
                        </svg>
                        {generateTemplateId(row.subject)}
                      </span>
                    </td>
                    {/* Counts */}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold text-blue-500`}>{row.sent.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold text-brand-500`}>{row.delivered.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold text-brand-500`}>{row.opened.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold text-amber-500`}>{row.clicked.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${row.bounced > 0 ? 'text-rose-500' : isDark ? 'text-slate-600' : 'text-slate-300'}`}>
                        {row.bounced.toLocaleString()}
                      </span>
                    </td>
                    {/* Rate bars */}
                    <td className="px-4 py-3 min-w-[130px]"><RateBar value={row.deliveryRate} color="text-brand-500" /></td>
                    <td className="px-4 py-3 min-w-[130px]"><RateBar value={row.openRate}     color="text-brand-500" /></td>
                    <td className="px-4 py-3 min-w-[130px]"><RateBar value={row.clickRate}    color="text-amber-500"  /></td>
                    <td className="px-4 py-3 min-w-[130px]"><RateBar value={row.bounceRate}   color="text-rose-500"   /></td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setPreviewRow(row)}
                        className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
