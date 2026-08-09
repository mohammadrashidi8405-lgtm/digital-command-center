# Setup

## Requirements

- Node.js ≥ 18 (built and tested on v26.5.0)
- Git
- `gh` CLI, authenticated, if you want to push to GitHub (already set up on this machine as `mohammadrashidi8405-lgtm`)

No paid services, no npm dependencies (zero-dependency by design — see §4 of the build brief). `npm install` has nothing to install.

## First run

```bash
cd ~/Documents/Digital-Command-Center
cp config/profile.example.json config/profile.json
```

Edit `config/profile.json` with your real education, languages, skills, and project evidence. This file is **gitignored** — it never leaves this machine and is never committed, even though the repository itself is public.

```bash
node scripts/cli.mjs skills
```

Should show `job-acquisition` as `[ON]` and the other three as `[off]`.

```bash
node scripts/cli.mjs campaign start
```

Runs the full discovery→...→track pipeline against the live free job-board APIs (RemoteOK, Arbeitnow, HN "Who is hiring") plus anything you've dropped into `skills/job-acquisition/manual-import/` (see [JOB_ACQUISITION.md](JOB_ACQUISITION.md)).

## Starting the Command Center UI (optional)

```bash
node server/api.mjs
```

Open `http://localhost:3939`. Local-only (binds to localhost), no external exposure. See [COMMAND_CENTER_UI.md](COMMAND_CENTER_UI.md).

## Connecting Obsidian (optional)

Not required — the system writes identical Markdown to `memory/local-vault/` if no vault is configured. To connect a real vault later, see [memory/README.md](../memory/README.md).

## Brain

No live LLM API is configured on this machine (no `ANTHROPIC_API_KEY`, and the local `claude` CLI binary reports "native binary not installed"). The system runs fully functional without one — scoring and filtering are deterministic, not LLM-dependent. See [LIMITATIONS.md](LIMITATIONS.md) for what changes once a live Brain is available.

## Running tests

```bash
npm test
```

## GitHub

The repository is initialized, committed, and pushed to `https://github.com/mohammadrashidi8405-lgtm/digital-command-center` (public) using the `gh` CLI's existing authentication. See [SECURITY.md](SECURITY.md) for what is and isn't in the tree.
