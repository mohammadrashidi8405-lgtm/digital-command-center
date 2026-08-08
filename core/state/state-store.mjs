import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Minimal JSON-file state store with atomic writes (write-tmp-then-rename).
 * Each store is bound to a single file and holds a single JSON value.
 */
export class StateStore {
  constructor(filePath, defaultValue = {}) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
  }

  read() {
    if (!existsSync(this.filePath)) return structuredClone(this.defaultValue);
    const raw = readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return structuredClone(this.defaultValue);
    return JSON.parse(raw);
  }

  write(value) {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf8');
    renameSync(tmpPath, this.filePath);
    return value;
  }

  update(mutator) {
    const current = this.read();
    const next = mutator(current);
    this.write(next);
    return next;
  }
}
