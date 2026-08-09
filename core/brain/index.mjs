import { FileDropBrain } from './file-drop-brain.mjs';
import { ClaudeBrain } from './claude-brain.mjs';

const PROVIDERS = {
  'file-drop': () => new FileDropBrain(),
  'claude': (config) => new ClaudeBrain(config?.brain || {}),
};

/**
 * Brain factory. Reads config.brain.provider and returns the matching
 * implementation. Adding a new provider means adding one entry here — no
 * changes to Agent Core, Memory, Skills, or Workflows.
 *
 * config.brain.enabled === false is an explicit kill switch: always falls
 * back to FileDropBrain regardless of the configured provider, without
 * having to edit `provider` itself (§18 cost control).
 */
export function createBrain(config) {
  const brainConfig = config?.brain || {};
  if (brainConfig.enabled === false) {
    return new FileDropBrain();
  }
  const providerKey = brainConfig.provider || 'file-drop';
  const factory = PROVIDERS[providerKey];
  if (!factory) {
    throw new Error(`Unknown brain provider "${providerKey}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return factory(config);
}

export { BrainInterface } from './brain-interface.mjs';
export { FileDropBrain } from './file-drop-brain.mjs';
export { ClaudeBrain } from './claude-brain.mjs';
