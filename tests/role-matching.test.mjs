import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchRoleRelevance } from '../skills/job-acquisition/role-matching.mjs';
import { hardFilter } from '../skills/job-acquisition/filters.mjs';
import { scoreJob, SCORE_WEIGHTS } from '../skills/job-acquisition/scorer.mjs';

const profile = {
  languages: [{ language: 'English', level: 'B2' }],
  skills: { aiAssisted: ['Python', 'JavaScript'], tools: ['Git/GitHub'] },
};

describe('matchRoleRelevance (Fix 1 + Fix 2 shared source of truth)', () => {
  test('matches an explicit target-role phrase in the title', () => {
    const result = matchRoleRelevance('AI Operations Intern');
    assert.equal(result.isMatch, true);
  });

  test('Fix 2: German "KI" internship title now matches (previously a confirmed false negative)', () => {
    // The exact real listing title from the campaign audit that was wrongly
    // hard-filtered before this fix: no English phrase, but explicit KI/AI.
    const result = matchRoleRelevance('Praktikum Online-Marketing / Marketing / KI / AI');
    assert.equal(result.isMatch, true);
    assert.ok(result.matchedConceptCount >= 1);
  });

  test('Fix 2: "Künstliche Intelligenz" and "Artificial Intelligence" are recognized', () => {
    assert.equal(matchRoleRelevance('Praktikum Künstliche Intelligenz').isMatch, true);
    assert.equal(matchRoleRelevance('Artificial Intelligence Research Assistant').isMatch, true);
  });

  test('generic function words alone do NOT match (precision, not indiscriminate broadening)', () => {
    // "operations" alone, with no domain word paired, must not count as a hit.
    assert.equal(matchRoleRelevance('Warehouse Operations Coordinator').isMatch, false);
  });

  test('no match on unrelated content', () => {
    assert.equal(matchRoleRelevance('Forklift Operator, night shift').isMatch, false);
  });

  test('a bare AI/KI token in the DESCRIPTION (not the title) does not count as a concept hit', () => {
    // Regression test for the false positive found during live verification:
    // Clera (an "AI-native" startup) posted ~35 unrelated roles that all
    // repeat "AI-native startup" boilerplate in the description. A Java
    // Developer listing there cleared role-relevance purely from that
    // boilerplate before this scoping fix, then scored 87/100 and got
    // selected — a real, observed regression, not a hypothetical.
    const result = matchRoleRelevance(
      'Java Developer',
      'Clera is an AI-native fintech startup. We are hiring a Java Developer to work on our backend.'
    );
    assert.equal(result.matchedConceptCount, 0, 'AI-concept token must not be sourced from the description');
    assert.equal(result.isMatch, false, 'a Java Developer role must not pass role-relevance on company boilerplate alone');
  });

  test('hitCount distinguishes a single incidental phrase match from multiple genuine ones', () => {
    const single = matchRoleRelevance('Workplace & Culture Intern', 'You will partner with our Product Operations team.');
    const multiple = matchRoleRelevance('AI Operations Intern', 'Join our AI Product team, remote, paid.');
    assert.equal(single.hitCount, 1);
    assert.ok(multiple.hitCount >= 2);
  });
});

describe('Fix 1: role-relevance is now consistent between filter and scorer', () => {
  test('the German KI internship now passes the hard filter role-relevance gate', () => {
    const job = {
      title: 'Praktikum Online-Marketing / Marketing / KI / AI',
      description: 'Internship supporting online marketing and AI-driven campaigns.',
      url: 'https://example.com/ki-praktikum',
    };
    const result = hardFilter(job, profile);
    assert.ok(!result.reasons.some((r) => r.startsWith('role-relevance')), `unexpected reasons: ${result.reasons}`);
  });

  test('an unrelated role at an "AI-native" company is still correctly hard-filtered (regression test)', () => {
    const job = {
      title: 'Java Developer',
      description: 'Clera is an AI-native fintech startup building the future of wealth management. We are hiring a Java Developer for our backend team.',
      url: 'https://example.com/java-dev',
      remote: true,
    };
    const result = hardFilter(job, profile);
    assert.ok(result.reasons.some((r) => r.startsWith('role-relevance')), `expected a role-relevance rejection, got: ${result.reasons}`);
  });

  test('a single incidental phrase match no longer buys full roleMatch credit', () => {
    // Only ONE hit ("product operations"), nothing else target-relevant —
    // this is the shape of the real "Workplace & Culture Intern" anomaly
    // found in the campaign audit (25/25 roleMatch from one incidental hit).
    const job = {
      title: 'Workplace & Culture Intern',
      description: 'You will partner with our Product Operations team on internal events.',
      remote: true,
    };
    const result = scoreJob(job, profile);
    assert.ok(
      result.breakdown.roleMatch < SCORE_WEIGHTS.roleMatch,
      `expected roleMatch below full ${SCORE_WEIGHTS.roleMatch}, got ${result.breakdown.roleMatch}`
    );
  });

  test('two or more genuine hits still earn full roleMatch credit', () => {
    const job = {
      title: 'AI Operations Intern',
      description: 'Join our AI Product team as an intern, remote and paid.',
      remote: true,
    };
    const result = scoreJob(job, profile);
    assert.equal(result.breakdown.roleMatch, SCORE_WEIGHTS.roleMatch);
  });
});
