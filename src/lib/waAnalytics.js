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

    // Extract cost: try top-level `cost` field first, then raw_payload nested structure (Interakt)
    let cost = 0
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
      byTemplate[template] = { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0 }
    }
    if (stage === 'sent') byTemplate[template].sent++
    if (stage === 'delivered') byTemplate[template].delivered++
    if (stage === 'read') byTemplate[template].read++
    if (stage === 'clicked') byTemplate[template].clicked++
    if (stage === 'failed') byTemplate[template].failed++
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
          templates: new Set(),
          links: {},    // link → count
          clickTypes: new Set(),
        }
      }
      byButton[buttonKey].clicks++
      if (phone) byButton[buttonKey].users.add(phone)
      if (template && template !== '—') byButton[buttonKey].templates.add(template)
      if (link) {
        byButton[buttonKey].links[link] = (byButton[buttonKey].links[link] || 0) + 1
      }
      if (clickType) byButton[buttonKey].clickTypes.add(clickType)
    }

    if (phone) {
      if (!byPhone[phone]) byPhone[phone] = []
      byPhone[phone].push({ ...d, stage })
    }
  })

  // Rates — all capped at 100%
  const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)
  const ctr     = pct(kpi.clicked, kpi.delivered)   // CTR:  Clicked  / Delivered
  const readRate = pct(kpi.read,   kpi.delivered)   // DTR:  Read     / Delivered (Delivered→Read)
  const sdr      = pct(kpi.delivered, kpi.sent)     // STD:  Delivered / Sent    (Sent→Delivered)
  const str      = pct(kpi.read,   kpi.sent)        // STR:  Read      / Sent    (Sent→Read)

  const templateRows = Object.entries(byTemplate)
    .filter(([name]) => name && name !== '—')
    .map(([name, t]) => ({
      template_name: name,
      sent: t.sent,
      delivered: t.delivered,
      read: t.read,
      clicked: t.clicked,
      failed: t.failed,
      ctr:      pct(t.clicked,   t.delivered),   // CTR
      readRate: pct(t.read,     t.delivered),   // DTR
      sdr:      pct(t.delivered, t.sent),        // STD
      str:      pct(t.read,     t.sent),         // STR
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

    const sorted = [...events].sort((a, b) => new Date(b.event_timestamp || b.timestamp || 0) - new Date(a.event_timestamp || a.timestamp || 0))
    const lastActivity = sorted[0]?.event_timestamp || sorted[0]?.timestamp || null

    return { phone_number: phone, stages, templates, buttons, score, tier, tierColor, tierBg, eventCount: events.length, lastActivity }
  }).sort((a, b) => b.score - a.score || b.eventCount - a.eventCount)

  return {
    kpi: { ...kpi, ctr, readRate, sdr, str },
    funnel,
    templateRows,
    ctaRows,
    byPhone: Object.entries(byPhone).map(([phone, events]) => ({
      phone_number: phone,
      events: events.sort((a, b) => new Date(b.event_timestamp || b.timestamp || 0) - new Date(a.event_timestamp || a.timestamp || 0)),
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
