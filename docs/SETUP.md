# Setup

## Requirements

- Node.js ≥ 18 (built and tested on v26.5.0)
- Git
- `gh` CLI, authenticated, if you want to push to GitHub (already set up on this machine as `mohammadrashidi8405-lgtm`)

No paid services required, no npm dependencies (zero-dependency by design — see §4 of the build brief). `npm install` has nothing to install. The optional live Brain (below) is a real, metered Anthropic API — everything else in the system runs at zero additional cost.

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

`config/config.json`'s `brain` block selects the provider:

```json
"brain": { "provider": "claude", "model": "claude-opus-5", "enabled": true }
```

The system runs fully functional with **no key configured** — scoring, filtering, and thresholding are deterministic and never depend on the Brain. Without a key, the Claude provider automatically and transparently falls back to the honest file-drop brain; nothing breaks, nothing is faked.

### Configuring a live Claude Brain

1. Get a key at https://console.anthropic.com/settings/keys
2. `cp .env.example .env` and set `ANTHROPIC_API_KEY=sk-ant-...` in `.env` (gitignored — never committed)
3. Verify:
   ```bash
   node scripts/cli.mjs "brain status"
   node scripts/cli.mjs "brain test"     # one minimal, low-cost live request
   ```
   `brain status` should report `CONNECTED` with the configured model; `brain test` sends a ~16-token round trip and prints the reply. The Command Center UI's System page shows the same status, plus a "TEST BRAIN" button.

To switch providers later (a different model, a different vendor, or back to the offline file-drop brain for a while), edit `config/config.json`'s `brain.provider`/`brain.model` — no code changes required. Setting `"enabled": false` is a faster kill switch that ignores `provider` entirely.

On this machine specifically: no `ANTHROPIC_API_KEY` is currently set, and the local `claude` CLI binary reports "native binary not installed". See [LIMITATIONS.md](LIMITATIONS.md) for exactly what that does and doesn't affect.

## Running tests

```bash
npm test
```

## GitHub

The repository is initialized, committed, and pushed to `https://github.com/mohammadrashidi8405-lgtm/digital-command-center` (public) using the `gh` CLI's existing authentication. See [SECURITY.md](SECURITY.md) for what is and isn't in the tree.
