'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { fetchLeadByEmail } from '../../lib/firebase'

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

export default function EmailPaymentConversion({ subjectEmails = {}, cachedConversion, onConversionComputed, theme }) {
  const isDark = theme === 'dark'
  const [expandedRow, setExpandedRow] = useState(null)

  const subjectList = useMemo(() => {
    return Object.entries(subjectEmails)
      .filter(([, emails]) => emails?.length > 0)
      .map(([name, emails]) => ({ name, emails: [...new Set(emails)] }))
      .sort((a, b) => b.emails.length - a.emails.length)
  }, [subjectEmails])

  const allUniqueEmails = useMemo(() => {
    const set = new Set()
    for (const emails of Object.values(subjectEmails || {})) {
      if (Array.isArray(emails)) for (const e of emails) set.add(e)
    }
    return [...set]
  }, [subjectEmails])

  const hasData = subjectList.length > 0

  const [result, setResult] = useState(cachedConversion || null)
  const [status, setStatus] = useState(cachedConversion ? 'done' : 'idle')
  const [progress, setProgress] = useState('')
  const [showDiag, setShowDiag] = useState(false)

  const compute = useCallback(async () => {
    if (!hasData) return
    setStatus('loading')

    try {
      setProgress(`Resolving lead IDs: 0 / ${allUniqueEmails.length}`)

      const emailToLeadId = new Map()
      const BATCH = 5
      let resolved = 0
      let leadFoundCount = 0

      for (let i = 0; i < allUniqueEmails.length; i += BATCH) {
        const batch = allUniqueEmails.slice(i, i + BATCH)
        const results = await Promise.all(batch.map((email) => fetchLeadByEmail(email)))
        batch.forEach((email, idx) => {
          resolved++
          const lead = results[idx]
          if (lead?.lead_id) { emailToLeadId.set(email, lead.lead_id); leadFoundCount++ }
        })
        setProgress(`Resolving lead IDs: ${resolved} / ${allUniqueEmails.length} (${leadFoundCount} found)`)
        if (i + BATCH < allUniqueEmails.length) await new Promise((r) => setTimeout(r, 300))
      }

      const allLeadIds = [...new Set(emailToLeadId.values())]
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

      const perSubject = {}
      for (const { name, emails } of subjectList) {
        let leadsFound = 0, paid = 0
        for (const email of emails) {
          const lid = emailToLeadId.get(email)
          if (lid) { leadsFound++; if (completedLeadIds.has(lid)) paid++ }
        }
        perSubject[name] = { recipients: emails.length, leadsFound, paid, rate: emails.length > 0 ? parseFloat(((paid / emails.length) * 100).toFixed(1)) : 0 }
      }

      const data = {
        perSubject,
        emailToLeadId: Object.fromEntries(emailToLeadId),
        completedLeadIds: [...completedLeadIds],
        diagnostics: {
          totalPaymentsInDB: debugData.totalDocuments || 0,
          statusDistribution: (debugData.statusDistribution || []).reduce((acc, s) => { acc[s.status] = s.count; return acc }, {}),
          completedPaymentsMatched: completedLeadIds.size,
          totalUniqueEmails: allUniqueEmails.length,
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
      console.error('[EmailPaymentConversion]', err)
      setStatus('error')
      setProgress('')
    }
  }, [allUniqueEmails, subjectList, hasData, onConversionComputed])

  useEffect(() => {
    if (hasData && !cachedConversion) compute()
  }, [hasData, cachedConversion, compute])

  if (!hasData) return null

  const perSubject = result?.perSubject || {}
  const diag = result?.diagnostics || {}
  const emailMap = result?.emailToLeadId || {}
  const paidSet = useMemo(() => new Set(result?.completedLeadIds || []), [result?.completedLeadIds])

  const totalReached = diag.totalUniqueEmails || allUniqueEmails.length
  const totalLeads = diag.leadFoundCount || 0
  const totalPaid = diag.completedPaymentsMatched || 0
  const overallRate = totalReached > 0 ? ((totalPaid / totalReached) * 100).toFixed(1) : '0.0'

  const sortedItems = useMemo(() => {
    return [...subjectList].sort((a, b) => {
      const aStats = perSubject[a.name]
      const bStats = perSubject[b.name]
      return (bStats?.paid || 0) - (aStats?.paid || 0) || (bStats?.rate || 0) - (aStats?.rate || 0) || b.emails.length - a.emails.length
    })
  }, [subjectList, perSubject])

  const maxUsers = sortedItems.length > 0 ? Math.max(...sortedItems.map((i) => i.emails.length)) : 1

  return (
    <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className={`px-6 py-5 ${isDark ? 'bg-gradient-to-r from-slate-800 to-slate-800/50' : 'bg-gradient-to-r from-brand-50/80 to-white'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? 'bg-brand-500/10' : 'bg-brand-100'}`}>
                <svg className={`w-4 h-4 ${isDark ? 'text-brand-400' : 'text-brand-600'}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Payment Conversion</h3>
                <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Email campaign to completed payments</p>
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
                isDark ? 'bg-brand-600 hover:bg-brand-500 text-white' : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
              }`}
            >
              {status === 'loading' ? 'Computing...' : 'Recompute'}
            </button>
          </div>
        </div>

        {/* ── Hero Metrics ────────────────────────────────────────────── */}
        {status === 'done' && (
          <div className={`mt-5 grid grid-cols-4 gap-4 py-4 px-2 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-white/80 shadow-inner'}`}>
            <HeroMetric value={totalReached.toLocaleString('en-IN')} label="Recipients" accent={isDark ? 'text-blue-400' : 'text-blue-600'} isDark={isDark} />
            <HeroMetric value={totalLeads.toLocaleString('en-IN')} label="Leads Identified" sub={totalReached > 0 ? `${((totalLeads / totalReached) * 100).toFixed(0)}% match rate` : ''} accent={isDark ? 'text-brand-400' : 'text-brand-600'} isDark={isDark} />
            <HeroMetric value={totalPaid.toLocaleString('en-IN')} label="Payments Done" sub={totalLeads > 0 ? `${((totalPaid / totalLeads) * 100).toFixed(1)}% of leads` : ''} accent={isDark ? 'text-brand-400' : 'text-brand-600'} isDark={isDark} />
            <HeroMetric value={`${overallRate}%`} label="Conversion Rate" sub="recipients → payment" accent={totalPaid > 0 ? (isDark ? 'text-brand-400' : 'text-brand-600') : (isDark ? 'text-slate-500' : 'text-slate-400')} isDark={isDark} />
          </div>
        )}

        {/* ── Funnel ──────────────────────────────────────────────────── */}
        {status === 'done' && (
          <div className="flex items-center gap-2 mt-4">
            <FunnelStep label="Recipients" value={totalReached} total={totalReached} color="text-blue-500" isDark={isDark} />
            <FunnelStep label="Leads" value={totalLeads} total={totalReached} color="text-brand-500" isDark={isDark} />
            <FunnelStep label="Paid" value={totalPaid} total={totalReached} color="text-brand-500" isLast isDark={isDark} />
          </div>
        )}
      </div>

      {/* ── Loading state ─────────────────────────────────────────────── */}
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{progress || 'Starting...'}</span>
        </div>
      )}

      {/* ── Diagnostics ───────────────────────────────────────────────── */}
      {showDiag && status === 'done' && diag && (
        <div className={`mx-6 mt-4 rounded-lg p-3 text-[11px] space-y-1 ${isDark ? 'bg-slate-900 border border-slate-700 text-slate-400' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
          <p className="font-semibold mb-1">Resolution pipeline:</p>
          <p>1. Unique emails: <strong>{diag.totalUniqueEmails?.toLocaleString('en-IN')}</strong></p>
          <p>2. Lead IDs found: <strong>{diag.leadFoundCount?.toLocaleString('en-IN')}</strong> of {diag.resolvedCount?.toLocaleString('en-IN')}</p>
          <p>3. Unique leads: <strong>{diag.uniqueLeadIds?.toLocaleString('en-IN')}</strong></p>
          <p>4. Completed payments: <strong>{diag.completedPaymentsMatched?.toLocaleString('en-IN')}</strong></p>
        </div>
      )}

      {/* ── Subject Table ─────────────────────────────────────────────── */}
      {(status === 'done' || cachedConversion) && (
        <div className="px-6 py-4">
          <p className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            By Email Subject ({sortedItems.length})
          </p>

          {sortedItems.length > 0 ? (
            <div className="space-y-1">
              {sortedItems.map(({ name, emails }) => {
                const stats = perSubject[name] || { recipients: emails.length, leadsFound: 0, paid: 0, rate: 0 }
                const isExpanded = expandedRow === name
                const barWidth = maxUsers > 0 ? (emails.length / maxUsers) * 100 : 0

                const userRows = emails
                  .map((email) => {
                    const leadId = emailMap[email] || null
                    const paid = leadId && paidSet.has(leadId)
                    return paid ? { email, leadId } : null
                  })
                  .filter(Boolean)

                return (
                  <div key={name} className={`rounded-xl overflow-hidden transition-all ${isExpanded ? (isDark ? 'bg-slate-900/60 ring-1 ring-slate-700' : 'bg-slate-50 ring-1 ring-slate-200') : ''}`}>
                    <div
                      onClick={() => setExpandedRow(isExpanded ? null : name)}
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
                            <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? 'bg-brand-900/40 text-brand-400' : 'bg-brand-100 text-brand-700'}`}>
                              {stats.paid} paid
                            </span>
                          )}
                        </div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-brand-500 to-brand-500 transition-all duration-700" style={{ width: `${barWidth}%` }} />
                        </div>
                      </div>

                      <div className="flex items-center gap-5 flex-shrink-0">
                        <div className="text-center w-14">
                          <p className={`text-sm font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{stats.recipients.toLocaleString('en-IN')}</p>
                          <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Users</p>
                        </div>
                        <div className="text-center w-14">
                          <p className={`text-sm font-bold ${isDark ? 'text-brand-400' : 'text-brand-600'}`}>{stats.leadsFound.toLocaleString('en-IN')}</p>
                          <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Leads</p>
                        </div>
                        <div className="text-center w-14">
                          <p className={`text-sm font-bold ${stats.paid > 0 ? 'text-brand-500' : isDark ? 'text-slate-600' : 'text-slate-300'}`}>{stats.paid.toLocaleString('en-IN')}</p>
                          <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Paid</p>
                        </div>
                        <div className={`text-center w-14 px-2 py-1 rounded-lg ${stats.rate > 0 ? (isDark ? 'bg-brand-900/30' : 'bg-brand-50') : ''}`}>
                          <p className={`text-sm font-bold ${stats.rate > 0 ? 'text-brand-500' : isDark ? 'text-slate-600' : 'text-slate-300'}`}>{stats.rate}%</p>
                          <p className={`text-[9px] uppercase tracking-wider ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Rate</p>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className={`mx-4 mb-3 rounded-lg overflow-hidden border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                        {!result?.emailToLeadId ? (
                          <div className="flex flex-col items-center gap-2 py-5">
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Run Recompute to see paid user details</p>
                          </div>
                        ) : userRows.length === 0 ? (
                          <p className={`text-xs text-center py-5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>No completed payments for this subject</p>
                        ) : (
                          <div className="max-h-[280px] overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className={isDark ? 'bg-slate-800' : 'bg-slate-50'}>
                                  <th className={`text-left px-4 py-2 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>#</th>
                                  <th className={`text-left px-4 py-2 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Email</th>
                                  <th className={`text-left px-4 py-2 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Lead ID</th>
                                  <th className={`text-left px-4 py-2 font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Status</th>
                                </tr>
                              </thead>
                              <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-100'}`}>
                                {userRows.map((u, i) => (
                                  <tr key={u.email}>
                                    <td className={`px-4 py-2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{i + 1}</td>
                                    <td className={`px-4 py-2 font-mono text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{u.email}</td>
                                    <td className={`px-4 py-2 font-mono ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{u.leadId}</td>
                                    <td className="px-4 py-2">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isDark ? 'bg-brand-900/40 text-brand-400' : 'bg-brand-100 text-brand-700'}`}>
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
          <button onClick={compute} className="mt-2 text-[11px] font-semibold text-brand-500 hover:underline">Retry</button>
        </div>
      )}
    </div>
  )
}
