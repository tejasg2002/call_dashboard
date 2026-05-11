/**
 * Resolve display template name from Interakt-style WA webhook docs.
 * Aligns with app/api/wa-dashboard/compute.js `waResolvedFields` → `_waTemplate`,
 * plus handling for placeholder template_name and BSON / $binary raw_template.
 */

const JUNK_NAME = new Set(['', '(unknown template)', '(unknown)', 'unknown', 'unknown template', 'null', 'undefined'])

export function isJunkTemplateLabel(s) {
  if (s == null) return true
  const t = String(s).trim()
  if (!t) return true
  const low = t.toLowerCase()
  return JUNK_NAME.has(low)
}

/** Turn BSON Binary, Buffer, or Extended JSON {$binary} into UTF-8 string; pass strings through. */
export function coerceRawTemplateToUtf8(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') return raw
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) return raw.toString('utf8')
  if (typeof raw === 'object') {
    if (raw._bsontype === 'Binary' && typeof raw.toString === 'function') {
      try {
        return raw.toString('utf8')
      } catch {
        return null
      }
    }
    if (raw.$binary?.base64 && typeof Buffer !== 'undefined') {
      try {
        return Buffer.from(raw.$binary.base64, 'base64').toString('utf8')
      } catch {
        return null
      }
    }
    if (raw.$binary?.base64 && typeof atob !== 'undefined') {
      try {
        const bin = atob(raw.$binary.base64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        return new TextDecoder('utf-8').decode(bytes)
      } catch {
        return null
      }
    }
  }
  return null
}

function parseJsonMaybe(v) {
  if (v == null || v === '') return null
  if (
    typeof v === 'object' &&
    !(typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) &&
    v._bsontype !== 'Binary' &&
    !v.$binary
  ) {
    return v
  }
  const s = typeof v === 'string' ? v : coerceRawTemplateToUtf8(v)
  if (s == null || typeof s !== 'string') return null
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** `data.message` or same structure nested under `raw_payload`. */
function getMessageBlock(doc) {
  const m = doc?.data?.message
  if (m && typeof m === 'object') return m
  if (!doc?.raw_payload) return null
  try {
    const rp = typeof doc.raw_payload === 'string' ? JSON.parse(doc.raw_payload) : doc.raw_payload
    return rp?.data?.message || rp?.message || null
  } catch {
    return null
  }
}

/** Prefer message.raw_template; fall back to raw_payload copy; decode binary to string for JSON.name. */
export function getRawTemplateBlob(doc) {
  const msg = getMessageBlock(doc)
  if (!msg) return null
  let raw = msg.raw_template
  if (raw == null || raw === '') {
    try {
      const rp = typeof doc.raw_payload === 'string' ? JSON.parse(doc.raw_payload) : doc.raw_payload
      const m2 = rp?.data?.message || rp?.message
      raw = m2?.raw_template
    } catch {
      return null
    }
  }
  if (raw == null || raw === '') return null
  const asUtf8 = coerceRawTemplateToUtf8(raw)
  if (asUtf8 != null && asUtf8 !== raw) return asUtf8
  return raw
}

function templateNameFromParsed(rt) {
  if (!rt || typeof rt !== 'object') return ''
  const n = rt.name ?? rt.template?.name ?? rt.template_name
  if (n != null && !isJunkTemplateLabel(n)) return String(n).trim()
  const id = rt.id ?? rt.template?.id
  if (id != null && String(id).trim() !== '') return String(id).trim()
  return ''
}

function templateNameFromStringRegex(s) {
  if (!s || typeof s !== 'string') return ''
  const m1 = s.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (m1?.[1]) return m1[1].replace(/\\"/g, '"').trim()
  const m2 = s.match(/'name'\s*:\s*'((?:\\.|[^'\\])*)'/)
  if (m2?.[1]) return m2[1].replace(/\\'/g, "'").trim()
  return ''
}

export function resolveWaTemplateName(doc) {
  if (!doc) return ''
  const top = doc.template_name
  if (!isJunkTemplateLabel(top)) return String(top).trim()
  const msgT = doc?.data?.message?.template_name
  if (!isJunkTemplateLabel(msgT)) return String(msgT).trim()

  const raw = getRawTemplateBlob(doc)
  if (raw == null || raw === '') return ''

  if (typeof raw === 'object' && raw && raw._bsontype !== 'Binary' && !raw.$binary) {
    const n = templateNameFromParsed(raw)
    if (n) return n
  }

  const utf8 = typeof raw === 'string' ? raw : coerceRawTemplateToUtf8(raw)
  if (utf8 && typeof utf8 === 'string') {
    const parsed = parseJsonMaybe(utf8)
    if (parsed && typeof parsed === 'object') {
      const n = templateNameFromParsed(parsed)
      if (n) return n
    }
    return templateNameFromStringRegex(utf8)
  }

  return ''
}

/** Campaign / message context when template name is missing. */
export function resolveWaCampaignOrContextLabel(doc) {
  if (!doc) return ''
  const msg = getMessageBlock(doc)
  const a =
    doc.campaign_name ||
    doc?.data?.message?.campaign_name ||
    msg?.campaign_name ||
    doc?.data?.message?.meta_data?.campaign_name ||
    msg?.meta_data?.campaign_name
  if (a != null && String(a).trim() !== '') return String(a).trim()
  return ''
}

/** Short body preview from raw template JSON when name is absent. */
export function resolveWaTemplateBodySnippet(doc, maxLen = 72) {
  const raw = getRawTemplateBlob(doc)
  if (raw == null) return ''
  const parsed =
    typeof raw === 'object' && raw && raw._bsontype !== 'Binary' && !raw.$binary
      ? raw
      : parseJsonMaybe(coerceRawTemplateToUtf8(raw) ?? (typeof raw === 'string' ? raw : ''))
  if (!parsed || typeof parsed !== 'object') return ''
  const b = parsed.body
  if (typeof b !== 'string' || !b.trim()) return ''
  const t = b.trim().replace(/\s+/g, ' ')
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t
}

/** Single label for journey rows — never returns junk placeholder names. */
export function resolveWaTimelineDisplayName(doc) {
  const t = resolveWaTemplateName(doc)
  if (t && !isJunkTemplateLabel(t)) return t
  const c = resolveWaCampaignOrContextLabel(doc)
  if (c) return c
  const hint = resolveWaTemplateBodySnippet(doc)
  if (hint) return hint
  return ''
}
