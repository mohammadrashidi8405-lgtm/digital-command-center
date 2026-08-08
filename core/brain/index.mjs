import { FileDropBrain } from './file-drop-brain.mjs';

const PROVIDERS = {
  'file-drop': () => new FileDropBrain(),
};

/**
 * Brain factory. Reads config.brain.provider and returns the matching
 * implementation. Adding a new provider (e.g. a real Anthropic API adapter
 * once ANTHROPIC_API_KEY is available) means adding one entry here — no
 * changes to Agent Core, Memory, Skills, or Workflows.
 */
export function createBrain(config) {
  const providerKey = config?.brain?.provider || 'file-drop';
  const factory = PROVIDERS[providerKey];
  if (!factory) {
    throw new Error(`Unknown brain provider "${providerKey}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return factory();
}

export { BrainInterface } from './brain-interface.mjs';
export { FileDropBrain } from './file-drop-brain.mjs';
