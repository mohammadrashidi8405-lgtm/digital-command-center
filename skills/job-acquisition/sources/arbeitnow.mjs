import { logger } from '../../../core/logging/logger.mjs';

const ENDPOINT = 'https://www.arbeitnow.com/api/job-board-api';
const SOURCE = 'arbeitnow';

/**
 * Arbeitnow public JSON job-board API — free, no auth. Includes remote and
 * internship-tagged listings. Never throws (§28) — logs and returns [].
 */
export async function discover({ limit = 50 } = {}) {
  try {
    const res = await fetch(ENDPOINT, { headers: { 'User-Agent': 'digital-command-center/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const jobs = Array.isArray(data.data) ? data.data : [];
    return jobs.slice(0, limit).map((j) => ({
      title: j.title,
      company: j.company_name,
      url: j.url,
      source: SOURCE,
      description: (j.description || '').replace(/<[^>]+>/g, ' ').trim(),
      remote: Boolean(j.remote),
      location: j.location || null,
      postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
      tags: j.tags || j.job_types || [],
      compensation: null,
    }));
  } catch (err) {
    logger.warn('source_fetch_failed', { source: SOURCE, error: err.message });
    return [];
  }
}
