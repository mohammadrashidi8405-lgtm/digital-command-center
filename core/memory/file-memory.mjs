import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore } from '../state/state-store.mjs';
import { MemoryInterface } from './memory-interface.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE_DIR = join(ROOT, 'memory', 'state');
// Runtime notes fallback when no real Obsidian vault is configured. Gitignored
// in full — it will accumulate real notes (company names, job details) and
// must never reach a public repo. memory/vault-template/ (committed) is the
// empty, structure-only reference this directory is seeded from.
const LOCAL_VAULT_DIR = join(ROOT, 'memory', 'local-vault');

const VALID_CATEGORIES = new Set([
  'Projects', 'Skills', 'People', 'Companies', 'Jobs', 'Research', 'Work', 'Logs',
]);

function slugify(text) {
  return String(text)
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function toFrontmatter(fm) {
  const lines = Object.entries(fm).map(([k, v]) => {
    const value = Array.isArray(v) ? `[${v.map((x) => `"${x}"`).join(', ')}]` : JSON.stringify(v);
    return `${k}: ${value}`;
  });
  return `---\n${lines.join('\n')}\n---\n\n`;
}

/**
 * File-backed Memory implementation.
 *  - State: JSON files under memory/state/<namespace>.json (short-term,
 *    machine-owned execution state — e.g. campaign progress, dedup cache).
 *  - Notes: Markdown files, Obsidian-vault-shaped. Written to the configured
 *    vault path if one exists in config.memory.obsidianVaultPath, otherwise
 *    to memory/vault-template/ so the system is fully functional with no
 *    vault connected. Connecting a real vault later is just pointing the
 *    config path at it — no code changes.
 */
export class FileMemory extends MemoryInterface {
  constructor({ obsidianVaultPath = null } = {}) {
    super();
    this.notesRoot = obsidianVaultPath && existsSync(obsidianVaultPath)
      ? obsidianVaultPath
      : LOCAL_VAULT_DIR;
  }

  readState(namespace) {
    return this._store(namespace).read();
  }

  writeState(namespace, value) {
    return this._store(namespace).write(value);
  }

  updateState(namespace, mutator) {
    return this._store(namespace).update(mutator);
  }

  writeNote(category, slug, content, frontmatter = {}) {
    if (!VALID_CATEGORIES.has(category)) {
      throw new Error(`Unknown memory category "${category}". Valid: ${[...VALID_CATEGORIES].join(', ')}`);
    }
    const dir = join(this.notesRoot, category);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fileName = `${slugify(slug)}.md`;
    const path = join(dir, fileName);
    const body = Object.keys(frontmatter).length ? toFrontmatter(frontmatter) + content : content;
    writeFileSync(path, body, 'utf8');
    return path;
  }

  _store(namespace) {
    return new StateStore(join(STATE_DIR, `${slugify(namespace)}.json`), {});
  }
}
