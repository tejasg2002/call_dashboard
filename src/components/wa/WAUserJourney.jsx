'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { normalizeWAWorkspace } from '../../lib/waWorkspace'

// ── Road constants ─────────────────────────────────────────────────────────────
const SVG_W     = 1000
const SVG_H     = 400
const CENTER_Y  = SVG_H / 2        // 200
const AMPLITUDE = 130              // road wave height
const FREQ      = 0.0094           // ~1.5 cycles across 1000px
const ROAD_W    = 48               // road stroke width
const NODE_R    = 20               // visible node radius
const HIT_R     = 28               // invisible hit-target radius
const START_X   = SVG_W * 0.07
const END_X     = SVG_W * 0.93

// ── Sine helpers ───────────────────────────────────────────────────────────────
const sineY = (x) => CENTER_Y + AMPLITUDE * Math.sin(FREQ * x)

function buildRoadPath(steps = 500) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const x = (i / steps) * SVG_W
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${sineY(x).toFixed(1)}`
  }).join(' ')
}

const ROAD_PATH = buildRoadPath()

function nodePosition(idx, total) {
  const x = total <= 1 ? SVG_W / 2 : START_X + (idx / (total - 1)) * (END_X - START_X)
  return { x, y: sineY(x) }
}

// ── Stage config ───────────────────────────────────────────────────────────────
const STAGE_CFG = {
  clicked:   { label: 'Clicked',   icon: '🖱',  color: '#f59e0b', glow: 'rgba(245,158,11,0.5)',  dim: 'rgba(245,158,11,0.18)' },
  read:      { label: 'Read',      icon: '👁',   color: '#8b5cf6', glow: 'rgba(139,92,246,0.5)',  dim: 'rgba(139,92,246,0.18)' },
  delivered: { label: 'Delivered', icon: '✅',   color: '#10b981', glow: 'rgba(16,185,129,0.5)',  dim: 'rgba(16,185,129,0.18)' },
  failed:    { label: 'Failed',    icon: '❌',   color: '#f43f5e', glow: 'rgba(244,63,94,0.5)',   dim: 'rgba(244,63,94,0.18)' },
  sent:      { label: 'Sent',      icon: '📤',   color: '#60a5fa', glow: 'rgba(96,165,250,0.5)',  dim: 'rgba(96,165,250,0.18)' },
}

const FORM_KEYWORDS = ['apply', 'enquire', 'enquiry', 'register', 'admission', 'submit', 'enroll', 'book', 'apply now']

function getHighestStage(stages) {
  if (stages.clicked)   return 'clicked'
  if (stages.read)      return 'read'
  if (stages.delivered) return 'delivered'
  if (stages.failed)    return 'failed'
  return 'sent'
}

// ── Payload parser ─────────────────────────────────────────────────────────────
function parsePayload(raw) {
  if (!raw) return null
  if (typeof raw === 'object' && (raw.body || raw.header_text || raw.buttons)) {
    return {
      headerFormat: raw.header_format || '',
      headerImageUrl: raw.header_image_url || raw.header_handle_file_url || raw.media_url || '',
      headerText: raw.header_text || '',
      body: raw.body || '',
      footer: raw.footer || '',
      buttons: raw.buttons || [],
      name: raw.name || '',
      category: raw.category || '',
    }
  }
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw
    const msg = obj?.data?.message
    if (!msg) return null
    let tmpl = null
    if (msg.raw_template) { try { tmpl = typeof msg.raw_template === 'string' ? JSON.parse(msg.raw_template) : msg.raw_template } catch {} }
    let buttons = []
    if (tmpl?.buttons) { try { buttons = typeof tmpl.buttons === 'string' ? JSON.parse(tmpl.buttons) : tmpl.buttons } catch {} }
    return {
      headerFormat: tmpl?.header_format || '',
      headerImageUrl: tmpl?.header_handle_file_url || msg.media_url || '',
      headerText: tmpl?.header_text || '',
      body: tmpl?.body || '',
      footer: tmpl?.footer || '',
      buttons,
      name: tmpl?.name || '',
      category: tmpl?.category || '',
    }
  } catch { return null }
}

function getEventStage(doc) {
  if (doc.stage) return doc.stage
  const et = (doc.event_type || '').toLowerCase()
  const ms = (doc.message_status || '').toLowerCase()
  if (et.includes('click') || et.includes('button')) return 'clicked'
  if (et.includes('read') || ms === 'read') return 'read'
  if (et.includes('deliver') || ms === 'delivered') return 'delivered'
  if (et.includes('fail') || ms === 'failed') return 'failed'
  return 'sent'
}

function fmtTs(ts, short = false) {
  if (!ts) return null
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      ...(short ? {} : { year: 'numeric' }),
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    })
  } catch { return null }
}

// ── Build journey ──────────────────────────────────────────────────────────────
function buildJourney(docs) {
  const map = new Map()
  for (const doc of docs) {
    const name = doc.template_name || '(unknown)'
    if (!map.has(name)) {
      map.set(name, {
        templateName: name, source: doc.source || '',
        stages: {}, parsed: null,
        clickedButtons: [], failureReason: '', sentAt: null,
        _rawPayload: null, _tmplPreview: null,
      })
    }
    const e = map.get(name)
    const stage = getEventStage(doc)
    const ts = doc.event_timestamp || doc.timestamp || null

    if (!e.stages[stage] || (ts && ts > e.stages[stage].timestamp)) e.stages[stage] = { timestamp: ts }
    if (stage === 'sent' && (!e.sentAt || (ts && ts < e.sentAt))) e.sentAt = ts

    if (stage === 'clicked') {
      let btn = doc.button_text || ''
      if (!btn && doc.raw_payload) { try { const rp = typeof doc.raw_payload === 'string' ? JSON.parse(doc.raw_payload) : doc.raw_payload; btn = rp?.data?.message?.button_text || '' } catch {} }
      if (btn && !e.clickedButtons.includes(btn)) e.clickedButtons.push(btn)
    }
    if (stage === 'failed' && !e.failureReason) e.failureReason = doc.failure_reason || doc.channel_failure_reason || ''
    if (!e._tmplPreview && doc.template_preview) e._tmplPreview = doc.template_preview
    if (!e._rawPayload && doc.raw_payload) e._rawPayload = doc.raw_payload
  }

  const entries = []
  for (const e of map.values()) {
    e.parsed = parsePayload(e._tmplPreview || e._rawPayload)
    e.isFormSubmission = e.clickedButtons.some((b) => FORM_KEYWORDS.some((kw) => b.toLowerCase().includes(kw)))
    delete e._rawPayload; delete e._tmplPreview
    entries.push(e)
  }

  return entries.sort((a, b) => {
    const ta = a.sentAt ? new Date(a.sentAt).getTime() : 0
    const tb = b.sentAt ? new Date(b.sentAt).getTime() : 0
    return ta - tb
  })
}

// ── WhatsApp text renderer ─────────────────────────────────────────────────────
function WAText({ text }) {
  if (!text) return null
  const parts = []; let key = 0
  const regex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|\n)/g
  let last = 0, match
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

// ── Tooltip card (shows on hover) ──────────────────────────────────────────────
function TooltipCard({ entry, index, total, isDark, style }) {
  const stage = getHighestStage(entry.stages)
  const cfg   = STAGE_CFG[stage]
  const p     = entry.parsed
  const FUNNEL = ['sent', 'delivered', 'read', 'clicked']
  const lastFunnel = FUNNEL.reduce((acc, s, i) => entry.stages[s] ? i : acc, -1)
  const pct = lastFunnel >= 0 ? Math.round(((lastFunnel + 1) / 4) * 100) : 5

  return (
    <div
      className="pointer-events-none absolute z-50"
      style={{ ...style, width: 300 }}
    >
      {/* Arrow */}
      <div className="flex justify-center">
        <div
          className="w-3 h-3 rotate-45 -mb-1.5 border-l border-t"
          style={{ background: isDark ? '#1e293b' : '#fff', borderColor: isDark ? '#334155' : '#e2e8f0' }}
        />
      </div>

      <div className={`rounded-2xl border shadow-2xl overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-2.5" style={{ background: cfg.dim }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: cfg.color }}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[12px] font-semibold leading-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {entry.templateName.replace(/_/g, ' ')}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[10px] font-semibold" style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>
              {entry.isFormSubmission && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">🎓 Applied</span>
              )}
            </div>
          </div>
          <span className={`text-[9px] flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{index + 1}/{total}</span>
        </div>

        {/* Funnel progress */}
        <div className="px-4 pt-2.5 pb-1">
          <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, #3b82f6, ${cfg.color})` }} />
          </div>
          <div className={`flex justify-between text-[8px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
            <span>Sent</span><span>Delivered</span><span>Read</span><span>Clicked</span>
          </div>
        </div>

        {/* Stage chips */}
        <div className="px-4 py-2 flex flex-wrap gap-1">
          {(['sent','delivered','read','clicked','failed']).map((s) => {
            if (!entry.stages[s]) return null
            const sc = STAGE_CFG[s]
            return (
              <span key={s} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border font-medium"
                style={{ color: sc.color, borderColor: sc.color, background: sc.dim }}>
                {sc.icon} {sc.label}
                {entry.stages[s].timestamp && (
                  <span className="opacity-70 ml-0.5">{fmtTs(entry.stages[s].timestamp, true)}</span>
                )}
              </span>
            )
          })}
        </div>

        {/* Button clicks */}
        {entry.clickedButtons.length > 0 && (
          <div className={`mx-4 mb-2 px-2.5 py-2 rounded-xl border ${isDark ? 'bg-amber-900/15 border-amber-700/30' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`text-[9px] font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>Buttons Clicked</p>
            <div className="flex flex-wrap gap-1">
              {entry.clickedButtons.map((btn, i) => (
                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-lg font-medium ${isDark ? 'bg-amber-900/30 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>🖱 {btn}</span>
              ))}
            </div>
          </div>
        )}

        {/* WA bubble preview */}
        {p && (p.body || p.headerText) && (
          <div className="mx-4 mb-4 rounded-xl overflow-hidden" style={{ background: isDark ? '#0d1117' : '#efeae2', padding: '10px' }}>
            <div className="rounded-xl rounded-tr-sm overflow-hidden shadow-sm" style={{ background: isDark ? '#1f2c34' : '#fff' }}>
              {p.headerFormat === 'TEXT' && p.headerText && (
                <div className={`px-3 pt-2 pb-0.5 font-bold text-[12px] ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{p.headerText}</div>
              )}
              {p.body && (
                <div className={`px-3 pt-1.5 pb-1 text-[11.5px] leading-[1.5] ${isDark ? 'text-slate-200' : 'text-[#111b21]'}`}>
                  <WAText text={p.body.length > 180 ? p.body.slice(0, 180) + '…' : p.body} />
                </div>
              )}
              {p.footer && <div className={`px-3 pb-1 text-[10px] ${isDark ? 'text-slate-500' : 'text-[#667781]'}`}>{p.footer}</div>}
              <div className={`px-3 pb-1.5 text-right text-[9px] flex items-center justify-end gap-1 ${isDark ? 'text-slate-500' : 'text-[#667781]'}`}>
                <svg className="w-3 h-2.5" viewBox="0 0 16 11" fill="none">
                  <path d="M1 5.5L5 9.5L15 1" stroke="#53bdeb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M5 5.5L9 9.5" stroke="#53bdeb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              {p.buttons?.length > 0 && (
                <div className={`border-t ${isDark ? 'border-slate-700' : 'border-[#e9edef]'}`}>
                  {p.buttons.slice(0, 2).map((btn, i) => (
                    <div key={i} className={`py-1.5 text-center text-[11px] font-medium text-[#0084ff] ${i > 0 ? `border-t ${isDark ? 'border-slate-700' : 'border-[#e9edef]'}` : ''}`}>{btn.text}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sent at */}
        {entry.sentAt && (
          <div className={`px-4 pb-3 text-[9px] flex items-center gap-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Sent {fmtTs(entry.sentAt)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Road map SVG ───────────────────────────────────────────────────────────────
function RoadMap({ entries, isDark, onHover, hoveredIdx }) {
  const total = entries.length
  const positions = entries.map((_, i) => nodePosition(i, total))

  // Decorative scattered elements
  const decorations = [
    { type: 'dot', x: 120, y: 60 },  { type: 'dot', x: 880, y: 80 },
    { type: 'dot', x: 300, y: 330 }, { type: 'dot', x: 700, y: 320 },
    { type: 'dot', x: 500, y: 50 },  { type: 'dot', x: 180, y: 280 },
    { type: 'plus', x: 80, y: 150 }, { type: 'plus', x: 920, y: 250 },
    { type: 'plus', x: 420, y: 360 },{ type: 'plus', x: 600, y: 40 },
    { type: 'cross', x: 240, y: 85 },{ type: 'cross', x: 760, y: 340 },
    { type: 'cross', x: 50, y: 320 },{ type: 'cross', x: 950, y: 120 },
  ]

  const roadColor = isDark ? '#1e3a5f' : '#c8d6e8'
  const roadEdge  = isDark ? '#2563eb22' : '#93c5fd33'
  const dashColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)'
  const decoColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(100,116,139,0.15)'

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{ display: 'block', width: '100%', height: 'auto', minWidth: 520 }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* ── Decorative background elements ── */}
      {decorations.map((d, i) => {
        if (d.type === 'dot') return <circle key={i} cx={d.x} cy={d.y} r={4} fill={decoColor} />
        if (d.type === 'plus') return (
          <g key={i} stroke={decoColor} strokeWidth={2} strokeLinecap="round">
            <line x1={d.x - 6} y1={d.y} x2={d.x + 6} y2={d.y} />
            <line x1={d.x} y1={d.y - 6} x2={d.x} y2={d.y + 6} />
          </g>
        )
        if (d.type === 'cross') return (
          <g key={i} stroke={decoColor} strokeWidth={2} strokeLinecap="round">
            <line x1={d.x - 5} y1={d.y - 5} x2={d.x + 5} y2={d.y + 5} />
            <line x1={d.x + 5} y1={d.y - 5} x2={d.x - 5} y2={d.y + 5} />
          </g>
        )
        return null
      })}

      {/* ── Road (thick stroke) ── */}
      <path d={ROAD_PATH} fill="none" stroke={roadEdge} strokeWidth={ROAD_W + 12} strokeLinecap="round" strokeLinejoin="round" />
      <path d={ROAD_PATH} fill="none" stroke={roadColor} strokeWidth={ROAD_W} strokeLinecap="round" strokeLinejoin="round" />
      {/* Center dashed line */}
      <path d={ROAD_PATH} fill="none" stroke={dashColor} strokeWidth={2} strokeLinecap="round" strokeDasharray="12 8" />

      {/* ── Node labels (lines + text, below circles so circles draw on top) ── */}
      {positions.map((pos, i) => {
        const entry = entries[i]
        const stage = getHighestStage(entry.stages)
        const cfg   = STAGE_CFG[stage]
        const above = pos.y > CENTER_Y  // if node is below center → label goes above (and vice versa)
        const labelY = above ? pos.y - NODE_R - 42 : pos.y + NODE_R + 42
        const lineY2 = above ? pos.y - NODE_R - 4  : pos.y + NODE_R + 4
        const shortName = entry.templateName.replace(/_/g, ' ')
        const displayName = shortName.length > 22 ? shortName.slice(0, 21) + '…' : shortName
        const isHov = hoveredIdx === i

        return (
          <g key={i}>
            {/* Connector line from node to label */}
            <line
              x1={pos.x} y1={above ? pos.y - NODE_R : pos.y + NODE_R}
              x2={pos.x} y2={lineY2}
              stroke={isHov ? cfg.color : (isDark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.25)')}
              strokeWidth={isHov ? 2 : 1.5}
              strokeDasharray={isHov ? '' : '4 3'}
            />

            {/* Label bubble */}
            <rect
              x={pos.x - 54} y={above ? labelY - 13 : labelY - 13}
              width={108} height={24} rx={12}
              fill={isHov ? cfg.color : (isDark ? '#1e293b' : '#fff')}
              stroke={isHov ? 'none' : (isDark ? '#334155' : '#e2e8f0')}
              strokeWidth={1}
              filter={isHov ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))' : ''}
            />
            <text
              x={pos.x} y={above ? labelY + 4 : labelY + 4}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={isHov ? '700' : '500'}
              fontFamily="system-ui,-apple-system,sans-serif"
              fill={isHov ? '#fff' : (isDark ? '#94a3b8' : '#64748b')}
            >
              {displayName}
            </text>

            {/* Form submission star */}
            {entry.isFormSubmission && (
              <text x={pos.x + 46} y={above ? labelY - 8 : labelY - 8} fontSize={10} textAnchor="middle">🎓</text>
            )}
          </g>
        )
      })}

      {/* ── Nodes ── */}
      {positions.map((pos, i) => {
        const entry = entries[i]
        const stage = getHighestStage(entry.stages)
        const cfg   = STAGE_CFG[stage]
        const isHov = hoveredIdx === i
        const isFirst = i === 0
        const isLast  = i === total - 1

        return (
          <g
            key={i}
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => onHover(e, i)}
            onMouseLeave={() => onHover(null, null)}
          >
            {/* Hit area (invisible, larger) */}
            <circle cx={pos.x} cy={pos.y} r={HIT_R} fill="transparent" />

            {/* Outer glow ring */}
            {isHov && (
              <>
                <circle cx={pos.x} cy={pos.y} r={NODE_R + 11} fill="none" stroke={cfg.glow} strokeWidth={3} opacity={0.4} />
                <circle cx={pos.x} cy={pos.y} r={NODE_R + 19} fill="none" stroke={cfg.glow} strokeWidth={1.5} opacity={0.2} />
              </>
            )}

            {/* Node shadow */}
            <circle cx={pos.x + 1} cy={pos.y + 2} r={NODE_R} fill="rgba(0,0,0,0.25)" />

            {/* Node fill */}
            <circle
              cx={pos.x} cy={pos.y} r={NODE_R}
              fill={isHov ? cfg.color : (isDark ? '#0f172a' : '#fff')}
              stroke={cfg.color}
              strokeWidth={isHov ? 0 : 2.5}
            />

            {/* Inner circle ring */}
            {!isHov && (
              <circle cx={pos.x} cy={pos.y} r={NODE_R - 7} fill={cfg.dim} />
            )}

            {/* Start flag */}
            {isFirst && (
              <>
                <rect x={pos.x + NODE_R + 2} y={pos.y - 16} width={36} height={16} rx={8} fill="#10b981" />
                <text x={pos.x + NODE_R + 20} y={pos.y - 5} textAnchor="middle" fontSize={8} fontWeight="800" fill="#fff" fontFamily="system-ui,sans-serif">START</text>
              </>
            )}

            {/* End flag */}
            {isLast && !isFirst && (
              <>
                <rect x={pos.x + NODE_R + 2} y={pos.y - 16} width={32} height={16} rx={8} fill={isDark ? '#334155' : '#e2e8f0'} />
                <text x={pos.x + NODE_R + 18} y={pos.y - 5} textAnchor="middle" fontSize={8} fontWeight="700" fill={isDark ? '#94a3b8' : '#64748b'} fontFamily="system-ui,sans-serif">END</text>
              </>
            )}

            {/* Stage icon */}
            <text x={pos.x} y={pos.y + 5} textAnchor="middle" fontSize={14} fontFamily="system-ui,sans-serif">{STAGE_CFG[stage].icon}</text>

            {/* Index number */}
            <text
              x={pos.x - NODE_R + 5} y={pos.y - NODE_R + 9}
              fontSize={7} fontWeight="800"
              fill={isHov ? 'rgba(255,255,255,0.8)' : cfg.color}
              fontFamily="system-ui,sans-serif"
              opacity={0.9}
            >
              {String(i + 1).padStart(2, '0')}
            </text>

            {/* Form submission badge */}
            {entry.isFormSubmission && (
              <>
                <circle cx={pos.x + NODE_R - 3} cy={pos.y - NODE_R + 3} r={8} fill="#10b981" stroke={isDark ? '#0f172a' : '#fff'} strokeWidth={1.5} />
                <text x={pos.x + NODE_R - 3} y={pos.y - NODE_R + 7} textAnchor="middle" fontSize={9} fontFamily="system-ui,sans-serif">🎓</text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Summary strip ──────────────────────────────────────────────────────────────
function Summary({ entries, isDark }) {
  const sent      = entries.filter((e) => e.stages.sent).length
  const delivered = entries.filter((e) => e.stages.delivered).length
  const read      = entries.filter((e) => e.stages.read).length
  const clicked   = entries.filter((e) => e.stages.clicked).length
  const applied   = entries.filter((e) => e.isFormSubmission).length

  const tiles = [
    { v: entries.length, l: 'Templates', ic: '📋', c: '#94a3b8' },
    { v: sent,      l: 'Sent',      ic: '📤', c: '#60a5fa' },
    { v: delivered, l: 'Delivered', ic: '✅', c: '#10b981' },
    { v: read,      l: 'Read',      ic: '👁',  c: '#8b5cf6' },
    { v: clicked,   l: 'Clicked',   ic: '🖱',  c: '#f59e0b' },
    ...(applied > 0 ? [{ v: applied, l: 'Applied', ic: '🎓', c: '#10b981' }] : []),
  ]

  return (
    <div className={`grid gap-2 rounded-2xl border p-4 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}
      style={{ gridTemplateColumns: `repeat(${tiles.length}, 1fr)` }}>
      {tiles.map((t) => (
        <div key={t.l} className={`text-center py-2 px-1 rounded-xl ${isDark ? 'bg-slate-900/60' : 'bg-slate-50'}`}>
          <div className="text-lg leading-none mb-1">{t.ic}</div>
          <div className="text-lg font-bold" style={{ color: t.c }}>{t.v}</div>
          <div className={`text-[9px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{t.l}</div>
        </div>
      ))}
    </div>
  )
}

// ── Search bar ─────────────────────────────────────────────────────────────────
function SearchBar({ onSearch, loading, isDark }) {
  const [val, setVal] = useState('')
  const ref = useRef(null)
  const submit = (e) => { e.preventDefault(); const c = val.trim().replace(/\D/g, ''); if (c.length >= 10) onSearch(c) }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <div className={`flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-colors ${isDark ? 'bg-slate-800 border-slate-700 focus-within:border-brand-500' : 'bg-white border-slate-300 focus-within:border-brand-500'}`}>
        <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 8V5z" />
        </svg>
        <input ref={ref} type="tel" value={val} onChange={(e) => setVal(e.target.value)}
          placeholder="Phone with country code — e.g. 919876543210"
          className={`flex-1 bg-transparent text-sm outline-none placeholder:opacity-50 font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
          disabled={loading} />
        {val && <button type="button" onClick={() => { setVal(''); ref.current?.focus() }} className={`text-xs ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'}`}>✕</button>}
      </div>
      <button type="submit" disabled={loading || val.trim().replace(/\D/g, '').length < 10}
        className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 flex-shrink-0">
        {loading ? <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        )}
        Search
      </button>
    </form>
  )
}

// ── Legend strip ───────────────────────────────────────────────────────────────
function Legend({ isDark }) {
  return (
    <div className={`flex items-center gap-4 flex-wrap px-4 py-2 rounded-xl border text-[10px] ${isDark ? 'bg-slate-800/30 border-slate-700/60 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
      <span className="font-semibold uppercase tracking-wide">Node colour:</span>
      {Object.entries(STAGE_CFG).map(([k, v]) => (
        <span key={k} className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: v.color }} />
          {v.icon} {v.label}
        </span>
      ))}
      <span className="flex items-center gap-1 ml-2">🎓 Form submitted</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function WAUserJourney({ workspace, isDark }) {
  const ws = normalizeWAWorkspace(workspace)

  const [searchedPhone, setSearchedPhone] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [journey, setJourney]   = useState(null)
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const mapContainerRef = useRef(null)

  const handleSearch = useCallback(async (phone) => {
    setLoading(true); setError(null); setJourney(null)
    setHoveredIdx(null); setSearchedPhone(phone)
    try {
      const res  = await fetch(`/api/wa-events?phone_number=${phone}&workspace=${ws}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setJourney(buildJourney(data.docs || []))
    } catch (err) {
      console.error('[WAUserJourney]', err)
      setError(err.message || 'Failed to load journey')
    } finally { setLoading(false) }
  }, [ws])

  const handleHover = useCallback((e, idx) => {
    if (idx === null) { setHoveredIdx(null); return }
    setHoveredIdx(idx)
    if (!mapContainerRef.current) return
    const rect = mapContainerRef.current.getBoundingClientRect()
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  // Keep tooltip position updated on mouse move
  const handleMouseMove = useCallback((e) => {
    if (hoveredIdx === null) return
    if (!mapContainerRef.current) return
    const rect = mapContainerRef.current.getBoundingClientRect()
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [hoveredIdx])

  const bgStyle = isDark
    ? { background: 'linear-gradient(135deg, #0a1628 0%, #0f2040 40%, #0a1628 100%)' }
    : { background: 'linear-gradient(135deg, #dce8f7 0%, #c8d8ed 40%, #d4e4f5 100%)' }

  return (
    <div className="space-y-5">
      {/* Header + search */}
      <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl`} style={{ background: isDark ? 'rgba(99,102,241,0.15)' : '#ede9fe' }}>
            🗺️
          </div>
          <div>
            <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>User Journey Map</h2>
            <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Hover any node on the road to see the template, delivery status, and whether they applied.
            </p>
          </div>
        </div>
        <SearchBar onSearch={handleSearch} loading={loading} isDark={isDark} />
      </div>

      {/* Loading */}
      {loading && (
        <div className={`flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Loading journey for <span className="font-mono">{searchedPhone}</span>…
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className={`px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-rose-900/20 border-rose-700 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{error}</div>
      )}

      {/* Results */}
      {!loading && journey && (
        journey.length === 0 ? (
          <div className={`text-center py-16 rounded-2xl border border-dashed ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-base font-medium">No journey found</p>
            <p className="text-sm mt-1 opacity-70">No messages sent to <span className="font-mono">{searchedPhone}</span></p>
          </div>
        ) : (
          <>
            {/* User chip */}
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                {searchedPhone?.slice(-2) ?? '?'}
              </div>
              <div>
                <p className={`text-sm font-semibold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>+{searchedPhone}</p>
                <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {journey.length} template{journey.length !== 1 ? 's' : ''}
                  {journey[0]?.sentAt && <span> · First contact {fmtTs(journey[0].sentAt, true)}</span>}
                  {journey[journey.length - 1]?.sentAt && journey.length > 1 && <span> · Last {fmtTs(journey[journey.length - 1].sentAt, true)}</span>}
                </p>
              </div>
              {journey.some((e) => e.isFormSubmission) && (
                <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/15 border border-green-500/30">
                  <span>🎓</span>
                  <span className="text-[11px] font-semibold text-green-400">Applied!</span>
                </div>
              )}
            </div>

            <Summary entries={journey} isDark={isDark} />
            <Legend isDark={isDark} />

            {/* Road map */}
            <div
              className="rounded-2xl overflow-hidden border relative"
              style={{ ...bgStyle, borderColor: isDark ? '#1e3a5f' : '#b8cde0' }}
            >
              <div
                ref={mapContainerRef}
                className="relative overflow-x-auto"
                style={{ minHeight: 280 }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div style={{ minWidth: 520, padding: '24px 0 16px' }}>
                  <RoadMap
                    entries={journey}
                    isDark={isDark}
                    onHover={handleHover}
                    hoveredIdx={hoveredIdx}
                  />
                </div>

                {/* Tooltip */}
                {hoveredIdx !== null && journey[hoveredIdx] && (() => {
                  const TOOLTIP_W = 300
                  const containerW = mapContainerRef.current?.clientWidth ?? 600
                  let left = tooltipPos.x - TOOLTIP_W / 2
                  if (left < 8) left = 8
                  if (left + TOOLTIP_W > containerW - 8) left = containerW - TOOLTIP_W - 8
                  const above = tooltipPos.y > 200
                  const topOrBottom = above
                    ? { bottom: `calc(100% - ${tooltipPos.y}px + 12px)`, top: 'auto' }
                    : { top: `${tooltipPos.y + 16}px`, bottom: 'auto' }

                  return (
                    <TooltipCard
                      entry={journey[hoveredIdx]}
                      index={hoveredIdx}
                      total={journey.length}
                      isDark={isDark}
                      style={{ left, ...topOrBottom, pointerEvents: 'none' }}
                    />
                  )
                })()}
              </div>

              {/* Bottom label */}
              <div className={`px-4 py-2 text-[10px] border-t text-center ${isDark ? 'border-slate-700/50 text-slate-600' : 'border-slate-300/50 text-slate-400'}`}>
                Hover a node to inspect · Journey flows left → right chronologically
              </div>
            </div>
          </>
        )
      )}

      {/* Initial state */}
      {!loading && !journey && !error && (
        <div className={`text-center py-20 rounded-2xl border border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="text-5xl mb-4">🗺️</div>
          <p className={`text-base font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Search a user to render their journey road</p>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Enter phone with country code (e.g. 919876543210)</p>
        </div>
      )}
    </div>
  )
}
