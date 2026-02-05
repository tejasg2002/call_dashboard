const MetricsCards = ({ calls, loading }) => {
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

  const metrics = [
    {
      label: 'Total Calls',
      value: totalCalls,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
      color: 'from-violet-500 to-purple-600',
      bgGlow: 'bg-violet-500/20',
    },
    {
      label: 'Average Score',
      value: averageScore,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'from-cyan-500 to-blue-600',
      bgGlow: 'bg-cyan-500/20',
    },
    {
      label: 'Not Interested',
      value: notInterestedCount,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-rose-500 to-pink-600',
      bgGlow: 'bg-rose-500/20',
    },
    {
      label: 'Interested',
      value: interestedCount,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'from-emerald-500 to-green-600',
      bgGlow: 'bg-emerald-500/20',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {metrics.map((metric, index) => (
        <div
          key={metric.label}
          className={`animate-slide-up animation-delay-${(index + 1) * 100} opacity-0`}
          style={{ animationDelay: `${index * 100}ms`, animationFillMode: 'forwards' }}
        >
          <div className="relative group">
            {/* Glow effect */}
            <div className={`absolute -inset-0.5 ${metric.bgGlow} rounded-2xl blur-xl opacity-40 group-hover:opacity-60 transition-opacity duration-300`} />
            
            {/* Card */}
            <div className="relative bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${metric.color} shadow-lg`}>
                  {metric.icon}
                </div>
                {loading && (
                  <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
                )}
              </div>
              
              <div className="space-y-1">
                <p className="text-slate-500 text-sm font-medium tracking-wide uppercase">
                  {metric.label}
                </p>
                <p className="text-3xl font-bold text-slate-900 font-mono">
                  {loading && calls.length === 0 ? (
                    <span className="inline-block w-12 h-8 bg-slate-200 rounded animate-pulse" />
                  ) : (
                    metric.value
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default MetricsCards
