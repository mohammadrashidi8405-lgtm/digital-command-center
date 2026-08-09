# Job Acquisition Skill

## Pipeline

```
DISCOVER → DEDUPLICATE → PLACEHOLDER FILTER → HARD FILTER → DEEP MATCH → SCORE → RANK → SELECT → PRESENT → TRACK
```

Implemented in `skills/job-acquisition/pipeline.mjs`, `runCampaign()`.

1. **DISCOVER** — pulls from every enabled source (see below).
2. **DEDUPLICATE** — normalizes URLs (strips tracking params/trailing slash) and hashes to a stable key (`dedupe.mjs`); drops duplicates within the same run, and skips keys already tracked from a previous run (§21 token optimization — unchanged listings are never reprocessed).
3. **PLACEHOLDER FILTER** (`placeholder-filter.mjs`) — cheap stage-1 pre-filter for non-job "placeholder" listings before any regex-based filtering runs. Anchored exact-match on the first line of the title against a known set (`"Open Vacancies"`, `"Check Back Soon"`, `"Oops something happened"`, `"Candidature Spontanée"`, etc. — all observed in a real RemoteOK pull). Anchored, not substring, so a real listing like "Multiple AI Operations Intern openings" is never caught by a bare `/multiple/i`. Rejected with the distinct reason `PLACEHOLDER_LISTING`, counted separately from hard-filter rejections in the funnel report.
4. **HARD FILTER** (`filters.mjs`) — rejects on objectively determinable blockers only: experience-level mismatch, no role relevance, onsite-only, unmet language requirement, common scam/fraud text patterns, missing verifiable URL. Genuinely ambiguous signals (e.g. unclear work authorization) are *not* hard-rejected — they go to scoring instead, because a hard reject requires certainty we don't fabricate. Role relevance is decided by `role-matching.mjs` (see below) — the same module the scorer uses.
5. **DEEP MATCH** — only for jobs already scoring ≥60 on the cheap deterministic pass (§21 "deep analysis only for high-potential candidates"), and bounded by `config.jobAcquisition.maxDeepMatchCallsPerRun` (default 20) so one campaign run can't make an unbounded number of live Brain calls. Calls `brain.generate()` with a structured-output schema requesting `{ relevance, reasoning, strengths[], concerns[], missing_information[], recommendation: SELECT|REJECT|REVIEW }`. With the file-drop Brain (no `ANTHROPIC_API_KEY` configured) this always comes back `pending`; with a connected `ClaudeBrain` it's a real structured evaluation. Either way it is stored as advisory metadata only, attached to the job's note — it never changes `scoreResult.total` or the threshold comparison in SELECT below, keeping selection auditable, reproducible, and deterministic regardless of whether a live Brain is connected.
6. **SCORE** (`scorer.mjs`) — §19 weighted formula: Role Match 25, Skill Match 20, Eligibility 20, Team/Learning Value 15, Remote Compatibility 10, Compensation 5, Application Friction 5 (sums to 100), plus documented bonus/penalty markers, clamped to [0,100].

   **Calibration note:** the four +5 bonus markers (AI/startup alignment, portfolio relevance, team environment, founder accessibility) originally fired on a single generic keyword match each, which could add up to +20 on top of the base score from ordinary phrasing ("startup", "collaborate", "founder") without the listing being unusually strong. Caught during verification (a hand-built fixture hit a clamped 100 despite only an 11/20 skill-match sub-score) and tightened: each bonus now requires 2+ distinct marker hits in the same category, not 1, before it applies.
7. **RANK** — descending by score.
8. **SELECT** — only `score >= threshold` (default **85**, `config.jobAcquisition.scoreThreshold`) *and* `confidenceTier === CONFIRMED_JOB`. If fewer than `minResultsBeforeReportingShortfall` (default 3) qualify, the run reports a shortfall rather than silently lowering the bar (§20).
9. **PRESENT** — writes an Obsidian-compatible note per selected job (`memory/local-vault/Jobs/` or your real vault) and a draft application (`skills/job-acquisition/outbox/<key>-application.md`, `status: PENDING_HUMAN_APPROVAL`).
10. **TRACK** — persists every screened job (not just selected ones) to `memory/state/job-acquisition-tracking.json`, keyed by dedup hash, with its `JobState`.

## Role relevance — single source of truth (`role-matching.mjs`)

Before Phase 2, `filters.mjs` and `scorer.mjs` each had independent role-relevance logic and disagreed: the filter's broad keyword list was correct (it passed real AI-adjacent listings, rejected noise); the scorer's narrow "first two words of the target-role string" check was not — it produced a confirmed false negative (a German AI internship titled with "KI / AI" was hard-rejected) and a confirmed-anomalous false positive (an unrelated "Workplace & Culture Intern" scored a full 25/25 roleMatch, apparently from one incidental phrase match).

Both modules now import `matchRoleRelevance()` from `role-matching.mjs`. It has two tiers:
- **Multi-word phrases** (`ai operations`, `product operations`, `founder's associate`, `ai enablement`, `ai strategy`, `ai support`, `ai solutions`, …) — precise by construction, since a generic word like "operations" only counts paired with a domain word.
- **Standalone AI-concept terms** — `ai`, `artificial intelligence`, `ki`, `künstliche intelligenz` — specific enough on their own to count without pairing (German "KI" essentially never means anything else in a job listing).

The hard filter uses `isMatch` (any hit → passes the role-relevance gate — a coarse net). The scorer uses `hitCount`, tiered (0 hits → 30% of the roleMatch weight, 1 hit → 70%, 2+ hits → 100%) — so a single incidental phrase can no longer buy full marks the way the old logic did.

## Manual import — schema, validation, same pipeline (§ Fix 4)

`skills/job-acquisition/sources/manual-import.mjs` reads every `*.json` file in `skills/job-acquisition/manual-import/` (array of entries, or a single entry) and validates each one with `validateManualEntry()` before it's allowed into the pipeline. Invalid entries are skipped with a field-level error logged (`manual_import_validation_failed`) — not silently dropped.

**Schema** (see `manual-import/example.json.template` for a filled-in example):

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | |
| `company` | string | yes | |
| `url` | string | no | |
| `description` | string | no | plain text; filters/scoring read this |
| `remote` | boolean | no | |
| `location` | string | no | |
| `postedAt` | string | no | |
| `tags` | string[] | no | |
| `compensation` | string | no | |
| `confidenceTier` | string | no | one of `CONFIRMED_JOB`, `POTENTIAL_UPCOMING_OPPORTUNITY`, `UNVERIFIED_SIGNAL` (default `CONFIRMED_JOB`) |
| `importOrigin` | string | no | one of `linkedin`, `company-career-page`, `startup-job-board`, `founder-post`, `recruiter-post`, `other` — **informational only**, never affects filtering or scoring |

Validated entries are merged into the same `discovered` array as every automated source and flow through the identical dedupe → placeholder-filter → hard-filter → score → rank → select pipeline. There is no separate scoring path for manual imports — this was a deliberate constraint (§ Fix 4: "Never create a second scoring system").

## Sources

| Source | What | Auth | Confidence |
|---|---|---|---|
| `remoteok` | RemoteOK public JSON API | none | CONFIRMED_JOB (subject to the placeholder pre-filter — ~98% of one real pull was non-job placeholder pages) |
| `arbeitnow` | Arbeitnow public job-board API | none | CONFIRMED_JOB |
| `hn-whoishiring` | HN "Who is hiring?" thread via Algolia API | none | **UNVERIFIED_SIGNAL always** — free-text comments, company/title extraction is best-effort |
| `manual` | JSON files dropped in `skills/job-acquisition/manual-import/` | n/a | whatever you set in the file (defaults `CONFIRMED_JOB`) |

All three live sources have been run and manually verified against real traffic (not just unit-tested with fixtures): `remoteok` returned 50 real listings, `arbeitnow` returned 50, `hn-whoishiring` returned 60 real forum comments — all parsed without a single `source_fetch_failed`. In that verification run zero listings scored ≥85 (most general-remote-jobs boards skew senior/general, which is exactly what the hard filter is for), which is expected, not a bug — see the calibration note below.

**Phase 2 re-verification (post role-matching fix):** 160 discovered → 0 dropped as duplicates → 13 rejected as `PLACEHOLDER_LISTING` → 137 hard-filtered → 0 qualified → 0 selected, highest score 76 (`Cogram`, roleMatch 25/25, no bonuses). This is the honest result — the threshold was not lowered and filters were not loosened to manufacture a nonzero count. One data point worth recording: a first version of the Fix 1/2 role-matching change let a "Java Developer" listing at an AI-branded company ("Clera", which posted ~35 unrelated roles) clear the filter and score 87 purely from company-boilerplate text repeating "AI-native startup" — caught during live verification (not by a unit test) and fixed by scoping the bare AI/KI token match to the listing *title* only, leaving multi-word phrases matched against title+description. See `role-matching.mjs`'s header comment and the regression test in `tests/role-matching.test.mjs`.

**LinkedIn and most company career pages are not scraped** — LinkedIn requires auth and its ToS prohibits scraping; company pages vary too much for a generic scraper without browser automation (not installed — see [LIMITATIONS.md](LIMITATIONS.md)). The `manual` source is the honest workaround: paste a listing you found (on LinkedIn, a careers page, wherever) into a JSON file there, following `manual-import/example.json.template`.

## Confidence tiers (§14)

- `CONFIRMED_JOB` — a real, sourced listing. Only these can be `SELECTED`.
- `POTENTIAL_UPCOMING_OPPORTUNITY` — not currently produced by any source in v1; reserved for future hidden-job-market signal work.
- `UNVERIFIED_SIGNAL` — e.g. every HN "who's hiring" comment. Tracked, never auto-selected.

## Job state (§22)

Single source of truth: `skills/job-acquisition/job-state.mjs`. `DISCOVERED → SCREENED → QUALIFIED → SELECTED → APPLICATION_READY → APPLIED → CONTACTED → FOLLOW_UP → INTERVIEW → OFFER`, with `REJECTED / SKIPPED / EXPIRED / WITHDRAWN` as terminal off-ramps. `APPLIED` and later states are never set automatically — only a human applying and updating the tracker moves a job past `APPLICATION_READY`.

## Application preparation (§24) — prepare-only, never send

`outbox.mjs` writes a Markdown draft per selected job with `status: PENDING_HUMAN_APPROVAL` and an explicit checklist of fields that require human confirmation (work authorization, salary expectations, nationality/visa, any legal declaration). **There is no send/submit code path anywhere in this repository.** That's intentional, not a missing feature.

## Recruiter/founder outreach (§25)

Not implemented in v1. Identifying a specific founder/hiring-manager and drafting outreach requires either a live Brain or browser automation, neither of which is honestly available on this machine right now (see [LIMITATIONS.md](LIMITATIONS.md)). The scoring formula still rewards listings that already show founder accessibility signals in their text (+5 bonus), so those surface to the top regardless.

## Commands

```bash
node scripts/cli.mjs campaign start [--sources=remoteok,arbeitnow,hn-whoishiring,manual]
node scripts/cli.mjs campaign status
node scripts/cli.mjs campaign selected
node scripts/cli.mjs follow-ups
```
