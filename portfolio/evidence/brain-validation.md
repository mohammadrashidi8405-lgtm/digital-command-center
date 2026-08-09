# Claude Brain Validation

**Status: NOT CONNECTED** (honest, current, reproducible — not a placeholder)

## What is implemented and unit-tested (VERIFIED)

`core/brain/claude-brain.mjs` — a complete `BrainInterface` implementation that calls the real Anthropic Messages API (`POST https://api.anthropic.com/v1/messages`) over `fetch`. Covered by 21 tests in `tests/claude-brain.test.mjs` (mocked `fetch`, see [test-results.md](test-results.md)):

- Credential handling (`ANTHROPIC_API_KEY`-only, never in config/source)
- Successful request parsing
- Malformed response / model refusal (`stop_reason: "refusal"`) / truncated response (`stop_reason: "max_tokens"`) — all surfaced as typed errors, never silently treated as success
- Error classification: 401 (no retry), 429 (bounded retry, honors `Retry-After`), 5xx (bounded retry), network failure (bounded retry), 400 (no retry)
- Retries are capped at 3 attempts with exponential backoff — verified this cannot loop unboundedly
- Secret redaction — the API key never appears in a returned error or in the module's status output, even if an upstream error body echoed it back
- Structured-output request shape (`output_config`) for the job-evaluation schema

This is real, working code, exercised by a real (mocked) test suite. It is **not** a stub or a TODO.

## What is NOT verified

**A live call to the real Anthropic API has never been made in this environment**, because `ANTHROPIC_API_KEY` is not set here. This was checked directly, moments before writing this document:

```
$ node scripts/cli.mjs "brain status"
Brain: claude (claude-opus-5) — NOT CONNECTED
ANTHROPIC_API_KEY is not set — falling back to the file-drop brain. See docs/SETUP.md to configure it.

$ node scripts/cli.mjs "brain test"
Brain test: ANTHROPIC_API_KEY is not set. See docs/SETUP.md.

$ node -e "console.log('ANTHROPIC_API_KEY set:', Boolean(process.env.ANTHROPIC_API_KEY))"
ANTHROPIC_API_KEY set: false
```
(captured 2026-08-09T08:42:34Z, commit `db9b236`)

No fabricated "CONNECTED" status was produced at any point to make this look more finished than it is — the System page and CLI report the same `NOT CONNECTED` state shown above, live, right now.

## What happens with no key (VERIFIED, by design)

`ClaudeBrain.generate()` transparently delegates to `FileDropBrain` when `ANTHROPIC_API_KEY` is unset — it does not throw, does not fabricate a response, and does not silently no-op. The rest of the system (Job Acquisition's deep-match stage, `brain test`) sees the same honest `pending`/`not_configured` status either way. This fallback path is itself real and tested (see "missing key -> honest fallback" in test-results.md) and was exercised live in the campaign run recorded in [campaign-results.md](campaign-results.md), where every `deepMatchStatus` reads `pending`.

## Exact remaining action

```bash
cp .env.example .env
# edit .env: ANTHROPIC_API_KEY=sk-ant-...   (from console.anthropic.com/settings/keys)
node scripts/cli.mjs "brain status"   # should then report CONNECTED
node scripts/cli.mjs "brain test"     # one real, minimal (~16-token) round trip
```

Once this is done, `brain status` becomes `CONNECTED` automatically — no code change required, because status is computed live from `ANTHROPIC_API_KEY` presence and the result of the last real request, not from a hardcoded flag.
