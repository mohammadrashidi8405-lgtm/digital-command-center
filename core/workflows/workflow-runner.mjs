import { logger } from '../logging/logger.mjs';

/**
 * Generic named-stage runner: executes stages in order, logs each stage's
 * duration/outcome, and stops on the first stage that throws (fail loud,
 * never fail silently — §28). Skills are not required to use this (the
 * Job Acquisition pipeline implements its own stages directly for clarity),
 * but it's the shared primitive future Skills' workflows can build on
 * without touching Core.
 *
 * @param {Array<{ name: string, run: (ctx: object) => Promise<object>|object }>} stages
 * @param {object} initialContext
 */
export async function runWorkflow(stages, initialContext = {}) {
  let context = initialContext;
  for (const stage of stages) {
    const startedAt = Date.now();
    try {
      const result = await stage.run(context);
      context = { ...context, ...result };
      logger.info('workflow_stage_complete', { stage: stage.name, ms: Date.now() - startedAt });
    } catch (err) {
      logger.error('workflow_stage_failed', { stage: stage.name, error: err.message });
      throw err;
    }
  }
  return context;
}
