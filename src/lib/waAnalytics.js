/** Returns 'campaign' for message_campaign_* events, 'api' for everything else. */
export function eventSource(doc) {
  return (doc.event_type || '').toLowerCase().startsWith('message_campaign_') ? 'campaign' : 'api'
}

function eventStage(doc) {
  const et = (doc.event_type || '').toLowerCase()
  const ms = (doc.message_status || '').toLowerCase()
  if (et.includes('click') || et === 'message_api_clicked') return 'clicked'
  if (et.includes('read') || ms === 'read') return 'read'
  if (et.includes('deliver') || ms === 'delivered') return 'delivered'
  if (et.includes('sent') || ms === 'sent') return 'sent'
  if (et.includes('fail') || ms === 'failed') return 'failed'
  if (ms) return ms
  if (et) return et
  return null
}

// Normalise Interakt timestamp strings (no timezone suffix) to ISO UTC so new Date() is correct.
// e.g. "2026-03-10 10:33:42.311353" → "2026-03-10T10:33:42.311353Z"
function toUtcTs(raw) {
  if (!raw) return null
  if (typeof raw === 'number') return raw < 1e10 ? raw * 1000 : raw
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !s.endsWith('Z') && !s.includes('+')) {
    return s.replace(' ', 'T') + 'Z'
  }
  return s
}

export function aggregateWebhooks(docs) {
  const kpi = { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0 }
  const byTemplate = {}
  const byButton = {}
  const byPhone = {}
  const funnel = { sent: 0, delivered: 0, read: 0, clicked: 0 }
  // template_name → last seen raw_payload for preview
  const templatePayloads = {}
  // template_name → category
  const templateCategories = {}

  docs.forEach((d) => {
    const stage = eventStage(d)

    // Cost is only counted on delivered events (event_type === 'message_api_delivered')
    // to avoid multiplying cost across sent/read/clicked events for the same message.
    let cost = 0
    if (stage === 'delivered') {
      if (typeof d.cost === 'number' && d.cost > 0) {
        cost = d.cost
      } else if (d.cost && !isNaN(parseFloat(d.cost))) {
        cost = parseFloat(d.cost)
      } else if (d.raw_payload) {
        try {
          const rp = typeof d.raw_payload === 'string' ? JSON.parse(d.raw_payload) : d.raw_payload
          const mc = rp?.data?.message?.meta_data?.message_cost
          const val = mc?.actual_message_cost ?? mc?.whatsapp_cost ?? null
          if (val != null && !isNaN(parseFloat(val))) cost = parseFloat(val)
        } catch {}
      }
    }
    const template = d.template_name || '—'
    const phone = d.phone_number || ''
    const link = d.button_link || ''
    const clickType = d.click_type || ''

    // Extract button_text: try top-level, then raw_payload nested fields (Interakt format)
    let button = d.button_text || ''
    if (!button && d.raw_payload) {
      try {
        const rp = typeof d.raw_payload === 'string' ? JSON.parse(d.raw_payload) : d.raw_payload
        button = rp?.data?.message?.button_text || ''
      } catch {}
    }
    if (!button) button = '—'

    if (stage === 'sent') { kpi.sent++; funnel.sent++ }
    else if (stage === 'delivered') { kpi.delivered++; funnel.delivered++ }
    else if (stage === 'read') { kpi.read++; funnel.read++ }
    else if (stage === 'clicked') { kpi.clicked++; funnel.clicked++ }
    else if (stage === 'failed') { kpi.failed++ }
    kpi.cost += cost

    if (!byTemplate[template]) {
      byTemplate[template] = {
        sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0,
        failureReasons: {},
        // phone → latest event info, keyed so each phone appears once per stage
        stageUsers: { sent: {}, delivered: {}, read: {}, clicked: {}, failed: {} },
        // button_text → { clicks, users } — scoped to THIS template only
        _buttons: {},
      }
    }
    // For click events, prefer click_timestamp from raw_payload.data.event (UTC→IST handled at display layer)
    let ts = toUtcTs(d.event_timestamp) || toUtcTs(d.timestamp) || null
    if (stage === 'clicked') {
      if (d.click_timestamp) {
        ts = toUtcTs(d.click_timestamp)
      } else if (d.raw_payload) {
        try {
          const rp = typeof d.raw_payload === 'string' ? JSON.parse(d.raw_payload) : d.raw_payload
          // Primary: raw_payload.data.event.click_timestamp (Interakt CTA click)
          const clickTs = rp?.data?.event?.click_timestamp
            || rp?.data?.message?.meta_data?.cta_click_info
              && Object.values(rp.data.message.meta_data.cta_click_info)[0]?.clicked_at_utc
            || rp?.data?.message?.seen_at_utc
            || rp?.data?.message?.seen_at
          if (clickTs) ts = toUtcTs(clickTs)
        } catch {}
      }
    }
    if (stage === 'sent') {
      byTemplate[template].sent++
      if (phone) byTemplate[template].stageUsers.sent[phone] = { phone, timestamp: ts }
    }
    if (stage === 'delivered') {
      byTemplate[template].delivered++
      if (phone) byTemplate[template].stageUsers.delivered[phone] = { phone, timestamp: ts }
    }
    if (stage === 'read') {
      byTemplate[template].read++
      if (phone) byTemplate[template].stageUsers.read[phone] = { phone, timestamp: ts }
    }
    if (stage === 'clicked') {
      byTemplate[template].clicked++
      if (phone) {
        const prev = byTemplate[template].stageUsers.clicked[phone]
        // Accumulate all unique buttons this phone has clicked (don't overwrite)
        const allButtons = new Set(prev?.allButtons || (prev?.buttonText ? [prev.buttonText] : []))
        if (button && button !== '—') allButtons.add(button)
        byTemplate[template].stageUsers.clicked[phone] = {
          phone,
          timestamp: ts,   // keep latest timestamp
          buttonText: button !== '—' ? button : null,  // latest button (backward compat)
          allButtons: [...allButtons],
        }
      }
      // Per-template button breakdown (separate from global byButton)
      if (button && button !== '—') {
        if (!byTemplate[template]._buttons[button]) {
          byTemplate[template]._buttons[button] = { clicks: 0, users: new Set() }
        }
        byTemplate[template]._buttons[button].clicks++
        if (phone) byTemplate[template]._buttons[button].users.add(phone)
      }
    }
    if (stage === 'failed') {
      byTemplate[template].failed++

      let reason = ''
      let code = ''

      // ── Primary: raw_payload.data.message.channel_failure_reason (Interakt) ─
      if (d.raw_payload) {
        try {
          const rp = typeof d.raw_payload === 'string' ? JSON.parse(d.raw_payload) : d.raw_payload
          const msg = rp?.data?.message
          reason = msg?.channel_failure_reason || ''
          code   = msg?.channel_error_code     || ''

          // Fallback within raw_payload
          if (!reason) {
            // WhatsApp Cloud API errors array
            const msgErrors = msg?.errors
            if (Array.isArray(msgErrors) && msgErrors.length > 0) {
              const e = msgErrors[0]
              reason = e.message || e.title || e.description || ''
              if (!code) code = e.code ? String(e.code) : ''
            }
          }
          if (!reason) {
            const meta = msg?.meta_data
            reason = meta?.error_message || meta?.failure_reason || meta?.error_title || ''
          }
          if (!reason) {
            const rpErr = rp?.error || rp?.data?.error || msg?.error
            if (rpErr) reason = typeof rpErr === 'string' ? rpErr : (rpErr.message || rpErr.title || JSON.stringify(rpErr))
          }
        } catch {}
      }

      // ── Fallback: top-level fields ───────────────────────────────────────────
      if (!reason) {
        reason =
          d.failure_reason          ||
          d.channel_failure_reason  ||
          d.error_message           ||
          d.error_title             ||
          d.reason                  ||
          d.delivery_error_message  ||
          ''
      }
      if (!code) code = d.channel_error_code || d.error_code || ''

      // Build the display label — include error code when available
      const label = reason.trim()
        ? (code ? `[${code}] ${reason.trim()}` : reason.trim())
        : (code ? `Error code ${code}` : 'Unknown reason')

      byTemplate[template].failureReasons[label] = (byTemplate[template].failureReasons[label] || 0) + 1
      if (phone) byTemplate[template].stageUsers.failed[phone] = { phone, timestamp: ts, reason: label }
    }
    byTemplate[template].cost += cost

    // Store raw_payload for template preview — prefer ones with raw_template (Interakt format)
    if (d.raw_payload && template !== '—') {
      const existing = templatePayloads[template]
      const hasRawTemplate = d.raw_payload?.data?.message?.raw_template != null
      if (!existing || hasRawTemplate) {
        templatePayloads[template] = d.raw_payload
      }
      // Extract category from raw_payload
      if (!templateCategories[template]) {
        try {
          const rp = typeof d.raw_payload === 'string' ? JSON.parse(d.raw_payload) : d.raw_payload
          const rawTpl = rp?.data?.message?.raw_template
          const tpl = rawTpl ? (typeof rawTpl === 'string' ? JSON.parse(rawTpl) : rawTpl) : null
          const cat = tpl?.category || d.template_category || ''
          if (cat) templateCategories[template] = cat.toUpperCase()
        } catch {}
      }
    }
    // Also check top-level template_category field
    if (template !== '—' && !templateCategories[template] && d.template_category) {
      templateCategories[template] = String(d.template_category).toUpperCase()
    }

    if (stage === 'clicked') {
      const buttonKey = button
      if (!byButton[buttonKey]) {
        byButton[buttonKey] = {
          clicks: 0,
          users: new Set(),
          userEvents: [],   // { phone, template, timestamp, clickType }
          templates: new Set(),
          links: {},
          clickTypes: new Set(),
        }
      }
      byButton[buttonKey].clicks++
      if (phone) byButton[buttonKey].users.add(phone)
      // Store user event for the per-button clicker list
      if (phone) {
        byButton[buttonKey].userEvents.push({
          phone,
          template: template !== '—' ? template : null,
          timestamp: ts,
          clickType: clickType || null,
        })
      }
      if (template && template !== '—') byButton[buttonKey].templates.add(template)
      if (link) {
        byButton[buttonKey].links[link] = (byButton[buttonKey].links[link] || 0) + 1
      }
      if (clickType) byButton[buttonKey].clickTypes.add(clickType)
    }

    if (phone) {
      if (!byPhone[phone]) byPhone[phone] = []
      byPhone[phone].push({ ...d, stage, _resolvedTs: ts })
    }
  })

  // Rates — all capped at 100%
  const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)
  const ctr     = pct(kpi.clicked, kpi.delivered)   // CTR:  Clicked  / Delivered
  const readRate = pct(kpi.read,   kpi.delivered)   // DTR:  Read     / Delivered (Delivered→Read)
  const sdr      = pct(kpi.delivered, kpi.sent)     // STD:  Delivered / Sent    (Sent→Delivered)
  const str      = pct(kpi.read,   kpi.sent)        // STR:  Read      / Sent    (Sent→Read)

  const sortByTs = (arr) =>
    arr.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))

  const templateRows = Object.entries(byTemplate)
    .filter(([name]) => name && name !== '—')
    .map(([name, t]) => ({
      template_name: name,
      sent: t.sent,
      delivered: t.delivered,
      read: t.read,
      clicked: t.clicked,
      failed: t.failed,
      failureReasons: Object.entries(t.failureReasons)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      // Per-stage user lists (unique per phone, sorted newest first)
      stageUsers: Object.fromEntries(
        Object.entries(t.stageUsers).map(([stage, usersMap]) => [
          stage,
          sortByTs(Object.values(usersMap)),
        ])
      ),
      // Button breakdown scoped to this template only
      templateBtnStats: Object.entries(t._buttons)
        .filter(([text]) => text && text !== '—')
        .map(([text, b]) => ({
          button_text:  text,
          total_clicks: b.clicks,
          unique_users: b.users.size,
        }))
        .sort((a, b) => b.total_clicks - a.total_clicks),
      ctr:      pct(t.clicked,   t.delivered),
      readRate: pct(t.read,     t.delivered),
      sdr:      pct(t.delivered, t.sent),
      str:      pct(t.read,     t.sent),
      total_cost: t.cost,
      raw_payload: templatePayloads[name] || null,
      category: templateCategories[name] || '—',
    }))
  templateRows.sort((a, b) => (b.ctr || 0) - (a.ctr || 0))

  const ctaRows = Object.entries(byButton).filter(([text]) => text && text !== '—').map(([text, b]) => ({
    button_text: text,
    total_clicks: b.clicks,
    unique_users: b.users.size,
    template_used: [...b.templates].join(', ') || '—',
    links: Object.entries(b.links).map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count),
    click_types: [...b.clickTypes].join(', ') || '—',
    // Full user event list for template preview (sorted newest first)
    user_events: b.userEvents.sort((a, c) => new Date(c.timestamp || 0) - new Date(a.timestamp || 0)),
  }))
  ctaRows.sort((a, b) => b.total_clicks - a.total_clicks)

  // Build per-user engagement rows
  const engagementRows = Object.entries(byPhone).map(([phone, events]) => {
    const stages = new Set(events.map((e) => e.stage))
    const templates = [...new Set(events.map((e) => e.template_name).filter((t) => t && t !== '—'))]
    const buttons   = [...new Set(events.map((e) => e.button_text).filter((b) => b && b !== '—'))]

    // Score: each unique stage adds points (higher stages = more valuable)
    const stageScore = { sent: 1, delivered: 2, read: 3, clicked: 4 }
    const score = [...stages].reduce((s, st) => s + (stageScore[st] || 0), 0)

    // Tier
    let tier, tierColor, tierBg
    if (stages.has('clicked')) {
      tier = 'Clicked'; tierColor = 'text-amber-600 dark:text-amber-400'; tierBg = 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700'
    } else if (stages.has('read')) {
      tier = 'Read'; tierColor = 'text-violet-600 dark:text-violet-400'; tierBg = 'bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700'
    } else if (stages.has('delivered')) {
      tier = 'Delivered'; tierColor = 'text-emerald-600 dark:text-emerald-400'; tierBg = 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700'
    } else {
      tier = 'Sent only'; tierColor = 'text-blue-500 dark:text-blue-400'; tierBg = 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
    }

    const sorted = [...events].sort((a, b) => new Date(b._resolvedTs || b.event_timestamp || b.timestamp || 0) - new Date(a._resolvedTs || a.event_timestamp || a.timestamp || 0))
    const lastActivity = sorted[0]?._resolvedTs || sorted[0]?.event_timestamp || sorted[0]?.timestamp || null

    return { phone_number: phone, stages, templates, buttons, score, tier, tierColor, tierBg, eventCount: events.length, lastActivity }
  }).sort((a, b) => b.score - a.score || b.eventCount - a.eventCount)

  return {
    kpi: { ...kpi, ctr, readRate, sdr, str },
    funnel,
    templateRows,
    ctaRows,
    byPhone: Object.entries(byPhone).map(([phone, events]) => ({
      phone_number: phone,
      events: events.sort((a, b) => new Date(b._resolvedTs || b.event_timestamp || b.timestamp || 0) - new Date(a._resolvedTs || a.event_timestamp || a.timestamp || 0)),
    })),
    engagementRows,
    costPerClick: kpi.clicked > 0 ? kpi.cost / kpi.clicked : 0,
    totalCost: kpi.cost,
  }
}

/**
 * Aggregate docs grouped by campaign (each campaign = list of template names)
 * campaigns: [{ id, name, templates: ['tpl_a', 'tpl_b'] }]
 */
export function aggregateByCampaign(docs, campaigns) {
  return campaigns.map((campaign) => {
    const filtered = docs.filter((d) =>
      campaign.templates.includes(d.template_name)
    )
    const { kpi, funnel, templateRows, ctaRows } = aggregateWebhooks(filtered)
    return {
      id: campaign.id,
      name: campaign.name,
      templates: campaign.templates,
      kpi,
      funnel,
      templateRows,
      ctaRows,
      totalMessages: filtered.length,
    }
  })
}

export function getFilterOptions(docs) {
  const templates = new Set()
  const eventTypes = new Set()
  docs.forEach((d) => {
    if (d.template_name) templates.add(d.template_name)
    if (d.event_type) eventTypes.add(d.event_type)
  })
  return {
    templateNames: [...templates].sort(),
    eventTypes: [...eventTypes].sort(),
  }
}

/**
 * Aggregate campaign webhook events (message_campaign_*).
 * Groups docs by campaign_name, runs full analytics per campaign,
 * and returns a combined summary + per-campaign breakdown.
 */
export function aggregateCampaignEvents(docs) {
  // Group docs by campaign_name (fall back to campaign_id or 'Unknown')
  const byCampaign = {}
  docs.forEach((d) => {
    let name = d.campaign_name || ''
    if (!name && d.raw_payload) {
      try {
        const rp = typeof d.raw_payload === 'string' ? JSON.parse(d.raw_payload) : d.raw_payload
        name = rp?.data?.message?.campaign_name || ''
      } catch {}
    }
    if (!name) name = d.campaign_id || 'Unknown Campaign'

    let id = d.campaign_id || null
    if (!id && d.raw_payload) {
      try {
        const rp = typeof d.raw_payload === 'string' ? JSON.parse(d.raw_payload) : d.raw_payload
        id = rp?.data?.message?.campaign_id || null
      } catch {}
    }

    if (!byCampaign[name]) byCampaign[name] = { name, id, docs: [] }
    byCampaign[name].docs.push(d)
  })

  // Aggregate each campaign fully (reuses existing aggregateWebhooks)
  const campaigns = Object.values(byCampaign).map((c) => {
    const agg = aggregateWebhooks(c.docs)
    // Date range for this campaign
    const timestamps = c.docs
      .map((d) => toUtcTs(d.event_timestamp) || toUtcTs(d.timestamp))
      .filter(Boolean)
      .map((t) => new Date(t).getTime())
      .filter((t) => !isNaN(t))
    const firstSent  = timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null
    const lastEvent  = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null

    return {
      name:           c.name,
      id:             c.id,
      kpi:            agg.kpi,
      funnel:         agg.funnel,
      templateRows:   agg.templateRows,
      ctaRows:        agg.ctaRows,
      byPhone:        agg.byPhone,
      engagementRows: agg.engagementRows,
      costPerClick:   agg.costPerClick,
      totalCost:      agg.totalCost,
      templateCount:  agg.templateRows.length,
      totalMessages:  c.docs.length,
      firstSent,
      lastEvent,
    }
  }).sort((a, b) => b.kpi.sent - a.kpi.sent)

  // Combined KPIs across all campaigns
  const totalKpi = campaigns.reduce((acc, c) => {
    acc.sent      += c.kpi.sent
    acc.delivered += c.kpi.delivered
    acc.read      += c.kpi.read
    acc.clicked   += c.kpi.clicked
    acc.failed    += c.kpi.failed
    acc.cost      += c.kpi.cost
    return acc
  }, { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0 })

  const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)
  totalKpi.ctr      = pct(totalKpi.clicked, totalKpi.delivered)
  totalKpi.readRate = pct(totalKpi.read,    totalKpi.delivered)
  totalKpi.sdr      = pct(totalKpi.delivered, totalKpi.sent)
  totalKpi.str      = pct(totalKpi.read,    totalKpi.sent)

  // Merged byPhone for the combined user timeline
  const allByPhone = aggregateWebhooks(docs).byPhone

  return { campaigns, totalKpi, allByPhone, campaignCount: campaigns.length }
}
