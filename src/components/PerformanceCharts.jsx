const PerformanceCharts = ({ ownerStats }) => {
  if (!ownerStats || ownerStats.length === 0) return null

  const topByCalls = ownerStats.slice(0, 5)
  const sortedByScore = [...ownerStats].sort((a, b) => b.avgScore - a.avgScore)
  const topByScore = sortedByScore.slice(0, 5)

  const maxCalls = topByCalls[0]?.totalCalls || 1
  const maxScore = topByScore[0]?.avgScore || 1

  const formatOwner = (owner) =>
    owner.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
      {/* Calls graph */}
      <div className="bg-white rounded-3xl px-6 py-5 border border-slate-200 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase mb-3">
          Calls by counselor
        </p>
        <div className="space-y-3">
          {topByCalls.map((item) => (
            <div key={item.owner} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 truncate max-w-[160px]">
                  {formatOwner(item.owner)}
                </span>
                <span className="text-slate-500 font-mono">
                  {item.totalCalls} calls
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-slate-900"
                  style={{
                    width: `${Math.max(
                      8,
                      Math.round((item.totalCalls / maxCalls) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Score graph */}
      <div className="bg-white rounded-3xl px-6 py-5 border border-slate-200 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase mb-3">
          Call score by counselor
        </p>
        <div className="space-y-3">
          {topByScore.map((item) => (
            <div key={item.owner} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 truncate max-w-[160px]">
                  {formatOwner(item.owner)}
                </span>
                <span className="text-slate-500 font-mono">
                  {item.avgScore}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{
                    width: `${Math.max(
                      8,
                      Math.round((item.avgScore / maxScore) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PerformanceCharts

