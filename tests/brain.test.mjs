import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileDropBrain } from '../core/brain/file-drop-brain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const testId = `test-${process.pid}`;
const inboxPath = join(ROOT, 'core', 'brain', 'inbox', `${testId}.md`);

after(() => {
  if (existsSync(inboxPath)) unlinkSync(inboxPath);
});

describe('FileDropBrain', () => {
  test('never fabricates an answer: returns pending and drops a request file', async () => {
    const brain = new FileDropBrain();
    const result = await brain.generate('What is 2+2?', { id: testId });
    assert.equal(result.status, 'pending');
    assert.equal(result.requestId, testId);
    assert.ok(existsSync(inboxPath));
  });

  test('providerName identifies the honest fallback provider', () => {
    const brain = new FileDropBrain();
    assert.equal(brain.providerName, 'file-drop');
  });
});
