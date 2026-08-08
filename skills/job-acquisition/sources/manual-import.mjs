import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../../core/logging/logger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const IMPORT_DIR = join(ROOT, 'skills', 'job-acquisition', 'manual-import');
const SOURCE = 'manual';

/**
 * LinkedIn requires authentication and its ToS prohibits scraping (§13/§33) —
 * we do not automate it. This source is the honest workaround: drop JSON
 * files (array of job objects, or a single object) into
 * skills/job-acquisition/manual-import/, found via LinkedIn, a company
 * career page, or any other source read by a human or a Claude Code session
 * with web access. Files are gitignored (may reference private listings).
 */
export async function discover() {
  try {
    const files = readdirSync(IMPORT_DIR).filter((f) => f.endsWith('.json'));
    const jobs = [];
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(IMPORT_DIR, file), 'utf8'));
        const entries = Array.isArray(raw) ? raw : [raw];
        for (const j of entries) {
          if (!j.title || !j.company) continue;
          jobs.push({
            title: j.title,
            company: j.company,
            url: j.url || null,
            source: SOURCE,
            description: j.description || '',
            remote: j.remote ?? null,
            location: j.location || null,
            postedAt: j.postedAt || null,
            tags: j.tags || [],
            compensation: j.compensation || null,
            confidenceTier: j.confidenceTier || 'CONFIRMED_JOB',
          });
        }
      } catch (err) {
        logger.warn('manual_import_parse_failed', { file, error: err.message });
      }
    }
    return jobs;
  } catch (err) {
    logger.warn('source_fetch_failed', { source: SOURCE, error: err.message });
    return [];
  }
}
