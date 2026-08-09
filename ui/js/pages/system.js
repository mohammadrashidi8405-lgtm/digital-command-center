import { api } from '../api.js';
import { esc } from '../util.js';

export async function renderSystem(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>System</h1>
      <p class="page-subtitle">What's actually connected right now — no capability is claimed unless it's real.</p>
    </div>
    <div id="system-body">Loading…</div>
  `;

  const body = container.querySelector('#system-body');
  await load(body);
}

async function load(body) {
  let sys;
  try {
    sys = await api.system();
  } catch (err) {
    body.innerHTML = `<div class="empty-state">${esc(err.message)}</div>`;
    return;
  }

  body.innerHTML = `
    <div class="grid grid-cols-2">
      ${statusCard('Brain', brainLabel(sys.brain), brainBadgeClass(sys.brain), [
        `Provider: <span class="mono">${esc(sys.brain.provider)}</span>${sys.brain.model ? ` &middot; Model: <span class="mono">${esc(sys.brain.model)}</span>` : ''}`,
        esc(sys.brain.note),
        sys.brain.lastSuccessAt ? `Last successful request: <span class="mono">${esc(sys.brain.lastSuccessAt)}</span>` : '',
      ].filter(Boolean))}
      ${statusCard('Memory', 'OK', 'badge--ok', [
        `Notes root: <span class="mono" style="font-size:11px;">${esc(sys.memory.notesRoot)}</span>`,
        `Obsidian: ${sys.memory.obsidianConnected ? 'CONNECTED' : 'NOT CONNECTED'}`,
      ])}
      ${statusCard('Skills', `${sys.skills.active} / ${sys.skills.available}`, 'badge--accent', [
        `${sys.skills.active} active, ${sys.skills.available} available`,
      ])}
      ${statusCard('Browser Automation', sys.browser.status.replace('_', ' '), 'badge--warn', [
        esc(sys.browser.note),
      ])}
      ${statusCard('Git', sys.git.available ? (sys.git.dirty ? 'UNCOMMITTED CHANGES' : 'CLEAN') : 'UNAVAILABLE', sys.git.available ? (sys.git.dirty ? 'badge--warn' : 'badge--ok') : 'badge--neutral', [
        sys.git.available ? `Branch <span class="mono">${esc(sys.git.branch)}</span> @ <span class="mono">${esc(sys.git.commit)}</span>` : 'Not a git repository',
      ])}
      ${statusCard('Profile', sys.profileLoaded ? 'LOADED' : 'MISSING', sys.profileLoaded ? 'badge--ok' : 'badge--danger', [
        sys.profileLoaded ? 'config/profile.json found and readable.' : 'config/profile.json missing — copy from profile.example.json.',
      ])}
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="row-between">
        <div class="card-title" style="margin-bottom:0;">Brain connectivity</div>
        <button id="test-brain" class="btn btn--sm" ${sys.brain.provider === 'claude' && sys.brain.configured ? '' : 'disabled'}>TEST BRAIN</button>
      </div>
      <div id="brain-test-result" style="margin-top:10px;">
        ${sys.brain.provider !== 'claude'
          ? `<div class="dim">Active provider is "${esc(sys.brain.provider)}", not claude.</div>`
          : (sys.brain.configured ? '<div class="dim">Not tested this session yet.</div>' : `<div class="dim">${esc(sys.brain.note)}</div>`)}
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="row-between">
        <div class="card-title" style="margin-bottom:0;">Tests</div>
        <button id="run-tests" class="btn btn--sm">RUN TEST SUITE</button>
      </div>
      <div id="test-result" style="margin-top:10px;">${testResultHtml(sys.tests)}</div>
    </div>
  `;

  body.querySelector('#run-tests').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'RUNNING…';
    const resultEl = body.querySelector('#test-result');
    resultEl.innerHTML = '<div class="dim mono" style="font-size:12px;">node --test tests/*.test.mjs …</div>';
    try {
      const { lastRun } = await api.runTests();
      resultEl.innerHTML = testResultHtml(lastRun);
    } catch (err) {
      resultEl.innerHTML = `<div class="dim" style="color:var(--danger);">${esc(err.message)}</div>`;
    }
    btn.disabled = false;
    btn.textContent = 'RUN TEST SUITE';
  });

  const testBrainBtn = body.querySelector('#test-brain');
  if (testBrainBtn && !testBrainBtn.disabled) {
    testBrainBtn.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'TESTING…';
      const resultEl = body.querySelector('#brain-test-result');
      resultEl.innerHTML = '<div class="dim mono" style="font-size:12px;">Sending a minimal test request…</div>';
      try {
        const { result } = await api.command('brain test');
        const r = result.result;
        if (r.status === 'ok') {
          resultEl.innerHTML = `<div class="row" style="gap:12px;"><span class="badge badge--ok">OK</span><span class="mono" style="font-size:12px;">${esc(r.text)}</span></div>`;
        } else if (r.status === 'not_configured') {
          resultEl.innerHTML = `<div class="dim">${esc(r.message)}</div>`;
        } else {
          resultEl.innerHTML = `<div class="row" style="gap:12px;"><span class="badge badge--danger">FAILED</span><span class="mono" style="font-size:12px;">${esc(r.error?.type || '')}: ${esc(r.error?.message || '')}</span></div>`;
        }
      } catch (err) {
        resultEl.innerHTML = `<div class="dim" style="color:var(--danger);">${esc(err.message)}</div>`;
      }
      btn.disabled = false;
      btn.textContent = 'TEST BRAIN';
      load(body);
    });
  }
}

function brainLabel(brain) {
  if (brain.live) return 'CONNECTED';
  if (brain.provider !== 'claude') return 'NOT CONNECTED';
  if (!brain.configured) return 'NOT CONNECTED';
  if (brain.available === false) return 'ERROR';
  return 'NOT CONNECTED';
}

function brainBadgeClass(brain) {
  const label = brainLabel(brain);
  if (label === 'CONNECTED') return 'badge--ok';
  if (label === 'ERROR') return 'badge--danger';
  return 'badge--warn';
}

function testResultHtml(t) {
  if (!t) return '<div class="dim">Not run this session yet.</div>';
  const ok = t.exitCode === 0;
  return `
    <div class="row" style="gap:12px;">
      <span class="badge ${ok ? 'badge--ok' : 'badge--danger'}">${ok ? 'PASS' : 'FAIL'}</span>
      <span class="mono" style="font-size:12px;">${t.pass ?? '?'} passed, ${t.fail ?? '?'} failed</span>
      <span class="faint" style="font-size:11px;">${esc(t.finishedAt)}</span>
    </div>
  `;
}

function statusCard(title, value, badgeClass, lines) {
  return `
    <div class="card">
      <div class="row-between">
        <div class="card-title" style="margin-bottom:0;">${esc(title)}</div>
        <span class="badge ${badgeClass}">${esc(value)}</span>
      </div>
      <div class="dim" style="font-size:12px; margin-top:10px; line-height:1.7;">
        ${lines.map((l) => `<div>${l}</div>`).join('')}
      </div>
    </div>
  `;
}
