---
name: cfn-careful
description: "PreToolUse hook. Warns before destructive bash commands (rm -rf, DROP TABLE, git push --force, etc). Judges every rm by its target: temp, rebuildable and git-restorable deletes pass, unsaved work asks, home/system/repo roots are blocked."
version: 1.0.0
tags: [safety, guardrails, hooks, destructive-commands]
status: production
---

# CFN Careful

**Purpose:** Prevent accidental destructive operations by intercepting dangerous bash commands before execution.

## Dangerous Patterns Detected

### File Operations
- `rm -rf` / `rm -r` (except whitelisted dirs)
- `dd if=/dev/zero`

### Database
- `DROP TABLE`
- `DROP DATABASE`
- `TRUNCATE`

### Git
- `git push --force` / `git push -f`
- `git reset --hard`
- `git checkout -- .` / `git checkout .`
- `git clean -f`

### Container/Orchestration
- `kubectl delete`
- `docker system prune`
- `docker rm -f`

## Deletes Are Judged by Target (`lib/rm-target-check.py`)
Every `rm` (any flags) is resolved to real paths, following `VAR=value` and
`cd` earlier in the same command, then sorted:
- **Allowed silently:** temp areas (`/tmp`, `/private/tmp`, `/var/folders`,
  `$TMPDIR`), rebuildable folders (node_modules, .next, dist, build, .build,
  .turbo, coverage, DerivedData, caches), files git can restore (tracked and
  unchanged), paths that do not exist.
- **Asks the user** (PreToolUse `permissionDecision: ask`): untracked or
  modified files, ignored files such as `.env`, anything outside a repo and
  outside temp, and any target it cannot resolve (unknown variable, `$(...)`).
- **Blocked:** `/`, top-level and system folders, `$HOME` and its main
  folders, a whole repo, `.git`, the working directory or any parent of it.

An ask is held until the other rules run, so a deny elsewhere in the same
command still wins. Without python3 the old flag-and-whitelist rule applies.
Tests: `tests/test-careful-guard-rm.sh`. `CFN_CAREFUL_TEMP_ROOTS`
(colon list) overrides the temp roots, for tests only.

## How It Works
PreToolUse hook on Bash tool. Parses command from stdin JSON, checks against dangerous patterns. Returns exit 2 (block) with warning message if matched, exit 0 (allow) otherwise.

## Activation
Active only when registered as a Bash PreToolUse hook in `~/.claude/settings.json`
(`bash $HOME/.claude/hooks/cfn-careful-guard.sh`). The symlinked hooks folder does
not register it; a machine without that entry runs unguarded.
`tests/test-hook-security.sh` reports "NOT registered" when it is missing.

## The guard scans the whole command string, heredoc body included

`cfn-careful-guard.sh` has no notion of quoted or heredoc content, so it cannot tell prose
from a command. A `cat > file <<'EOF'` writing documentation that contains a push command, or
even the words "force push", is blocked with `BLOCKED: Force push detected` while nothing is
pushed. Observed 2026-09-08 writing a planning doc.

**Switch tools, do not reword.** Write files whose content discusses git pushes, deletes or
DROP statements with the Write and Edit tools. Retrying the heredoc with softer wording is
the wrong response.

The same guard also reports `git push --no-verify` as "Force push detected". Where a
recorded hook-bypass rule genuinely applies, use
`git -c core.hooksPath=/dev/null push origin <branch>` instead, and disclose the bypass in
the reply.
