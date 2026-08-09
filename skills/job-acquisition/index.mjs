import { runCampaign } from './pipeline.mjs';
import { JobState } from './job-state.mjs';

const TRACKING_NAMESPACE = 'job-acquisition-tracking';

export { runCampaign };

export function campaignStatus({ memory }) {
  const tracking = memory.readState(TRACKING_NAMESPACE);
  const byStatus = {};
  for (const record of Object.values(tracking)) {
    byStatus[record.status] = (byStatus[record.status] || 0) + 1;
  }
  return { total: Object.keys(tracking).length, byStatus };
}

/**
 * Lists jobs whose followUpDate has arrived. Nothing in v1 sets a
 * followUpDate automatically (that requires knowing real application dates,
 * which requires a human to actually apply) — this is here so the state
 * model and CLI command exist and work the moment follow-up dates are set.
 */
export function dueFollowUps({ memory }) {
  const tracking = memory.readState(TRACKING_NAMESPACE);
  const today = new Date().toISOString().slice(0, 10);
  return Object.values(tracking).filter(
    (r) => r.status === JobState.FOLLOW_UP && r.followUpDate && r.followUpDate <= today
  );
}

export function listSelected({ memory }) {
  const tracking = memory.readState(TRACKING_NAMESPACE);
  return Object.values(tracking).filter((r) =>
    [JobState.SELECTED, JobState.APPLICATION_READY, JobState.QUALIFIED].includes(r.status)
  );
}

/** Full tracking record for one job by its dedup key, or null. */
export function getOpportunity({ memory, key }) {
  const tracking = memory.readState(TRACKING_NAMESPACE);
  return tracking[key] || null;
}

/**
 * Score distribution over jobs that survived filtering (i.e. have a `score`
 * field) — used by the dashboard's score-distribution chart. Real data only;
 * empty array if no campaign has run yet.
 */
export function scoreDistribution({ memory }) {
  const tracking = memory.readState(TRACKING_NAMESPACE);
  return Object.values(tracking)
    .filter((r) => typeof r.score === 'number')
    .map((r) => ({ key: r.key, title: r.title, company: r.company, score: r.score }));
}
