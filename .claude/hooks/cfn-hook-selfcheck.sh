#!/usr/bin/env bash
# cfn-hook-selfcheck — SessionStart hook.
#
# Purpose: the dead ~/.claude/settings.local.json incident (inert from at
# least 2026-07-24 to 2026-09-03) failed silently for six weeks because
# nothing asserted hooks were actually loaded. This hook is the tripwire:
# it appends one line per session start to ~/.claude/hook-selfcheck.log.
# If that log has no entry for a project on a day you used it, that
# project's hook wiring is dead — check WHICH settings file the hooks are
# wired in before debugging any hook script (user-level settings.local.json
# is never read by Claude Code).
#
# Never blocks, never writes stderr (SessionStart stderr is user-visible
# noise). Fails open: a broken logger must not break the session.
set -uo pipefail

LOG="$HOME/.claude/hook-selfcheck.log"

printf '%s\t%s\n' "$(date -Is)" "${CLAUDE_PROJECT_DIR:-unknown}" >> "$LOG" 2>/dev/null || true

# cfn: unbounded append log; trim to last 1000 lines past 2000 (upgrade: size-based rotation)
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 2000 ]; then
  tail -1000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" || true
fi

exit 0
