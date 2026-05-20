/**
 * Vercel Cron Job — recomputes WA + Email dashboard caches + MBA lead-filter rollups.
 * Configure schedule in vercel.json crons (default: every 15 minutes).
 */

import { computeWADashboard } from '../../wa-dashboard/compute'
import { computeEmailDashboard } from '../../email-dashboard/compute'
import { computeSourceStats } from '../../sourceStats/compute'
import { computeSmsDashboard } from '../../smsDashboard/compute'
import { computeCallDashboard } from '../../call-dashboard/compute'
import { ANALYTICS_WA_DEFINITIONS } from '../../../../src/lib/waWorkspace'
import { runWaLeadFilterRollupRecompute } from '../../../../src/lib/waLeadFilterRollupJob'

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
    const waJobs = [
      computeWADashboard({ mode: 'full', workspace: 'mba' }),
      ...ANALYTICS_WA_DEFINITIONS.map((d) =>
        computeWADashboard({ mode: 'full', workspace: d.workspace }),
      ),
      computeEmailDashboard({ mode: 'full' }),
      computeSourceStats({ mode: 'full' }),
      computeSmsDashboard({ mode: 'full' }),
      computeCallDashboard({ mode: 'full' }),
    ]
    const results = await Promise.all(waJobs)
    let leadFilterRollup = null
    try {
      leadFilterRollup = await runWaLeadFilterRollupRecompute('mba')
    } catch (rollupErr) {
      console.error('[cron/recompute] lead filter rollup', rollupErr)
      leadFilterRollup = { ok: false, error: rollupErr.message }
    }

    const waMba = results[0]
    const analyticsResults = results.slice(1, 1 + ANALYTICS_WA_DEFINITIONS.length)
    const emailResult = results[1 + ANALYTICS_WA_DEFINITIONS.length]
    const sourceStatsResult = results[2 + ANALYTICS_WA_DEFINITIONS.length]
    const smsResult = results[3 + ANALYTICS_WA_DEFINITIONS.length]
    const callResult = results[4 + ANALYTICS_WA_DEFINITIONS.length]

    const wa = {
      mba: {
        rawDocCount: waMba.rawDocCount,
        templateRows: waMba.templateRows?.length,
        formSubmitted: waMba.formSubmittedCount,
        computeTime: waMba.elapsed,
      },
    }
    ANALYTICS_WA_DEFINITIONS.forEach((d, i) => {
      const r = analyticsResults[i]
      wa[d.workspace] = {
        rawDocCount: r.rawDocCount,
        templateRows: r.templateRows?.length,
        computeTime: r.elapsed,
      }
    })

    return Response.json({
      ok: true,
      leadFilterRollup: leadFilterRollup
        ? {
            total: leadFilterRollup.total,
            ok: leadFilterRollup.ok,
            failed: leadFilterRollup.failed,
            elapsed: leadFilterRollup.elapsed,
            completedAt: leadFilterRollup.completedAt,
          }
        : null,
      wa,
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
