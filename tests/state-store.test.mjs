import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../core/state/state-store.mjs';

describe('StateStore', () => {
  test('returns default value when file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dcc-state-'));
    const store = new StateStore(join(dir, 'nope.json'), { foo: 'bar' });
    assert.deepEqual(store.read(), { foo: 'bar' });
    rmSync(dir, { recursive: true, force: true });
  });

  test('write then read round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dcc-state-'));
    const store = new StateStore(join(dir, 'state.json'), {});
    store.write({ a: 1, nested: { b: 2 } });
    assert.deepEqual(store.read(), { a: 1, nested: { b: 2 } });
    rmSync(dir, { recursive: true, force: true });
  });

  test('update mutates and persists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dcc-state-'));
    const store = new StateStore(join(dir, 'state.json'), { count: 0 });
    store.update((s) => ({ count: s.count + 1 }));
    store.update((s) => ({ count: s.count + 1 }));
    assert.equal(store.read().count, 2);
    rmSync(dir, { recursive: true, force: true });
  });

  test('creates parent directory if missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dcc-state-'));
    const store = new StateStore(join(dir, 'nested', 'deep', 'state.json'), {});
    store.write({ ok: true });
    assert.deepEqual(store.read(), { ok: true });
    rmSync(dir, { recursive: true, force: true });
  });
});
