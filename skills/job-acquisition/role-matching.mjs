/**
 * Single source of truth for "is this listing role-relevant" — used by both
 * filters.mjs (binary pass/fail) and scorer.mjs (graduated roleMatch score).
 *
 * Before this module existed, filters.mjs and scorer.mjs each had their own
 * independent role-matching logic and disagreed with each other: filters.mjs
 * used a broad keyword list (correct — it passed real AI-adjacent listings
 * and rejected noise), scorer.mjs used a narrow "first two words of the
 * target-role string" substring check (broken — it produced both a false
 * negative on a German AI internship, and a false positive where a single
 * incidental "product operations" mention bought a listing full role-match
 * marks). See docs/JOB_ACQUISITION.md for the audit that found this.
 *
 * Design: two tiers, kept deliberately separate for precision, and scoped
 * differently on purpose (see below).
 *  - ROLE_PHRASES: multi-word phrases, matched against title + description.
 *    Precise by construction — a generic function word like "operations" or
 *    "automation" only counts when paired with a domain word (e.g.
 *    "ai operations", "product operations"), so it can't fire on an
 *    unrelated "Operations Manager" warehouse listing.
 *  - AI_CONCEPT_TERMS: standalone AI-concept tokens (English + German),
 *    matched against the TITLE ONLY, not the description. Each token is
 *    specific enough to "artificial intelligence" to stand alone without a
 *    paired function word (this is what makes the German KI case —
 *    "Praktikum ... KI / AI" — match). But scoped to the title only, because
 *    matching it against the full description was verified to be too broad:
 *    re-running the live pipeline after adding it, a "Java Developer" role
 *    at an AI-branded startup cleared hard-filtering and scored 87/100
 *    purely because the company's boilerplate description ("we are an
 *    AI-native startup...") — repeated near-identically across ~35 unrelated
 *    postings from the same company — contains the token "AI". Titles don't
 *    carry that kind of boilerplate, so scoping the bare-token check to the
 *    title keeps the German-internship fix without reopening this hole.
 *
 * Callers get a match count, not just a boolean, so scoring can be graduated
 * (0 → weak default, 1 → partial credit, 2+ → full credit) instead of
 * treating any single incidental hit as a perfect match.
 */

const ROLE_PHRASES = [
  'ai operations', 'ai ops', 'ai startup', 'ai product', 'ai automation',
  'product operations', 'product ops', 'ai implementation', 'ai workflow',
  'ai/product operations', 'growth operations', "founder's associate",
  'data analyst', 'data operations', 'business analyst', 'research analyst',
  'economic data', 'ai intern', 'automation intern', 'no-code', 'workflow automation',
  'prompt engineer', 'llm', 'chatbot', 'ai agent',
  // FIX 2 additions (§ Phase 2 build brief)
  'ai enablement', 'ai strategy', 'ai support', 'ai solutions',
];

const AI_CONCEPT_TERMS = [
  /\bai\b/i,
  /\bartificial intelligence\b/i,
  /\bki\b/i,
  /\bkünstliche intelligenz\b/i,
];

export function matchRoleRelevance(title, description = '') {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();
  const matchedPhrases = ROLE_PHRASES.filter((p) => combined.includes(p));
  const matchedConcepts = AI_CONCEPT_TERMS.filter((re) => re.test(title || ''));
  const hitCount = matchedPhrases.length + matchedConcepts.length;
  return {
    isMatch: hitCount > 0,
    hitCount,
    matchedPhrases,
    matchedConceptCount: matchedConcepts.length,
  };
}

export const __internal = { ROLE_PHRASES, AI_CONCEPT_TERMS };
