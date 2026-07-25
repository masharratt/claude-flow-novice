#!/bin/bash
# cfn-selftest: not-a-hook manually-invoked CLI, never fires on an event
# Restore File from Backup
# Restores a file from its most recent backup, across every backup convention
# this repo has ever written.
#
# Conventions understood (newest wins across all of them):
#
#   1. current  <project-root>/.backups/<agent-id>/<unix-ts>_<md5>/original
#               written by .claude/skills/cfn-edit-safety/lib/backup/backup.sh
#               via .claude/hooks/cfn-invoke-pre-edit.sh. The backup directory
#               name does not contain the source filename, so the owning file is
#               read from the sibling metadata.json "original_file" field.
#
#   2. legacy   <file>.backup-<unix-ts>
#               written by the deprecated .claude/hooks/deprecated/
#               cfn-pre-edit-backup.sh. Real backups in this format are still on
#               disk and are still the rollback safety net for those files, so
#               they stay supported.
#
# This script previously understood convention 2 only, which meant nothing the
# current pre-edit hook wrote could ever be found: rollback was broken end to
# end. It also discovered backups with `LATEST=$(ls -t $PATTERN | head -1)`,
# whose nonzero exit under `set -euo pipefail` aborted the script at that line,
# so the "No backup found" branch below was unreachable and a missing backup
# exited 2 with no output at all.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 FILE_PATH"
  echo "Restores FILE_PATH from its most recent backup"
  exit 1
fi

FILE_PATH="$1"

# --- path normalisation ---------------------------------------------------
# Backups record whatever path string the caller used. Compare normalised
# absolute paths so a backup taken via a relative path is still found later.
abspath() {
  local p="$1"
  case "$p" in
    /*) ;;
     *) p="$PWD/$p" ;;
  esac
  if command -v realpath >/dev/null 2>&1; then
    realpath -m "$p" 2>/dev/null || printf '%s' "$p"
  else
    printf '%s' "$p"
  fi
}

TARGET_ABS="$(abspath "$FILE_PATH")"
TARGET_DIR="$(dirname "$TARGET_ABS")"

# --- candidate roots holding a .backups/ tree -----------------------------
# backup.sh defaults its project root to $(pwd) at BACKUP time, which is not
# necessarily the cwd at RESTORE time. Search the current directory, the git
# top level, and every ancestor of the target file.
collect_roots() {
  printf '%s\n' "$PWD"
  git -C "$TARGET_DIR" rev-parse --show-toplevel 2>/dev/null || true
  local d="$TARGET_DIR"
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    printf '%s\n' "$d"
    d="$(dirname "$d")"
  done
  printf '/\n'
}

# --- candidate collection -------------------------------------------------
# Each candidate is "<unix-ts>\t<kind>\t<path-to-restore-from>".
CANDIDATES=""

add_candidate() {
  CANDIDATES="${CANDIDATES}${1}	${2}	${3}
"
}

# Convention 1: <root>/.backups/<agent-id>/<ts>_<hash>/{original,metadata.json}
while IFS= read -r root; do
  [ -n "$root" ] || continue
  [ -d "$root/.backups" ] || continue
  for meta in "$root"/.backups/*/*/metadata.json; do
    [ -f "$meta" ] || continue
    backup_dir="$(dirname "$meta")"
    [ -f "$backup_dir/original" ] || continue

    recorded=$(sed -n 's/^[[:space:]]*"original_file"[[:space:]]*:[[:space:]]*"\(.*\)",[[:space:]]*$/\1/p' "$meta" | head -1)
    [ -n "$recorded" ] || continue
    [ "$(abspath "$recorded")" = "$TARGET_ABS" ] || continue

    # Timestamp is the directory-name prefix (<ts>_<md5>), with metadata as a
    # fallback for any backup whose directory was renamed.
    ts="${backup_dir##*/}"
    ts="${ts%%_*}"
    case "$ts" in
      ''|*[!0-9]*)
        ts=$(sed -n 's/^[[:space:]]*"timestamp"[[:space:]]*:[[:space:]]*"\{0,1\}\([0-9]*\)"\{0,1\},[[:space:]]*$/\1/p' "$meta" | head -1)
        ;;
    esac
    case "$ts" in
      ''|*[!0-9]*) ts=0 ;;
    esac

    add_candidate "$ts" "current" "$backup_dir/original"
  done
done < <(collect_roots | awk 'NF && !seen[$0]++')

# Convention 2: <file>.backup-<ts> siblings
for legacy in "$TARGET_ABS".backup-*; do
  [ -f "$legacy" ] || continue
  ts="${legacy##*.backup-}"
  case "$ts" in
    ''|*[!0-9]*) ts=0 ;;   # e.g. .backup-phase1: keep it, but never outrank a real timestamp
  esac
  add_candidate "$ts" "legacy" "$legacy"
done

# --- pick the most recent -------------------------------------------------
LATEST_LINE=$(printf '%s' "$CANDIDATES" | awk 'NF' | sort -t'	' -k1,1nr | head -1)

if [ -z "$LATEST_LINE" ]; then
  echo "❌ No backup found for $FILE_PATH" >&2
  echo "   Searched: <project-root>/.backups/<agent-id>/<ts>_<hash>/original" >&2
  echo "             ${TARGET_ABS}.backup-<ts>" >&2
  exit 1
fi

LATEST_TS=$(printf '%s' "$LATEST_LINE" | cut -f1)
LATEST_KIND=$(printf '%s' "$LATEST_LINE" | cut -f2)
LATEST_BACKUP=$(printf '%s' "$LATEST_LINE" | cut -f3-)

echo "Restoring $FILE_PATH from $LATEST_BACKUP (${LATEST_KIND} convention, ts=${LATEST_TS})"

# Create pre-restore backup of current state so the restore itself is reversible
TIMESTAMP=$(date +%s)
if [ -f "$TARGET_ABS" ]; then
  cp "$TARGET_ABS" "${TARGET_ABS}.pre-restore-${TIMESTAMP}" 2>/dev/null || true
fi

# Restore from backup
mkdir -p "$TARGET_DIR"
cp "$LATEST_BACKUP" "$TARGET_ABS"

RESTORED_LINES=$(wc -l < "$TARGET_ABS")
echo "✅ Restored $RESTORED_LINES lines"

# Log restoration
redis-cli LPUSH "restore:log" "{\"timestamp\":$TIMESTAMP,\"file\":\"$TARGET_ABS\",\"backup\":\"$LATEST_BACKUP\",\"convention\":\"$LATEST_KIND\",\"lines\":$RESTORED_LINES}" >/dev/null 2>&1 || true
