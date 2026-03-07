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
    date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
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

/* ─── Phone card ────────────────────────────────────────────────────── */
function PhoneCard({ phone_number, rawPhone, events, isDark }) {
  const [expanded, setExpanded] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? events : events.slice(0, 6)
  const lastEvent = events[0]
  const lastTs = formatTime(lastEvent?.event_timestamp || lastEvent?.timestamp)

  const stageCounts = events.reduce((acc, ev) => {
    acc[ev.stage] = (acc[ev.stage] || 0) + 1
    return acc
  }, {})

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
      {/* Card header */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
            {phone_number.replace(/\*/g, '').slice(-2) || '?'}
          </div>
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{phone_number}</p>
            <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {events.length} event{events.length !== 1 ? 's' : ''}
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
          {/* CRM Lead lookup — uses raw (unmasked) phone for lookup, visible to all */}
          <div className="px-4 pt-3 pb-1">
            <LeadInfo phoneNumber={rawPhone || phone_number} isDark={isDark} />
          </div>

          {/* Timeline */}
          <div className="px-4 pb-4">
            <div className="relative mt-3 ml-3">
              <div className={`absolute left-0 top-0 bottom-0 w-px ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
              <div className="space-y-0">
                {shown.map((ev, i) => {
                  const stage = STAGES[ev.stage] || STAGES['sent']
                  const ts = formatTime(ev.event_timestamp || ev.timestamp)
                  return (
                    <div key={i} className="relative flex gap-4 pl-6 pb-4">
                      <span className={`absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${stage.dot} ${isDark ? 'border-slate-800' : 'border-white'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${stage.badge}`}>
                              {stage.label}
                            </span>
                            {ev.template_name && ev.template_name !== '—' && (
                              <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-violet-300' : 'bg-violet-50 text-violet-700'}`}>
                                {ev.template_name}
                              </span>
                            )}
                            {ev.button_text && ev.button_text !== '—' && (
                              <span className={`text-[11px] px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                                🖱 {ev.button_text}
                              </span>
                            )}
                          </div>
                          {ts && (
                            <div className={`text-[11px] whitespace-nowrap ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              <span className="font-medium">{ts.time}</span>
                              <span className="ml-1">{ts.date}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {events.length > 6 && !showAll && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAll(true) }}
                className={`mt-1 ml-9 text-xs font-medium ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Show all {events.length} events ↓
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Main component ────────────────────────────────────────────────── */
export default function WAUserActivityTimeline({ byPhone, theme, isAdmin, dataMasked }) {
  const [searchPhone, setSearchPhone] = useState('')
  const isDark = theme === 'dark'

  // Apply masking when dataMasked=true; always keep rawPhone for CRM lookup
  const processedByPhone = useMemo(() => {
    if (!dataMasked) return byPhone.map((p) => ({ ...p, rawPhone: p.phone_number }))
    return byPhone.map((p) => ({
      ...p,
      rawPhone: p.phone_number,              // keep original for CRM lookup
      phone_number: maskPhone(p.phone_number),
      events: p.events.map((ev) => ({
        ...ev,
        phone_number: maskPhone(ev.phone_number),
        email: ev.email ? maskEmail(ev.email) : ev.email,
      })),
    }))
  }, [byPhone, dataMasked])

  const filtered = useMemo(() => {
    const q = searchPhone.trim().toLowerCase()
    if (!q) return processedByPhone.slice(0, 8)
    // always search against real phone numbers
    return byPhone
      .filter((p) => p.phone_number.toLowerCase().includes(q))
      .map((p) => processedByPhone.find((m) => m.rawPhone === p.phone_number) || p)
  }, [processedByPhone, byPhone, searchPhone])

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
        <div className="relative">
          <svg className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search phone number"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            className={`pl-8 pr-3 py-2 rounded-lg border text-sm w-56 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-slate-200 text-slate-900'}`}
          />
        </div>
      </div>

      {/* List */}
      <div className="p-4 max-h-[560px] overflow-y-auto space-y-2">
        {filtered.length === 0 ? (
          <div className={`py-10 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm">{searchPhone.trim() ? 'No matching phone number found.' : 'No activity data yet.'}</p>
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
            {!searchPhone.trim() && byPhone.length > 8 && (
              <p className={`text-xs text-center pt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                Showing 8 of {byPhone.length} users. Search to find specific users.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
