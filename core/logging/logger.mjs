import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOG_DIR = join(ROOT, 'logs');
const LOG_FILE = join(LOG_DIR, 'command-center.jsonl');

const SECRET_KEY_PATTERN = /token|secret|password|api[_-]?key|authorization|cookie/i;

function redact(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Append-only, compact JSONL logger. Never logs secrets (redacted by key name).
 */
export function log(level, event, data = {}) {
  ensureLogDir();
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...redact(data),
  };
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

export const logger = {
  info: (event, data) => log('info', event, data),
  warn: (event, data) => log('warn', event, data),
  error: (event, data) => log('error', event, data),
  decision: (event, data) => log('decision', event, data),
};

export const __internal = { redact, LOG_FILE };
