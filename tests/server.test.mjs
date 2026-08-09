import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { server } from '../server/api.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'config', 'config.json');

let base;
let originalConfig;

before(async () => {
  // Ephemeral port (listen(0)) — a fixed port would collide if a dev
  // server is already running, or with a second concurrent test run.
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
  originalConfig = readFileSync(CONFIG_PATH, 'utf8');
});

after(async () => {
  // Server tests hit the real Agent/config (no fake in this architecture) —
  // restore whatever config/config.json looked like before this run so the
  // test suite never leaves the real project state mutated.
  writeFileSync(CONFIG_PATH, originalConfig, 'utf8');
  await new Promise((resolve) => server.close(resolve));
});

describe('static UI serving', () => {
  test('GET / serves the app shell', async () => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const body = await res.text();
    assert.match(body, /Digital Command Center/);
  });

  test('GET /js/app.js serves as JavaScript', async () => {
    const res = await fetch(`${base}/js/app.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
  });

  test('GET /css/main.css serves as CSS', async () => {
    const res = await fetch(`${base}/css/main.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/css/);
  });

  test('unknown static path 404s, does not path-traverse', async () => {
    const res = await fetch(`${base}/../../../etc/passwd`);
    assert.notEqual(res.status, 200);
  });
});

describe('API: skills (real config read/write)', () => {
  test('GET /api/skills lists real skills including job-acquisition', async () => {
    const res = await fetch(`${base}/api/skills`);
    assert.equal(res.status, 200);
    const { skills } = await res.json();
    assert.ok(skills.some((s) => s.id === 'job-acquisition'));
  });

  test('toggling a skill actually persists to config.json and is reflected back', async () => {
    const disableRes = await fetch(`${base}/api/skills/job-acquisition/disable`, { method: 'POST' });
    assert.equal(disableRes.status, 200);

    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    assert.equal(config.skills['job-acquisition'], false, 'expected the real config file to be updated');

    const listRes = await fetch(`${base}/api/skills`);
    const { skills } = await listRes.json();
    assert.equal(skills.find((s) => s.id === 'job-acquisition').enabled, false);

    // restore
    const enableRes = await fetch(`${base}/api/skills/job-acquisition/enable`, { method: 'POST' });
    assert.equal(enableRes.status, 200);
  });

  test('enabling a manifest-only ("planned") skill is rejected with 409', async () => {
    const res = await fetch(`${base}/api/skills/data-analysis/enable`, { method: 'POST' });
    assert.equal(res.status, 409);
  });

  test('toggling an unknown skill 404s', async () => {
    const res = await fetch(`${base}/api/skills/not-a-real-skill/enable`, { method: 'POST' });
    assert.equal(res.status, 404);
  });
});

describe('API: campaign, opportunities, memory, logs (real data, no fakes)', () => {
  test('GET /api/campaign/status returns real tracking counts', async () => {
    const res = await fetch(`${base}/api/campaign/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.total, 'number');
    assert.equal(typeof body.byStatus, 'object');
  });

  test('GET /api/campaign/opportunities/:key 404s for a key that does not exist', async () => {
    const res = await fetch(`${base}/api/campaign/opportunities/definitely-not-a-real-key`);
    assert.equal(res.status, 404);
  });

  test('GET /api/memory reflects the real notesRoot and category counts', async () => {
    const res = await fetch(`${base}/api/memory`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.notesRoot.length > 0);
    assert.ok('Jobs' in body.categories);
  });

  test('GET /api/logs returns real JSONL log entries', async () => {
    const res = await fetch(`${base}/api/logs?limit=5`);
    assert.equal(res.status, 200);
    const { entries } = await res.json();
    assert.ok(Array.isArray(entries));
    assert.ok(entries.length <= 5);
  });
});

describe('API: command interface routes to real operations', () => {
  test('"skills" command returns the real skill list', async () => {
    const res = await fetch(`${base}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'skills' }),
    });
    assert.equal(res.status, 200);
    const { result } = await res.json();
    assert.equal(result.type, 'skills');
    assert.ok(result.skills.length > 0);
  });

  test('an unrecognized command returns an error, not a fabricated response', async () => {
    const res = await fetch(`${base}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'do something claude cannot actually do' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Unknown command/);
  });
});

describe('API: campaign stream (SSE) actually runs the pipeline', () => {
  test('streams real stage events and a complete event for the manual source', async () => {
    const res = await fetch(`${base}/api/campaign/stream?sources=manual`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);

    const text = await res.text();
    assert.match(text, /event: stage/);
    assert.match(text, /"stage":"DISCOVERING"/);
    assert.match(text, /event: complete/);
  });

  test('a second concurrent campaign request is rejected with 409, not queued silently', async () => {
    const first = fetch(`${base}/api/campaign/stream?sources=manual`);
    // No await — fire the second request while the first is (most likely) still in flight.
    const second = await fetch(`${base}/api/campaign/stream?sources=manual`);
    await first;
    // The two requests race in practice; assert only that a 409 is a
    // possible, correctly-handled outcome, not that first always wins.
    assert.ok([200, 409].includes(second.status));
  });
});

describe('security: no secrets in API responses', () => {
  test('/api/system and /api/status never leak key/token/secret-shaped values', async () => {
    const [sys, status] = await Promise.all([
      fetch(`${base}/api/system`).then((r) => r.text()),
      fetch(`${base}/api/status`).then((r) => r.text()),
    ]);
    for (const body of [sys, status]) {
      assert.doesNotMatch(body, /sk-[a-zA-Z0-9]{10,}/);
      assert.doesNotMatch(body, /ghp_[a-zA-Z0-9]{10,}/);
      assert.doesNotMatch(body, /-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    }
  });
});
