# Command Center UI

A local dashboard for the engine documented in [JOB_ACQUISITION.md](JOB_ACQUISITION.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Same config, same tracking state, same pipeline — the UI reads and writes through the identical `Agent` the CLI uses, nothing is duplicated or faked.

## Running it

```bash
node server/api.mjs
# or: PORT=4000 node server/api.mjs
```

Opens on `http://localhost:3939` by default. No build step — `ui/` is static HTML/CSS/JS, no bundler, no framework, no npm install required.

## Architecture

- **`server/api.mjs`** — zero-dependency `node:http` server. Serves `ui/` as static files and exposes a JSON API under `/api/*`. Each request constructs a fresh `core/agent/agent.mjs` `Agent` — the same object the CLI uses — so every endpoint is a real operation, not a mock.
- **`core/agent/command-router.mjs`** — the one place that parses a command string ("start campaign", "enable data-analysis", …) and executes it. `scripts/cli.mjs` and `POST /api/command` both call this; a command cannot mean something different from the terminal than it does from the browser.
- **`ui/`** — `index.html` (app shell: topbar, side nav, workspace, status strip), `css/main.css` (design tokens + components), `js/app.js` (hash router + status polling + command bar), `js/api.js` (fetch wrapper), `js/pages/*.js` (one render function per screen).

## API endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/api/status` | Dashboard aggregate: system snapshot, campaign status, score distribution, selected jobs, recent activity |
| GET | `/api/system` | Brain/Memory/Skills/Browser/Git/Tests/Profile status |
| GET | `/api/skills` | All skills with enabled state |
| POST | `/api/skills/:id/enable` \| `/disable` | Real toggle — writes `config/config.json`. 409 if the skill is manifest-only ("planned"), 404 if unknown |
| GET | `/api/campaign/status` | Tracked-job counts by state |
| GET | `/api/campaign/opportunities` | Selected/application-ready jobs only (score ≥ 85) |
| GET | `/api/campaign/opportunities/:key` | One job's full tracking record (any state, not just selected) |
| GET | `/api/campaign/stream?sources=…` | **Server-Sent Events.** Runs the real pipeline; emits `stage` events at each of the six pipeline stages, then one `complete` event with the full result, or `campaign-error` on failure. 409 if a campaign is already running (single in-flight guard — see below) |
| GET | `/api/memory` | Obsidian connection status + note counts per category |
| GET | `/api/logs?limit=N` | Tail of `logs/command-center.jsonl` |
| GET | `/api/tests` | Cached result of the last test run this server session |
| POST | `/api/tests/run` | Actually executes `node --test tests/*.test.mjs` and returns pass/fail counts |
| POST | `/api/command` | `{ "input": "..." }` → routed through `command-router.mjs` |

## Campaign progress streaming

`runCampaign()` in `skills/job-acquisition/pipeline.mjs` accepts an optional `onStage(stage)` callback, called at six real boundaries: `DISCOVERING`, `DEDUPLICATING`, `FILTERING`, `SCORING`, `RANKING`, `SELECTING`. The server wires this to `res.write()` as Server-Sent Events. Filtering and scoring happen in one pass per job (filter, then — only if it survives — score immediately), so those two stage events can fire close together on a fast run; this is a deliberate, honest choice over restructuring the loop into two passes just to make the progress bar smoother.

Only one campaign can run at a time: a module-level flag in `server/api.mjs` returns `409` to a second concurrent `/api/campaign/stream` request rather than silently queuing it or letting two runs interleave writes to the same tracking JSON file.

## Pages

- **Dashboard** — aggregate stat tiles, campaign status, a score-distribution histogram (single-hue sequential + a status-colored "passing" bucket, per the dataviz skill's form/color guidance), selected opportunities, recent activity. Empty states everywhere real data is absent.
- **Campaign** — source checkboxes, START CAMPAIGN (live SSE progress through the six stages), funnel breakdown, job-state counts.
- **Skills** — real ON/OFF toggles per skill; manifest-only skills show a disabled toggle with an explanation instead of silently failing.
- **Opportunities** — only score ≥ 85, `CONFIRMED_JOB` listings (identical gate to the CLI/pipeline). Empty state explicitly states the threshold and the last run's discovered→selected counts rather than showing fake rows.
- **Opportunity detail** — full score breakdown, bonuses/penalties, and an explanation generated from that same data (never invented) — click through from any opportunity row.
- **Memory** — Obsidian connection status (clearly labeled `NOT CONNECTED` when true, with an explanation that the local Markdown layer is active instead) and per-category note counts.
- **Activity** — real tail of `logs/command-center.jsonl`.
- **System** — Brain provider/model and honest CONNECTED/NOT CONNECTED/ERROR status (never faked — see ARCHITECTURE.md's Brain section), with a "TEST BRAIN" button that runs the same minimal live check as `brain test`; Memory status; Skills counts; Browser automation status (`NOT_AVAILABLE`, per LIMITATIONS.md); Git branch/commit/dirty state; and a button that actually runs the test suite on demand.
- **Command bar** (left nav, all pages) — same aliases as the CLI ("start campaign", "show opportunities", "enable data-analysis", "brain status", "brain test", …). No chat model behind it; if you type something it doesn't recognize, it says so rather than improvising a response.

## Design direction

Dark-first, restrained: a near-black surface, one accent hue, status colors (ok/warn/danger) reserved for state rather than decoration, monospace for data/numbers, no gradients or glow. Page transitions and data updates (score bars, funnel bars, skill toggles) animate over 120–600ms and respect `prefers-reduced-motion`. Desktop-first information density (multi-column grids, dense tables); the layout collapses to a single column with a horizontal nav under 720px rather than hiding information.

## Accessibility

Semantic landmarks (`header`, `nav`, `main`, `footer`), a skip-to-content link, visible `:focus-visible` outlines throughout, `role="switch"`/`aria-checked` on skill toggles, keyboard-operable opportunity rows (Enter/Space), `aria-live` regions for the status strip and command output, and every color-coded status is paired with a text label — never color alone.

## What this UI is not

It is not a second implementation of the engine. Every control that appears to do something does that real thing through the API above — there is no client-side mock data, no fabricated Brain response, and no button that looks wired but isn't (see `docs/LIMITATIONS.md` for what the *engine* itself can't do yet, e.g. no live Brain, no browser automation — the UI doesn't paper over those, it reports them honestly on the System page).
