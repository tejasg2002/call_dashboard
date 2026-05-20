'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

/** Source dropdown (MBA: top-level `source` on Interakt after NPF backfill). */
export const SHOW_SOURCE_FILTER = true

/** Lead stage filter (on when source is hidden). */
export const SHOW_LEAD_STAGE_FILTER = true

/** City / State from backfilled Interakt `City` / `State` fields (MBA). */
export const SHOW_CITY_FILTER = true
export const SHOW_STATE_FILTER = true

/** Temporary: hide template & event dropdowns; date + lead stage only. Set true to restore. */
export const SHOW_TEMPLATE_EVENT_FILTERS = false

const EVENT_LABELS = {
  message_api_sent: 'Message Sent',
  message_api_delivered: 'Message Delivered',
  message_api_read: 'Message Read',
  message_api_clicked: 'Message Clicked',
  message_api_failed: 'Message Failed',
  message_status_sent: 'Message Sent',
  message_status_delivered: 'Message Delivered',
  message_status_read: 'Message Read',
  message_status_clicked: 'Message Clicked',
  message_status_failed: 'Message Failed',
}

const FILTER_HINTS = {
  leadStage: 'Callback stage from WhatsApp (e.g. form submitted, payment link).',
  source: 'Traffic channel from NPF / Interakt (e.g. Google, Meta).',
  state: 'Lead state from registration data.',
  city: 'Lead city from registration data.',
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
    <svg className={`shrink-0 opacity-70 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  )
}

function IconSource({ className = 'w-4 h-4' }) {
  return (
    <svg className={`shrink-0 opacity-70 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.621l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  )
}

function IconCity({ className = 'w-4 h-4' }) {
  return (
    <svg className={`shrink-0 opacity-70 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M4.5 9.75V6.75a2.25 2.25 0 012.25-2.25h10.5A2.25 2.25 0 0119.5 6.75v3M4.5 21V9.75" />
    </svg>
  )
}

function IconState({ className = 'w-4 h-4' }) {
  return (
    <svg className={`shrink-0 opacity-70 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V4.125A2.625 2.625 0 0111.625 1.5h.75a2.625 2.625 0 012.625 2.625V6.75m-9 0h10.5M3.75 21h16.5M5.25 9.75h13.5" />
    </svg>
  )
}

function FilterChip({ label, onRemove, isDark }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 max-w-[14rem] pl-2 pr-1 py-0.5 rounded-md text-[11px] font-medium border',
        isDark ? 'bg-brand-900/30 border-brand-700/50 text-brand-200' : 'bg-brand-50 border-brand-200 text-brand-800',
      )}
      title={label}
    >
      <span className="truncate">{optionLabel(label, 36)}</span>
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          'shrink-0 p-0.5 rounded hover:opacity-80',
          isDark ? 'text-brand-300 hover:bg-brand-800/50' : 'text-brand-600 hover:bg-brand-100',
        )}
        aria-label={`Remove ${label}`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  )
}

/**
 * Searchable multi-select dropdown (portaled panel).
 */
function SearchableMultiSelect({
  id,
  label,
  hint,
  options,
  picked,
  onPickedChange,
  disabled,
  isDark,
  icon,
  emptyLabel = 'All',
  loading = false,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 300 })
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const searchRef = useRef(null)
  const pickedArr = picked ?? []

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => String(o).toLowerCase().includes(q))
  }, [options, search])

  const updateCoords = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelW = Math.min(360, Math.max(260, r.width))
    let left = r.left
    if (left + panelW > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - panelW - 12)
    }
    setCoords({ top: r.bottom + 6, left, width: panelW })
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
    const t = setTimeout(() => searchRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleMouseDown(e) {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
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
    const next = pickedArr.includes(v) ? pickedArr.filter((x) => x !== v) : [...pickedArr, v]
    onPickedChange(next)
  }

  function selectAllFiltered() {
    const merged = new Set([...pickedArr, ...filteredOptions])
    onPickedChange([...merged])
  }

  const summary =
    loading
      ? 'Loading…'
      : pickedArr.length === 0
        ? emptyLabel
        : pickedArr.length === 1
          ? optionLabel(pickedArr[0], 32)
          : `${pickedArr.length} selected`

  const maxH =
    typeof window !== 'undefined'
      ? Math.max(200, Math.min(400, window.innerHeight - coords.top - 20))
      : 320

  const panelContent = open && (
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 10050, maxHeight: maxH }}
      className={cn(
        'flex flex-col rounded-lg border shadow-xl overflow-hidden',
        isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-slate-200',
      )}
      role="listbox"
      aria-multiselectable="true"
      aria-labelledby={id}
    >
      <div className={cn('shrink-0 p-2 border-b', isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-100 bg-slate-50/80')}>
        <div className="relative">
          <svg
            className={cn('absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5', isDark ? 'text-slate-500' : 'text-slate-400')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className={cn(
              'w-full pl-8 pr-2 py-1.5 rounded-md text-xs border focus:outline-none focus:ring-2 focus:ring-brand-500/30',
              isDark
                ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-500'
                : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400',
            )}
          />
        </div>
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className={cn('text-[10px]', isDark ? 'text-slate-500' : 'text-slate-400')}>
            {filteredOptions.length} of {options.length}
            {pickedArr.length > 0 && ` · ${pickedArr.length} selected`}
          </span>
          <div className="flex gap-2 shrink-0">
            {filteredOptions.length > 0 && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className={cn('text-[10px] font-medium', isDark ? 'text-brand-400 hover:text-brand-300' : 'text-brand-600 hover:text-brand-700')}
              >
                Select shown
              </button>
            )}
            {pickedArr.length > 0 && (
              <button
                type="button"
                onClick={() => onPickedChange([])}
                className={cn('text-[10px] font-medium', isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800')}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {options.length === 0 ? (
          <p className={cn('px-3 py-4 text-xs text-center', isDark ? 'text-slate-500' : 'text-slate-400')}>
            {loading ? 'Loading options…' : 'No options available'}
          </p>
        ) : filteredOptions.length === 0 ? (
          <p className={cn('px-3 py-4 text-xs text-center', isDark ? 'text-slate-500' : 'text-slate-400')}>
            No match for &ldquo;{search}&rdquo;
          </p>
        ) : (
          filteredOptions.map((s) => (
            <label
              key={s}
              className={cn(
                'flex items-start gap-2.5 mx-1 px-2 py-2 rounded-md cursor-pointer text-xs leading-snug',
                isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50',
                pickedArr.includes(s) && (isDark ? 'bg-brand-900/20' : 'bg-brand-50/80'),
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 shrink-0"
                checked={pickedArr.includes(s)}
                onChange={() => toggleValue(s)}
              />
              <span className="break-words min-w-0" title={s}>
                {s}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="min-w-0 flex flex-col gap-1">
      <label htmlFor={id} className={cn('text-xs font-semibold', isDark ? 'text-slate-300' : 'text-slate-700')}>
        {label}
      </label>
      {hint && (
        <p className={cn('text-[10px] leading-snug -mt-0.5', isDark ? 'text-slate-500' : 'text-slate-400')}>{hint}</p>
      )}
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled || loading}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          updateCoords()
          setOpen(true)
        }}
        className={cn(
          'w-full min-h-[36px] rounded-lg border flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
          'disabled:opacity-50 disabled:pointer-events-none',
          isDark
            ? 'bg-slate-800/80 border-slate-600 text-slate-100 hover:border-slate-500'
            : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300',
          open && 'ring-2 ring-brand-500/25 border-brand-400',
          pickedArr.length > 0 && (isDark ? 'border-brand-600/60' : 'border-brand-300'),
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={pickedArr.length ? pickedArr.join(', ') : undefined}
      >
        <span className={cn('shrink-0', isDark ? 'text-slate-400' : 'text-slate-500')}>{icon}</span>
        <span
          className={cn(
            'truncate flex-1 font-medium',
            pickedArr.length === 0 && (isDark ? 'text-slate-500 font-normal' : 'text-slate-400 font-normal'),
          )}
        >
          {summary}
        </span>
        <svg
          className={cn('w-4 h-4 shrink-0 transition-transform', open && 'rotate-180', isDark ? 'text-slate-500' : 'text-slate-400')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {typeof document !== 'undefined' && panelContent ? createPortal(panelContent, document.body) : null}
    </div>
  )
}

/**
 * WA dashboard filters — grouped layout with search in lead dropdowns.
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

  const inputClass = cn(
    'w-full rounded-lg border px-2.5 py-2 text-xs min-h-[36px]',
    isDark
      ? 'bg-slate-800 border-slate-600 text-slate-100'
      : 'bg-white border-slate-200 text-slate-900',
  )

  const optStages = leadFilterOpts?.leadStages ?? []
  const optSources = leadFilterOpts?.sources ?? []
  const optCities = leadFilterOpts?.cities ?? []
  const optStates = leadFilterOpts?.states ?? []
  const pickedStages = filters.pickedLeadStages ?? []
  const pickedSrcs = filters.pickedSources ?? []
  const pickedCities = filters.pickedCities ?? []
  const pickedStates = filters.pickedStates ?? []

  const activeChips = useMemo(() => {
    const chips = []
    if (SHOW_LEAD_STAGE_FILTER) {
      for (const v of pickedStages) chips.push({ key: `stage-${v}`, label: v, group: 'stage', value: v })
    }
    if (SHOW_SOURCE_FILTER) {
      for (const v of pickedSrcs) chips.push({ key: `src-${v}`, label: v, group: 'source', value: v })
    }
    if (SHOW_STATE_FILTER) {
      for (const v of pickedStates) chips.push({ key: `state-${v}`, label: v, group: 'state', value: v })
    }
    if (SHOW_CITY_FILTER) {
      for (const v of pickedCities) chips.push({ key: `city-${v}`, label: v, group: 'city', value: v })
    }
    return chips
  }, [pickedStages, pickedSrcs, pickedStates, pickedCities])

  const isLeadActive = activeChips.length > 0
  const hasDateRange = !!(filters.startDate || filters.endDate)
  const hasTemplateEvent =
    SHOW_TEMPLATE_EVENT_FILTERS && !!(filters.templateName || filters.eventType)
  const isInUse = hasDateRange || isLeadActive || hasTemplateEvent

  const [expanded, setExpanded] = useState(false)
  const prevInUseRef = useRef(isInUse)

  useEffect(() => {
    if (isInUse && !prevInUseRef.current) setExpanded(true)
    if (!isInUse) setExpanded(false)
    prevInUseRef.current = isInUse
  }, [isInUse])

  const filterSummary = useMemo(() => {
    const parts = []
    if (hasDateRange) {
      if (filters.startDate && filters.endDate) {
        parts.push(`${filters.startDate} → ${filters.endDate}`)
      } else if (filters.startDate) {
        parts.push(`From ${filters.startDate}`)
      } else {
        parts.push(`Until ${filters.endDate}`)
      }
    }
    if (isLeadActive) {
      parts.push(`${activeChips.length} lead filter${activeChips.length === 1 ? '' : 's'}`)
    }
    if (hasTemplateEvent) {
      const bits = [filters.templateName, filters.eventType && friendlyEvent(filters.eventType)].filter(Boolean)
      parts.push(bits.join(' · '))
    }
    return parts.length ? parts.join(' · ') : 'No filters — all data'
  }, [hasDateRange, filters.startDate, filters.endDate, isLeadActive, activeChips.length, hasTemplateEvent, filters.templateName, filters.eventType])

  const removeChip = (chip) => {
    if (chip.group === 'stage') {
      setFilters((f) => ({ ...f, pickedLeadStages: (f.pickedLeadStages ?? []).filter((x) => x !== chip.value) }))
    } else if (chip.group === 'source') {
      setFilters((f) => ({ ...f, pickedSources: (f.pickedSources ?? []).filter((x) => x !== chip.value) }))
    } else if (chip.group === 'state') {
      setFilters((f) => ({ ...f, pickedStates: (f.pickedStates ?? []).filter((x) => x !== chip.value) }))
    } else if (chip.group === 'city') {
      setFilters((f) => ({ ...f, pickedCities: (f.pickedCities ?? []).filter((x) => x !== chip.value) }))
    }
  }

  const applyDateRange = (field, value) => {
    const nextStart = field === 'start' ? value : filters.startDate
    const nextEnd = field === 'end' ? value : filters.endDate
    setFilters((f) => ({
      ...f,
      startDate: field === 'start' ? value : f.startDate,
      endDate: field === 'end' ? value : f.endDate,
    }))
    onApply?.({ startDate: nextStart, endDate: nextEnd })
  }

  const clearLeadFilters = () => {
    onApply?.({
      pickedLeadStages: [],
      pickedSources: [],
      pickedCities: [],
      pickedStates: [],
    })
  }

  const panelClass = cn(
    'rounded-xl border overflow-hidden',
    isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-white border-slate-200 shadow-sm',
  )

  const sectionTitle = cn('text-[11px] font-semibold uppercase tracking-wide', isDark ? 'text-slate-400' : 'text-slate-500')

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
      {isInUse && (
        <button
          type="button"
          onClick={() => {
            onApply?.({
              startDate: '',
              endDate: '',
              pickedLeadStages: [],
              pickedSources: [],
              pickedCities: [],
              pickedStates: [],
            })
          }}
          className={cn(
            'px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors',
            isDark
              ? 'border-slate-600 text-slate-400 hover:bg-slate-700'
              : 'border-slate-200 text-slate-600 hover:bg-slate-50',
          )}
        >
          Reset
        </button>
      )}
      {expanded && isLeadActive && (
        <button
          type="button"
          onClick={clearLeadFilters}
          className={cn(
            'px-2.5 py-1.5 rounded-lg text-[11px] font-medium',
            isDark ? 'text-slate-400 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100',
          )}
        >
          Clear lead
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={() => onApply?.()}
          disabled={leadFilterLoading}
          className={cn(
            'px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50',
            isDark ? 'bg-brand-600 hover:bg-brand-500 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white',
          )}
        >
          {leadFilterLoading ? 'Loading…' : 'Apply'}
        </button>
      )}
    </div>
  )

  return (
    <div className={panelClass}>
      {/* Collapsible header — always visible */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2.5 min-h-[44px]',
          isDark ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50/80',
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center gap-2 min-w-0 text-left"
          aria-expanded={expanded}
        >
          <svg
            className={cn(
              'w-4 h-4 shrink-0 transition-transform',
              expanded && 'rotate-90',
              isDark ? 'text-slate-500' : 'text-slate-400',
            )}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={cn('text-sm font-semibold shrink-0', isDark ? 'text-slate-100' : 'text-slate-900')}>
            Filters
          </span>
          {isInUse && (
            <span
              className={cn(
                'shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded',
                isDark ? 'bg-brand-900/50 text-brand-300' : 'bg-brand-100 text-brand-700',
              )}
            >
              On
            </span>
          )}
          <span
            className={cn(
              'text-xs truncate min-w-0',
              isInUse ? (isDark ? 'text-slate-400' : 'text-slate-600') : (isDark ? 'text-slate-600' : 'text-slate-400'),
            )}
          >
            {filterSummary}
          </span>
        </button>
        {!expanded && isLeadActive && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onApply?.()
            }}
            disabled={leadFilterLoading}
            className={cn(
              'shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold disabled:opacity-50',
              isDark ? 'bg-brand-600 text-white' : 'bg-brand-600 text-white',
            )}
          >
            Apply
          </button>
        )}
        {actionButtons}
      </div>

      {/* Collapsed: compact active chips */}
      {!expanded && isLeadActive && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-1.5 px-3 pb-2.5 -mt-0.5',
            isDark ? 'border-t border-slate-700/50' : 'border-t border-slate-100',
          )}
        >
          {activeChips.slice(0, 6).map((chip) => (
            <FilterChip key={chip.key} label={chip.label} isDark={isDark} onRemove={() => removeChip(chip)} />
          ))}
          {activeChips.length > 6 && (
            <span className={cn('text-[10px]', isDark ? 'text-slate-500' : 'text-slate-400')}>
              +{activeChips.length - 6} more
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div
          className={cn(
            'px-4 pb-4 pt-1 space-y-4 border-t',
            isDark ? 'border-slate-700' : 'border-slate-100',
          )}
        >
          <p className={cn('text-xs', isDark ? 'text-slate-500' : 'text-slate-500')}>
            Date range updates automatically. Pick lead filters, then click{' '}
            <span className="font-semibold">Apply</span>.
          </p>

      {/* Date range */}
      <div className="space-y-2">
        <p className={sectionTitle}>Date range</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <div>
            <label className={cn('block text-xs font-medium mb-1', isDark ? 'text-slate-400' : 'text-slate-600')}>
              From
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => applyDateRange('start', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={cn('block text-xs font-medium mb-1', isDark ? 'text-slate-400' : 'text-slate-600')}>
              To
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => applyDateRange('end', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {SHOW_TEMPLATE_EVENT_FILTERS && (
        <div className="space-y-2">
          <p className={sectionTitle}>Template & event</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={cn('block text-xs font-medium mb-1', isDark ? 'text-slate-400' : 'text-slate-600')}>
                Template
              </label>
              <select
                value={filters.templateName}
                onChange={(e) => setFilters((f) => ({ ...f, templateName: e.target.value }))}
                className={inputClass}
              >
                <option value="">All templates</option>
                {[...new Set(options.templateNames || [])].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={cn('block text-xs font-medium mb-1', isDark ? 'text-slate-400' : 'text-slate-600')}>
                Event
              </label>
              <select
                value={filters.eventType}
                onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}
                className={inputClass}
              >
                <option value="">All events</option>
                {[...new Set(options.eventTypes || [])].map((e) => (
                  <option key={e} value={e}>
                    {friendlyEvent(e)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Lead filters */}
      {hasLeadFilter && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className={sectionTitle}>Lead filters</p>
            {leadFilterLoading && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            )}
            {isLeadActive && (
              <span
                className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                  isDark ? 'bg-brand-900/40 text-brand-300' : 'bg-brand-100 text-brand-700',
                )}
              >
                {activeChips.length} active
              </span>
            )}
          </div>
          <p className={cn('text-[10px] -mt-1', isDark ? 'text-slate-500' : 'text-slate-400')}>
            Combine multiple filters — only leads matching <span className="font-medium">all</span> selected groups are included.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SHOW_LEAD_STAGE_FILTER && (
              <SearchableMultiSelect
                id="wa-filter-stage"
                label="Lead stage"
                hint={FILTER_HINTS.leadStage}
                options={optStages}
                picked={pickedStages}
                onPickedChange={(next) => setFilters((f) => ({ ...f, pickedLeadStages: next }))}
                disabled={leadFilterLoading}
                loading={leadFilterLoading}
                isDark={isDark}
                icon={<IconStage />}
                emptyLabel="Any stage"
              />
            )}
            {SHOW_SOURCE_FILTER && (
              <SearchableMultiSelect
                id="wa-filter-source"
                label="Source"
                hint={FILTER_HINTS.source}
                options={optSources}
                picked={pickedSrcs}
                onPickedChange={(next) => setFilters((f) => ({ ...f, pickedSources: next }))}
                disabled={leadFilterLoading}
                loading={leadFilterLoading}
                isDark={isDark}
                icon={<IconSource />}
                emptyLabel="Any source"
              />
            )}
            {SHOW_STATE_FILTER && (
              <SearchableMultiSelect
                id="wa-filter-state"
                label="State"
                hint={FILTER_HINTS.state}
                options={optStates}
                picked={pickedStates}
                onPickedChange={(next) => setFilters((f) => ({ ...f, pickedStates: next }))}
                disabled={leadFilterLoading}
                loading={leadFilterLoading}
                isDark={isDark}
                icon={<IconState />}
                emptyLabel="Any state"
              />
            )}
            {SHOW_CITY_FILTER && (
              <SearchableMultiSelect
                id="wa-filter-city"
                label="City"
                hint={FILTER_HINTS.city}
                options={optCities}
                picked={pickedCities}
                onPickedChange={(next) => setFilters((f) => ({ ...f, pickedCities: next }))}
                disabled={leadFilterLoading}
                loading={leadFilterLoading}
                isDark={isDark}
                icon={<IconCity />}
                emptyLabel="Any city"
              />
            )}
          </div>
        </div>
      )}

      {/* Active selection chips (expanded) */}
      {activeChips.length > 0 && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 pt-3 border-t',
            isDark ? 'border-slate-700' : 'border-slate-100',
          )}
        >
          <span className={cn('text-[10px] font-semibold uppercase tracking-wide shrink-0', isDark ? 'text-slate-500' : 'text-slate-400')}>
            Active:
          </span>
          {activeChips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              isDark={isDark}
              onRemove={() => removeChip(chip)}
            />
          ))}
        </div>
      )}
        </div>
      )}
    </div>
  )
}
