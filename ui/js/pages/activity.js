import { api } from '../api.js';
import { esc } from '../util.js';

export async function renderActivity(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Activity</h1>
      <p class="page-subtitle">Real system log — logs/command-center.jsonl, most recent first.</p>
    </div>
    <div id="log-body">Loading…</div>
  `;

  const body = container.querySelector('#log-body');
  try {
    const { entries } = await api.logs(150);
    if (entries.length === 0) {
      body.innerHTML = `<div class="empty-state"><div class="empty-state-title">No activity logged yet.</div></div>`;
      return;
    }
    body.innerHTML = `<div class="card" style="padding:0;">${entries.map(logRow).join('')}</div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

function logRow(e) {
  const level = e.level || 'info';
  return `
    <div class="log-entry">
      <span class="log-ts">${esc(e.ts || '')}</span>
      <span class="log-level log-level--${esc(level)}">${esc(level)}</span>
      <span class="log-event">${esc(e.event || '')} ${detailFor(e)}</span>
    </div>
  `;
}

function detailFor(e) {
  const skip = new Set(['ts', 'level', 'event']);
  const parts = Object.entries(e).filter(([k]) => !skip.has(k)).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return parts.length ? `<span class="faint">${esc(parts.join(' '))}</span>` : '';
}
