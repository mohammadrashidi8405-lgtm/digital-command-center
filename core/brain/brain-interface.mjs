/**
 * Brain interface. Any provider (file-drop, future Claude API, OpenAI, Gemini,
 * local model) must implement this contract. The Agent Core and all Skills
 * depend only on this interface, never on a concrete provider — this is what
 * lets the active Brain be swapped without touching Memory/Skills/Tools/Workflows.
 */
export class BrainInterface {
  /** @returns {string} short id like "file-drop" or "anthropic-api" */
  get providerName() {
    throw new Error('providerName not implemented');
  }

  /**
   * Request generation from the brain. MUST be non-blocking-safe: if the
   * underlying provider cannot answer synchronously (e.g. file-drop with no
   * human/agent to fulfill it yet), it should return { status: 'pending', ... }
   * rather than hang or fabricate a response.
   *
   * @param {string} prompt
   * @param {{ id?: string, context?: object }} [opts]
   * @returns {Promise<{ status: 'ok'|'pending'|'error', text?: string, requestId?: string, error?: string }>}
   */
  async generate(prompt, opts = {}) {
    throw new Error('generate not implemented');
  }
}
