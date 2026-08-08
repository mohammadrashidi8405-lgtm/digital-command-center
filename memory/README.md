# Memory Layer

Three kinds of memory, kept deliberately separate:

| Kind | Location | Format | Committed to git? |
|---|---|---|---|
| Short-term execution state | `memory/state/*.json` | JSON | No (gitignored — operational data) |
| Persistent knowledge (notes) | `memory/local-vault/` (no vault configured) or your real Obsidian vault | Markdown | No (gitignored — may contain real company/job data) |
| Structure-only template | `memory/vault-template/` | empty folders | Yes |
| Logs | `logs/*.jsonl` | JSONL | No (gitignored) |

## Connecting a real Obsidian vault

No vault exists yet. To connect one:

1. Create or open a vault in Obsidian, anywhere on disk (e.g. `~/Documents/Obsidian/Command-Center`).
2. Copy the folders from `memory/vault-template/` into the vault root (`Projects/`, `Skills/`, `People/`, `Companies/`, `Jobs/`, `Research/`, `Work/`, `Logs/`).
3. Set `memory.obsidianVaultPath` in `config/config.json` to the vault's absolute path.
4. Restart the CLI. `FileMemory` (`core/memory/file-memory.mjs`) will write all future notes there instead of `memory/local-vault/`.

Until a vault is connected, the system writes identical Markdown into `memory/local-vault/` — nothing about the Job Acquisition skill's behavior depends on Obsidian being installed. Obsidian itself is just a viewer/editor over the same Markdown files.

## Why the split

- **State** is small, structured, and rewritten frequently — JSON is the right fit and it doesn't need to be human-browsable.
- **Notes** are for anything a human should be able to read, link, and search later (a company profile, a person, a research note) — Markdown/Obsidian is the right fit.
- **Logs** are append-only history, kept out of both.

No secrets are ever written to any memory file. See `docs/SECURITY.md`.
