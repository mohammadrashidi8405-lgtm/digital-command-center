import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, jobKey, deduplicate, excludeAlreadyProcessed } from '../skills/job-acquisition/dedupe.mjs';

describe('dedupe', () => {
  test('normalizeUrl strips tracking params and trailing slash', () => {
    const a = normalizeUrl('https://Example.com/jobs/123/?utm_source=x&ref=y');
    const b = normalizeUrl('https://example.com/jobs/123');
    assert.equal(a, b);
  });

  test('jobKey is stable for the same URL', () => {
    const job1 = { url: 'https://example.com/jobs/1' };
    const job2 = { url: 'https://example.com/jobs/1?utm_source=z' };
    assert.equal(jobKey(job1), jobKey(job2));
  });

  test('jobKey falls back to company+title when no URL', () => {
    const job = { company: 'Acme', title: 'Intern' };
    assert.equal(jobKey(job), jobKey({ company: 'Acme', title: 'Intern' }));
    assert.notEqual(jobKey(job), jobKey({ company: 'Acme', title: 'Other' }));
  });

  test('deduplicate removes duplicate jobs and reports count dropped', () => {
    const jobs = [
      { url: 'https://example.com/a' },
      { url: 'https://example.com/a?utm_source=x' },
      { url: 'https://example.com/b' },
    ];
    const { unique, dropped } = deduplicate(jobs);
    assert.equal(unique.length, 2);
    assert.equal(dropped, 1);
  });

  test('excludeAlreadyProcessed filters out known keys', () => {
    const jobs = [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }];
    const { unique } = deduplicate(jobs);
    const processed = new Set([unique[0].key]);
    const fresh = excludeAlreadyProcessed(unique, processed);
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].key, unique[1].key);
  });
});
