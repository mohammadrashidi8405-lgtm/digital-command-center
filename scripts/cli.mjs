#!/usr/bin/env node
import { Agent } from '../core/agent/agent.mjs';
import { parseCommand, executeCommand } from '../core/agent/command-router.mjs';

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

Command Center UI:
  node server/api.mjs           Start the local dashboard + API server
`;

function printResult(result) {
  switch (result.type) {
    case 'skills':
      for (const s of result.skills) {
        console.log(`${s.enabled ? '[ON] ' : '[off]'} ${s.id.padEnd(20)} ${s.status.padEnd(12)} ${s.description}`);
      }
      break;
    case 'skill-toggled':
      console.log(`${result.enabled ? 'Enabled' : 'Disabled'}: ${result.skillId}`);
      break;
    case 'campaign-result': {
      const r = result.result;
      console.log(`Screened: ${r.screened}, placeholder-filtered: ${r.placeholderFiltered}, hard-filtered: ${r.hardFiltered}, qualified: ${r.qualified}, selected: ${r.selected} (threshold ${r.threshold})`);
      if (r.shortfall) {
        console.log('Fewer than the minimum quality bar were found. Reporting shortfall rather than lowering the threshold (per policy).');
      }
      for (const job of r.jobs) {
        console.log(`  [${job.score}] ${job.title} — ${job.company || 'unknown'} (${job.url || job.source})`);
        console.log(`      note: ${job.notePath}`);
        console.log(`      draft: ${job.draftPath}`);
      }
      break;
    }
    case 'campaign-status':
      console.log(`Total tracked: ${result.status.total}`);
      for (const [state, count] of Object.entries(result.status.byStatus)) {
        console.log(`  ${state}: ${count}`);
      }
      break;
    case 'campaign-selected':
      for (const j of result.jobs) console.log(`[${j.score}] ${j.title} — ${j.company} (${j.status})`);
      break;
    case 'follow-ups':
      if (result.due.length === 0) console.log('No follow-ups due.');
      for (const j of result.due) console.log(`${j.title} — ${j.company} (due ${j.followUpDate})`);
      break;
    case 'memory':
      console.log(`Notes root: ${result.notesRoot}`);
      break;
    case 'system':
      console.log(`Brain provider: ${result.brainProvider}`);
      break;
    default:
      console.log(JSON.stringify(result, null, 2));
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) {
    console.log(HELP);
    return;
  }
  if (['help', '--help', '-h'].includes(rawArgs[0])) {
    console.log(HELP);
    return;
  }

  const { command, args } = parseCommand(rawArgs.join(' '));
  const agent = new Agent();

  try {
    const result = await executeCommand(agent, command, args);
    printResult(result);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
