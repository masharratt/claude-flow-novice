#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit) hook: back up the file before
# Claude changes it, so a bad edit can be rolled back without git.
#
# Adapter only. cfn-invoke-pre-edit.sh takes positional args, not the stdin
# JSON a hook receives; this reads the payload and calls it. Backups land in
# <repo>/.backups/claude-<session_id>/ (restore with cfn-restore-from-backup.sh,
# reclaim space with skills/cfn-edit-safety/lib/backup/cleanup.sh).
#
# Skips new files (nothing to save) and files outside a git repo. Adds
# .backups/ to the repo's .git/info/exclude when nothing ignores it yet, so
# backups are never committed and no tracked file changes.
#
# Never blocks: every path exits 0. A failed backup must not stop an edit.
# Tests: tests/test-pre-edit-backup-hook.sh
# cfn: one full copy per edit, no dedupe; add hash-dedupe if .backups grows
# past cleanup.sh's weekly pass.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD=$(timeout 2 cat 2>/dev/null || true)

read -r FILE SESSION < <(printf '%s' "$PAYLOAD" | python3 -I -c '
import json, sys
try:
    p = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = p.get("tool_input") or {}
f = ti.get("file_path") or ti.get("notebook_path") or ""
print(f.replace(" ", "\\x20") or "-", p.get("session_id") or "unknown")
' 2>/dev/null) || exit 0

[ -z "${FILE:-}" ] || [ "$FILE" = "-" ] && exit 0
FILE=${FILE//\\x20/ }
[ -f "$FILE" ] || exit 0

ROOT=$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null) || exit 0

if ! git -C "$ROOT" check-ignore -q .backups/probe 2>/dev/null; then
    EXCLUDE="$(git -C "$ROOT" rev-parse --git-path info/exclude 2>/dev/null)"
    case "$EXCLUDE" in /*) ;; *) EXCLUDE="$ROOT/$EXCLUDE" ;; esac
    mkdir -p "$(dirname "$EXCLUDE")" 2>/dev/null && printf '.backups/\n' >> "$EXCLUDE" 2>/dev/null
fi

(cd "$ROOT" && timeout 5 "$HOOK_DIR/cfn-invoke-pre-edit.sh" "$FILE" --agent-id "claude-$SESSION") >/dev/null 2>&1 || true
exit 0
