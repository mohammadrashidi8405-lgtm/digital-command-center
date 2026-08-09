import { api } from '../api.js';
import { esc, relTime } from '../util.js';

const THRESHOLD = 85;

export async function renderDashboard(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <p class="page-subtitle">Live system state — nothing on this page is hardcoded.</p>
    </div>
    <div id="dash-body">${skeletonGrid()}</div>
  `;

  const body = container.querySelector('#dash-body');
  let data;
  try {
    data = await api.status();
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    return;
  }

  const { system, campaignStatus, scores, selected, recentActivity } = data;

  body.innerHTML = `
    <div class="grid grid-cols-4" style="margin-bottom:20px;">
      ${statTile('Skills Active', `${system.skills.active}/${system.skills.available}`, 'badge--accent')}
      ${statTile('Jobs Tracked', campaignStatus.total, campaignStatus.total ? 'badge--accent' : 'badge--neutral')}
      ${statTile('Qualified (≥85)', selected.length, selected.length ? 'badge--ok' : 'badge--neutral')}
      ${statTile('Brain', system.brain.live ? 'LIVE' : 'FILE-DROP', system.brain.live ? 'badge--ok' : 'badge--warn')}
    </div>

    <div class="grid grid-cols-2" style="margin-bottom:20px;">
      <div class="card">
        <div class="card-title">Campaign status</div>
        ${campaignStatus.total === 0
          ? `<div class="dim" style="font-size:12px;">No campaign has run yet. Go to Campaign to start one.</div>`
          : Object.entries(campaignStatus.byStatus).map(([s, c]) => `
              <div class="row-between" style="padding:4px 0; font-size:12px;">
                <span class="dim mono">${esc(s)}</span><span class="mono">${c}</span>
              </div>
            `).join('')}
      </div>

      <div class="card">
        <div class="card-title">Score distribution</div>
        ${scoreHistogram(scores)}
      </div>
    </div>

    <div class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">Selected opportunities</div>
        ${selected.length === 0
          ? `<div class="dim" style="font-size:12px;">None yet. Threshold is 85 — see Opportunities for detail.</div>`
          : selected.slice(0, 5).map((j) => `
              <div class="row-between" style="padding:6px 0; font-size:12px;">
                <span>${esc(j.title)} — <span class="dim">${esc(j.company || '')}</span></span>
                <span class="mono score-num">${j.score}</span>
              </div>
            `).join('')}
      </div>

      <div class="card">
        <div class="card-title">Recent activity</div>
        ${recentActivity.length === 0
          ? `<div class="dim" style="font-size:12px;">No activity yet.</div>`
          : recentActivity.slice(0, 6).map((e) => `
              <div class="row-between" style="padding:5px 0; font-size:12px;">
                <span class="dim">${esc(e.event)}</span>
                <span class="faint mono">${relTime(e.ts)}</span>
              </div>
            `).join('')}
      </div>
    </div>
  `;
}

function statTile(label, value, badgeClass) {
  return `
    <div class="card">
      <div class="card-title">${esc(label)}</div>
      <div class="card-stat"><span class="badge ${badgeClass}" style="font-size:16px; padding:3px 12px;">${esc(String(value))}</span></div>
    </div>
  `;
}

function skeletonGrid() {
  return `<div class="grid grid-cols-4">${Array.from({ length: 4 }).map(() => '<div class="card"><div class="skeleton" style="width:60%; margin-bottom:8px;"></div><div class="skeleton" style="width:40%;"></div></div>').join('')}</div>`;
}

// Single-hue sequential histogram (magnitude), with the >=85 bucket in the
// status "good" color — a status distinction, not a second category — and
// every bar always carries a printed count, so identity never depends on
// color alone.
function scoreHistogram(scores) {
  if (!scores || scores.length === 0) {
    return `<div class="dim" style="font-size:12px;">No scored jobs yet.</div>`;
  }
  const buckets = Array.from({ length: 10 }, (_, i) => ({ min: i * 10, max: i * 10 + 9, count: 0 }));
  for (const s of scores) {
    const idx = Math.min(9, Math.floor(s.score / 10));
    buckets[idx].count++;
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return `
    <div class="row" style="align-items:flex-end; gap:4px; height:100px;">
      ${buckets.map((b) => {
        const isPassBucket = b.min + 9 >= THRESHOLD;
        const heightPct = Math.max(4, Math.round((b.count / max) * 100));
        return `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px;">
            <span class="mono faint" style="font-size:10px;">${b.count || ''}</span>
            <div style="width:100%; height:${heightPct}px; border-radius:3px 3px 0 0; background:${isPassBucket ? 'var(--ok)' : 'var(--accent-dim)'};" title="${b.min}-${b.max}: ${b.count}"></div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="row-between" style="margin-top:6px;">
      <span class="faint" style="font-size:10px;">0</span>
      <span class="faint" style="font-size:10px;">threshold 85 →</span>
      <span class="faint" style="font-size:10px;">100</span>
    </div>
  `;
}
