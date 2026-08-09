import { logger } from '../../core/logging/logger.mjs';
import { deduplicate, excludeAlreadyProcessed, jobKey } from './dedupe.mjs';
import { hardFilter } from './filters.mjs';
import { isPlaceholderListing } from './placeholder-filter.mjs';
import { scoreJob } from './scorer.mjs';
import { prepareApplicationDraft } from './outbox.mjs';
import { JobState, ConfidenceTier } from './job-state.mjs';

import { discover as discoverRemoteOk } from './sources/remoteok.mjs';
import { discover as discoverArbeitnow } from './sources/arbeitnow.mjs';
import { discover as discoverHnHiring } from './sources/hn-hiring.mjs';
import { discover as discoverManual } from './sources/manual-import.mjs';

const TRACKING_NAMESPACE = 'job-acquisition-tracking';
const DEEP_MATCH_MIN_SCORE = 60; // §21: only deep-analyze high-potential candidates

// §12: structured, machine-readable deep-match output. Advisory only — never
// touches selection, which stays governed by the deterministic score/threshold
// (§11). additionalProperties:false + explicit `required` keeps this a valid
// Anthropic structured-output schema (no recursion, no minimum/maxLength).
const DEEP_MATCH_SCHEMA = {
  type: 'object',
  properties: {
    relevance: { type: 'integer' },
    reasoning: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    missing_information: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string', enum: ['SELECT', 'REJECT', 'REVIEW'] },
  },
  required: ['relevance', 'reasoning', 'strengths', 'concerns', 'missing_information', 'recommendation'],
  additionalProperties: false,
};

const SOURCES = [
  { name: 'remoteok', fn: discoverRemoteOk },
  { name: 'arbeitnow', fn: discoverArbeitnow },
  { name: 'hn-whoishiring', fn: discoverHnHiring },
  { name: 'manual', fn: discoverManual },
];

/**
 * Runs the full §13 pipeline:
 * DISCOVER → DEDUPLICATE → HARD FILTER → DEEP MATCH → SCORE → RANK → SELECT
 * → PRESENT → TRACK
 *
 * @param {{ memory, brain, profile, config, sourcesFilter?: string[], onStage?: (stage: string) => void|Promise<void> }} deps
 */
export async function runCampaign({ memory, brain, profile, config, sourcesFilter, onStage }) {
  const threshold = config.jobAcquisition?.scoreThreshold ?? 85;
  const minBeforeShortfall = config.jobAcquisition?.minResultsBeforeReportingShortfall ?? 3;
  // §18: hard bound on live Brain calls per campaign run — prevents an
  // uncontrolled sequence of API calls (and their cost) from a single run.
  const maxDeepMatchCalls = config.jobAcquisition?.maxDeepMatchCallsPerRun ?? 20;
  let deepMatchCallsMade = 0;
  const emit = async (stage) => { if (onStage) await onStage(stage); };

  // --- DISCOVER ---
  await emit('DISCOVERING');
  const activeSources = SOURCES.filter((s) => !sourcesFilter || sourcesFilter.includes(s.name));
  const discovered = [];
  for (const source of activeSources) {
    const jobs = await source.fn();
    discovered.push(...jobs);
    logger.info('source_discovered', { source: source.name, count: jobs.length });
  }

  // --- DEDUPLICATE ---
  await emit('DEDUPLICATING');
  const { unique, dropped: dupesDropped } = deduplicate(discovered);
  logger.info('deduplicated', { input: discovered.length, unique: unique.length, dropped: dupesDropped });

  // Skip URLs already processed in a previous run (§21 token optimization).
  const tracking = memory.readState(TRACKING_NAMESPACE);
  const processedKeys = new Set(Object.keys(tracking));
  const fresh = excludeAlreadyProcessed(unique, processedKeys);
  logger.info('skipped_already_processed', { skipped: unique.length - fresh.length });

  const results = { screened: 0, placeholderFiltered: 0, hardFiltered: 0, qualified: 0, selected: 0 };
  const selectedJobs = [];

  // FILTERING and SCORING happen per-job in one pass below (filter, then —
  // only if it survives — score immediately). The stage events are still
  // emitted at real boundaries, just close together for a fast run; this is
  // deliberately coarse rather than restructured into two passes purely to
  // make progress reporting smoother.
  await emit('FILTERING');
  for (const job of fresh) {
    results.screened++;

    // --- STAGE 1: cheap placeholder pre-filter (§21) — before any regex-based
    // hard filtering. Tracked and logged separately from hardFiltered so the
    // funnel report doesn't conflate "not a real job" with "real job, wrong fit".
    if (isPlaceholderListing(job)) {
      results.placeholderFiltered++;
      tracking[job.key] = {
        ...minimalRecord(job),
        status: JobState.SKIPPED,
        rejectionReasons: ['PLACEHOLDER_LISTING'],
        checkedAt: new Date().toISOString(),
      };
      logger.decision('job_rejected_placeholder', { key: job.key, title: job.title });
      continue;
    }

    // --- HARD FILTER ---
    const filterResult = hardFilter(job, profile);
    if (!filterResult.pass) {
      results.hardFiltered++;
      tracking[job.key] = {
        ...minimalRecord(job),
        status: JobState.SKIPPED,
        rejectionReasons: filterResult.reasons,
        checkedAt: new Date().toISOString(),
      };
      logger.decision('job_rejected_hard_filter', { key: job.key, title: job.title, reasons: filterResult.reasons });
      continue;
    }

    // --- SCORE (cheap, deterministic — stage 2) ---
    const scoreResult = scoreJob(job, profile);

    // --- DEEP MATCH (stage 3, brain-assisted, only for high-potential jobs) ---
    // Advisory only: deepMatch never feeds back into scoreResult.total or the
    // threshold comparison below (§11) — it only adds qualitative context to
    // the note written for a job that's already been selected deterministically.
    let deepMatch = { status: 'skipped' };
    let deepMatchEvaluation = null;
    if (scoreResult.total >= DEEP_MATCH_MIN_SCORE && brain) {
      if (deepMatchCallsMade >= maxDeepMatchCalls) {
        deepMatch = { status: 'skipped-cap' };
      } else {
        deepMatchCallsMade++;
        const prompt = `You are assisting a deterministic job-matching pipeline. The score below is already ` +
          `final and authoritative — you are adding qualitative context only, never deciding selection. ` +
          `Distinguish observed fact from inference; never invent candidate experience or job facts not given here.\n\n` +
          `JOB: ${job.title} at ${job.company || 'unknown company'}\n${(job.description || '').slice(0, 1500)}\n\n` +
          `CANDIDATE: ${JSON.stringify({ education: profile.education, skills: profile.skills, targetRoles: profile.targetRoles })}\n\n` +
          `DETERMINISTIC SCORE: ${scoreResult.total}/100 (selection threshold ${threshold}). ` +
          `"recommendation" is advisory only and does not override this score/threshold.`;
        deepMatch = await brain.generate(prompt, { id: `deepmatch-${job.key}`, schema: DEEP_MATCH_SCHEMA, maxTokens: 700 });
        if (deepMatch.status === 'ok' && deepMatch.text) {
          try { deepMatchEvaluation = JSON.parse(deepMatch.text); } catch { deepMatchEvaluation = null; }
        }
      }
    }

    const confidenceTier = job.confidenceTier || ConfidenceTier.CONFIRMED_JOB;
    const record = {
      ...minimalRecord(job),
      status: JobState.SCREENED,
      confidenceTier,
      score: scoreResult.total,
      scoreBreakdown: scoreResult.breakdown,
      bonuses: scoreResult.bonuses,
      penalties: scoreResult.penalties,
      deepMatchStatus: deepMatch.status,
      deepMatchRequestId: deepMatch.requestId || null,
      // Only the short advisory verdict is persisted to tracking state (§21
      // keeps persistent records compact) — the full evaluation (reasoning,
      // strengths/concerns/missing_information) is attached below only for
      // jobs that get a note written, not stored in tracking.json.
      deepMatchRecommendation: deepMatchEvaluation?.recommendation || null,
      checkedAt: new Date().toISOString(),
    };

    if (scoreResult.total >= threshold && confidenceTier === ConfidenceTier.CONFIRMED_JOB) {
      record.status = JobState.QUALIFIED;
      results.qualified++;
      selectedJobs.push({ ...job, ...record, deepMatchEvaluation });
    }
    tracking[job.key] = record;
  }

  await emit('SCORING');

  // --- RANK + SELECT ---
  await emit('RANKING');
  selectedJobs.sort((a, b) => b.score - a.score);

  await emit('SELECTING');
  for (const job of selectedJobs) {
    tracking[job.key].status = JobState.SELECTED;
  }
  results.selected = selectedJobs.length;

  // --- PRESENT + TRACK (persist, write notes, prepare draft applications) ---
  memory.writeState(TRACKING_NAMESPACE, tracking);

  const presented = [];
  for (const job of selectedJobs) {
    const notePath = memory.writeNote(
      'Jobs',
      `${job.company || 'unknown'}-${job.title}`,
      renderJobNote(job),
      { status: 'SELECTED', score: job.score, source: job.source, url: job.url || '' }
    );
    const draftPath = prepareApplicationDraft(job, profile);
    tracking[job.key].status = JobState.APPLICATION_READY;
    tracking[job.key].notePath = notePath;
    tracking[job.key].draftPath = draftPath;
    presented.push({ ...job, notePath, draftPath });
  }
  memory.writeState(TRACKING_NAMESPACE, tracking);

  logger.info('campaign_complete', results);

  const shortfall = selectedJobs.length < minBeforeShortfall;
  return { ...results, threshold, shortfall, jobs: presented };
}

function renderDeepMatchSection(evaluation) {
  if (!evaluation) return '';
  return `
## Brain evaluation (advisory only — does not affect selection, §11)
- Relevance: ${evaluation.relevance}
- Recommendation: ${evaluation.recommendation}
- Reasoning: ${evaluation.reasoning}
${evaluation.strengths?.length ? `- Strengths: ${evaluation.strengths.join('; ')}\n` : ''}${evaluation.concerns?.length ? `- Concerns: ${evaluation.concerns.join('; ')}\n` : ''}${evaluation.missing_information?.length ? `- Missing information: ${evaluation.missing_information.join('; ')}\n` : ''}`;
}

function minimalRecord(job) {
  // §21: store compact facts, not full descriptions, to keep persistent state small.
  return {
    key: job.key,
    title: job.title,
    company: job.company,
    url: job.url || null,
    source: job.source,
    discoveredAt: new Date().toISOString(),
  };
}

function renderJobNote(job) {
  return `# ${job.title} — ${job.company || 'Unknown company'}

- **Score:** ${job.score}/100 (threshold: applied)
- **Confidence:** ${job.confidenceTier}
- **Source:** ${job.source}
- **URL:** ${job.url || 'n/a'}
- **State:** SELECTED

## Score breakdown
${Object.entries(job.scoreBreakdown).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
${job.bonuses.length ? `\n## Bonuses\n${job.bonuses.map(([r, v]) => `- ${r}: +${v}`).join('\n')}` : ''}
${job.penalties.length ? `\n## Penalties\n${job.penalties.map(([r, v]) => `- ${r}: ${v}`).join('\n')}` : ''}
${renderDeepMatchSection(job.deepMatchEvaluation)}

## Next action
Review draft application in \`skills/job-acquisition/outbox/${job.key}-application.md\` and complete human-required fields before sending.
`;
}
