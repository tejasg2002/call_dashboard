/**
 * Server-side WA dashboard — split cache slices for fast parallel loads.
 */

async function parseJsonResponse(res, label) {
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 180)
    throw new Error(
      `${label} returned non-JSON (${res.status}). Snippet: ${snippet || '(empty)'}`,
    )
  }
  if (data.error) throw new Error(data.error)
  if (!res.ok) throw new Error(data.error || `${label} failed (${res.status})`)
  return data
}

export async function fetchWADashboard({ mode = 'cached', startDate, endDate, workspace, signal } = {}) {
  const params = new URLSearchParams({ mode })
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (workspace) params.set('workspace', workspace)

  const res = await fetch(`/api/wa-dashboard?${params.toString()}`, { signal })
  return parseJsonResponse(res, 'WA dashboard')
}

/**
 * Parallel cache slices (~4 small JSON responses). Use for default (cached) load.
 * Date-range still uses fetchWADashboard (single full compute).
 */
export async function fetchWADashboardSlices({ workspace, signal } = {}) {
  const params = new URLSearchParams()
  if (workspace) params.set('workspace', workspace)
  const q = params.toString()
  const suffix = q ? `?${q}` : ''
  const t0 = Date.now()

  const opts = { signal }
  const [summary, templates, cta, conversion] = await Promise.all([
    fetch(`/api/wa-dashboard/summary${suffix}`, opts).then((r) => parseJsonResponse(r, 'WA summary')),
    fetch(`/api/wa-dashboard/templates${suffix}`, opts).then((r) => parseJsonResponse(r, 'WA templates')),
    fetch(`/api/wa-dashboard/cta${suffix}`, opts).then((r) => parseJsonResponse(r, 'WA cta')),
    fetch(`/api/wa-dashboard/conversion${suffix}`, opts).then((r) => parseJsonResponse(r, 'WA conversion')),
  ])

  return {
    channel: 'wa',
    workspace: summary.workspace ?? workspace,
    pending: summary.pending ?? false,
    kpi: summary.kpi,
    funnel: summary.funnel,
    totalCost: summary.totalCost,
    costPerClick: summary.costPerClick,
    formSubmittedCount: summary.formSubmittedCount,
    engagementSummary: summary.engagementSummary ?? {},
    rawDocCount: summary.rawDocCount ?? 0,
    lastRawDocTime: summary.lastRawDocTime ?? null,
    computedAt: summary.computedAt,
    templateRows: templates.templateRows ?? [],
    ctaRows: cta.ctaRows ?? [],
    paymentConversion: conversion.paymentConversion ?? null,
    clickBreakdown: [],
    fromCache: true,
    elapsed: Date.now() - t0,
  }
}

/** Heavy slice — load after KPI / tables render. */
export async function fetchWAClickBreakdown({ workspace, signal } = {}) {
  const params = new URLSearchParams()
  if (workspace) params.set('workspace', workspace)
  const q = params.toString()
  const res = await fetch(`/api/wa-dashboard/click-breakdown${q ? `?${q}` : ''}`, { signal })
  return parseJsonResponse(res, 'WA click breakdown')
}
