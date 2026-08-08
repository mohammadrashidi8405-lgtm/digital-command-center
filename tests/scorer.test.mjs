import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { scoreJob, SCORE_WEIGHTS } from '../skills/job-acquisition/scorer.mjs';

const profile = {
  skills: { aiAssisted: ['Python', 'JavaScript', 'React.js', 'SQL'], tools: ['Git/GitHub', 'Claude Code'] },
  targetRoles: { primary: ['AI Operations Intern'], secondary: ['Junior Data Analyst'] },
};

describe('scoreJob', () => {
  test('weights sum to 100', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(total, 100);
  });

  test('strong match scores highly', () => {
    const job = {
      title: 'AI Operations Intern',
      description: 'AI-first startup, remote, paid, mentorship, small team, python and sql, founder-accessible.',
      remote: true,
    };
    const result = scoreJob(job, profile);
    assert.ok(result.total >= 85, `expected >=85, got ${result.total}`);
  });

  test('weak/irrelevant listing scores low', () => {
    const job = {
      title: 'Senior Backend Engineer',
      description: '10+ years experience required. On-site only. CS degree required.',
      remote: false,
    };
    const result = scoreJob(job, profile);
    assert.ok(result.total < 60, `expected <60, got ${result.total}`);
  });

  test('score is always clamped to [0, 100]', () => {
    const job = { title: 'AI Operations Intern founder startup', description: 'ai-first startup seed n8n crm founder mentorship small team', remote: true };
    const result = scoreJob(job, profile);
    assert.ok(result.total <= 100 && result.total >= 0);
  });

  test('penalty markers reduce score', () => {
    const base = { title: 'AI Operations Intern', description: 'ai operations intern remote paid', remote: true };
    const withPenalty = { ...base, description: base.description + ' no company website' };
    const scoreBase = scoreJob(base, profile).total;
    const scorePenalized = scoreJob(withPenalty, profile).total;
    assert.ok(scorePenalized < scoreBase);
  });
});
