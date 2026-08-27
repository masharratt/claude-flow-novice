# AGENTS.md — rules for Codex working in this repo

This repo is the CFN infrastructure source of truth. `~/.claude/*` dirs are reverse-symlinked
here: edits to `.claude/**` propagate to every project on this machine. Edit with care.

## Edit safety (REQUIRED, every edit)

```bash
~/.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id codex
# ... edit ...
~/.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id codex
```

Rollback = restore from the backup path the pre-edit script returns or `.claude/backups/`.
Never use `git checkout` / `git restore` to undo an edit.

## Hard rules

- No em dashes in copy, comments, or code. Use periods, commas, colons, parentheses.
- No stubs in finished code. A deferred stub needs a `cfn: <ceiling>, <upgrade trigger>` marker.
- Stage explicit paths only, never `git add -A` (foreign edits arrive via symlinks).
- Commit only when the task prompt says to. Never push.
- Never source `.env`. Extract vars singly (`grep '^VAR=' .env | cut -d'=' -f2-`). Redact secrets as `[REDACTED]`.
- Shell is bash on WSL2 (GNU userland). Invoke helper scripts via `$HOME/.claude/...`, never cwd-relative.
- Temp files go in `/tmp/`, never project root.

## Test output capture

```bash
OUT=/tmp/test-${PWD##*/}-$(date +%s).txt
<test-cmd> 2>&1 | tee "$OUT"
```

No watch mode, no bail flags. Read the file for full errors before reporting results.

## Docs on commit

Commits that change features must update `readme/feature-status.md` (status vocabulary:
`prod | beta | dev | stub | deprecated`, one token per cell) and `readme/state-machines.md`
when stateful entities change. Enforcer: `.claude/skills/cfn-doc-lint/execute.sh`.
