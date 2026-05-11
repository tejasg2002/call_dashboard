'use client'

import { useState, useCallback, useRef } from 'react'
import { normalizeWAWorkspace } from '../../lib/waWorkspace'
import {
  isJunkTemplateLabel,
  resolveWaTemplateName,
  resolveWaTimelineDisplayName,
} from '../../lib/waInteraktTemplate'

const FORM_KEYWORDS = ['apply', 'enquire', 'enquiry', 'register', 'admission', 'submit', 'enroll', 'book', 'apply now']

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
  const et = String(doc.event_type || doc.type || doc?.data?.type || '').toLowerCase()
  const ms = String(doc.message_status || doc?.data?.message?.message_status || '').toLowerCase()
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

function extractDocTs(doc) {
  const t = doc.event_timestamp || doc.createdAt || doc.timestamp
  if (!t) return null
  const ms = new Date(t).getTime()
  return Number.isNaN(ms) ? null : ms
}

const TEMPLATE_TIMELINE_STAGES = new Set(['sent', 'delivered', 'read'])

/** One timeline row per WA document: sent / delivered / read for messages we can name (excludes clicks & failures). */
function isTemplateTimelineDoc(doc) {
  const st = getEventStage(doc).toLowerCase()
  if (!TEMPLATE_TIMELINE_STAGES.has(st)) return false
  return true
}

function templateTimelineLabel(doc) {
  const st = getEventStage(doc).toLowerCase()
  if (st === 'delivered') return 'Delivered'
  if (st === 'read') return 'Read'
  return 'Template sent'
}

/**
 * Chronological list for the summary strip: each template send, then form submitted (from CRM/NPF when available).
 */
function buildSimpleTimeline(docs, formSubmissions, waApplyClick) {
  const sorted = [...(docs || [])].sort((a, b) => (extractDocTs(a) ?? 0) - (extractDocTs(b) ?? 0))
  const steps = []
  const seen = new Set()

  const displayName = (doc) => {
    let s = (doc.timelineLabel && String(doc.timelineLabel).trim()) || resolveWaTimelineDisplayName(doc) || ''
    if (isJunkTemplateLabel(s)) s = ''
    return s
  }

  for (const doc of sorted) {
    if (!isTemplateTimelineDoc(doc)) continue
    const name = displayName(doc)
    if (!name) continue
    const ts = doc.event_timestamp || doc.createdAt
    const tms = extractDocTs(doc)
    if (tms == null) continue
    const key = String(doc._id ?? `${name}|${tms}`)
    if (seen.has(key)) continue
    seen.add(key)
    steps.push({
      kind: 'template_touch',
      label: templateTimelineLabel(doc),
      templateName: name.replace(/_/g, ' '),
      at: ts,
    })
  }

  if (steps.length === 0) {
    const firstByTpl = new Map()
    for (const doc of sorted) {
      const name = displayName(doc)
      if (!name) continue
      const tms = extractDocTs(doc)
      if (tms == null) continue
      const prev = firstByTpl.get(name)
      if (prev == null || tms < prev.tms) firstByTpl.set(name, { tms, ts: doc.event_timestamp || doc.createdAt })
    }
    for (const [name, v] of firstByTpl) {
      steps.push({
        kind: 'template_touch',
        label: 'Template sent',
        templateName: name.replace(/_/g, ' '),
        at: v.ts,
      })
    }
  }

  if (waApplyClick?.at) {
    steps.push({
      kind: 'wa_apply_click',
      label: 'Apply / enquiry (WhatsApp)',
      templateName: waApplyClick.buttonText || 'Button tap',
      at: waApplyClick.at,
    })
  }

  for (const fs of formSubmissions || []) {
    if (!fs?.at) continue
    const bits = []
    if (fs.applicationNo) bits.push(`Application #${fs.applicationNo}`)
    if (fs.courseLabel) bits.push(fs.courseLabel)
    if (fs.applicationStage) bits.push(fs.applicationStage)
    const templateName =
      bits.length > 0 ? bits.join(' · ') : fs.leadId ? `Lead ${fs.leadId}` : 'Application on file'
    steps.push({
      kind: 'form_submitted',
      label: 'Form submitted',
      templateName,
      submittedWhere: fs.submittedWhere || null,
      applicationStage: fs.applicationStage || null,
      courseLabel: fs.courseLabel || null,
      applicationNo: fs.applicationNo || null,
      leadId: fs.leadId || null,
      at: fs.at,
    })
  }

  steps.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime())
  return steps
}

// ── Build journey ──────────────────────────────────────────────────────────────
function buildJourney(docs) {
  const map = new Map()
  for (const doc of docs) {
    const name =
      (doc.timelineLabel && String(doc.timelineLabel).trim()) ||
      resolveWaTemplateName(doc) ||
      resolveWaTimelineDisplayName(doc) ||
      `WhatsApp · ${String(doc._id).slice(-8)}`
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

/** Vertical list: template sends from Interakt payloads, optional WhatsApp apply tap, then NPF/MBA form when present. */
function JourneyTimeline({ steps, isDark, formSubmissions, waApplyClick, waEventTotal }) {
  if (!steps?.length) return null
  const hasProgramForm = (formSubmissions?.length || 0) > 0
  const hasWaApply = !!waApplyClick
  const tplSteps = steps.filter((s) => s.kind === 'template_touch')
  return (
    <div className={`mx-auto max-w-lg rounded-2xl border p-5 text-center ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
      <h3 className={`text-sm font-semibold mb-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Their journey</h3>
      <p className={`text-[11px] mb-4 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
        Each WhatsApp row with a template name (sent, delivered, or read), then NPF application steps when present, then an apply-style WhatsApp tap if we have no program record yet.
        {typeof waEventTotal === 'number' && waEventTotal > 0 && (
          <span className="block mt-1 tabular-nums opacity-90">{waEventTotal} WhatsApp events loaded for this number.</span>
        )}
      </p>
      <ol className="mx-auto flex max-w-md flex-col items-center gap-6">
        {steps.map((s, i) => {
          const isForm = s.kind === 'form_submitted'
          const isWaApply = s.kind === 'wa_apply_click'
          const circle =
            isForm
              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900/30'
              : isWaApply
                ? 'bg-amber-500 text-white shadow-md shadow-amber-900/25'
                : isDark
                  ? 'border border-slate-600 bg-slate-800 text-slate-200'
                  : 'border border-slate-300 bg-white text-slate-700 shadow-sm'
          const statusColor =
            isForm ? 'text-emerald-500' : isWaApply ? 'text-amber-500' : isDark ? 'text-sky-400' : 'text-sky-700'
          return (
            <li key={`${s.kind}-${i}-${String(s.at)}`} className="flex w-full flex-col items-center border-b border-slate-200/80 pb-6 last:border-b-0 last:pb-0 dark:border-slate-700/80">
              <span className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${circle}`}>
                {i + 1}
              </span>
              <p className={`text-sm font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{s.templateName}</p>
              <p className={`mt-1 text-[12px] font-medium ${statusColor}`}>{s.label}</p>
              {isForm && s.submittedWhere && (
                <p className={`mt-1.5 max-w-sm text-[10px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Where: {s.submittedWhere}
                </p>
              )}
              {s.at && (
                <p className={`mt-1 text-[11px] tabular-nums ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{fmtTs(s.at)}</p>
              )}
            </li>
          )
        })}
      </ol>
      {!hasProgramForm && !hasWaApply && tplSteps.length > 0 && (
        <p className={`mt-2 text-[11px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
          No application in program data and no apply-style button tap found in this WhatsApp history for this number.
        </p>
      )}
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
          placeholder="Mobile number — e.g. 9876543210 or 919876543210"
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function WAUserJourney({ workspace, isDark }) {
  const ws = normalizeWAWorkspace(workspace)

  const [searchedPhone, setSearchedPhone] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [journey, setJourney]   = useState(null)
  const [timelineSteps, setTimelineSteps] = useState(null)
  const [formSubmissions, setFormSubmissions] = useState(null)
  const [waApplyClick, setWaApplyClick] = useState(null)
  const [waEventTotal, setWaEventTotal] = useState(null)

  const handleSearch = useCallback(async (phone) => {
    setLoading(true)
    setError(null)
    setJourney(null)
    setTimelineSteps(null)
    setFormSubmissions(null)
    setWaApplyClick(null)
    setWaEventTotal(null)
    setSearchedPhone(phone)
    try {
      const res = await fetch(
        `/api/wa-user-journey?phone=${encodeURIComponent(phone)}&workspace=${encodeURIComponent(ws)}`,
      )
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const docs = data.docs || []
      const fsList = Array.isArray(data.formSubmissions) ? data.formSubmissions : []
      const wa = data.waApplyClick ?? null
      setJourney(buildJourney(docs))
      setFormSubmissions(fsList)
      setWaApplyClick(wa)
      setWaEventTotal(typeof data.total === 'number' ? data.total : docs.length)
      setTimelineSteps(buildSimpleTimeline(docs, fsList, wa))
    } catch (err) {
      console.error('[WAUserJourney]', err)
      setError(err.message || 'Failed to load journey')
    } finally {
      setLoading(false)
    }
  }, [ws])

  return (
    <div className="space-y-5">
      {/* Header + search */}
      <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl`} style={{ background: isDark ? 'rgba(99,102,241,0.15)' : '#ede9fe' }}>
            🗺️
          </div>
          <div>
            <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>User journey</h2>
            <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Enter a mobile number to see template sends in order and form submission when it exists in program data.
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
        journey.length === 0 && (!timelineSteps || timelineSteps.length === 0) ? (
          <div className={`text-center py-16 rounded-2xl border border-dashed ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-base font-medium">No journey found</p>
            <p className="text-sm mt-1 opacity-70">No WhatsApp events for <span className="font-mono">{searchedPhone}</span> in this workspace (check number format).</p>
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
                  {journey.length > 0 ? (
                    <>
                      {journey.length} distinct template{journey.length !== 1 ? 's' : ''} in WhatsApp data
                      {journey[0]?.sentAt && <span> · First activity {fmtTs(journey[0].sentAt, true)}</span>}
                      {journey[journey.length - 1]?.sentAt && journey.length > 1 && (
                        <span> · Last {fmtTs(journey[journey.length - 1].sentAt, true)}</span>
                      )}
                    </>
                  ) : (
                    <span>No WhatsApp template rows for this number — timeline may still show program form data.</span>
                  )}
                </p>
              </div>
              {(formSubmissions?.length > 0 || waApplyClick || journey.some((e) => e.isFormSubmission)) && (
                <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-500/15 border border-green-500/30">
                  <span>🎓</span>
                  <span className="text-[11px] font-semibold text-green-400">
                    {formSubmissions?.length > 0
                      ? `Form on file${formSubmissions.length > 1 ? ` (${formSubmissions.length})` : ''}`
                      : waApplyClick
                        ? 'Apply tap (WA)'
                        : 'Applied (CTA)'}
                  </span>
                </div>
              )}
            </div>

            <JourneyTimeline
              steps={timelineSteps}
              isDark={isDark}
              formSubmissions={formSubmissions}
              waApplyClick={waApplyClick}
              waEventTotal={waEventTotal}
            />

            {journey.length > 0 && (!timelineSteps || timelineSteps.length === 0) && (
              <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                Send-by-send list could not be inferred from raw event types for this workspace.
              </p>
            )}
          </>
        )
      )}

      {/* Initial state */}
      {!loading && !journey && !error && (
        <div className={`text-center py-20 rounded-2xl border border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="text-5xl mb-4">🗺️</div>
          <p className={`text-base font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Search a number to see their journey</p>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Use 10 digits or include country code (e.g. 919876543210)</p>
        </div>
      )}
    </div>
  )
}
