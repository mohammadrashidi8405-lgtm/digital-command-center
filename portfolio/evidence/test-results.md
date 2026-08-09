# Test Results

**Status: VERIFIED**
Command: `npm test` (`node --test tests/*.test.mjs`)
Run at: 2026-08-09T08:41:05Z, on this repository at commit `db9b236`.

## Summary

```
ℹ tests 125
ℹ suites 29
ℹ pass 125
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5302.995291
```

125 tests, 29 suites, 125 passing, 0 failing, 0 skipped. No test in this suite calls the real Anthropic API — the Claude Brain tests inject a mock `fetch` implementation (`tests/claude-brain.test.mjs`); everything else runs against real local code paths (real config files, real filesystem state, a real ephemeral HTTP server) with no test doubles standing in for the system under test.

## Suites

```
FileDropBrain
ClaudeBrain: identity + config
ClaudeBrain: missing key -> honest fallback, never fabricates
ClaudeBrain: successful request
ClaudeBrain: malformed / refused / truncated responses
ClaudeBrain: error classification + bounded retries
ClaudeBrain: secret redaction
core/brain/status.mjs: brainStatus() and testBrain()
command-router: brain status / brain test
config loader
dedupe
hardFilter
logger secret redaction
validateManualEntry (Fix 4 schema validation)
discover() end-to-end validation behavior
FileMemory
job-acquisition pipeline: threshold + shortfall (§20)
isPlaceholderListing (Fix 3)
matchRoleRelevance (Fix 1 + Fix 2 shared source of truth)
Fix 1: role-relevance is now consistent between filter and scorer
scoreJob
static UI serving
API: skills (real config read/write)
API: campaign, opportunities, memory, logs (real data, no fakes)
API: command interface routes to real operations
API: campaign stream (SSE) actually runs the pipeline
security: no secrets in API responses
SkillRegistry
StateStore
```

## What's specifically covered

- **Deterministic engine**: dedup, hard filters (experience level, role relevance, onsite-only, language, fraud text), placeholder-listing detection, scoring (weights sum to 100, clamped to [0,100], bonus/penalty markers), threshold + shortfall behavior, reprocessing-skip (token optimization).
- **Claude Brain (mocked)**: init/config, missing-key fallback (never calls `fetch`), successful parsing, malformed/refused/`max_tokens`-truncated responses, 401/429/500/network-error classification, bounded retries (never unbounded), secret redaction (API key never appears in a returned error or in status output), `output_config` never carries `temperature`/`top_p`/`top_k`/`thinking`.
- **API server**: real config read/write through HTTP, real campaign runs (including SSE stage events and a 409 on a concurrent second run), a dedicated assertion that `/api/system` and `/api/status` never contain key/token/secret-shaped strings.
- **Command router**: shared CLI/UI command parsing, including the new `brain status`/`brain test` commands.

## Known non-flakiness note

`tests/pipeline.test.mjs` and `tests/manual-import.test.mjs` share a real directory (`skills/job-acquisition/manual-import/`) and `node:test` runs test *files* concurrently. Both suites assert on job identity/tracking-state lookups rather than raw counts specifically to stay correct under that concurrency — documented in-file, re-confirmed passing across this and prior runs.
