import clientPromise from '../../../src/lib/mongodb'

const DB_NAME = 'itm'
const NPF_COLLECTION = 'npfPayments'
const ITM_API_URL = 'https://api.itm.edu/v1/npf/lead/mobile/mba'

function normaliseMobile(raw) {
  let n = String(raw).trim().replace(/\s+/g, '').replace(/^00/, '')
  if (n.startsWith('+')) n = n.slice(1)
  if (n.startsWith('91') && n.length === 12) n = n.slice(2)
  return n
}

async function resolveLeadId(mobile, apiKey) {
  const normalized = normaliseMobile(mobile)
  if (!normalized) return null
  try {
    const res = await fetch(
      `${ITM_API_URL}?mobile=${encodeURIComponent(normalized)}`,
      { method: 'GET', headers: { 'x-api-key': apiKey } }
    )
    if (!res.ok) return null
    const json = await res.json()
    return json?.results?.data?.[0]?.lead_id ?? null
  } catch {
    return null
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { buttonPhones } = body

    if (!buttonPhones || typeof buttonPhones !== 'object') {
      return Response.json({ error: 'buttonPhones object required' }, { status: 400 })
    }

    const apiKey = process.env.NEXT_PUBLIC_ITM_API_KEY
    const client = await clientPromise
    const db = client.db(DB_NAME)
    const col = db.collection(NPF_COLLECTION)

    // 1. Get ALL payments grouped by status for diagnostics
    const allPayments = await col.find({}, {
      projection: { lead_id: 1, paymentStatus: 1 },
    }).toArray()

    const statusDist = {}
    const completedLeadIds = new Set()
    for (const p of allPayments) {
      const s = p.paymentStatus || 'unknown'
      statusDist[s] = (statusDist[s] || 0) + 1
      const lower = s.toLowerCase()
      if (lower === 'complete' || lower === 'completed' || lower === 'success') {
        completedLeadIds.add(p.lead_id)
      }
    }

    // 2. Collect all unique phones across buttons
    const allPhones = new Set()
    for (const phones of Object.values(buttonPhones)) {
      if (Array.isArray(phones)) {
        for (const p of phones) allPhones.add(p)
      }
    }

    // 3. Resolve each phone → lead_id via ITM API (batched for speed)
    const phoneToLeadId = new Map()
    const uniquePhones = [...allPhones]
    const BATCH = 15
    let resolvedCount = 0
    let leadFoundCount = 0

    for (let i = 0; i < uniquePhones.length; i += BATCH) {
      const batch = uniquePhones.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map((phone) => resolveLeadId(phone, apiKey))
      )
      batch.forEach((phone, idx) => {
        resolvedCount++
        const result = results[idx]
        const leadId = result.status === 'fulfilled' ? result.value : null
        phoneToLeadId.set(phone, leadId)
        if (leadId) leadFoundCount++
      })
    }

    // 4. Compute per-button conversion
    const perButton = {}
    for (const [btnName, phones] of Object.entries(buttonPhones)) {
      if (!Array.isArray(phones)) continue
      const uniqueBtnPhones = [...new Set(phones)]
      let leadsFound = 0
      let paid = 0

      for (const phone of uniqueBtnPhones) {
        const leadId = phoneToLeadId.get(phone)
        if (leadId) {
          leadsFound++
          if (completedLeadIds.has(leadId)) paid++
        }
      }

      perButton[btnName] = {
        clicked: uniqueBtnPhones.length,
        leadsFound,
        paid,
        rate: uniqueBtnPhones.length > 0
          ? parseFloat(((paid / uniqueBtnPhones.length) * 100).toFixed(1))
          : 0,
      }
    }

    return Response.json({
      perButton,
      diagnostics: {
        totalPaymentsInDB: allPayments.length,
        statusDistribution: statusDist,
        completedPayments: completedLeadIds.size,
        totalUniquePhones: uniquePhones.length,
        resolvedCount,
        leadFoundCount,
      },
    })
  } catch (err) {
    console.error('[api/payment-conversion]', err)
    return Response.json(
      { error: err.message || 'Failed to compute conversion' },
      { status: 500 },
    )
  }
}
