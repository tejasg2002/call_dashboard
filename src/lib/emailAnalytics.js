// ── Field extractors ────────────────────────────────────────────────────────
function getInner(raw) { return raw.document || raw }
function getDetail(raw) { return getInner(raw).detail || {} }
function getMail(raw)   { return getDetail(raw).mail || {} }

function getEventType(raw) { return getDetail(raw).eventType || '' }
function getEmail(raw) {
  const m = getMail(raw)
  return (m.destination?.[0] || m.commonHeaders?.to?.[0] || '').toLowerCase().trim()
}
function getSubject(raw) {
  return getMail(raw).commonHeaders?.subject || ''
}
function getMessageId(raw) { return getMail(raw).messageId || '' }
function getTemplateId(raw) {
  return getMail(raw).tags?.templateId?.[0] || ''
}
function getClickLink(raw) {
  // SES Click event stores the clicked URL at detail.click.link
  return getDetail(raw).click?.link || ''
}
function getTimestamp(raw) {
  const d = getInner(raw)
  return d.time || d.createdAt || raw.timestamp || ''
}

// Extract a rich mail-header object for the preview card (captured once per subject)
function buildSampleMail(doc) {
  const m = getMail(doc)
  const tags = m.tags || {}
  const headers = m.headers || []
  const getHeader = (name) => headers.find((h) => h.name === name)?.value || ''
  return {
    from:       m.source || m.commonHeaders?.from?.[0] || '',
    subject:    m.commonHeaders?.subject || '',
    date:       m.commonHeaders?.date || getInner(doc).time || '',
    listId:     getHeader('List-ID'),
    templateId: tags.templateId?.[0] || '',
    journeyId:  tags.journeyId?.[0]  || '',
    runId:      tags.runId?.[0]      || '',
    campaign:   tags['ses:caller-identity']?.[0] || '',
    fromDomain: tags['ses:from-domain']?.[0]     || '',
  }
}

// SES eventType → internal stage key
const STAGE_MAP = {
  Send:      'sent',
  Delivery:  'delivered',
  Open:      'opened',
  Click:     'clicked',
  Bounce:    'bounced',
  Complaint: 'complained',
}

// ── Main aggregation ─────────────────────────────────────────────────────────
export function aggregateEmailWebhooks(docs) {
  const kpi = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 }

  const subjectMap = {}  // subject → row
  const byEmailMap = {}  // email   → timeline

  for (const doc of docs) {
    const eventType = getEventType(doc)
    const stage     = STAGE_MAP[eventType]
    if (!stage) continue

    const email      = getEmail(doc)
    const subject    = getSubject(doc)
    if (!email || !subject) continue

    const ts         = getTimestamp(doc)
    const messageId  = getMessageId(doc)
    const templateId = getTemplateId(doc)
    const clickLink  = stage === 'clicked' ? getClickLink(doc) : ''

    // Global KPIs
    kpi[stage] = (kpi[stage] || 0) + 1

    // ── Per-subject aggregation ──────────────────────────────────────────
    if (!subjectMap[subject]) {
      subjectMap[subject] = {
        subject,
        templateId,
        sampleMail: null,   // filled below on first Send event
        sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0,
        _maps: { sent: {}, delivered: {}, opened: {}, clicked: {}, bounced: {} },
      }
    }
    const row = subjectMap[subject]
    row[stage] = (row[stage] || 0) + 1
    if (!row.templateId && templateId) row.templateId = templateId
    // Capture rich mail header info from the first Send event for the preview card
    if (!row.sampleMail && stage === 'sent') row.sampleMail = buildSampleMail(doc)

    // Dedup per stage: keep only the latest event per email address
    if (row._maps[stage]) {
      const prev = row._maps[stage][email]
      if (!prev || new Date(ts) > new Date(prev.timestamp)) {
        row._maps[stage][email] = { email, timestamp: ts, messageId, ...(clickLink && { link: clickLink }) }
      }
    }

    // ── Per-email timeline ───────────────────────────────────────────────
    if (!byEmailMap[email]) {
      byEmailMap[email] = { email, events: [], lastActivity: ts }
    }
    byEmailMap[email].events.push({ stage, eventType, subject, timestamp: ts, messageId, ...(clickLink && { link: clickLink }) })
    if (!byEmailMap[email].lastActivity || ts > byEmailMap[email].lastActivity) {
      byEmailMap[email].lastActivity = ts
    }
  }

  // ── Build templateRows ──────────────────────────────────────────────────
  const templateRows = Object.values(subjectMap).map((row) => {
    const deliveryRate = row.sent      > 0 ? Math.min((row.delivered / row.sent)      * 100, 100) : 0
    const openRate     = row.delivered > 0 ? Math.min((row.opened    / row.delivered) * 100, 100) : 0
    const clickRate    = row.delivered > 0 ? Math.min((row.clicked   / row.delivered) * 100, 100) : 0
    const bounceRate   = row.sent      > 0 ? Math.min((row.bounced   / row.sent)      * 100, 100) : 0

    const stageUsers = {}
    for (const [s, map] of Object.entries(row._maps)) {
      stageUsers[s] = Object.values(map).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    }

    const { _maps, ...rest } = row
    // Fallback: if no Send event was seen, build sampleMail from any available map entry
    const sampleMail = rest.sampleMail || null
    return { ...rest, sampleMail, deliveryRate, openRate, clickRate, bounceRate, stageUsers }
  }).sort((a, b) => b.sent - a.sent)

  // ── Overall rates ────────────────────────────────────────────────────────
  kpi.deliveryRate = kpi.sent      > 0 ? (kpi.delivered / kpi.sent)      * 100 : 0
  kpi.openRate     = kpi.delivered > 0 ? (kpi.opened    / kpi.delivered) * 100 : 0
  kpi.clickRate    = kpi.delivered > 0 ? (kpi.clicked   / kpi.delivered) * 100 : 0
  kpi.bounceRate   = kpi.sent      > 0 ? (kpi.bounced   / kpi.sent)      * 100 : 0

  // ── Build byEmail timeline array ─────────────────────────────────────────
  const byEmail = Object.values(byEmailMap).map((u) => ({
    ...u,
    events: u.events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
  })).sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))

  // ── Funnel for chart ─────────────────────────────────────────────────────
  const funnel = [
    { label: 'Sent',       value: kpi.sent       },
    { label: 'Delivered',  value: kpi.delivered  },
    { label: 'Opened',     value: kpi.opened     },
    { label: 'Clicked',    value: kpi.clicked    },
    { label: 'Bounced',    value: kpi.bounced    },
  ]

  return { kpi, templateRows, byEmail, funnel }
}
