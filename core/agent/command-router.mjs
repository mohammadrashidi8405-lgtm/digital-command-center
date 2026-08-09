/**
 * Shared command parsing + execution for both the CLI (scripts/cli.mjs) and
 * the Command Center UI's command interface (server/api.mjs). One place for
 * "what do these words mean" so the two surfaces can never drift apart —
 * whatever "start campaign" does from the terminal, it does identically
 * from the browser command bar.
 */
import { brainStatus, testBrain } from '../brain/status.mjs';

const ALIAS_PATTERNS = [
  [/^start( a)? job campaign$|^find opportunities$|^start campaign$/, () => ({ command: 'campaign', args: ['start'] })],
  [/^show campaign status$|^campaign status$/, () => ({ command: 'campaign', args: ['status'] })],
  [/^show opportunities$|^campaign selected$/, () => ({ command: 'campaign', args: ['selected'] })],
  [/^list active skills$|^skills$/, () => ({ command: 'skills', args: [] })],
  [/^run follow-?ups$|^follow-?ups$/, () => ({ command: 'follow-ups', args: [] })],
  [/^analyze campaign$/, () => ({ command: 'campaign', args: ['status'] })],
  [/^show memory$/, () => ({ command: 'memory', args: [] })],
  [/^system status$|^system$/, () => ({ command: 'system', args: [] })],
  [/^enable (.+)$/, (m) => ({ command: 'enable', args: [m[1]] })],
  [/^disable (.+)$/, (m) => ({ command: 'disable', args: [m[1]] })],
];

/**
 * Parses free-text input (a natural-language phrase, or `command arg1 arg2`)
 * into { command, args }. Never throws — unrecognized input just falls
 * through as a literal command name, which executeCommand() will reject
 * with a clear "unknown command" error.
 */
export function parseCommand(input) {
  const raw = (input || '').trim();
  const lower = raw.toLowerCase();
  for (const [pattern, build] of ALIAS_PATTERNS) {
    const m = lower.match(pattern);
    if (m) return build(m);
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  return { command: parts[0] || '', args: parts.slice(1) };
}

export function parseSourcesFlag(args) {
  const flag = args.find((a) => a.startsWith('--sources='));
  if (!flag) return undefined;
  return flag.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Executes a parsed command against an Agent instance. Returns a plain,
 * JSON-serializable result object — no console.log side effects — so the
 * CLI can print it however it likes and the API can respond with it as-is.
 * Throws on error; callers decide how to surface that (exit code vs. HTTP
 * status).
 */
export async function executeCommand(agent, command, args = []) {
  switch (command) {
    case 'skills': {
      const active = new Set(agent.listActiveSkills());
      const skills = agent.listAvailableSkills().map((s) => ({ ...s, enabled: active.has(s.id) }));
      return { type: 'skills', skills };
    }

    case 'enable': {
      if (!args[0]) throw new Error('enable requires a skill id');
      agent.enableSkill(args[0]);
      return { type: 'skill-toggled', skillId: args[0], enabled: true };
    }

    case 'disable': {
      if (!args[0]) throw new Error('disable requires a skill id');
      agent.disableSkill(args[0]);
      return { type: 'skill-toggled', skillId: args[0], enabled: false };
    }

    case 'campaign': {
      const sub = args[0];
      if (sub === 'start') {
        const profile = agent.requireProfile();
        const sourcesFilter = parseSourcesFlag(args);
        const result = await agent.runSkillTask('job-acquisition', 'runCampaign', { profile, sourcesFilter });
        return { type: 'campaign-result', result };
      }
      if (sub === 'status') {
        const status = await agent.runSkillTask('job-acquisition', 'campaignStatus');
        return { type: 'campaign-status', status };
      }
      if (sub === 'selected') {
        const jobs = await agent.runSkillTask('job-acquisition', 'listSelected');
        return { type: 'campaign-selected', jobs };
      }
      throw new Error('Usage: campaign <start|status|selected>');
    }

    case 'follow-ups': {
      const due = await agent.runSkillTask('job-acquisition', 'dueFollowUps');
      return { type: 'follow-ups', due };
    }

    case 'memory': {
      return { type: 'memory', notesRoot: agent.memory.notesRoot };
    }

    case 'system': {
      return { type: 'system', brainProvider: agent.brain.providerName, brain: brainStatus(agent.brain) };
    }

    case 'brain': {
      const sub = args[0];
      if (sub === 'status') return { type: 'brain-status', status: brainStatus(agent.brain) };
      if (sub === 'test') return { type: 'brain-test', result: await testBrain(agent.brain) };
      throw new Error('Usage: brain <status|test>');
    }

    default:
      throw new Error(`Unknown command: "${command}"`);
  }
}
