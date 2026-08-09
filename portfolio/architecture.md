# Architecture

Full source-level detail lives in [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md); this document is the portfolio/interview-facing version — the flow, the boundaries, and why each one exists.

## End-to-end flow

```
 User (CLI or Command Center UI)
        │
        ▼
 Command Router (core/agent/command-router.mjs)
        │  one parser, shared by scripts/cli.mjs and POST /api/command —
        │  a command means the same thing from the terminal and the browser
        ▼
 Agent Core (core/agent/agent.mjs)
        │  wires Config + Skills + Memory + Brain; rejects a command
        │  outright if the target Skill is disabled
        ▼
 Skill: Job Acquisition (skills/job-acquisition/pipeline.mjs)
        │
        ▼
 DISCOVERY  ──  Tools (core/tools/tool-registry.mjs: webFetchTool)
        │       Sources: RemoteOK, Arbeitnow, HN "Who is hiring", manual-import
        ▼
 DEDUPLICATION  ──  normalize URL, hash to a stable key, drop known keys
        │            from prior runs (token-optimization, §21)
        ▼
 PLACEHOLDER FILTER  ──  reject non-job listings before any regex cost
        ▼
 HARD FILTER (deterministic, core/… filters.mjs)
        │  experience-level, role-relevance, onsite-only, language,
        │  fraud/scam text, missing URL — objective blockers ONLY
        ▼
 SCORE (deterministic, scorer.mjs)
        │  weighted formula, sums to 100, clamped [0,100]
        ▼
 AI INTERPRETATION (Claude Brain, advisory only) ─── only if score ≥ 60
        │  structured evaluation: relevance / reasoning / strengths /
        │  concerns / missing_information / recommendation
        │  NEVER changes the score or the threshold decision
        ▼
 RANK + SELECT  ──  score ≥ 85 AND CONFIRMED_JOB only
        │
        ▼
 MEMORY (core/memory/file-memory.mjs)
        │  JSON state (tracking) + Markdown notes (Obsidian-compatible)
        ▼
 HUMAN APPROVAL
        draft application written, marked PENDING_HUMAN_APPROVAL —
        nothing is ever sent automatically
```

## The boundaries, and why each exists

**Command Router → Skill, not Command Router → arbitrary code.** `executeCommand()` only ever calls `agent.runSkillTask(skillId, taskName, ...)`, which checks `SkillRegistry.isEnabled()` first and throws `SkillDisabledError` otherwise. There is no path from a parsed command string to raw shell execution or an unrelated function — see [technical-decisions.md](technical-decisions.md).

**Deterministic Engine → Brain, one direction only.** `pipeline.mjs` computes `scoreResult.total` and compares it to `threshold` *before* the Brain is ever consulted. The Brain's structured evaluation (`deepMatchEvaluation`) is attached to the job's note as advisory context — it is never read back into `scoreResult.total` or the `if (scoreResult.total >= threshold …)` gate. This is enforced by code structure, not by convention: the deep-match block runs, then a separate, unconditioned comparison decides selection.

**Brain → Memory, never Brain = Memory.** The Brain has no persistence of its own — `ClaudeBrain` and `FileDropBrain` are both stateless with respect to campaign data. Everything durable (tracking state, notes) is written by `pipeline.mjs` through `MemoryInterface`, not by the Brain.

**Skill → Tools, not Skill → arbitrary network/filesystem access.** Job sources call `webFetchTool.run(url)`, a thin `fetch` wrapper — GET-only, no eval, no script execution, no credential attachment. `browserTool` is a documented `ToolUnavailableError` stub (see [technical-decisions.md](technical-decisions.md) on why browser automation is PLANNED, not implemented).

**Everything → Human Approval, for anything externally consequential.** `outbox.mjs` writes a local Markdown draft tagged `status: PENDING_HUMAN_APPROVAL`. No code path in this repository submits a form, sends a message, or makes a legal/authorization claim. Fields the system cannot know (work authorization, salary expectations) are written as `[HUMAN INPUT REQUIRED]` rather than inferred.

## Provider abstraction (why Brain can be swapped without touching anything else)

```
core/brain/brain-interface.mjs        BrainInterface (contract: generate(prompt, opts))
        ▲                    ▲
        │                    │
core/brain/file-drop-brain.mjs   core/brain/claude-brain.mjs
   (no live model,                 (real Anthropic API call,
    honest 'pending')               ANTHROPIC_API_KEY-gated)
        │                    │
        └────────┬───────────┘
                  ▼
     core/brain/index.mjs → createBrain(config)
                  ▲
                  │  config.brain.provider ("file-drop" | "claude")
                  │  config.brain.enabled (kill switch, ignores provider)
         config/config.json
```

`Agent`, every Skill, and the UI only ever call `agent.brain.generate(prompt, opts)` — none of them import `ClaudeBrain` or know the Anthropic API shape exists. Adding a third provider (OpenAI, Gemini, a local model) is one new file + one `PROVIDERS` map entry; see [technical-decisions.md](technical-decisions.md).
