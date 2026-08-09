/**
 * Cheap, stage-1 pre-filter for non-job "placeholder" listings — the RemoteOK
 * free API returns generic "apply anyway" / "check back soon" company pages
 * alongside real listings (confirmed in the campaign audit: 49 of 50 RemoteOK
 * results in one run were this kind of noise, not real job postings).
 *
 * Runs BEFORE the hard filter (§21 "cheap metadata screening" stage) so
 * these never reach role/experience-level regex evaluation.
 *
 * Deliberately exact-match on the first line of the title, not a substring
 * search — a substring check like /various|multiple/i would incorrectly
 * reject a real listing such as "Multiple AI Operations Intern openings".
 * Anchoring means only listings whose *entire* title matches a known
 * placeholder pattern are caught; everything else — including oddly terse
 * but real titles — passes through to the normal filters.
 */
const PLACEHOLDER_TITLES = new Set([
  'how apply',
  'oops something happened',
  'open vacancies',
  'open vacancy',
  'our vacancies',
  'think we could be a good fit',
  'check back soon',
  'candidature spontanée',
  'candidature spontanee',
  'candidature spontanãe', // observed mojibake variant of "spontanée"
  'test',
  'join our team',
  'join the family',
  'various',
  'multiple positions',
  'a glimpse of the pool',
]);

const PLACEHOLDER_PREFIXES = [
  'spontaneous application', // e.g. "Spontaneous Application Halifax"
];

function firstLine(title) {
  return (title || '').split('\n')[0].trim().toLowerCase();
}

export function isPlaceholderListing(job) {
  const line = firstLine(job.title);
  if (!line) return false;
  if (PLACEHOLDER_TITLES.has(line)) return true;
  return PLACEHOLDER_PREFIXES.some((prefix) => line.startsWith(prefix));
}
