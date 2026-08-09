import { api } from './api.js';
import { esc } from './util.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderCampaign } from './pages/campaign.js';
import { renderSkills } from './pages/skills.js';
import { renderOpportunities, renderOpportunityDetail } from './pages/opportunities.js';
import { renderMemory } from './pages/memory.js';
import { renderActivity } from './pages/activity.js';
import { renderSystem } from './pages/system.js';

const view = document.getElementById('view');
const main = document.getElementById('main');

const ROUTES = {
  dashboard: (params) => renderDashboard(view, params),
  campaign: (params) => renderCampaign(view, params),
  skills: (params) => renderSkills(view, params),
  opportunities: (params) => {
    if (params[0]) return renderOpportunityDetail(view, params[0]);
    return renderOpportunities(view);
  },
  memory: (params) => renderMemory(view, params),
  activity: (params) => renderActivity(view, params),
  system: (params) => renderSystem(view, params),
};

async function route() {
  const hash = location.hash.replace(/^#\//, '') || 'dashboard';
  const [name, ...params] = hash.split('/');
  const handler = ROUTES[name] || ROUTES.dashboard;

  for (const link of document.querySelectorAll('.sidenav a')) {
    link.classList.toggle('active', link.dataset.route === name);
  }

  view.classList.remove('view-enter');
  // Force reflow so the animation restarts on every navigation.
  void view.offsetWidth;
  view.classList.add('view-enter');

  main.focus({ preventScroll: true });
  await handler(params);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

// ---- Footer status strip: polls real endpoints, no synthetic values ----
async function refreshStatusbar() {
  try {
    const sys = await api.system();
    document.getElementById('sb-brain').innerHTML = `Brain: <strong>${esc(sys.brain.provider)}</strong>`;
    document.getElementById('sb-memory').innerHTML = `Memory: <strong>${sys.memory.obsidianConnected ? 'vault' : 'local'}</strong>`;
    document.getElementById('sb-skills').innerHTML = `Skills: <strong>${sys.skills.active}/${sys.skills.available}</strong>`;
    document.getElementById('sb-health').innerHTML = sys.git.available
      ? `Health: <strong>${sys.git.dirty ? 'uncommitted changes' : 'clean'}</strong>`
      : 'Health: <strong>n/a</strong>';

    const dot = document.querySelector('#topbar-status .status-dot');
    dot.className = 'status-dot status-dot--ok';
  } catch {
    const dot = document.querySelector('#topbar-status .status-dot');
    dot.className = 'status-dot status-dot--danger';
    document.getElementById('topbar-status').lastElementChild.textContent = 'CONNECTION LOST';
  }

  try {
    const campaign = await api.campaignStatus();
    document.getElementById('sb-campaign').innerHTML = `Campaign: <strong>${campaign.total} tracked${campaign.campaignRunning ? ', running…' : ''}</strong>`;
    const dot = document.querySelector('#topbar-status .status-dot');
    dot.classList.toggle('status-dot--pulse', campaign.campaignRunning);
    document.getElementById('topbar-status').lastElementChild.textContent = campaign.campaignRunning ? 'CAMPAIGN RUNNING' : 'SYSTEM ONLINE';
  } catch {
    document.getElementById('sb-campaign').textContent = 'Campaign: —';
  }
}

refreshStatusbar();
setInterval(refreshStatusbar, 10000);

// ---- Command interface ----
const commandForm = document.getElementById('command-form');
const commandInput = document.getElementById('command-input');
const commandOutput = document.getElementById('command-output');

commandForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = commandInput.value.trim();
  if (!input) return;
  commandOutput.textContent = 'Running…';
  try {
    const { result } = await api.command(input);
    commandOutput.textContent = summarizeCommandResult(result);
    if (result.type === 'skill-toggled' || result.type === 'campaign-result') {
      route(); // reflect the real state change immediately
    }
  } catch (err) {
    commandOutput.textContent = `Error: ${err.message}`;
  }
  commandInput.value = '';
});

function summarizeCommandResult(result) {
  switch (result.type) {
    case 'skills':
      return result.skills.map((s) => `${s.enabled ? '[ON] ' : '[off]'} ${s.id}`).join('\n');
    case 'skill-toggled':
      return `${result.enabled ? 'Enabled' : 'Disabled'}: ${result.skillId}`;
    case 'campaign-status':
      return `Total tracked: ${result.status.total}\n` + Object.entries(result.status.byStatus).map(([k, v]) => `  ${k}: ${v}`).join('\n');
    case 'campaign-result':
      return `Screened ${result.result.screened}, qualified ${result.result.qualified}, selected ${result.result.selected}`;
    case 'campaign-selected':
      return result.jobs.length ? result.jobs.map((j) => `[${j.score}] ${j.title}`).join('\n') : 'No selected opportunities.';
    case 'follow-ups':
      return result.due.length ? result.due.map((j) => `${j.title} (due ${j.followUpDate})`).join('\n') : 'No follow-ups due.';
    case 'memory':
      return `Notes root: ${result.notesRoot}`;
    case 'system':
      return `Brain provider: ${result.brainProvider}. No live LLM API is connected — this command interface routes to real operations, not a chat model.`;
    default:
      return JSON.stringify(result);
  }
}
