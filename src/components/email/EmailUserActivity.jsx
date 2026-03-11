'use client'

import { useState, useMemo, useEffect } from 'react'
import { maskEmail } from '../../lib/userManagement'
import { fetchLeadByEmail } from '../../lib/firebase'

const STAGES = {
  sent:      { label: 'Sent',      dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'         },
  delivered: { label: 'Delivered', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  opened:    { label: 'Opened',    dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'   },
  clicked:   { label: 'Clicked',   dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'       },
  bounced:   { label: 'Bounced',   dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'           },
  complained:{ label: 'Complaint', dot: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'   },
}

const STAGE_ORDER = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained']

const STAGE_PILL = {
  sent:      { dot: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-300',       bg: 'bg-blue-50 dark:bg-blue-900/30',       border: 'border-blue-200 dark:border-blue-700/50',       shadow: '#3b82f6' },
  delivered: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-700/50', shadow: '#10b981' },
  opened:    { dot: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-300',   bg: 'bg-violet-50 dark:bg-violet-900/30',   border: 'border-violet-200 dark:border-violet-700/50',   shadow: '#8b5cf6' },
  clicked:   { dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-300',     bg: 'bg-amber-50 dark:bg-amber-900/30',     border: 'border-amber-200 dark:border-amber-700/50',     shadow: '#f59e0b' },
  bounced:   { dot: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-300',       bg: 'bg-rose-50 dark:bg-rose-900/30',       border: 'border-rose-200 dark:border-rose-700/50',       shadow: '#f43f5e' },
  complained:{ dot: 'bg-orange-500',  text: 'text-orange-600 dark:text-orange-300',   bg: 'bg-orange-50 dark:bg-orange-900/30',   border: 'border-orange-200 dark:border-orange-700/50',   shadow: '#f97316' },
}

function formatTime(ts) {
  if (!ts) return null
  const d = new Date(ts)
  if (isNaN(d)) return null
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  }
}

// ── CRM Lead badge ─────────────────────────────────────────────────────────────
function LeadInfo({ emailAddress, isDark }) {
  const [lead, setLead]     = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!emailAddress || emailAddress.includes('*')) { setLead(false); return }
    setLead(null)
    let cancelled = false
    fetchLeadByEmail(emailAddress).then((result) => {
      if (!cancelled) setLead(result || false)
    })
    return () => { cancelled = true }
  }, [emailAddress])

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  if (lead === null) {
    return (
      <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-50 border border-slate-200'}`}>
        <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Looking up CRM…</span>
      </div>
    )
  }
  if (lead === false) {
    return (
      <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-slate-700/30 border border-slate-700 text-slate-500' : 'bg-slate-50 border border-slate-200 text-slate-400'}`}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        No CRM record found
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-indigo-900/20 border-indigo-700/50' : 'bg-indigo-50 border-indigo-200'}`}>
      <div className={`flex items-center gap-1.5 ${isDark ? 'text-indigo-300' : 'text-indigo-600'}`}>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        <span className="text-xs font-medium">CRM Lead ID</span>
      </div>
      <span className={`font-mono text-xs flex-1 truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{lead.lead_id}</span>
      <button onClick={() => copy(lead.lead_id)} title="Copy Lead ID"
        className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-indigo-800/50 text-indigo-400' : 'hover:bg-indigo-100 text-indigo-500'}`}
      >
        {copied
          ? <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        }
      </button>
    </div>
  )
}

// ── Horizontal stage pills for one subject/campaign ────────────────────────────
function SubjectStageLine({ subjectName, stageMap, isDark, rowIndex }) {
  const activeStages = STAGE_ORDER.filter((s) => stageMap[s])

  return (
    <div
      className="flex items-center gap-3 flex-wrap"
      style={{ animation: 'emailTplRowIn 0.35s ease both', animationDelay: `${rowIndex * 65}ms` }}
    >
      {/* Subject chip */}
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold w-36 flex-shrink-0 truncate
          ${isDark ? 'bg-slate-700/60 border-slate-600 text-sky-300' : 'bg-sky-50 border-sky-200 text-sky-700'}`}
        title={subjectName}
        style={{ borderLeft: `3px solid ${isDark ? '#38bdf8' : '#0284c7'}` }}
      >
        <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="truncate">{subjectName}</span>
      </div>

      {/* Stage pills with connecting arrows */}
      <div className="flex items-center gap-1 flex-wrap flex-1">
        {activeStages.map((s, i) => {
          const st   = STAGE_PILL[s]
          const meta = STAGES[s]
          const ts   = formatTime(stageMap[s].ts)
          const link = stageMap[s].link

          return (
            <div key={s} className="flex items-center gap-1"
              style={{ animation: 'emailStagePillIn 0.28s ease both', animationDelay: `${rowIndex * 65 + i * 55}ms` }}
            >
              {/* Connector arrow */}
              {i > 0 && (
                <svg className={`w-3 h-3 flex-shrink-0 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}

              {/* Stage pill */}
              <div className="group relative">
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border
                    transition-all duration-200 cursor-default
                    hover:scale-110 hover:shadow-md
                    ${st.bg} ${st.border} ${st.text}`}
                  style={{ ['--tw-shadow-color']: st.shadow + '40' }}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                  {meta?.label || s}
                  {link && <span className="opacity-60 text-[9px]">🔗</span>}
                </button>

                {/* Tooltip */}
                {(ts || link) && (
                  <div className={`
                    pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40
                    hidden group-hover:flex flex-col gap-0.5
                    min-w-[160px] max-w-[260px] rounded-xl px-3 py-2 shadow-xl
                    transition-opacity duration-150
                    ${isDark ? 'bg-slate-700 border border-slate-600' : 'bg-slate-900'}
                  `}>
                    {ts && (
                      <>
                        <p className="text-white text-[12px] font-bold tracking-tight">{ts.time}</p>
                        <p className="text-slate-400 text-[10px]">{ts.date}</p>
                      </>
                    )}
                    {link && (
                      <p className="text-sky-300 text-[10px] mt-0.5 flex items-center gap-1 break-all">
                        <span>🔗</span>
                        <span className="truncate">{link.length > 50 ? link.slice(0, 50) + '…' : link}</span>
                      </p>
                    )}
                    {/* Arrow */}
                    <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent ${isDark ? 'border-t-slate-700' : 'border-t-slate-900'}`} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Email card ─────────────────────────────────────────────────────────────────
function EmailCard({ email, rawEmail, events, isDark }) {
  const [expanded, setExpanded] = useState(false)
  const lastEvent = events[0]
  const lastTs    = formatTime(lastEvent?.timestamp)

  const stageCounts = events.reduce((acc, ev) => {
    acc[ev.stage] = (acc[ev.stage] || 0) + 1
    return acc
  }, {})

  // Group events by subject → stage → { ts, link? }
  // Process oldest-first so later events overwrite with more recent timestamps
  const bySubject = useMemo(() => {
    const map = {}
    ;[...events].reverse().forEach((ev) => {
      const sub = ev.subject || '(no subject)'
      if (!map[sub]) map[sub] = {}
      map[sub][ev.stage] = {
        ts:   ev.timestamp || null,
        link: ev.link || null,
      }
    })
    return map
  }, [events])

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
      {/* Card header */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{email}</p>
            <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {Object.keys(bySubject).length} campaign{Object.keys(bySubject).length !== 1 ? 's' : ''}
              {lastTs && ` · Last: ${lastTs.date}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {Object.entries(stageCounts).map(([stage, count]) => (
              <span key={stage} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STAGES[stage]?.badge || (isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600')}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STAGES[stage]?.dot || 'bg-slate-400'}`} />
                {count}
              </span>
            ))}
          </div>
          <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${isDark ? 'text-slate-500' : 'text-slate-400'} ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <style>{`
            @keyframes emailTplRowIn {
              from { opacity: 0; transform: translateX(-10px); }
              to   { opacity: 1; transform: translateX(0); }
            }
            @keyframes emailStagePillIn {
              from { opacity: 0; transform: scale(0.75) translateY(4px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes emailBodyIn {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          `}</style>

          <div style={{ animation: 'emailBodyIn 0.2s ease both' }}>
            {/* CRM Lead lookup */}
            <div className="px-4 pt-3 pb-2">
              <LeadInfo emailAddress={rawEmail || email} isDark={isDark} />
            </div>

            {/* Horizontal per-subject stage rows */}
            <div className={`mx-4 mb-4 rounded-xl p-3 space-y-3 ${isDark ? 'bg-slate-900/60 border border-slate-700/60' : 'bg-slate-50/80 border border-slate-100'}`}>
              {/* Header */}
              <div className="flex items-center gap-2">
                <svg className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Campaign journey · hover stage to see time
                </p>
              </div>

              {/* Divider */}
              <div className={`h-px ${isDark ? 'bg-slate-700/60' : 'bg-slate-200'}`} />

              {/* Rows */}
              {Object.entries(bySubject).map(([subjectName, stageMap], i) => (
                <SubjectStageLine
                  key={subjectName}
                  subjectName={subjectName}
                  stageMap={stageMap}
                  isDark={isDark}
                  rowIndex={i}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EmailUserActivity({ byEmail, theme, dataMasked }) {
  const isDark = theme === 'dark'
  const [search, setSearch] = useState('')

  const processed = useMemo(() => {
    if (!dataMasked) return byEmail.map((u) => ({ ...u, rawEmail: u.email }))
    return byEmail.map((u) => ({
      ...u,
      rawEmail: u.email,
      email: maskEmail(u.email),
    }))
  }, [byEmail, dataMasked])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return processed.slice(0, 8)
    return byEmail
      .filter((u) => u.email.toLowerCase().includes(q))
      .map((u) => processed.find((p) => p.rawEmail === u.email) || u)
  }, [processed, byEmail, search])

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Recipient activity timeline</h3>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {byEmail.length} unique recipients · click a card to expand
            {dataMasked && (
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                📵 Emails masked
              </span>
            )}
          </p>
        </div>
        <div className="relative">
          <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search email address"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`pl-8 pr-3 py-2 rounded-lg border text-sm w-56 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-slate-200 text-slate-900'}`}
          />
        </div>
      </div>

      {/* List */}
      <div className="p-4 max-h-[560px] overflow-y-auto space-y-2">
        {filtered.length === 0 ? (
          <div className={`py-10 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm">{search.trim() ? 'No matching email found.' : 'No activity data yet.'}</p>
          </div>
        ) : (
          <>
            {filtered.map(({ email, rawEmail, events }) => (
              <EmailCard
                key={rawEmail || email}
                email={email}
                rawEmail={rawEmail}
                events={events}
                isDark={isDark}
              />
            ))}
            {!search.trim() && byEmail.length > 8 && (
              <p className={`text-xs text-center pt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                Showing 8 of {byEmail.length} recipients. Search to find specific emails.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
