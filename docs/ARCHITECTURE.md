# Architecture

```
Digital-Command-Center/
├── core/
│   ├── agent/       Agent — wires Config + Skills + Memory + Brain together; command-router.mjs (shared CLI/UI command parsing)
│   ├── brain/        Brain interface + providers (file-drop today)
│   ├── memory/        Memory interface + file-backed implementation
│   ├── skills/         Skill registry (discovery, enable/disable, gating)
│   ├── tools/           Tool registry (web-fetch; browser-automation stub)
│   ├── workflows/        Generic named-stage runner
│   ├── state/              JSON state store primitive
│   ├── logging/              Append-only JSONL logger with secret redaction
│   └── config/                  Config + profile loaders
├── skills/
│   ├── job-acquisition/  (implemented, enabled)
│   ├── data-analysis/     (manifest only, disabled)
│   ├── product-development/ (manifest only, disabled)
│   └── research/               (manifest only, disabled)
├── config/            config.json (skill toggles, thresholds), profile.json (gitignored)
├── memory/            state/ (JSON), local-vault/ (gitignored notes), vault-template/ (committed structure)
├── logs/               command-center.jsonl
├── tests/                node:test suite
├── docs/                   this documentation
├── server/api.mjs           Local HTTP+SSE API server for the Command Center UI
├── ui/                         Static, framework-free HTML/CSS/JS frontend served by server/api.mjs
└── scripts/cli.mjs           CLI entrypoint
```

## Why this separation

**The core architectural requirement is: the active Brain can be replaced without rebuilding Memory, Skills, Tools, or Workflows.** Concretely:

- `core/skills/skill-registry.mjs` never imports a Brain or a Memory implementation — it only knows manifests and enable/disable state.
- `skills/job-acquisition/pipeline.mjs` receives `{ memory, brain, profile, config }` as injected dependencies. It calls `brain.generate(prompt, opts)` through the `BrainInterface` contract (`core/brain/brain-interface.mjs`) and never touches a provider SDK directly.
- `core/memory/file-memory.mjs` implements `MemoryInterface` (`readState`, `writeState`, `writeNote`). Any skill that reads/writes memory does so through that contract, not through raw `fs` calls.

Swapping to a live Claude/OpenAI/Gemini/local-model Brain later means writing one new file that implements `BrainInterface` and registering it in `core/brain/index.mjs`'s `PROVIDERS` map — no change anywhere else.

## Brain

`core/brain/brain-interface.mjs` defines the contract: `generate(prompt, opts) -> { status: 'ok'|'pending'|'error', text?, requestId? }`.

The only provider implemented today is `FileDropBrain` (`core/brain/file-drop-brain.mjs`), because this machine has no `ANTHROPIC_API_KEY` and the local `claude` CLI binary is broken (see [LIMITATIONS.md](LIMITATIONS.md)). It writes prompts to `core/brain/inbox/<id>.md` and checks `core/brain/outbox/<id>.md` for an answer — honest, non-blocking, never fabricates a response. When a live API becomes available, add e.g. `core/brain/anthropic-brain.mjs` implementing the same interface and switch `config.brain.provider`.

## Memory

Three kinds, kept separate on purpose — see [memory/README.md](../memory/README.md) for the full breakdown and how to connect a real Obsidian vault. Short version: JSON state is short-term and machine-owned; Markdown notes are long-term and human-readable (Obsidian-compatible); JSONL logs are append-only history.

## Command Center UI (`server/`, `ui/`)

The UI is a thin presentation layer, not a parallel implementation. `server/api.mjs` is a zero-dependency `node:http` server that constructs the same `Agent` the CLI uses and calls the same `agent.runSkillTask(...)` / `SkillRegistry` / `FileMemory` methods — there is no separate "UI version" of scoring, filtering, or state. `core/agent/command-router.mjs` holds the one command-parsing implementation both `scripts/cli.mjs` and the UI's in-page command bar (`POST /api/command`) call, so a command means the same thing from either surface. `ui/` is static HTML/CSS/vanilla-JS (no build step, no framework) served by the same process — see [COMMAND_CENTER_UI.md](COMMAND_CENTER_UI.md) for the full endpoint list and page-by-page breakdown.

## Skills

See [SKILLS.md](SKILLS.md).

## Tools

`core/tools/tool-registry.mjs` exposes `webFetchTool` (used by job sources) and a `browserTool` that deliberately throws `ToolUnavailableError` rather than pretending to automate a browser — no automation framework is installed in this environment. See [LIMITATIONS.md](LIMITATIONS.md).

## Workflows

`core/workflows/workflow-runner.mjs` provides a generic `runWorkflow(stages, context)` — logs each named stage, stops on first failure. `job-acquisition/pipeline.mjs` implements its own explicit stage sequence (discover → dedupe → hard-filter → deep-match → score → rank → select → present → track) directly, for clarity and because its stages share more context than the generic runner's simple pass-through allows; future skills with simpler linear pipelines can use `runWorkflow` directly.
