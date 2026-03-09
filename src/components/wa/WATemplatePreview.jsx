import { useEffect, useState } from 'react'
import { fetchLeadByMobile } from '../../lib/firebase'
import { maskPhone } from '../../lib/userManagement'

// ── WhatsApp text formatter ──────────────────────────────────────────────────
function WAText({ text }) {
  if (!text) return null
  const parts = []
  let key = 0
  const regex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|\n)/g
  let last = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<span key={key++}>{text.slice(last, match.index)}</span>)
    const m = match[0]
    if (m === '\n') parts.push(<br key={key++} />)
    else if (m.startsWith('*')) parts.push(<strong key={key++}>{m.slice(1, -1)}</strong>)
    else if (m.startsWith('_')) parts.push(<em key={key++}>{m.slice(1, -1)}</em>)
    else if (m.startsWith('~')) parts.push(<del key={key++}>{m.slice(1, -1)}</del>)
    last = match.index + m.length
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>)
  return <>{parts}</>
}

function parsePayload(raw) {
  if (!raw) return null
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    const msg = obj?.data?.message
    if (!msg) return { _raw: obj }
    let template = null
    if (msg.raw_template) {
      try { template = typeof msg.raw_template === 'string' ? JSON.parse(msg.raw_template) : msg.raw_template } catch {}
    }
    let buttons = []
    if (template?.buttons) {
      try { buttons = typeof template.buttons === 'string' ? JSON.parse(template.buttons) : template.buttons } catch {}
    }
    return {
      name: template?.name || '',
      category: template?.category || '',
      language: template?.language || 'en',
      headerFormat: template?.header_format || '',
      headerImageUrl: template?.header_handle_file_url || msg.media_url || '',
      headerText: template?.header_text || '',
      body: template?.body || '',
      footer: template?.footer || '',
      buttons,
      timestamp: obj?.timestamp || '',
      _raw: obj,
    }
  } catch {
    return { _raw: typeof raw === 'string' ? raw : JSON.stringify(raw) }
  }
}

function ButtonPreview({ btn }) {
  const type = (btn.type || '').toUpperCase()
  const base = 'w-full py-2.5 text-[13px] font-medium flex items-center justify-center gap-1.5 text-[#0084ff]'
  if (type === 'QUICK_REPLY') return (
    <button className={base}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
      {btn.text}
    </button>
  )
  if (type === 'URL') return (
    <a href={btn.url} target="_blank" rel="noopener noreferrer" className={base}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      {btn.text}
    </a>
  )
  return <button className={base}>{btn.text}</button>
}

// ── User list panel ──────────────────────────────────────────────────────────
const STAGE_META = {
  sent:      { title: 'Sent to',      color: 'text-blue-500',    headerBg: (d) => d ? 'bg-blue-900/20 border-blue-800'    : 'bg-blue-50 border-blue-200' },
  delivered: { title: 'Delivered to', color: 'text-emerald-500', headerBg: (d) => d ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-200' },
  read:      { title: 'Read by',      color: 'text-violet-500',  headerBg: (d) => d ? 'bg-violet-900/20 border-violet-800'  : 'bg-violet-50 border-violet-200' },
  clicked:   { title: 'Clicked by',   color: 'text-amber-500',   headerBg: (d) => d ? 'bg-amber-900/20 border-amber-800'   : 'bg-amber-50 border-amber-200' },
  failed:    { title: 'Failed for',   color: 'text-rose-500',    headerBg: (d) => d ? 'bg-rose-900/20 border-rose-800'     : 'bg-rose-50 border-rose-200' },
}

const PAGE_SIZE = 10

function UserListPanel({ stage, users, isDark, dataMasked }) {
  const [leadMap, setLeadMap]   = useState({})
  const [copiedId, setCopiedId] = useState(null)
  const [page, setPage]         = useState(0)

  const totalPages = Math.ceil(users.length / PAGE_SIZE)
  const shown = users.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Reset to first page when stage changes
  useEffect(() => {
    setPage(0)
    setLeadMap({})
  }, [stage])

  // Fetch lead IDs for the current page only
  useEffect(() => {
    if (!shown.length) return
    const toFetch = shown.map((u) => u.phone).filter((p) => !(p in leadMap))
    if (!toFetch.length) return
    setLeadMap((prev) => {
      const next = { ...prev }
      toFetch.forEach((p) => { next[p] = 'loading' })
      return next
    })
    toFetch.forEach((phone) => {
      fetchLeadByMobile(phone).then((result) => {
        setLeadMap((prev) => ({ ...prev, [phone]: result?.lead_id || null }))
      })
    })
  }, [page, stage])

  const copyText = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedId(text)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const meta = STAGE_META[stage]

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
          const leadId = leadMap[u.phone]
          const displayPhone = dataMasked ? maskPhone(u.phone) : u.phone
          const ts = u.timestamp
            ? new Date(u.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
            : null
          return (
            <div key={`${u.phone}-${idx}`} className={`px-3 py-2.5 ${isDark ? 'bg-slate-800/50 hover:bg-slate-700/40' : 'bg-white hover:bg-slate-50'} transition-colors`}>
              {/* Top row: phone + lead ID */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={`text-[12px] font-mono font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {displayPhone}
                </span>
                {leadId === 'loading' ? (
                  <span className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  </span>
                ) : leadId ? (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-lg border ${isDark ? 'bg-indigo-900/20 border-indigo-700/40 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {leadId}
                    <button
                      type="button"
                      onClick={() => copyText(leadId)}
                      title="Copy lead ID"
                      className={`ml-0.5 p-0.5 rounded transition-colors ${isDark ? 'hover:bg-indigo-700/50' : 'hover:bg-indigo-100'}`}
                    >
                      {copiedId === leadId ? (
                        <svg className="w-2.5 h-2.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </span>
                ) : (
                  <span className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>No lead</span>
                )}
              </div>

              {/* Bottom row: extra info + timestamp */}
              {(stage === 'failed' || stage === 'clicked' || ts) && (
                <div className="flex items-start justify-between gap-2 mt-1 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {stage === 'failed' && u.reason && (
                      <p className={`text-[10px] leading-relaxed break-words ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>
                        {u.reason}
                      </p>
                    )}
                    {stage === 'clicked' && u.buttonText && (
                      <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                        🖱 {u.buttonText}
                      </span>
                    )}
                  </div>
                  {ts && (
                    <span className={`shrink-0 text-[10px] whitespace-nowrap ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{ts}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className={`flex items-center justify-between px-3 py-2 border-t ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-100 bg-slate-50'}`}>
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium disabled:opacity-30 transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
          >
            ‹ Prev
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let p
              if (totalPages <= 5) p = i
              else if (page < 3) p = i
              else if (page > totalPages - 3) p = totalPages - 5 + i
              else p = page - 2 + i
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`w-6 h-6 rounded-lg text-[11px] font-medium border transition-colors ${
                    p === page
                      ? isDark ? 'bg-violet-600 text-white border-violet-600' : 'bg-violet-600 text-white border-violet-600'
                      : isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {p + 1}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium disabled:opacity-30 transition-colors ${isDark ? 'border-slate-700 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function WATemplatePreview({ row, buttonStats = [], theme, dataMasked, onClose }) {
  const isDark = theme === 'dark'
  const parsed = parsePayload(row?.raw_payload)
  const hasStructured = parsed && (parsed.body || parsed.headerImageUrl || parsed.buttons?.length > 0)

  const sent      = row?.sent      ?? 0
  const delivered = row?.delivered ?? 0
  const read      = row?.read      ?? 0
  const clicked   = row?.clicked   ?? 0
  const failed    = row?.failed    ?? 0
  const ctr       = row?.ctr       ?? 0
  const readRate  = row?.readRate  ?? (delivered > 0 ? Math.min((read / delivered) * 100, 100) : 0)

  const [activeStage, setActiveStage] = useState(null)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Reset active stage when row changes
  useEffect(() => { setActiveStage(null) }, [row?.template_name])

  const STAT_TILES = [
    { stage: 'sent',      value: sent,      label: 'Sent',      color: 'text-blue-500',
      activeCls: isDark ? 'bg-blue-900/30 border-blue-600' : 'bg-blue-50 border-blue-400' },
    { stage: 'delivered', value: delivered, label: 'Delivered', color: 'text-emerald-500',
      activeCls: isDark ? 'bg-emerald-900/30 border-emerald-600' : 'bg-emerald-50 border-emerald-400' },
    { stage: 'read',      value: read,      label: 'Read',      color: 'text-violet-500',
      activeCls: isDark ? 'bg-violet-900/30 border-violet-600' : 'bg-violet-50 border-violet-400' },
    { stage: 'clicked',   value: clicked,   label: 'Clicked',   color: 'text-amber-500',
      activeCls: isDark ? 'bg-amber-900/30 border-amber-600' : 'bg-amber-50 border-amber-400' },
    { stage: 'failed',    value: failed,    label: 'Failed',
      color: failed > 0 ? 'text-rose-500' : (isDark ? 'text-slate-600' : 'text-slate-300'),
      activeCls: isDark ? 'bg-rose-900/30 border-rose-600' : 'bg-rose-50 border-rose-400' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`relative z-10 w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col ${isDark ? 'bg-slate-900' : 'bg-[#f0f2f5]'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal top bar */}
        <div className={`sticky top-0 z-10 flex items-center justify-between px-4 py-3 ${isDark ? 'bg-slate-800 border-b border-slate-700' : 'bg-white border-b border-slate-200'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{parsed?.name || row?.template_name}</span>
            {parsed?.category && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${isDark ? 'bg-amber-800/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                {parsed.category}
              </span>
            )}
            {parsed?.language && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                {parsed.language.toUpperCase()}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full ml-2 ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Chat background */}
        <div
          className="flex-1 px-4 pt-4 pb-3 flex flex-col items-end"
          style={{ background: isDark ? '#0d1117' : '#efeae2', backgroundImage: isDark ? 'none' : "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d6cfc7' fill-opacity='0.25'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}
        >
          {!row?.raw_payload ? (
            <div className={`self-stretch text-center py-8 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              No raw_payload stored for this template.
            </div>
          ) : !hasStructured ? (
            <pre className={`self-stretch text-xs rounded-xl p-3 overflow-x-auto whitespace-pre-wrap ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}>
              {JSON.stringify(parsed?._raw ?? row?.raw_payload, null, 2)}
            </pre>
          ) : (
            <div className="w-[88%] rounded-2xl rounded-tr-sm overflow-hidden shadow-md" style={{ background: isDark ? '#1f2c34' : '#ffffff' }}>
              {parsed.headerFormat === 'IMAGE' && parsed.headerImageUrl && (
                <img src={parsed.headerImageUrl} alt="Template header" className="w-full object-cover" style={{ maxHeight: '220px' }} onError={(e) => { e.target.style.display = 'none' }} />
              )}
              {parsed.headerFormat === 'TEXT' && parsed.headerText && (
                <div className={`px-3 pt-3 pb-1 font-bold text-[14px] leading-snug ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{parsed.headerText}</div>
              )}
              <div className={`px-3 pt-2.5 pb-1 text-[13.5px] leading-[1.55] ${isDark ? 'text-slate-200' : 'text-[#111b21]'}`}>
                <WAText text={parsed.body} />
              </div>
              {parsed.footer && (
                <div className={`px-3 pb-1 text-[12px] ${isDark ? 'text-slate-500' : 'text-[#667781]'}`}>{parsed.footer}</div>
              )}
              <div className={`px-3 pb-2 text-right text-[11px] flex items-center justify-end gap-1 ${isDark ? 'text-slate-500' : 'text-[#667781]'}`}>
                {parsed.timestamp ? new Date(parsed.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                <svg className="w-4 h-3.5" viewBox="0 0 16 11" fill="none">
                  <path d="M1 5.5L5 9.5L15 1" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 5.5L9 9.5" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {parsed.buttons?.length > 0 && (
                <div className={`border-t ${isDark ? 'border-slate-700' : 'border-[#e9edef]'}`}>
                  {parsed.buttons.map((btn, i) => (
                    <div key={i} className={i > 0 ? `border-t ${isDark ? 'border-slate-700' : 'border-[#e9edef]'}` : ''}>
                      <ButtonPreview btn={btn} isDark={isDark} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Analytics section ── */}
        <div className={`px-4 pt-3 pb-4 border-t ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Template Details</p>
            <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>₹{(row?.total_cost ?? 0).toFixed(2)} spent</span>
          </div>

          {/* Clickable stat tiles */}
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {STAT_TILES.map((s) => {
              const isActive = activeStage === s.stage
              const hasData  = s.value > 0
              return (
                <button
                  key={s.stage}
                  type="button"
                  disabled={!hasData}
                  onClick={() => setActiveStage(isActive ? null : s.stage)}
                  className={`text-center py-2.5 px-1 rounded-xl border transition-all ${
                    isActive
                      ? s.activeCls
                      : isDark
                        ? 'border-slate-700 bg-slate-800/50 hover:bg-slate-700/50'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  <p className={`text-sm font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                  <p className={`text-[10px] mt-0.5 ${isActive ? s.color : isDark ? 'text-slate-500' : 'text-slate-400'}`}>{s.label}</p>
                  {isActive && <div className={`mx-auto mt-1.5 w-4 h-0.5 rounded-full ${s.color.replace('text-', 'bg-')}`} />}
                </button>
              )
            })}
          </div>

          {/* User list panel */}
          {activeStage && (
            <div className="mb-3">
              <UserListPanel
                stage={activeStage}
                users={row?.stageUsers?.[activeStage] || []}
                isDark={isDark}
                dataMasked={dataMasked}
              />
              {/* Button breakdown shown below clicked user list */}
              {activeStage === 'clicked' && buttonStats.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Button breakdown</p>
                  {buttonStats.map((b) => {
                    const maxClicks = Math.max(...buttonStats.map((x) => x.total_clicks), 1)
                    const pct = Math.round((b.total_clicks / maxClicks) * 100)
                    return (
                      <div key={b.button_text} className={`rounded-xl px-3 py-2 ${isDark ? 'bg-slate-800' : 'bg-slate-50 border border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[12px] font-medium ${isDark ? 'text-slate-200' : 'text-[#111b21]'}`}>{b.button_text}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{b.unique_users} users</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-800/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>{b.total_clicks} clicks</span>
                          </div>
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                          <div className="h-full rounded-full bg-[#0084ff] transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className={`my-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`} />

          {/* Rate metrics — always visible */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'STD (Sent→Del)',  value: `${(row?.sdr ?? 0).toFixed(1)}%`, color: 'text-emerald-500' },
              { label: 'STR (Sent→Read)', value: `${(row?.str ?? 0).toFixed(1)}%`, color: 'text-violet-500' },
              { label: 'DTR (Del→Read)',  value: `${readRate.toFixed(1)}%`,         color: 'text-cyan-500' },
              { label: 'CTR (Click/Del)', value: `${ctr.toFixed(1)}%`,             color: 'text-indigo-500' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
