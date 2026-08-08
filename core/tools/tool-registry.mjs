import { logger } from '../logging/logger.mjs';

export class ToolUnavailableError extends Error {}

/**
 * Simple fetch-based HTTP tool. Used by job-acquisition's sources.
 */
export const webFetchTool = {
  name: 'web-fetch',
  async run(url, opts = {}) {
    const res = await fetch(url, { headers: { 'User-Agent': 'digital-command-center/1.0', ...opts.headers } });
    return { status: res.status, ok: res.ok, body: await res.text() };
  },
};

/**
 * Browser automation tool — NOT implemented in v1 (§33). No Playwright/
 * Puppeteer is installed in this environment, and installing one is a
 * one-way decision (adds a real dependency + downloads browser binaries)
 * that a future session with a concrete need should make deliberately, not
 * this build. Calling this throws rather than silently no-op'ing or faking
 * success — the Job Acquisition skill never calls it in v1; LinkedIn/company
 * pages that would need it are handled via the manual-import source instead.
 */
export const browserTool = {
  name: 'browser-automation',
  async run() {
    throw new ToolUnavailableError(
      'Browser automation is not implemented. No local automation framework is installed. ' +
      'See docs/LIMITATIONS.md. Use the manual-import job source as the workaround.'
    );
  },
};

const TOOLS = new Map([
  [webFetchTool.name, webFetchTool],
  [browserTool.name, browserTool],
]);

export function getTool(name) {
  const tool = TOOLS.get(name);
  if (!tool) throw new Error(`Unknown tool: "${name}"`);
  return tool;
}

export function listTools() {
  return [...TOOLS.values()].map((t) => ({ name: t.name }));
}
