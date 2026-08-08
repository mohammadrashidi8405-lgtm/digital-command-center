import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMemory } from '../core/memory/file-memory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEST_NAMESPACE = `test-namespace-${process.pid}`;
const stateFile = join(ROOT, 'memory', 'state', `${TEST_NAMESPACE}.json`);

after(() => {
  if (existsSync(stateFile)) unlinkSync(stateFile);
});

describe('FileMemory', () => {
  test('writeState then readState round-trips', () => {
    const memory = new FileMemory({});
    memory.writeState(TEST_NAMESPACE, { hello: 'world' });
    assert.deepEqual(memory.readState(TEST_NAMESPACE), { hello: 'world' });
  });

  test('readState returns {} for an unknown namespace', () => {
    const memory = new FileMemory({});
    assert.deepEqual(memory.readState(`unknown-${process.pid}`), {});
  });

  test('writeNote rejects an unknown category', () => {
    const vaultDir = mkdtempSync(join(tmpdir(), 'dcc-vault-'));
    const memory = new FileMemory({ obsidianVaultPath: vaultDir });
    assert.throws(() => memory.writeNote('NotACategory', 'slug', 'content'), /Unknown memory category/);
    rmSync(vaultDir, { recursive: true, force: true });
  });

  test('writeNote writes markdown with frontmatter to the configured vault', () => {
    const vaultDir = mkdtempSync(join(tmpdir(), 'dcc-vault-'));
    const memory = new FileMemory({ obsidianVaultPath: vaultDir });
    const path = memory.writeNote('Jobs', 'Acme Corp Intern', '# Body text', { status: 'SELECTED' });
    assert.ok(existsSync(path));
    const content = readFileSync(path, 'utf8');
    assert.match(content, /status: "SELECTED"/);
    assert.match(content, /# Body text/);
    rmSync(vaultDir, { recursive: true, force: true });
  });

  test('falls back to local-vault when configured vault path does not exist', () => {
    const memory = new FileMemory({ obsidianVaultPath: '/definitely/not/a/real/vault' });
    assert.ok(memory.notesRoot.endsWith('local-vault'));
  });
});
