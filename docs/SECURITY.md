# Security

## Secrets

There are no API keys or credentials committed in this codebase. The Claude Brain provider (`core/brain/claude-brain.mjs`) reads its credential exclusively from `process.env.ANTHROPIC_API_KEY` at runtime, loaded from a local, gitignored `.env` (`core/config/env.mjs`, wired into both entrypoints — `scripts/cli.mjs` and `server/api.mjs`) — the key never appears in `config/config.json`, in source, or in a commit. `.env.example` (committed) documents the variable name with an empty value only.

`.gitignore` blocks `.env*` (with an explicit `!.env.example` exception), `*.pem`, `*.key`, and anything with `credentials`/`token`/`secret` in the name, as a backstop. `core/logging/logger.mjs` redacts any logged field whose key matches `/token|secret|password|api[_-]?key|authorization|cookie/i` before writing — this is defense-in-depth, not the primary control (the primary control is: never generate that data in the first place).

The key is sent only as the `x-api-key` request header on calls to `https://api.anthropic.com/v1/messages` — never in a request body, never logged. `ClaudeBrain` also redacts the literal key value (and any `sk-ant-...`-shaped string) out of any error message before it's returned or logged, in case an upstream error body ever echoed it back. `/api/system`, `/api/status`, and the CLI's `brain status`/`brain test` only ever expose provider name, model, booleans, and timestamps — never the key, a header, or anything derived from them (`tests/server.test.mjs` and `tests/claude-brain.test.mjs` both assert this).

## Personal / candidate data

`config/profile.json` holds the real candidate profile (education, languages, project history) and is **gitignored** — never committed, even though the GitHub repository is public. `config/profile.example.json` (committed) holds only placeholders. The only identity string that appears anywhere in the committed tree is "Sir Edward" — no real legal name is written into source, config, or docs.

`memory/local-vault/` and `skills/job-acquisition/outbox/` (application drafts, which do include real profile facts by design — see JOB_ACQUISITION.md) are both fully gitignored. `memory/vault-template/` (committed) contains empty category folders only, no real notes.

## Untrusted external input

Job listing text (titles, descriptions) from RemoteOK/Arbeitnow/HN/manual-import is treated as untrusted: it is parsed as plain data (JSON fields, regex matching for filtering/scoring), stripped of HTML tags before storage, and never executed, evaluated, or interpolated into a shell command. `core/tools/tool-registry.mjs`'s `webFetchTool` only performs `GET` requests and returns raw text/JSON — it does not render or execute anything from the response.

## Application autonomy

No code path submits an application, sends an outreach message, or posts anywhere. `outbox.mjs` only writes local Markdown drafts marked `PENDING_HUMAN_APPROVAL`. Fields that would require inventing a fact about the candidate (work authorization, salary expectations, nationality, any legal declaration) are explicitly marked `[HUMAN INPUT REQUIRED]` rather than filled in — see §24 of the build brief.

## Browser automation

Not implemented (see [LIMITATIONS.md](LIMITATIONS.md)). No credentials are ever exposed to a webpage, no cookies are stored, because there is no browser automation code running at all in v1.

## Command Center UI / local API server

`server/api.mjs` binds explicitly to `127.0.0.1`, not Node's default `0.0.0.0` — this was a real gap caught before commit (Node's `server.listen(port)` binds all interfaces unless a host is given), and it matters here because the API can toggle skills and trigger a real campaign run. Bound to loopback only, it is not reachable from the LAN. `/api/system` and `/api/status` are covered by a test (`tests/server.test.mjs`) asserting their responses never contain key/token/secret-shaped strings. Static file serving is confined to `ui/` with a path-traversal guard (`fullPath.startsWith(UI_DIR)`), also covered by a test.

## GitHub

Pushed via the `gh` CLI using its existing local authentication (OAuth token stored in the system keyring, scopes `gist, read:org, repo, workflow`) — this codebase never reads, prints, or stores that token itself.
