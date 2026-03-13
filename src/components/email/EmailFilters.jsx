'use client'

export default function EmailFilters({ filters, setFilters, options, theme }) {
  const isDark = theme === 'dark'
  const hasFilter = filters.subject || filters.startDate || filters.endDate

  const inputBase = `appearance-none w-full rounded-xl border pl-9 pr-3 py-2.5 text-[13px] font-medium outline-none transition-all ${
    isDark
      ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'
      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 shadow-sm'
  }`

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Subject selector */}
      <div className="relative flex-1 min-w-[180px] max-w-sm">
        <div className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <select
          value={filters.subject}
          onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}
          className={`${inputBase} pr-9 cursor-pointer`}
        >
          <option value="">All subjects</option>
          {options.subjects.map((s) => (
            <option key={s} value={s}>{s.length > 55 ? s.slice(0, 55) + '…' : s}</option>
          ))}
        </select>
        <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>

      {/* From date */}
      <div className="relative w-[155px]">
        <div className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <input
          type="date"
          value={filters.startDate}
          onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
          className={inputBase}
          title="From date"
        />
      </div>

      {/* To date */}
      <div className="relative w-[155px]">
        <div className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <input
          type="date"
          value={filters.endDate}
          onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
          className={inputBase}
          title="To date"
        />
      </div>

      {/* Clear */}
      {hasFilter && (
        <button
          onClick={() => setFilters({ subject: '', eventType: '', email: '', startDate: '', endDate: '' })}
          className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2.5 rounded-xl border transition-colors ${
            isDark ? 'border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-800 hover:bg-rose-900/20' : 'border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear
        </button>
      )}
    </div>
  )
}
