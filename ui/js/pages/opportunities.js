import { api } from '../api.js';
import { esc } from '../util.js';

export async function renderOpportunities(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Opportunities</h1>
      <p class="page-subtitle">Only listings that cleared the fixed 85 score threshold. Rejected/screened jobs are not shown here.</p>
    </div>
    <div id="opp-list">Loading…</div>
  `;

  const list = container.querySelector('#opp-list');
  try {
    const { jobs } = await api.opportunities();
    if (jobs.length === 0) {
      let status;
      try { status = await api.campaignStatus(); } catch { status = null; }
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">No qualifying opportunities found.</div>
          <div>Nothing has cleared the score threshold yet.</div>
          <div class="empty-state-detail">
            Current threshold: 85${status ? `<br>Last run: ${status.total} discovered → 0 selected` : ''}
          </div>
        </div>
      `;
      return;
    }
    list.innerHTML = `
      <table>
        <thead><tr><th>Score</th><th>Role</th><th>Company</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>
          ${jobs.sort((a, b) => b.score - a.score).map(rowHtml).join('')}
        </tbody>
      </table>
    `;
    for (const row of list.querySelectorAll('tr.clickable')) {
      row.addEventListener('click', () => { location.hash = `#/opportunities/${row.dataset.key}`; });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.hash = `#/opportunities/${row.dataset.key}`; }
      });
    }
  } catch (err) {
    list.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
  }
}

function rowHtml(job) {
  return `
    <tr class="clickable" tabindex="0" data-key="${esc(job.key)}">
      <td><span class="score-num mono">${job.score}</span></td>
      <td>${esc(job.title)}</td>
      <td class="dim">${esc(job.company || '—')}</td>
      <td><span class="badge badge--neutral">${esc(job.source)}</span></td>
      <td><span class="badge badge--accent">${esc(job.status)}</span></td>
    </tr>
  `;
}

export async function renderOpportunityDetail(container, key) {
  container.innerHTML = `<div id="detail">Loading…</div>`;
  const detailEl = container.querySelector('#detail');
  try {
    const { job } = await api.opportunity(key);
    detailEl.innerHTML = detailHtml(job);
  } catch (err) {
    detailEl.innerHTML = `
      <a href="#/opportunities" class="detail-back">← Back to Opportunities</a>
      <div class="empty-state">${esc(err.message)}</div>
    `;
  }
}

function detailHtml(job) {
  const breakdown = job.scoreBreakdown
    ? Object.entries(job.scoreBreakdown).map(([k, v]) => `
        <div class="breakdown-row">
          <span class="dim" style="font-size:12px;">${esc(k)}</span>
          <div class="score-bar-track"><div class="score-bar-fill" style="width:${(v / 25) * 100}%"></div></div>
          <span class="mono" style="font-size:12px; text-align:right;">${v}</span>
        </div>
      `).join('')
    : '<div class="dim">This listing did not survive filtering, so no score breakdown exists.</div>';

  const why = job.status && job.rejectionReasons
    ? `<div class="stack">${job.rejectionReasons.map((r) => `<div class="badge badge--danger" style="width:fit-content;">${esc(r)}</div>`).join('')}</div>`
    : job.score
      ? `<p class="dim">Cleared hard filtering and scored ${job.score}/100 against the fixed 85 threshold, using the breakdown above — generated from actual scoring data, not an invented explanation.</p>`
      : '<p class="dim">No scoring data available.</p>';

  return `
    <a href="#/opportunities" class="detail-back">← Back to Opportunities</a>
    <div class="page-header">
      <h1>${esc(job.title)}</h1>
      <p class="page-subtitle">${esc(job.company || 'Unknown company')} · ${esc(job.source)}</p>
    </div>

    <div class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">Score breakdown</div>
        ${breakdown}
        ${job.bonuses?.length ? `<div style="margin-top:12px;"><div class="dim" style="font-size:11px; margin-bottom:6px;">BONUSES</div>${job.bonuses.map(([r, v]) => `<span class="badge badge--ok" style="margin:2px;">${esc(r)} +${v}</span>`).join('')}</div>` : ''}
        ${job.penalties?.length ? `<div style="margin-top:12px;"><div class="dim" style="font-size:11px; margin-bottom:6px;">PENALTIES</div>${job.penalties.map(([r, v]) => `<span class="badge badge--danger" style="margin:2px;">${esc(r)} ${v}</span>`).join('')}</div>` : ''}
      </div>

      <div class="card">
        <div class="card-title">Why this result</div>
        ${why}
        <div class="dim" style="margin-top:14px; font-size:12px;">
          <div>Status: <span class="badge badge--accent">${esc(job.status)}</span></div>
          <div style="margin-top:8px;">Confidence: ${esc(job.confidenceTier || 'n/a')}</div>
          <div style="margin-top:8px;">Discovered: ${esc(job.discoveredAt || 'n/a')}</div>
          ${job.url ? `<div style="margin-top:8px;"><a href="${esc(job.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">Open original listing ↗</a></div>` : ''}
        </div>
      </div>
    </div>

    ${job.notePath || job.draftPath ? `
      <div class="card" style="margin-top:16px;">
        <div class="card-title">Next action</div>
        ${job.draftPath ? `<div class="mono dim" style="font-size:12px;">Draft application: ${esc(job.draftPath)}</div>` : ''}
        ${job.notePath ? `<div class="mono dim" style="font-size:12px; margin-top:4px;">Memory note: ${esc(job.notePath)}</div>` : ''}
        <div class="dim" style="font-size:12px; margin-top:8px;">Drafts are prepare-only — review and complete human-required fields before sending anything.</div>
      </div>
    ` : ''}
  `;
}
