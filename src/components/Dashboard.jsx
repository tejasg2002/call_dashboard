import { useState, useEffect, useMemo } from 'react'
import { fetchCalls } from '../firebase'
import MetricsCards from './MetricsCards'
import CallsTable from './CallsTable'
import LeadDetail from './LeadDetail'
import Filters from './Filters'

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
}

const Dashboard = () => {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCall, setSelectedCall] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filters, setFilters] = useState(initialFilters)

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

  // Apply filters to calls
  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      // Search filter (name)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase()
        const nameMatch = call.Name?.toLowerCase().includes(searchLower)
        if (!nameMatch) return false
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

      return true
    })
  }, [calls, filters])

  const formatLastUpdated = (date) => {
    if (!date) return ''
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="min-h-screen p-4 lg:p-8 bg-slate-50">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Call Analytics
            </h1>
            <p className="text-slate-600">
              Real-time call analysis dashboard
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            {lastUpdated && (
              <span className="text-sm text-slate-500">
                Last updated: {formatLastUpdated(lastUpdated)}
              </span>
            )}
            <button
              onClick={loadCalls}
              disabled={loading}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 rounded-xl transition-all duration-200 disabled:opacity-50"
            >
              <svg 
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center space-x-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Metrics - uses filtered data */}
        <MetricsCards calls={filteredCalls} loading={loading} />

        {/* Filters */}
        <Filters 
          calls={calls} 
          filters={filters} 
          onFilterChange={setFilters} 
        />

        {/* Results Summary */}
        {(filteredCalls.length !== calls.length) && calls.length > 0 && (
          <div className="mb-4 text-sm text-slate-600">
            Showing <span className="text-violet-600 font-medium">{filteredCalls.length}</span> of{' '}
            <span className="text-slate-900 font-medium">{calls.length}</span> calls
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Calls Table */}
          <div className={`${selectedCall ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
            <CallsTable
              calls={filteredCalls}
              loading={loading}
              onSelectCall={setSelectedCall}
              selectedCallId={selectedCall?.id}
            />
          </div>

          {/* Lead Detail Panel */}
          {selectedCall && (
            <div className="xl:col-span-1">
              <LeadDetail
                call={selectedCall}
                onClose={() => setSelectedCall(null)}
              />
            </div>
          )}
        </div>

        {/* Polling Indicator */}
        <div className="mt-8 flex items-center justify-center space-x-2 text-slate-500 text-sm">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span>Auto-refreshing every 30 seconds</span>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
