# Campaign Results — Real Data

**Status: VERIFIED** (real live sources, real deterministic filtering — no fabricated data)
**Brain interpretation stage: NOT CONNECTED** (see [brain-validation.md](brain-validation.md)) — every number below comes from the deterministic engine, not from AI reasoning.

## Run 1: fresh discovery run, 2026-08-09T08:38:14Z

Command: `node scripts/cli.mjs campaign start` (all sources: RemoteOK, Arbeitnow, HN "Who is hiring", manual).

Raw log (`logs/command-center.jsonl`, unedited):

```
source_discovered  source=remoteok        count=50
source_discovered  source=arbeitnow       count=50
source_discovered  source=hn-whoishiring  count=60
source_discovered  source=manual          count=0
deduplicated       input=160 unique=160 dropped=0
skipped_already_processed  skipped=160
campaign_complete  screened=0 placeholderFiltered=0 hardFiltered=0 qualified=0 selected=0
```

CLI output:

```
Screened: 0, placeholder-filtered: 0, hard-filtered: 0, qualified: 0, selected: 0 (threshold 85)
Fewer than the minimum quality bar were found. Reporting shortfall rather than lowering the threshold (per policy).
```

**Why `screened` is 0, honestly:** all 160 listings discovered in this run had already been processed and tracked in a prior session (2026-08-08T16:48 – 2026-08-09T08:13, this same environment, before this portfolio phase began). §21's token-optimization rule (`excludeAlreadyProcessed`, `skills/job-acquisition/dedupe.mjs`) correctly recognized all 160 as already-seen and skipped re-screening them rather than doing redundant work. This is the reprocessing-avoidance feature working as designed, not a discovery failure — the `source_discovered` counts above prove all three live APIs returned real data (50, 50, 60 listings) in this run.

## Cumulative real state (all runs to date): `memory/state/job-acquisition-tracking.json`

This is the authoritative, real record of everything the deterministic engine has ever evaluated in this environment — 229 real listings pulled from RemoteOK, Arbeitnow, and HN "Who is hiring" across the runs above and prior sessions.

```
Total tracked: 229
  SKIPPED:   217
  SCREENED:   12   (survived every hard filter, scored, but below the 85-point threshold)
  SELECTED:    0
```

**Source distribution:**

```
arbeitnow:       100
remoteok:         69
hn-whoishiring:   60
```

**Hard-filter / placeholder rejection reasons (217 skipped):**

```
role-relevance:        156
experience-level:      114
PLACEHOLDER_LISTING:    14
language:                 3
```
(A single listing can be rejected for more than one reason, so these don't sum to 217.)

**Highest-scoring listings (survived all hard filters, still below threshold 85):**

| Score | Title | Company | Source |
|---|---|---|---|
| 76 | Cogram (AI platform for AEC) | — | hn-whoishiring |
| 74 | Founder's Associate | Clera | arbeitnow |
| 74 | SmarterDx (multiple roles) | — | hn-whoishiring |
| 74 | Founder's Associate | Clera | arbeitnow |
| 71 | Founder's Associate | Clera | arbeitnow |
| 71 | Forward Deployed Engineer | Clera | arbeitnow |
| 69 | AI Engineer – Model Training & Deployment | Clera | arbeitnow |

**Highest score reached: 76/100. Zero listings ever reached the 85-point selection threshold. Zero jobs were ever selected. The threshold was never lowered to produce a result.**

## Reading this honestly

This is a real, unflattering, and useful result: the deterministic engine (dedup → placeholder filter → hard filter → score → threshold) ran against 229 real listings from three live job-board APIs and correctly rejected all of them rather than fabricating or inflating a match. That is the intended behavior of a quality-over-quantity system, not a bug — see [validation-report.md](../validation-report.md) for what this does and doesn't demonstrate, and [case-study.md](../case-study.md) for the engineering interpretation.

## HN "Who is hiring" parsing quality (observed, real)

Several `hn-whoishiring` titles above are clearly not clean job titles (e.g. a full paragraph of comment text truncated at ~140 characters). This is a known, already-documented limitation (`docs/LIMITATIONS.md`, "HN 'Who is hiring' jobs are always unverified") — title/company extraction from HN's free-text hiring thread is best-effort string parsing, not structured data, and every HN-sourced listing is tagged `UNVERIFIED_SIGNAL` so it can never be auto-selected regardless of score.
