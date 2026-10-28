# CFN Development Project

This project is the source of truth for CFN infrastructure. `~/.claude/` dirs are reverse-symlinked back here so all projects share the same files.

## Codex Delegation

codex=true

## Reverse Symlinks (`~/.claude/` → project)

Each `~/.claude/<dir>/` is a reverse symlink to `.claude/<dir>/` in this project, so all projects share one source. Symlinked dirs: `skills/`, `hooks/`, `commands/`, `agents/cfn-dev-team/`, `core/`, `helpers/`, `cfn-config/`, `cfn-data/`, `cfn-extras/`, `cfn-scripts/`, `adaptive-context/`, `agent-principles/`, `prompts/`, `tooling/`.

**These links are load-bearing.** Skills run with the cwd set to whatever project invoked
them, so they reach their own helper scripts through `$HOME/.claude/skills/...`. Miss the
`skills` link and every skill that shells out reports its scripts as missing in every
project but this one. Create or verify them with:

```bash
.claude/cfn-scripts/link-runtime-dirs.sh          # the 14 runtime dirs (idempotent)
.claude/cfn-scripts/link-runtime-dirs.sh --check  # verify only
```

`link-global-config.sh` (below) calls this for you, so one command does both halves. A
populated real `~/.claude/<dir>` is refused until you pass `--force`; nothing is deleted.

When writing a skill or command that shells out, always invoke via `$HOME/.claude/skills/...`,
never a cwd-relative `.claude/skills/...`. `tests/test-shell-portability.sh` enforces this.

### Global Config Layer (`.claude/global/`)

The CFN operating guide and its supporting docs live in `.claude/global/` and are
symlinked into `~/.claude/` as individual entries, not as one directory:

| Repo path | Linked to |
|-----------|-----------|
| `.claude/global/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `.claude/global/RTK.md` | `~/.claude/RTK.md` |
| `.claude/global/model-pricing.md` | `~/.claude/model-pricing.md` |
| `.claude/global/rules/` | `~/.claude/rules/` |
| `.claude/global/references/` | `~/.claude/references/` |

Edit them here.

Set up or verify the links with:

```bash
.claude/cfn-scripts/link-global-config.sh          # link (idempotent, backs up what it replaces)
.claude/cfn-scripts/link-global-config.sh --check  # verify only
```

### Project-Local (not symlinked)

| Path | Purpose |
|------|---------|
| `.claude/agents/custom/` | Project-specific agents |
| `.claude/agents/project-only-agents/` | Project-specific agents |
| `.claude/backups/` | Local edit backups |
| `.claude/settings.json` | Project Z.ai config + project-only hooks |

### Editing CFN Files

Edit here; changes reach every project through the symlinks. Z.ai settings are per-project in `.claude/settings.json` `env`.

## Docs

| Topic | Path |
|-------|------|
| CLI Mode | `docs/CFN_LOOP_CLI_MODE.md` |
| Tests | `tests/CLAUDE.md` |
| Skills | `.claude/skills/CLAUDE.md` |
| Coordination | `.claude/CLAUDE.md` |
| Architecture | `.claude/cfn-extras/agents/custom-agents/cfn-system-expert.md` |

## Style

Speak plainly, no fluff. Bullets > prose. Cite paths with line numbers (`src/app.ts:42`) in the closing "Where" line, per the global communication style. Redact secrets as `[REDACTED]`. Avoid exaggeration, 'you're right', and self-congratulatory language. Do not give code examples unless specifically asked.

## Output Locations

| Type | Path |
|------|------|
| Bugs | `docs/BUG_#_*.md` |
| Tests | `tests/test-*.sh` |
| Features | `docs/FEATURE_*.md` |
| Temp | `/tmp/` only |

## WSL Memory Monitor

WSL2 only: a background monitor kills node test runners over 10% memory (or test children over 15% combined); shells are never killed. Status: `~/.local/bin/wsl-memory-monitor.sh --status`; log `/tmp/wsl-memory-monitor.log`.

## Platform

CFN is developed on WSL2 and assumes a GNU userland (bash 4+, GNU coreutils/sed/grep).
Setting up on macOS needs a documented porting pass: `readme/macos-setup.md`.

## CI

GitHub Actions CI enabled. Confirm green before pushing to `main`.
