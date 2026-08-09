import { api } from '../api.js';
import { esc } from '../util.js';

const STAGES = ['DISCOVERING', 'DEDUPLICATING', 'FILTERING', 'SCORING', 'RANKING', 'SELECTING'];
const SOURCES = ['remoteok', 'arbeitnow', 'hn-whoishiring', 'manual'];

export async function renderCampaign(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Campaign Control</h1>
      <p class="page-subtitle">Discover → Deduplicate → Filter → Score → Rank → Select. Threshold is fixed at 85 and is not adjustable from this UI.</p>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="row-between" style="flex-wrap:wrap; gap:12px;">
        <div class="row" style="flex-wrap:wrap; gap:14px;">
          <label class="dim" style="font-size:12px;">Sources:</label>
          ${SOURCES.map((s) => `
            <label class="row" style="gap:5px; font-size:12px;">
              <input type="checkbox" class="src-checkbox" value="${s}" checked> ${esc(s)}
            </label>
          `).join('')}
        </div>
        <button id="start-campaign" class="btn btn--primary">START CAMPAIGN</button>
      </div>
      <div id="progress-area" style="margin-top:16px;"></div>
    </div>

    <div class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">Funnel — last run</div>
        <div id="funnel">Loading…</div>
      </div>
      <div class="card">
        <div class="card-title">Status by job state</div>
        <div id="status-breakdown">Loading…</div>
      </div>
    </div>
  `;

  wireStart(container);
  await loadStatus(container);
}

function wireStart(container) {
  const btn = container.querySelector('#start-campaign');
  btn.addEventListener('click', () => {
    const sources = [...container.querySelectorAll('.src-checkbox:checked')].map((c) => c.value);
    if (sources.length === 0) return;
    runCampaign(container, sources);
  });
}

function runCampaign(container, sources) {
  const btn = container.querySelector('#start-campaign');
  const progressArea = container.querySelector('#progress-area');
  btn.disabled = true;
  btn.textContent = 'RUNNING…';

  progressArea.innerHTML = `<div class="progress-stages">${STAGES.map((s) => stageRow(s, 'pending')).join('')}</div>`;

  const setStage = (stage, state) => {
    const row = progressArea.querySelector(`[data-stage="${stage}"]`);
    if (!row) return;
    row.className = `progress-stage ${state}`;
    row.querySelector('.marker').textContent = state === 'done' ? '✓' : state === 'active' ? '▸' : '·';
  };

  let seenStages = [];
  api.streamCampaign(sources, {
    onStage(stage) {
      for (const s of seenStages) setStage(s, 'done');
      setStage(stage, 'active');
      seenStages.push(stage);
    },
    async onComplete(result) {
      for (const s of seenStages) setStage(s, 'done');
      progressArea.insertAdjacentHTML('beforeend', renderResult(result));
      btn.disabled = false;
      btn.textContent = 'START CAMPAIGN';
      await loadStatus(container);
    },
    onError(message) {
      progressArea.insertAdjacentHTML('beforeend', `<div class="dim" style="color:var(--danger); margin-top:10px;">Error: ${esc(message)}</div>`);
      btn.disabled = false;
      btn.textContent = 'START CAMPAIGN';
    },
  });
}

function stageRow(stage, state) {
  return `<div class="progress-stage ${state}" data-stage="${stage}"><span class="marker">·</span>${stage}</div>`;
}

function renderResult(r) {
  const lines = [
    `Screened: ${r.screened}`,
    `Placeholder-filtered: ${r.placeholderFiltered}`,
    `Hard-filtered: ${r.hardFiltered}`,
    `Qualified: ${r.qualified}`,
    `Selected: ${r.selected}`,
  ];
  return `
    <div style="margin-top:14px; padding-top:14px; border-top:1px solid var(--border);">
      <div class="mono" style="font-size:12px; line-height:1.8;">${lines.join('<br>')}</div>
      ${r.shortfall ? `<div class="badge badge--warn" style="margin-top:8px;">Below quality bar — threshold not lowered</div>` : ''}
      ${r.jobs.length ? `<div class="dim" style="margin-top:10px; font-size:12px;">${r.jobs.length} opportunity(ies) written to Memory and outbox — see Opportunities.</div>` : ''}
    </div>
  `;
}

async function loadStatus(container) {
  const funnelEl = container.querySelector('#funnel');
  const statusEl = container.querySelector('#status-breakdown');
  try {
    const status = await api.campaignStatus();
    if (status.total === 0) {
      funnelEl.innerHTML = `<div class="empty-state"><div class="empty-state-title">No campaign has run yet</div><div>Click START CAMPAIGN to run the pipeline for the first time.</div></div>`;
      statusEl.innerHTML = `<div class="dim">No data.</div>`;
      return;
    }
    const total = status.total;
    const rows = Object.entries(status.byStatus).sort((a, b) => b[1] - a[1]);
    funnelEl.innerHTML = `
      <div class="funnel">
        ${rows.map(([state, count]) => `
          <div class="funnel-row">
            <span class="funnel-label mono">${esc(state)}</span>
            <div class="funnel-track"><div class="funnel-fill" style="width:${Math.round((count / total) * 100)}%"></div></div>
            <span class="funnel-count">${count}</span>
          </div>
        `).join('')}
      </div>
    `;
    statusEl.innerHTML = `<div class="mono" style="font-size:12px;">Total tracked: ${total}</div>
      <div class="dim" style="font-size:12px; margin-top:6px;">Score threshold: <strong class="mono">85</strong> (fixed)</div>`;
  } catch (err) {
    funnelEl.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    statusEl.innerHTML = '';
  }
}
