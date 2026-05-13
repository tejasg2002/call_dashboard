#!/usr/bin/env node
/**
 * Export distinct (course / program label × traffic source) pairs per data stream.
 *
 * Writes under ./exports/ (or --out=<dir>):
 *   - sources_<stream_id>.csv  — one file per stream (course_label, source, count)
 *   - sources_ALL_STREAMS.csv  — combined with leading stream_id column
 *
 * Requires COMMUNITY_URI (same as the app Mongo connection).
 *
 * Usage:
 *   node scripts/export-sources-by-course.mjs
 *   node scripts/export-sources-by-course.mjs --out=/tmp/wa-sources
 */

import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const uri = process.env.COMMUNITY_URI
if (!uri) {
  console.error('COMMUNITY_URI is not set (check .env)')
  process.exit(1)
}

/** Safe string for grouping / CSV (objects → ""). */
function asTrimmedString(inputExpr) {
  return {
    $trim: {
      input: {
        $convert: {
          input: inputExpr,
          to: 'string',
          onError: '',
          onNull: '',
        },
      },
    },
  }
}

/** ISU / IHM / IDM / MBA NPF application webhook style rows. */
function pipelineIsuStyleApps(streamId) {
  const courseInput = {
    $ifNull: [
      '$Course_Applied',
      {
        $ifNull: [
          '$Program_Name',
          { $ifNull: ['$Course_Name', { $ifNull: ['$Program_Applied', '$Course'] }] },
        ],
      },
    ],
  }
  const sourceInput = {
    $ifNull: [
      '$source_value',
      {
        $ifNull: [
          '$Publisher_Name',
          {
            $ifNull: [
              '$Traffic_Channel',
              {
                $ifNull: [
                  '$primary_traffic_channel',
                  { $ifNull: ['$publisher_name', { $ifNull: ['$Source', { $ifNull: ['$source', ''] }] }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
  return [
    {
      $addFields: {
        stream: { $literal: streamId },
        course_label: asTrimmedString(courseInput),
        source: asTrimmedString(sourceInput),
      },
    },
    {
      $addFields: {
        course_label: {
          $cond: [{ $eq: ['$course_label', ''] }, { $literal: '(no course label)' }, '$course_label'],
        },
        source: { $cond: [{ $eq: ['$source', ''] }, { $literal: '(no source)' }, '$source'] },
      },
    },
    {
      $group: {
        _id: { stream: '$stream', course: '$course_label', source: '$source' },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, stream: '$_id.stream', course_label: '$_id.course', source: '$_id.source', count: 1 } },
    { $sort: { stream: 1, course_label: 1, source: 1 } },
  ]
}

/** Full-document MBA applications (ITM_BS.npfMbaApplications). */
function pipelineMbaMongoApps() {
  const courseInput = {
    $ifNull: [
      '$application_detail.program',
      {
        $ifNull: [
          '$application_detail.course',
          { $ifNull: ['$application_detail.specialization', ''] },
        ],
      },
    ],
  }
  const sourceInput = {
    $ifNull: [
      '$other_info.source',
      {
        $ifNull: [
          '$other_info.lead_source',
          {
            $ifNull: [
              '$npfData.source',
              { $ifNull: ['$npfData.lead_source', { $ifNull: ['$registration_source', ''] }] },
            ],
          },
        ],
      },
    ],
  }
  return [
    {
      $addFields: {
        stream: { $literal: 'MBA_npfMbaApplications' },
        course_label: asTrimmedString(courseInput),
        source: asTrimmedString(sourceInput),
      },
    },
    {
      $addFields: {
        course_label: {
          $cond: [{ $eq: ['$course_label', ''] }, { $literal: '(no course label)' }, '$course_label'],
        },
        source: { $cond: [{ $eq: ['$source', ''] }, { $literal: '(no source)' }, '$source'] },
      },
    },
    {
      $group: {
        _id: { stream: '$stream', course: '$course_label', source: '$source' },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, stream: '$_id.stream', course_label: '$_id.course', source: '$_id.source', count: 1 } },
    { $sort: { course_label: 1, source: 1 } },
  ]
}

/** ITM CRM leads (itm-crm.leads) — program interest + channel. */
function pipelineMbaCrmLeads() {
  const courseInput = {
    $ifNull: [
      '$programInterest.specialization',
      { $ifNull: ['$programInterest.primaryProgram', ''] },
    ],
  }
  const sourceInput = {
    $ifNull: ['$source.channel', { $ifNull: ['$_source.source', ''] }],
  }
  return [
    {
      $addFields: {
        stream: { $literal: 'MBA_itm_crm_leads' },
        course_label: asTrimmedString(courseInput),
        source: asTrimmedString(sourceInput),
      },
    },
    {
      $addFields: {
        course_label: {
          $cond: [{ $eq: ['$course_label', ''] }, { $literal: '(no course label)' }, '$course_label'],
        },
        source: { $cond: [{ $eq: ['$source', ''] }, { $literal: '(no source)' }, '$source'] },
      },
    },
    {
      $group: {
        _id: { stream: '$stream', course: '$course_label', source: '$source' },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 0, stream: '$_id.stream', course_label: '$_id.course', source: '$_id.source', count: 1 } },
    { $sort: { course_label: 1, source: 1 } },
  ]
}

const EXPORT_JOBS = [
  { id: 'MBA_npfMbaApplications', db: 'ITM_BS', collection: 'npfMbaApplications', build: pipelineMbaMongoApps },
  {
    id: 'MBA_npfApplicationsWebhookEvents',
    db: 'ITM_BS',
    collection: 'npfApplicationsWebhookEvents',
    build: () => pipelineIsuStyleApps('MBA_npfApplicationsWebhookEvents'),
  },
  {
    id: 'BBA_npfApplicationsWebhookEventsBBA',
    db: 'ITM_ISU',
    collection: 'npfApplicationsWebhookEventsBBA',
    build: () => pipelineIsuStyleApps('BBA_npfApplicationsWebhookEventsBBA'),
  },
  {
    id: 'BTech_npfApplicationsWebhookEventsBTech',
    db: 'ITM_ISU',
    collection: 'npfApplicationsWebhookEventsBTech',
    build: () => pipelineIsuStyleApps('BTech_npfApplicationsWebhookEventsBTech'),
  },
  {
    id: 'IHM_npfApplicationsWebhookEvents',
    db: 'ITM_IHM',
    collection: 'npfApplicationsWebhookEvents',
    build: () => pipelineIsuStyleApps('IHM_npfApplicationsWebhookEvents'),
  },
  {
    id: 'IDM_npfApplicationsWebhookEvents',
    db: 'ITM_IDM',
    collection: 'npfApplicationsWebhookEvents',
    build: () => pipelineIsuStyleApps('IDM_npfApplicationsWebhookEvents'),
  },
  { id: 'MBA_itm_crm_leads', db: 'itm-crm', collection: 'leads', build: pipelineMbaCrmLeads },
]

function csvEscape(cell) {
  const s = String(cell ?? '')
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowsToCsv(header, rows) {
  const lines = [header.map(csvEscape).join(',')]
  for (const r of rows) {
    lines.push(header.map((h) => csvEscape(r[h])).join(','))
  }
  return '\ufeff' + lines.join('\n')
}

function parseOutDir() {
  const arg = process.argv.find((a) => a.startsWith('--out='))
  if (arg) return resolve(arg.slice('--out='.length))
  return resolve(__dirname, '..', 'exports')
}

async function main() {
  const outDir = parseOutDir()
  mkdirSync(outDir, { recursive: true })

  const client = new MongoClient(uri)
  await client.connect()
  console.log('Connected. Writing CSVs to', outDir)

  const combined = []
  const header = ['stream_id', 'course_label', 'source', 'count']

  for (const job of EXPORT_JOBS) {
    const col = client.db(job.db).collection(job.collection)
    let rows = []
    try {
      rows = await col.aggregate(job.build(), { allowDiskUse: true }).toArray()
    } catch (e) {
      console.warn(`[skip] ${job.id} (${job.db}.${job.collection}): ${e.message}`)
      continue
    }

    for (const r of rows) {
      combined.push({
        stream_id: r.stream || job.id,
        course_label: r.course_label,
        source: r.source,
        count: r.count,
      })
    }

    const singleHeader = ['course_label', 'source', 'count']
    const singleRows = rows.map((r) => ({
      course_label: r.course_label,
      source: r.source,
      count: r.count,
    }))
    const filePath = join(outDir, `sources_${job.id}.csv`)
    writeFileSync(filePath, rowsToCsv(singleHeader, singleRows), 'utf8')
    console.log(`  ${job.id}: ${rows.length} distinct course×source rows → ${filePath}`)
  }

  const allPath = join(outDir, 'sources_ALL_STREAMS.csv')
  writeFileSync(allPath, rowsToCsv(header, combined), 'utf8')
  console.log(`\nCombined: ${combined.length} rows → ${allPath}`)

  await client.close()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
