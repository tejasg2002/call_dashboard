'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'

const EVENT_LABELS = {
  message_api_sent:      'Message Sent',
  message_api_delivered: 'Message Delivered',
  message_api_read:      'Message Read',
  message_api_clicked:   'Message Clicked',
  message_api_failed:    'Message Failed',
  message_status_sent:      'Message Sent',
  message_status_delivered: 'Message Delivered',
  message_status_read:      'Message Read',
  message_status_clicked:   'Message Clicked',
  message_status_failed:    'Message Failed',
}

function friendlyEvent(raw) {
  if (!raw) return raw
  if (EVENT_LABELS[raw]) return EVENT_LABELS[raw]
  return raw
    .replace(/^message_(api|status)_/, 'Message ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function optionLabel(s, max = 52) {
  const t = String(s ?? '')
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function IconStage({ className = 'w-4 h-4' }) {
  return (
    <svg className={`shrink-0 opacity-80 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function IconSource({ className = 'w-4 h-4' }) {
  return (
    <svg className={`shrink-0 opacity-80 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.621l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  )
}

function FilterField({ label, children, isDark, className = '' }) {
  const labelClass =
    'block text-[10px] font-medium leading-tight mb-0.5 truncate ' +
    (isDark ? 'text-slate-500' : 'text-slate-500')
  return (
    <div className={`flex flex-col min-w-0 shrink-0 ${className}`}>
      <label className={labelClass}>{label}</label>
      {children}
    </div>
  )
}

/**
 * Pill-style multi-select: icon + summary + chevron; popover portaled to body with fixed coords
 * so parent `overflow-x-auto` does not clip the panel.
 */
function PillMultiFilter({
  filterTitle,
  options,
  picked,
  onPickedChange,
  disabled,
  isDark,
  icon,
  loadingLabel,
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 280 })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const pickedArr = picked ?? []

  const updateCoords = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelW = Math.min(320, Math.max(220, r.width))
    let left = r.left
    if (left + panelW > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - panelW - 10)
    }
    setCoords({ top: r.bottom + 8, left, width: panelW })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updateCoords()
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) return
    window.addEventListener('resize', updateCoords)
    window.addEventListener('scroll', updateCoords, true)
    return () => {
      window.removeEventListener('resize', updateCoords)
      window.removeEventListener('scroll', updateCoords, true)
    }
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e) {
      const t = triggerRef.current
      const p = panelRef.current
      if (t?.contains(e.target) || p?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function toggleValue(v) {
    const next = pickedArr.includes(v)
      ? pickedArr.filter((x) => x !== v)
      : [...pickedArr, v]
    onPickedChange(next)
  }

  const summary =
    pickedArr.length === 0
      ? loadingLabel
      : pickedArr.length === 1
        ? optionLabel(pickedArr[0], 28)
        : `${pickedArr.length} selected`

  const pillBase =
    'w-full min-h-[38px] rounded-full border flex items-center gap-2 px-3.5 py-2 text-left text-xs font-medium transition-colors disabled:opacity-45 disabled:pointer-events-none'
  const pillLight =
    'bg-slate-50 border-slate-200/90 text-slate-800 hover:bg-slate-100 hover:border-slate-300 shadow-sm'
  const pillDark =
    'bg-slate-800/80 border-slate-600 text-slate-100 hover:bg-slate-800 hover:border-slate-500'
  const pillOpen = isDark ? 'ring-2 ring-brand-500/40 border-brand-500/50' : 'ring-2 ring-brand-400/35 border-brand-300'

  const panelShell = isDark
    ? 'bg-slate-900 border border-slate-600 shadow-2xl shadow-black/40'
    : 'bg-white border border-slate-200/90 shadow-2xl shadow-slate-400/20'

  const maxH =
    typeof window !== 'undefined'
      ? Math.max(160, Math.min(360, window.innerHeight - coords.top - 16))
      : 280

  const panelContent = open && (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: coords.width,
        zIndex: 10050,
        maxHeight: maxH,
      }}
      className={`flex flex-col rounded-xl py-2 overflow-hidden ${panelShell}`}
      role="listbox"
      aria-multiselectable="true"
    >
      <div
        className={`shrink-0 px-3 pb-2 mb-1 border-b text-[10px] font-semibold uppercase tracking-wider ${
          isDark ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'
        }`}
      >
        {filterTitle}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1">
        {options.length === 0 ? (
          <div className={`px-3 py-3 text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No options</div>
        ) : (
          options.map((s) => (
            <label
              key={s}
              className={`flex items-start gap-3 mx-1 px-2 py-2 rounded-lg cursor-pointer text-[12px] leading-snug ${
                isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-400 text-brand-600 focus:ring-brand-500 shrink-0"
                checked={pickedArr.includes(s)}
                onChange={() => toggleValue(s)}
              />
              <span className="break-words min-w-0" title={s}>
                {optionLabel(s, 72)}
              </span>
            </label>
          ))
        )}
      </div>
      {pickedArr.length > 0 && (
        <div className={`shrink-0 mt-1 mx-2 pt-2 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <button
            type="button"
            className={`w-full text-left text-[11px] font-medium py-1.5 px-2 rounded-md ${
              isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
            onClick={() => onPickedChange([])}
          >
            Clear {filterTitle.toLowerCase()}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="relative min-w-0 w-full max-w-[13rem]">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          const el = triggerRef.current
          if (el && typeof window !== 'undefined') {
            const r = el.getBoundingClientRect()
            const panelW = Math.min(320, Math.max(220, r.width))
            let left = r.left
            if (left + panelW > window.innerWidth - 10) {
              left = Math.max(10, window.innerWidth - panelW - 10)
            }
            setCoords({ top: r.bottom + 8, left, width: panelW })
          }
          setOpen(true)
        }}
        className={`${pillBase} ${isDark ? pillDark : pillLight} ${open ? pillOpen : ''}`}
        title={pickedArr.length ? pickedArr.join(' · ') : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {icon}
        <span className={`truncate min-w-0 flex-1 ${pickedArr.length === 0 ? (isDark ? 'text-slate-400' : 'text-slate-500') : ''}`}>
          {summary}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {typeof document !== 'undefined' && panelContent
        ? createPortal(panelContent, document.body)
        : null}
    </div>
  )
}

/**
 * WAFilters — horizontal filter row (scrolls on small screens).
 */
export default function WAFilters({
  filters,
  setFilters,
  options,
  theme,
  onApply,
  leadFilterOpts = null,
  leadFilterLoading = false,
  hasLeadFilter = false,
}) {
  const isDark = theme === 'dark'

  const inputClass = `w-full rounded-md border px-2 py-1.5 text-xs min-h-[34px] ${
    isDark
      ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-400'
      : 'bg-white border-slate-200 text-slate-900'
  }`

  const optStages = leadFilterOpts?.leadStages ?? []
  const optSources = leadFilterOpts?.sources ?? []
  const pickedStages = filters.pickedLeadStages ?? []
  const pickedSrcs = filters.pickedSources ?? []
  const isLeadActive = pickedStages.length > 0 || pickedSrcs.length > 0

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200 shadow-sm'
      }`}
    >
      <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-0.5">
        <div className={`flex flex-col justify-end shrink-0 pr-2 mr-0.5 border-r min-h-[34px] ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold whitespace-nowrap ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              Filters
            </span>
            {isLeadActive && (
              <span
                className={`inline-flex h-1.5 w-1.5 rounded-full shrink-0 ${isDark ? 'bg-brand-400' : 'bg-brand-600'}`}
                title="Lead filter active"
              />
            )}
            {leadFilterLoading && hasLeadFilter && (
              <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin opacity-60" />
            )}
          </div>
        </div>

        <FilterField label="Template" isDark className="w-[7.5rem] sm:w-[8.5rem]">
          <select
            value={filters.templateName}
            onChange={(e) => setFilters((f) => ({ ...f, templateName: e.target.value }))}
            className={inputClass}
          >
            <option value="">All</option>
            {[...new Set(options.templateNames || [])].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Event" isDark className="w-[6.5rem] sm:w-[7.5rem]">
          <select
            value={filters.eventType}
            onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}
            className={inputClass}
          >
            <option value="">All</option>
            {[...new Set(options.eventTypes || [])].map((e) => (
              <option key={e} value={e}>{friendlyEvent(e)}</option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Start" isDark className="w-[8.75rem]">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            className={inputClass}
          />
        </FilterField>

        <FilterField label="End" isDark className="w-[8.75rem]">
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className={inputClass}
          />
        </FilterField>

        {hasLeadFilter && (
          <>
            <FilterField label="Lead stage" isDark className="min-w-0 w-[10.5rem] sm:w-[11.5rem]">
              <PillMultiFilter
                filterTitle="Lead stage"
                options={optStages}
                picked={pickedStages}
                onPickedChange={(next) => setFilters((f) => ({ ...f, pickedLeadStages: next }))}
                disabled={leadFilterLoading}
                isDark={isDark}
                icon={<IconStage />}
                loadingLabel={leadFilterLoading ? 'Loading…' : 'Any stage'}
              />
            </FilterField>

            <FilterField label="Source" isDark className="min-w-0 w-[10.5rem] sm:w-[12rem]">
              <PillMultiFilter
                filterTitle="Source"
                options={optSources}
                picked={pickedSrcs}
                onPickedChange={(next) => setFilters((f) => ({ ...f, pickedSources: next }))}
                disabled={leadFilterLoading}
                isDark={isDark}
                icon={<IconSource />}
                loadingLabel={leadFilterLoading ? 'Loading…' : 'Any source'}
              />
            </FilterField>
          </>
        )}

        <div
          className={`flex items-center gap-1 shrink-0 ml-auto pl-2 border-l sticky right-0 z-10 ${
            isDark ? 'border-slate-700 bg-slate-800/95' : 'border-slate-200 bg-white'
          }`}
        >
          {isLeadActive && (
            <button
              type="button"
              onClick={() => {
                onApply?.({ pickedLeadStages: [], pickedSources: [] })
              }}
              className={`whitespace-nowrap px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                isDark
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              Clear lead
            </button>
          )}
          <button
            type="button"
            onClick={() => onApply?.()}
            className={`whitespace-nowrap px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
              isDark
                ? 'bg-brand-600 hover:bg-brand-500 text-white'
                : 'bg-brand-600 hover:bg-brand-700 text-white'
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}
