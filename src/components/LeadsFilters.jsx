import { useState, useMemo } from 'react'

const LeadsFilters = ({ leads, filters, onFilterChange }) => {
  const [isExpanded, setIsExpanded] = useState(true)

  const filterOptions = useMemo(() => {
    const cities = [...new Set(leads.map((l) => l.city).filter(Boolean))].sort()
    const states = [...new Set(leads.map((l) => l.state).filter(Boolean))].sort()
    const leadStages = [...new Set(leads.map((l) => l.lead_stage).filter(Boolean))].sort()
    const publishers = [...new Set(leads.map((l) => l.publishername).filter(Boolean))].sort()
    return { cities, states, leadStages, publishers }
  }, [leads])

  const handleChange = (key, value) => {
    onFilterChange({ ...filters, [key]: value })
  }

  const clearFilters = () => {
    onFilterChange({
      search: '',
      tag: '',
      city: '',
      state: '',
      leadStage: '',
      publisher: '',
      startDate: '',
      endDate: '',
    })
  }

  const activeFiltersCount = Object.values(filters).filter((v) => v !== '').length

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6 shadow-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-violet-50 rounded-lg">
            <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-slate-900">Filters</span>
          {activeFiltersCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 rounded-full">
              {activeFiltersCount} active
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 border-t border-slate-200 bg-white">
          <div className="mt-4 mb-6">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name, email, or lead ID..."
                value={filters.search}
                onChange={(e) => handleChange('search', e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200 transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Tag</label>
              <select
                value={filters.tag}
                onChange={(e) => handleChange('tag', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All (Hot & Warm)</option>
                <option value="Hot">Hot</option>
                <option value="Warm">Warm</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">City</label>
              <select
                value={filters.city}
                onChange={(e) => handleChange('city', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Cities</option>
                {filterOptions.cities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">State</label>
              <select
                value={filters.state}
                onChange={(e) => handleChange('state', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All States</option>
                {filterOptions.states.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Lead Stage</label>
              <select
                value={filters.leadStage}
                onChange={(e) => handleChange('leadStage', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Stages</option>
                {filterOptions.leadStages.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Publisher</label>
              <select
                value={filters.publisher}
                onChange={(e) => handleChange('publisher', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Publishers</option>
                {filterOptions.publishers.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Date range</label>
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 transition-all"
                />
                <span className="text-slate-400">–</span>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleChange('endDate', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 transition-all"
                />
              </div>
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={clearFilters}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Clear All Filters</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LeadsFilters
