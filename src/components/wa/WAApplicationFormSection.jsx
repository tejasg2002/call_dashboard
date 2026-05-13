'use client'

import { useState, useEffect, useRef } from 'react'
import { maskPhone } from '../../lib/userManagement'
import { normalizeWAWorkspace } from '../../lib/waWorkspace'
import { useClientPagination } from '../../hooks/useClientPagination'
import PaginationBar from '../PaginationBar'
import { WAUserJourneyByPhone } from './WAUserJourney'

function SectionHeader({ title, description, isDark }) {
  return (
    <div className="pt-1">
      <h2 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{title}</h2>
      {description && <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{description}</p>}
    </div>
  )
}

function TagList({ items, color, isDark }) {
  if (!items || items.length === 0) return <span className={isDark ? 'text-slate-600' : 'text-slate-300'}>—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span
          key={`${i}-${String(item)}`}
          className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium max-w-[140px] truncate ${color}`}
          title={item}
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function extrasSummary(extras) {
  if (!extras || typeof extras !== 'object') return null
  const parts = Object.entries(extras)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`)
  return parts.length ? parts.join(' · ') : null
}

/**
 * Full-width application + lead + WhatsApp context table (one row per converted user).
 * Data comes from `paymentConversion.formSubmittedDetails` (see wa-dashboard compute).
 * Click a row to load that user’s full WhatsApp + form journey (same API as User journey).
 */
export default function WAApplicationFormSection({ paymentConversion, theme, dataMasked, workspace }) {
  const isDark = theme === 'dark'
  const ws = normalizeWAWorkspace(workspace || '')
  const mp = (phone) => (dataMasked ? maskPhone(phone) : phone)
  const rows = paymentConversion?.formSubmittedDetails ?? []
  const { page, setPage, totalPages, total, pageSize, paginated } = useClientPagination(rows, 12)
  const [selectedMobile, setSelectedMobile] = useState(null)
  const journeyAnchorRef = useRef(null)

  const rowKey = (m) => String(m ?? '').replace(/\D/g, '')

  useEffect(() => {
    setSelectedMobile(null)
  }, [ws])

  useEffect(() => {
    if (!selectedMobile) return
    const stillThere = rows.some((r) => rowKey(r.mobile) === rowKey(selectedMobile))
    if (!stillThere) setSelectedMobile(null)
  }, [rows, selectedMobile])

  const openJourneyForRow = (rawMobile) => {
    const digits = rowKey(rawMobile)
    if (digits.length < 10) return
    setSelectedMobile((prev) => (rowKey(prev) === digits ? null : rawMobile))
  }

  useEffect(() => {
    if (!selectedMobile || !journeyAnchorRef.current) return
    journeyAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedMobile])

  if (!paymentConversion || rows.length === 0) return null

  const kind = paymentConversion.conversionKind || 'mba_form'
  const isPayment = kind === 'ihm_payment_webhook'
  const hasExtrasCol = rows.some((r) => r.applicationExtras && Object.keys(r.applicationExtras).length > 0)

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Applications"
        description={
          isPayment
            ? 'Converted users with lead ID, how many distinct templates were sent/delivered to their number, and click context. Click a row to see that user’s journey.'
            : 'Submitted applications with lead ID, name, application number, templates sent, and templates clicked. Click a row to see that applicant’s full WhatsApp and form journey.'
        }
        isDark={isDark}
      />
      <div className={`rounded-2xl border overflow-hidden ${isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-white border-slate-200'}`}>
        <div className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
          <p className={`text-[11px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            {total.toLocaleString('en-IN')} record{total === 1 ? '' : 's'}
            <span className={`font-normal ml-2 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              · Click a row for journey
            </span>
          </p>
        </div>
        <div className="max-h-[min(70vh,520px)] overflow-x-auto overflow-y-auto">
          <table className="w-full text-[11px] min-w-[900px]">
            <thead className={isDark ? 'bg-slate-800 sticky top-0 z-[1]' : 'bg-slate-50 sticky top-0 z-[1]'}>
              <tr>
                <th className={`px-2 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>#</th>
                <th className={`px-2 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Lead ID</th>
                <th className={`px-2 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Lead name</th>
                <th className={`px-2 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Application no.</th>
                <th className={`px-2 py-2 text-left font-medium whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Templates sent</th>
                <th className={`px-2 py-2 text-left font-medium min-w-[160px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Sent (names)</th>
                <th className={`px-2 py-2 text-left font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mobile</th>
                <th className={`px-2 py-2 text-left font-medium whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {isPayment ? 'Completed' : 'Submitted'}
                </th>
                <th className={`px-2 py-2 text-left font-medium min-w-[140px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Clicked templates</th>
                {hasExtrasCol && (
                  <th className={`px-2 py-2 text-left font-medium min-w-[140px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>More</th>
                )}
              </tr>
            </thead>
            <tbody className={isDark ? 'divide-y divide-slate-800' : 'divide-y divide-slate-200'}>
              {paginated.map((u, idx) => {
                const sent = Array.isArray(u.templatesSent) ? u.templatesSent : []
                const sentCount = typeof u.templatesSentCount === 'number' ? u.templatesSentCount : sent.length
                const extraLine = extrasSummary(u.applicationExtras)
                const rk = rowKey(u.mobile)
                const selected = selectedMobile != null && rk.length >= 10 && rk === rowKey(selectedMobile)
                return (
                  <tr
                    key={`${u.leadId || ''}-${u.mobile}-${(page - 1) * pageSize + idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openJourneyForRow(u.mobile)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openJourneyForRow(u.mobile)
                      }
                    }}
                    className={`cursor-pointer transition-colors ${
                      selected
                        ? isDark
                          ? 'bg-brand-900/25 ring-1 ring-inset ring-brand-600/40'
                          : 'bg-brand-50 ring-1 ring-inset ring-brand-200'
                        : isDark
                          ? 'hover:bg-slate-800/80'
                          : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className={`px-2 py-2 align-top ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {(page - 1) * pageSize + idx + 1}
                    </td>
                    <td className={`px-2 py-2 align-top font-mono text-[10px] font-semibold ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>
                      {u.leadId ? <span title={String(u.leadId)}>{String(u.leadId)}</span> : '—'}
                    </td>
                    <td className={`px-2 py-2 align-top max-w-[140px] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {u.leadName ? <span title={u.leadName}>{u.leadName}</span> : '—'}
                    </td>
                    <td className={`px-2 py-2 align-top font-mono text-[10px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {u.applicationNumber || '—'}
                    </td>
                    <td className={`px-2 py-2 align-top font-semibold tabular-nums ${isDark ? 'text-emerald-300' : 'text-emerald-800'}`}>
                      {sentCount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <TagList
                        items={sent}
                        color={isDark ? 'bg-emerald-900/35 text-emerald-300' : 'bg-emerald-50 text-emerald-800'}
                        isDark={isDark}
                      />
                    </td>
                    <td className={`px-2 py-2 align-top font-mono text-[10px] ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{mp(u.mobile)}</td>
                    <td className={`px-2 py-2 align-top font-mono text-[10px] tabular-nums whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {u.formSubmittedAtDisplay || '—'}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <TagList
                        items={u.clickedTemplates}
                        color={isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-700'}
                        isDark={isDark}
                      />
                    </td>
                    {hasExtrasCol && (
                      <td className={`px-2 py-2 align-top text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {extraLine || '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <PaginationBar
            page={page}
            setPage={setPage}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            className={isDark ? 'border-slate-700/50' : ''}
          />
        )}
      </div>

      {ws && selectedMobile && rowKey(selectedMobile).length >= 10 && (
        <div ref={journeyAnchorRef} className="scroll-mt-4">
          <WAUserJourneyByPhone
            workspace={ws}
            isDark={isDark}
            phone={selectedMobile}
            dataMasked={dataMasked}
            onClose={() => setSelectedMobile(null)}
          />
        </div>
      )}
    </div>
  )
}
