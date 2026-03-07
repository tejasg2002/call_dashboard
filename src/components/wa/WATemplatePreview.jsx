import { useEffect } from 'react'

// Render WhatsApp text formatting: *bold*, _italic_, ~strike~, \n
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


export default function WATemplatePreview({ row, buttonStats = [], theme, onClose }) {
  const isDark = theme === 'dark'
  const parsed = parsePayload(row?.raw_payload)
  const hasStructured = parsed && (parsed.body || parsed.headerImageUrl || parsed.buttons?.length > 0)

  // Analytics from row
  const sent = row?.sent ?? 0
  const delivered = row?.delivered ?? 0
  const read = row?.read ?? 0
  const clicked = row?.clicked ?? 0
  const failed = row?.failed ?? 0
  const ctr = row?.ctr ?? 0
  // Use pre-computed per-template readRate (capped at 100%) if available
  const readRate = row?.readRate ?? (delivered > 0 ? Math.min((read / delivered) * 100, 100) : 0)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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

        {/* Chat background area */}
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
            /* WhatsApp message bubble */
            <div
              className="w-[88%] rounded-2xl rounded-tr-sm overflow-hidden shadow-md"
              style={{ background: isDark ? '#1f2c34' : '#ffffff' }}
            >
              {/* Header image */}
              {parsed.headerFormat === 'IMAGE' && parsed.headerImageUrl && (
                <img
                  src={parsed.headerImageUrl}
                  alt="Template header"
                  className="w-full object-cover"
                  style={{ maxHeight: '220px' }}
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              )}
              {/* Header text */}
              {parsed.headerFormat === 'TEXT' && parsed.headerText && (
                <div className={`px-3 pt-3 pb-1 font-bold text-[14px] leading-snug ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {parsed.headerText}
                </div>
              )}
              {/* Body */}
              <div className={`px-3 pt-2.5 pb-1 text-[13.5px] leading-[1.55] ${isDark ? 'text-slate-200' : 'text-[#111b21]'}`}>
                <WAText text={parsed.body} />
              </div>
              {/* Footer */}
              {parsed.footer && (
                <div className={`px-3 pb-1 text-[12px] ${isDark ? 'text-slate-500' : 'text-[#667781]'}`}>
                  {parsed.footer}
                </div>
              )}
              {/* Time + ticks */}
              <div className={`px-3 pb-2 text-right text-[11px] flex items-center justify-end gap-1 ${isDark ? 'text-slate-500' : 'text-[#667781]'}`}>
                {parsed.timestamp ? new Date(parsed.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                <svg className="w-4 h-3.5" viewBox="0 0 16 11" fill="none">
                  <path d="M1 5.5L5 9.5L15 1" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 5.5L9 9.5" stroke="#53bdeb" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {/* Buttons */}
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

        {/* Analytics section */}
        <div className={`px-4 pt-3 pb-4 border-t space-y-4 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>

          {/* Reach KPIs */}
          <div>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Template Details</p>
              <div className="flex items-center gap-3">
                {failed > 0 && <span className="text-[11px] text-rose-500 font-medium">{failed} failed</span>}
                <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>₹{(row?.total_cost ?? 0).toFixed(2)} spent</span>
              </div>
            </div>
          {/* Row 1: counts */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Sent',      value: sent,      color: 'text-blue-500' },
              { label: 'Delivered', value: delivered, color: 'text-emerald-500' },
              { label: 'Read',      value: read,      color: 'text-violet-500' },
              { label: 'Clicked',   value: clicked,   color: 'text-amber-500' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className={`text-sm font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Spacer + divider */}
          <div className="pt-2">
            <div className={`border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`} />
          </div>

          {/* Row 2: rates */}
          <div className="grid grid-cols-4 gap-2 pt-2">
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

          {/* Button click analytics */}
          {buttonStats.length > 0 && (
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Button clicks</p>
              <div className="space-y-2">
                {buttonStats.map((b) => {
                  const maxClicks = Math.max(...buttonStats.map((x) => x.total_clicks), 1)
                  const pct = Math.round((b.total_clicks / maxClicks) * 100)
                  return (
                    <div key={b.button_text} className={`rounded-xl px-3 py-2.5 ${isDark ? 'bg-slate-800' : 'bg-slate-50 border border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[13px] font-medium ${isDark ? 'text-slate-200' : 'text-[#111b21]'}`}>{b.button_text}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{b.unique_users} users</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-amber-800/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                            {b.total_clicks} clicks
                          </span>
                        </div>
                      </div>
                      <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                        <div
                          className="h-full rounded-full bg-[#0084ff] transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {/* Per-link breakdown */}
                      {b.links?.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {b.links.map((l) => (
                            <div key={l.url} className="flex items-center justify-between gap-2">
                              <a href={l.url} target="_blank" rel="noopener noreferrer"
                                className="text-[11px] text-blue-500 hover:underline truncate"
                                title={l.url}>{l.url.length > 40 ? l.url.slice(0, 40) + '…' : l.url}</a>
                              <span className={`shrink-0 text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{l.count}×</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {buttonStats.length === 0 && parsed?.buttons?.length > 0 && (
            <p className={`text-xs text-center ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>No button clicks recorded for this template yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
