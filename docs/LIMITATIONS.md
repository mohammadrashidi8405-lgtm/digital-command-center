# Limitations

Written plainly, per the build brief's requirement to never claim a capability that isn't real.

## No live Brain / LLM API

This machine has no `ANTHROPIC_API_KEY`, and the local `claude` CLI binary reports `Error: claude native binary not installed` (postinstall didn't complete). The Brain is `FileDropBrain` — it writes prompts to `core/brain/inbox/` and checks `core/brain/outbox/` for a manually-supplied answer; it never calls a real model and never fabricates one. Every stage of the Job Acquisition pipeline that matters for correctness (hard filtering, scoring, thresholding) is deterministic and does **not** depend on the Brain — "deep match" brain calls are advisory-only and currently always come back `pending`.

**To fix:** either run `node node_modules/@anthropic-ai/claude-code/install.cjs` to repair the local `claude` binary, or set `ANTHROPIC_API_KEY` and add a real provider adapter implementing `BrainInterface` (see ARCHITECTURE.md).

## No LinkedIn integration

LinkedIn requires authentication and its Terms of Service prohibit scraping. Not implemented, not worked around with hidden automation. The `manual-import` source is the deliberate workaround: copy a listing's details into a JSON file by hand (or via a Claude Code session with web access, run outside this app) and drop it in `skills/job-acquisition/manual-import/`.

## No general company-career-page scraping

Career pages vary too much in structure for a generic, reliable scraper without a real browser (JS-rendered pages, pagination, anti-bot measures). Not implemented for the same "don't fake it" reason as LinkedIn. Same `manual-import` workaround applies.

## No browser automation

No Playwright/Puppeteer/Selenium is installed. `core/tools/tool-registry.mjs`'s `browserTool` throws `ToolUnavailableError` rather than silently no-op'ing. Installing one (e.g. `npm install playwright`, MIT-licensed, free) is a reasonable next step but is a real dependency + browser-binary download, so it was left as a deliberate future decision rather than added speculatively.

## No recruiter/founder identification or outreach (§25/§26)

Requires either a live Brain (to reason about who's relevant from unstructured text) or richer data sources than the four implemented. Not built. The scoring formula still surfaces listings with founder-accessibility language via a bonus, but nothing drafts or sends outreach.

## No Obsidian vault created

Obsidian is not installed on this Mac (`/Applications` has no Obsidian.app). The Memory layer works fully without it — `memory/local-vault/` holds the same Markdown a vault would. See `memory/README.md` for how to connect a real vault once Obsidian is installed.

## HN "Who is hiring" jobs are always unverified

Comment text is free-form; company/title extraction is best-effort string parsing. Every job from this source is tagged `UNVERIFIED_SIGNAL` and can never be auto-`SELECTED` — only `CONFIRMED_JOB` listings clear the selection bar.

## Scoring is heuristic, not semantic

`scorer.mjs` and `filters.mjs` use keyword/regex matching against listing text, not true language understanding — this was a deliberate choice to keep the pipeline fully functional and deterministic without a live Brain. It will misjudge listings that describe themselves in unusual language. Once a live Brain is connected, `pipeline.mjs`'s deep-match stage is the integration point for smarter matching.

## Data-analysis / product-development / research skills

Manifests only (`status: "planned"`). The registry refuses to enable them. No workflow logic exists yet — building one out is future work per the extensibility model in ARCHITECTURE.md/SKILLS.md.
