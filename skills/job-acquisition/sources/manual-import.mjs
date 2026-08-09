import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../../core/logging/logger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const IMPORT_DIR = join(ROOT, 'skills', 'job-acquisition', 'manual-import');
const SOURCE = 'manual';

const VALID_CONFIDENCE_TIERS = ['CONFIRMED_JOB', 'POTENTIAL_UPCOMING_OPPORTUNITY', 'UNVERIFIED_SIGNAL'];

// Informational only — where a human found this listing. Never affects
// filtering or scoring; manual jobs go through the exact same hardFilter()/
// scoreJob() as every other source (§ Fix 4: no second scoring system).
const KNOWN_IMPORT_ORIGINS = [
  'linkedin', 'company-career-page', 'startup-job-board', 'founder-post', 'recruiter-post', 'other',
];

/**
 * Validates one manual-import entry against the documented schema (see
 * manual-import/example.json.template). Returns field-level errors so a
 * malformed entry is reported clearly instead of silently vanishing.
 */
export function validateManualEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, errors: ['entry must be a JSON object'] };
  }
  if (!entry.title || typeof entry.title !== 'string') {
    errors.push('missing/invalid "title" (required, non-empty string)');
  }
  if (!entry.company || typeof entry.company !== 'string') {
    errors.push('missing/invalid "company" (required, non-empty string)');
  }
  if (entry.url !== undefined && entry.url !== null && typeof entry.url !== 'string') {
    errors.push('"url" must be a string if present');
  }
  if (entry.remote !== undefined && entry.remote !== null && typeof entry.remote !== 'boolean') {
    errors.push('"remote" must be true/false if present');
  }
  if (entry.tags !== undefined && !Array.isArray(entry.tags)) {
    errors.push('"tags" must be an array of strings if present');
  }
  if (entry.confidenceTier !== undefined && !VALID_CONFIDENCE_TIERS.includes(entry.confidenceTier)) {
    errors.push(`"confidenceTier" must be one of: ${VALID_CONFIDENCE_TIERS.join(', ')}`);
  }
  if (entry.importOrigin !== undefined && !KNOWN_IMPORT_ORIGINS.includes(entry.importOrigin)) {
    errors.push(`"importOrigin" must be one of: ${KNOWN_IMPORT_ORIGINS.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * LinkedIn requires authentication and its ToS prohibits scraping (§13/§33) —
 * we do not automate it. This source is the honest workaround: drop JSON
 * files (array of entries, or a single entry) into
 * skills/job-acquisition/manual-import/, curated by a human from LinkedIn, a
 * company career page, a startup job board, a founder post, or a recruiter
 * post (set "importOrigin" accordingly). Files are gitignored (may reference
 * private listings). Every entry that validates flows into the exact same
 * dedupe → hard-filter → score → rank → select pipeline as every other
 * source — there is no separate manual-import scoring path.
 */
export async function discover() {
  try {
    const files = readdirSync(IMPORT_DIR).filter((f) => f.endsWith('.json'));
    const jobs = [];
    for (const file of files) {
      let raw;
      try {
        raw = JSON.parse(readFileSync(join(IMPORT_DIR, file), 'utf8'));
      } catch (err) {
        logger.warn('manual_import_parse_failed', { file, error: err.message });
        continue;
      }
      const entries = Array.isArray(raw) ? raw : [raw];
      entries.forEach((entry, index) => {
        const { valid, errors } = validateManualEntry(entry);
        if (!valid) {
          logger.warn('manual_import_validation_failed', { file, index, errors });
          return;
        }
        jobs.push({
          title: entry.title,
          company: entry.company,
          url: entry.url || null,
          source: SOURCE,
          description: entry.description || '',
          remote: entry.remote ?? null,
          location: entry.location || null,
          postedAt: entry.postedAt || null,
          tags: entry.tags || [],
          compensation: entry.compensation || null,
          confidenceTier: entry.confidenceTier || 'CONFIRMED_JOB',
          importOrigin: entry.importOrigin || 'other',
        });
      });
    }
    return jobs;
  } catch (err) {
    logger.warn('source_fetch_failed', { source: SOURCE, error: err.message });
    return [];
  }
}
