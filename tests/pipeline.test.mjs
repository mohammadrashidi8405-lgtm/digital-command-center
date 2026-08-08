import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCampaign } from '../skills/job-acquisition/pipeline.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_DIR = join(ROOT, 'skills', 'job-acquisition', 'manual-import');
const OUTBOX_DIR = join(ROOT, 'skills', 'job-acquisition', 'outbox');
const fixtureFile = join(IMPORT_DIR, `pipeline-test-${process.pid}.json`);

function fakeMemory() {
  const state = {};
  const notes = [];
  return {
    readState: (ns) => state[ns] || {},
    writeState: (ns, v) => { state[ns] = v; },
    writeNote: (category, slug, content, fm) => {
      notes.push({ category, slug, content, fm });
      return `fake://${category}/${slug}`;
    },
    _notes: notes,
    _state: state,
  };
}

const profile = {
  languages: [{ language: 'English', level: 'B2' }],
  skills: { aiAssisted: ['Python', 'JavaScript'], tools: ['Git/GitHub'] },
  targetRoles: { primary: ['AI Operations Intern'], secondary: [] },
};

const config = { jobAcquisition: { scoreThreshold: 85, minResultsBeforeReportingShortfall: 3 } };

after(() => {
  if (existsSync(fixtureFile)) unlinkSync(fixtureFile);
  // Clean up any draft files this test caused prepareApplicationDraft to write.
  for (const f of readdirSync(OUTBOX_DIR)) {
    if (f === '.gitkeep') continue;
    unlinkSync(join(OUTBOX_DIR, f));
  }
});

describe('job-acquisition pipeline: threshold + shortfall (§20)', () => {
  test('only jobs at/above threshold are selected; below-threshold jobs are screened but not selected', async () => {
    writeFileSync(fixtureFile, JSON.stringify([
      {
        title: 'AI Operations Intern', company: 'Great Fit Co',
        url: 'https://example.com/great', remote: true,
        description: 'AI-first startup seed, workflow automation, n8n, mentorship, small team, founder-accessible, paid $20/hr, python.',
      },
      {
        title: 'Warehouse Associate', company: 'Irrelevant Co',
        url: 'https://example.com/irrelevant', remote: false,
        description: 'Lift boxes all day.',
      },
    ]), 'utf8');

    const memory = fakeMemory();
    const result = await runCampaign({ memory, brain: null, profile, config, sourcesFilter: ['manual'] });

    assert.equal(result.selected, 1);
    assert.equal(result.jobs[0].company, 'Great Fit Co');
    assert.equal(result.hardFiltered, 1); // "Warehouse Associate" fails role-relevance hard filter
  });

  test('reports a shortfall instead of lowering the threshold when fewer than the minimum qualify (§20)', async () => {
    writeFileSync(fixtureFile, JSON.stringify([
      {
        title: 'AI Operations Intern', company: 'Solo Match Co',
        url: 'https://example.com/solo', remote: true,
        description: 'AI-first startup seed, workflow automation, n8n, mentorship, small team, founder-accessible, paid $20/hr, python.',
      },
    ]), 'utf8');

    const memory = fakeMemory();
    const result = await runCampaign({ memory, brain: null, profile, config, sourcesFilter: ['manual'] });

    assert.ok(result.selected < 3);
    assert.equal(result.shortfall, true);
  });

  test('already-processed job keys are skipped on a second run (token optimization, §21)', async () => {
    writeFileSync(fixtureFile, JSON.stringify([
      {
        title: 'AI Operations Intern', company: 'Repeat Co',
        url: 'https://example.com/repeat', remote: true,
        description: 'AI-first startup seed, workflow automation, mentorship, small team, founder-accessible, paid, python.',
      },
    ]), 'utf8');

    const memory = fakeMemory();
    const first = await runCampaign({ memory, brain: null, profile, config, sourcesFilter: ['manual'] });
    const second = await runCampaign({ memory, brain: null, profile, config, sourcesFilter: ['manual'] });

    assert.equal(first.screened, 1);
    assert.equal(second.screened, 0); // same fixture file, already-tracked key is skipped
  });
});
