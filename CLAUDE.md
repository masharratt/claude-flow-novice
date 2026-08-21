## Code Search

**STOP. Before using grep, glob, find, or any file search — query CodeSearch first.**
Run `/codebase-search "your query"` for instant semantic results (400x faster than grep).
Only fall back to grep if CodeSearch returns zero results.

---

# CFN Development Project

This project is the source of truth for CFN infrastructure. `~/.claude/` dirs are reverse-symlinked back here so all projects share the same files.

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

Edit them here. They were untracked local files until 2026-08-18, which meant a clone
gave you the tooling but none of the rules it runs on.

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

Edit files directly in this project — changes propagate to all projects via reverse symlinks. Both paths resolve to the same files:
- `.claude/skills/cfn-alpha-launch/execute.sh` (project source)
- `~/.claude/skills/cfn-alpha-launch/execute.sh` (via reverse symlink)

### Z.ai Configuration

Z.ai settings are per-project in `.claude/settings.json` `env` section. Each project chooses its own API provider independently.

## Docs

| Topic | Path |
|-------|------|
| CLI Mode | `docs/CFN_LOOP_CLI_MODE.md` |
| Tests | `tests/CLAUDE.md` |
| Skills | `.claude/skills/CLAUDE.md` |
| Coordination | `.claude/CLAUDE.md` |
| Architecture | `cfn-system-expert.md` |

## Style

Speak plainly, no fluff. Bullets > prose. Cite paths with line numbers (`src/app.ts:42`). Redact secrets as `[REDACTED]`. Avoid exaggeration, 'you're right', and self-congratulatory language. Do not give code examples unless specifically asked.

## Output Locations

| Type | Path |
|------|------|
| Bugs | `docs/BUG_#_*.md` |
| Tests | `tests/test-*.sh` |
| Features | `docs/FEATURE_*.md` |
| Temp | `/tmp/` only |

## WSL Memory Monitor

Background process kills test runner memory leaks. Runs on session start.
- `>10%` memory (node test processes only) → killed
- Parent with test children totaling `>15%` combined → test children killed
- Targets: node processes running vitest, jest, mocha, ava, tap, playwright, cypress
- Never kills: bash, sh, zsh (even if running tests)
- Status: `~/.local/bin/wsl-memory-monitor.sh --status`
- Log: `/tmp/wsl-memory-monitor.log`

WSL2 only. Not present on macOS.

## Platform

CFN is developed on WSL2 and assumes a GNU userland (bash 4+, GNU coreutils/sed/grep).
Setting up on macOS needs a documented porting pass: `readme/macos-setup.md`.

## CI

GitHub Actions CI enabled. Confirm green before pushing to `main`.
