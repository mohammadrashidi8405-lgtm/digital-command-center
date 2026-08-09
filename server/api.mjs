#!/usr/bin/env node
import { loadEnv } from '../core/config/env.mjs';
loadEnv();

import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { Agent } from '../core/agent/agent.mjs';
import { parseCommand, executeCommand } from '../core/agent/command-router.mjs';
import { SkillDisabledError, SkillNotFoundError } from '../core/skills/skill-registry.mjs';
import { brainStatus } from '../core/brain/status.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI_DIR = join(ROOT, 'ui');
const PORT = Number(process.env.PORT) || 3939;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Guards against two overlapping "start campaign" requests writing to the
// same tracking JSON concurrently. A queue would be overkill for a
// single-user local console — the second request just gets a clear 409.
let campaignRunning = false;

// Cached in-process only (not persisted) — real result of the last time
// `npm test` was actually executed via this server, not a hardcoded status.
let lastTestRun = null;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function errorStatus(err) {
  if (err instanceof SkillDisabledError) return 409;
  if (err instanceof SkillNotFoundError) return 404;
  if (err.message?.includes('profile.json')) return 412;
  return 400;
}

function gitInfo() {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim();
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT }).toString().trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim().length > 0;
    return { available: true, commit, branch, dirty };
  } catch {
    return { available: false };
  }
}

function tailLog(limit = 100) {
  const logPath = join(ROOT, 'logs', 'command-center.jsonl');
  if (!existsSync(logPath)) return [];
  const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  }).reverse();
}

function systemSnapshot(agent) {
  const skills = agent.listAvailableSkills();
  const active = new Set(agent.listActiveSkills());
  return {
    brain: brainStatus(agent.brain),
    memory: {
      status: 'ok',
      notesRoot: agent.memory.notesRoot,
      obsidianConnected: !agent.memory.notesRoot.endsWith('local-vault'),
    },
    skills: { active: active.size, available: skills.length },
    browser: { status: 'NOT_AVAILABLE', note: 'No browser automation framework installed (see docs/LIMITATIONS.md).' },
    git: gitInfo(),
    tests: lastTestRun,
    profileLoaded: (() => { try { agent.requireProfile(); return true; } catch { return false; } })(),
  };
}

async function handleApi(req, res, pathname, query) {
  const agent = new Agent();

  // GET /api/system
  if (pathname === '/api/system' && req.method === 'GET') {
    return sendJson(res, 200, systemSnapshot(agent));
  }

  // GET /api/status — dashboard aggregate
  if (pathname === '/api/status' && req.method === 'GET') {
    const system = systemSnapshot(agent);
    let campaignStatus = { total: 0, byStatus: {} };
    let scores = [];
    let selected = [];
    if (agent.skills.isEnabled('job-acquisition')) {
      campaignStatus = await agent.runSkillTask('job-acquisition', 'campaignStatus');
      scores = await agent.runSkillTask('job-acquisition', 'scoreDistribution');
      selected = await agent.runSkillTask('job-acquisition', 'listSelected');
    }
    const recentActivity = tailLog(15);
    return sendJson(res, 200, { system, campaignStatus, scores, selected, recentActivity, campaignRunning });
  }

  // GET /api/skills
  if (pathname === '/api/skills' && req.method === 'GET') {
    const active = new Set(agent.listActiveSkills());
    const skills = agent.listAvailableSkills().map((s) => ({ ...s, enabled: active.has(s.id) }));
    return sendJson(res, 200, { skills });
  }

  // POST /api/skills/:id/enable | disable
  const skillToggleMatch = pathname.match(/^\/api\/skills\/([^/]+)\/(enable|disable)$/);
  if (skillToggleMatch && req.method === 'POST') {
    const [, id, action] = skillToggleMatch;
    try {
      if (action === 'enable') agent.enableSkill(id); else agent.disableSkill(id);
      return sendJson(res, 200, { skillId: id, enabled: action === 'enable' });
    } catch (err) {
      return sendJson(res, errorStatus(err), { error: err.message });
    }
  }

  // GET /api/campaign/status
  if (pathname === '/api/campaign/status' && req.method === 'GET') {
    try {
      const status = await agent.runSkillTask('job-acquisition', 'campaignStatus');
      return sendJson(res, 200, { ...status, campaignRunning });
    } catch (err) {
      return sendJson(res, errorStatus(err), { error: err.message });
    }
  }

  // GET /api/campaign/opportunities
  if (pathname === '/api/campaign/opportunities' && req.method === 'GET') {
    try {
      const jobs = await agent.runSkillTask('job-acquisition', 'listSelected');
      return sendJson(res, 200, { jobs });
    } catch (err) {
      return sendJson(res, errorStatus(err), { error: err.message });
    }
  }

  // GET /api/campaign/opportunities/:key
  const oppDetailMatch = pathname.match(/^\/api\/campaign\/opportunities\/([^/]+)$/);
  if (oppDetailMatch && req.method === 'GET') {
    try {
      const job = await agent.runSkillTask('job-acquisition', 'getOpportunity', { key: oppDetailMatch[1] });
      if (!job) return sendJson(res, 404, { error: 'No opportunity with that key' });
      return sendJson(res, 200, { job });
    } catch (err) {
      return sendJson(res, errorStatus(err), { error: err.message });
    }
  }

  // GET /api/campaign/stream — SSE, runs the real pipeline
  if (pathname === '/api/campaign/stream' && req.method === 'GET') {
    if (campaignRunning) {
      return sendJson(res, 409, { error: 'A campaign is already running.' });
    }
    if (!agent.skills.isEnabled('job-acquisition')) {
      return sendJson(res, 409, { error: 'job-acquisition skill is disabled.' });
    }
    let profile;
    try {
      profile = agent.requireProfile();
    } catch (err) {
      return sendJson(res, 412, { error: err.message });
    }

    const sourcesFilter = query.get('sources') ? query.get('sources').split(',').filter(Boolean) : undefined;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    campaignRunning = true;
    try {
      const result = await agent.runSkillTask('job-acquisition', 'runCampaign', {
        profile,
        sourcesFilter,
        onStage: (stage) => send('stage', { stage }),
      });
      send('complete', { result });
    } catch (err) {
      send('campaign-error', { error: err.message });
    } finally {
      campaignRunning = false;
      res.end();
    }
    return;
  }

  // GET /api/memory
  if (pathname === '/api/memory' && req.method === 'GET') {
    const memInfo = {
      obsidianConnected: !agent.memory.notesRoot.endsWith('local-vault'),
      notesRoot: agent.memory.notesRoot,
      categories: {},
    };
    for (const category of ['Projects', 'Skills', 'People', 'Companies', 'Jobs', 'Research', 'Work', 'Logs']) {
      const dir = join(agent.memory.notesRoot, category);
      memInfo.categories[category] = countMarkdownFiles(dir);
    }
    return sendJson(res, 200, memInfo);
  }

  // GET /api/logs?limit=N
  if (pathname === '/api/logs' && req.method === 'GET') {
    const limit = Math.min(Number(query.get('limit')) || 100, 500);
    return sendJson(res, 200, { entries: tailLog(limit) });
  }

  // GET /api/tests — cached last result
  if (pathname === '/api/tests' && req.method === 'GET') {
    return sendJson(res, 200, { lastRun: lastTestRun });
  }

  // POST /api/tests/run — actually runs the real test suite
  if (pathname === '/api/tests/run' && req.method === 'POST') {
    const startedAt = new Date().toISOString();
    const child = spawn('node', ['--test', 'tests/*.test.mjs'], { cwd: ROOT, shell: true });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('close', (code) => {
      const passMatch = output.match(/ℹ pass (\d+)/) || output.match(/# pass (\d+)/);
      const failMatch = output.match(/ℹ fail (\d+)/) || output.match(/# fail (\d+)/);
      lastTestRun = {
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode: code,
        pass: passMatch ? Number(passMatch[1]) : null,
        fail: failMatch ? Number(failMatch[1]) : null,
      };
      sendJson(res, 200, { lastRun: lastTestRun });
    });
    return;
  }

  // POST /api/command  { input: "start campaign" }
  if (pathname === '/api/command' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const { command, args } = parseCommand(body.input || '');
      const result = await executeCommand(agent, command, args);
      return sendJson(res, 200, { result });
    } catch (err) {
      return sendJson(res, errorStatus(err), { error: err.message });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

function countMarkdownFiles(dir) {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = join(UI_DIR, filePath);
  if (!fullPath.startsWith(UI_DIR) || !existsSync(fullPath) || statSync(fullPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const ext = extname(fullPath);
  const contentType = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(readFileSync(fullPath));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, url.searchParams);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

// Only auto-listen on the default port when this file is run directly
// (`node server/api.mjs`), not when imported by the test suite — tests
// import `server` and call `.listen(0)` themselves for an ephemeral port.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  // Explicit 127.0.0.1, not 0.0.0.0 (Node's default) — this API can toggle
  // skills and trigger campaigns, so it must not be reachable from the LAN.
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Digital Command Center running at http://localhost:${PORT}`);
  });
}

export { server };
