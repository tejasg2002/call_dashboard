'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchCalls } from '../firebase'
import CallsTable from './CallsTable'
import LeadDetail from './LeadDetail'

const POLLING_INTERVAL = 30000

const initialFilters = {
  search: '',
  leadOwner: '',
  city: '',
  state: '',
  course: '',
  callType: '',
  leadStage: '',
  disposition: '',
  minScore: '',
  maxScore: '',
  minDuration: '',
  maxDuration: '',
  startDate: '',
  endDate: '',
}

const Analysis = () => {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCall, setSelectedCall] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filters, setFilters] = useState(initialFilters)
  const [rangePreset, setRangePreset] = useState('all')
  const [showPresetMenu, setShowPresetMenu] = useState(false)

  const loadCalls = async () => {
    try {
      setLoading(true)
      const data = await fetchCalls()
      setCalls(data)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError({
        message: err?.message || String(err),
        code: err?.code,
        rawMessage: err?.rawMessage,
      })
      console.error('Failed to fetch calls:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCalls()

    const intervalId = setInterval(() => {
      loadCalls()
    }, POLLING_INTERVAL)

    return () => clearInterval(intervalId)
  }, [])

  const getCallDate = (call) => {
    const raw =
      call.Date ||
      call.call_timestamp ||
      call.created_at ||
      call.createdAt ||
      call.call_date ||
      call.callDate ||
      null
    if (!raw) return null
    if (typeof raw.toDate === 'function') return raw.toDate()
    return new Date(raw)
  }

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const nameMatch = call.Name?.toLowerCase().includes(searchLower)
        const leadIdMatch = call.Lead_id?.toLowerCase().includes(searchLower)
        if (!nameMatch && !leadIdMatch) return false
      }

      if (filters.leadOwner && call.Lead_owner !== filters.leadOwner) return false
      if (filters.city && call.City !== filters.city) return false
      if (filters.state && call.State !== filters.state) return false
      if (filters.course && call.course !== filters.course) return false
      if (filters.callType && call.Call_type !== filters.callType) return false
      if (filters.leadStage && call.lead_stage !== filters.leadStage) return false
      if (filters.disposition && call.Disposition?.counselor !== filters.disposition) return false

      const score = call.scores?.overall || 0
      if (filters.minScore !== '' && score < Number(filters.minScore)) return false
      if (filters.maxScore !== '' && score > Number(filters.maxScore)) return false

      const duration = call.Duration?.seconds || 0
      if (filters.minDuration !== '' && duration < Number(filters.minDuration)) return false
      if (filters.maxDuration !== '' && duration > Number(filters.maxDuration)) return false

      const callDate = getCallDate(call)
      if (filters.startDate) {
        const [sy, sm, sd] = filters.startDate.split('-').map(Number)
        const start = new Date(sy, sm - 1, sd)
        if (callDate && callDate < start) return false
      }
      if (filters.endDate) {
        const [ey, em, ed] = filters.endDate.split('-').map(Number)
        const end = new Date(ey, em - 1, ed + 1)
        if (callDate && callDate >= end) return false
      }

      return true
    })
  }, [calls, filters])

  // Options for Google-Sheets-style column filters
  const filterOptions = useMemo(() => {
    const leadOwners = [...new Set(calls.map((c) => c.Lead_owner).filter(Boolean))].sort()
    const cities = [...new Set(calls.map((c) => c.City).filter(Boolean))].sort()
    const states = [...new Set(calls.map((c) => c.State).filter(Boolean))].sort()
    const courses = [...new Set(calls.map((c) => c.course).filter(Boolean))].sort()
    const callTypes = [...new Set(calls.map((c) => c.Call_type).filter(Boolean))].sort()
    const leadStages = [...new Set(calls.map((c) => c.lead_stage).filter(Boolean))].sort()
    const dispositions = [...new Set(calls.map((c) => c.Disposition?.counselor).filter(Boolean))].sort()

    return { leadOwners, cities, states, courses, callTypes, leadStages, dispositions }
  }, [calls])

  const formatLastUpdated = (date) => {
    if (!date) return ''
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDateInput = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const handleQuickRange = (range) => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    if (range === 'today') {
      const value = formatDateInput(startOfToday)
      setFilters((prev) => ({ ...prev, startDate: value, endDate: value }))
      setRangePreset('today')
      setShowPresetMenu(false)
      return
    }

    if (range === 'week') {
      const day = today.getDay()
      const diff = day === 0 ? 6 : day - 1
      const weekStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - diff
      )
      setFilters((prev) => ({
        ...prev,
        startDate: formatDateInput(weekStart),
        endDate: formatDateInput(startOfToday),
      }))
      setRangePreset('week')
      setShowPresetMenu(false)
      return
    }

    if (range === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      setFilters((prev) => ({
        ...prev,
        startDate: formatDateInput(monthStart),
        endDate: formatDateInput(startOfToday),
      }))
      setRangePreset('month')
      setShowPresetMenu(false)
      return
    }

    if (range === 'custom') {
      setRangePreset('custom')
      setShowPresetMenu(false)
      return
    }

    if (range === 'all') {
      setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))
      setRangePreset('all')
      setShowPresetMenu(false)
    }
  }

  return (
    <div className="min-h-screen p-4 lg:p-8 bg-[#f5f3f7] dark:bg-slate-950">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Call review
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Review every call with spreadsheet-style filters and rich context.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {lastUpdated && (
              <span className="text-xs text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1">
                Last updated: {formatLastUpdated(lastUpdated)}
              </span>
            )}
            <button
              onClick={loadCalls}
              disabled={loading}
              className="inline-flex items-center space-x-2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-full text-xs transition-all duration-200 disabled:opacity-50"
            >
              <svg
                className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex flex-col gap-2">
            <span>{typeof error === 'string' ? error : error.message}</span>
            {typeof error === 'object' && error?.code && (
              <p className="text-xs font-medium">Reason: <code className="bg-rose-100 px-1 rounded">{error.code}</code>
                {error.rawMessage && <span className="font-normal text-rose-600"> — {error.rawMessage}</span>}
              </p>
            )}
            {(typeof error === 'object' && ['permission-denied', 'not-found', 'unavailable', 'failed-precondition'].includes(error?.code)) && (
              <p className="text-xs">Check <code className="bg-rose-100 px-1 rounded">FIRESTORE_RULES.md</code>: enable Firestore, create collection <code className="bg-rose-100 px-1 rounded">Call_logs</code>, and set rules to allow read for signed-in users.</p>
            )}
          </div>
        )}

        {/* Column-style filters (Google Sheets feel) */}
        <div className="mb-4 space-y-3">
          {/* Top row: search + date range */}
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or lead ID"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-brand-300"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Date:</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPresetMenu((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px]"
                >
                  <span>
                    {rangePreset === 'all' && 'All time'}
                    {rangePreset === 'today' && 'Today'}
                    {rangePreset === 'week' && 'This week'}
                    {rangePreset === 'month' && 'This month'}
                    {rangePreset === 'custom' && 'Custom'}
                  </span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showPresetMenu && (
                  <div className="absolute z-10 mt-1 w-32 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm text-[11px]">
                    {['today', 'week', 'month', 'custom', 'all'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleQuickRange(r)}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                      >
                        {r === 'today' && 'Today'}
                        {r === 'week' && 'This week'}
                        {r === 'month' && 'This month'}
                        {r === 'custom' && 'Custom'}
                        {r === 'all' && 'All time'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {rangePreset === 'custom' && (
            <div className="flex items-center justify-end gap-2 text-xs">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                }
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-300"
              />
              <span className="text-slate-400 dark:text-slate-500">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                }
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-300"
              />
              {(filters.startDate || filters.endDate) && (
                <button
                  onClick={() => handleQuickRange('all')}
                  className="px-2 py-1 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Second row: per-column filters aligned to table columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            {[
              { value: filters.leadOwner, key: 'leadOwner', placeholder: 'All owners', options: filterOptions.leadOwners, format: (o) => o.replace(/_/g, ' ') },
              { value: filters.city, key: 'city', placeholder: 'All cities', options: filterOptions.cities },
              { value: filters.state, key: 'state', placeholder: 'All states', options: filterOptions.states },
              { value: filters.course, key: 'course', placeholder: 'All courses', options: filterOptions.courses },
              { value: filters.callType, key: 'callType', placeholder: 'All call types', options: filterOptions.callTypes, format: (t) => t.replace(/_/g, ' ') },
              { value: filters.leadStage, key: 'leadStage', placeholder: 'All stages', options: filterOptions.leadStages },
            ].map(({ value, key, placeholder, options, format }) => (
              <select
                key={key}
                value={value}
                onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-300"
              >
                <option value="">{placeholder}</option>
                {options.map((o) => (
                  <option key={o} value={o}>{format ? format(o) : o}</option>
                ))}
              </select>
            ))}
          </div>
        </div>

        {/* Results summary */}
        {(filteredCalls.length !== calls.length) && calls.length > 0 && (
          <div className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Showing{' '}
            <span className="text-brand-600 dark:text-brand-400 font-medium">{filteredCalls.length}</span>{' '}
            of <span className="text-slate-900 dark:text-slate-100 font-medium">{calls.length}</span>{' '}
            calls
          </div>
        )}

        {/* Table + detail */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          <div className={`${selectedCall ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
            <CallsTable
              calls={filteredCalls}
              loading={loading}
              onSelectCall={setSelectedCall}
              selectedCallId={selectedCall?.id}
            />
          </div>
          {selectedCall && (
            <div className="xl:col-span-1">
              <LeadDetail call={selectedCall} onClose={() => setSelectedCall(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Analysis

