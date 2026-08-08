import { logger } from '../../../core/logging/logger.mjs';

const ENDPOINT = 'https://remoteok.com/api';
const SOURCE = 'remoteok';

/**
 * RemoteOK public JSON API — free, no auth, legitimate remote-job listings.
 * Never throws: on any failure it logs and returns an empty list so the
 * pipeline can continue with other sources (§28).
 */
export async function discover({ limit = 50 } = {}) {
  try {
    const res = await fetch(ENDPOINT, { headers: { 'User-Agent': 'digital-command-center/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // First element is a legal-notice object, not a job.
    const jobs = data.filter((j) => j && j.id && j.position);
    return jobs.slice(0, limit).map((j) => ({
      title: j.position,
      company: j.company,
      url: j.url || (j.id ? `https://remoteok.com/remote-jobs/${j.id}` : null),
      source: SOURCE,
      description: (j.description || '').replace(/<[^>]+>/g, ' ').trim(),
      remote: true,
      location: j.location || 'Remote',
      postedAt: j.date || null,
      tags: j.tags || [],
      compensation: j.salary_min ? `${j.salary_min}-${j.salary_max || ''}` : null,
    }));
  } catch (err) {
    logger.warn('source_fetch_failed', { source: SOURCE, error: err.message });
    return [];
  }
}
