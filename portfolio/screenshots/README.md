note: for a designed LinkedIn/GitHub cover graphic (not a UI screenshot), see [`../assets/thumbnail.png`](../assets/thumbnail.png) — it's a hand-built banner summarizing the project, not a capture of the running app, and isn't a substitute for the real screenshots below.

# Screenshots — NOT CAPTURED

**Status: NOT CAPTURED.** This session has no browser access (no connected screen-capture or browser-automation tool), so no image files were created here. Per the build brief: "Do NOT invent screenshots" — this repo will not contain empty, placeholder, or fabricated `.png` files pretending to be evidence. This file exists so the gap is explicit rather than silently missing.

## Exact manual steps for Sir Edward

1. Start the Command Center:
   ```bash
   cd ~/Documents/Digital-Command-Center
   node server/api.mjs
   ```
2. Open `http://localhost:3939` in a browser.
3. Capture each page below at its route and save it under this directory with the exact filename listed.

| File | Route | What it should show |
|---|---|---|
| `dashboard.png` | `http://localhost:3939/#/dashboard` | Stat tiles, campaign status, score-distribution histogram, recent activity |
| `campaign.png` | `http://localhost:3939/#/campaign` | Source checkboxes and either the funnel breakdown from a completed run, or the SSE progress mid-run |
| `opportunities.png` | `http://localhost:3939/#/opportunities` | The opportunities list — note that per [evidence/campaign-results.md](../evidence/campaign-results.md), this will legitimately show the empty state (0 selected, threshold 85) unless a qualifying job has since been found; that empty state is itself accurate evidence, not a failure to hide |
| `skills.png` | `http://localhost:3939/#/skills` | Real ON/OFF toggles — `job-acquisition` enabled, the three manifest-only skills shown disabled with an explanation |
| `memory.png` | `http://localhost:3939/#/memory` | Obsidian connection status (`NOT CONNECTED` is expected and correct — no vault is configured on this machine, see `memory/README.md`) and per-category note counts |
| `system.png` | `http://localhost:3939/#/system` | Brain status card showing `NOT CONNECTED` (provider `claude`, model `claude-opus-5`, no `ANTHROPIC_API_KEY`) — this is the most important screenshot for interview defensibility: it proves the status is reported honestly rather than faked |

## After connecting a live Brain (optional, recommended)

If `ANTHROPIC_API_KEY` is configured (see `docs/SETUP.md`), re-capture `system.png` to show `CONNECTED` instead, and note the before/after pair in [validation-report.md](../validation-report.md) — a screenshot pair showing the honest NOT CONNECTED → CONNECTED transition is stronger portfolio evidence than a single "it works" image, because it demonstrates the status is actually live-computed rather than hardcoded.
