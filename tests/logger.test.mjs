import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { logger, __internal } from '../core/logging/logger.mjs';

after(() => {
  if (existsSync(__internal.LOG_FILE)) {
    // Leave the real log file alone (other real events may be in it) —
    // nothing to clean up, redact() is pure and covered directly below.
  }
});

describe('logger secret redaction', () => {
  test('redacts keys that look like secrets', () => {
    const redacted = __internal.redact({ apiKey: 'sk-real-secret', token: 'abc123', password: 'hunter2', ok: 'fine' });
    assert.equal(redacted.apiKey, '[REDACTED]');
    assert.equal(redacted.token, '[REDACTED]');
    assert.equal(redacted.password, '[REDACTED]');
    assert.equal(redacted.ok, 'fine');
  });

  test('redacts nested secret keys', () => {
    const redacted = __internal.redact({ auth: { Authorization: 'Bearer xyz' }, safe: 1 });
    assert.equal(redacted.auth.Authorization, '[REDACTED]');
    assert.equal(redacted.safe, 1);
  });

  test('logger.info writes a JSONL entry without throwing and without leaking secret-named fields', () => {
    const entry = logger.info('test_event', { apiKey: 'should-not-appear', detail: 'ok' });
    assert.equal(entry.event, 'test_event');
    assert.equal(entry.apiKey, '[REDACTED]');
    assert.ok(existsSync(__internal.LOG_FILE));
    const lines = readFileSync(__internal.LOG_FILE, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.apiKey, '[REDACTED]');
  });
});
