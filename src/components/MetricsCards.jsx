const MetricsCards = ({ calls, loading, dateLabel = 'All time' }) => {
  // Calculate metrics from calls data
  const totalCalls = calls.length

  const averageScore = totalCalls > 0
    ? Math.round(calls.reduce((acc, call) => acc + (call.scores?.overall || 0), 0) / totalCalls)
    : 0

  const notInterestedCount = calls.filter(
    (call) => call.Disposition?.counselor === 'not_interested' || call.lead_stage === 'Not Interested'
  ).length

  const interestedCount = calls.filter(
    (call) => call.Disposition?.counselor === 'interested' || call.lead_stage === 'Interested'
  ).length

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
      {/* Total Calls – stacked bar */}
      <div className="bg-white text-slate-900 rounded-3xl px-7 py-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500">
            Total Calls
          </p>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] uppercase tracking-wide text-slate-700">
            {dateLabel}
          </span>
        </div>
        <p className="text-4xl font-bold font-mono mb-4">
          {loading && calls.length === 0 ? '—' : totalCalls}
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-2 text-slate-500">
            <span>Interested vs Not Interested</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
            <div
              className="h-full bg-emerald-500"
              style={{
                width:
                  totalCalls === 0 ? '0%' : `${(interestedCount / totalCalls) * 100}%`,
              }}
            />
            <div
              className="h-full bg-rose-500"
              style={{
                width:
                  totalCalls === 0 ? '0%' : `${(notInterestedCount / totalCalls) * 100}%`,
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              <span>Interested {interestedCount}</span>
            </span>
            <span className="inline-flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-rose-300" />
              <span>Not interested {notInterestedCount}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Average score – radial style */}
      <div className="bg-white border border-slate-200 rounded-3xl px-6 py-6 shadow-sm flex flex-col justify-between">
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500">
            Average Score
          </p>
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19h16M5 17V9m4 8V5m4 12v-7m4 7v-3" />
            </svg>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <p className="text-3xl font-bold text-slate-900 font-mono">
            {loading && calls.length === 0 ? '—' : averageScore}
          </p>
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
            <div
              className="absolute inset-1 rounded-full border-4 border-cyan-500 border-t-transparent"
              style={{ transform: `rotate(${(averageScore / 100) * 180}deg)` }}
            />
          </div>
        </div>
      </div>

      {/* Not interested – bar */}
      <div className="bg-white border border-slate-200 rounded-3xl px-6 py-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500">
            Not Interested
          </p>
          <div className="w-9 h-9 rounded-2xl bg-rose-500 flex items-center justify-center text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <p className="text-3xl font-bold text-slate-900 font-mono mb-3">
          {loading && calls.length === 0 ? '—' : notInterestedCount}
        </p>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-rose-500"
            style={{
              width:
                totalCalls === 0 ? '0%' : `${(notInterestedCount / totalCalls) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Interested – bar */}
      <div className="bg-white border border-slate-200 rounded-3xl px-6 py-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs font-semibold tracking-[0.16em] uppercase text-slate-500">
            Interested
          </p>
          <div className="w-9 h-9 rounded-2xl bg-emerald-500 flex items-center justify-center text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <p className="text-3xl font-bold text-slate-900 font-mono mb-3">
          {loading && calls.length === 0 ? '—' : interestedCount}
        </p>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{
              width:
                totalCalls === 0 ? '0%' : `${(interestedCount / totalCalls) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default MetricsCards
