'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { normalizeWAWorkspace } from '../../lib/waWorkspace'
import { maskPhone } from '../../lib/userManagement'
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

function extractClickButtonLabel(doc) {
  const primary = doc.button_text
  if (primary != null && String(primary).trim() !== '' && String(primary).trim() !== '[]') {
    return String(primary).trim()
  }
  const nested = doc?.data?.message?.button_text
  if (nested != null && String(nested).trim() !== '') return String(nested).trim()
  if (doc.raw_payload) {
    try {
      const rp = typeof doc.raw_payload === 'string' ? JSON.parse(doc.raw_payload) : doc.raw_payload
      const b = rp?.data?.message?.button_text
      if (b) return String(b).trim()
    } catch {
      /* ignore */
    }
  }
  return ''
}

function templateGroupKey(raw) {
  if (!raw || isJunkTemplateLabel(raw)) return ''
  return String(raw).replace(/_/g, ' ').trim().toLowerCase()
}

function humanizeTemplateTitle(raw) {
  if (!raw || isJunkTemplateLabel(raw)) return ''
  return String(raw).replace(/_/g, ' ').trim()
}

/**
 * Chronological journey: one block per template send with "Template sent",
 * Delivered / Read as colored badges (not separate steps), button taps listed, then form milestones.
 */
function buildSimpleTimeline(docs, formSubmissions, waApplyClick) {
  const sorted = [...(docs || [])].sort((a, b) => (extractDocTs(a) ?? 0) - (extractDocTs(b) ?? 0))

  const displayNameRaw = (doc) => {
    let s =
      (doc.timelineLabel && String(doc.timelineLabel).trim()) ||
      resolveWaTimelineDisplayName(doc) ||
      resolveWaTemplateName(doc) ||
      ''
    if (isJunkTemplateLabel(s)) s = ''
    return s.trim()
  }

  const clusters = []

  const lastClusterForKey = (groupKey) => {
    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i]
      if (c._groupKey === groupKey) return c
    }
    return null
  }

  const pushClickDeduped = (c, at, button) => {
    const btn = String(button || '').trim()
    if (!btn) return
    const t = new Date(at).getTime()
    const dup = c.clicks.some(
      (x) => String(x.button || '').trim() === btn && Math.abs(new Date(x.at).getTime() - t) < 3000,
    )
    if (!dup) c.clicks.push({ at, button: btn })
  }

  for (const doc of sorted) {
    const st = getEventStage(doc).toLowerCase()
    const ts = doc.event_timestamp || doc.createdAt
    if (extractDocTs(doc) == null) continue

    if (st === 'clicked') {
      const btn = extractClickButtonLabel(doc)
      if (!btn) continue
      let raw = displayNameRaw(doc)
      if (!raw) raw = resolveWaTemplateName(doc) || ''
      if (isJunkTemplateLabel(raw)) raw = ''
      const groupKey = raw ? templateGroupKey(raw) : '__bare__'
      const title = raw ? humanizeTemplateTitle(raw) : 'WhatsApp'
      let c = lastClusterForKey(groupKey)
      if (!c) {
        c = {
          kind: 'template_activity',
          _groupKey: groupKey,
          templateName: title,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          clicks: [],
        }
        clusters.push(c)
      }
      pushClickDeduped(c, ts, btn)
      continue
    }

    if (st !== 'sent' && st !== 'delivered' && st !== 'read') continue

    const raw = displayNameRaw(doc)
    if (!raw) continue
    const groupKey = templateGroupKey(raw)
    const title = humanizeTemplateTitle(raw)

    if (st === 'sent') {
      clusters.push({
        kind: 'template_activity',
        _groupKey: groupKey,
        templateName: title,
        sentAt: ts,
        deliveredAt: null,
        readAt: null,
        clicks: [],
      })
      continue
    }

    let c = lastClusterForKey(groupKey)
    if (!c) {
      c = {
        kind: 'template_activity',
        _groupKey: groupKey,
        templateName: title,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        clicks: [],
      }
      clusters.push(c)
    }
    if (st === 'delivered' && !c.deliveredAt) c.deliveredAt = ts
    if (st === 'read' && !c.readAt) c.readAt = ts
  }

  for (const c of clusters) {
    c.clicks.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }

  const stripInternal = (c) => {
    const { _groupKey, ...rest } = c
    const anchor =
      c.sentAt || c.deliveredAt || c.readAt || (c.clicks[0] && c.clicks[0].at) || null
    return { ...rest, at: anchor }
  }

  let activitySteps = clusters
    .map(stripInternal)
    .filter((s) => s.sentAt || s.deliveredAt || s.readAt || (s.clicks && s.clicks.length > 0))

  if (activitySteps.length === 0) {
    const firstByTpl = new Map()
    for (const doc of sorted) {
      const st = getEventStage(doc).toLowerCase()
      if (st !== 'sent' && st !== 'delivered' && st !== 'read') continue
      const raw = displayNameRaw(doc)
      if (!raw) continue
      const tms = extractDocTs(doc)
      if (tms == null) continue
      const gk = templateGroupKey(raw)
      const prev = firstByTpl.get(gk)
      if (prev == null || tms < prev.tms) firstByTpl.set(gk, { tms, ts: doc.event_timestamp || doc.createdAt, raw })
    }
    for (const [, v] of firstByTpl) {
      activitySteps.push({
        kind: 'template_activity',
        templateName: humanizeTemplateTitle(v.raw),
        sentAt: v.ts,
        deliveredAt: null,
        readAt: null,
        clicks: [],
        at: v.ts,
      })
    }
  }

  activitySteps.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime())

  const steps = [...activitySteps]

  if (waApplyClick?.at) {
    const applyTs = new Date(waApplyClick.at).getTime()
    const applyBtn = (waApplyClick.buttonText || '').trim()
    const dup = steps.some(
      (s) =>
        s.kind === 'template_activity' &&
        s.clicks?.some(
          (clk) =>
            Math.abs(new Date(clk.at).getTime() - applyTs) < 5000 &&
            String(clk.button || '').trim() === applyBtn,
        ),
    )
    if (!dup && applyBtn) {
      steps.push({
        kind: 'wa_apply_click',
        label: 'Apply / enquiry (WhatsApp)',
        templateName: applyBtn,
        at: waApplyClick.at,
      })
    }
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

/** Vertical list: grouped template (sent + colored delivered/read + button taps), then form milestones. */
function JourneyTimeline({ steps, isDark, formSubmissions, waApplyClick, waEventTotal }) {
  if (!steps?.length) return null
  const hasProgramForm = (formSubmissions?.length || 0) > 0
  const hasWaApply = !!waApplyClick
  const tplSteps = steps.filter((s) => s.kind === 'template_activity')
  const hasAnyTemplateClick = tplSteps.some((s) => s.clicks && s.clicks.length > 0)

  const deliveredPill = isDark
    ? 'inline-flex items-center gap-1 rounded-lg border border-sky-600/60 bg-sky-950/50 px-2 py-1 text-[10px] font-medium text-sky-200'
    : 'inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-900'
  const readPill = isDark
    ? 'inline-flex items-center gap-1 rounded-lg border border-violet-600/60 bg-violet-950/45 px-2 py-1 text-[10px] font-medium text-violet-100'
    : 'inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-900'
  const clickPill = isDark
    ? 'inline-block max-w-full truncate rounded-lg border border-amber-700/50 bg-amber-950/40 px-2 py-1 text-[10px] font-medium text-amber-100'
    : 'inline-block max-w-full truncate rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-950'

  return (
    <div className={`mx-auto max-w-lg rounded-2xl border p-5 text-center ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
      <h3 className={`text-sm font-semibold mb-1 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Their journey</h3>
      <p className={`text-[11px] mb-4 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
        Each template shows when it was sent; delivered and read appear as colored tags. Any button tap on that template is listed below it.
        {typeof waEventTotal === 'number' && waEventTotal > 0 && (
          <span className="block mt-1 tabular-nums opacity-90">{waEventTotal} WhatsApp events loaded for this number.</span>
        )}
      </p>
      <ol className="mx-auto flex max-w-md flex-col items-center gap-6">
        {steps.map((s, i) => {
          const isForm = s.kind === 'form_submitted'
          const isWaApply = s.kind === 'wa_apply_click'
          const isTpl = s.kind === 'template_activity'

          const circle = isForm
            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900/30'
            : isWaApply
              ? 'bg-amber-500 text-white shadow-md shadow-amber-900/25'
              : isDark
                ? 'border border-indigo-500/50 bg-indigo-950/40 text-indigo-100'
                : 'border border-indigo-200 bg-indigo-50 text-indigo-800'

          const statusColor = isForm
            ? 'text-emerald-500'
            : isWaApply
              ? 'text-amber-500'
              : isTpl
                ? isDark
                  ? 'text-slate-300'
                  : 'text-slate-700'
                : isDark
                  ? 'text-sky-400'
                  : 'text-sky-700'

          const rowKey = `${s.kind}-${i}-${s.templateName || ''}-${String(s.at || '')}`

          if (isTpl) {
            return (
              <li
                key={rowKey}
                className="flex w-full flex-col items-center border-b border-slate-200/80 pb-6 last:border-b-0 last:pb-0 dark:border-slate-700/80"
              >
                <span className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${circle}`}>
                  {i + 1}
                </span>
                <p className={`text-sm font-semibold leading-snug ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{s.templateName}</p>
                {s.sentAt && (
                  <p className={`mt-1.5 text-[12px] font-medium ${statusColor}`}>
                    Template sent
                    <span className={`mt-0.5 block text-[11px] font-normal tabular-nums ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      {fmtTs(s.sentAt)}
                    </span>
                  </p>
                )}
                {!s.sentAt && (s.deliveredAt || s.readAt || (s.clicks && s.clicks.length > 0)) && (
                  <p className={`mt-1 text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    {s.deliveredAt || s.readAt ? 'Status updates' : 'Interactions'}
                  </p>
                )}
                {(s.deliveredAt || s.readAt) && (
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                    {s.deliveredAt && (
                      <span className={deliveredPill} title={fmtTs(s.deliveredAt)}>
                        <span className="font-semibold">Delivered</span>
                        <span className="tabular-nums opacity-90">{fmtTs(s.deliveredAt)}</span>
                      </span>
                    )}
                    {s.readAt && (
                      <span className={readPill} title={fmtTs(s.readAt)}>
                        <span className="font-semibold">Read</span>
                        <span className="tabular-nums opacity-90">{fmtTs(s.readAt)}</span>
                      </span>
                    )}
                  </div>
                )}
                {s.clicks && s.clicks.length > 0 && (
                  <div className={`mt-3 w-full max-w-sm text-left ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <p className={`mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      Button taps
                    </p>
                    <ul className="space-y-2">
                      {s.clicks.map((clk, j) => (
                        <li key={`${rowKey}-clk-${j}`} className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                          <span className={clickPill} title={clk.button}>
                            {clk.button}
                          </span>
                          <span className={`shrink-0 text-[10px] tabular-nums ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            {fmtTs(clk.at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!s.sentAt && !s.deliveredAt && !s.readAt && (!s.clicks || s.clicks.length === 0) && s.at && (
                  <p className={`mt-1 text-[11px] tabular-nums ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{fmtTs(s.at)}</p>
                )}
              </li>
            )
          }

          return (
            <li
              key={rowKey}
              className="flex w-full flex-col items-center border-b border-slate-200/80 pb-6 last:border-b-0 last:pb-0 dark:border-slate-700/80"
            >
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
      {!hasProgramForm && !hasWaApply && tplSteps.length > 0 && !hasAnyTemplateClick && (
        <p className={`mt-2 text-[11px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
          No application in program data and no button taps recorded on these templates in this WhatsApp history.
        </p>
      )}
    </div>
  )
}

function useWaUserJourneyData(phoneDigits, workspace) {
  const ws = normalizeWAWorkspace(workspace)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [journey, setJourney] = useState(null)
  const [timelineSteps, setTimelineSteps] = useState(null)
  const [formSubmissions, setFormSubmissions] = useState(null)
  const [waApplyClick, setWaApplyClick] = useState(null)
  const [waEventTotal, setWaEventTotal] = useState(null)

  useEffect(() => {
    const digits = phoneDigits == null ? '' : String(phoneDigits).replace(/\D/g, '')
    if (digits.length < 10) {
      setLoading(false)
      setError(null)
      setJourney(null)
      setTimelineSteps(null)
      setFormSubmissions(null)
      setWaApplyClick(null)
      setWaEventTotal(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setJourney(null)
    setTimelineSteps(null)
    setFormSubmissions(null)
    setWaApplyClick(null)
    setWaEventTotal(null)

    ;(async () => {
      try {
        const res = await fetch(
          `/api/wa-user-journey?phone=${encodeURIComponent(digits)}&workspace=${encodeURIComponent(ws)}`,
        )
        const data = await res.json()
        if (cancelled) return
        if (data.error) throw new Error(data.error)
        const docs = data.docs || []
        const fsList = Array.isArray(data.formSubmissions) ? data.formSubmissions : []
        const wa = data.waApplyClick ?? null
        setJourney(buildJourney(docs))
        setFormSubmissions(fsList)
        setWaApplyClick(wa)
        setWaEventTotal(typeof data.total === 'number' ? data.total : docs.length)
        setTimelineSteps(buildSimpleTimeline(docs, fsList, wa))
        setError(null)
      } catch (err) {
        if (!cancelled) {
          console.error('[WAUserJourney]', err)
          setError(err.message || 'Failed to load journey')
          setJourney(null)
          setTimelineSteps(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [phoneDigits, ws])

  return { loading, error, journey, timelineSteps, formSubmissions, waApplyClick, waEventTotal }
}

/** Shared journey output: loading, error, empty hint, or timeline + chip. */
function JourneyResultsSection({
  loading,
  error,
  phoneDigits,
  displayPhoneChip,
  avatarSuffix,
  journey,
  timelineSteps,
  formSubmissions,
  waApplyClick,
  waEventTotal,
  isDark,
  showSearchHint,
}) {
  return (
    <>
      {loading && (
        <div className={`flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Loading journey for <span className="font-mono">{displayPhoneChip}</span>…
          </p>
        </div>
      )}

      {!loading && error && (
        <div className={`px-4 py-3 rounded-xl border text-sm ${isDark ? 'bg-rose-900/20 border-rose-700 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>{error}</div>
      )}

      {!loading && journey != null && (
        journey.length === 0 && (!timelineSteps || timelineSteps.length === 0) ? (
          <div className={`text-center py-16 rounded-2xl border border-dashed ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-base font-medium">No journey found</p>
            <p className="text-sm mt-1 opacity-70">No WhatsApp events for <span className="font-mono">{displayPhoneChip}</span> in this workspace (check number format).</p>
          </div>
        ) : (
          <>
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                {avatarSuffix}
              </div>
              <div>
                <p className={`text-sm font-semibold font-mono ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{displayPhoneChip}</p>
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

      {showSearchHint && !loading && journey == null && !error && (
        <div className={`text-center py-20 rounded-2xl border border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="text-5xl mb-4">🗺️</div>
          <p className={`text-base font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Search a number to see their journey</p>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Use 10 digits or include country code (e.g. 919876543210)</p>
        </div>
      )}
    </>
  )
}

/**
 * Load and show one user’s journey (same data as User journey search).
 * Use from Application form when a row is selected.
 */
export function WAUserJourneyByPhone({ workspace, isDark, phone, dataMasked = false, onClose }) {
  const digits = useMemo(() => {
    const d = String(phone ?? '').replace(/\D/g, '')
    return d.length >= 10 ? d : null
  }, [phone])

  const { loading, error, journey, timelineSteps, formSubmissions, waApplyClick, waEventTotal } = useWaUserJourneyData(
    digits,
    workspace,
  )

  const displayPhoneChip = useMemo(() => {
    if (!digits) return ''
    if (dataMasked && phone) return maskPhone(phone)
    return `+${digits}`
  }, [dataMasked, digits, phone])

  const avatarSuffix = useMemo(() => {
    if (!digits) return '?'
    return digits.slice(-2)
  }, [digits])

  if (!digits) return null

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${isDark ? 'border-slate-700/50 bg-slate-900/40' : 'border-slate-200 bg-white'}`}
      id="wa-application-journey-panel"
    >
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
        <div>
          <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Their journey</h3>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            WhatsApp template timeline and form milestones for this applicant.
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border shrink-0 ${
              isDark
                ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Close
          </button>
        )}
      </div>
      <div className="p-4 space-y-4">
        <JourneyResultsSection
          loading={loading}
          error={error}
          phoneDigits={digits}
          displayPhoneChip={displayPhoneChip}
          avatarSuffix={avatarSuffix}
          journey={journey}
          timelineSteps={timelineSteps}
          formSubmissions={formSubmissions}
          waApplyClick={waApplyClick}
          waEventTotal={waEventTotal}
          isDark={isDark}
          showSearchHint={false}
        />
      </div>
    </div>
  )
}

// ── Search bar ─────────────────────────────────────────────────────────────────
function SearchBar({ onSearch, onClearSearch, loading, isDark }) {
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
        {val && (
          <button
            type="button"
            onClick={() => {
              setVal('')
              ref.current?.focus()
              onClearSearch?.()
            }}
            className={`text-xs ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'}`}
          >
            ✕
          </button>
        )}
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

// ── Main component (standalone search page; Application form uses WAUserJourneyByPhone) ──
export default function WAUserJourney({ workspace, isDark }) {
  const ws = normalizeWAWorkspace(workspace)
  const [searchedPhone, setSearchedPhone] = useState(null)
  const { loading, error, journey, timelineSteps, formSubmissions, waApplyClick, waEventTotal } = useWaUserJourneyData(
    searchedPhone,
    ws,
  )

  const displayPhoneChip = searchedPhone ? `+${searchedPhone}` : ''
  const avatarSuffix = searchedPhone ? searchedPhone.slice(-2) : '?'
  const showSearchHint = !searchedPhone

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl`} style={{ background: isDark ? 'rgba(99,102,241,0.15)' : '#ede9fe' }}>
            🗺️
          </div>
          <div>
            <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>User journey</h2>
            <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Enter a mobile number to see template sends in order and form submission when it exists in program data. You can
              also open an applicant from <strong className="font-medium">Application form</strong> to see their journey there.
            </p>
          </div>
        </div>
        <SearchBar
          onSearch={(phone) => setSearchedPhone(phone)}
          onClearSearch={() => setSearchedPhone(null)}
          loading={loading}
          isDark={isDark}
        />
      </div>

      <JourneyResultsSection
        loading={loading}
        error={error}
        phoneDigits={searchedPhone}
        displayPhoneChip={displayPhoneChip}
        avatarSuffix={avatarSuffix}
        journey={journey}
        timelineSteps={timelineSteps}
        formSubmissions={formSubmissions}
        waApplyClick={waApplyClick}
        waEventTotal={waEventTotal}
        isDark={isDark}
        showSearchHint={showSearchHint}
      />
    </div>
  )
}
