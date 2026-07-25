## Code Search

**STOP. Before using grep, glob, find, or any file search — query CodeSearch first.**
Run `/codebase-search "your query"` for instant semantic results (400x faster than grep).
Only fall back to grep if CodeSearch returns zero results.

---

# CFN Development Project

This project is the source of truth for CFN infrastructure. `~/.claude/` dirs are reverse-symlinked back here so all projects share the same files.

## Reverse Symlinks (`~/.claude/` → project)

Each `~/.claude/<dir>/` is a reverse symlink to `.claude/<dir>/` in this project, so all projects share one source. Symlinked dirs: `skills/`, `hooks/`, `commands/`, `agents/cfn-dev-team/`, `core/`, `helpers/`, `cfn-config/`, `cfn-data/`, `cfn-extras/`, `cfn-scripts/`, `adaptive-context/`, `agent-principles/`, `prompts/`, `tooling/`.

### Project-Local (not symlinked)

| Path | Purpose |
|------|---------|
| `.claude/agents/custom/` | Project-specific agents |
| `.claude/agents/project-only-agents/` | Project-specific agents |
| `.claude/backups/` | Local edit backups |
| `.claude/settings.json` | Project Z.ai config + project-only hooks |

### Editing CFN Files

Edit files directly in this project — changes propagate to all projects via reverse symlinks. Both paths resolve to the same files:
- `.claude/skills/cfn-parallel-execute/execute.sh` (project source)
- `~/.claude/skills/cfn-parallel-execute/execute.sh` (via reverse symlink)

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
