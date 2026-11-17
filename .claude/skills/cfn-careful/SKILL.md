---
name: cfn-careful
description: "PreToolUse hook. Warns before destructive bash commands (rm -rf, DROP TABLE, git push --force, etc). Judges every rm by its target: temp, zone, rebuildable and git-restorable deletes pass, unsaved work goes to the trash (never a prompt), home/system/repo roots, credentials and unresolvable paths are blocked."
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
The guard never asks (2026-11-17: 173 prompts in 4 days, 168 approved by hand).
- **Allowed silently:** temp areas (`/tmp`, `/private/tmp`, `/var/folders`,
  `$TMPDIR`), allow zones from `.claude/cfn-config/careful-zones.json`
  (`~/.claude-tmp`, `/mnt/wsl/churn`, `/mnt/wsl/build`, tool-results, Windows
  temp), rebuildable folders (node_modules, .venv, .next, dist, build, .build,
  .turbo, coverage, DerivedData, caches), files git can restore (tracked and
  unchanged), paths that do not exist.
- **Moved to the trash:** untracked, modified or ignored files in a project,
  and user data outside any project. The hook allows the call and rewrites
  the rm (PreToolUse `updatedInput`) to
  `bash "$HOME/.claude/cfn-scripts/cfn-trash.sh" <same flags> <same args>`.
  Trash: `~/.local/share/cfn-trash/<date>/` (or `<mount>/.cfn-trash-<uid>` for
  a target on another drive, so nothing big is copied), with a
  `manifest.jsonl` per day; entries older than 7 days are reaped on each run.
  The rewrite only happens when the command is nothing but rm, cd and
  `VAR=value`; otherwise (or when rtk-rewrite.sh would also rewrite it) the
  rm is blocked with "run it as its own command".
- **Blocked:** `/`, top-level and system folders, `$HOME` and its main
  folders, a whole repo, `.git`, a mount point, the working directory or any
  parent of it, credentials (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `~/.ssh`,
  `~/.aws`, `~/.config/gh`), the config's `protected` and `deny_exact` lists,
  and any target it cannot resolve (unknown variable, `$(...)`), with
  guidance to spell the path out.

A trash rewrite is held until the other rules run, so a deny elsewhere in the
same command still wins. Fleet workers get a deny with guidance instead of a
trash rewrite. Without python3 the old flag-and-whitelist rule applies.
Generic build-output names (`build`, `.build`, `dist`, `target`) count as
rebuildable only below a repo's top folder; outside a project they go to the
trash. Every zone allow, trash and deny is logged to
`~/.claude/cfn-data/careful-audit.jsonl` (gitignored).

**Extra scratch roots (machine-local).** List glob patterns, one per line, in
`~/.config/cfn/careful-scratch-roots` (`#` comments allowed), or set
`CFN_CAREFUL_SCRATCH_ROOTS` (colon list). Each pattern expands to existing
folders. A path strictly inside one passes like temp. The folder itself, its
parents and its siblings keep the normal verdict, and a whole repo is still
blocked. A match that is `/`, a top-level or system folder, or `$HOME` or one
of its main folders is ignored. Example line: `/mnt/wsl/churn/art/trials/*`
lets art lanes delete anything inside `trials/<trial>/` without asking.

Tests: `tests/test-careful-guard-rm.sh`. For tests only: `CFN_CAREFUL_TEMP_ROOTS`
(colon list) overrides the temp roots, `CFN_CAREFUL_ZONES_FILE` the zone
config, `CFN_CAREFUL_AUDIT_FILE` the audit log, `CFN_TRASH_ROOT` the trash.

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
