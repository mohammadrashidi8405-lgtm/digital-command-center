import { api } from '../api.js';
import { esc } from '../util.js';

function statusDot(status) {
  return status === 'implemented' ? '🟢' : '⚪️';
}

export async function renderSkills(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Skills</h1>
      <p class="page-subtitle">Enable or disable capabilities. Toggling here writes to config/config.json for real.</p>
    </div>
    <div id="skills-list" class="stack">Loading…</div>
  `;

  await load(container);
}

async function load(container) {
  const list = container.querySelector('#skills-list');
  let data;
  try {
    data = await api.skills();
  } catch (err) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-title">Could not load skills</div><div>${esc(err.message)}</div></div>`;
    return;
  }

  list.innerHTML = data.skills.map((s) => skillCard(s)).join('');

  for (const toggle of list.querySelectorAll('.toggle')) {
    toggle.addEventListener('click', async () => {
      const id = toggle.dataset.skillId;
      const enabling = toggle.getAttribute('aria-checked') !== 'true';
      toggle.disabled = true;
      try {
        if (enabling) await api.enableSkill(id); else await api.disableSkill(id);
        await load(container); // re-render from the real, persisted config
      } catch (err) {
        toggle.disabled = false;
        showToggleError(toggle, err.message);
      }
    });
  }
}

function showToggleError(toggle, message) {
  const card = toggle.closest('.card');
  let note = card.querySelector('.toggle-error');
  if (!note) {
    note = document.createElement('div');
    note.className = 'toggle-error dim';
    note.style.cssText = 'margin-top:8px;color:var(--danger);font-size:12px;';
    card.appendChild(note);
  }
  note.textContent = message;
}

function skillCard(s) {
  const canToggle = s.status === 'implemented';
  return `
    <div class="card">
      <div class="row-between">
        <div class="row">
          <span aria-hidden="true">${statusDot(s.status)}</span>
          <div>
            <div style="font-weight:600;">${esc(s.name)}</div>
            <div class="dim" style="font-size:12px;">${esc(s.description)}</div>
          </div>
        </div>
        <button
          class="toggle"
          data-skill-id="${esc(s.id)}"
          role="switch"
          aria-checked="${s.enabled}"
          aria-label="${s.enabled ? 'Disable' : 'Enable'} ${esc(s.name)}"
          ${canToggle ? '' : 'disabled'}
        ></button>
      </div>
      <div class="row" style="margin-top:12px; gap:16px;">
        <span class="badge ${s.enabled ? 'badge--ok' : 'badge--neutral'}">${s.enabled ? 'ENABLED' : 'DISABLED'}</span>
        <span class="badge badge--neutral">${esc(s.status).toUpperCase()}</span>
        <span class="faint mono" style="font-size:11px;">v${esc(s.version)}</span>
        ${!canToggle ? '<span class="faint" style="font-size:12px;">Manifest-only — cannot be enabled until implemented.</span>' : ''}
      </div>
    </div>
  `;
}
