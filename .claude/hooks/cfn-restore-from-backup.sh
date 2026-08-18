#!/usr/bin/env bash
# cfn-selftest: not-a-hook manually-invoked CLI, never fires on an event
# Restore File from Backup
#
# Thin wrapper around the single restore implementation:
#   .claude/skills/cfn-edit-safety/lib/backup/restore.sh
#
# restore.sh owns every decision about which backup is newest: the current
# convention (<project-root>/.backups/<agent-id>/<ts>_<hash>/original), the
# legacy convention (<file>.backup-<ts> siblings written by the deprecated
# .claude/hooks/deprecated/cfn-pre-edit-backup.sh), the multi-root ancestor
# search (backup.sh's project root is fixed at BACKUP time, not necessarily
# the cwd at RESTORE time), and path normalization. See restore.sh's own
# header comment for the full rules. This wrapper used to duplicate all of
# that logic itself -- two independent "which backup is newest" answers is
# exactly the class of bug this merge exists to remove.
#
# This wrapper exists ONLY to preserve, for existing callers:
#   - the FILE_PATH-only CLI documented in ~/.claude/CLAUDE.md and
#     agent-prelude.md ("BACKUP_PATH=... ; ... ; cfn-restore-from-backup.sh
#     $FILE"), and referenced by name in docs/SKILLS_HOOKS_INTEGRATION.md
#   - the exact stdout/stderr strings tests/test-edit-safety-roundtrip.sh
#     was written against: the "Restoring ... from ..." line, the
#     "Restored N lines" line, and the "No backup found" error with its two
#     "Searched:" continuation lines
#   - the Redis restore log entry
#
# Pre-restore safety copy: this wrapper takes TWO independent copies of the
# current file before overwriting it, because the two merged implementations
# did this differently and neither behavior can be safely dropped:
#   1. a sibling "<file>.pre-restore-<ts>" (this wrapper's own historical
#      behavior -- something downstream may already depend on that exact
#      sibling naming)
#   2. a proper backup.sh backup under .backups/restore-safety/, taken by
#      restore.sh itself as part of every restore it performs
# Both are best-effort; neither blocks the restore if it fails.

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

if [ $# -lt 1 ]; then
  echo "Usage: $0 FILE_PATH"
  echo "Restores FILE_PATH from its most recent backup"
  exit 1
fi

FILE_PATH="$1"

HOOK_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
RESTORE_SH="$HOOK_DIR/../skills/cfn-edit-safety/lib/backup/restore.sh"

# --- path normalisation (message text only -- restore.sh normalizes its own
# comparisons independently) -------------------------------------------------
abspath() {
  local p="$1"
  case "$p" in
    /*) ;;
     *) p="$PWD/$p" ;;
  esac
  if command -v realpath >/dev/null 2>&1; then
    realpath -m -- "$p" 2>/dev/null || printf '%s' "$p"
  else
    printf '%s' "$p"
  fi
}

TARGET_ABS="$(abspath "$FILE_PATH")"

# --- ask restore.sh which backup is newest, without restoring yet ----------
# restore.sh --list already returns candidates newest-first across both
# conventions and every searched root; take the top line as the answer to
# "which backup would a restore use".
# stdout and stderr MUST stay separate here. TOP_LINE below is parsed as the
# winning backup, so folding stderr in with 2>&1 would let any warning
# restore.sh writes become the "newest backup" and get restored from. That is
# the same stdout/stderr merge that broke BACKUP_PATH capture in
# cfn-invoke-pre-edit.sh (see its comment at the backup.sh invocation); do not
# collapse these streams back together.
LIST_ERR="$(mktemp)"
trap 'rm -f "$LIST_ERR"' EXIT
LIST_OUT=""
LIST_RC=0
LIST_OUT=$("$RESTORE_SH" --list "$TARGET_ABS" 2>"$LIST_ERR") || LIST_RC=$?

if [ "$LIST_RC" -eq 2 ]; then
  echo "❌ No backup found for $FILE_PATH" >&2
  echo "   Searched: <project-root>/.backups/<agent-id>/<ts>_<hash>/original" >&2
  echo "             ${TARGET_ABS}.backup-<ts>" >&2
  exit 1
fi

if [ "$LIST_RC" -ne 0 ]; then
  echo "❌ Failed to search for a backup of $FILE_PATH: $(cat "$LIST_ERR")" >&2
  exit 1
fi

TOP_LINE="$(printf '%s\n' "$LIST_OUT" | head -1)"
LATEST_ID="$(printf '%s' "$TOP_LINE" | cut -f1)"
LATEST_BACKUP="$(printf '%s\n' "$TOP_LINE" | grep -oE 'path=.*' | sed 's/^path=//')"

case "$TOP_LINE" in
  *"$(printf '\t')legacy$(printf '\t')"*)
    LATEST_KIND="legacy"
    LATEST_TS="${LATEST_ID##*.backup-}"
    ;;
  *)
    LATEST_KIND="current"
    LATEST_TS="${LATEST_ID%%_*}"
    ;;
esac
case "$LATEST_TS" in
  ''|*[!0-9]*) LATEST_TS=0 ;;
esac

echo "Restoring $FILE_PATH from $LATEST_BACKUP (${LATEST_KIND} convention, ts=${LATEST_TS})"

# Create pre-restore backup of current state so the restore itself is
# reversible (this wrapper's own sibling copy -- see header comment).
TIMESTAMP=$(date +%s)
if [ -f "$TARGET_ABS" ]; then
  cp "$TARGET_ABS" "${TARGET_ABS}.pre-restore-${TIMESTAMP}" 2>/dev/null || true
fi

# --- delegate the actual restore to restore.sh ------------------------------
# restore.sh re-finds the same newest candidate (deterministic given no
# concurrent writes) and takes its own safety backup under
# .backups/restore-safety/ before overwriting the target. Its own progress
# text goes to stderr and is discarded here in favor of this wrapper's own
# contract; only a failure is surfaced.
RESTORE_ERR=""
if ! RESTORE_ERR=$("$RESTORE_SH" --file "$TARGET_ABS" 2>&1 >/dev/null); then
  echo "❌ Restore failed for $FILE_PATH: $RESTORE_ERR" >&2
  exit 1
fi

RESTORED_LINES=$(wc -l < "$TARGET_ABS")
echo "✅ Restored $RESTORED_LINES lines"

# Log restoration
redis-cli LPUSH "restore:log" "{\"timestamp\":$TIMESTAMP,\"file\":\"$TARGET_ABS\",\"backup\":\"$LATEST_BACKUP\",\"convention\":\"$LATEST_KIND\",\"lines\":$RESTORED_LINES}" >/dev/null 2>&1 || true
