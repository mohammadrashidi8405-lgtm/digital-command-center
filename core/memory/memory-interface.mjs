/**
 * Memory interface. The Agent Core and Skills depend only on this contract,
 * never on JSON-file details or Obsidian specifics — this lets the storage
 * backend evolve independently of everything that reads/writes memory.
 *
 * Three memory kinds are distinguished (see docs/ARCHITECTURE.md):
 *  - state:  short-term execution state (JSON, fast, machine-owned)
 *  - notes:  persistent human-readable knowledge (Markdown, Obsidian-compatible)
 *  - logs:   append-only event history (JSONL, see core/logging)
 */
export class MemoryInterface {
  /** @returns {object} */
  readState(namespace) {
    throw new Error('readState not implemented');
  }

  /** @returns {object} */
  writeState(namespace, value) {
    throw new Error('writeState not implemented');
  }

  /**
   * Writes a durable, human-readable note (Markdown). Backed by the
   * Obsidian vault if one is configured, otherwise by memory/vault-template/
   * so the system works identically before a vault exists.
   */
  writeNote(category, slug, content, frontmatter = {}) {
    throw new Error('writeNote not implemented');
  }
}
