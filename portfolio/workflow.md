# Workflow — the Job Acquisition Campaign, Stage by Stage

This walks through one real, executed run (2026-08-09T08:38:14Z, commit `db9b236` — raw data in [evidence/campaign-results.md](evidence/campaign-results.md)) stage by stage, showing what each stage actually did.

## 1. DISCOVER

`skills/job-acquisition/pipeline.mjs` calls each enabled source's `discover()` in turn. Each source is a small adapter over a real, free, public API — no scraping, no authentication:

| Source | What it hits | Result this run |
|---|---|---|
| RemoteOK | `remoteok.com` public JSON API | 50 listings |
| Arbeitnow | Arbeitnow public job-board API | 50 listings |
| HN "Who is hiring" | Hacker News public API, latest hiring thread | 60 listings |
| manual-import | Local JSON files dropped by a human (or a Claude Code session with web access, run outside this app) | 0 this run |

**160 real listings discovered.**

## 2. DEDUPLICATE

`dedupe.mjs` normalizes each URL (strips tracking params, trailing slash) and hashes it to a stable key. This run: 160 in, 160 unique, 0 dropped — no duplicates within the batch. Separately, keys already present in `memory/state/job-acquisition-tracking.json` from a prior run are excluded before screening (§21 token optimization) — this run, all 160 had already been tracked, so 160 were skipped and 0 proceeded to screening. This is the correct, intended behavior: the system does not re-spend filtering/scoring work (or, when a live Brain is connected, API tokens) on a listing it has already evaluated.

## 3. PLACEHOLDER FILTER

Before any regex-based filtering, `placeholder-filter.mjs` rejects listings that are anchored-matched against a known set of non-job placeholder titles ("Open Vacancies", "Check Back Soon", "Oops something happened", etc. — patterns observed in real RemoteOK output). Across the full 229-listing tracked history, 14 were caught here.

## 4. HARD FILTER

`filters.mjs` rejects on objectively determinable blockers only: experience-level mismatch, no role relevance, onsite-only, unmet language requirement, fraud/scam text patterns, missing verifiable URL. Across the tracked history: **156 rejected on role-relevance, 114 on experience-level, 3 on language** (a listing can fail more than one). Ambiguous signals (e.g. unclear work authorization) are deliberately *not* hard-rejected — they proceed to scoring instead, because a hard reject requires certainty the system doesn't fabricate.

## 5. SCORE

`scorer.mjs` applies a weighted formula (Role Match 25, Skill Match 20, Eligibility 20, Team/Learning Value 15, Remote Compatibility 10, Compensation 5, Application Friction 5 — sums to 100) plus documented bonus/penalty markers, clamped to [0, 100]. 12 listings from the tracked history survived hard filtering and reached this stage; **the highest score achieved was 76/100.**

## 6. AI INTERPRETATION (Claude Brain, advisory only)

For any listing scoring ≥ 60, `pipeline.mjs` requests a structured evaluation from the Brain (`relevance`, `reasoning`, `strengths[]`, `concerns[]`, `missing_information[]`, `recommendation`). In this run, every one of these came back `deepMatchStatus: "pending"` — the honest fallback response, because no `ANTHROPIC_API_KEY` is configured (see [evidence/brain-validation.md](evidence/brain-validation.md)). **This stage never changes the score computed in step 5** — see [architecture.md](architecture.md) for exactly how that's enforced in code, not just by convention.

## 7. RANK + SELECT

Listings are sorted descending by score; only `score ≥ 85 AND confidenceTier === CONFIRMED_JOB` is selected. This run: **0 selected** — the highest score (76) never reached the threshold. The system reported a shortfall rather than lowering the bar, exactly as designed.

## 8. PRESENT + TRACK

For any selected job (none, this run), the system would write an Obsidian-compatible Markdown note under `memory/local-vault/Jobs/` (or a connected real vault) and a draft application to `skills/job-acquisition/outbox/`, tagged `PENDING_HUMAN_APPROVAL`. Every screened job — selected or not — is persisted to `memory/state/job-acquisition-tracking.json`, so a future run never re-evaluates it.

## 9. HUMAN REVIEW

Nothing in this workflow submits a form, sends a message, or confirms a legal/eligibility claim. A human opens the outbox draft, fills in anything marked `[HUMAN INPUT REQUIRED]`, and decides whether to send it — entirely outside this codebase.

---

*See [case-study.md](case-study.md) for why this workflow is structured this way, and [validation-report.md](validation-report.md) for what this run does and doesn't prove.*
