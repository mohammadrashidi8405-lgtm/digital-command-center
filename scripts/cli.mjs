#!/usr/bin/env node
import { Agent } from '../core/agent/agent.mjs';

const HELP = `Digital Command Center — CLI

Usage: dcc <command> [args]

Skill management:
  skills                        List all skills (available + enabled/disabled)
  enable <skill-id>             Enable a skill (e.g. enable job-acquisition)
  disable <skill-id>            Disable a skill

Job Acquisition:
  campaign start [--sources=remoteok,arbeitnow,hn-whoishiring,manual]
                                 Run the full discover→...→track pipeline
  campaign status                Show counts of tracked jobs by state
  campaign selected              List currently SELECTED / APPLICATION_READY jobs
  follow-ups                     List jobs whose follow-up date has arrived

Natural-language aliases (quote them): "start job campaign", "find opportunities",
"show campaign status", "list active skills", "run follow-ups",
"enable data-analysis", "disable job-acquisition"
`;

function parseSources(args) {
  const flag = args.find((a) => a.startsWith('--sources='));
  if (!flag) return undefined;
  return flag.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    console.log(HELP);
    return;
  }

  // Accept a single natural-language string as argv[0] (§35).
  const joined = rawArgs.join(' ').toLowerCase();
  let command = rawArgs[0];
  let args = rawArgs.slice(1);

  const aliasMap = [
    [/^start( a)? job campaign$|^find opportunities$/, () => (command = 'campaign') && (args = ['start'])],
    [/^show campaign status$/, () => (command = 'campaign') && (args = ['status'])],
    [/^list active skills$/, () => (command = 'skills')],
    [/^run follow-?ups$/, () => (command = 'follow-ups')],
    [/^analyze campaign$/, () => (command = 'campaign') && (args = ['status'])],
    [/^enable (.+)$/, (m) => (command = 'enable') && (args = [m[1]])],
    [/^disable (.+)$/, (m) => (command = 'disable') && (args = [m[1]])],
  ];
  for (const [pattern, apply] of aliasMap) {
    const m = joined.match(pattern);
    if (m) {
      apply(m);
      break;
    }
  }

  const agent = new Agent();

  try {
    switch (command) {
      case 'help':
      case '--help':
      case '-h':
        console.log(HELP);
        break;

      case 'skills': {
        const active = new Set(agent.listActiveSkills());
        for (const s of agent.listAvailableSkills()) {
          console.log(`${active.has(s.id) ? '[ON] ' : '[off]'} ${s.id.padEnd(20)} ${s.status.padEnd(12)} ${s.description}`);
        }
        break;
      }

      case 'enable': {
        agent.enableSkill(args[0]);
        console.log(`Enabled: ${args[0]}`);
        break;
      }

      case 'disable': {
        agent.disableSkill(args[0]);
        console.log(`Disabled: ${args[0]}`);
        break;
      }

      case 'campaign': {
        const sub = args[0];
        if (sub === 'start') {
          const profile = agent.requireProfile();
          const sourcesFilter = parseSources(args);
          const result = await agent.runSkillTask('job-acquisition', 'runCampaign', { profile, sourcesFilter });
          console.log(`Screened: ${result.screened}, placeholder-filtered: ${result.placeholderFiltered}, hard-filtered: ${result.hardFiltered}, qualified: ${result.qualified}, selected: ${result.selected} (threshold ${result.threshold})`);
          if (result.shortfall) {
            console.log(`Fewer than the minimum quality bar were found. Reporting shortfall rather than lowering the threshold (per policy).`);
          }
          for (const job of result.jobs) {
            console.log(`  [${job.score}] ${job.title} — ${job.company || 'unknown'} (${job.url || job.source})`);
            console.log(`      note: ${job.notePath}`);
            console.log(`      draft: ${job.draftPath}`);
          }
        } else if (sub === 'status') {
          const status = await agent.runSkillTask('job-acquisition', 'campaignStatus');
          console.log(`Total tracked: ${status.total}`);
          for (const [state, count] of Object.entries(status.byStatus)) {
            console.log(`  ${state}: ${count}`);
          }
        } else if (sub === 'selected') {
          const jobs = await agent.runSkillTask('job-acquisition', 'listSelected');
          for (const j of jobs) console.log(`[${j.score}] ${j.title} — ${j.company} (${j.status})`);
        } else {
          console.log('Usage: campaign <start|status|selected>');
        }
        break;
      }

      case 'follow-ups': {
        const due = await agent.runSkillTask('job-acquisition', 'dueFollowUps');
        if (due.length === 0) console.log('No follow-ups due.');
        for (const j of due) console.log(`${j.title} — ${j.company} (due ${j.followUpDate})`);
        break;
      }

      default:
        console.log(`Unknown command: "${command}"\n`);
        console.log(HELP);
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
