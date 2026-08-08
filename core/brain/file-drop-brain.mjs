import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrainInterface } from './brain-interface.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INBOX = join(ROOT, 'core', 'brain', 'inbox');
const OUTBOX = join(ROOT, 'core', 'brain', 'outbox');

function hashId(prompt) {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

/**
 * Honest fallback Brain for environments with no live LLM API access
 * (no ANTHROPIC_API_KEY, no working `claude` CLI — the situation on this
 * machine as of setup). It does NOT call any model and never fabricates a
 * response.
 *
 * How it works:
 *  1. generate() computes a stable id for the prompt and checks
 *     core/brain/outbox/<id>.md for an existing answer (a human, or a Claude
 *     Code session, can read core/brain/inbox/<id>.md and drop the answer
 *     there).
 *  2. If no answer exists yet, it writes the prompt to
 *     core/brain/inbox/<id>.md and returns { status: 'pending' }.
 *  3. Callers must treat 'pending' as "not available right now" and fall
 *     back to deterministic/rule-based behavior — never block indefinitely.
 */
export class FileDropBrain extends BrainInterface {
  get providerName() {
    return 'file-drop';
  }

  async generate(prompt, opts = {}) {
    const id = opts.id || hashId(prompt);
    const outPath = join(OUTBOX, `${id}.md`);
    if (existsSync(outPath)) {
      return { status: 'ok', text: readFileSync(outPath, 'utf8'), requestId: id };
    }

    if (!existsSync(INBOX)) mkdirSync(INBOX, { recursive: true });
    const inPath = join(INBOX, `${id}.md`);
    if (!existsSync(inPath)) {
      const header = `<!-- Digital Command Center brain request. Answer by writing ` +
        `plain text to core/brain/outbox/${id}.md -->\n\n`;
      writeFileSync(inPath, header + prompt, 'utf8');
    }
    return { status: 'pending', requestId: id };
  }
}
