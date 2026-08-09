# Interview Notes

Direct answers, grounded in the actual implementation — cross-referenced so a claim here can be checked against real code or real evidence.

## Why this architecture?

Because the system needed to keep working, and stay testable, independent of any single external service. `core/agent/agent.mjs` depends on `BrainInterface` and `MemoryInterface`, never on a concrete class. That's not architecture-for-architecture's-sake: the Job Acquisition pipeline had 98+ passing tests and a working real campaign before `ClaudeBrain` existed at all, running against `FileDropBrain` alone. Adding the live provider later touched one new file and one registry entry — see `core/brain/index.mjs`.

## Why Claude?

It's the model family this build environment (Claude Code) is native to, and the Messages API's structured-output support (`output_config.format: json_schema`) maps directly onto the §12 evaluation shape this project needed (relevance/reasoning/strengths/concerns/missing_information/recommendation) without hand-rolled JSON-in-prose parsing. The provider abstraction means this isn't a permanent commitment — swapping to another vendor is a new file behind the same `BrainInterface`.

## Why deterministic filtering + AI, not just AI?

Because the two are good at different things. Filtering "does this listing require 3+ years of experience" or "is this remote" from listing text is a pattern-match problem — deterministic, testable, and its failure mode (a wrong keyword rule) is directly fixable and doesn't drift between runs. Judging "does this candidate's specific project history actually fit this specific team's stated needs" is a semantic problem a keyword match handles poorly. Splitting them means the score a listing gets is reproducible — same input, same output, every time, whether or not the Brain is even connected. That reproducibility was directly verified: the real campaign in this repo produced identical deterministic results (0 selected, same rejection counts) regardless of Brain connectivity, because the Brain was never in the decision path.

## Why not let the LLM make every decision?

Two reasons. First, safety: this pipeline gates a real action a human might take (sending an application). A selection decision that could silently vary based on model sampling, a provider outage, or a subtle prompt regression isn't an acceptable gate for that. Second, cost and latency: running every one of 229 real listings through a full LLM judgment call, every run, is both slower and more expensive than a regex pass that gets the objective 80% for free — the deep-match stage only runs for listings that already scored ≥60 deterministically, which is why 160 discovered listings in one real run produced far fewer (would-be, capped) live calls, not 160.

## How is token consumption controlled?

Three mechanisms, all real and tested, not aspirational: (1) deep-match prompts send a truncated job description plus a relevant profile subset only — never the full repo, full memory, or unrelated jobs; (2) `output_config.effort: "low"` on every request; (3) a hard `maxDeepMatchCallsPerRun` cap and bounded retries (max 3 attempts, exponential backoff) — the retry bound specifically is unit-tested to confirm it can't loop unboundedly (`tests/claude-brain.test.mjs`).

## How is memory implemented?

Three kinds, kept separate on purpose: short-term execution state as JSON (`memory/state/*.json` — e.g. which jobs have already been tracked, keyed by a stable dedup hash), long-term human-readable notes as Markdown (`memory/local-vault/` or a connected real Obsidian vault, identical format either way), and append-only logs as JSONL (`logs/command-center.jsonl`). None of it lives inside the Brain — `ClaudeBrain` and `FileDropBrain` are both stateless with respect to campaign data.

## How is security handled?

The API credential comes exclusively from `process.env.ANTHROPIC_API_KEY`, loaded from a gitignored `.env` — never in `config.json`, never in source, never committed. It's sent only as the `x-api-key` header, never in a body. Error messages are redacted (the literal key value, plus any `sk-ant-...`-shaped string) before being returned or logged, defensively, in case an upstream error body ever echoed it back. `/api/system`, `/api/status`, and `brain status` expose only provider name, model, booleans, and timestamps — this is asserted by a dedicated test (`tests/server.test.mjs`, "no secrets in API responses") and was manually re-verified with a repo-wide secret scan before this phase's commit.

## Why human approval?

Because this system produces real content about a real person (a draft application referencing their actual education, skills, and project history) and could, if extended carelessly, take an irreversible action on their behalf — submitting a form, sending a message, or implicitly making a claim about their work authorization or nationality. The safeguard is structural: `outbox.mjs` writes a Markdown file tagged `PENDING_HUMAN_APPROVAL` and nothing else. There is no function in this codebase that performs a submit-shaped action. Fields the system genuinely cannot know are written as `[HUMAN INPUT REQUIRED]` rather than inferred or guessed.

## How does the system avoid hallucinating job information?

By never asking the model to invent facts in the first place. The deterministic engine only ever reports facts it directly extracted from listing text (title, company, URL, description substrings matched by a filter). The Brain's deep-match prompt is explicitly instructed to distinguish observed fact from inference and never invent candidate experience or job facts not present in the prompt — and, because the deep-match output is advisory-only, even if a model call did produce something ungrounded, it cannot change which job gets selected or what fact gets written into the deterministic tracking record.

## What happens if Claude is unavailable?

`ClaudeBrain.generate()` transparently delegates to `FileDropBrain`, returning `{status: 'pending'}` — never a thrown error that crashes the pipeline, and never a fabricated response pretending a model answered. This path is not hypothetical: it's exactly what happened in every real run in this environment, because no `ANTHROPIC_API_KEY` is configured here (see `evidence/brain-validation.md`). The System page and `brain status` reflect this live — `NOT CONNECTED`, not a hardcoded "AI Active" badge.

## What are the current limitations?

No live Claude API call has been verified in this environment (no key present). Browser automation is architected but not implemented (no headless browser dependency installed — `manual-import` is the supported workaround). HN "Who is hiring" title extraction is best-effort string parsing over free text, not structured data. Scoring is keyword/regex-based, not semantic. No screenshots of the running UI exist in the repo (no browser-capture tool this session). No live campaign has ever produced a qualifying result against real data — the highest real score observed is 76/100 against an 85-point threshold. Full list: `case-study.md`.

## What would you improve next?

Connect a real `ANTHROPIC_API_KEY` and re-run the campaign to see the deep-match evaluation actually populate opportunity notes with real semantic reasoning instead of the `pending` fallback. Add a fourth or fifth discovery source more specifically targeted at the profile's exact roles (AI Operations, Product Operations) rather than general boards, since 156 of 217 real rejections were role-relevance mismatches — the discovery sources are currently broader than the target-role filter, which is a quality-of-source problem more than a filtering-logic problem. And, if the project's scope ever genuinely needs it, make a deliberate, reviewed decision about a real browser-automation dependency rather than leaving it a permanent stub.
