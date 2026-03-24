/**
 * Vercel Cron Job — recomputes WA + Email dashboard caches every hour.
 * Configured in vercel.json: "schedule": "0 * * * *"
 */

import { computeWADashboard } from '../../wa-dashboard/compute'
import { computeEmailDashboard } from '../../email-dashboard/compute'
import { computeSourceStats } from '../../sourceStats/compute'
import { computeSmsDashboard } from '../../smsDashboard/compute'

const CRON_SECRET = process.env.CRON_SECRET

export const maxDuration = 60

export async function GET(request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const start = Date.now()
  try {
    const [waResult, emailResult, sourceStatsResult, smsResult] = await Promise.all([
      computeWADashboard({ mode: 'full' }),
      computeEmailDashboard({ mode: 'full' }),
      computeSourceStats({ mode: 'full' }),
      computeSmsDashboard({ mode: 'full' }),
    ])

    return Response.json({
      ok: true,
      wa: {
        rawDocCount: waResult.rawDocCount,
        templateRows: waResult.templateRows?.length,
        formSubmitted: waResult.formSubmittedCount,
        computeTime: waResult.elapsed,
      },
      email: {
        rawDocCount: emailResult.rawDocCount,
        templateRows: emailResult.templateRows?.length,
        formSubmitted: emailResult.emailPaymentConversion?.formSubmitted,
        computeTime: emailResult.elapsed,
      },
      sourceStats: {
        totalSources: sourceStatsResult.kpi?.totalSources,
        totalLeads: sourceStatsResult.kpi?.totalLeads,
        totalCalls: sourceStatsResult.kpi?.totalCalls,
        computeTime: sourceStatsResult.elapsed,
      },
      sms: {
        rawDocCount: smsResult.rawDocCount,
        computeTime: smsResult.elapsed,
      },
      totalElapsed: Date.now() - start,
      completedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/recompute]', err)
    return Response.json({
      ok: false,
      error: err.message,
      elapsed: Date.now() - start,
    }, { status: 500 })
  }
}
