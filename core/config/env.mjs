import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.mjs';

const ENV_PATH = join(ROOT, '.env');

// Minimal KEY=VALUE parser, used only on Node versions without the built-in
// process.loadEnvFile() (added Node 20.6). Deliberately not a dependency —
// this project stays at zero npm dependencies.
function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

let loaded = false;

/**
 * Loads .env into process.env, if present, exactly once per process. Never
 * throws — a missing or malformed .env just means environment variables
 * (e.g. ANTHROPIC_API_KEY) stay unset, which the Brain layer already
 * handles honestly (falls back to file-drop). Existing process.env values
 * always win over .env (never overwrites an already-set variable).
 */
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  if (!existsSync(ENV_PATH)) return;

  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(ENV_PATH);
      return;
    }
    const parsed = parseEnvFile(readFileSync(ENV_PATH, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Malformed .env — ignore; the affected variables simply stay unset.
  }
}
