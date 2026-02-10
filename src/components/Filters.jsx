import { useState, useMemo } from 'react'

const Filters = ({ calls, filters, onFilterChange }) => {
  const [isExpanded, setIsExpanded] = useState(true)

  // Extract unique values from calls for dropdown options
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

  const handleChange = (key, value) => {
    onFilterChange({ ...filters, [key]: value })
  }

  const clearFilters = () => {
    onFilterChange({
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
    })
  }

  const activeFiltersCount = Object.values(filters).filter((v) => v !== '').length

  const formatLabel = (str) => {
    return str
      ?.replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6 shadow-sm">
      {/* Header */}
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

      {/* Filter Content */}
      {isExpanded && (
        <div className="px-6 pb-6 border-t border-slate-200 bg-white">
          {/* Search */}
          <div className="mt-4 mb-6">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by lead name..."
                value={filters.search}
                onChange={(e) => handleChange('search', e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200 transition-all"
              />
            </div>
          </div>

          {/* Filter Stack (vertical layout) */}
          <div className="flex flex-col gap-4">
            {/* Lead Owner */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Lead Owner
              </label>
              <select
                value={filters.leadOwner}
                onChange={(e) => handleChange('leadOwner', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Owners</option>
                {filterOptions.leadOwners.map((owner) => (
                  <option key={owner} value={owner}>
                    {formatLabel(owner)}
                  </option>
                ))}
              </select>
            </div>

            {/* City */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                City
              </label>
              <select
                value={filters.city}
                onChange={(e) => handleChange('city', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Cities</option>
                {filterOptions.cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            {/* State */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                State
              </label>
              <select
                value={filters.state}
                onChange={(e) => handleChange('state', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All States</option>
                {filterOptions.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            {/* Course */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Course
              </label>
              <select
                value={filters.course}
                onChange={(e) => handleChange('course', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Courses</option>
                {filterOptions.courses.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
            </div>

            {/* Call Type */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Call Type
              </label>
              <select
                value={filters.callType}
                onChange={(e) => handleChange('callType', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Types</option>
                {filterOptions.callTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatLabel(type)}
                  </option>
                ))}
              </select>
            </div>

            {/* Lead Stage */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Lead Stage
              </label>
              <select
                value={filters.leadStage}
                onChange={(e) => handleChange('leadStage', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Stages</option>
                {filterOptions.leadStages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </div>

            {/* Disposition */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Disposition
              </label>
              <select
                value={filters.disposition}
                onChange={(e) => handleChange('disposition', e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-violet-300 transition-all appearance-none cursor-pointer"
              >
                <option value="">All Dispositions</option>
                {filterOptions.dispositions.map((disp) => (
                  <option key={disp} value={disp}>
                    {formatLabel(disp)}
                  </option>
                ))}
              </select>
            </div>

            {/* Score Range */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Score Range
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  placeholder="Min"
                  min="0"
                  max="100"
                  value={filters.minScore}
                  onChange={(e) => handleChange('minScore', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 transition-all"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  min="0"
                  max="100"
                  value={filters.maxScore}
                  onChange={(e) => handleChange('maxScore', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 transition-all"
                />
              </div>
            </div>

            {/* Duration Range */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Duration (seconds)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  placeholder="Min"
                  min="0"
                  value={filters.minDuration}
                  onChange={(e) => handleChange('minDuration', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 transition-all"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  min="0"
                  value={filters.maxDuration}
                  onChange={(e) => handleChange('maxDuration', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 transition-all"
                />
              </div>
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Date range
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleChange('startDate', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 transition-all"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleChange('endDate', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Clear Filters Button */}
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

export default Filters
