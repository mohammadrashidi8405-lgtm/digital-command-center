# Job Acquisition Skill

## Pipeline

```
DISCOVER → DEDUPLICATE → HARD FILTER → DEEP MATCH → SCORE → RANK → SELECT → PRESENT → TRACK
```

Implemented in `skills/job-acquisition/pipeline.mjs`, `runCampaign()`.

1. **DISCOVER** — pulls from every enabled source (see below).
2. **DEDUPLICATE** — normalizes URLs (strips tracking params/trailing slash) and hashes to a stable key (`dedupe.mjs`); drops duplicates within the same run, and skips keys already tracked from a previous run (§21 token optimization — unchanged listings are never reprocessed).
3. **HARD FILTER** (`filters.mjs`) — rejects on objectively determinable blockers only: experience-level mismatch, no role relevance, onsite-only, unmet language requirement, common scam/fraud text patterns, missing verifiable URL. Genuinely ambiguous signals (e.g. unclear work authorization) are *not* hard-rejected — they go to scoring instead, because a hard reject requires certainty we don't fabricate.
4. **DEEP MATCH** — only for jobs already scoring ≥60 on the cheap deterministic pass (§21 "deep analysis only for high-potential candidates"). Calls `brain.generate()`; with the current file-drop Brain this always comes back `pending` and is stored as advisory metadata only — it never changes the numeric score, keeping scoring auditable and reproducible without a live LLM.
5. **SCORE** (`scorer.mjs`) — §19 weighted formula: Role Match 25, Skill Match 20, Eligibility 20, Team/Learning Value 15, Remote Compatibility 10, Compensation 5, Application Friction 5 (sums to 100), plus documented bonus/penalty markers, clamped to [0,100].
6. **RANK** — descending by score.
7. **SELECT** — only `score >= threshold` (default **85**, `config.jobAcquisition.scoreThreshold`) *and* `confidenceTier === CONFIRMED_JOB`. If fewer than `minResultsBeforeReportingShortfall` (default 3) qualify, the run reports a shortfall rather than silently lowering the bar (§20).
8. **PRESENT** — writes an Obsidian-compatible note per selected job (`memory/local-vault/Jobs/` or your real vault) and a draft application (`skills/job-acquisition/outbox/<key>-application.md`, `status: PENDING_HUMAN_APPROVAL`).
9. **TRACK** — persists every screened job (not just selected ones) to `memory/state/job-acquisition-tracking.json`, keyed by dedup hash, with its `JobState`.

## Sources

| Source | What | Auth | Confidence |
|---|---|---|---|
| `remoteok` | RemoteOK public JSON API | none | CONFIRMED_JOB |
| `arbeitnow` | Arbeitnow public job-board API | none | CONFIRMED_JOB |
| `hn-whoishiring` | HN "Who is hiring?" thread via Algolia API | none | **UNVERIFIED_SIGNAL always** — free-text comments, company/title extraction is best-effort |
| `manual` | JSON files dropped in `skills/job-acquisition/manual-import/` | n/a | whatever you set in the file (defaults `CONFIRMED_JOB`) |

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
