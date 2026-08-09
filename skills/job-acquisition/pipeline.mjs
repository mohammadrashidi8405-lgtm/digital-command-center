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
 * @param {{ memory, brain, profile, config, sourcesFilter?: string[] }} deps
 */
export async function runCampaign({ memory, brain, profile, config, sourcesFilter }) {
  const threshold = config.jobAcquisition?.scoreThreshold ?? 85;
  const minBeforeShortfall = config.jobAcquisition?.minResultsBeforeReportingShortfall ?? 3;

  // --- DISCOVER ---
  const activeSources = SOURCES.filter((s) => !sourcesFilter || sourcesFilter.includes(s.name));
  const discovered = [];
  for (const source of activeSources) {
    const jobs = await source.fn();
    discovered.push(...jobs);
    logger.info('source_discovered', { source: source.name, count: jobs.length });
  }

  // --- DEDUPLICATE ---
  const { unique, dropped: dupesDropped } = deduplicate(discovered);
  logger.info('deduplicated', { input: discovered.length, unique: unique.length, dropped: dupesDropped });

  // Skip URLs already processed in a previous run (§21 token optimization).
  const tracking = memory.readState(TRACKING_NAMESPACE);
  const processedKeys = new Set(Object.keys(tracking));
  const fresh = excludeAlreadyProcessed(unique, processedKeys);
  logger.info('skipped_already_processed', { skipped: unique.length - fresh.length });

  const results = { screened: 0, placeholderFiltered: 0, hardFiltered: 0, qualified: 0, selected: 0 };
  const selectedJobs = [];

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
    let deepMatch = { status: 'skipped' };
    if (scoreResult.total >= DEEP_MATCH_MIN_SCORE && brain) {
      const prompt = `Assess fit between this candidate profile and job listing. ` +
        `Return a short paragraph, not a score (scoring is deterministic elsewhere).\n\n` +
        `JOB: ${job.title} at ${job.company || 'unknown company'}\n${(job.description || '').slice(0, 1500)}\n\n` +
        `CANDIDATE: ${JSON.stringify({ education: profile.education, skills: profile.skills, targetRoles: profile.targetRoles })}`;
      deepMatch = await brain.generate(prompt, { id: `deepmatch-${job.key}` });
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
      checkedAt: new Date().toISOString(),
    };

    if (scoreResult.total >= threshold && confidenceTier === ConfidenceTier.CONFIRMED_JOB) {
      record.status = JobState.QUALIFIED;
      results.qualified++;
      selectedJobs.push({ ...job, ...record });
    }
    tracking[job.key] = record;
  }

  // --- RANK + SELECT ---
  selectedJobs.sort((a, b) => b.score - a.score);
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

## Next action
Review draft application in \`skills/job-acquisition/outbox/${job.key}-application.md\` and complete human-required fields before sending.
`;
}
