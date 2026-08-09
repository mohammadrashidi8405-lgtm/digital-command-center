import { api } from '../api.js';
import { esc } from '../util.js';

export async function renderMemory(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Memory</h1>
      <p class="page-subtitle">Persistent, human-readable knowledge — separate from short-term execution state.</p>
    </div>
    <div id="memory-body">Loading…</div>
  `;

  const body = container.querySelector('#memory-body');
  try {
    const mem = await api.memory();
    body.innerHTML = `
      <div class="card" style="margin-bottom:20px;">
        <div class="row-between">
          <div>
            <div class="card-title">Obsidian</div>
            <div class="mono" style="font-size:15px;">${mem.obsidianConnected ? 'CONNECTED' : 'NOT CONNECTED'}</div>
          </div>
          <span class="badge ${mem.obsidianConnected ? 'badge--ok' : 'badge--neutral'}">${mem.obsidianConnected ? 'LIVE VAULT' : 'LOCAL FALLBACK'}</span>
        </div>
        <p class="dim" style="font-size:12px; margin-top:10px;">
          ${mem.obsidianConnected
            ? `Writing notes to your connected vault.`
            : `No Obsidian vault is connected. The local Markdown memory layer is active instead — functionally identical, just not opened in Obsidian. Notes root: <span class="mono">${esc(mem.notesRoot)}</span>. See memory/README.md to connect a real vault.`}
        </p>
      </div>

      <div class="grid grid-cols-4">
        ${Object.entries(mem.categories).map(([category, count]) => `
          <div class="card">
            <div class="card-title">${esc(category)}</div>
            <div class="card-stat">${count}</div>
            <div class="card-stat-label">note${count === 1 ? '' : 's'}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}
