import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ClaudeBrain } from '../core/brain/claude-brain.mjs';
import { brainStatus, testBrain } from '../core/brain/status.mjs';
import { executeCommand, parseCommand } from '../core/agent/command-router.mjs';

const FAKE_KEY = 'sk-ant-test-secret-do-not-leak-0000000000';
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

function fakeResponse(status, jsonBody, headersMap = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headersMap[k.toLowerCase()] ?? null },
    json: async () => jsonBody,
  };
}

// Queue-based fetch mock: each call shifts the next entry off `queue` and
// either returns it (a response-shaped object) or invokes/throws it as a
// function. Records every call's [url, options] for assertions.
function makeFetch(queue) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push([url, opts]);
    const next = queue.shift();
    if (typeof next === 'function') return next();
    return next;
  };
  fn.calls = calls;
  return fn;
}

function textResponse(text, overrides = {}) {
  return fakeResponse(200, { id: 'msg_123', stop_reason: 'end_turn', content: [{ type: 'text', text }], ...overrides });
}

beforeEach(() => {
  ClaudeBrain._resetStatusForTests();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

describe('ClaudeBrain: identity + config', () => {
  test('providerName is "claude"', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const brain = new ClaudeBrain({ model: 'claude-opus-5' });
    assert.equal(brain.providerName, 'claude');
  });

  test('configured is false with no ANTHROPIC_API_KEY, true once set', () => {
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(new ClaudeBrain({}).configured, false);
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    assert.equal(new ClaudeBrain({}).configured, true);
  });

  test('model defaults to claude-opus-5, respects config override', () => {
    assert.equal(new ClaudeBrain({}).model, 'claude-opus-5');
    assert.equal(new ClaudeBrain({ model: 'claude-haiku-4-5' }).model, 'claude-haiku-4-5');
  });
});

describe('ClaudeBrain: missing key -> honest fallback, never fabricates', () => {
  test('generate() delegates to the fallback brain without ever calling fetch', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    let fetchCalled = false;
    const fetchImpl = async () => { fetchCalled = true; return textResponse('should never happen'); };
    const fallback = { generate: async (prompt, opts) => ({ status: 'pending', requestId: opts.id || 'fallback-id' }) };
    const brain = new ClaudeBrain({}, { fetchImpl, fallback });

    const result = await brain.generate('hello', { id: 'req-1' });

    assert.equal(fetchCalled, false);
    assert.equal(result.status, 'pending');
    assert.equal(result.requestId, 'req-1');
  });
});

describe('ClaudeBrain: successful request', () => {
  test('parses text content and records success status', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([textResponse('OK')]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('Reply with exactly: OK', { maxTokens: 16 });

    assert.equal(result.status, 'ok');
    assert.equal(result.text, 'OK');
    assert.equal(result.requestId, 'msg_123');
    assert.equal(fetchImpl.calls.length, 1);

    const status = ClaudeBrain.getStatus();
    assert.ok(status.lastSuccessAt);
    assert.equal(status.lastError, null);
  });

  test('never sends temperature/top_p/top_k/thinking; sends output_config.effort', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([textResponse('OK')]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    await brain.generate('hi');

    const body = JSON.parse(fetchImpl.calls[0][1].body);
    assert.equal(body.temperature, undefined);
    assert.equal(body.top_p, undefined);
    assert.equal(body.top_k, undefined);
    assert.equal(body.thinking, undefined);
    assert.equal(body.output_config.effort, 'low');
  });

  test('a schema option produces an output_config.format.json_schema request', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([textResponse('{"ok":true}')]);
    const brain = new ClaudeBrain({}, { fetchImpl });
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };

    await brain.generate('evaluate', { schema });

    const body = JSON.parse(fetchImpl.calls[0][1].body);
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.deepEqual(body.output_config.format.schema, schema);
  });

  test('the API key is sent only in the x-api-key header, never in the body', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([textResponse('OK')]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    await brain.generate('hi');

    const [, opts] = fetchImpl.calls[0];
    assert.equal(opts.headers['x-api-key'], FAKE_KEY);
    assert.ok(!opts.body.includes(FAKE_KEY));
  });
});

describe('ClaudeBrain: malformed / refused / truncated responses', () => {
  test('a response with no text content block is an invalid_response error, not a crash', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([fakeResponse(200, { id: 'msg_1', stop_reason: 'end_turn', content: [] })]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('hi');

    assert.equal(result.status, 'error');
    assert.equal(result.error.type, 'invalid_response');
  });

  test('stop_reason "refusal" is surfaced as an error, not treated as ok', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([fakeResponse(200, { id: 'msg_1', stop_reason: 'refusal', content: [] })]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('hi');

    assert.equal(result.status, 'error');
    assert.equal(result.error.type, 'refusal');
  });

  test('stop_reason "max_tokens" is surfaced as a truncated_response error', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([fakeResponse(200, { id: 'msg_1', stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"incompl' }] })]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('hi', { maxTokens: 5 });

    assert.equal(result.status, 'error');
    assert.equal(result.error.type, 'truncated_response');
  });
});

describe('ClaudeBrain: error classification + bounded retries', () => {
  test('401 (invalid key) fails immediately, without retrying', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([fakeResponse(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } })]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('hi');

    assert.equal(result.status, 'error');
    assert.equal(result.error.type, 'authentication_error');
    assert.equal(fetchImpl.calls.length, 1, 'must not retry a 401');
  });

  test('429 succeeds after one retry', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([
      fakeResponse(429, { error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '0' }),
      textResponse('OK'),
    ]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('hi');

    assert.equal(result.status, 'ok');
    assert.equal(fetchImpl.calls.length, 2);
  });

  test('429 repeated forever is bounded to a fixed number of attempts, not an infinite loop', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([
      fakeResponse(429, { error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '0' }),
      fakeResponse(429, { error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '0' }),
      fakeResponse(429, { error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '0' }),
      fakeResponse(429, { error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '0' }),
    ]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('hi');

    assert.equal(result.status, 'error');
    assert.equal(result.error.type, 'rate_limit_error');
    assert.ok(fetchImpl.calls.length <= 3, `expected a bounded number of attempts, got ${fetchImpl.calls.length}`);
  });

  test('a network failure (fetch throws) is retried, then reported as connection_error', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([
      () => { throw new Error('getaddrinfo ENOTFOUND api.anthropic.com'); },
      () => { throw new Error('getaddrinfo ENOTFOUND api.anthropic.com'); },
      () => { throw new Error('getaddrinfo ENOTFOUND api.anthropic.com'); },
    ]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('hi');

    assert.equal(result.status, 'error');
    assert.equal(result.error.type, 'connection_error');
    assert.ok(fetchImpl.calls.length <= 3);
  });

  test('a 500 server error retries then fails; a 400 bad request never retries', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetch500 = makeFetch([
      fakeResponse(500, { error: { type: 'api_error', message: 'internal' } }),
      fakeResponse(500, { error: { type: 'api_error', message: 'internal' } }),
      fakeResponse(500, { error: { type: 'api_error', message: 'internal' } }),
    ]);
    const brain500 = new ClaudeBrain({}, { fetchImpl: fetch500 });
    const r500 = await brain500.generate('hi');
    assert.equal(r500.status, 'error');
    assert.ok(fetch500.calls.length > 1, '500 should be retried');

    const fetch400 = makeFetch([fakeResponse(400, { error: { type: 'invalid_request_error', message: 'bad model name' } })]);
    const brain400 = new ClaudeBrain({}, { fetchImpl: fetch400 });
    const r400 = await brain400.generate('hi');
    assert.equal(r400.status, 'error');
    assert.equal(fetch400.calls.length, 1, '400 must not be retried');
  });
});

describe('ClaudeBrain: secret redaction', () => {
  test('the API key never appears in a returned error, even if an upstream body echoes it', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([fakeResponse(401, { error: { type: 'authentication_error', message: `key ${FAKE_KEY} is invalid` } })]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await brain.generate('hi');

    assert.ok(!JSON.stringify(result).includes(FAKE_KEY));
    assert.ok(!JSON.stringify(ClaudeBrain.getStatus()).includes(FAKE_KEY));
  });
});

describe('core/brain/status.mjs: brainStatus() and testBrain()', () => {
  test('brainStatus() for a non-claude provider reports live:false without probing anything', () => {
    const status = brainStatus({ providerName: 'file-drop' });
    assert.equal(status.provider, 'file-drop');
    assert.equal(status.live, false);
    assert.equal(status.configured, null);
  });

  test('brainStatus() reports NOT CONNECTED (configured:false) with no key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const brain = new ClaudeBrain({});
    const status = brainStatus(brain);
    assert.equal(status.provider, 'claude');
    assert.equal(status.configured, false);
    assert.equal(status.live, false);
    assert.ok(!status.note.includes('ANTHROPIC_API_KEY=')); // never prints a key= assignment
  });

  test('brainStatus() reports CONNECTED after a successful generate()', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([textResponse('OK')]);
    const brain = new ClaudeBrain({}, { fetchImpl });
    await brain.generate('hi');

    const status = brainStatus(brain);
    assert.equal(status.configured, true);
    assert.equal(status.available, true);
    assert.equal(status.live, true);
  });

  test('brainStatus() reports ERROR (configured, not live) after a failed generate()', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([fakeResponse(401, { error: { type: 'authentication_error', message: 'bad key' } })]);
    const brain = new ClaudeBrain({}, { fetchImpl });
    await brain.generate('hi');

    const status = brainStatus(brain);
    assert.equal(status.configured, true);
    assert.equal(status.available, false);
    assert.equal(status.live, false);
  });

  test('testBrain() with no key reports not_configured without calling fetch', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    let called = false;
    const brain = new ClaudeBrain({}, { fetchImpl: async () => { called = true; return textResponse('OK'); } });

    const result = await testBrain(brain);

    assert.equal(result.status, 'not_configured');
    assert.equal(called, false);
  });

  test('testBrain() with a key performs one minimal request', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([textResponse('OK')]);
    const brain = new ClaudeBrain({}, { fetchImpl });

    const result = await testBrain(brain);

    assert.equal(result.status, 'ok');
    assert.equal(fetchImpl.calls.length, 1);
    const body = JSON.parse(fetchImpl.calls[0][1].body);
    assert.equal(body.output_config.format, undefined, 'brain test should not attach a JSON schema');
  });
});

describe('command-router: brain status / brain test', () => {
  test('parseCommand splits "brain status" / "brain test" via the generic fallback', () => {
    assert.deepEqual(parseCommand('brain status'), { command: 'brain', args: ['status'] });
    assert.deepEqual(parseCommand('brain test'), { command: 'brain', args: ['test'] });
  });

  test('executeCommand("brain", ["status"]) returns a brain-status result', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const agent = { brain: new ClaudeBrain({}) };

    const result = await executeCommand(agent, 'brain', ['status']);

    assert.equal(result.type, 'brain-status');
    assert.equal(result.status.provider, 'claude');
  });

  test('executeCommand("brain", ["test"]) returns a brain-test result', async () => {
    process.env.ANTHROPIC_API_KEY = FAKE_KEY;
    const fetchImpl = makeFetch([textResponse('OK')]);
    const agent = { brain: new ClaudeBrain({}, { fetchImpl }) };

    const result = await executeCommand(agent, 'brain', ['test']);

    assert.equal(result.type, 'brain-test');
    assert.equal(result.result.status, 'ok');
  });

  test('executeCommand("brain", []) with no subcommand throws a clear usage error', async () => {
    const agent = { brain: new ClaudeBrain({}) };
    await assert.rejects(() => executeCommand(agent, 'brain', []), /Usage: brain/);
  });
});
