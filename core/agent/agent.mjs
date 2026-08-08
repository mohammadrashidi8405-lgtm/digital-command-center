import { loadConfig, loadProfile, hasRealProfile } from '../config/config.mjs';
import { SkillRegistry, SkillDisabledError } from '../skills/skill-registry.mjs';
import { FileMemory } from '../memory/file-memory.mjs';
import { createBrain } from '../brain/index.mjs';
import { logger } from '../logging/logger.mjs';

/**
 * Agent Core. Wires Config + Skills + Memory + Brain together and exposes a
 * small natural-language-ish command surface (§35). This is the only module
 * that knows about all four subsystems — everything else depends on at most
 * one of them.
 */
export class Agent {
  constructor() {
    this.config = loadConfig();
    this.skills = new SkillRegistry();
    this.memory = new FileMemory({ obsidianVaultPath: this.config.memory?.obsidianVaultPath || null });
    this.brain = createBrain(this.config);
  }

  requireProfile() {
    if (!hasRealProfile()) {
      throw new Error(
        'No config/profile.json found. Copy config/profile.example.json to config/profile.json ' +
        'and fill in real values before running the Job Acquisition skill.'
      );
    }
    return loadProfile();
  }

  listActiveSkills() {
    return this.skills.listActive().map((s) => s.id);
  }

  listAvailableSkills() {
    return this.skills.listAvailable();
  }

  enableSkill(id) {
    return this.skills.enable(id);
  }

  disableSkill(id) {
    return this.skills.disable(id);
  }

  /**
   * Runs a skill's primary export function by name, but only if that skill
   * is enabled — disabled Skills are rejected here, not deferred to the
   * caller (§9: "The system must reject or defer tasks requiring disabled
   * Skills.").
   */
  async runSkillTask(skillId, taskName, extraArgs = {}) {
    if (!this.skills.isEnabled(skillId)) {
      throw new SkillDisabledError(`Skill "${skillId}" is disabled — cannot run "${taskName}". Enable it first.`);
    }
    const mod = await this.skills.load(skillId);
    const fn = mod[taskName];
    if (typeof fn !== 'function') {
      throw new Error(`Skill "${skillId}" has no task "${taskName}".`);
    }
    logger.info('skill_task_started', { skillId, taskName });
    const result = await fn({ memory: this.memory, brain: this.brain, config: this.config, ...extraArgs });
    logger.info('skill_task_complete', { skillId, taskName });
    return result;
  }
}
