# CFN Operating Guide

## Docs

| Topic | Path |
|-------|------|
| CLI Mode | `docs/CFN_LOOP_CLI_MODE.md` |
| Tests | `tests/CLAUDE.md` |
| Skills | `.claude/skills/CLAUDE.md` |
| Coordination | `.claude/CLAUDE.md` |
| Architecture | `cfn-system-expert.md` |

## Style

Speak plainly, no fluff. Bullets > prose. Cite paths with line numbers (`src/app.ts:42`). Redact secrets as `[REDACTED]`. Avoid exaggeration, 'you're right', and self-congratulatory language. Do not give code examples unless specifically asked

## Rules

- **CodeSearch FIRST (MANDATORY):** Query `~/.local/share/codesearch/index_v2.db` via SQL or `.claude/skills/cfn-codesearch/` BEFORE grep/glob/find/search. SQL queries are 400x faster. Use grep ONLY for non-indexed projects or literal strings. Failure to use CodeSearch first is a protocol violation.
- **Agent usage:** Non-trivial tasks → CFN Loop. Solo work only for simple, isolated, <3 step tasks.
- **Batching:** One message per type (spawns, edits, shell, todos). Never mix implementers + validators.
- **Tests:** Coordinator only, sync execution. Never `run_in_background: true`. Agents read results.
- **Files:** Subdirs only, never project root. Temp files → `/tmp/`.
- **Secrets:** Never hardcode. Always redact.

## Edit Workflow

```bash
# Before ANY edit:
./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id "$ID"

# After edit:
./.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id "$ID"

# Revert (not git checkout):
./.claude/skills/pre-edit-backup/revert-file.sh "$FILE" --agent-id "$ID"
```

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
| Backlog | `.claude/skills/cfn-backlog-management/add-backlog-item.sh` |
| Changelog | `.claude/skills/cfn-changelog-management/add-changelog-entry.sh` |

## Key Files

| Purpose | Path |
|---------|------|
| Pre-edit hook | `.claude/hooks/cfn-invoke-pre-edit.sh` |
| Post-edit hook | `.claude/hooks/cfn-invoke-post-edit.sh` |
| Backup revert | `.claude/skills/pre-edit-backup/revert-file.sh` |
| CodeSearch skill | `.claude/skills/cfn-codesearch/SKILL.md` |

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

## WSL2 Port Forwarding

WSL2 `localhostForwarding` is unreliable. Use `netsh portproxy` to access dev servers from Windows:

```bash
# Get WSL IP
hostname -I | awk '{print $1}'
```

```cmd
# Add portproxy (elevated CMD/PowerShell) - replace PORT and WSL_IP
netsh interface portproxy add v4tov4 listenport=PORT listenaddress=127.0.0.1 connectport=PORT connectaddress=WSL_IP

# Verify
netsh interface portproxy show all

# Remove when done
netsh interface portproxy delete v4tov4 listenport=PORT listenaddress=127.0.0.1
```

**Note:** WSL IP changes on restart. Re-run with new IP if connection breaks.
