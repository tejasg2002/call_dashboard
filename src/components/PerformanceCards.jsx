const PerformanceCards = ({ ownerStatsToday, ownerStatsMonth }) => {
  if (
    (!ownerStatsToday || ownerStatsToday.length === 0) &&
    (!ownerStatsMonth || ownerStatsMonth.length === 0)
  ) {
    return null
  }

  const formatOwner = (owner) =>
    owner.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  const topToday = ownerStatsToday?.[0]
  const topMonth = ownerStatsMonth?.[0]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
      {topToday && (
        <div className="bg-white rounded-3xl px-6 py-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
            Top performer · Today
          </p>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900 truncate max-w-[200px]">
                {formatOwner(topToday.owner)}
              </p>
              <p className="text-sm text-slate-500">
                {topToday.totalCalls} calls · avg score {topToday.avgScore}
              </p>
            </div>
            <div className="flex flex-col items-end space-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-slate-900" />
                <span>Calls</span>
              </span>
              <span className="inline-flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Score</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {topMonth && (
        <div className="bg-white rounded-3xl px-6 py-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
            Top performer · This month
          </p>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-slate-900 truncate max-w-[200px]">
                {formatOwner(topMonth.owner)}
              </p>
              <p className="text-sm text-slate-500">
                {topMonth.totalCalls} calls · avg score {topMonth.avgScore}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Max score</p>
              <p className="text-xl font-mono font-bold text-slate-900">
                {topMonth.maxScore}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PerformanceCards

