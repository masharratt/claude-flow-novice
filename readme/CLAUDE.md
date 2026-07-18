# readme/ — user-facing documentation

Docs shipped/referenced for the npm package and CFN Loop users. Authoring style (sparse, active voice, no marketing/cost/benchmark fluff, minimal working examples) is the global standard — do not restate it here.

## Rules (local only)

- **kebab-case, category-prefixed filenames** (`logs-`, `api-`, `cli-`, `cfn-loop-`).
- **Every code example must run.** These docs are user-facing; a broken snippet ships.
- **Deprecations get a visible marker** at the top of the file, not silent staleness.

## References (load on demand)

| Topic | Path | Load when |
|-------|------|-----------|
| Full annotated file catalog | `readme/INDEX.md` | finding or placing a doc |
| CFN Loop quick ref | `readme/CFN_LOOP_CHEATSHEET.md` | working the loop |
| Slash commands | `readme/logs-slash-commands.md` | CLI/command work |
| API surface | `readme/logs-api.md` | REST/MCP/CLI integration |
