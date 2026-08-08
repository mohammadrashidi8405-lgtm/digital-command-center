import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { CONFIG_PATH, loadConfig } from '../config/config.mjs';
import { logger } from '../logging/logger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS_DIR = join(ROOT, 'skills');

export class SkillNotFoundError extends Error {}
export class SkillDisabledError extends Error {}

/**
 * Discovers skills from skills/&lt;id&gt;/manifest.json, tracks which are enabled
 * (persisted in config/config.json), and gates access to disabled skills.
 * Adding a new skill = adding a new directory with a manifest — no changes
 * here or in the Brain/Memory layers.
 */
export class SkillRegistry {
  constructor({ skillsDir = SKILLS_DIR, configPath = CONFIG_PATH } = {}) {
    this.skillsDir = skillsDir;
    this.configPath = configPath;
    this.manifests = this._discover();
  }

  _discover() {
    if (!existsSync(this.skillsDir)) return new Map();
    const manifests = new Map();
    for (const entry of readdirSync(this.skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = join(this.skillsDir, entry.name, 'manifest.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifests.set(manifest.id, { ...manifest, dir: join(this.skillsDir, entry.name) });
    }
    return manifests;
  }

  listAvailable() {
    return [...this.manifests.values()];
  }

  listActive() {
    const config = loadConfig(this.configPath);
    return this.listAvailable().filter((m) => config.skills?.[m.id] === true);
  }

  isEnabled(skillId) {
    const config = loadConfig(this.configPath);
    return config.skills?.[skillId] === true;
  }

  status(skillId) {
    const manifest = this.manifests.get(skillId);
    if (!manifest) throw new SkillNotFoundError(`No such skill: "${skillId}"`);
    return { ...manifest, enabled: this.isEnabled(skillId) };
  }

  setEnabled(skillId, enabled) {
    if (!this.manifests.has(skillId)) {
      throw new SkillNotFoundError(`No such skill: "${skillId}". Available: ${[...this.manifests.keys()].join(', ')}`);
    }
    const manifest = this.manifests.get(skillId);
    if (enabled && manifest.status !== 'implemented') {
      throw new SkillDisabledError(`Skill "${skillId}" is not yet implemented (status: ${manifest.status}). Cannot enable.`);
    }
    const config = loadConfig(this.configPath);
    const prev = config.skills?.[skillId];
    config.skills[skillId] = enabled;
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
    logger.decision('skill_toggled', { skillId, from: prev, to: enabled });
    return config.skills;
  }

  enable(skillId) {
    return this.setEnabled(skillId, true);
  }

  disable(skillId) {
    return this.setEnabled(skillId, false);
  }

  /**
   * Loads a skill's entry module. Rejects (does not silently no-op) if the
   * skill is disabled — callers must not be able to accidentally run a
   * disabled Skill's workflow.
   */
  async load(skillId) {
    const manifest = this.manifests.get(skillId);
    if (!manifest) throw new SkillNotFoundError(`No such skill: "${skillId}"`);
    if (!this.isEnabled(skillId)) {
      throw new SkillDisabledError(`Skill "${skillId}" is disabled. Enable it first: enable ${skillId}`);
    }
    if (!manifest.entry) {
      throw new SkillDisabledError(`Skill "${skillId}" has no implementation yet (status: ${manifest.status}).`);
    }
    const entryPath = join(manifest.dir, manifest.entry);
    const mod = await import(pathToFileURL(entryPath).href);
    return mod;
  }
}
