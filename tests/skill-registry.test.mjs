import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SkillRegistry, SkillNotFoundError, SkillDisabledError } from '../core/skills/skill-registry.mjs';

let dir, skillsDir, configPath;

function makeSkill(id, { status = 'implemented', entry = './index.mjs' } = {}) {
  const skillDir = join(skillsDir, id);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({ id, name: id, description: `${id} skill`, version: '1.0.0', entry, status }));
  if (entry) {
    writeFileSync(join(skillDir, 'index.mjs'), `export function ping() { return 'pong-${id}'; }\n`);
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dcc-skills-'));
  skillsDir = join(dir, 'skills');
  configPath = join(dir, 'config.json');
  mkdirSync(skillsDir, { recursive: true });
  makeSkill('alpha', { status: 'implemented' });
  makeSkill('beta', { status: 'planned', entry: null });
  writeFileSync(configPath, JSON.stringify({ skills: { alpha: true, beta: false } }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SkillRegistry', () => {
  test('discovers skills from manifests', () => {
    const registry = new SkillRegistry({ skillsDir, configPath });
    const ids = registry.listAvailable().map((s) => s.id).sort();
    assert.deepEqual(ids, ['alpha', 'beta']);
  });

  test('listActive reflects config.json', () => {
    const registry = new SkillRegistry({ skillsDir, configPath });
    assert.deepEqual(registry.listActive().map((s) => s.id), ['alpha']);
  });

  test('disable then enable persists to config.json', () => {
    const registry = new SkillRegistry({ skillsDir, configPath });
    registry.disable('alpha');
    assert.equal(registry.isEnabled('alpha'), false);
    registry.enable('alpha');
    assert.equal(registry.isEnabled('alpha'), true);
  });

  test('cannot enable a skill that is not implemented', () => {
    const registry = new SkillRegistry({ skillsDir, configPath });
    assert.throws(() => registry.enable('beta'), SkillDisabledError);
  });

  test('enabling/disabling an unknown skill throws SkillNotFoundError', () => {
    const registry = new SkillRegistry({ skillsDir, configPath });
    assert.throws(() => registry.enable('ghost'), SkillNotFoundError);
  });

  test('load() rejects a disabled skill instead of running it', async () => {
    const registry = new SkillRegistry({ skillsDir, configPath });
    registry.disable('alpha');
    await assert.rejects(() => registry.load('alpha'), SkillDisabledError);
  });

  test('load() succeeds for an enabled, implemented skill', async () => {
    const registry = new SkillRegistry({ skillsDir, configPath });
    const mod = await registry.load('alpha');
    assert.equal(mod.ping(), 'pong-alpha');
  });
});
