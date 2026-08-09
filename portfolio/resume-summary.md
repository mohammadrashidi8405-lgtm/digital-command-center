# Resume Summary

## Project title

**Digital Command Center** — Modular AI Agent System for Opportunity Discovery & Evaluation

## One-line description

Designed and implemented a modular AI agent system (Brain/Memory/Skills/Tools separation) that discovers, deterministically filters and scores, and tracks job opportunities from live public APIs, with a provider-agnostic Claude reasoning layer and a strict human-approval boundary.

## Bullets

- Designed a provider-agnostic Brain architecture (interface-based, swappable implementations) and implemented a live Claude API integration behind it — bounded retries, structured-output parsing, and full error-path handling (auth, rate-limit, timeout, malformed response), validated with 21 unit tests using an injected network mock, with zero live-credential dependency in CI.
- Built a deterministic filtering and scoring engine (hard eligibility rules, weighted 100-point scoring, configurable quality threshold) and integrated it with a semantic AI evaluation layer scoped as strictly advisory — verified that AI connectivity state has zero effect on selection determinism through a real campaign run against 229 live job listings from three public APIs.
- Automated multi-source opportunity discovery (RemoteOK, Arbeitnow, Hacker News) with deduplication and reprocessing-avoidance, validated against real traffic (160 listings discovered and correctly deduplicated in a single run).
- Implemented a structured, three-tier Memory layer (JSON execution state, Obsidian-compatible Markdown notes, append-only JSONL logs) and a local Command Center UI (dashboard, live campaign progress via Server-Sent Events, real-time system/connectivity status) served by a zero-dependency Node HTTP API.
- Enforced a hard human-in-the-loop boundary — no code path submits applications or sends messages automatically — and validated secret-handling end-to-end (API credentials never logged, exposed in API responses, or committed) with a dedicated automated test and a manual repository-wide security scan.

## Technologies

Node.js (ES modules), `node:http`/`node:test` (zero-dependency backend and test runner), Anthropic Claude API (Messages API, structured outputs), Server-Sent Events, vanilla JS/HTML/CSS frontend (no framework/build step), JSON/Markdown/JSONL persistence, Git/GitHub.

## Architecture keywords

Modular agent architecture, provider abstraction, interface-driven design, deterministic + AI hybrid decision pipeline, human-in-the-loop safety boundary, token-efficient context construction, bounded retry/backoff, structured LLM output, test-driven development with network-boundary mocking, zero-dependency runtime.
