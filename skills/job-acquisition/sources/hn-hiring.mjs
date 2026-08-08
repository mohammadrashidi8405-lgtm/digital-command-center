import { logger } from '../../../core/logging/logger.mjs';

const SEARCH_ENDPOINT = 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Who%20is%20hiring';
const ITEM_ENDPOINT = (id) => `https://hn.algolia.com/api/v1/items/${id}`;
const SOURCE = 'hn-whoishiring';

function firstLine(text) {
  return (text || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
}

/**
 * Hacker News "Who is hiring?" thread via the free, public, unauthenticated
 * HN Algolia API. Comments are free-text, so company/title extraction is
 * best-effort — every job from this source is marked UNVERIFIED_SIGNAL
 * confidence (§14), never CONFIRMED_JOB, until a human reviews it.
 * Never throws (§28) — logs and returns [] on any failure.
 */
export async function discover({ limit = 60 } = {}) {
  try {
    const searchRes = await fetch(SEARCH_ENDPOINT, { headers: { 'User-Agent': 'digital-command-center/1.0' } });
    if (!searchRes.ok) throw new Error(`HTTP ${searchRes.status} on thread search`);
    const searchData = await searchRes.json();
    const thread = searchData.hits?.[0];
    if (!thread) return [];

    const itemRes = await fetch(ITEM_ENDPOINT(thread.objectID), { headers: { 'User-Agent': 'digital-command-center/1.0' } });
    if (!itemRes.ok) throw new Error(`HTTP ${itemRes.status} on thread fetch`);
    const item = await itemRes.json();
    const comments = (item.children || []).filter((c) => c && c.text);

    return comments.slice(0, limit).map((c) => {
      const plain = c.text.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').trim();
      const headline = firstLine(plain);
      return {
        title: headline.slice(0, 140),
        company: null, // not reliably separable from free text — left for deep-match/human review
        url: `https://news.ycombinator.com/item?id=${c.id}`,
        source: SOURCE,
        description: plain.slice(0, 2000),
        remote: /\bremote\b/i.test(plain),
        location: null,
        postedAt: c.created_at || null,
        tags: [],
        compensation: null,
        confidenceTier: 'UNVERIFIED_SIGNAL',
      };
    });
  } catch (err) {
    logger.warn('source_fetch_failed', { source: SOURCE, error: err.message });
    return [];
  }
}
