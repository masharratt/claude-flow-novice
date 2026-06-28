---
name: cfn-careful
description: "PreToolUse hook. Warns before destructive bash commands (rm -rf, DROP TABLE, git push --force, etc). Activates via /careful. Whitelists safe deletions (node_modules, .next, dist)."
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

## Whitelisted Safe Deletions
These directories are safely regenerated and do not contain user data:
- node_modules, .next, dist, __pycache__, .cache, .turbo
- *.pyc, *.o, .DS_Store
- Build artifacts in /tmp/

## How It Works
PreToolUse hook on Bash tool. Parses command from stdin JSON, checks against dangerous patterns. Returns exit 2 (block) with warning message if matched, exit 0 (allow) otherwise.

## Activation
The hook is registered in settings.json and always active. No /careful command needed to activate.
