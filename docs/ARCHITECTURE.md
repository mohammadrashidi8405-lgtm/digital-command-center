# Architecture

```
Digital-Command-Center/
├── core/
│   ├── agent/       Agent — wires Config + Skills + Memory + Brain together; command-router.mjs (shared CLI/UI command parsing)
│   ├── brain/        Brain interface + providers (file-drop, claude) + status.mjs
│   ├── memory/        Memory interface + file-backed implementation
│   ├── skills/         Skill registry (discovery, enable/disable, gating)
│   ├── tools/           Tool registry (web-fetch; browser-automation stub)
│   ├── workflows/        Generic named-stage runner
│   ├── state/              JSON state store primitive
│   ├── logging/              Append-only JSONL logger with secret redaction
│   └── config/                  Config + profile loaders, .env loading (env.mjs)
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

`core/brain/brain-interface.mjs` defines the contract: `generate(prompt, opts) -> { status: 'ok'|'pending'|'error', text?, requestId?, error? }`.

Two providers are implemented, both behind the same interface — `core/agent/agent.mjs` and every skill only ever call `brain.generate(...)`, never a provider directly:

- **`FileDropBrain`** (`core/brain/file-drop-brain.mjs`) — writes prompts to `core/brain/inbox/<id>.md` and checks `core/brain/outbox/<id>.md` for a manually-supplied answer. Non-blocking, never fabricates a response. Used whenever no live provider is configured or reachable.
- **`ClaudeBrain`** (`core/brain/claude-brain.mjs`) — calls the real Anthropic Messages API (`POST https://api.anthropic.com/v1/messages`) over `fetch` (no SDK dependency — see "Why raw `fetch`" below). Reads its credential exclusively from `process.env.ANTHROPIC_API_KEY`; if unset, `generate()` transparently delegates to an internal `FileDropBrain` instance rather than throwing or faking a response, so the rest of the system sees the same honest `'pending'` status either way. Bounded retries (max 3 attempts, exponential backoff, honors `Retry-After`) on network errors and 429/5xx only — 4xx never retries. See [LIMITATIONS.md](LIMITATIONS.md) for current connection status and [SETUP.md](SETUP.md) for how to configure it.

`core/brain/index.mjs`'s `createBrain(config)` factory picks the provider from `config.brain.provider` (`config/config.json`); `config.brain.enabled: false` is a kill switch that forces `FileDropBrain` regardless of `provider`, without editing the provider field itself. `core/brain/status.mjs` exposes provider-agnostic `brainStatus(brain)` / `testBrain(brain)` helpers — the single source of truth the CLI (`brain status`/`brain test`), the command bar, and `/api/system` all read from, so connection status can never drift between surfaces.

Adding a third provider (OpenAI, Gemini, a local model) means one new file implementing `BrainInterface`, one new `PROVIDERS` entry, and — if it needs live status reporting — a case in `core/brain/status.mjs`. No change anywhere else in Memory, Skills, Tools, Workflows, or the UI.

### Why raw `fetch`, not `@anthropic-ai/sdk`

This project has been zero-npm-dependency by design (`npm install` has nothing to install — see [SETUP.md](SETUP.md)). Node's built-in `fetch`/`AbortController` are sufficient for a single JSON endpoint with no streaming, batching, or tool-use needs, so `ClaudeBrain` stays within that constraint rather than adding the official SDK as this project's first dependency. This is a deliberate trade-off, not an oversight: the SDK gives typed exceptions and helpers that raw `fetch` doesn't, and would be the right call if the Brain's needs grow (streaming, tool use, prompt caching). `ClaudeBrain`'s `fetchImpl` constructor option keeps this swappable later without touching callers.

### Deep match: structured, advisory-only evaluation

`skills/job-acquisition/pipeline.mjs`'s deep-match stage sends `brain.generate()` a `schema` option (Anthropic structured outputs, `output_config.format: {type: 'json_schema', ...}`) requesting `{ relevance, reasoning, strengths[], concerns[], missing_information[], recommendation: SELECT|REJECT|REVIEW }`. This is **advisory only** — it is attached to the job's note for a human to read, and a `maxDeepMatchCallsPerRun` config cap bounds how many live calls one campaign run can make, but it never feeds back into `scoreResult.total` or the `scoreThreshold` comparison that actually selects a job. Selection stays 100% deterministic (§11).

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
