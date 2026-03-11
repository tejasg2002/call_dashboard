'use client'

import { useState, useMemo, useEffect } from 'react'
import { maskPhone, maskEmail } from '../../lib/userManagement'
import { fetchLeadByMobile } from '../../lib/firebase'

const STAGES = {
  sent:      { label: 'Sent',      dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  delivered: { label: 'Delivered', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  read:      { label: 'Read',      dot: 'bg-violet-500',  badge: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  clicked:   { label: 'Clicked',   dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  failed:    { label: 'Failed',    dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
}

function formatTime(ts) {
  if (!ts) return null
  const d = new Date(ts)
  if (isNaN(d)) return null
  return {
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }),
  }
}

/* ─── CRM Lead badge ────────────────────────────────────────────────── */
function LeadInfo({ phoneNumber, isDark }) {
  const [lead, setLead] = useState(null)   // null = loading, false = not found, object = found
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!phoneNumber || phoneNumber.includes('*')) {
      setLead(false)
      return
    }
    setLead(null)
    let cancelled = false
    fetchLeadByMobile(phoneNumber).then((result) => {
      if (!cancelled) setLead(result || false)
    })
    return () => { cancelled = true }
  }, [phoneNumber])

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (lead === null) {
    return (
      <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-slate-700/50 border border-slate-600' : 'bg-slate-50 border border-slate-200'}`}>
        <div className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
        <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Looking up CRM...</span>
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
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        <span className="text-xs font-medium">CRM Lead ID</span>
      </div>
      <span className={`font-mono text-xs flex-1 truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{lead.lead_id}</span>
      <button
        onClick={() => copyToClipboard(lead.lead_id)}
        title="Copy Lead ID"
        className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-indigo-800/50 text-indigo-400' : 'hover:bg-indigo-100 text-indigo-500'}`}
      >
        {copied ? (
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        )}
      </button>
    </div>
  )
}

const STAGE_ORDER = ['sent', 'delivered', 'read', 'clicked', 'failed']

const STAGE_PILL = {
  sent:      { dot: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-900/30',    border: 'border-blue-200 dark:border-blue-700/50',    shadow: '#3b82f6' },
  delivered: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-700/50', shadow: '#10b981' },
  read:      { dot: 'bg-violet-500',  text: 'text-violet-600 dark:text-violet-300',  bg: 'bg-violet-50 dark:bg-violet-900/30',  border: 'border-violet-200 dark:border-violet-700/50',  shadow: '#8b5cf6' },
  clicked:   { dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-300',   bg: 'bg-amber-50 dark:bg-amber-900/30',   border: 'border-amber-200 dark:border-amber-700/50',   shadow: '#f59e0b' },
  failed:    { dot: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-300',    bg: 'bg-rose-50 dark:bg-rose-900/30',    border: 'border-rose-200 dark:border-rose-700/50',    shadow: '#f43f5e' },
}

/* ─── Horizontal stage pills for one template ───────────────────────── */
function TemplateStageLine({ templateName, stageMap, isDark, rowIndex }) {
  const activeStages = STAGE_ORDER.filter((s) => stageMap[s])

  return (
    <div
      className="flex items-center gap-3 flex-wrap"
      style={{ animation: 'waTplRowIn 0.35s ease both', animationDelay: `${rowIndex * 65}ms` }}
    >
      {/* Template chip */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold w-36 flex-shrink-0 truncate ${isDark ? 'bg-slate-700/60 border-slate-600 text-violet-300' : 'bg-violet-50 border-violet-200 text-violet-700'}`}
        title={templateName}
        style={{ borderLeft: `3px solid ${isDark ? '#a78bfa' : '#7c3aed'}` }}
      >
        <svg className="w-3 h-3 flex-shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="truncate">{templateName}</span>
      </div>

      {/* Stage pills with connecting line */}
      <div className="flex items-center gap-1 flex-wrap flex-1">
        {activeStages.map((s, i) => {
          const st  = STAGE_PILL[s]
          const meta = STAGES[s]
          const ts  = formatTime(stageMap[s].ts)
          const btn = stageMap[s].button

          return (
            <div key={s} className="flex items-center gap-1"
              style={{ animation: 'waStagePillIn 0.28s ease both', animationDelay: `${rowIndex * 65 + i * 55}ms` }}
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
                  {btn && <span className="opacity-60 text-[9px]">🖱</span>}
                </button>

                {/* Tooltip */}
                {(ts || btn) && (
                  <div className={`
                    pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40
                    hidden group-hover:flex flex-col gap-0.5
                    min-w-[130px] rounded-xl px-3 py-2 shadow-xl
                    transition-opacity duration-150
                    ${isDark ? 'bg-slate-700 border border-slate-600' : 'bg-slate-900'}
                  `}>
                    {ts && (
                      <>
                        <p className="text-white text-[12px] font-bold tracking-tight">{ts.time}</p>
                        <p className="text-slate-400 text-[10px]">{ts.date}</p>
                      </>
                    )}
                    {btn && (
                      <p className="text-amber-300 text-[10px] mt-0.5 flex items-center gap-1">
                        <span>🖱</span>{btn}
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

// ── Lead scoring ─────────────────────────────────────────────────────────────
// hot  = has clicked at least one template button
// warm = has read 2+ distinct templates but no click yet
function scoreLead(events) {
  const hasClicked  = events.some((e) => e.stage === 'clicked')
  if (hasClicked) return 'hot'
  const readTpls = new Set(
    events.filter((e) => e.stage === 'read').map((e) => e.template_name || '?')
  )
  if (readTpls.size >= 2) return 'warm'
  return null
}

const LEAD_TAG = {
  hot:  { label: '🔥 Hot',  cls: 'bg-rose-500/15 text-rose-500 border-rose-500/30'   },
  warm: { label: '⚡ Warm', cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
}

/* ─── Phone card ────────────────────────────────────────────────────── */
function PhoneCard({ phone_number, rawPhone, events, isDark }) {
  const [expanded, setExpanded] = useState(false)
  const lastEvent = events[0]
  const lastTs = formatTime(lastEvent?._resolvedTs || lastEvent?.event_timestamp || lastEvent?.timestamp)

  const leadScore = scoreLead(events)

  const stageCounts = events.reduce((acc, ev) => {
    acc[ev.stage] = (acc[ev.stage] || 0) + 1
    return acc
  }, {})

  // Group events by template → stage → { ts, button }
  // Keep only the first occurrence per stage per template
  const byTemplate = useMemo(() => {
    const map = {}
    ;[...events].reverse().forEach((ev) => {
      const tpl = ev.template_name && ev.template_name !== '—' ? ev.template_name : '(unknown)'
      if (!map[tpl]) map[tpl] = {}
      map[tpl][ev.stage] = {
        ts:     ev._resolvedTs || ev.event_timestamp || ev.timestamp || null,
        button: ev.button_text && ev.button_text !== '—' ? ev.button_text : null,
      }
    })
    return map
  }, [events])

  const tag = leadScore ? LEAD_TAG[leadScore] : null

  return (
    <div className={`rounded-xl border overflow-hidden transition-all
      ${leadScore === 'hot'
        ? isDark ? 'bg-slate-800/60 border-rose-500/40'  : 'bg-white border-rose-300 shadow-sm'
        : leadScore === 'warm'
        ? isDark ? 'bg-slate-800/60 border-amber-500/30' : 'bg-white border-amber-200 shadow-sm'
        : isDark ? 'bg-slate-800/60 border-slate-700'    : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      {/* Card header */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
            ${leadScore === 'hot'  ? 'bg-rose-500/20 text-rose-500'
            : leadScore === 'warm' ? 'bg-amber-500/20 text-amber-500'
            : isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}
          >
            {leadScore === 'hot' ? '🔥' : leadScore === 'warm' ? '⚡' : (phone_number.replace(/\*/g, '').slice(-2) || '?')}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{phone_number}</p>
              {tag && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${tag.cls}`}>
                  {tag.label}
                </span>
              )}
            </div>
            <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {Object.keys(byTemplate).length} template{Object.keys(byTemplate).length !== 1 ? 's' : ''}
              {lastTs && ` · Last: ${lastTs.date}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            @keyframes waTplRowIn {
              from { opacity: 0; transform: translateX(-10px); }
              to   { opacity: 1; transform: translateX(0); }
            }
            @keyframes waStagePillIn {
              from { opacity: 0; transform: scale(0.75) translateY(4px); }
              to   { opacity: 1; transform: scale(1) translateY(0); }
            }
            @keyframes waBodyIn {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
          `}</style>

          <div style={{ animation: 'waBodyIn 0.2s ease both' }}>
            {/* CRM Lead lookup */}
            <div className="px-4 pt-3 pb-2">
              <LeadInfo phoneNumber={rawPhone || phone_number} isDark={isDark} />
            </div>

            {/* Horizontal per-template stage rows */}
            <div className={`mx-4 mb-4 rounded-xl p-3 space-y-3 ${isDark ? 'bg-slate-900/60 border border-slate-700/60' : 'bg-slate-50/80 border border-slate-100'}`}>
              {/* Header */}
              <div className="flex items-center gap-2">
                <svg className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <p className={`text-[10px] uppercase tracking-widest font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Template journey · hover stage to see time
                </p>
              </div>

              {/* Divider */}
              <div className={`h-px ${isDark ? 'bg-slate-700/60' : 'bg-slate-200'}`} />

              {/* Rows */}
              {Object.entries(byTemplate).map(([tplName, stageMap], i) => (
                <TemplateStageLine
                  key={tplName}
                  templateName={tplName}
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

/* ─── Main component ────────────────────────────────────────────────── */
export default function WAUserActivityTimeline({ byPhone, theme, isAdmin, dataMasked }) {
  const [searchPhone, setSearchPhone]   = useState('')
  const [leadFilter, setLeadFilter]     = useState('all')  // 'all' | 'hot' | 'warm'
  const isDark = theme === 'dark'

  // Apply masking when dataMasked=true; always keep rawPhone for CRM lookup
  // Also attach leadScore to each entry so filtering and cards share the same value
  const processedByPhone = useMemo(() => {
    return byPhone.map((p) => {
      const score = scoreLead(p.events)
      if (!dataMasked) return { ...p, rawPhone: p.phone_number, leadScore: score }
      return {
        ...p,
        rawPhone: p.phone_number,
        leadScore: score,
        phone_number: maskPhone(p.phone_number),
        events: p.events.map((ev) => ({
          ...ev,
          phone_number: maskPhone(ev.phone_number),
          email: ev.email ? maskEmail(ev.email) : ev.email,
        })),
      }
    })
  }, [byPhone, dataMasked])

  const hotCount  = useMemo(() => processedByPhone.filter((p) => p.leadScore === 'hot').length,  [processedByPhone])
  const warmCount = useMemo(() => processedByPhone.filter((p) => p.leadScore === 'warm').length, [processedByPhone])

  const filtered = useMemo(() => {
    // Apply lead filter first (operates on raw phone_number for accuracy)
    let pool = processedByPhone
    if (leadFilter !== 'all') pool = pool.filter((p) => p.leadScore === leadFilter)

    const q = searchPhone.trim().toLowerCase()
    if (!q) return pool.slice(0, 50)
    return pool.filter((p) => (p.rawPhone || p.phone_number).toLowerCase().includes(q))
  }, [processedByPhone, searchPhone, leadFilter])

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-slate-50'} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>User activity timeline</h3>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {byPhone.length} users · click a card to expand
            {dataMasked && (
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${isDark ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                📵 Numbers masked
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Lead filter pills */}
          <div className={`flex items-center gap-1 p-0.5 rounded-lg border ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
            {[
              { id: 'all',  label: 'All',         count: byPhone.length },
              { id: 'hot',  label: '🔥 Hot',       count: hotCount       },
              { id: 'warm', label: '⚡ Warm',      count: warmCount      },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setLeadFilter(f.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all
                  ${leadFilter === f.id
                    ? f.id === 'hot'  ? 'bg-rose-500 text-white shadow-sm'
                    : f.id === 'warm' ? 'bg-amber-500 text-white shadow-sm'
                    : isDark ? 'bg-slate-600 text-slate-100 shadow-sm' : 'bg-white text-slate-700 shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                {f.label}
                <span className={`px-1 rounded text-[10px] font-bold ${leadFilter === f.id ? 'bg-white/20' : isDark ? 'bg-slate-600/60' : 'bg-slate-200'}`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search phone number"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className={`pl-8 pr-3 py-2 rounded-lg border text-sm w-48 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-slate-200 text-slate-900'}`}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="p-4 max-h-[560px] overflow-y-auto space-y-2">
        {filtered.length === 0 ? (
          <div className={`py-10 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <p className="text-2xl mb-2">{leadFilter === 'hot' ? '🔥' : leadFilter === 'warm' ? '⚡' : '📭'}</p>
            <p className="text-sm">
              {searchPhone.trim()
                ? 'No matching phone number found.'
                : leadFilter === 'hot'  ? 'No hot leads yet. Hot leads have clicked at least one template.'
                : leadFilter === 'warm' ? 'No warm leads yet. Warm leads have read 2+ templates without clicking.'
                : 'No activity data yet.'}
            </p>
          </div>
        ) : (
          <>
            {filtered.map(({ phone_number, rawPhone, events }) => (
              <PhoneCard
                key={rawPhone || phone_number}
                phone_number={phone_number}
                rawPhone={rawPhone}
                events={events}
                isDark={isDark}
              />
            ))}
            {!searchPhone.trim() && leadFilter === 'all' && byPhone.length > 50 && (
              <p className={`text-xs text-center pt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                Showing 50 of {byPhone.length} users. Search or filter to find specific users.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
