import { matchRoleRelevance } from './role-matching.mjs';

const SENIOR_MARKERS = [
  /\bsenior\b/i, /\bstaff\b/i, /\blead\b/i, /\bprincipal\b/i, /\bdirector\b/i,
  /\bhead of\b/i, /\bvp\b/i, /\bmanager\b/i, /\b\d{1,2}\+?\s*years?\b/i,
];
const JUNIOR_MARKERS = [
  /\bintern(ship)?\b/i, /\bjunior\b/i, /\bentry[- ]level\b/i, /\bgraduate\b/i,
  /\bnew grad\b/i, /\bassociate\b/i, /\btrainee\b/i,
];

const FRAUD_MARKERS = [
  /processing fee/i, /application fee/i, /wire transfer/i, /send.*bank details/i,
  /pay (a|the) fee/i, /no interview (needed|required)/i, /western union/i,
  /crypto(currency)? (payment|wallet)/i, /telegram only/i,
];

function textOf(job) {
  return `${job.title || ''} ${job.description || ''}`.toLowerCase();
}

/**
 * §16 hard filters. Only rejects on objectively determinable blockers found
 * in the listing text — anything genuinely ambiguous (e.g. unclear work
 * authorization) is left to scoring penalties (§19) rather than a hard
 * reject, since we cannot fabricate certainty either way.
 */
export function hardFilter(job, profile) {
  const reasons = [];
  const text = textOf(job);

  const hasJuniorMarker = JUNIOR_MARKERS.some((re) => re.test(text));
  const hasSeniorMarker = SENIOR_MARKERS.some((re) => re.test(text));
  if (hasSeniorMarker && !hasJuniorMarker) {
    reasons.push('experience-level: listing reads as senior/experienced-only');
  }

  if (!matchRoleRelevance(job.title, job.description).isMatch) {
    reasons.push('role-relevance: no semantic match to target roles');
  }

  if (job.remote === false && job.onsiteRequired === true) {
    reasons.push('remote-compatibility: onsite-only, not remote-eligible');
  }

  const langReq = /fluent (german|french|spanish|italian|dutch|mandarin|japanese)/i.exec(job.description || '');
  if (langReq) {
    const known = (profile.languages || []).map((l) => l.language.toLowerCase());
    const required = langReq[1].toLowerCase();
    if (!known.includes(required)) {
      reasons.push(`language: requires fluent ${required}, not in candidate profile`);
    }
  }

  if (FRAUD_MARKERS.some((re) => re.test(text))) {
    reasons.push('legitimacy: contains common scam/fraud indicators');
  }

  if (!job.url && job.source !== 'manual') {
    reasons.push('legitimacy: no verifiable listing URL');
  }

  return { pass: reasons.length === 0, reasons };
}
