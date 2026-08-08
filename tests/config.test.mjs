import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadProfile, hasRealProfile } from '../core/config/config.mjs';

describe('config loader', () => {
  test('loadConfig parses a valid config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dcc-config-'));
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ skills: { x: true } }));
    assert.deepEqual(loadConfig(path), { skills: { x: true } });
    rmSync(dir, { recursive: true, force: true });
  });

  test('loadConfig throws a clear error if the file is missing', () => {
    assert.throws(() => loadConfig('/nonexistent/path/config.json'), /not found/);
  });

  test('hasRealProfile is false when profile.json does not exist', () => {
    assert.equal(hasRealProfile('/nonexistent/profile.json'), false);
  });

  test('loadProfile throws an actionable error (not a raw ENOENT) when missing', () => {
    assert.throws(
      () => loadProfile('/nonexistent/profile.json'),
      /profile\.example\.json/
    );
  });

  test('loadProfile returns parsed profile when present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dcc-profile-'));
    const path = join(dir, 'profile.json');
    writeFileSync(path, JSON.stringify({ identity: { displayName: 'Test' } }));
    assert.equal(hasRealProfile(path), true);
    assert.deepEqual(loadProfile(path), { identity: { displayName: 'Test' } });
    rmSync(dir, { recursive: true, force: true });
  });
});
