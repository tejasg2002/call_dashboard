/**
 * GET /api/wa-lead-analytics
 * Lead-filtered WA template aggregates (MBA / BBA / BTECH / IDM).
 * Phone matching aligns with wa-dashboard/compute.js (_waPhone + variants).
 * Repeat leadStage=… and/or source=… for multi-select (OR within each; AND across dimensions).
 */

import clientPromise from '../../../src/lib/mongodb'
import { waWorkspaceConfig, normalizeWAWorkspace } from '../../../src/lib/waWorkspace'
import { waPhoneVariantsForMatch, normaliseMobile } from '../../../src/lib/waPhoneMatch'
import { expandLeadFilterSourcePicksForMatch } from '../../../src/lib/leadFilterSourcePrimary.js'
import {
  buildLeadPhoneExpr,
  leadPhoneStringExpr,
  leadSourceExpr,
  buildLeadStageSourceMatchInsensitive,
  buildGroupedLeadFilterMatch,
  normalizeLeadFilterList,
  resolveLeadStageFilterContext,
  mbaItmCrmLeadPhoneExpr,
  mbaItmCrmLeadStageExpr,
  mbaItmCrmLeadSourceExpr,
  MBA_ITM_CRM_STAGE_MATCH_FIELDS,
  mbaItmCrmLeadFilterMatchExtras,
} from '../../../src/lib/waLeadMongo'

const LATEST_SORT = { createdAt: -1, Updated_Date: -1, updatedAt: -1, _id: -1 }

function waMessageStatusExpr() {
  return { $ifNull: ['$message_status', '$data.message.message_status'] }
}

function waStageExpr() {
  return {
    $let: {
      vars: {
        et: { $toLower: { $ifNull: ['$type', { $ifNull: ['$event_type', ''] }] } },
        ms: { $toLower: waMessageStatusExpr() },
      },
      in: {
        $switch: {
          branches: [
            { case: { $regexMatch: { input: '$$et', regex: 'click' } }, then: 'clicked' },
            {
              case: {
                $or: [{ $regexMatch: { input: '$$et', regex: 'read' } }, { $eq: ['$$ms', 'read'] }],
              },
              then: 'read',
            },
            {
              case: {
                $or: [{ $regexMatch: { input: '$$et', regex: 'deliver' } }, { $eq: ['$$ms', 'delivered'] }],
              },
              then: 'delivered',
            },
            {
              case: {
                $or: [{ $regexMatch: { input: '$$et', regex: 'sent' } }, { $eq: ['$$ms', 'sent'] }],
              },
              then: 'sent',
            },
            {
              case: {
                $or: [{ $regexMatch: { input: '$$et', regex: 'fail' } }, { $eq: ['$$ms', 'failed'] }],
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

async function fetchCrmPhones(col, leadStagesIn, sourcesIn, phoneStrExpr, stageMatchFields, matchExtras) {
  const match = buildLeadStageSourceMatchInsensitive(leadStagesIn, sourcesIn, stageMatchFields, matchExtras)
  const rows = await col
    .aggregate([
      ...(Object.keys(match).length ? [{ $match: match }] : []),
      { $project: { phone: phoneStrExpr } },
      { $match: { phone: { $nin: [null, ''] } } },
      { $group: { _id: '$phone' } },
    ])
    .toArray()
  return rows.map((r) => r._id).filter(Boolean)
}

async function fetchWebhookPhones(col, leadStagesIn, sourcesIn, phoneStrExpr, stageExpr, sourceExpr = leadSourceExpr) {
  const rows = await col
    .aggregate([
      { $sort: LATEST_SORT },
      {
        $group: {
          _id: phoneStrExpr,
          leadStage: { $first: stageExpr },
          source: { $first: sourceExpr },
        },
      },
      { $match: { _id: { $nin: [null, ''] } } },
      ...buildGroupedLeadFilterMatch(leadStagesIn, sourcesIn),
    ])
    .toArray()
  return rows.map((r) => r._id).filter(Boolean)
}

function mergePhonesForWaJoin(crmPhones, webhookPhones) {
  const seen = new Set()
  const out = []
  for (const raw of [...crmPhones, ...webhookPhones]) {
    const n = normaliseMobile(raw)
    if (!n || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspace = normalizeWAWorkspace(searchParams.get('workspace'))
    const pickedLeadStages = normalizeLeadFilterList(searchParams.getAll('leadStage'))
    const pickedSources = normalizeLeadFilterList(searchParams.getAll('source'))
    const expandedSources = expandLeadFilterSourcePicksForMatch(workspace, pickedSources)
    const startDate = (searchParams.get('startDate') || '').trim()
    const endDate = (searchParams.get('endDate') || '').trim()

    const cfg = waWorkspaceConfig(workspace)
    const isMbaItmCrm = cfg.crmLeadFilterSchema === 'itm_crm_leads'

    if (!cfg.crmSnapshotCollection && !cfg.leadWebhookCollection) {
      return Response.json({ error: 'Lead analytics not available for this workspace' }, { status: 400 })
    }

    const client = await clientPromise
    const waDb = client.db(cfg.dataDb)
    const leadDb = client.db(cfg.leadFilterDataDb ?? cfg.dataDb)
    const crmCol = cfg.crmSnapshotCollection ? leadDb.collection(cfg.crmSnapshotCollection) : null
    const webhookCol = cfg.leadWebhookCollection ? leadDb.collection(cfg.leadWebhookCollection) : null
    const waCol = waDb.collection(cfg.waCollection)
    const st = resolveLeadStageFilterContext(cfg)
    const phoneExpr = isMbaItmCrm ? mbaItmCrmLeadPhoneExpr : buildLeadPhoneExpr(cfg.leadPhoneField)
    const phoneStrExpr = leadPhoneStringExpr(phoneExpr)
    const stageExpr = isMbaItmCrm ? mbaItmCrmLeadStageExpr : st.stageExpr
    const sourceExpr = isMbaItmCrm ? mbaItmCrmLeadSourceExpr : leadSourceExpr
    const stageMatchFields = isMbaItmCrm ? MBA_ITM_CRM_STAGE_MATCH_FIELDS : st.stageMatchFields
    const matchExtras = isMbaItmCrm ? mbaItmCrmLeadFilterMatchExtras() : null

    const [crmPhones, webhookPhones] = await Promise.all([
      crmCol ? fetchCrmPhones(crmCol, pickedLeadStages, expandedSources, phoneStrExpr, stageMatchFields, matchExtras) : [],
      webhookCol ? fetchWebhookPhones(webhookCol, pickedLeadStages, expandedSources, phoneStrExpr, stageExpr, sourceExpr) : [],
    ])

    const phones = mergePhonesForWaJoin(crmPhones, webhookPhones)

    if (phones.length === 0) {
      const emptyKpi = { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, ctr: 0, sdr: 0, str: 0, readRate: 0 }
      return Response.json({
        templateRows: [],
        kpi: emptyKpi,
        totalLeads: 0,
        filteredBy: { leadStages: pickedLeadStages, sources: pickedSources },
      })
    }

    const phoneVariants = waPhoneVariantsForMatch(phones)
    if (phoneVariants.length === 0) {
      const emptyKpi = { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, ctr: 0, sdr: 0, str: 0, readRate: 0 }
      return Response.json({
        templateRows: [],
        kpi: emptyKpi,
        totalLeads: phones.length,
        filteredBy: { leadStages: pickedLeadStages, sources: pickedSources },
      })
    }

    // Same as wa-dashboard/compute.js nativeDatePreStages: many Interakt rows use createdAt only.
    const datePreStages = []
    if (startDate || endDate) {
      const f = {}
      if (startDate) f.$gte = new Date(startDate)
      if (endDate) {
        const end = new Date(endDate)
        end.setDate(end.getDate() + 1)
        f.$lt = end
      }
      datePreStages.push({ $match: { $or: [{ event_timestamp: f }, { createdAt: f }] } })
    }

    const pipeline = [
      ...datePreStages,
      {
        $addFields: {
          _waPhone: { $ifNull: ['$phone_number', '$data.customer.phone_number'] },
        },
      },
      {
        $addFields: {
          _waPhone: { $ifNull: ['$_waPhone', '$data.customer.channel_phone_number'] },
        },
      },
      { $match: { _waPhone: { $in: phoneVariants } } },
      {
        $addFields: {
          _waStage: { $ifNull: ['$stage', waStageExpr()] },
          _templateName: {
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
                  in: { $ifNull: [{ $arrayElemAt: ['$$m.captures', 0] }, '(unknown)'] },
                },
              },
            ],
          },
        },
      },
      {
        $addFields: {
          _templateName: { $ifNull: ['$_templateName', '(unknown)'] },
        },
      },
      { $match: { _waStage: { $ne: null } } },
      {
        $group: {
          _id: { template: '$_templateName', phone: '$_waPhone' },
          stages: { $addToSet: '$_waStage' },
          firstSeen: { $min: { $ifNull: ['$event_timestamp', '$createdAt'] } },
          lastSeen: { $max: { $ifNull: ['$event_timestamp', '$createdAt'] } },
        },
      },
      {
        $group: {
          _id: '$_id.template',
          sent: { $sum: { $cond: [{ $in: ['sent', '$stages'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $in: ['delivered', '$stages'] }, 1, 0] } },
          read: { $sum: { $cond: [{ $in: ['read', '$stages'] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $in: ['clicked', '$stages'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $in: ['failed', '$stages'] }, 1, 0] } },
          firstSeen: { $min: '$firstSeen' },
          lastSeen: { $max: '$lastSeen' },
        },
      },
      {
        $project: {
          template_name: '$_id',
          source: { $literal: 'api' },
          sent: 1,
          delivered: 1,
          read: 1,
          clicked: 1,
          failed: 1,
          firstSeen: 1,
          lastSeen: 1,
          ctr: {
            $cond: [
              { $gt: ['$delivered', 0] },
              { $multiply: [{ $divide: ['$clicked', '$delivered'] }, 100] },
              0,
            ],
          },
          sdr: {
            $cond: [{ $gt: ['$sent', 0] }, { $multiply: [{ $divide: ['$delivered', '$sent'] }, 100] }, 0],
          },
          str: {
            $cond: [{ $gt: ['$sent', 0] }, { $multiply: [{ $divide: ['$read', '$sent'] }, 100] }, 0],
          },
          readRate: {
            $cond: [
              { $gt: ['$delivered', 0] },
              { $multiply: [{ $divide: ['$read', '$delivered'] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { sent: -1 } },
    ]

    const templateRows = await waCol.aggregate(pipeline).toArray()

    const kpi = templateRows.reduce(
      (acc, r) => ({
        sent: acc.sent + (r.sent || 0),
        delivered: acc.delivered + (r.delivered || 0),
        read: acc.read + (r.read || 0),
        clicked: acc.clicked + (r.clicked || 0),
        failed: acc.failed + (r.failed || 0),
      }),
      { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0 },
    )

    kpi.ctr = kpi.delivered > 0 ? (kpi.clicked / kpi.delivered) * 100 : 0
    kpi.sdr = kpi.sent > 0 ? (kpi.delivered / kpi.sent) * 100 : 0
    kpi.str = kpi.sent > 0 ? (kpi.read / kpi.sent) * 100 : 0
    kpi.readRate = kpi.delivered > 0 ? (kpi.read / kpi.delivered) * 100 : 0

    return Response.json({
      templateRows: templateRows.map((r) => ({ ...r, _id: undefined })),
      kpi,
      totalLeads: phones.length,
      filteredBy: { leadStages: pickedLeadStages, sources: pickedSources },
    })
  } catch (err) {
    console.error('[api/wa-lead-analytics]', err)
    return Response.json({ error: err.message || 'Failed' }, { status: 500 })
  }
}
