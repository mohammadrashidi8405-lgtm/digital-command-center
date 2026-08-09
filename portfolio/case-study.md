# Case Study: Digital Command Center

A modular, locally-run AI agent system that discovers, filters, scores, and tracks job opportunities — built to demonstrate a specific engineering position: **deterministic logic should own every decision that must be safe, reproducible, and auditable; AI reasoning should own the parts that are genuinely semantic; and no system should claim a capability it hasn't verified.**

## Problem

Manually searching for internship/junior-role opportunities across multiple job boards produces:
- **Noise** — the large majority of postings on a general board don't match a specific target-role profile at all.
- **Repetitive filtering** — the same "is this remote / is this junior-level / does this need a language I don't have" judgment gets re-made by hand for every listing, every time.
- **Fragmented information** — a good match found today is easy to lose track of by next week, scattered across browser tabs and memory.
- **Poor memory** — nothing prevents re-evaluating a listing already seen and already rejected.
- **Inefficient evaluation** — a listing worth a closer, more nuanced look (does this company's stated stack and stage actually fit this candidate's profile) gets either skipped entirely or given the same shallow read as everything else.

## Objective

Build a system that:
1. Discovers opportunities from multiple real sources automatically.
2. Applies deterministic, auditable filtering and scoring so the same input always produces the same output.
3. Uses AI reasoning only where deterministic logic can't — semantic fit, ambiguous context, structured summarization — without letting that reasoning override safety-relevant decisions.
4. Remembers what it has already evaluated, so no work (human or API-token) is repeated.
5. Never takes an externally consequential action without a human explicitly approving it.

## Architecture

See [architecture.md](architecture.md) for the full diagram. In short: **Brain** (`core/brain/`) is a swappable reasoning provider behind one interface; **Memory** (`core/memory/`) is structured, queryable state plus human-readable Obsidian-compatible notes; **Skills** (`skills/`) are independently enable/disable-able capabilities, of which only Job Acquisition is implemented; **Tools** (`core/tools/`) are the concrete, narrow actions a Skill can take (an HTTP GET, nothing broader); **Workflows** are the stage sequences a Skill runs through. A Command Center UI (`ui/`, `server/api.mjs`) sits on top of the identical `Agent` the CLI uses — no parallel implementation, no mock data path.

## Engineering decisions (why, not just what)

Full reasoning for each is in [technical-decisions.md](technical-decisions.md). The short version:

- **Deterministic filtering exists** because hard eligibility (experience level, role relevance, language) is objectively checkable from listing text, and getting it wrong either way (too strict, too loose) is directly observable and testable — it doesn't need a model call.
- **AI reasoning exists** for the one genuinely semantic task in this pipeline — judging fit and surfacing nuance a keyword match can't (why a role is or isn't a good match, what's missing from the listing) — and is explicitly scoped to *advisory* output that never touches the selection decision.
- **Human approval exists** because this system produces content (draft applications) that could plausibly be sent on a real person's behalf, and no runtime check is as safe as the capability simply not existing in the codebase.
- **Memory is separated from the Brain** because persistent state needs to be inspectable and correct independent of whether a model call happened to succeed that day.
- **Skills are modular** because the only skill implemented today (Job Acquisition) should not have to be the reason the next one (data analysis, product development, research — all present as manifest-only stubs) requires touching Core.
- **Provider abstraction exists** for the Brain specifically because it's the component most likely to change and least essential to couple to the rest of the system.

## Validation

All of the following is from real, reproducible commands run against this exact repository at commit `db9b236` — not aggregated, not summarized-and-lost, raw data preserved in `portfolio/evidence/`:

- **Tests:** 125/125 passing, 29 suites, 0 skipped. See [evidence/test-results.md](evidence/test-results.md).
- **Real campaign, real sources:** 160 live listings discovered in one run (RemoteOK 50, Arbeitnow 50, HN 60); cumulative real tracked history across sessions: 229 listings, 217 rejected by deterministic hard filters (156 role-relevance, 114 experience-level, 3 language, 14 placeholder), 12 survived filtering and were scored, highest score 76/100 — below the 85-point selection threshold, so **0 selected, and the threshold was never lowered to manufacture a result.** See [evidence/campaign-results.md](evidence/campaign-results.md).
- **Claude Brain:** implemented and unit-tested (21 tests, mocked network boundary — retries, error classification, secret redaction, response parsing all verified for real). **Not connected to the live API in this environment** — no `ANTHROPIC_API_KEY` is configured — and the system reports that honestly (`NOT CONNECTED`) rather than faking a connected state. See [evidence/brain-validation.md](evidence/brain-validation.md).

The single most important thing this validation demonstrates is not a successful job match — there wasn't one, honestly, in this real data. It's that **the system correctly returned zero rather than lowering its own bar**, and that **the "AI-powered" claim is backed by real, tested code with an honestly-reported connection state**, not by a demo that happens to look impressive.

## Limitations

- No live Claude API connectivity has been verified in this environment (no key configured) — deep-match evaluation has only run through its honest `pending` fallback, never through a real model response.
- Browser automation is architected (a swappable `Tool` interface) but not implemented — no Playwright/Puppeteer is installed; `manual-import` is the supported workaround for sites needing it.
- HN "Who is hiring" title/company extraction is best-effort string parsing over free-text comments, not structured data — every HN-sourced listing is tagged `UNVERIFIED_SIGNAL` and can never be auto-selected regardless of score, specifically because of this.
- Scoring and filtering are keyword/regex-based, not semantic — a listing phrased unusually can be misjudged. This is a deliberate choice (deterministic, testable, reproducible without a live Brain), not an oversight; the deep-match stage is the designed integration point for smarter matching once connected.
- No screenshots of the running UI are included in this repository — this session had no browser-capture tool available; exact manual capture instructions are in `portfolio/screenshots/README.md` rather than fabricated images.
- No live campaign has ever produced a qualifying (score ≥ 85) result against real data in this environment — the system's positive-path behavior (writing a note, drafting an application) is verified only through the test suite's synthetic fixtures, not through a real selection.

## Lessons learned

- **Reproducibility is easy to lose the moment "AI" enters a decision path.** Keeping the Brain strictly advisory meant the deterministic pipeline's test results and the real campaign's results are identical whether or not `ANTHROPIC_API_KEY` is set — that guarantee would not exist if scoring or selection ever called the model directly.
- **An honest `NOT CONNECTED` is more defensible than a demo.** The temptation with an integration like this is to hardcode a "connected" status for demonstration purposes. Doing the extra work to make status genuinely live-computed (from `ANTHROPIC_API_KEY` presence and the outcome of the last real request) turned out to cost about the same amount of code as faking it, and produces a system that's actually trustworthy to show in an interview.
- **A zero-result campaign is still evidence, if the system is honest about why.** The real data here never crossed the 85-point bar. Reporting that plainly — with the exact rejection-reason breakdown — is a stronger demonstration of engineering judgment than curating a fixture that would have "worked."
- **Token/cost discipline has to be structural, not aspirational.** Bounding retries and per-run Brain-call counts, and testing that the bound actually holds (not just documenting an intent to bound it), was the difference between "this won't run away on you" being a real property versus a comment in a docstring.
