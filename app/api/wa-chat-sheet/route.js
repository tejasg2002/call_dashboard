import { readFileSync } from 'fs'
import { resolve } from 'path'
import { google } from 'googleapis'
import clientPromise from '../../../src/lib/mongodb'
import { parseCsv } from '../../../src/lib/parseCsv'

const APPS_DB = 'itm'
const APPS_COL = 'npfMbaApplications'
const LEAD_ID_BATCH = 350

export const maxDuration = 30
export const runtime = 'nodejs'

/** Default: user-provided WhatsApp chat leads sheet (tab gid=1987793142) */
const DEFAULT_SHEET_ID = '110sP4j1MoQcqpt5zzKzRbPdbXaH11i4Yz8E72dRSKmg'
const DEFAULT_GID = '1987793142'

const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'

function pick(row, ...names) {
  const keys = Object.keys(row)
  for (const name of names) {
    const n = name.toLowerCase()
    const found = keys.find((k) => k.trim().toLowerCase() === n)
    if (found) return row[found] ?? ''
  }
  for (const name of names) {
    const n = name.toLowerCase().replace(/\s+/g, '')
    const found = keys.find((k) => k.trim().toLowerCase().replace(/\s+/g, '') === n)
    if (found) return row[found] ?? ''
  }
  return ''
}

function normalizeRows(rawRows) {
  return rawRows.map((r) => ({
    slNo: pick(r, 'Sl.No', 'Sl No', 'S.No', 'Serial No', 'Sr.No'),
    leadId: pick(r, 'Lead Id', 'Lead ID', 'lead_id'),
    registeredName: pick(r, 'Registered Name', 'Name'),
    previousLeadStage: pick(r, 'Previous Lead Stage', 'Previous Stage'),
    leadStage: pick(r, 'Lead Stage', 'Stage'),
  }))
}

function envWantsServiceAccount() {
  return Boolean(
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PATH?.trim()
    || process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_B64?.trim()
    || process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim(),
  )
}

function isServiceAccountShape(obj) {
  return (
    obj != null
    && typeof obj === 'object'
    && typeof obj.client_email === 'string'
    && obj.client_email.length > 0
    && typeof obj.private_key === 'string'
    && /BEGIN [A-Z ]*PRIVATE KEY/.test(obj.private_key)
  )
}

/** @returns {object | null} */
function parseServiceAccountCredentials() {
  const filePath = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_PATH?.trim()
  const b64 = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_B64
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
  try {
    if (filePath) {
      const abs = resolve(process.cwd(), filePath)
      const obj = JSON.parse(readFileSync(abs, 'utf8'))
      return isServiceAccountShape(obj) ? obj : null
    }
    if (b64?.trim()) {
      const cleaned = b64.replace(/\s+/g, '')
      const obj = JSON.parse(Buffer.from(cleaned, 'base64').toString('utf8'))
      return isServiceAccountShape(obj) ? obj : null
    }
    if (raw?.trim()) {
      const obj = JSON.parse(raw.trim())
      return isServiceAccountShape(obj) ? obj : null
    }
  } catch (e) {
    console.error('[api/wa-chat-sheet] Invalid service account credentials', e)
    return null
  }
  return null
}

/** Convert Sheets API values (grid) to header-keyed row objects */
function valuesToKeyedRows(values) {
  if (!values?.length) return { headers: [], rawRows: [] }
  const headers = values[0].map((c) => String(c ?? '').trim())
  const rawRows = []
  for (let i = 1; i < values.length; i++) {
    const cells = values[i] || []
    const row = {}
    headers.forEach((h, j) => {
      row[h] = String(cells[j] ?? '').trim()
    })
    rawRows.push(row)
  }
  return { headers, rawRows }
}

/**
 * Read private (or public) spreadsheet via Google Sheets API + service account.
 * Share the spreadsheet with the service account email (Viewer is enough).
 */
function googleApiMessage(err) {
  return (
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.errors?.[0]?.message ||
    err?.message ||
    ''
  )
}

function permissionHelp(clientEmail) {
  if (!clientEmail) return ''
  return (
    ` Share the spreadsheet with this address as Viewer (or Editor): ${clientEmail}. ` +
    'In Google Cloud Console for that service account’s project, enable the **Google Sheets API** (APIs & Services → Enable APIs).'
  )
}

async function fetchViaSheetsApi(credentials) {
  const spreadsheetId = process.env.WA_CHAT_GOOGLE_SHEET_ID || DEFAULT_SHEET_ID
  const gid = Number.parseInt(process.env.WA_CHAT_GOOGLE_SHEET_GID || DEFAULT_GID, 10)
  const rangeOverride = process.env.WA_CHAT_SHEET_RANGE?.trim()
  const clientEmail = credentials?.client_email || ''

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [READONLY_SCOPE],
  })

  const sheets = google.sheets({ version: 'v4', auth })

  let range
  try {
    if (rangeOverride) {
      range = rangeOverride
    } else {
      const meta = await sheets.spreadsheets.get({ spreadsheetId })
      const sheet = meta.data.sheets?.find((s) => s.properties?.sheetId === gid)
      if (!sheet?.properties?.title) {
        throw new Error(
          `No worksheet with sheetId/gid ${gid}. Set WA_CHAT_SHEET_RANGE (e.g. 'Tab Name'!A:Z) or fix WA_CHAT_GOOGLE_SHEET_GID.`,
        )
      }
      const title = sheet.properties.title.replace(/'/g, "''")
      range = `'${title}'!A:Z`
    }

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
    })

    return valuesToKeyedRows(res.data.values || [])
  } catch (err) {
    const api = googleApiMessage(err)
    if (/permission|PERMISSION_DENIED|does not have permission/i.test(api)) {
      throw new Error(`${api || 'The caller does not have permission'}.${permissionHelp(clientEmail)}`)
    }
    throw err
  }
}

/** Distinct lead_ids from sheet that have a submitted MBA application (application_no set). */
async function countFormSubmittedForLeadIds(leadIds) {
  if (!leadIds.length) return 0
  const client = await clientPromise
  const col = client.db(APPS_DB).collection(APPS_COL)
  const matched = new Set()
  for (let i = 0; i < leadIds.length; i += LEAD_ID_BATCH) {
    const batch = leadIds.slice(i, i + LEAD_ID_BATCH)
    const docs = await col
      .aggregate([
        {
          $match: {
            'other_info.lead_id': { $in: batch },
            'application_detail.application_no': { $ne: '' },
          },
        },
        { $group: { _id: '$other_info.lead_id' } },
      ])
      .toArray()
    for (const d of docs) {
      if (d._id != null && d._id !== '') matched.add(String(d._id))
    }
  }
  return matched.size
}

/** True when sheet "Lead Stage" indicates form/application submitted (matches your sheet wording). */
function isSheetStageFormSubmitted(leadStage) {
  const s = String(leadStage || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!s) return false
  if (s.includes('form submitted')) return true
  if (s.includes('application submitted')) return true
  if (s.includes('form') && s.includes('submit')) return true
  return false
}

function countFormSubmittedBySheetStage(rows) {
  return rows.filter((r) => isSheetStageFormSubmitted(r.leadStage)).length
}

function sheetStats(rows) {
  const uniqueLeadIds = [
    ...new Set(rows.map((r) => r.leadId).filter(Boolean).map((id) => String(id).trim())),
  ]
  return {
    totalLeads: rows.length,
    uniqueLeadIds: uniqueLeadIds.length,
    leadIdsForMatch: uniqueLeadIds,
    formSubmittedSheet: countFormSubmittedBySheetStage(rows),
  }
}

async function jsonWithRows(rows, headers, source, extras = {}) {
  const { totalLeads, uniqueLeadIds, leadIdsForMatch, formSubmittedSheet } = sheetStats(rows)
  let formSubmittedNpf = 0
  try {
    formSubmittedNpf = await countFormSubmittedForLeadIds(leadIdsForMatch)
  } catch (e) {
    console.error('[api/wa-chat-sheet] npfMbaApplications form count failed', e)
  }
  return Response.json({
    rows,
    headers,
    count: rows.length,
    fetchedAt: new Date().toISOString(),
    source,
    stats: {
      totalLeads,
      uniqueLeadIds,
      /** Rows whose Lead Stage looks like form submitted (same as table filter). */
      formSubmitted: formSubmittedSheet,
      /** Same leads with application_no in npfMbaApplications (CRM). */
      formSubmittedNpf,
    },
    ...extras,
  })
}

async function fetchViaPublicCsv(url) {
  const res = await fetch(url, {
    headers: { Accept: 'text/csv,*/*' },
    next: { revalidate: 120 },
  })

  if (!res.ok) {
    throw new Error(
      `Sheet fetch failed (${res.status}). For a private sheet, use a service account (see GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON).`,
    )
  }

  const text = await res.text()
  if (text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new Error(
      'Received HTML instead of CSV. Private sheets need GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON (or share the sheet as view-by-link).',
    )
  }

  return parseCsv(text)
}

export async function GET() {
  const sheetId = process.env.WA_CHAT_GOOGLE_SHEET_ID || DEFAULT_SHEET_ID
  const gid = process.env.WA_CHAT_GOOGLE_SHEET_GID || DEFAULT_GID
  const customUrl = process.env.WA_CHAT_SHEET_CSV_URL

  try {
    const credentials = parseServiceAccountCredentials()
    if (!credentials && envWantsServiceAccount()) {
      return Response.json(
        {
          error:
            'Google Sheets service account env is set but credentials are invalid or incomplete. '
            + 'For GOOGLE_SHEETS_SERVICE_ACCOUNT_B64: base64-encode the full JSON key file (entire file, no wrapping quotes). '
            + 'On macOS: base64 -i your-key.json | tr -d \'\\n\' then paste the single line into the env var.',
          rows: [],
        },
        { status: 502 },
      )
    }

    if (credentials) {
      const { headers, rawRows } = await fetchViaSheetsApi(credentials)
      const rows = normalizeRows(rawRows)
      return jsonWithRows(rows, headers, 'google_sheets_api', {
        shareWithEmail: credentials.client_email || undefined,
      })
    }

    const url =
      customUrl ||
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`

    const { headers, rows: rawRows } = await fetchViaPublicCsv(url)
    const rows = normalizeRows(rawRows)

    return jsonWithRows(rows, headers, 'google_sheet_csv')
  } catch (err) {
    console.error('[api/wa-chat-sheet]', err)
    const creds = parseServiceAccountCredentials()
    const payload = {
      error: err.message || googleApiMessage(err) || 'Failed to load sheet',
      rows: [],
    }
    if (creds?.client_email && /permission|PERMISSION_DENIED|does not have permission/i.test(payload.error)) {
      payload.shareWithEmail = creds.client_email
    }
    return Response.json(payload, { status: 502 })
  }
}
