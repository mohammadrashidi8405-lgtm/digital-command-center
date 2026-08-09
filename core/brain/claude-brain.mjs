import { BrainInterface } from './brain-interface.mjs';
import { FileDropBrain } from './file-drop-brain.mjs';
import { logger } from '../logging/logger.mjs';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-opus-5';
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);
const REQUEST_TIMEOUT_MS = 30_000;
const BASE_BACKOFF_MS = 500;

// Module-level, not per-instance: `new Agent()` (and therefore `new ClaudeBrain()`)
// is constructed fresh on every incoming HTTP request in server/api.mjs, so any
// state that must survive across requests (for the System page / `brain status`)
// has to live outside the instance.
const state = {
  model: null,
  lastSuccessAt: null,
  lastError: null,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Defense-in-depth only (see docs/SECURITY.md) — the key is never intentionally
// placed into a logged or returned string, but this strips it if it somehow
// echoes back from an upstream error body.
function redact(message, apiKey) {
  let out = String(message ?? '');
  if (apiKey) out = out.split(apiKey).join('[REDACTED]');
  return out.replace(/sk-ant-[A-Za-z0-9\-_]+/g, '[REDACTED]');
}

function extractText(data) {
  if (!Array.isArray(data?.content)) return null;
  const block = data.content.find((b) => b?.type === 'text' && typeof b.text === 'string');
  return block ? block.text : null;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Live Claude Brain provider. Implements the same BrainInterface contract as
 * FileDropBrain — generate(prompt, opts) -> { status: 'ok'|'pending'|'error', text?, requestId?, error? }.
 *
 * Credentials come exclusively from process.env.ANTHROPIC_API_KEY (never
 * hardcoded, never read from config/config.json). If the key is missing,
 * generate() delegates to a FileDropBrain instance rather than throwing or
 * fabricating a response — the caller sees the same honest 'pending' status
 * it would from the plain file-drop provider.
 */
export class ClaudeBrain extends BrainInterface {
  constructor(config = {}, { fetchImpl, fallback } = {}) {
    super();
    this.model = config.model || DEFAULT_MODEL;
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.fallback = fallback || new FileDropBrain();
    state.model = this.model;
  }

  get providerName() {
    return 'claude';
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  // Exposed so core/brain/status.mjs (shared by CLI + API + UI) can report
  // connection state without holding a reference to a live instance.
  static getStatus() {
    return {
      model: state.model,
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
    };
  }

  static _resetStatusForTests() {
    state.model = null;
    state.lastSuccessAt = null;
    state.lastError = null;
  }

  async generate(prompt, opts = {}) {
    if (!this.apiKey) {
      return this.fallback.generate(prompt, opts);
    }

    const body = {
      model: this.model,
      max_tokens: opts.maxTokens || 1024,
      messages: [{ role: 'user', content: prompt }],
      // effort:'low' keeps the (on-by-default) adaptive thinking budget small —
      // never send temperature/top_p/top_k/thinking, all rejected on this model.
      output_config: {
        effort: 'low',
        ...(opts.schema ? { format: { type: 'json_schema', schema: opts.schema } } : {}),
      },
    };
    if (opts.system) body.system = opts.system;

    let lastErr = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await this.fetchImpl(API_URL, {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': API_VERSION,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          const errBody = await safeJson(res);
          const message = redact(errBody?.error?.message || `HTTP ${res.status}`, this.apiKey);
          const type = errBody?.error?.type || `http_${res.status}`;
          lastErr = { type, status: res.status, message, at: new Date().toISOString() };

          if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
            const retryAfter = Number(res.headers?.get?.('retry-after'));
            const delay = Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : BASE_BACKOFF_MS * 2 ** (attempt - 1);
            await sleep(delay);
            continue;
          }
          return this._fail(lastErr);
        }

        const data = await res.json();

        if (data.stop_reason === 'refusal') {
          return this._fail({ type: 'refusal', status: res.status, message: 'Model declined to respond.', at: new Date().toISOString() });
        }
        if (data.stop_reason === 'max_tokens') {
          return this._fail({ type: 'truncated_response', status: res.status, message: 'Response was truncated at max_tokens before completion.', at: new Date().toISOString() });
        }

        const text = extractText(data);
        if (text === null) {
          return this._fail({ type: 'invalid_response', status: res.status, message: 'No text content block in response.', at: new Date().toISOString() });
        }

        state.lastSuccessAt = new Date().toISOString();
        state.lastError = null;
        return { status: 'ok', text, requestId: data.id };
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err.name === 'AbortError';
        lastErr = {
          type: isAbort ? 'timeout' : 'connection_error',
          status: null,
          message: redact(err.message, this.apiKey),
          at: new Date().toISOString(),
        };
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
          continue;
        }
      }
    }

    return this._fail(lastErr);
  }

  _fail(err) {
    state.lastError = err;
    logger.error('claude_brain_error', err);
    return { status: 'error', error: err };
  }
}
