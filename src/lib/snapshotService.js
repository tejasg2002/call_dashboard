import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'data_analytics'

// ── Read / Write ─────────────────────────────────────────────────────────────

export async function getSnapshot(channel) {
  const ref = doc(db, COLLECTION, `${channel}_snapshot`)
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : null
}

export async function saveSnapshot(channel, data) {
  const ref = doc(db, COLLECTION, `${channel}_snapshot`)
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() })
}

// ── Build lean snapshot from full aggregation (WA) ───────────────────────────

export function buildWASnapshot(aggregated, rawDocCount, lastRawDocTime) {
  const { kpi, funnel, templateRows, ctaRows, costPerClick, totalCost, engagementRows, buttonPhones, templatePhones } = aggregated

  const leanTemplateRows = templateRows.map((r) => ({
    template_name: r.template_name,
    sent: r.sent,
    delivered: r.delivered,
    read: r.read,
    clicked: r.clicked,
    failed: r.failed,
    ctr: r.ctr,
    readRate: r.readRate,
    sdr: r.sdr,
    str: r.str,
    total_cost: r.total_cost,
    category: r.category,
    failureReasons: r.failureReasons || [],
    templateBtnStats: r.templateBtnStats || [],
    source: r.source || 'api',
    firstSeen: r.firstSeen || null,
    lastSeen: r.lastSeen || null,
  }))

  const leanCtaRows = ctaRows.map((r) => ({
    button_text: r.button_text,
    total_clicks: r.total_clicks,
    unique_users: r.unique_users,
    template_used: r.template_used,
    links: r.links || [],
    click_types: r.click_types,
  }))

  const engagementSummary = {
    total: engagementRows?.length || 0,
    clickedCount: engagementRows?.filter((r) => r.tier === 'Clicked').length || 0,
    readCount: engagementRows?.filter((r) => r.tier === 'Read').length || 0,
    deliveredCount: engagementRows?.filter((r) => r.tier === 'Delivered').length || 0,
    sentOnlyCount: engagementRows?.filter((r) => r.tier === 'Sent only').length || 0,
  }

  return {
    channel: 'wa',
    lastRawDocTime: lastRawDocTime || new Date().toISOString(),
    rawDocCount: rawDocCount || 0,
    kpi,
    funnel,
    templateRows: leanTemplateRows,
    ctaRows: leanCtaRows,
    costPerClick,
    totalCost,
    engagementSummary,
    buttonPhones: buttonPhones || {},
    templatePhones: templatePhones || {},
  }
}

// ── Build lean snapshot from full aggregation (Email) ────────────────────────

export function buildEmailSnapshot(aggregated, rawDocCount, lastRawDocTime) {
  const { kpi, templateRows, funnel, byEmail, subjectEmails } = aggregated

  const leanTemplateRows = templateRows.map((r) => ({
    subject: r.subject,
    templateId: r.templateId,
    sent: r.sent,
    delivered: r.delivered,
    opened: r.opened,
    clicked: r.clicked,
    bounced: r.bounced,
    complained: r.complained || 0,
    deliveryRate: r.deliveryRate,
    openRate: r.openRate,
    clickRate: r.clickRate,
    bounceRate: r.bounceRate,
    sampleMail: r.sampleMail || null,
    firstSeen: r.firstSeen || null,
    lastSeen: r.lastSeen || null,
  }))

  return {
    channel: 'email',
    lastRawDocTime: lastRawDocTime || new Date().toISOString(),
    rawDocCount: rawDocCount || 0,
    kpi,
    templateRows: leanTemplateRows,
    funnel,
    byEmailSummary: { totalUsers: byEmail?.length || 0 },
    subjectEmails: subjectEmails || {},
  }
}

// ── Incremental merge ────────────────────────────────────────────────────────

const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)

export function mergeWASnapshots(existing, delta) {
  const kpi = {
    sent: existing.kpi.sent + delta.kpi.sent,
    delivered: existing.kpi.delivered + delta.kpi.delivered,
    read: existing.kpi.read + delta.kpi.read,
    clicked: existing.kpi.clicked + delta.kpi.clicked,
    failed: existing.kpi.failed + delta.kpi.failed,
    cost: (existing.kpi.cost || 0) + (delta.kpi.cost || 0),
  }
  kpi.ctr = pct(kpi.clicked, kpi.delivered)
  kpi.readRate = pct(kpi.read, kpi.delivered)
  kpi.sdr = pct(kpi.delivered, kpi.sent)
  kpi.str = pct(kpi.read, kpi.sent)

  const funnel = {
    sent: (existing.funnel?.sent || 0) + (delta.funnel?.sent || 0),
    delivered: (existing.funnel?.delivered || 0) + (delta.funnel?.delivered || 0),
    read: (existing.funnel?.read || 0) + (delta.funnel?.read || 0),
    clicked: (existing.funnel?.clicked || 0) + (delta.funnel?.clicked || 0),
  }

  const templateMap = new Map(existing.templateRows.map((r) => [r.template_name, { ...r }]))
  for (const dr of delta.templateRows) {
    const ex = templateMap.get(dr.template_name)
    if (ex) {
      ex.sent += dr.sent
      ex.delivered += dr.delivered
      ex.read += dr.read
      ex.clicked += dr.clicked
      ex.failed += dr.failed
      ex.total_cost = (ex.total_cost || 0) + (dr.total_cost || 0)
      ex.ctr = pct(ex.clicked, ex.delivered)
      ex.readRate = pct(ex.read, ex.delivered)
      ex.sdr = pct(ex.delivered, ex.sent)
      ex.str = pct(ex.read, ex.sent)
      if (dr.failureReasons?.length) {
        const frMap = new Map((ex.failureReasons || []).map((f) => [f.reason, f.count]))
        for (const f of dr.failureReasons) frMap.set(f.reason, (frMap.get(f.reason) || 0) + f.count)
        ex.failureReasons = [...frMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
      }
      if (dr.templateBtnStats?.length) {
        const btnMap = new Map((ex.templateBtnStats || []).map((b) => [b.button_text, { ...b }]))
        for (const b of dr.templateBtnStats) {
          const eb = btnMap.get(b.button_text)
          if (eb) { eb.total_clicks += b.total_clicks; eb.unique_users += b.unique_users }
          else btnMap.set(b.button_text, { ...b })
        }
        ex.templateBtnStats = [...btnMap.values()].sort((a, b) => b.total_clicks - a.total_clicks)
      }
      if (dr.firstSeen && (!ex.firstSeen || dr.firstSeen < ex.firstSeen)) ex.firstSeen = dr.firstSeen
      if (dr.lastSeen && (!ex.lastSeen || dr.lastSeen > ex.lastSeen)) ex.lastSeen = dr.lastSeen
    } else {
      templateMap.set(dr.template_name, { ...dr })
    }
  }
  const templateRows = [...templateMap.values()].sort((a, b) => (b.ctr || 0) - (a.ctr || 0))

  const ctaMap = new Map(existing.ctaRows.map((r) => [r.button_text, { ...r }]))
  for (const dr of delta.ctaRows) {
    const ex = ctaMap.get(dr.button_text)
    if (ex) { ex.total_clicks += dr.total_clicks; ex.unique_users += dr.unique_users }
    else ctaMap.set(dr.button_text, { ...dr })
  }
  const ctaRows = [...ctaMap.values()].sort((a, b) => b.total_clicks - a.total_clicks)

  const mergedButtonPhones = { ...(existing.buttonPhones || {}) }
  for (const [btn, phones] of Object.entries(delta.buttonPhones || {})) {
    const existingSet = new Set(mergedButtonPhones[btn] || [])
    for (const p of phones) existingSet.add(p)
    mergedButtonPhones[btn] = [...existingSet]
  }

  const mergedTemplatePhones = { ...(existing.templatePhones || {}) }
  for (const [tpl, phones] of Object.entries(delta.templatePhones || {})) {
    const existingSet = new Set(mergedTemplatePhones[tpl] || [])
    for (const p of phones) existingSet.add(p)
    mergedTemplatePhones[tpl] = [...existingSet]
  }

  return {
    ...existing,
    kpi,
    funnel,
    templateRows,
    ctaRows,
    costPerClick: kpi.clicked > 0 ? kpi.cost / kpi.clicked : 0,
    totalCost: kpi.cost,
    lastRawDocTime: delta.lastRawDocTime || existing.lastRawDocTime,
    rawDocCount: (existing.rawDocCount || 0) + (delta.rawDocCount || 0),
    buttonPhones: mergedButtonPhones,
    templatePhones: mergedTemplatePhones,
  }
}

export function mergeEmailSnapshots(existing, delta) {
  const kpi = {
    sent: existing.kpi.sent + delta.kpi.sent,
    delivered: existing.kpi.delivered + delta.kpi.delivered,
    opened: existing.kpi.opened + delta.kpi.opened,
    clicked: existing.kpi.clicked + delta.kpi.clicked,
    bounced: existing.kpi.bounced + delta.kpi.bounced,
    complained: (existing.kpi.complained || 0) + (delta.kpi.complained || 0),
  }
  kpi.deliveryRate = pct(kpi.delivered, kpi.sent)
  kpi.openRate = pct(kpi.opened, kpi.delivered)
  kpi.clickRate = pct(kpi.clicked, kpi.delivered)
  kpi.bounceRate = pct(kpi.bounced, kpi.sent)

  const funnel = (existing.funnel || []).map((f, i) => ({
    label: f.label,
    value: f.value + (delta.funnel?.[i]?.value || 0),
  }))

  const templateMap = new Map(existing.templateRows.map((r) => [r.subject, { ...r }]))
  for (const dr of delta.templateRows) {
    const ex = templateMap.get(dr.subject)
    if (ex) {
      ex.sent += dr.sent
      ex.delivered += dr.delivered
      ex.opened += dr.opened
      ex.clicked += dr.clicked
      ex.bounced += dr.bounced
      ex.complained = (ex.complained || 0) + (dr.complained || 0)
      ex.deliveryRate = pct(ex.delivered, ex.sent)
      ex.openRate = pct(ex.opened, ex.delivered)
      ex.clickRate = pct(ex.clicked, ex.delivered)
      ex.bounceRate = pct(ex.bounced, ex.sent)
      if (!ex.sampleMail && dr.sampleMail) ex.sampleMail = dr.sampleMail
      if (dr.firstSeen && (!ex.firstSeen || dr.firstSeen < ex.firstSeen)) ex.firstSeen = dr.firstSeen
      if (dr.lastSeen && (!ex.lastSeen || dr.lastSeen > ex.lastSeen)) ex.lastSeen = dr.lastSeen
    } else {
      templateMap.set(dr.subject, { ...dr })
    }
  }
  const templateRows = [...templateMap.values()].sort((a, b) => b.sent - a.sent)

  const mergedSubjectEmails = { ...(existing.subjectEmails || {}) }
  for (const [subj, emails] of Object.entries(delta.subjectEmails || {})) {
    const existingSet = new Set(mergedSubjectEmails[subj] || [])
    for (const e of emails) existingSet.add(e)
    mergedSubjectEmails[subj] = [...existingSet]
  }

  return {
    ...existing,
    kpi,
    funnel,
    templateRows,
    lastRawDocTime: delta.lastRawDocTime || existing.lastRawDocTime,
    rawDocCount: (existing.rawDocCount || 0) + (delta.rawDocCount || 0),
    subjectEmails: mergedSubjectEmails,
  }
}
