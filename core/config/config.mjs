import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONFIG_PATH = join(ROOT, 'config', 'config.json');
export const PROFILE_PATH = join(ROOT, 'config', 'profile.json');
export const PROFILE_EXAMPLE_PATH = join(ROOT, 'config', 'profile.example.json');

export function loadConfig(configPath = CONFIG_PATH) {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`);
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

/**
 * Loads the real candidate profile. Throws a clear, actionable error if the
 * user hasn't created config/profile.json yet (it is gitignored on purpose —
 * it may contain real personal/education data and must never be committed).
 */
export function loadProfile(profilePath = PROFILE_PATH) {
  if (!existsSync(profilePath)) {
    throw new Error(
      `config/profile.json not found. This file holds your real candidate profile and is ` +
      `gitignored so it never leaves this machine. Copy config/profile.example.json to ` +
      `config/profile.json and fill in real values, then retry.`
    );
  }
  return JSON.parse(readFileSync(profilePath, 'utf8'));
}

export function hasRealProfile(profilePath = PROFILE_PATH) {
  return existsSync(profilePath);
}
