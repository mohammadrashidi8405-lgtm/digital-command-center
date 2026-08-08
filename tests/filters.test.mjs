import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hardFilter } from '../skills/job-acquisition/filters.mjs';

const profile = { languages: [{ language: 'English', level: 'B2' }] };

describe('hardFilter', () => {
  test('passes a clean, relevant, junior-level listing', () => {
    const job = { title: 'AI Operations Intern', description: 'Great AI startup role for an intern.', url: 'https://example.com/1' };
    const result = hardFilter(job, profile);
    assert.equal(result.pass, true);
  });

  test('rejects senior-only listings without a junior marker', () => {
    const job = { title: 'Senior AI Engineer', description: 'Requires 8+ years of experience.', url: 'https://example.com/2' };
    const result = hardFilter(job, profile);
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes('experience-level')));
  });

  test('rejects listings with no role relevance', () => {
    const job = { title: 'Warehouse Associate', description: 'Lift boxes.', url: 'https://example.com/3' };
    const result = hardFilter(job, profile);
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes('role-relevance')));
  });

  test('rejects fraud/scam indicators', () => {
    const job = { title: 'AI Operations Intern', description: 'Pay a processing fee to start, wire transfer required.', url: 'https://example.com/4' };
    const result = hardFilter(job, profile);
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes('legitimacy')));
  });

  test('rejects unrequired language mismatch', () => {
    const job = { title: 'AI Operations Intern', description: 'Must be fluent German speaker.', url: 'https://example.com/5' };
    const result = hardFilter(job, profile);
    assert.equal(result.pass, false);
    assert.ok(result.reasons.some((r) => r.includes('language')));
  });

  test('a senior marker alongside an internship marker does not hard-reject on experience', () => {
    const job = { title: 'AI Operations Intern', description: 'Reports to the senior director but this is an internship role.', url: 'https://example.com/6' };
    const result = hardFilter(job, profile);
    assert.ok(!result.reasons.some((r) => r.includes('experience-level')));
  });
});
