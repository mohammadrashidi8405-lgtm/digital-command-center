// Thin fetch wrapper over server/api.mjs. Every function here hits a real
// endpoint backed by the real Agent/skill-registry/pipeline — nothing in
// this file returns synthetic data.

async function request(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch { /* non-JSON error body */ }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  status: () => request('/api/status'),
  system: () => request('/api/system'),
  skills: () => request('/api/skills'),
  enableSkill: (id) => request(`/api/skills/${encodeURIComponent(id)}/enable`, { method: 'POST' }),
  disableSkill: (id) => request(`/api/skills/${encodeURIComponent(id)}/disable`, { method: 'POST' }),
  campaignStatus: () => request('/api/campaign/status'),
  opportunities: () => request('/api/campaign/opportunities'),
  opportunity: (key) => request(`/api/campaign/opportunities/${encodeURIComponent(key)}`),
  memory: () => request('/api/memory'),
  logs: (limit = 100) => request(`/api/logs?limit=${limit}`),
  tests: () => request('/api/tests'),
  runTests: () => request('/api/tests/run', { method: 'POST' }),
  command: (input) => request('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  }),

  /**
   * Starts a real campaign run over Server-Sent Events. onStage(stage) fires
   * for each of the six pipeline stages; onComplete(result)/onError(message)
   * fire once. Returns a function to abort the stream early.
   */
  streamCampaign(sources, { onStage, onComplete, onError }) {
    const qs = sources && sources.length ? `?sources=${sources.join(',')}` : '';
    const source = new EventSource(`/api/campaign/stream${qs}`);
    source.addEventListener('stage', (e) => onStage?.(JSON.parse(e.data).stage));
    source.addEventListener('complete', (e) => {
      onComplete?.(JSON.parse(e.data).result);
      source.close();
    });
    // Custom named event for a pipeline-level failure (distinct from
    // EventSource's built-in 'error', which fires on connection loss and
    // carries no .data — colliding the two names would break JSON.parse here).
    source.addEventListener('campaign-error', (e) => {
      onError?.(JSON.parse(e.data).error);
      source.close();
    });
    source.addEventListener('error', () => {
      onError?.('Connection to the server was lost.');
      source.close();
    });
    return () => source.close();
  },
};
