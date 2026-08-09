# Portfolio — Digital Command Center

Evidence and interview-ready documentation for the Digital Command Center project. Every claim in this directory is backed by a linked artifact — a test run, a log file, a real campaign result — not asserted from memory. Where something isn't verified, it's labeled `NOT CONNECTED` / `NOT VERIFIED` / `PLANNED` explicitly; see [validation-report.md](validation-report.md) for the full capability table.

## Start here

- **[case-study.md](case-study.md)** — the full technical narrative: problem, objective, architecture, engineering decisions, validation, limitations, lessons learned.
- **[validation-report.md](validation-report.md)** — every capability tagged IMPLEMENTED / CONNECTED / VERIFIED / NOT CONNECTED / NOT VERIFIED / PLANNED, with evidence links.

## Deeper detail

- **[architecture.md](architecture.md)** — the end-to-end flow diagram and why each module boundary exists.
- **[workflow.md](workflow.md)** — one real, executed campaign run, stage by stage.
- **[technical-decisions.md](technical-decisions.md)** — nine engineering decisions with the alternative considered and why it was rejected.

## Interview / application material

- **[interview-notes.md](interview-notes.md)** — direct, technically-grounded answers to the questions this project invites.
- **[resume-summary.md](resume-summary.md)** — a resume-ready project entry.
- **[linkedin-summary.md](linkedin-summary.md)** — a LinkedIn-ready project description.

## Raw evidence

- **[evidence/test-results.md](evidence/test-results.md)** — full `npm test` output (125/125 passing).
- **[evidence/campaign-results.md](evidence/campaign-results.md)** — real campaign data against three live job-board APIs.
- **[evidence/brain-validation.md](evidence/brain-validation.md)** — what's implemented and tested vs. what's actually connected.
- **[screenshots/README.md](screenshots/README.md)** — UI is real and running; screenshots were not captured this session (no browser tool available) — exact manual capture steps are documented rather than the images being faked.

## The one-sentence version

A modular AI agent system (Brain / Memory / Skills / Tools / Workflows, cleanly separated) that discovers, deterministically filters and scores, and tracks job opportunities from real live sources, with a Claude-based semantic-evaluation layer that's fully implemented and unit-tested but not connected to a live API key in this environment — reported honestly as such everywhere the system surfaces its own status.
