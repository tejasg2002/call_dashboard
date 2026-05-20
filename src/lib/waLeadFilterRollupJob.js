/**
 * Cron-time prewarm for MBA WhatsApp lead-filter in-memory caches.
 * Warms dropdown options and callback stage groups so first page load is fast.
 */

import clientPromise from './mongodb'
import { normalizeWAWorkspace, waWorkspaceConfig } from './waWorkspace'
import { loadMbaLeadFilterOptionsFromDb, resolveMbaStageGroups } from './waLeadFilterMba.js'

const MBA_ROLLUP_JOBS = [
  { id: 'options', run: (waCol) => loadMbaLeadFilterOptionsFromDb(waCol) },
  { id: 'stage_groups', run: (waCol) => resolveMbaStageGroups(waCol) },
]

/**
 * @param {string} workspace
 * @returns {Promise<{ total: number, ok: number, failed: number, elapsed: number, completedAt: string }>}
 */
export async function runWaLeadFilterRollupRecompute(workspace) {
  const ws = normalizeWAWorkspace(workspace)
  const cfg = waWorkspaceConfig(ws)
  const start = Date.now()

  if (!cfg.leadFilterUsesWaCallbackData || !cfg.waCollection) {
    return {
      total: 0,
      ok: 0,
      failed: 0,
      elapsed: Date.now() - start,
      completedAt: new Date().toISOString(),
    }
  }

  const client = await clientPromise
  const waCol = client.db(cfg.dataDb).collection(cfg.waCollection)

  let ok = 0
  let failed = 0
  for (const job of MBA_ROLLUP_JOBS) {
    try {
      await job.run(waCol)
      ok += 1
    } catch (err) {
      failed += 1
      console.error(`[waLeadFilterRollupJob] ${ws}/${job.id}`, err)
    }
  }

  return {
    total: MBA_ROLLUP_JOBS.length,
    ok,
    failed,
    elapsed: Date.now() - start,
    completedAt: new Date().toISOString(),
  }
}
