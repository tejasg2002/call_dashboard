/**
 * Vercel Cron Job — recomputes WA + Email dashboard caches every hour.
 * Configured in vercel.json: "schedule": "0 * * * *"
 */

import { computeWADashboard } from '../../wa-dashboard/compute'
import { computeEmailDashboard } from '../../email-dashboard/compute'
import { computeSourceStats } from '../../sourceStats/compute'
import { computeSmsDashboard } from '../../smsDashboard/compute'
import { computeCallDashboard } from '../../call-dashboard/compute'

const CRON_SECRET = process.env.CRON_SECRET

export const maxDuration = 300

export async function GET(request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const start = Date.now()
  try {
    const [waMba, waIhm, waIdm, emailResult, sourceStatsResult, smsResult, callResult] = await Promise.all([
      computeWADashboard({ mode: 'full', workspace: 'mba' }),
      computeWADashboard({ mode: 'full', workspace: 'ihm' }),
      computeWADashboard({ mode: 'full', workspace: 'idm' }),
      computeEmailDashboard({ mode: 'full' }),
      computeSourceStats({ mode: 'full' }),
      computeSmsDashboard({ mode: 'full' }),
      computeCallDashboard({ mode: 'full' }),
    ])

    return Response.json({
      ok: true,
      wa: {
        mba: {
          rawDocCount: waMba.rawDocCount,
          templateRows: waMba.templateRows?.length,
          formSubmitted: waMba.formSubmittedCount,
          computeTime: waMba.elapsed,
        },
        ihm: {
          rawDocCount: waIhm.rawDocCount,
          templateRows: waIhm.templateRows?.length,
          computeTime: waIhm.elapsed,
        },
        idm: {
          rawDocCount: waIdm.rawDocCount,
          templateRows: waIdm.templateRows?.length,
          computeTime: waIdm.elapsed,
        },
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
        ownerAttemptRows: sourceStatsResult.ownerAttemptRows?.length,
        computeTime: sourceStatsResult.elapsed,
      },
      sms: {
        rawDocCount: smsResult.rawDocCount,
        computeTime: smsResult.elapsed,
      },
      callOverview: {
        rawDocCount: callResult.rawDocCount,
        filteredDocCount: callResult.filteredDocCount,
        totalCalls: callResult.kpi?.totalCalls,
        computeTime: callResult.elapsed,
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
