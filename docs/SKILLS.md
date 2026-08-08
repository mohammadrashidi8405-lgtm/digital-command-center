# Skill System

Each skill is a directory under `skills/` with a `manifest.json`:

```json
{
  "id": "job-acquisition",
  "name": "Job Acquisition",
  "description": "...",
  "version": "1.0.0",
  "entry": "./index.mjs",
  "status": "implemented"
}
```

`status` is `"implemented"` or `"planned"`. A skill can only be **enabled** if it's `"implemented"` — `core/skills/skill-registry.mjs` refuses otherwise (`SkillDisabledError`), which is why `data-analysis`, `product-development`, and `research` exist only as manifests today: enabling them is a deliberate future action, not something that can happen by accident.

Enable/disable state is persisted in `config/config.json` under `skills.<id>`.

## Commands

```bash
node scripts/cli.mjs skills              # list all, show [ON]/[off] + status
node scripts/cli.mjs enable <id>
node scripts/cli.mjs disable <id>
```

Running a disabled skill's task (`Agent.runSkillTask`) throws `SkillDisabledError` — the Agent Core rejects the task rather than silently no-op'ing or deferring silently (§9 of the build brief).

## Adding a new skill

1. `mkdir skills/my-skill`
2. Write `manifest.json` with `status: "planned"` while building, `entry: "./index.mjs"`.
3. Write `index.mjs` exporting async functions that accept `{ memory, brain, config, ...extra }` — the same shape `job-acquisition/index.mjs` uses. Use `memory.readState`/`writeState`/`writeNote` and `brain.generate` through their interfaces, not raw file or provider APIs.
4. Flip `status` to `"implemented"` once it works.
5. `node scripts/cli.mjs enable my-skill`.

No changes to `core/` are required. This is the extensibility guarantee: Core doesn't know skill-specific logic exists.
