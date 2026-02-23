import { useState, useEffect, useMemo, useRef } from 'react'
import { fetchHotWarmLeads } from '../firebase'
import LeadProfile from './LeadProfile'
import { useMaskedView } from '../context/MaskedViewContext'

const initialFilters = {
  search: '',
  tag: '',
  city: '',
  state: '',
  leadStage: '',
  publisher: '',
  startDate: '',
  endDate: '',
}

function toDate(value) {
  if (value == null) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  return null
}

const FETCH_TIMEOUT_MS = 20000

const HotLeads = () => {
  const { maskPhone, maskEmail } = useMaskedView()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filters, setFilters] = useState(initialFilters)
  const hasLoadedOnce = useRef(false)
  const pageSize = 20
  const [page, setPage] = useState(1)
  const [rangePreset, setRangePreset] = useState('all')
  const [showPresetMenu, setShowPresetMenu] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)

  const loadLeads = async () => {
    if (!hasLoadedOnce.current) setLoading(true)
    setError(null)
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Check your connection and try again.')), FETCH_TIMEOUT_MS)
      )
      const data = await Promise.race([fetchHotWarmLeads(), timeoutPromise])
      setLeads(data)
      setLastUpdated(new Date())
      hasLoadedOnce.current = true
    } catch (err) {
      setError(err?.message || 'Failed to load leads')
      console.error('Failed to fetch leads:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
    const interval = setInterval(loadLeads, 60000)
    return () => clearInterval(interval)
  }, [])

  const getLeadDate = (lead) => {
    const created = toDate(lead.created_at)
    const updated = toDate(lead.updated_at)
    return updated || created
  }

  const filteredLeads = useMemo(() => leads.filter((lead) => {
      if (filters.search) {
        const s = filters.search.toLowerCase()
        const name = (lead.name || '').toLowerCase()
        const email = (lead.email || '').toLowerCase()
        const leadId = (lead.lead_id || lead.id || '').toLowerCase()
        const mobile = (lead.mobile || '').toLowerCase()
        if (!name.includes(s) && !email.includes(s) && !leadId.includes(s) && !mobile.includes(s)) return false
      }
      if (filters.tag && lead.tag !== filters.tag) return false
      if (filters.city && lead.city !== filters.city) return false
      if (filters.state && lead.state !== filters.state) return false
      if (filters.leadStage && lead.lead_stage !== filters.leadStage) return false
      if (filters.publisher && lead.publishername !== filters.publisher) return false

      const leadDate = getLeadDate(lead)
      if (filters.startDate) {
        const start = new Date(filters.startDate)
        start.setHours(0, 0, 0, 0)
        if (!leadDate || leadDate < start) return false
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate)
        end.setHours(23, 59, 59, 999)
        if (!leadDate || leadDate > end) return false
      }

      return true
    }), [leads, filters])

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [filteredLeads.length, page, totalPages])

  useEffect(() => {
    setPage(1)
  }, [filters])

  const paginatedLeads = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredLeads.slice(start, start + pageSize)
  }, [filteredLeads, page])

  const filterOptions = useMemo(() => {
    const cities = [...new Set(leads.map((l) => l.city).filter(Boolean))].sort()
    const states = [...new Set(leads.map((l) => l.state).filter(Boolean))].sort()
    const leadStages = [...new Set(leads.map((l) => l.lead_stage).filter(Boolean))].sort()
    const publishers = [...new Set(leads.map((l) => l.publishername).filter(Boolean))].sort()
    return { cities, states, leadStages, publishers }
  }, [leads])

  const formatLastUpdated = (date) => {
    if (!date) return ''
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDateInput = (date) => date.toISOString().slice(0, 10)

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
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff)
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

  const renderActivities = (activityPerformed) => {
    if (!Array.isArray(activityPerformed) || activityPerformed.length === 0) {
      return <span className="text-slate-400 text-sm">No activity</span>
    }
    return (
      <ul className="space-y-2 list-none p-0 m-0">
        {activityPerformed.map((entry, idx) => {
          const text = String(entry).trim()
          if (!text) return null
          return (
            <li key={idx} className="flex gap-2 text-sm text-slate-700 leading-snug">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400 mt-1.5" aria-hidden />
              <span className="min-w-0">{text}</span>
            </li>
          )
        })}
      </ul>
    )
  }

  const getTagStyles = (tag) => {
    if (tag === 'Hot') return 'bg-rose-100 text-rose-700 border-rose-200'
    if (tag === 'Warm') return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-slate-100 text-slate-700 border-slate-200'
  }

  if (loading && leads.length === 0) {
    return (
      <div className="min-h-screen p-4 lg:p-8 bg-[#f5f3f7]">
        <div className="max-w-[1600px] mx-auto flex flex-col items-center justify-center min-h-[50vh]">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-violet-300 rounded-full" />
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-violet-500 rounded-full animate-spin" />
          </div>
          <p className="mt-4 text-slate-500 text-sm">Loading hot & warm leads...</p>
        </div>
      </div>
    )
  }

  if (error && leads.length === 0) {
    return (
      <div className="min-h-screen p-4 lg:p-8 bg-[#f5f3f7]">
        <div className="max-w-[1600px] mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Hot & Warm Leads</h1>
          </div>
          <div className="p-8 bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-slate-700 font-medium">Could not load leads</p>
            <p className="text-slate-500 text-sm">{error}</p>
            <button
              type="button"
              onClick={loadLeads}
              className="mt-2 inline-flex items-center space-x-2 px-3 py-1.5 bg-slate-900 hover:bg-black text-white rounded-full text-xs"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 lg:p-8 bg-[#f5f3f7]">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Hot & Warm Leads</h1>
            <p className="text-slate-600 text-sm">
              View and filter hot and warm leads with spreadsheet-style filters.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {lastUpdated && (
              <span className="text-xs text-slate-500 bg-white/60 border border-slate-200 rounded-full px-3 py-1">
                Last updated: {formatLastUpdated(lastUpdated)}
              </span>
            )}
            <button
              type="button"
              onClick={loadLeads}
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
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
            {error}
          </div>
        )}

        {/* Column-style filters (same as Call review) */}
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex-1 min-w-[220px]">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, email or lead ID"
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="text-slate-500">Date:</span>
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
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showPresetMenu && (
                  <div className="absolute z-10 mt-1 w-32 rounded-xl border border-slate-200 bg-white shadow-sm text-[11px]">
                    <button type="button" onClick={() => handleQuickRange('today')} className="w-full text-left px-3 py-1.5 hover:bg-slate-100">Today</button>
                    <button type="button" onClick={() => handleQuickRange('week')} className="w-full text-left px-3 py-1.5 hover:bg-slate-100">This week</button>
                    <button type="button" onClick={() => handleQuickRange('month')} className="w-full text-left px-3 py-1.5 hover:bg-slate-100">This month</button>
                    <button type="button" onClick={() => handleQuickRange('custom')} className="w-full text-left px-3 py-1.5 hover:bg-slate-100">Custom</button>
                    <button type="button" onClick={() => handleQuickRange('all')} className="w-full text-left px-3 py-1.5 hover:bg-slate-100">All time</button>
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
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-violet-300"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-violet-300"
              />
              {(filters.startDate || filters.endDate) && (
                <button
                  type="button"
                  onClick={() => handleQuickRange('all')}
                  className="px-2 py-1 rounded-lg text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
            <select
              value={filters.tag}
              onChange={(e) => setFilters((prev) => ({ ...prev, tag: e.target.value }))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-violet-300"
            >
              <option value="">All tags</option>
              <option value="Hot">Hot</option>
              <option value="Warm">Warm</option>
            </select>
            <select
              value={filters.city}
              onChange={(e) => setFilters((prev) => ({ ...prev, city: e.target.value }))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-violet-300"
            >
              <option value="">All cities</option>
              {filterOptions.cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            <select
              value={filters.state}
              onChange={(e) => setFilters((prev) => ({ ...prev, state: e.target.value }))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-violet-300"
            >
              <option value="">All states</option>
              {filterOptions.states.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
            <select
              value={filters.leadStage}
              onChange={(e) => setFilters((prev) => ({ ...prev, leadStage: e.target.value }))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-violet-300"
            >
              <option value="">All stages</option>
              {filterOptions.leadStages.map((stage) => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
            <select
              value={filters.publisher}
              onChange={(e) => setFilters((prev) => ({ ...prev, publisher: e.target.value }))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-none focus:border-violet-300"
            >
              <option value="">All publishers</option>
              {filterOptions.publishers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results summary */}
        {filteredLeads.length !== leads.length && leads.length > 0 && (
          <div className="mb-4 text-sm text-slate-600">
            Showing{' '}
            <span className="text-violet-600 font-medium">{filteredLeads.length}</span>{' '}
            of <span className="text-slate-900 font-medium">{leads.length}</span> leads
          </div>
        )}

        {/* Table + Lead profile (same layout as Call review) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
          <div className={selectedLead ? 'xl:col-span-2' : 'xl:col-span-3'}>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-900">Leads</h2>
          <span className="text-sm text-slate-500">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
          </span>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">No leads match your filters</p>
            <p className="text-slate-500 text-sm">Try adjusting filters or clear them to see all hot & warm leads.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead ID</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Mobile</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">City</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">State</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tag</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead Stage</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Publisher</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Activities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`cursor-pointer transition-colors ${
                      selectedLead?.id === lead.id ? 'bg-violet-50' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs text-slate-600 truncate max-w-[140px] block" title={lead.lead_id || lead.id}>
                        {lead.lead_id || lead.id}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-900 font-medium">{lead.name ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-700 text-sm">{maskEmail(lead.email)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-700 text-sm">{maskPhone(lead.mobile)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-700 text-sm">{lead.city === 'City Not Available' ? '—' : (lead.city ?? '—')}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-700">{lead.state ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-md border ${getTagStyles(lead.tag)}`}>
                        {lead.tag ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-700 text-sm">{lead.lead_stage ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-700 text-sm">{lead.publishername ?? '—'}</span>
                    </td>
                    <td className="px-6 py-4 max-w-[320px] align-top">
                      <div className="bg-slate-50/80 rounded-lg border border-slate-100 px-3 py-2.5 max-h-[200px] overflow-y-auto">
                        {renderActivities(lead.activity_performed)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredLeads.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Showing{' '}
              <span className="font-medium">
                {(page - 1) * pageSize + 1}
              </span>{' '}
              -{' '}
              <span className="font-medium">
                {Math.min(page * pageSize, filteredLeads.length)}
              </span>{' '}
              of <span className="font-medium">{filteredLeads.length}</span> leads
            </span>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700"
              >
                Prev
              </button>
              <span className="px-2">
                Page <span className="font-medium">{page}</span> of{' '}
                <span className="font-medium">{totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
          </div>
          {selectedLead && (
            <div className="xl:col-span-1">
              <LeadProfile lead={selectedLead} onClose={() => setSelectedLead(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default HotLeads
