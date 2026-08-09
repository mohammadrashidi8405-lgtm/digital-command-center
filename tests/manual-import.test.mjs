import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManualEntry, discover } from '../skills/job-acquisition/sources/manual-import.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_DIR = join(ROOT, 'skills', 'job-acquisition', 'manual-import');
const LOG_FILE = join(ROOT, 'logs', 'command-center.jsonl');
const fixtureFile = join(IMPORT_DIR, `validation-test-${process.pid}.json`);

after(() => {
  if (existsSync(fixtureFile)) unlinkSync(fixtureFile);
});

describe('validateManualEntry (Fix 4 schema validation)', () => {
  test('accepts a fully valid entry', () => {
    const { valid, errors } = validateManualEntry({
      title: 'AI Operations Intern',
      company: 'Acme',
      url: 'https://example.com/1',
      remote: true,
      tags: ['ai', 'intern'],
      confidenceTier: 'CONFIRMED_JOB',
      importOrigin: 'linkedin',
    });
    assert.equal(valid, true);
    assert.deepEqual(errors, []);
  });

  test('accepts the minimal valid entry (title + company only)', () => {
    const { valid } = validateManualEntry({ title: 'AI Operations Intern', company: 'Acme' });
    assert.equal(valid, true);
  });

  test('rejects a missing title', () => {
    const { valid, errors } = validateManualEntry({ company: 'Acme' });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('title')));
  });

  test('rejects a missing company', () => {
    const { valid, errors } = validateManualEntry({ title: 'AI Operations Intern' });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('company')));
  });

  test('rejects an invalid confidenceTier', () => {
    const { valid, errors } = validateManualEntry({ title: 'x', company: 'y', confidenceTier: 'MAYBE' });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('confidenceTier')));
  });

  test('rejects an invalid importOrigin', () => {
    const { valid, errors } = validateManualEntry({ title: 'x', company: 'y', importOrigin: 'psychic-hunch' });
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('importOrigin')));
  });

  test('rejects a non-object entry', () => {
    assert.equal(validateManualEntry('not an object').valid, false);
    assert.equal(validateManualEntry(null).valid, false);
  });
});

describe('discover() end-to-end validation behavior', () => {
  test('valid entries pass through; invalid entries are skipped and logged, not silently merged', async () => {
    writeFileSync(fixtureFile, JSON.stringify([
      { title: 'AI Operations Intern', company: 'Good Co', url: 'https://example.com/good', importOrigin: 'company-career-page' },
      { title: 'Missing company field only' }, // invalid — no `company`
    ]), 'utf8');

    const jobs = await discover();
    const fromThisFixture = jobs.filter((j) => j.company === 'Good Co' || j.title === 'Missing company field only');

    assert.equal(fromThisFixture.length, 1);
    assert.equal(fromThisFixture[0].company, 'Good Co');
    assert.equal(fromThisFixture[0].importOrigin, 'company-career-page');

    const logTail = readFileSync(LOG_FILE, 'utf8').trim().split('\n').slice(-5).join('\n');
    assert.ok(logTail.includes('manual_import_validation_failed'), 'expected a validation-failure log entry');
  });
});
