import { ClaudeBrain } from './claude-brain.mjs';

/**
 * Provider-agnostic Brain status, safe to expose over the API and render in
 * the UI. Never includes the API key, an authorization header, or anything
 * derived from them — only provider name, model, connection booleans, and
 * timestamps. Shared by server/api.mjs (§13/§14) and the `brain status`
 * command (§15) so the CLI and the Command Center UI can never drift.
 */
export function brainStatus(brain) {
  const provider = brain.providerName;

  if (provider !== 'claude') {
    return {
      provider,
      model: null,
      configured: null,
      available: null,
      lastSuccessAt: null,
      lastError: null,
      live: false,
      note: provider === 'file-drop'
        ? 'file-drop brain — writes prompts to core/brain/inbox/ for a human/Claude Code session to answer; no live model call.'
        : `Provider "${provider}" has no status detail implemented.`,
    };
  }

  const configured = Boolean(brain.configured);
  const s = ClaudeBrain.getStatus();
  const available = s.lastError ? false : (s.lastSuccessAt ? true : null);

  let note;
  if (!configured) {
    note = 'ANTHROPIC_API_KEY is not set — falling back to the file-drop brain. See docs/SETUP.md to configure it.';
  } else if (available === true) {
    note = `Connected. Last successful request: ${s.lastSuccessAt}.`;
  } else if (available === false) {
    note = `Configured, but the last request failed (${s.lastError.type}): ${s.lastError.message}`;
  } else {
    note = 'Configured but not tested yet this session — run "brain test".';
  }

  return {
    provider,
    model: s.model || brain.model || null,
    configured,
    available,
    lastSuccessAt: s.lastSuccessAt,
    lastError: s.lastError,
    live: Boolean(configured && available === true),
    note,
  };
}

/**
 * Minimal, inexpensive connectivity check (§15). Not attached to any JSON
 * schema — a fresh schema pays a one-time compile cost we don't want to
 * spend on a diagnostic ping.
 */
export async function testBrain(brain) {
  if (brain.providerName !== 'claude') {
    return { status: 'skipped', message: `Active provider is "${brain.providerName}", not claude — nothing to test.` };
  }
  if (!brain.configured) {
    return { status: 'not_configured', message: 'ANTHROPIC_API_KEY is not set. See docs/SETUP.md.' };
  }
  const result = await brain.generate('Reply with exactly: OK', { maxTokens: 256, id: `brain-test-${Date.now()}` });
  if (result.status === 'ok') return { status: 'ok', text: result.text };
  if (result.status === 'pending') return { status: 'not_configured', message: 'No ANTHROPIC_API_KEY configured — request dropped to the file-drop fallback.' };
  return { status: 'error', error: result.error };
}
