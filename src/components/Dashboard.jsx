import { useState, useEffect, useMemo } from 'react'
import { fetchCalls } from '../firebase'
import MetricsCards from './MetricsCards'
import PerformanceCards from './PerformanceCards'
import PerformanceCharts from './PerformanceCharts'

const POLLING_INTERVAL = 30000 // 30 seconds

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

const Dashboard = () => {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCall, setSelectedCall] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filters, setFilters] = useState(initialFilters)
  const [rangePreset, setRangePreset] = useState('all') // all | today | week | month | custom
  const [showPresetMenu, setShowPresetMenu] = useState(false)

  // Fetch calls data
  const loadCalls = async () => {
    try {
      setLoading(true)
      const data = await fetchCalls()
      setCalls(data)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError(err.message)
      console.error('Failed to fetch calls:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load data on mount and set up polling
  useEffect(() => {
    // Initial load
    loadCalls()

    // Set up polling interval
    const intervalId = setInterval(() => {
      loadCalls()
    }, POLLING_INTERVAL)

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId)
    }
  }, [])

  const getCallDate = (call) => {
    // Support Firestore Timestamp or JS Date / ISO string
    const raw =
      call.Date || // Firestore field 'Date'
      call.call_timestamp ||
      call.created_at ||
      call.createdAt ||
      call.call_date ||
      call.callDate ||
      null
    if (!raw) return null
    if (typeof raw.toDate === 'function') {
      return raw.toDate()
    }
    return new Date(raw)
  }

  // Apply filters to calls
  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      // Search filter (name or Lead ID)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const nameMatch = call.Name?.toLowerCase().includes(searchLower)
        const leadIdMatch = call.Lead_id?.toLowerCase().includes(searchLower)
        if (!nameMatch && !leadIdMatch) return false
      }

      // Lead Owner filter
      if (filters.leadOwner && call.Lead_owner !== filters.leadOwner) {
        return false
      }

      // City filter
      if (filters.city && call.City !== filters.city) {
        return false
      }

      // State filter
      if (filters.state && call.State !== filters.state) {
        return false
      }

      // Course filter
      if (filters.course && call.course !== filters.course) {
        return false
      }

      // Call Type filter
      if (filters.callType && call.Call_type !== filters.callType) {
        return false
      }

      // Lead Stage filter
      if (filters.leadStage && call.lead_stage !== filters.leadStage) {
        return false
      }

      // Disposition filter
      if (filters.disposition && call.Disposition?.counselor !== filters.disposition) {
        return false
      }

      // Score range filter
      const score = call.scores?.overall || 0
      if (filters.minScore !== '' && score < Number(filters.minScore)) {
        return false
      }
      if (filters.maxScore !== '' && score > Number(filters.maxScore)) {
        return false
      }

      // Duration range filter
      const duration = call.Duration?.seconds || 0
      if (filters.minDuration !== '' && duration < Number(filters.minDuration)) {
        return false
      }
      if (filters.maxDuration !== '' && duration > Number(filters.maxDuration)) {
        return false
      }

      // Date range filter
      const callDate = getCallDate(call)
      if (filters.startDate) {
        const start = new Date(filters.startDate)
        if (callDate && callDate < start) return false
      }
      if (filters.endDate) {
        // Add 1 day to make end date inclusive
        const end = new Date(filters.endDate)
        end.setDate(end.getDate() + 1)
        if (callDate && callDate >= end) return false
      }

      return true
    })
  }, [calls, filters])

  const buildOwnerStats = (sourceCalls) => {
    const map = {}

    sourceCalls.forEach((call) => {
      const owner = call.Lead_owner || 'Unassigned'
      if (!map[owner]) {
        map[owner] = {
          owner,
          totalCalls: 0,
          totalScore: 0,
          maxScore: 0,
        }
      }
      const score = call.scores?.overall || 0
      map[owner].totalCalls += 1
      map[owner].totalScore += score
      if (score > map[owner].maxScore) map[owner].maxScore = score
    })

    const list = Object.values(map).map((item) => ({
      ...item,
      avgScore: item.totalCalls > 0 ? Math.round(item.totalScore / item.totalCalls) : 0,
    }))

    list.sort((a, b) => b.totalCalls - a.totalCalls)

    return list
  }

  // Aggregate performance by lead owner / counselor
  const ownerStatsToday = useMemo(() => {
    // If a custom date range is selected, treat this card as
    // "top performer in selected range" and use filteredCalls directly.
    if (filters.startDate || filters.endDate) {
      return buildOwnerStats(filteredCalls)
    }

    const today = new Date()
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    )

    const callsToday = filteredCalls.filter((call) => {
      const date = getCallDate(call)
      return date && date >= startOfToday
    })

    return buildOwnerStats(callsToday)
  }, [filteredCalls, filters.startDate, filters.endDate])

  const ownerStatsMonth = useMemo(() => {
    // With a custom range, reuse the same aggregated stats so both
    // cards reflect that selected period.
    if (filters.startDate || filters.endDate) {
      return buildOwnerStats(filteredCalls)
    }

    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

    const callsThisMonth = filteredCalls.filter((call) => {
      const date = getCallDate(call)
      return date && date >= monthStart
    })

    return buildOwnerStats(callsThisMonth)
  }, [filteredCalls, filters.startDate, filters.endDate])

  const ownerStatsOverall = useMemo(() => buildOwnerStats(filteredCalls), [filteredCalls])

  const formatLastUpdated = (date) => {
    if (!date) return ''
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDateInput = (date) => {
    return date.toISOString().slice(0, 10)
  }

  const handleQuickRange = (range) => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    if (range === 'today') {
      const d = startOfToday
      const value = formatDateInput(d)
      setFilters((prev) => ({ ...prev, startDate: value, endDate: value }))
      setRangePreset('today')
      return
    }

    if (range === 'week') {
      // Monday as start of week
      const day = today.getDay() // 0=Sun
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
      return
    }

    if (range === 'all') {
      setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))
      setRangePreset('all')
    }

    if (range === 'custom') {
      setRangePreset('custom')
    }

    setShowPresetMenu(false)
  }

  return (
    <div className="min-h-screen p-4 lg:p-8 bg-[#f5f3f7]">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
                Analytics
              </h1>
              <p className="text-slate-600 text-sm md:text-base">
                Overview of your call performance and lead engagement
              </p>
            </div>

            <div className="hidden md:flex items-center space-x-3">
              {lastUpdated && (
                <span className="text-xs text-slate-500 bg-white/60 border border-slate-200 rounded-full px-3 py-1">
                  Last updated: {formatLastUpdated(lastUpdated)}
                </span>
              )}
              <button
                onClick={loadCalls}
                disabled={loading}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-full text-sm transition-all duration-200 disabled:opacity-50"
              >
                <svg
                  className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
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
                <span>Refresh data</span>
              </button>
            </div>
          </div>

          {/* Secondary row (mobile refresh only) */}
          <div className="flex items-center justify-end gap-4">
            <button
              onClick={loadCalls}
              disabled={loading}
              className="md:hidden inline-flex items-center space-x-2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-full text-xs transition-all duration-200 disabled:opacity-50"
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

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center space-x-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Metrics - uses filtered data */}
        <MetricsCards
          calls={filteredCalls}
          loading={loading}
          dateLabel={
            filters.startDate || filters.endDate
              ? filters.startDate &&
                filters.endDate &&
                filters.startDate === filters.endDate
                ? 'Today'
                : 'Selected range'
              : 'All time'
          }
        />

        {/* Date filter row for overview (affects everything below) */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Date:</span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPresetMenu((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-[11px]"
              >
                <span>
                  {rangePreset === 'all' && 'All time'}
                  {rangePreset === 'today' && 'Today'}
                  {rangePreset === 'week' && 'This week'}
                  {rangePreset === 'month' && 'This month'}
                  {rangePreset === 'custom' && 'Custom'}
                </span>
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showPresetMenu && (
                <div className="absolute z-10 mt-1 w-32 rounded-xl border border-slate-200 bg-white shadow-sm text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleQuickRange('today')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('week')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
                  >
                    This week
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('month')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
                  >
                    This month
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('custom')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
                  >
                    Custom
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickRange('all')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-100"
                  >
                    All time
                  </button>
                </div>
              )}
            </div>
          </div>

          {rangePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    startDate: e.target.value,
                  }))
                }
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-violet-300"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    endDate: e.target.value,
                  }))
                }
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-violet-300"
              />
              {(filters.startDate || filters.endDate) && (
                <button
                  onClick={() => handleQuickRange('all')}
                  className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Performance overview by counselor */}
        <PerformanceCards
          ownerStatsToday={ownerStatsToday}
          ownerStatsMonth={ownerStatsMonth}
        />

        {/* Overall graphs */}
        <PerformanceCharts ownerStats={ownerStatsOverall} />

        {/* (Recent calls table + filters have been moved to In-depth view) */}
      </div>
    </div>
  )
}

export default Dashboard
