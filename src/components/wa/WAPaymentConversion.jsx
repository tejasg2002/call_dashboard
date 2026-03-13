'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchLeadByMobile } from '../../lib/firebase'

function buildPhoneMap(buttonPhones, templatePhones) {
  const allPhones = new Set()
  for (const phones of Object.values(buttonPhones || {})) {
    if (Array.isArray(phones)) for (const p of phones) allPhones.add(p)
  }
  for (const phones of Object.values(templatePhones || {})) {
    if (Array.isArray(phones)) for (const p of phones) allPhones.add(p)
  }
  return [...allPhones]
}

function HeroMetric({ value, label, sub, accent, isDark }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
      <p className={`text-[11px] font-medium mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
      {sub && <p className={`text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  )
}

function FunnelStep({ label, value, total, color, isLast, isDark }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="flex-1">
        <div className="flex items-baseline justify-between mb-1">
          <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
          <span className={`text-xs font-bold ${color}`}>{value.toLocaleString('en-IN')}</span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
          <div className={`h-full rounded-full transition-all duration-700 ${color.replace('text-', 'bg-')}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!isLast && (
        <svg className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  )
}

export default function WAPaymentConversion({ buttonPhones = {}, templatePhones = {}, cachedConversion, onConversionComputed, theme }) {
  const isDark = theme === 'dark'
  const [tab, setTab] = useState('button')
  const [expandedRow, setExpandedRow] = useState(null)

  const buttonList = useMemo(() => {
    return Object.entries(buttonPhones)
      .filter(([, phones]) => phones?.length > 0)
      .map(([name, phones]) => ({ name, phones: [...new Set(phones)] }))
      .sort((a, b) => b.phones.length - a.phones.length)
  }, [buttonPhones])

  const templateList = useMemo(() => {
    return Object.entries(templatePhones)
      .filter(([, phones]) => phones?.length > 0)
      .map(([name, phones]) => ({ name, phones: [...new Set(phones)] }))
      .sort((a, b) => b.phones.length - a.phones.length)
  }, [templatePhones])

  const allUniquePhones = useMemo(
    () => buildPhoneMap(buttonPhones, templatePhones),
    [buttonPhones, templatePhones]
  )

  const hasData = buttonList.length > 0 || templateList.length > 0

  const [result, setResult] = useState(cachedConversion || null)
  const [status, setStatus] = useState(cachedConversion ? 'done' : 'idle')
  const [progress, setProgress] = useState('')
  const [showDiag, setShowDiag] = useState(false)

  const compute = useCallback(async () => {
    if (!hasData) return
    setStatus('loading')

    try {
      setProgress(`Resolving lead IDs: 0 / ${allUniquePhones.length}`)

      const phoneToLeadId = new Map()
      const BATCH = 5
      let resolved = 0
      let leadFoundCount = 0

      for (let i = 0; i < allUniquePhones.length; i += BATCH) {
        const batch = allUniquePhones.slice(i, i + BATCH)
        const results = await Promise.all(batch.map((phone) => fetchLeadByMobile(phone)))
        batch.forEach((phone, idx) => {
          resolved++
          const lead = results[idx]
          if (lead?.lead_id) { phoneToLeadId.set(phone, lead.lead_id); leadFoundCount++ }
        })
        setProgress(`Resolving lead IDs: ${resolved} / ${allUniquePhones.length} (${leadFoundCount} found)`)
        if (i + BATCH < allUniquePhones.length) await new Promise((r) => setTimeout(r, 300))
      }

      const allLeadIds = [...new Set(phoneToLeadId.values())]
      setProgress(`Checking ${allLeadIds.length} lead IDs against payments...`)

      const completedLeadIds = new Set()
      if (allLeadIds.length > 0) {
        const LEAD_BATCH = 200
        for (let i = 0; i < allLeadIds.length; i += LEAD_BATCH) {
          const chunk = allLeadIds.slice(i, i + LEAD_BATCH)
          const res = await fetch(`/api/npf-payments?lead_ids=${encodeURIComponent(chunk.join(','))}`)
          const data = await res.json()
          for (const p of (data.payments || [])) completedLeadIds.add(p.lead_id)
        }
      }

      const debugRes = await fetch('/api/npf-payments?debug=true')
      const debugData = await debugRes.json()

      function computeStats(items) {
        const out = {}
        for (const { name, phones } of items) {
          let leadsFound = 0, paid = 0
          for (const phone of phones) {
            const lid = phoneToLeadId.get(phone)
            if (lid) { leadsFound++; if (completedLeadIds.has(lid)) paid++ }
          }
          out[name] = { clicked: phones.length, leadsFound, paid, rate: phones.length > 0 ? parseFloat(((paid / phones.length) * 100).toFixed(1)) : 0 }
        }
        return out
      }

      const data = {
        perButton: computeStats(buttonList),
        perTemplate: computeStats(templateList),
        phoneToLeadId: Object.fromEntries(phoneToLeadId),
        completedLeadIds: [...completedLeadIds],
        diagnostics: {
          totalPaymentsInDB: debugData.totalDocuments || 0,
          statusDistribution: (debugData.statusDistribution || []).reduce((acc, s) => { acc[s.status] = s.count; return acc }, {}),
          completedPaymentsMatched: completedLeadIds.size,
          totalUniquePhones: allUniquePhones.length,
          resolvedCount: resolved,
          leadFoundCount,
          uniqueLeadIds: allLeadIds.length,
        },
      }

      setResult(data)
      setStatus('done')
      setProgress('')
      if (onConversionComputed) onConversionComputed(data)
    } catch (err) {
      console.error('[WAPaymentConversion]', err)
      setStatus('error')
      setProgress('')
    }
  }, [allUniquePhones, buttonList, templateList, hasData, onConversionComputed])

  useEffect(() => {
    if (hasData && !cachedConversion) compute()
  }, [hasData, cachedConversion, compute])

  if (!hasData) return null

  const perButton = result?.perButton || {}
  const perTemplate = result?.perTemplate || {}
  const diag = result?.diagnostics || {}
  const activeItems = tab === 'button' ? buttonList : templateList
  const activeStats = tab === 'button' ? perButton : perTemplate
  const phoneMap = result?.phoneToLeadId || {}
  const paidSet = useMemo(() => new Set(result?.completedLeadIds || []), [result?.completedLeadIds])

  const totalReached = diag.totalUniquePhones || allUniquePhones.length
  const totalLeads = diag.leadFoundCount || 0
  const totalPaid = diag.completedPaymentsMatched || 0
  const overallRate = totalReached > 0 ? ((totalPaid / totalReached) * 100).toFixed(1) : '0.0'

  const sortedItems = useMemo(() => {
    return [...activeItems].sort((a, b) => {
      const aStats = activeStats[a.name]
      const bStats = activeStats[b.name]
      return (bStats?.paid || 0) - (aStats?.paid || 0) || (bStats?.rate || 0) - (aStats?.rate || 0) || b.phones.length - a.phones.length
    })
  }, [activeItems, activeStats])

  const maxUsers = sortedItems.length > 0 ? Math.max(...sortedItems.map((i) => i.phones.length)) : 1

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className={`px-6 py-5 ${isDark ? 'bg-gradient-to-r from-slate-800 to-slate-800/50' : 'bg-gradient-to-r from-emerald-50/80 to-white'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-100'}`}>
                <svg className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Payment Conversion</h3>
                <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>WhatsApp engagement to completed payments</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === 'done' && (
              <button
                onClick={() => setShowDiag((d) => !d)}
                className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors ${isDark ? 'border-slate-700 text-slate-500 hover:text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                {showDiag ? 'Hide' : 'Details'}
              </button>
            )}
            <button
              onClick={compute}
              disabled={status === 'loading'}
              className={`text-[11px] px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50 ${
                isDark ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
              }`}
            >
              {status === 'loading' ? 'Computing...' : 'Recompute'}
            </button>
          </div>
        </div>

        {/* ── Hero Metrics ────────────────────────────────────────────── */}
        {status === 'done' && (
          <div className={`mt-5 grid grid-cols-4 gap-4 py-4 px-2 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-white/80 shadow-inner'}`}>
            <HeroMetric value={totalReached.toLocaleString('en-IN')} label="Users Reached" accent={isDark ? 'text-blue-400' : 'text-blue-600'} isDark={isDark} />
            <HeroMetric value={totalLeads.toLocaleString('en-IN')} label="Leads Identified" sub={totalReached > 0 ? `${((totalLeads / totalReached) * 100).toFixed(0)}% match rate` : ''} accent={isDark ? 'text-violet-400' : 'text-violet-600'} isDark={isDark} />
            <HeroMetric value={totalPaid.toLocaleString('en-IN')} label="Payments Done" sub={totalLeads > 0 ? `${((totalPaid / totalLeads) * 100).toFixed(1)}% of leads` : ''} accent={isDark ? 'text-emerald-400' : 'text-emerald-600'} isDark={isDark} />
            <HeroMetric value={`${overallRate}%`} label="Conversion Rate" sub="users → payment" accent={totalPaid > 0 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-slate-500' : 'text-slate-400')} isDark={isDark} />
          </div>
        )}

        {/* ── Funnel ──────────────────────────────────────────────────── */}
        {status === 'done' && (
          <div className="flex items-center gap-2 mt-4">
            <FunnelStep label="Reached" value={totalReached} total={totalReached} color="text-blue-500" isDark={isDark} />
            <FunnelStep label="Leads" value={totalLeads} total={totalReached} color="text-violet-500" isDark={isDark} />
            <FunnelStep label="Paid" value={totalPaid} total={totalReached} color="text-emerald-500" isLast isDark={isDark} />
          </div>
        )}
      </div>

      {/* ── Loading state ─────────────────────────────────────────────── */}
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{progress || 'Starting...'}</span>
        </div>
      )}

      {/* ── Diagnostics ───────────────────────────────────────────────── */}
      {showDiag && status === 'done' && diag && (
        <div className={`mx-6 mt-4 rounded-lg p-3 text-[11px] space-y-1 ${isDark ? 'bg-slate-900 border border-slate-700 text-slate-400' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
          <p className="font-semibold mb-1">Resolution pipeline:</p>
          <p>1. Unique phones: <strong>{diag.totalUniquePhones?.toLocaleString('en-IN')}</strong></p>
          <p>2. Lead IDs found: <strong>{diag.leadFoundCount?.toLocaleString('en-IN')}</strong> of {diag.resolvedCount?.toLocaleString('en-IN')}</p>
          <p>3. Unique leads: <strong>{diag.uniqueLeadIds?.toLocaleString('en-IN')}</strong></p>
          <p>4. Completed payments: <strong>{diag.completedPaymentsMatched?.toLocaleString('en-IN')}</strong></p>
        </div>
      )}

      {/* ── Tabs + Table ──────────────────────────────────────────────── */}
      {(status === 'done' || cachedConversion) && (
        <div className="px-6 py-4">
          <div className={`flex items-center gap-1 p-1 rounded-xl mb-4 ${isDark ? 'bg-slate-900/50' : 'bg-slate-100'}`}>
            {[
              { key: 'button', label: 'By CTA Button', count: buttonList.length },
              { key: 'template', label: 'By Template', count: templateList.length },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setExpandedRow(null) }}
                className={`flex-1 text-[11px] px-3 py-2 rounded-lg font-semibold transition-all ${
                  tab === key
                    ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm'
                    : isDark ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {label} <span className="opacity-50">({count})</span>
              </button>
            ))}
          </div>

          {sortedItems.length > 0 ? (
            <div className="space-y-1">
              {sortedItems.map(({ name, phones }, idx) => {
                const stats = activeStats[name] || { clicked: phones.length, leadsFound: 0, paid: 0, rate: 0 }
                const isExpanded = expandedRow === `${tab}-${name}`
                const barWidth = maxUsers > 0 ? (phones.length / maxUsers) * 100 : 0

                const userRows = phones
                  .map((phone) => {
                    const leadId = phoneMap[phone] || null
                    const paid = leadId && paidSet.has(leadId)
                    return paid ? { phone, leadId } : null
                  })
                  .filter(Boolean)

                return (
                  <div key={name} className={`rounded-xl overflow-hidden transition-all ${isExpanded ? (isDark ? 'bg-slate-900/60 ring-1 ring-slate-700' : 'bg-slate-50 ring-1 ring-slate-200') : ''}`}>
                    <div
                      onClick={() => setExpandedRow(isExpanded ? null : `${tab}-${name}`)}
                      className={`flex items-center gap-4 px-4 py-3 cursor-pointer rounded-xl transition-colors ${
                        isExpanded ? '' : isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <svg className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} ${isDark ? 'text-slate-600' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className={`text-xs font-semibold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`} title={name}>{name}</span>
                          {stats.paid > 0 && (
                            <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                              {stats.paid} paid
                            </span>
                          )}
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500 transition-all duration-700" style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center gap-5 flex-shrink-0">
                        <div className="text-center w-14">
                          <p className={`text-sm font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{stats.clicked.toLocaleString('en-IN')}</p>
                          <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Users</p>
                        </div>
                        <div className="text-center w-14">
                          <p className={`text-sm font-bold ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>{stats.leadsFound.toLocaleString('en-IN')}</p>
                          <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Leads</p>
                        </div>
                        <div className="text-center w-14">
                          <p className={`text-sm font-bold ${stats.paid > 0 ? 'text-emerald-500' : isDark ? 'text-slate-600' : 'text-slate-300'}`}>{stats.paid.toLocaleString('en-IN')}</p>
                          <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Paid</p>
                        </div>
                        <div className={`text-center w-14 px-2 py-1 rounded-lg ${stats.rate > 0 ? (isDark ? 'bg-emerald-900/30' : 'bg-emerald-50') : ''}`}>
                          <p className={`text-sm font-bold ${stats.rate > 0 ? 'text-emerald-500' : isDark ? 'text-slate-600' : 'text-slate-300'}`}>{stats.rate}%</p>
                          <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Rate</p>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={`mx-4 mb-3 rounded-lg overflow-hidden border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                        {!result?.phoneToLeadId ? (
                          <div className="flex flex-col items-center gap-2 py-5">
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Run Recompute to see paid user details</p>
                          </div>
                        ) : userRows.length === 0 ? (
                          <p className={`text-xs text-center py-5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>No completed payments for this {tab === 'button' ? 'button' : 'template'}</p>
                        ) : (
                          <div className="max-h-[280px] overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className={isDark ? 'bg-slate-800' : 'bg-slate-50'}>
                                  <th className={`text-left px-4 py-2 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>#</th>
                                  <th className={`text-left px-4 py-2 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Phone</th>
                                  <th className={`text-left px-4 py-2 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Lead ID</th>
                                  <th className={`text-left px-4 py-2 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Status</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                                {userRows.map((u, i) => (
                                  <tr key={u.phone}>
                                    <td className={`px-4 py-2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{i + 1}</td>
                                    <td className={`px-4 py-2 font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{u.phone}</td>
                                    <td className={`px-4 py-2 font-mono ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{u.leadId}</td>
                                    <td className="px-4 py-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDark ? 'bg-emerald-900/40 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        Paid
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className={`text-xs text-center py-6 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>No data available</p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="text-center py-6 px-6">
          <p className={`text-xs ${isDark ? 'text-rose-400' : 'text-rose-500'}`}>Failed to compute conversion data</p>
          <button onClick={compute} className="mt-2 text-[11px] font-semibold text-emerald-500 hover:underline">Retry</button>
        </div>
      )}
    </div>
  )
}
