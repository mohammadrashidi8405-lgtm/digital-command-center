import { createHash } from 'node:crypto';

/**
 * Normalizes a job listing URL for stable comparison: strips tracking query
 * params, trailing slashes, and protocol casing.
 */
export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hostname = url.hostname.toLowerCase();
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source'];
    for (const p of trackingParams) url.searchParams.delete(p);
    let path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.hostname}${path}${url.search}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Stable content hash used as the dedup/cache key so unchanged listings are
 * never reprocessed (§21). Falls back to company+title if a URL isn't
 * available (e.g. a manually-entered signal).
 */
export function jobKey(job) {
  const basis = job.url ? normalizeUrl(job.url) : `${job.company}::${job.title}`.toLowerCase();
  return createHash('sha256').update(basis).digest('hex').slice(0, 20);
}

/**
 * Removes duplicate jobs by jobKey, keeping the first occurrence. Returns
 * both the deduped list and how many were dropped, for logging.
 */
export function deduplicate(jobs) {
  const seen = new Set();
  const unique = [];
  let dropped = 0;
  for (const job of jobs) {
    const key = jobKey(job);
    if (seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    unique.push({ ...job, key });
  }
  return { unique, dropped };
}

/**
 * Filters out jobs whose key already exists in the processed-cache (§21:
 * "do not reprocess unchanged URLs"). `cache` is a Set/Map of known keys.
 */
export function excludeAlreadyProcessed(jobs, processedKeys) {
  return jobs.filter((job) => !processedKeys.has(job.key ?? jobKey(job)));
}
