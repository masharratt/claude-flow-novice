# CFN Operating Guide

## Project Structure

This is the CFN development project. **This project is the source of truth** for CFN infrastructure. `~/.claude/` dirs are reverse-symlinked back here so all projects share the same files.

### Reverse Symlinks (`~/.claude/` → project)

| `~/.claude/` Symlink | Points To (project source) | Purpose |
|-----------------------|---------------------------|---------|
| `~/.claude/skills/` | `.claude/skills/` | All CFN skills (universal) |
| `~/.claude/hooks/` | `.claude/hooks/` | All CFN hooks (universal) |
| `~/.claude/commands/` | `.claude/commands/` | All CFN commands (universal) |
| `~/.claude/agents/cfn-dev-team/` | `.claude/agents/cfn-dev-team/` | CFN agent profiles (universal) |
| `~/.claude/core/` | `.claude/core/` | Core libraries (universal) |
| `~/.claude/helpers/` | `.claude/helpers/` | Helper scripts (universal) |
| `~/.claude/cfn-config/` | `.claude/cfn-config/` | CFN configuration (universal) |
| `~/.claude/cfn-data/` | `.claude/cfn-data/` | CFN data files (universal) |
| `~/.claude/cfn-extras/` | `.claude/cfn-extras/` | CFN extras (universal) |
| `~/.claude/cfn-scripts/` | `.claude/cfn-scripts/` | CFN scripts (universal) |
| `~/.claude/adaptive-context/` | `.claude/adaptive-context/` | Adaptive context (universal) |
| `~/.claude/agent-principles/` | `.claude/agent-principles/` | Agent principles (universal) |
| `~/.claude/prompts/` | `.claude/prompts/` | Prompts (universal) |
| `~/.claude/tooling/` | `.claude/tooling/` | Tooling (universal) |

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

## Rules

- **CodeSearch FIRST (MANDATORY):** Query `~/.local/share/codesearch/index_v2.db` via SQL or `~/.claude/skills/cfn-codesearch/` BEFORE grep/glob/find/search. SQL queries are 400x faster. Use grep ONLY for non-indexed projects or literal strings.
- **Agent usage:** Non-trivial tasks → CFN Loop. Solo work only for simple, isolated, <3 step tasks.
- **Batching:** One message per type (spawns, edits, shell, todos). Never mix implementers + validators.
- **Tests:** Coordinator only, sync execution. Never `run_in_background: true`. Agents read results.
- **Files:** Subdirs only, never project root. Temp files → `/tmp/`.
- **Secrets:** Never hardcode. Always redact.

## Task Mode

**Command:** `/cfn-loop-task "description" --mode=standard`

1. Parse command, validate params
2. Spawn agents with context + success criteria
3. Agents execute, return results (no Redis)
4. Iterate on validator/PO feedback

**CLI Mode:** See `docs/CFN_LOOP_CLI_MODE.md`

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

## Security

- Validate inputs: type, size, permissions
- Redact: credentials, tokens, PII → `[REDACTED]`
- Incidents: capture command, commit, env, logs
- Rollback: use backup scripts, not `git checkout`
