# Digital Command Center

A modular, extensible, locally-runnable personal AI command center for Sir Edward.

The system separates **Brain** (reasoning provider), **Memory** (state + knowledge), **Skills** (activatable capabilities), **Tools** (concrete actions), and **Workflows** (multi-stage pipelines), so the active Brain — or any other layer — can be replaced without rebuilding the rest. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The only active skill today is **Job Acquisition**: it discovers, filters, scores, and tracks high-value internship/junior-role opportunities, and prepares (never sends) draft applications. See [docs/JOB_ACQUISITION.md](docs/JOB_ACQUISITION.md).

Three more skills exist as disabled placeholders, ready to be built out later without touching Core: `data-analysis`, `product-development`, `research`.

## Quick start

```bash
cd ~/Documents/Digital-Command-Center
cp config/profile.example.json config/profile.json   # fill in real values — this file is gitignored
node scripts/cli.mjs skills                            # see what's on/off
node scripts/cli.mjs campaign start                     # run the job-acquisition pipeline
node scripts/cli.mjs campaign status
```

Full setup instructions: [docs/SETUP.md](docs/SETUP.md).

## Command Center UI

A local dashboard/API server sits on top of the same engine — same config, same tracking state, same pipeline, nothing duplicated.

```bash
node server/api.mjs
# open http://localhost:3939
```

Dashboard, Campaign (with live SSE progress), Skills (real toggles), Opportunities (+ detail view), Memory, Activity, and System pages, plus an in-page command bar. See [docs/COMMAND_CENTER_UI.md](docs/COMMAND_CENTER_UI.md).

## Everyday commands

```bash
node scripts/cli.mjs skills                    # list all skills + status
node scripts/cli.mjs enable <skill-id>          # enable a skill
node scripts/cli.mjs disable <skill-id>         # disable a skill
node scripts/cli.mjs campaign start             # run discover→...→track
node scripts/cli.mjs campaign status            # counts by job state
node scripts/cli.mjs campaign selected          # currently selected jobs
node scripts/cli.mjs follow-ups                 # jobs due for follow-up
```

Natural-language aliases also work, quoted: `node scripts/cli.mjs "find opportunities"`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Brain/Memory/Skills/Tools/Workflows and why they're separated
- [Setup](docs/SETUP.md) — installation, profile, Obsidian, GitHub
- [Skills](docs/SKILLS.md) — the skill system and how to add a new one
- [Job Acquisition](docs/JOB_ACQUISITION.md) — pipeline, scoring, sources, state model
- [Command Center UI](docs/COMMAND_CENTER_UI.md) — server/API, pages, SSE campaign streaming
- [Security](docs/SECURITY.md) — secrets, PII, untrusted-input handling
- [Limitations](docs/LIMITATIONS.md) — what is honestly not implemented, and why

## Testing

```bash
npm test
```

98 tests over config, skill activation, dedup, scoring, hard filters, placeholder filtering, role-matching, manual-import validation, memory, logging/redaction, the brain fallback, the full pipeline (threshold + shortfall behavior, reprocessing skip), and the API server (real config read/write, real campaign runs, SSE, no-secrets check).
