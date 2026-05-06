import clientPromise from '../../../src/lib/mongodb'
import { isOnOrAfter, parseOptDate } from '../../../src/lib/conversionAttribution'
import {
  WA_DASHBOARD_CACHE_ID_MBA_LEGACY,
  waWorkspaceConfig,
  workspacePayloadMatchesExpected,
} from '../../../src/lib/waWorkspace'

const ITM_DB = 'itm'
const APPS_COL = 'npfMbaApplications'
const CRM_SNAPSHOT_COL = 'crmSnapshotMarch23'
/** Cached snapshots in itm.wa_dashboard_cache — MBA + one doc per entry in ANALYTICS_WA_DEFINITIONS (see waWorkspace.js). */
const CACHE_COL = 'wa_dashboard_cache'

const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)

/**
 * Pre-filter for click documents — must catch BOTH:
 *  - migrated/normalised docs that have a top-level `stage: 'clicked'` field
 *  - native Interakt docs that only have `type: 'message_api_clicked'` (no stage field)
 * Use this as the very first $match in any pipeline that will later filter on _waStage='clicked'.
 */
const CLICKED_PRE_MATCH = {
  $or: [
    { stage: 'clicked' },
    { type: { $in: ['message_api_clicked', 'message_campaign_clicked'] } },
  ],
}

function waMessageStatusExpr() {
  return { $ifNull: ['$message_status', '$data.message.message_status'] }
}

function waStageExpr() {
  return {
    $let: {
      vars: {
        et: { $toLower: { $ifNull: ['$type', '$event_type'] } },
        ms: { $toLower: waMessageStatusExpr() },
      },
      in: {
        $switch: {
          branches: [
            { case: { $regexMatch: { input: '$$et', regex: 'click' } }, then: 'clicked' },
            {
              case: {
                $or: [
                  { $regexMatch: { input: '$$et', regex: 'read' } },
                  { $eq: ['$$ms', 'read'] },
                ],
              },
              then: 'read',
            },
            {
              case: {
                $or: [
                  { $regexMatch: { input: '$$et', regex: 'deliver' } },
                  { $eq: ['$$ms', 'delivered'] },
                ],
              },
              then: 'delivered',
            },
            {
              case: {
                $or: [
                  { $regexMatch: { input: '$$et', regex: 'sent' } },
                  { $eq: ['$$ms', 'sent'] },
                ],
              },
              then: 'sent',
            },
            {
              case: {
                $or: [
                  { $regexMatch: { input: '$$et', regex: 'fail' } },
                  { $eq: ['$$ms', 'failed'] },
                ],
              },
              then: 'failed',
            },
          ],
          default: null,
        },
      },
    },
  }
}

function waResolvedFieldsExpr() {
  const resolvedEventTs = {
    $let: {
      vars: { et: '$event_timestamp' },
      in: {
        $switch: {
          branches: [
            { case: { $eq: [{ $type: '$$et' }, 'date'] }, then: '$$et' },
            {
              case: { $eq: [{ $type: '$$et' }, 'string'] },
              then: { $dateFromString: { dateString: '$$et', onError: '$createdAt', onNull: '$createdAt' } },
            },
          ],
          default: {
            $ifNull: [
              '$createdAt',
              { $dateFromString: { dateString: '$timestamp', onError: null, onNull: null } },
            ],
          },
        },
      },
    },
  }
  return {
    _waPhone: { $ifNull: ['$phone_number', '$data.customer.phone_number'] },
    _waTemplate: {
      $ifNull: [
        '$template_name',
        {
          $let: {
            vars: {
              m: {
                $regexFind: {
                  input: { $ifNull: ['$data.message.raw_template', ''] },
                  regex: '"name"\\s*:\\s*"([^"]+)"',
                },
              },
            },
            in: { $arrayElemAt: ['$$m.captures', 0] },
          },
        },
      ],
    },
    _waSource: {
      $ifNull: [
        '$source',
        {
          $cond: [
            {
              $regexMatch: {
                input: { $toLower: { $ifNull: ['$type', '$event_type'] } },
                regex: '^message_campaign_',
              },
            },
            'campaign',
            'api',
          ],
        },
      ],
    },
    _waMessageStatus: waMessageStatusExpr(),
    _waStage: { $ifNull: ['$stage', waStageExpr()] },
    _waEventTs: resolvedEventTs,
    _waClickTs: {
      $let: {
        vars: { ct: '$click_timestamp' },
        in: {
          $switch: {
            branches: [
              { case: { $eq: [{ $type: '$$ct' }, 'date'] }, then: '$$ct' },
              {
                case: { $eq: [{ $type: '$$ct' }, 'string'] },
                then: { $dateFromString: { dateString: '$$ct', onError: resolvedEventTs, onNull: resolvedEventTs } },
              },
            ],
            default: {
              $ifNull: [
                {
                  $dateFromString: {
                    dateString: '$data.message.meta_data.cta_click_info.link.clicked_at_utc',
                    onError: null,
                    onNull: null,
                  },
                },
                resolvedEventTs,
              ],
            },
          },
        },
      },
    },
    // Treat empty string and "[]" as null so we fall through to data.message.button_text
    // (some migrated docs have button_text: "" while the real label is in data.message.button_text)
    _waButtonText: {
      $let: {
        vars: { primary: '$button_text' },
        in: {
          $cond: [
            {
              $and: [
                { $ne: ['$$primary', null] },
                { $ne: ['$$primary', ''] },
                { $ne: [{ $toString: { $ifNull: ['$$primary', ''] } }, '[]'] },
              ],
            },
            '$$primary',
            '$data.message.button_text',
          ],
        },
      },
    },
    _waFailureReason: { $ifNull: ['$failure_reason', '$data.message.channel_failure_reason'] },
    _waCost: {
      $ifNull: [
        '$cost',
        {
          $convert: {
            input: '$data.message.meta_data.message_cost.actual_message_cost',
            to: 'double',
            onError: 0,
            onNull: 0,
          },
        },
      ],
    },
    _waCampaignName: { $ifNull: ['$campaign_name', '$data.message.campaign_name'] },
    _waCampaignId: { $ifNull: ['$campaign_id', '$data.message.campaign_id'] },
    _waTemplateCategory: { $ifNull: ['$template_category', null] },
  }
}

function normaliseMobile(raw) {
  if (!raw) return ''
  let n = String(raw).trim()
  if (n.startsWith('+')) n = n.slice(1)
  // Strip all non-digit characters (handles "+91-98XXXXXXXX", spaces, dashes, etc.)
  n = n.replace(/\D/g, '')
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

/** Values to pass to Mongo `$in` for WA phone matching (raw + normalised + 91… + +91…). */
function waPhoneVariantsForMatch(rawList) {
  const out = new Set()
  for (const raw of rawList || []) {
    if (raw == null || raw === '') continue
    const s = String(raw).trim()
    if (!s) continue
    out.add(s)
    const n = normaliseMobile(s)
    if (n) {
      out.add(n)
      if (n.length === 10) {
        out.add(`91${n}`)    // 91XXXXXXXXXX
        out.add(`+91${n}`)   // +91XXXXXXXXXX — some Interakt docs store with + prefix
      }
    }
  }
  return [...out]
}

function isUsefulWaButtonText(b) {
  const s = String(b ?? '').trim()
  return Boolean(s && s !== '[]' && s !== '""' && s.toLowerCase() !== 'null')
}

/**
 * Mongo expression that resolves the CTA bucket label for a clicked document.
 * Tries `_waButtonText` first; falls back to the first non-"link" key in
 * `data.message.meta_data.cta_click_info` (native Interakt stores button name
 * as the object key); finally falls back to `'(Other clicks)'`.
 *
 * IMPORTANT: Use this only AFTER a `$match: { _waStage: 'clicked' }` stage so
 * the expensive $objectToArray runs only on the small clicked subset.
 */
/**
 * Mongo expression for the CTA bucket label on clicked documents.
 * Priority: _waButtonText → cta_click_info[entry].button_text → '(Other clicks)'
 *
 * cta_click_info entries use UUID keys; the human-readable button name is in
 * the entry VALUE as `button_text`. Migrated docs use key "link" (no button_text) — skipped.
 */
function ctaKeyExpr() {
  return {
    $let: {
      vars: {
        bt: '$_waButtonText',
        ctaObj: { $ifNull: ['$data.message.meta_data.cta_click_info', null] },
      },
      in: {
        $cond: [
          {
            $and: [
              { $ne: [{ $ifNull: ['$$bt', ''] }, ''] },
              { $ne: [{ $toString: { $ifNull: ['$$bt', ''] } }, '[]'] },
            ],
          },
          '$$bt',
          {
            $cond: [
              { $eq: [{ $type: '$$ctaObj' }, 'object'] },
              {
                $let: {
                  vars: {
                    // Filter out the "link" key (migrated docs), keep UUID entries
                    entries: {
                      $filter: {
                        input: { $objectToArray: '$$ctaObj' },
                        cond: { $ne: ['$$this.k', 'link'] },
                      },
                    },
                  },
                  in: {
                    $let: {
                      vars: {
                        // Extract button_text from each entry's value
                        btnTexts: {
                          $filter: {
                            input: {
                              $map: {
                                input: '$$entries',
                                as: 'e',
                                in: { $ifNull: ['$$e.v.button_text', ''] },
                              },
                            },
                            cond: { $ne: ['$$this', ''] },
                          },
                        },
                      },
                      in: {
                        $ifNull: [
                          { $arrayElemAt: ['$$btnTexts', 0] },
                          '(Other clicks)',
                        ],
                      },
                    },
                  },
                },
              },
              '(Other clicks)',
            ],
          },
        ],
      },
    },
  }
}

function decodeInteraktJwtPayload(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

// UUID pattern — cta_click_info keys are UUIDs, not button names
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Interakt click webhooks often omit `data.message.button_text` (or set it to "[]").
 * The CTA label may be inside JWT(s) in `data.message.message`, or inside
 * `data.message.meta_data.cta_click_info` where each entry's VALUE has a `button_text`
 * field (the key itself is a UUID). Migrated docs use the key "link" — those are skipped.
 */
function extractInteraktClickButtonLabel(doc) {
  const direct = doc?.button_text ?? doc?.data?.message?.button_text
  if (isUsefulWaButtonText(direct)) return String(direct).trim()

  const msgStr = doc?.data?.message?.message
  if (typeof msgStr === 'string' && msgStr.trim()) {
    try {
      const parts = JSON.parse(msgStr)
      if (Array.isArray(parts)) {
        for (const part of parts) {
          if (part?.type !== 'button' || !Array.isArray(part.parameters)) continue
          for (const param of part.parameters) {
            const text = param?.text
            if (!text || typeof text !== 'string') continue
            if (text.startsWith('eyJ')) {
              const payload = decodeInteraktJwtPayload(text)
              const bt =
                payload?.button_text ||
                payload?.buttonText ||
                payload?.cta_button_text ||
                payload?.button?.text ||
                payload?.button?.title
              if (isUsefulWaButtonText(bt)) return String(bt).trim()
            } else if (isUsefulWaButtonText(text)) {
              return text.trim()
            }
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // Native Interakt format: cta_click_info keys are UUIDs; button text is in the value.
  // Migrated/backfilled docs use "link" as the key (value has no button_text) — skip it.
  const ctaInfo = doc?.data?.message?.meta_data?.cta_click_info
  if (ctaInfo && typeof ctaInfo === 'object' && !Array.isArray(ctaInfo)) {
    for (const [k, v] of Object.entries(ctaInfo)) {
      if (k === 'link') continue
      const vbt = v?.button_text || v?.buttonText || v?.cta_button_text
      if (isUsefulWaButtonText(vbt)) return String(vbt).trim()
      // Key fallback: only if it is NOT a UUID (some older webhooks use readable key names)
      if (!UUID_RE.test(k) && isUsefulWaButtonText(k)) return k.trim()
    }
  }

  return null
}

/** Match timeline row to enriched click (template + time) to copy JWT-derived button label. */
function pickEnrichedButtonForTimelineRow(row, enrichedEvents) {
  if (!row || !enrichedEvents?.length) return ''
  if (isUsefulWaButtonText(row.button)) return String(row.button).trim()
  const rowMs = row.clickAtIso ? Date.parse(row.clickAtIso) : NaN
  const rowTpl = (row.template || '').trim()
  let best = ''
  let bestDelta = Infinity
  for (const ev of enrichedEvents) {
    if (!ev?.button) continue
    const evT = ev.clickAt?.getTime()
    if (Number.isFinite(rowMs) && evT != null) {
      const d = Math.abs(evT - rowMs)
      if (d <= 180_000 && (!rowTpl || !ev.template || ev.template === rowTpl) && d < bestDelta) {
        bestDelta = d
        best = ev.button
      }
    }
  }
  if (best) return String(best).trim()
  const sameTpl = enrichedEvents.find((ev) => ev.button && rowTpl && ev.template === rowTpl)
  if (sameTpl?.button) return String(sameTpl.button).trim()
  const any = enrichedEvents.find((ev) => ev.button)
  return any?.button ? String(any.button).trim() : ''
}

/**
 * Fallback: for click events that still have no button text after Interakt extraction,
 * look up `itm.marketingwa` by `firestore_id` (the unique key linking both collections).
 * Returns a Map<firestoreId, button_text> for all matched docs with a non-empty button_text.
 */
async function fetchMarketingwaButtonsByFirestoreId(mwaCol, firestoreIds) {
  if (!firestoreIds?.length || !mwaCol) return new Map()
  try {
    const docs = await mwaCol
      .find(
        { firestore_id: { $in: firestoreIds }, button_text: { $nin: [null, '', '[]'] } },
        { projection: { _id: 0, firestore_id: 1, button_text: 1, template_name: 1 } },
      )
      .limit(firestoreIds.length + 1)
      .toArray()
    const map = new Map()
    for (const d of docs) {
      if (d.firestore_id && isUsefulWaButtonText(d.button_text)) {
        map.set(String(d.firestore_id), { button_text: String(d.button_text).trim(), template_name: d.template_name || '' })
      }
    }
    return map
  } catch {
    return new Map()
  }
}

/**
 * Fills `clickAttrMap` button tags and `clickTimelineByNorm` from raw Interakt docs
 * (MBA form + IHM payment conversion tables; small bounded set of mobiles).
 *
 * Uses the same `_waStage` / `_waPhone` resolution as KPIs — not `type` regex alone,
 * so JWT-only button labels are found for the same rows that power the click timeline.
 */
async function enrichFormConversionClickDetailsFromInterakt(waCol, formSubmittedMobiles, clickAttrMap, clickTimelineByNorm, mwaCol = null, extraRawPhones = []) {
  const convertedNorms = new Set(
    formSubmittedMobiles.map((m) => normaliseMobile(m)).filter(Boolean),
  )
  if (convertedNorms.size === 0) return

  // Include raw phone values that normalise to a converted mobile so we catch
  // docs where _waPhone has unusual formatting (whitespace, +, leading 00, etc).
  const knownExtras = (extraRawPhones || []).filter((p) => {
    const n = normaliseMobile(p)
    return n && convertedNorms.has(n)
  })
  const variants = [...new Set([
    ...waPhoneVariantsForMatch(formSubmittedMobiles),
    ...knownExtras,
  ])]
  const waR = waResolvedFieldsExpr()
  const docs = await waCol
    .aggregate(
      [
        { $match: CLICKED_PRE_MATCH },
        { $addFields: waR },
        // Extend _waPhone to cover docs where phone is only in channel_phone_number
        { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
        { $match: { _waStage: 'clicked', _waPhone: { $in: variants } } },
        {
          $project: {
            firestore_id: 1,
            phone_number: 1,
            button_text: 1,
            template_name: 1,
            click_timestamp: 1,
            event_timestamp: 1,
            createdAt: 1,
            timestamp: 1,
            'data.customer': 1,
            'data.message': 1,
            _waPhone: 1,
            _waClickTs: 1,
            _waEventTs: 1,
            _waTemplate: 1,
          },
        },
        { $limit: 50_000 },
      ],
      { maxTimeMS: 120_000 },
    )
    .toArray()

  // Track event objects that still need a button so we can patch them after the mwa fallback
  const pendingMwaLookup = [] // [{ event: eventObj, fid: string }]

  const byNorm = new Map()
  for (const doc of docs) {
    const rawPhone =
      doc._waPhone ||
      doc.phone_number ||
      doc?.data?.customer?.phone_number ||
      doc?.data?.customer?.channel_phone_number
    const norm = normaliseMobile(rawPhone)
    if (!norm || !convertedNorms.has(norm)) continue

    if (!byNorm.has(norm)) byNorm.set(norm, { buttons: new Set(), events: [] })
    const row = byNorm.get(norm)

    let btn = extractInteraktClickButtonLabel(doc)
    if (btn) row.buttons.add(btn)

    let tpl = doc._waTemplate || doc.template_name || ''
    if (!tpl && doc?.data?.message?.raw_template) {
      try {
        const rt =
          typeof doc.data.message.raw_template === 'string'
            ? JSON.parse(doc.data.message.raw_template)
            : doc.data.message.raw_template
        tpl = rt?.name || ''
      } catch {
        tpl = ''
      }
    }

    let ts =
      parseOptDate(doc._waClickTs) ||
      parseOptDate(doc._waEventTs) ||
      parseOptDate(doc.click_timestamp) ||
      parseOptDate(doc.event_timestamp) ||
      parseOptDate(doc.createdAt)
    if (!ts && doc.timestamp != null) {
      const rawTs = String(doc.timestamp).trim()
      if (rawTs) {
        const isoish = /^\d{4}-\d{2}-\d{2}[ T]\d/.test(rawTs) && !rawTs.endsWith('Z') && !rawTs.includes('+')
          ? rawTs.replace(' ', 'T') + 'Z'
          : rawTs
        ts = parseOptDate(isoish)
      }
    }
    const eventObj = { template: tpl, button: btn || '', clickAt: ts }
    row.events.push(eventObj)

    // Queue for marketingwa fallback if button is still missing and we have a firestore_id link
    if (!btn && mwaCol) {
      const fid =
        doc.firestore_id ||
        doc?.data?.message?.meta_data?.marketingwa_source?.firestore_id
      if (fid) pendingMwaLookup.push({ event: eventObj, fid: String(fid), norm })
    }
  }

  // --- marketingwa firestore_id fallback ---
  // For click events that had no button text in Interakt, look them up by their
  // unique firestore_id in itm.marketingwa which stores button_text as a flat field.
  if (mwaCol && pendingMwaLookup.length > 0) {
    const uniqueFids = [...new Set(pendingMwaLookup.map((p) => p.fid))]
    const mwaButtonMap = await fetchMarketingwaButtonsByFirestoreId(mwaCol, uniqueFids)
    if (mwaButtonMap.size > 0) {
      for (const { event, fid, norm: entryNorm } of pendingMwaLookup) {
        const mwa = mwaButtonMap.get(fid)
        if (!mwa) continue
        event.button = mwa.button_text
        if (!event.template && mwa.template_name) event.template = mwa.template_name
        // Also propagate to the per-norm buttons set
        byNorm.get(entryNorm)?.buttons.add(mwa.button_text)
      }
    }
  }

  for (const norm of convertedNorms) {
    const enriched = byNorm.get(norm)
    const prev = clickAttrMap.get(norm) || { templates: [], buttons: [] }
    const templates = new Set((prev.templates || []).filter(Boolean))
    const buttons = new Set((prev.buttons || []).filter(isUsefulWaButtonText))
    if (enriched) {
      for (const b of enriched.buttons) buttons.add(b)
      for (const ev of enriched.events) {
        if (ev.template) templates.add(ev.template)
      }
    }
    clickAttrMap.set(norm, {
      templates: [...templates],
      buttons: [...buttons].filter(isUsefulWaButtonText),
    })

    if (!enriched?.events?.length) continue

    enriched.events.sort((a, b) => (a.clickAt?.getTime() || 0) - (b.clickAt?.getTime() || 0))
    const slice = enriched.events.slice(-40)
    const formatted = slice.map((e) => {
      const dt = e.clickAt
      const ok = dt && !Number.isNaN(dt.getTime())
      return {
        template: e.template || '',
        button: e.button || '',
        clickAtIso: ok ? dt.toISOString() : null,
        clickAtDisplay: ok
          ? dt.toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            })
          : '—',
      }
    })

    const existing = clickTimelineByNorm.get(norm)
    if (existing?.length) {
      const merged = existing.map((row) => {
        const b = pickEnrichedButtonForTimelineRow(row, enriched.events)
        return b ? { ...row, button: b } : row
      })
      clickTimelineByNorm.set(norm, merged)
    } else {
      clickTimelineByNorm.set(norm, formatted)
    }
  }
}

/**
 * Fills `button` on each entry in `clickBreakdown[].clicks` when Interakt only stores it inside JWT payload.
 * Matches by click time (not array index) so labels align with aggregation sort order.
 */
async function enrichClickBreakdownFromInterakt(waCol, clickBreakdownRows) {
  if (!Array.isArray(clickBreakdownRows) || clickBreakdownRows.length === 0) return

  const rawPhones = clickBreakdownRows.map((r) => r.phone).filter(Boolean)
  const variants = waPhoneVariantsForMatch(rawPhones.slice(0, 600))
  if (variants.length === 0) return

  const waR = waResolvedFieldsExpr()
  const docs = await waCol
    .aggregate(
      [
        { $match: CLICKED_PRE_MATCH },
        { $addFields: waR },
        { $match: { _waStage: 'clicked', _waPhone: { $in: variants } } },
        {
          $project: {
            phone_number: 1,
            'data.customer.phone_number': 1,
            'data.customer.channel_phone_number': 1,
            button_text: 1,
            'data.message.button_text': 1,
            'data.message.message': 1,
            'data.message.meta_data.cta_click_info': 1,
            click_timestamp: 1,
            event_timestamp: 1,
            createdAt: 1,
            timestamp: 1,
            _waPhone: 1,
            _waClickTs: 1,
            _waEventTs: 1,
          },
        },
        { $limit: 50_000 },
      ],
      { maxTimeMS: 120_000 },
    )
    .toArray()

  const byNorm = new Map()
  for (const doc of docs) {
    const n = normaliseMobile(
      doc._waPhone || doc.phone_number || doc?.data?.customer?.phone_number || doc?.data?.customer?.channel_phone_number,
    )
    if (!n) continue
    const btn = extractInteraktClickButtonLabel(doc)
    if (!btn) continue
    let ts =
      parseOptDate(doc._waClickTs) ||
      parseOptDate(doc._waEventTs) ||
      parseOptDate(doc.click_timestamp) ||
      parseOptDate(doc.event_timestamp) ||
      parseOptDate(doc.createdAt)
    if (!ts && doc.timestamp != null) {
      const rawTs = String(doc.timestamp).trim()
      if (rawTs) {
        const isoish = /^\d{4}-\d{2}-\d{2}[ T]\d/.test(rawTs) && !rawTs.endsWith('Z') && !rawTs.includes('+')
          ? rawTs.replace(' ', 'T') + 'Z'
          : rawTs
        ts = parseOptDate(isoish)
      }
    }
    if (!byNorm.has(n)) byNorm.set(n, [])
    byNorm.get(n).push({ btn, ts: ts?.getTime() || 0 })
  }
  for (const arr of byNorm.values()) {
    arr.sort((a, b) => b.ts - a.ts)
  }

  const WINDOW_MS = 180_000

  for (const row of clickBreakdownRows) {
    const n = normaliseMobile(row.phone)
    const events = byNorm.get(n) || []
    const clicks = row.clicks || []
    const used = new Set()
    for (let i = 0; i < clicks.length; i++) {
      if (isUsefulWaButtonText(clicks[i].button)) continue
      const ct = parseOptDate(clicks[i].time)
      const clickMs = ct?.getTime()
      let bestJ = -1
      let bestDelta = Infinity
      if (clickMs != null && !Number.isNaN(clickMs)) {
        for (let j = 0; j < events.length; j++) {
          if (used.has(j) || !events[j]?.btn) continue
          const evTs = events[j].ts
          if (evTs == null || evTs === 0) continue
          const d = Math.abs(evTs - clickMs)
          if (d <= WINDOW_MS && d < bestDelta) {
            bestDelta = d
            bestJ = j
          }
        }
      }
      if (bestJ >= 0) {
        clicks[i].button = events[bestJ].btn
        used.add(bestJ)
        continue
      }
      const fallback = events.findIndex((ev, j) => !used.has(j) && ev.btn)
      if (fallback >= 0) {
        clicks[i].button = events[fallback].btn
        used.add(fallback)
      }
    }
  }
}

/**
 * MBA: CTA + per-template button rows use Mongo `$_waButtonText`, which is usually empty on native Interakt
 * (label lives in JWT inside `data.message.message`). Re-aggregate from raw click docs with JS extraction.
 */
async function rebuildMbaCtaAndTemplateButtonStatsFromInterakt(waCol, waResolvedFields, waDateStages, nativeDatePreStages = []) {
  const US = '\x1f'
  const ctaMap = new Map()
  const tplBtnMap = new Map()

  function bumpCta(source, label, phone, templateName) {
    const key = `${source || 'api'}${US}${label}`
    if (!ctaMap.has(key)) {
      ctaMap.set(key, { total: 0, users: new Set(), templates: new Set() })
    }
    const o = ctaMap.get(key)
    o.total += 1
    if (phone) o.users.add(String(phone))
    if (templateName) o.templates.add(String(templateName))
  }

  function bumpTplBtn(templateName, label, phone) {
    const tpl = templateName || ''
    const key = `${tpl}${US}${label}`
    if (!tplBtnMap.has(key)) {
      tplBtnMap.set(key, { total: 0, users: new Set() })
    }
    const o = tplBtnMap.get(key)
    o.total += 1
    if (phone) o.users.add(String(phone))
  }

  const pipeline = [
    { $match: CLICKED_PRE_MATCH },   // covers both stage='clicked' AND native Interakt type='message_*_clicked' (no stage field)
    ...nativeDatePreStages,              // native date index for range queries
    { $addFields: waResolvedFields },
    ...waDateStages,
    { $match: { _waStage: 'clicked' } }, // safety net for edge-case doc shapes
    {
      $project: {
        _waSource: 1,
        _waTemplate: 1,
        _waPhone: 1,
        button_text: 1,
        'data.message.button_text': 1,
        'data.message.message': 1,
        'data.message.meta_data.cta_click_info': 1,
      },
    },
  ]

  const cursor = waCol.aggregate(pipeline, { allowDiskUse: true, maxTimeMS: 180_000, batchSize: 800 })
  for await (const doc of cursor) {
    const phone = doc._waPhone
    const raw = extractInteraktClickButtonLabel(doc)
    const label = raw && isUsefulWaButtonText(raw) ? String(raw).trim() : '(Other clicks)'
    const source = doc._waSource || 'api'
    const tpl = doc._waTemplate ? String(doc._waTemplate).trim() : ''
    bumpCta(source, label, phone, tpl)
    bumpTplBtn(tpl, label, phone)
  }

  const ctaResult = [...ctaMap.entries()]
    .map(([k, v]) => {
      const sep = k.indexOf(US)
      const source = sep >= 0 ? k.slice(0, sep) : 'api'
      const button_text = sep >= 0 ? k.slice(sep + US.length) : k
      return {
        _id: { button_text, source },
        total_clicks: v.total,
        unique_users: [...v.users],
        templates: [...v.templates],
      }
    })
    .sort((a, b) => b.total_clicks - a.total_clicks)

  const templateBtnResult = [...tplBtnMap.entries()]
    .map(([k, v]) => {
      const sep = k.indexOf(US)
      const rawTpl = sep >= 0 ? k.slice(0, sep) : ''
      const template_name = rawTpl ? rawTpl : null
      const button_text = sep >= 0 ? k.slice(sep + US.length) : k
      return {
        _id: { template_name, button_text },
        total_clicks: v.total,
        unique_users: [...v.users],
      }
    })
    .sort((a, b) => b.total_clicks - a.total_clicks)

  return { ctaResult, templateBtnResult }
}

const IHM_PAYMENT_STATUS_HINTS = ['complete', 'success', 'paid', 'captured', 'successful']

function ihmWebhookStatusLower(doc) {
  return String(doc.paymentStatus ?? doc.status ?? doc.payment_status ?? doc.eventType ?? doc.event_type ?? '').toLowerCase()
}

function ihmWebhookIsCompleted(doc) {
  const s = ihmWebhookStatusLower(doc)
  if (!s) return false
  return IHM_PAYMENT_STATUS_HINTS.some((h) => s.includes(h))
}

function ihmWebhookMobileRaw(doc) {
  if (!doc || typeof doc !== 'object') return ''
  return (
    doc.mobile_number ??
    doc.mobile ??
    doc.phone_number ??
    doc.phone ??
    doc.mobileno ??
    doc?.personal_details?.mobile_number ??
    doc?.personal_details?.mobile ??
    doc?.data?.mobile ??
    ''
  )
}

function ihmWebhookPaidAt(doc) {
  return parseOptDate(
    doc.event_timestamp ??
      doc.payment_completed_at ??
      doc.paid_at ??
      doc.paidAt ??
      doc.createdAt ??
      doc.updatedAt ??
      doc.timestamp,
  )
}

function ihmWebhookLeadId(doc) {
  const v = doc.lead_id ?? doc.leadId ?? doc.leadID ?? doc.npf_lead_id ?? doc?.data?.lead_id
  if (v == null || v === '') return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * IHM: clicked users with a completed payment in itm.npfPaymentWebhookEvents after first outbound
 * and on/after last WA click (same ordering rules as MBA form conversion).
 */
async function buildIhmPaymentConversion({
  client,
  clickedPhones,
  clickedPhoneDedup,
  normalisedClickedMobiles,
  waCol,
}) {
  const itmDb = client.db(ITM_DB)
  const ihmCol = itmDb.collection('npfPaymentWebhookEvents')
  const waR = waResolvedFieldsExpr()
  const clickedPhoneVariants = waPhoneVariantsForMatch(clickedPhoneDedup)

  // IHM: firstOutbound + lastClick share the same phone $in filter → one $facet scan
  const ihmAnchorRaw = clickedPhoneDedup.length > 0
    ? await waCol
        .aggregate(
          [
            { $addFields: waR },
            { $match: { _waPhone: { $in: clickedPhoneVariants } } },
            {
              $facet: {
                firstOutbound: [
                  { $match: { _waStage: { $in: ['sent', 'delivered'] } } },
                  { $group: { _id: '$_waPhone', firstOutbound: { $min: '$_waEventTs' } } },
                ],
                lastClick: [
                  { $match: { _waStage: 'clicked' } },
                  { $addFields: { _clickAt: { $ifNull: ['$_waClickTs', '$_waEventTs'] } } },
                  { $group: { _id: '$_waPhone', lastClickAt: { $max: '$_clickAt' } } },
                ],
              },
            },
          ],
          { allowDiskUse: true },
        )
        .toArray()
    : [{ firstOutbound: [], lastClick: [] }]

  const firstOutboundByNorm = new Map()
  for (const row of (ihmAnchorRaw[0]?.firstOutbound || [])) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const anchor = parseOptDate(row.firstOutbound)
    if (!anchor) continue
    const prev = firstOutboundByNorm.get(norm)
    if (!prev || anchor.getTime() < prev.getTime()) firstOutboundByNorm.set(norm, anchor)
  }

  const lastClickByNorm = new Map()
  for (const row of (ihmAnchorRaw[0]?.lastClick || [])) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const t = parseOptDate(row.lastClickAt)
    if (!t) continue
    const prev = lastClickByNorm.get(norm)
    if (!prev || t.getTime() > prev.getTime()) lastClickByNorm.set(norm, t)
  }

  const phoneVariantSet = new Set()
  for (const raw of clickedPhoneDedup) {
    const n = normaliseMobile(raw)
    if (!n) continue
    phoneVariantSet.add(n)
    if (n.length === 10) phoneVariantSet.add(`91${n}`)
  }
  const variants = [...phoneVariantSet]

  const completedByNorm = new Map()
  const MOBILE_KEYS = ['mobile_number', 'mobile', 'phone_number', 'phone']
  const CHUNK = 400
  for (let i = 0; i < variants.length; i += CHUNK) {
    const chunk = variants.slice(i, i + CHUNK)
    const orConds = MOBILE_KEYS.map((k) => ({ [k]: { $in: chunk } }))
    const chunkDocs = await ihmCol.find({ $or: orConds }).maxTimeMS(120000).toArray()
    for (const doc of chunkDocs) {
      if (!ihmWebhookIsCompleted(doc)) continue
      const norm = normaliseMobile(ihmWebhookMobileRaw(doc))
      if (!norm) continue
      const paidAt = ihmWebhookPaidAt(doc)
      if (!paidAt) continue
      const prev = completedByNorm.get(norm)
      const lead = ihmWebhookLeadId(doc)
      if (!prev || paidAt.getTime() > prev.paidAt.getTime()) {
        completedByNorm.set(norm, {
          paidAt,
          leadId: lead || prev?.leadId || null,
        })
      }
    }
  }

  const normToRawPhone = new Map()
  for (const raw of clickedPhones) {
    const n = normaliseMobile(raw)
    if (!n || normToRawPhone.has(n)) continue
    normToRawPhone.set(n, raw)
  }

  const ihmRows = []
  for (const norm of normalisedClickedMobiles) {
    const pay = completedByNorm.get(norm)
    if (!pay) continue
    const outboundAnchor = firstOutboundByNorm.get(norm)
    const lastClick = lastClickByNorm.get(norm)
    if (!outboundAnchor || !lastClick) continue
    if (!isOnOrAfter(pay.paidAt, outboundAnchor)) continue
    if (!isOnOrAfter(pay.paidAt, lastClick)) continue
    ihmRows.push({
      norm,
      mobile: normToRawPhone.get(norm) || norm,
      paidAt: pay.paidAt,
      leadId: pay.leadId,
    })
  }

  const formSubmittedMobiles = ihmRows.map((r) => r.mobile)
  const convertedMobiles = [...new Set(formSubmittedMobiles)]
  // Seed variants with raw _waPhone values from batch1 that normalise to a converted mobile
  const convertedNormSet = new Set(convertedMobiles.map(normaliseMobile).filter(Boolean))
  const knownRawPhones = clickedPhoneDedup.filter((p) => {
    const n = normaliseMobile(p)
    return n && convertedNormSet.has(n)
  })
  const convertedPhoneVariants = [...new Set([
    ...waPhoneVariantsForMatch(convertedMobiles),
    ...knownRawPhones,
  ])]

  const clickAttrResult = convertedMobiles.length > 0
    ? await waCol
        .aggregate([
          { $match: CLICKED_PRE_MATCH },
          { $addFields: waR },
          { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
          { $match: { _waStage: 'clicked', _waPhone: { $in: convertedPhoneVariants } } },
          { $addFields: { _ctaKey: ctaKeyExpr() } },
          {
            $group: {
              _id: '$_waPhone',
              templates: { $addToSet: '$_waTemplate' },
              buttons: { $addToSet: '$_ctaKey' },
            },
          },
        ])
        .toArray()
    : []

  const clickAttrMap = new Map()
  for (const r of clickAttrResult) {
    const norm = normaliseMobile(r._id)
    if (!norm) continue
    const prev = clickAttrMap.get(norm)
    const templates = new Set([...(prev?.templates || []), ...(r.templates || [])].filter(Boolean))
    const buttons = new Set([...(prev?.buttons || []), ...(r.buttons || [])].filter(isUsefulWaButtonText))
    clickAttrMap.set(norm, { templates: [...templates], buttons: [...buttons] })
  }

  const clickTimelineByNorm = new Map()
  await enrichFormConversionClickDetailsFromInterakt(waCol, formSubmittedMobiles, clickAttrMap, clickTimelineByNorm, itmDb.collection('marketingwa'), clickedPhoneDedup)

  const formMetaByNorm = new Map()
  for (const row of ihmRows) {
    const dt = row.paidAt
    formMetaByNorm.set(row.norm, {
      formSubmittedAtIso: dt ? dt.toISOString() : null,
      formSubmittedAtDisplay: dt
        ? dt.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })
        : '—',
      leadIdFromNpf: row.leadId,
    })
  }

  const n = ihmRows.length
  const rate = clickedPhones.length > 0 ? parseFloat(((n / clickedPhones.length) * 100).toFixed(2)) : 0

  return {
    conversionKind: 'ihm_payment_webhook',
    totalClicked: clickedPhones.length,
    formSubmitted: n,
    conversionRate: rate,
    formSubmittedMobiles,
    formSubmittedDetails: formSubmittedMobiles.map((m) => {
      const norm = normaliseMobile(m)
      const attr = clickAttrMap.get(norm)
      const meta = formMetaByNorm.get(norm)
      return {
        mobile: m,
        leadId: meta?.leadIdFromNpf || null,
        formSubmittedAtIso: meta?.formSubmittedAtIso ?? null,
        formSubmittedAtDisplay: meta?.formSubmittedAtDisplay ?? '—',
        clickedTemplates: attr?.templates || [],
        clickedButtons: attr?.buttons || [],
        clickTimeline: clickTimelineByNorm.get(norm) || [],
      }
    }),
  }
}

/**
 * BBA / BTECH form conversion.
 * Looks up npfApplicationsWebhookEventsBBA / BTech for phones that clicked a WA message,
 * then filters to apps submitted on or after the first WA send AND last click.
 *
 * Collection schema (flat top-level fields):
 *   Mobile_Number  — "+91-9XXXXXXXXX" format
 *   Application_Number_Auto_Generated — non-empty means submitted
 *   Application_Completion_Date — completion timestamp (string "YYYY-MM-DD HH:MM:SS")
 *   Lead_ID — present in BTech, absent in BBA
 *   application_stage — "Submitted" when complete
 */
async function buildIsuFormConversion({
  client,
  clickedPhones,
  clickedPhoneDedup,
  normalisedClickedMobiles,
  waCol,
  waResolvedFields,
  nativeDatePreStages,
  startDate,
  endDate,
  isuAppsDb,
  isuAppsCollection,
  isuAppsPhoneField = 'Mobile_Number',
  isuPaymentCollection = null,
}) {
  const isuDb = client.db(isuAppsDb)
  const appsCol = isuDb.collection(isuAppsCollection)
  const waR = waResolvedFields
  const phoneField = isuAppsPhoneField

  // All phone variants for the full clicked set
  const clickedPhoneVariants = waPhoneVariantsForMatch(clickedPhoneDedup)

  // Step 1: firstOutbound + lastClick per phone (same $facet pattern as MBA anchor)
  const anchorRaw = clickedPhoneDedup.length > 0
    ? await waCol.aggregate([
        { $addFields: waR },
        { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
        { $match: { _waPhone: { $in: clickedPhoneDedup } } },
        {
          $facet: {
            firstOutbound: [
              { $match: { _waStage: { $in: ['sent', 'delivered'] } } },
              { $group: { _id: '$_waPhone', firstOutbound: { $min: '$_waEventTs' } } },
            ],
            lastClick: [
              { $match: { _waStage: 'clicked' } },
              { $addFields: { _clickAt: { $ifNull: ['$_waClickTs', '$_waEventTs'] } } },
              { $group: { _id: '$_waPhone', lastClickAt: { $max: '$_clickAt' } } },
            ],
          },
        },
      ], { allowDiskUse: true }).toArray()
    : [{ firstOutbound: [], lastClick: [] }]

  const firstOutboundByNorm = new Map()
  for (const row of (anchorRaw[0]?.firstOutbound || [])) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const t = parseOptDate(row.firstOutbound)
    if (!t) continue
    const prev = firstOutboundByNorm.get(norm)
    if (!prev || t.getTime() < prev.getTime()) firstOutboundByNorm.set(norm, t)
  }

  const lastClickByNorm = new Map()
  for (const row of (anchorRaw[0]?.lastClick || [])) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const t = parseOptDate(row.lastClickAt)
    if (!t) continue
    const prev = lastClickByNorm.get(norm)
    if (!prev || t.getTime() > prev.getTime()) lastClickByNorm.set(norm, t)
  }

  // Step 2: find applications for clicked phones
  // Phone stored as "+91-9XXXXXXXXX" — normaliseMobile handles this now
  const allMobileVariants = waPhoneVariantsForMatch(normalisedClickedMobiles)
  // Also add the "+91-" dash format that these collections use
  const dashVariants = normalisedClickedMobiles.map((n) => `+91-${n}`)

  // Application number field: BBA/BTech/IHM/IDM use different field names
  const appNoField = '$Application_Number_Auto_Generated'
  const appNoAltField = '$Application_Number'

  const formSubmittedAgg = normalisedClickedMobiles.length > 0
    ? await appsCol.aggregate([
        {
          $match: {
            [phoneField]: { $in: [...allMobileVariants, ...dashVariants] },
            $or: [
              { Application_Number_Auto_Generated: { $nin: [null, ''] } },
              { Application_Number: { $nin: [null, ''] } },
            ],
          },
        },
        {
          $addFields: {
            _sortAt: {
              $ifNull: [
                { $dateFromString: { dateString: '$Application_Completion_Date', onError: null, onNull: null } },
                { $dateFromString: { dateString: '$Updated_Date', onError: null, onNull: null } },
                '$createdAt',
              ],
            },
            _appNo: { $ifNull: [appNoField, appNoAltField] },
          },
        },
        {
          $group: {
            _id: `$${phoneField}`,
            formSubmittedAt: { $max: '$_sortAt' },
            applicationNo: { $last: '$_appNo' },
            leadIdRaw: { $last: { $ifNull: ['$Lead_ID', '$lead_id'] } },
            applicationStage: { $last: { $ifNull: ['$application_stage', '$Application_Stage'] } },
          },
        },
      ]).toArray()
    : []

  // Step 3: filter to apps submitted on/after firstOutbound AND lastClick,
  // then deduplicate by normalised mobile (some docs store Mobile_No_Alt with/without +91- prefix).
  const seenNormsStep3 = new Set()
  const formSubmittedResult = formSubmittedAgg.filter((r) => {
    const norm = normaliseMobile(r._id)
    const outboundAnchor = firstOutboundByNorm.get(norm)
    const lastClick = lastClickByNorm.get(norm)
    if (!outboundAnchor || !lastClick || r.formSubmittedAt == null) return false
    if (!isOnOrAfter(r.formSubmittedAt, outboundAnchor)) return false
    if (!isOnOrAfter(r.formSubmittedAt, lastClick)) return false
    if (seenNormsStep3.has(norm)) return false
    seenNormsStep3.add(norm)
    return true
  })

  const formSubmittedMobiles = formSubmittedResult.map((r) => r._id)
  const convertedMobiles = [...new Set(formSubmittedMobiles)]

  const convertedNormSet = new Set(convertedMobiles.map(normaliseMobile).filter(Boolean))
  const knownRawPhones = clickedPhoneDedup.filter((p) => {
    const n = normaliseMobile(p)
    return n && convertedNormSet.has(n)
  })
  const convertedPhoneVariants = [...new Set([
    ...waPhoneVariantsForMatch(convertedMobiles),
    ...knownRawPhones,
  ])]

  // Step 4: click attribution (template + button) for converted phones
  const clickAttrResult = convertedMobiles.length > 0
    ? await waCol.aggregate([
        { $match: CLICKED_PRE_MATCH },
        { $addFields: waR },
        { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
        { $match: { _waStage: 'clicked', _waPhone: { $in: convertedPhoneVariants } } },
        { $addFields: { _ctaKey: ctaKeyExpr() } },
        {
          $group: {
            _id: '$_waPhone',
            templates: { $addToSet: '$_waTemplate' },
            buttons: { $addToSet: '$_ctaKey' },
          },
        },
      ]).toArray()
    : []

  const clickAttrMap = new Map()
  for (const r of clickAttrResult) {
    const norm = normaliseMobile(r._id)
    if (!norm) continue
    const prev = clickAttrMap.get(norm)
    const templates = new Set([...(prev?.templates || []), ...(r.templates || [])].filter(Boolean))
    const buttons = new Set([...(prev?.buttons || []), ...(r.buttons || [])].filter(isUsefulWaButtonText))
    clickAttrMap.set(norm, { templates: [...templates], buttons: [...buttons] })
  }

  // Step 5: click timeline for converted phones
  const clickTimelineByNorm = new Map()
  if (convertedMobiles.length > 0) {
    const timelineMatch = { _waStage: 'clicked', _waPhone: { $in: convertedPhoneVariants } }
    if (startDate || endDate) {
      timelineMatch._waEventTs = {}
      if (startDate) timelineMatch._waEventTs.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate); end.setDate(end.getDate() + 1)
        timelineMatch._waEventTs.$lt = end
      }
    }
    const tlResult = await waCol.aggregate([
      { $match: CLICKED_PRE_MATCH },
      ...nativeDatePreStages,
      { $addFields: waR },
      { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
      { $match: timelineMatch },
      { $addFields: { _ctaKey: ctaKeyExpr() } },
      { $sort: { _waEventTs: 1 } },
      {
        $group: {
          _id: '$_waPhone',
          events: { $push: { template: '$_waTemplate', button: '$_ctaKey', clickAt: { $ifNull: ['$_waClickTs', '$_waEventTs'] } } },
        },
      },
    ]).toArray()

    for (const row of tlResult) {
      const norm = normaliseMobile(row._id)
      if (!norm) continue
      const rawEvents = (row.events || []).slice(-40)
      clickTimelineByNorm.set(norm, rawEvents.map((e) => {
        const dt = parseOptDate(e.clickAt)
        const ok = dt && !Number.isNaN(dt.getTime())
        return {
          template: e.template || '',
          button: isUsefulWaButtonText(e.button) ? String(e.button).trim() : '',
          clickAtIso: ok ? dt.toISOString() : null,
          clickAtDisplay: ok ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '—',
        }
      }))
    }
  }

  await enrichFormConversionClickDetailsFromInterakt(waCol, formSubmittedMobiles, clickAttrMap, clickTimelineByNorm, null, clickedPhoneDedup)

  // Step 6: build formMetaByNorm
  const formMetaByNorm = new Map()
  for (const r of formSubmittedResult) {
    const norm = normaliseMobile(r._id)
    if (!norm) continue
    const dt = parseOptDate(r.formSubmittedAt)
    formMetaByNorm.set(norm, {
      formSubmittedAtIso: dt ? dt.toISOString() : null,
      formSubmittedAtDisplay: dt
        ? dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
        : '—',
      leadIdRaw: r.leadIdRaw ? String(r.leadIdRaw).trim() : null,
      applicationNo: r.applicationNo || null,
      applicationStage: r.applicationStage ? String(r.applicationStage).trim() : null,
    })
  }

  // Step 7: payment lookup — BBA/BTech by Application_Number, IDM by application_number (lowercase), IHM by lead_id
  const paymentByKey = new Map()
  if (isuPaymentCollection && formSubmittedResult.length > 0) {
    const appNos   = formSubmittedResult.map((r) => r.applicationNo).filter(Boolean)
    const leadIds  = formSubmittedResult.map((r) => r.leadIdRaw).filter(Boolean)

    if (appNos.length > 0 || leadIds.length > 0) {
      const payCol = client.db(isuAppsDb).collection(isuPaymentCollection)
      const payDocs = await payCol.find({
        $or: [
          // BBA / BTech
          ...(appNos.length  > 0 ? [{ Application_Number: { $in: appNos } }]   : []),
          // IDM (lowercase field)
          ...(appNos.length  > 0 ? [{ application_number: { $in: appNos } }]   : []),
          // BBA / BTech Lead_ID (uppercase)
          ...(leadIds.length > 0 ? [{ Lead_ID: { $in: leadIds } }]             : []),
          // IHM lead_id (lowercase)
          ...(leadIds.length > 0 ? [{ lead_id: { $in: leadIds } }]             : []),
        ],
      }).toArray()

      for (const p of payDocs) {
        // Resolve the link key — try every possible field
        const key = p.Application_Number || p.application_number || p.Lead_ID || p.lead_id
        if (!key) continue
        const existing = paymentByKey.get(key)
        // Prefer paymentStatus (NPF completion flag: "Complete") over Payment_Status
        // (stage tracker: "Pre Payment" / "Payment Approved") to avoid false negatives.
        const rawStatus = p.paymentStatus || p.Payment_Status || ''
        const paidAt = parseOptDate(p.Payment_Approved_Date) || parseOptDate(p.createdAt)
        if (!existing || (paidAt && existing.paidAt && paidAt.getTime() > existing.paidAt.getTime())) {
          paymentByKey.set(key, {
            paymentDone: /approved|success|complete/i.test(rawStatus),
            paymentStatus: p.paymentStatus || p.Payment_Status || null,
            paymentAmount: p.Payment_Amount || null,
            transactionId: p.Transaction_ID || null,
            paidAt,
            paidAtDisplay: paidAt
              ? paidAt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
              : '—',
          })
        }
      }
    }
  }

  const n = formSubmittedResult.length
  const rate = clickedPhones.length > 0 ? parseFloat(((n / clickedPhones.length) * 100).toFixed(2)) : 0

  return {
    conversionKind: 'isu_form',
    totalClicked: clickedPhones.length,
    formSubmitted: n,
    conversionRate: rate,
    formSubmittedMobiles,
    formSubmittedDetails: formSubmittedMobiles.map((m) => {
      const norm = normaliseMobile(m)
      const attr = clickAttrMap.get(norm)
      const meta = formMetaByNorm.get(norm)
      const appNo = meta?.applicationNo
      const leadId = meta?.leadIdRaw
      const payment = paymentByKey.get(appNo) || paymentByKey.get(leadId) || null
      return {
        mobile: m,
        leadId: meta?.leadIdRaw || appNo || null,
        applicationStage: meta?.applicationStage || null,
        formSubmittedAtIso: meta?.formSubmittedAtIso ?? null,
        formSubmittedAtDisplay: meta?.formSubmittedAtDisplay ?? '—',
        paymentDone: payment?.paymentDone ?? null,
        paymentStatus: payment?.paymentStatus ?? null,
        paymentAmount: payment?.paymentAmount ?? null,
        paymentAtDisplay: payment?.paidAtDisplay ?? null,
        clickedTemplates: attr?.templates || [],
        clickedButtons: attr?.buttons || [],
        clickTimeline: clickTimelineByNorm.get(norm) || [],
      }
    }),
  }
}

export async function computeWADashboard({ mode = 'cached', startDate, endDate, workspace } = {}) {
  const start = Date.now()
  const cfg = waWorkspaceConfig(workspace)

  const client = await clientPromise
  const db = client.db(ITM_DB)
  const cacheCol = db.collection(CACHE_COL)

  if (mode === 'cached' && !startDate && !endDate) {
    let cached = await cacheCol.findOne({ _id: cfg.cacheKey })
    if (!cached && cfg.includeMbaConversion) {
      cached = await cacheCol.findOne({ _id: WA_DASHBOARD_CACHE_ID_MBA_LEGACY })
    }
    if (cached && workspacePayloadMatchesExpected(cached, cfg.workspace)) {
      return { ...cached, _id: undefined, fromCache: true, elapsed: Date.now() - start }
    }
    // Cache miss — return empty placeholder; do NOT fall through to full compute which would timeout
    return {
      channel: 'wa',
      workspace: cfg.workspace,
      pending: true,
      kpi: { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0, ctr: 0, readRate: 0, sdr: 0, str: 0 },
      funnel: { sent: 0, delivered: 0, read: 0, clicked: 0 },
      templateRows: [],
      ctaRows: [],
      clickBreakdown: [],
      rawDocCount: 0,
      lastRawDocTime: null,
      formSubmittedCount: 0,
      paymentConversion: { totalClicked: 0, formSubmitted: 0, conversionRate: 0, formSubmittedMobiles: [], formSubmittedDetails: [] },
      computedAt: null,
      fromCache: false,
      elapsed: Date.now() - start,
    }
  }

  const waDb = client.db(cfg.dataDb)
  const waCol = waDb.collection(cfg.waCollection)

  /** Interakt + flattened rows: filter on resolved event time. */
  const waDocMatch = {}
  if (startDate || endDate) {
    waDocMatch._waEventTs = {}
    if (startDate) waDocMatch._waEventTs.$gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setDate(end.getDate() + 1)
      waDocMatch._waEventTs.$lt = end
    }
  }
  const waResolvedFields = waResolvedFieldsExpr()
  const waRangeMatch = {}
  if (startDate) waRangeMatch._waEventTs = { ...(waRangeMatch._waEventTs || {}), $gte: new Date(startDate) }
  if (endDate) {
    const end = new Date(endDate)
    end.setDate(end.getDate() + 1)
    waRangeMatch._waEventTs = { ...(waRangeMatch._waEventTs || {}), $lt: end }
  }

  const waBreakdownMatch = { _waStage: 'clicked' }
  if (startDate || endDate) {
    waBreakdownMatch._waEventTs = {}
    if (startDate) waBreakdownMatch._waEventTs.$gte = new Date(startDate)
    if (endDate) {
      const end = new Date(endDate)
      end.setDate(end.getDate() + 1)
      waBreakdownMatch._waEventTs.$lt = end
    }
  }

  const waDateStages = Object.keys(waDocMatch).length ? [{ $match: waDocMatch }] : []

  // Pre-filter on native (indexable) date fields BEFORE $addFields so MongoDB can use an index.
  // $addFields computes derived fields (_waEventTs etc.) which cannot be indexed.
  // waDateStages acts as the authoritative filter afterwards for edge-case doc shapes.
  const nativeDatePreStages = []
  if (startDate || endDate) {
    const f = {}
    if (startDate) f.$gte = new Date(startDate)
    if (endDate) {
      const e = new Date(endDate)
      e.setDate(e.getDate() + 1)
      f.$lt = e
    }
    nativeDatePreStages.push({ $match: { $or: [{ event_timestamp: f }, { createdAt: f }] } })
  }

  const hasDates = !!(startDate || endDate)

  // ─── Batch 1: ONE collection scan via $facet (kpi + templates + clickedPhones + failures + optional totalCount) ───
  // When no date filter, use estimatedDocumentCount() for rawDocCount (instant) and omit totalCount facet.
  const totalDocsPromise = hasDates ? null : waCol.estimatedDocumentCount()

  const batch1Facets = {
    kpi: [
      {
        $group: {
          _id: null,
          sent: { $sum: { $cond: [{ $eq: ['$_waStage', 'sent'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$_waStage', 'delivered'] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$_waStage', 'read'] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $eq: ['$_waStage', 'clicked'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$_waStage', 'failed'] }, 1, 0] } },
          cost: { $sum: { $ifNull: ['$_waCost', 0] } },
        },
      },
    ],
    templates: [
      {
        $group: {
          _id: '$_waTemplate',
          sent: { $sum: { $cond: [{ $eq: ['$_waStage', 'sent'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$_waStage', 'delivered'] }, 1, 0] } },
          read: { $sum: { $cond: [{ $eq: ['$_waStage', 'read'] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $eq: ['$_waStage', 'clicked'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$_waStage', 'failed'] }, 1, 0] } },
          cost: { $sum: { $ifNull: ['$_waCost', 0] } },
          source: { $first: '$_waSource' },
          firstSeen: { $min: '$_waEventTs' },
          lastSeen: { $max: '$_waEventTs' },
        },
      },
      { $sort: { clicked: -1 } },
    ],
    clickedPhones: [
      { $match: { _waStage: 'clicked', _waPhone: { $nin: [null, ''] } } },
      { $group: { _id: '$_waPhone' } },
    ],
    failures: [
      { $match: { _waStage: 'failed', _waFailureReason: { $nin: [null, ''] } } },
      {
        $group: {
          _id: { template_name: '$_waTemplate', failure_reason: '$_waFailureReason' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ],
  }
  if (hasDates) batch1Facets.totalCount = [{ $count: 'n' }]

  const batch1Raw = await waCol.aggregate(
    [
      ...nativeDatePreStages,
      { $addFields: waResolvedFields },
      // For native Interakt docs (BBA/BTech/IHM/IDM) phone_number is absent; fall back to channel_phone_number
      { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
      ...waDateStages,
      { $facet: batch1Facets },
    ],
    { allowDiskUse: true },
  ).toArray()

  const batch1 = batch1Raw[0] || {}
  const kpiResult = batch1.kpi || []
  const templateResult = batch1.templates || []
  const clickedPhonesResult = batch1.clickedPhones || []
  const failureResult = batch1.failures || []
  const totalDocs = hasDates
    ? (batch1.totalCount?.[0]?.n ?? 0)
    : await totalDocsPromise

  // ─── Batch 2: CTA + templateBtn — ONE scan via $facet, ctaKeyExpr computed once ───
  // Skip entirely for MBA: rebuildMbaCtaAndTemplateButtonStatsFromInterakt produces these instead.
  let ctaResult = []
  let templateBtnResult = []
  if (!cfg.includeMbaConversion) {
    const batch2Raw = await waCol.aggregate(
      [
        { $match: CLICKED_PRE_MATCH },
        ...nativeDatePreStages,
        { $addFields: waResolvedFields },
        { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
        ...waDateStages,
        { $match: { _waStage: 'clicked' } },
        { $addFields: { _ctaKey: ctaKeyExpr() } },
        {
          $facet: {
            cta: [
              {
                $group: {
                  _id: { button_text: '$_ctaKey', source: '$_waSource' },
                  total_clicks: { $sum: 1 },
                  unique_users: { $addToSet: '$_waPhone' },
                  templates: { $addToSet: '$_waTemplate' },
                },
              },
              { $sort: { total_clicks: -1 } },
            ],
            templateBtn: [
              {
                $group: {
                  _id: { template_name: '$_waTemplate', button_text: '$_ctaKey' },
                  total_clicks: { $sum: 1 },
                  unique_users: { $addToSet: '$_waPhone' },
                },
              },
              { $sort: { total_clicks: -1 } },
            ],
          },
        },
      ],
      { allowDiskUse: true },
    ).toArray()
    ctaResult = batch2Raw[0]?.cta || []
    templateBtnResult = batch2Raw[0]?.templateBtn || []
  } else {
    const rebuilt = await rebuildMbaCtaAndTemplateButtonStatsFromInterakt(waCol, waResolvedFields, waDateStages, nativeDatePreStages)
    ctaResult = rebuilt.ctaResult
    templateBtnResult = rebuilt.templateBtnResult
  }

  const rawKpi = kpiResult[0] || { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0 }
  delete rawKpi._id
  rawKpi.ctr = pct(rawKpi.clicked, rawKpi.delivered)
  rawKpi.readRate = pct(rawKpi.read, rawKpi.delivered)
  rawKpi.sdr = pct(rawKpi.delivered, rawKpi.sent)
  rawKpi.str = pct(rawKpi.read, rawKpi.sent)

  const tplBtnMap = {}
  for (const r of templateBtnResult) {
    const tpl = r._id.template_name
    if (!tplBtnMap[tpl]) tplBtnMap[tpl] = []
    tplBtnMap[tpl].push({
      button_text: r._id.button_text,
      total_clicks: r.total_clicks,
      unique_users: r.unique_users?.length || 0,
    })
  }

  const tplFailMap = {}
  for (const r of failureResult) {
    const tpl = r._id.template_name
    if (!tplFailMap[tpl]) tplFailMap[tpl] = []
    tplFailMap[tpl].push({ reason: r._id.failure_reason, count: r.count })
  }

  const templateRows = templateResult
    .filter((r) => r._id)
    .map((r) => ({
      template_name: r._id,
      source: r.source || 'api',
      sent: r.sent,
      delivered: r.delivered,
      read: r.read,
      clicked: r.clicked,
      failed: r.failed,
      total_cost: r.cost,
      ctr: pct(r.clicked, r.delivered),
      readRate: pct(r.read, r.delivered),
      sdr: pct(r.delivered, r.sent),
      str: pct(r.read, r.sent),
      firstSeen: r.firstSeen ? new Date(r.firstSeen).toISOString() : null,
      lastSeen: r.lastSeen ? new Date(r.lastSeen).toISOString() : null,
      failureReasons: tplFailMap[r._id] || [],
      templateBtnStats: tplBtnMap[r._id] || [],
    }))

  const ctaRows = ctaResult.map((r) => ({
    button_text: r._id.button_text,
    source: r._id.source || 'api',
    total_clicks: r.total_clicks,
    unique_users: r.unique_users?.length || 0,
    template_used: (r.templates || []).filter(Boolean).join(', ') || '—',
    links: [],
    click_types: '',
  }))

  const funnel = {
    sent: rawKpi.sent,
    delivered: rawKpi.delivered,
    read: rawKpi.read,
    clicked: rawKpi.clicked,
  }

  const costPerClick = rawKpi.clicked > 0 ? rawKpi.cost / rawKpi.clicked : 0
  const totalCost = rawKpi.cost

  const clickedPhones = clickedPhonesResult.map((r) => String(r._id)).filter(Boolean)
  const normalisedClickedMobiles = [...new Set(clickedPhones.map(normaliseMobile).filter(Boolean))]
  const clickedPhoneDedup = [...new Set(clickedPhones.filter(Boolean))]

  const engagementSummary = {
    total: clickedPhones.length,
    clickedCount: clickedPhones.length,
  }

  const buttonPhones = {}
  for (const r of ctaResult) {
    if (r._id.button_text) {
      buttonPhones[r._id.button_text] = r.unique_users || []
    }
  }

  let templatePhones = {}
  let clickBreakdown = []
  let formSubmittedCount = 0
  let paymentConversion

  if (!cfg.includeMbaConversion) {
    // IHM branch: templatePhones + clickBreakdown share same prefix → one $facet scan
    const ihmBranchRaw = await waCol.aggregate(
      [
        { $match: CLICKED_PRE_MATCH },
        ...nativeDatePreStages,
        { $addFields: waResolvedFields },
        { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
        { $match: waBreakdownMatch },
        {
          $facet: {
            templatePhones: [
              { $match: { _waTemplate: { $nin: [null, ''] } } },
              { $group: { _id: '$_waTemplate', phones: { $addToSet: '$_waPhone' } } },
            ],
            clickBreakdown: [
              { $sort: { _waEventTs: -1 } },
              {
                $group: {
                  _id: '$_waPhone',
                  clicks: {
                    $push: {
                      template: '$_waTemplate',
                      button: '$_waButtonText',
                      link: '$button_link',
                      type: '$click_type',
                      time: { $ifNull: ['$_waClickTs', '$_waEventTs'] },
                    },
                  },
                },
              },
            ],
          },
        },
      ],
      { allowDiskUse: true },
    ).toArray()

    for (const r of (ihmBranchRaw[0]?.templatePhones || [])) {
      if (r._id) templatePhones[r._id] = r.phones || []
    }

    clickBreakdown = (ihmBranchRaw[0]?.clickBreakdown || [])
      .filter((r) => r._id)
      .map((r) => ({
        phone: r._id,
        leadId: null,
        totalClicks: r.clicks.length,
        clicks: r.clicks.slice(0, 20),
      }))
      .sort((a, b) => b.totalClicks - a.totalClicks)

    await enrichClickBreakdownFromInterakt(waCol, clickBreakdown)

    if (cfg.ihmPaymentWebhookCollection) {
      paymentConversion = await buildIhmPaymentConversion({
        client,
        clickedPhones,
        clickedPhoneDedup,
        normalisedClickedMobiles,
        waCol,
      })
      formSubmittedCount = paymentConversion.formSubmitted
    } else if (cfg.isuAppsCollection) {
      paymentConversion = await buildIsuFormConversion({
        client,
        clickedPhones,
        clickedPhoneDedup,
        normalisedClickedMobiles,
        waCol,
        waResolvedFields,
        nativeDatePreStages,
        startDate,
        endDate,
        isuAppsDb: cfg.isuAppsDb,
        isuAppsCollection: cfg.isuAppsCollection,
        isuAppsPhoneField: cfg.isuAppsPhoneField,
        isuPaymentCollection: cfg.isuPaymentCollection,
      })
      formSubmittedCount = paymentConversion.formSubmitted
    } else {
      paymentConversion = {
        totalClicked: clickedPhones.length,
        formSubmitted: 0,
        conversionRate: 0,
        formSubmittedMobiles: [],
        formSubmittedDetails: [],
      }
    }
  } else {
  // MBA: firstOutbound + lastClick share the same phone $in filter → one $facet scan
  const mbaAnchorRaw = clickedPhoneDedup.length > 0
    ? await waCol.aggregate(
        [
          { $addFields: waResolvedFields },
          { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
          { $match: { _waPhone: { $in: clickedPhoneDedup } } },
          {
            $facet: {
              firstOutbound: [
                { $match: { _waStage: { $in: ['sent', 'delivered'] } } },
                { $group: { _id: '$_waPhone', firstOutbound: { $min: '$_waEventTs' } } },
              ],
              lastClick: [
                { $match: { _waStage: 'clicked' } },
                { $addFields: { _clickAt: { $ifNull: ['$_waClickTs', '$_waEventTs'] } } },
                { $group: { _id: '$_waPhone', lastClickAt: { $max: '$_clickAt' } } },
              ],
            },
          },
        ],
        { allowDiskUse: true },
      ).toArray()
    : [{ firstOutbound: [], lastClick: [] }]

  const firstOutboundByNorm = new Map()
  for (const row of (mbaAnchorRaw[0]?.firstOutbound || [])) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const anchor = parseOptDate(row.firstOutbound)
    if (!anchor) continue
    const prev = firstOutboundByNorm.get(norm)
    if (!prev || anchor.getTime() < prev.getTime()) firstOutboundByNorm.set(norm, anchor)
  }

  const lastClickByNorm = new Map()
  for (const row of (mbaAnchorRaw[0]?.lastClick || [])) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const t = parseOptDate(row.lastClickAt)
    if (!t) continue
    const prev = lastClickByNorm.get(norm)
    if (!prev || t.getTime() > prev.getTime()) lastClickByNorm.set(norm, t)
  }

  const appsCol = db.collection(APPS_COL)

  const formSubmittedAgg = normalisedClickedMobiles.length > 0
    ? await appsCol.aggregate([
        {
          $match: {
            'personal_details.mobile_number': { $in: normalisedClickedMobiles },
            'application_detail.application_no': { $ne: '' },
          },
        },
        {
          $addFields: {
            _sortAt: { $ifNull: ['$createdAt', '$updatedAt'] },
            _npfLead: {
              $ifNull: [
                '$other_info.lead_id',
                { $ifNull: ['$npfData.lead_id', '$npfData.leadId'] },
              ],
            },
          },
        },
        { $sort: { _sortAt: 1 } },
        {
          $group: {
            _id: '$personal_details.mobile_number',
            formSubmittedAt: { $max: '$_sortAt' },
            leadIdRaw: { $last: '$_npfLead' },
            applicationNo: { $last: '$application_detail.application_no' },
          },
        },
      ]).toArray()
    : []

  const formSubmittedResult = formSubmittedAgg.filter((r) => {
    const norm = normaliseMobile(r._id)
    const outboundAnchor = firstOutboundByNorm.get(norm)
    const lastClick = lastClickByNorm.get(norm)
    if (!outboundAnchor || !lastClick || r.formSubmittedAt == null) return false
    if (!isOnOrAfter(r.formSubmittedAt, outboundAnchor)) return false
    return isOnOrAfter(r.formSubmittedAt, lastClick)
  })

  formSubmittedCount = formSubmittedResult.length
  const formSubmittedMobiles = formSubmittedResult.map((r) => r._id)

  const convertedMobiles = [...new Set(formSubmittedMobiles)]
  // Build phone variants from NPF's 10-digit mobiles AND seed with the actual raw
  // _waPhone values from batch1 that normalise to a converted mobile. This ensures
  // we re-find the same clicked docs even when stored phone has unusual formatting.
  const convertedNormSet = new Set(convertedMobiles.map(normaliseMobile).filter(Boolean))
  const knownRawPhones = clickedPhoneDedup.filter((p) => {
    const n = normaliseMobile(p)
    return n && convertedNormSet.has(n)
  })
  const convertedPhoneVariants = [...new Set([
    ...waPhoneVariantsForMatch(convertedMobiles),
    ...knownRawPhones,
  ])]
  const clickAttrResult = convertedMobiles.length > 0
    ? await waCol.aggregate([
        { $match: CLICKED_PRE_MATCH },
        { $addFields: waResolvedFields },
        { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
        { $match: { _waStage: 'clicked', _waPhone: { $in: convertedPhoneVariants } } },
        { $addFields: { _ctaKey: ctaKeyExpr() } },
        {
          $group: {
            _id: '$_waPhone',
            templates: { $addToSet: '$_waTemplate' },
            buttons: { $addToSet: '$_ctaKey' },
          },
        },
      ]).toArray()
    : []

  const clickAttrMap = new Map()
  for (const r of clickAttrResult) {
    const norm = normaliseMobile(r._id)
    if (!norm) continue
    const prev = clickAttrMap.get(norm)
    const templates = new Set([...(prev?.templates || []), ...(r.templates || [])].filter(Boolean))
    const buttons = new Set([...(prev?.buttons || []), ...(r.buttons || [])].filter(isUsefulWaButtonText))
    clickAttrMap.set(norm, { templates: [...templates], buttons: [...buttons] })
  }

  const formConversionRate = clickedPhones.length > 0
    ? parseFloat(((formSubmittedCount / clickedPhones.length) * 100).toFixed(2))
    : 0

  // MBA branch: templatePhones + clickBreakdown share same prefix → one $facet scan
  const mbaBranchRaw = await waCol.aggregate(
    [
      { $match: CLICKED_PRE_MATCH },
      ...nativeDatePreStages,
      { $addFields: waResolvedFields },
      { $match: waBreakdownMatch },
      {
        $facet: {
          templatePhones: [
            { $match: { _waTemplate: { $nin: [null, ''] } } },
            { $group: { _id: '$_waTemplate', phones: { $addToSet: '$_waPhone' } } },
          ],
          clickBreakdown: [
            { $sort: { _waEventTs: -1 } },
            {
              $group: {
                _id: '$_waPhone',
                clicks: {
                  $push: {
                    template: '$_waTemplate',
                    button: '$_waButtonText',
                    link: '$button_link',
                    type: '$click_type',
                    time: { $ifNull: ['$_waClickTs', '$_waEventTs'] },
                  },
                },
              },
            },
          ],
        },
      },
    ],
    { allowDiskUse: true },
  ).toArray()

  templatePhones = {}
  for (const r of (mbaBranchRaw[0]?.templatePhones || [])) {
    if (r._id) templatePhones[r._id] = r.phones || []
  }

  const clickBreakdownResult = mbaBranchRaw[0]?.clickBreakdown || []

  const phoneVariantsForLead = [
    ...new Set([
      ...clickBreakdownResult
        .map((r) => r._id)
        .filter(Boolean)
        .flatMap((p) => {
          const n = normaliseMobile(p)
          if (!n) return []
          const v = [n]
          if (n.length === 10) v.push(`91${n}`)
          return v
        }),
      ...formSubmittedMobiles.flatMap((p) => {
        const n = normaliseMobile(p)
        if (!n) return []
        const v = [n]
        if (n.length === 10) v.push(`91${n}`)
        return v
      }),
    ]),
  ]

  const crmSnapshotCol = db.collection(CRM_SNAPSHOT_COL)
  const leadByNormMobile = new Map()
  if (phoneVariantsForLead.length > 0) {
    const leadDocs = await crmSnapshotCol
      .find({
        $or: [
          { mobile: { $in: phoneVariantsForLead } },
          { alternate_mobile: { $in: phoneVariantsForLead } },
        ],
      })
      .sort({ _id: -1 })
      .project({ mobile: 1, alternate_mobile: 1, lead_id: 1 })
      .toArray()
    for (const doc of leadDocs) {
      const lid = doc.lead_id != null && String(doc.lead_id).trim() !== '' ? String(doc.lead_id) : ''
      if (!lid) continue
      for (const raw of [doc.mobile, doc.alternate_mobile]) {
        const key = normaliseMobile(raw)
        if (key && !leadByNormMobile.has(key)) leadByNormMobile.set(key, lid)
      }
    }
  }

  clickBreakdown = clickBreakdownResult
    .filter((r) => r._id)
    .map((r) => ({
      phone: r._id,
      leadId: leadByNormMobile.get(normaliseMobile(r._id)) || null,
      totalClicks: r.clicks.length,
      clicks: r.clicks.slice(0, 20),
    }))
    .sort((a, b) => b.totalClicks - a.totalClicks)

  await enrichClickBreakdownFromInterakt(waCol, clickBreakdown)

  function stringifyLeadId(raw) {
    if (raw == null || raw === '') return null
    const s = String(raw).trim()
    return s === '' ? null : s
  }

  const formMetaByNorm = new Map()
  for (const row of formSubmittedResult) {
    const norm = normaliseMobile(row._id)
    if (!norm) continue
    const dt = parseOptDate(row.formSubmittedAt)
    formMetaByNorm.set(norm, {
      formSubmittedAtIso: dt ? dt.toISOString() : null,
      formSubmittedAtDisplay: dt
        ? dt.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Kolkata',
          })
        : '—',
      leadIdFromNpf: stringifyLeadId(row.leadIdRaw),
      applicationNo: row.applicationNo ? String(row.applicationNo).trim() : null,
    })
  }

  const clickTimelineByNorm = new Map()
  const MAX_TIMELINE_EVENTS = 40
  if (convertedMobiles.length > 0) {
    const timelineMatch = {
      _waStage: 'clicked',
      _waPhone: { $in: convertedPhoneVariants },
    }
    if (startDate || endDate) {
      timelineMatch._waEventTs = {}
      if (startDate) timelineMatch._waEventTs.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setDate(end.getDate() + 1)
        timelineMatch._waEventTs.$lt = end
      }
    }

    const clickTimelineResult = await waCol.aggregate([
      { $match: CLICKED_PRE_MATCH },
      ...nativeDatePreStages,
      { $addFields: waResolvedFields },
      { $addFields: { _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] } } },
      { $match: timelineMatch },
      { $addFields: { _ctaKey: ctaKeyExpr() } },
      { $sort: { _waEventTs: 1 } },
      {
        $group: {
          _id: '$_waPhone',
          events: {
            $push: {
              template: '$_waTemplate',
              button: '$_ctaKey',
              clickAt: { $ifNull: ['$_waClickTs', '$_waEventTs'] },
            },
          },
        },
      },
    ]).toArray()

    for (const row of clickTimelineResult) {
      const norm = normaliseMobile(row._id)
      if (!norm) continue
      const rawEvents = row.events || []
      const slice = rawEvents.length > MAX_TIMELINE_EVENTS
        ? rawEvents.slice(-MAX_TIMELINE_EVENTS)
        : rawEvents
      const events = slice.map((e) => {
        const dt = parseOptDate(e.clickAt)
        const ok = dt && !Number.isNaN(dt.getTime())
        return {
          template: e.template || '',
          button: isUsefulWaButtonText(e.button) ? String(e.button).trim() : '',
          clickAtIso: ok ? dt.toISOString() : null,
          clickAtDisplay: ok
            ? dt.toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Kolkata',
              })
            : '—',
        }
      })
      clickTimelineByNorm.set(norm, events)
    }
  }

  await enrichFormConversionClickDetailsFromInterakt(waCol, formSubmittedMobiles, clickAttrMap, clickTimelineByNorm, db.collection('marketingwa'), clickedPhoneDedup)

  // MBA: enrich with application_stage and payment from ITM_BS collections
  const mbaAppNos = formSubmittedResult.map((r) => formMetaByNorm.get(normaliseMobile(r._id))?.applicationNo).filter(Boolean)
  const mbaStageByAppNo = new Map()
  const mbaPaymentByAppNo = new Map()

  if (mbaAppNos.length > 0) {
    const itmbsDb = client.db('ITM_BS')

    // Stage lookup
    const stageDocs = await itmbsDb.collection('npfApplicationsWebhookEvents').find(
      { Application_Number_Auto_Generated: { $in: mbaAppNos } },
      { projection: { Application_Number_Auto_Generated: 1, application_stage: 1 } },
    ).toArray()
    for (const d of stageDocs) {
      if (d.Application_Number_Auto_Generated && d.application_stage) {
        mbaStageByAppNo.set(d.Application_Number_Auto_Generated, String(d.application_stage).trim())
      }
    }

    // Payment lookup
    const payDocs = await itmbsDb.collection('npfPaymentWebhookEvents').find(
      { application_number: { $in: mbaAppNos } },
    ).toArray()
    for (const p of payDocs) {
      if (!p.application_number) continue
      const rawStatus = p.paymentStatus || p.Payment_Status || ''
      const existing = mbaPaymentByAppNo.get(p.application_number)
      const paidAt = parseOptDate(p.Payment_Approved_Date) || parseOptDate(p.createdAt)
      if (!existing || (paidAt && existing.paidAt && paidAt.getTime() > existing.paidAt.getTime())) {
        mbaPaymentByAppNo.set(p.application_number, {
          paymentDone: /approved|success|complete/i.test(rawStatus),
          paymentStatus: p.paymentStatus || p.Payment_Status || null,
          paidAt,
        })
      }
    }
  }

  paymentConversion = {
    conversionKind: 'mba_form',
    totalClicked: clickedPhones.length,
    formSubmitted: formSubmittedCount,
    conversionRate: formConversionRate,
    formSubmittedMobiles,
    formSubmittedDetails: formSubmittedMobiles.map((m) => {
      const norm = normaliseMobile(m)
      const attr = clickAttrMap.get(norm)
      const meta = formMetaByNorm.get(norm)
      const npfLead = meta?.leadIdFromNpf
      const crmLead = leadByNormMobile.get(norm)
      const appNo = meta?.applicationNo
      const payment = appNo ? mbaPaymentByAppNo.get(appNo) : null
      return {
        mobile: m,
        leadId: npfLead || crmLead || null,
        applicationStage: appNo ? (mbaStageByAppNo.get(appNo) || null) : null,
        formSubmittedAtIso: meta?.formSubmittedAtIso ?? null,
        formSubmittedAtDisplay: meta?.formSubmittedAtDisplay ?? '—',
        paymentDone: payment?.paymentDone ?? null,
        paymentStatus: payment?.paymentStatus ?? null,
        paymentAtDisplay: null,
        clickedTemplates: attr?.templates || [],
        clickedButtons: attr?.buttons || [],
        clickTimeline: clickTimelineByNorm.get(norm) || [],
      }
    }),
  }

  }

  // Sort on native indexed field — no $addFields scan needed
  const lastDocArr = await waCol
    .find({}, { projection: { event_timestamp: 1, createdAt: 1 } })
    .sort({ event_timestamp: -1 })
    .limit(1)
    .toArray()
  const lastRawDocTime = lastDocArr[0]?.event_timestamp
    ? new Date(lastDocArr[0].event_timestamp).toISOString()
    : lastDocArr[0]?.createdAt
      ? new Date(lastDocArr[0].createdAt).toISOString()
      : new Date().toISOString()

  const dashboard = {
    channel: 'wa',
    workspace: cfg.workspace,
    kpi: rawKpi,
    funnel,
    templateRows,
    ctaRows,
    costPerClick,
    totalCost,
    engagementSummary,
    buttonPhones,
    templatePhones,
    clickBreakdown,
    rawDocCount: totalDocs,
    lastRawDocTime,
    formSubmittedCount,
    paymentConversion,
    computedAt: new Date().toISOString(),
  }

  if (mode !== 'range') {
    await cacheCol.updateOne(
      { _id: cfg.cacheKey },
      { $set: dashboard },
      { upsert: true },
    )
    if (cfg.includeMbaConversion) {
      await cacheCol.deleteOne({ _id: WA_DASHBOARD_CACHE_ID_MBA_LEGACY })
    }
  }

  return {
    ...dashboard,
    fromCache: false,
    elapsed: Date.now() - start,
  }
}
