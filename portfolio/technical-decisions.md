# Technical Decisions

Each decision below states what was chosen, what the alternative was, and why — written to be defensible in a technical interview, not just descriptive.

## 1. Modular Brain/Memory/Skills/Tools/Workflows separation

**Decision:** `core/agent/agent.mjs` depends only on interfaces (`BrainInterface`, `MemoryInterface`) and a `SkillRegistry`, never on a concrete provider.
**Alternative rejected:** wire Claude directly into the Job Acquisition pipeline — faster to build, but couples the whole system's correctness to one vendor's API shape and availability.
**Why this way:** the Job Acquisition pipeline was fully functional and passing 98+ tests *before* any live Brain existed (`FileDropBrain` only). Adding `ClaudeBrain` later required zero changes to Memory, Skills, or the UI — one new file (`core/brain/claude-brain.mjs`) and one registry entry. That's the concrete evidence the abstraction paid for itself, not just a design aspiration.

## 2. Provider abstraction over the Brain specifically

**Decision:** `core/brain/index.mjs`'s `createBrain(config)` factory reads `config.brain.provider` and dispatches to a `PROVIDERS` map.
**Why:** the Brain is the one component most likely to change (model upgrades, vendor changes, cost tuning) and least likely to need architectural coupling to the rest of the system. A `config.brain.enabled: false` kill switch was added on top — a operational lever independent of `provider`, useful for rate/cost control without editing which provider is configured.

## 3. Deterministic engine + AI hybrid, not "let the LLM decide"

**Decision:** hard filters, deduplication, scoring arithmetic, the 85-point threshold, and the human-approval boundary are all pure deterministic code. The Brain only produces an advisory structured evaluation attached to a job's note.
**Alternative rejected:** ask Claude to score and select jobs directly — fewer lines of code, and semantically richer per-job judgment.
**Why not:** a threshold that an LLM call can silently drift (different day, different sampling, provider outage) is not an auditable safety boundary. Job selection here gates a real, if small, real-world action (a draft application a human might actually send) — reproducibility and explainability mattered more than semantic nuance. The formula's weights are visible, testable (`scoreJob` has a dedicated test asserting weights sum to 100), and identical whether or not a Brain is even connected — verified directly in this build: the same threshold/filter code produced identical `0 selected` results whether `ClaudeBrain` was configured or not, because AI interpretation was never in the decision path to begin with.

## 4. Token efficiency as a first-class constraint

**Decision:** deep-match prompts send only the truncated job description (1500 chars), the candidate's relevant profile subset (education/skills/targetRoles), and the deterministic score — never the full repository, full memory, or unrelated jobs. `output_config.effort: "low"` is set on every request. A `maxDeepMatchCallsPerRun` config cap (default 20) bounds how many live calls one campaign can make, and retries are capped at 3 attempts with exponential backoff.
**Why:** this system is meant to run repeatedly, unattended, against a live metered API. An unbounded prompt or an unbounded retry loop is a real cost/reliability risk, not a hypothetical one — the retry bound is unit-tested (`tests/claude-brain.test.mjs`, "bounded to a fixed number of attempts, not an infinite loop") rather than just documented.

## 5. Memory separated into three kinds, none of them "Brain memory"

**Decision:** short-term execution state (JSON, `memory/state/`), long-term human-readable notes (Markdown, Obsidian-compatible), and append-only logs (JSONL) — three different files, three different lifetimes, all written by `pipeline.mjs` through `MemoryInterface`, never by the Brain itself.
**Why not a vector DB / conversation-history store:** this system's memory needs are structured and queryable (which jobs were already seen, what state is a job in), not semantic search over free text. JSON keyed by a stable hash answers "have I seen this job" in O(1) with zero infrastructure; a vector store would have been solving a problem this system doesn't have.

## 6. Human-in-the-loop as a hard code boundary, not a policy note

**Decision:** `outbox.mjs` only ever writes a local Markdown file tagged `PENDING_HUMAN_APPROVAL`. There is no function anywhere in this codebase that performs an HTTP POST to a job board, sends an email, or fills a web form.
**Why:** this is the one boundary where "we decided not to" is not sufficient — a system that discovers real opportunities and drafts real application content is one integration away from taking a real-world, hard-to-reverse action (submitting on someone's behalf, making an unverifiable claim about their work authorization). The safeguard is the absence of the capability, not a runtime check that could be bypassed or misconfigured.

## 7. Fallback strategy: the honest-`pending` pattern

**Decision:** `FileDropBrain` and the no-key path of `ClaudeBrain` both return `{status: 'pending'}` rather than throwing or fabricating a plausible-sounding response.
**Why:** a caller (`pipeline.mjs`, the UI, `brain test`) that receives `pending` knows unambiguously that no reasoning happened — it never has to guess whether a suspiciously generic response came from a real model call or a stub. This is the single design choice that makes it possible to say, truthfully, that the deterministic engine's test coverage and campaign results are identical whether or not a live Brain is connected.

## 8. Browser automation: architecture defined, implementation deliberately deferred

**Decision:** `core/tools/tool-registry.mjs`'s `browserTool` throws `ToolUnavailableError` with a clear message, rather than a silent no-op or a partial implementation.
**Alternative considered and rejected this session:** install Playwright and implement real career-page fetching.
**Why deferred:** a real implementation is a one-way decision — a genuine new dependency, a multi-hundred-MB browser binary download, and a robots.txt/ToS compliance surface that needs deliberate per-site review, not a default-on capability. Shipping a half-working scraper to make this checklist item look done would be a worse outcome than an honestly-labeled `PLANNED` stub — see [evidence/brain-validation.md](evidence/brain-validation.md) and this project's repeated "never fabricate capability" rule. The `manual-import` source is the supported, already-implemented workaround for any site that would need this (LinkedIn, authenticated company portals) — see `docs/LIMITATIONS.md`.

## 9. Testing strategy: mock the network boundary, not the system under test

**Decision:** `tests/claude-brain.test.mjs` injects a mock `fetch` implementation via a constructor option (`new ClaudeBrain(config, {fetchImpl})`) rather than mocking `ClaudeBrain` itself or stubbing `pipeline.mjs`'s use of the Brain.
**Why:** every other line of `ClaudeBrain` — retry logic, error classification, redaction, status tracking — runs for real in the test; only the actual network call is replaced. This is why 21 Brain tests can assert on real retry counts and real backoff behavior without ever touching the internet or requiring a credential (see [evidence/test-results.md](evidence/test-results.md)). The rest of the suite (`tests/server.test.mjs`, `tests/pipeline.test.mjs`) goes further and doesn't mock at all — it runs a real ephemeral HTTP server and a real pipeline against real (fixture) data, because those components have no external dependency to isolate from.
