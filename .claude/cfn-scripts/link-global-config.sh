#!/usr/bin/env bash
# Link the global CFN config layer into ~/.claude/.
#
# ~/.claude/CLAUDE.md and its supporting files used to be untracked local files.
# They were the operating guide every agent runs on, and they existed on exactly
# one machine: a clone of this repo gave you the tooling but none of the rules.
# They now live in .claude/global/ and are symlinked back into ~/.claude/, the
# same reverse-symlink pattern skills/, hooks/ and commands/ already use.
#
# Idempotent. Re-running is a no-op. Anything real it would overwrite is moved
# aside to a timestamped backup first, never deleted.
#
# The runtime directories (~/.claude/skills, hooks, commands, ...) are the other
# half of the same story and were missing for the same reason. They live in
# link-runtime-dirs.sh, which this script delegates to so a fresh clone is one
# command, not two. Flags pass straight through.
#
# Usage:
#   .claude/cfn-scripts/link-global-config.sh            # link
#   .claude/cfn-scripts/link-global-config.sh --check    # verify only, no writes
#   .claude/cfn-scripts/link-global-config.sh --force    # runtime dirs: replace populated real dirs
set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
SRC="$REPO/.claude/global"
DEST="$HOME/.claude"

# Entries linked into ~/.claude/. Files and directories both.
ENTRIES=(
  CLAUDE.md
  RTK.md
  model-pricing.md
  rules
  references
)

CHECK_ONLY=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --force) FORCE=1 ;;
    *) echo "FAIL: unknown argument '$arg' (want --check or --force)" >&2; exit 2 ;;
  esac
done

[ -d "$SRC" ]  || { echo "FAIL: $SRC not found. Wrong repo?" >&2; exit 1; }
[ -d "$DEST" ] || { echo "FAIL: $DEST not found. Install Claude Code first." >&2; exit 1; }

BACKUP="$HOME/.claude-global-config-backup-$(date +%Y%m%d-%H%M%S)"
FAIL=0
LINKED=0
ALREADY=0
DID_BACKUP=0

for name in "${ENTRIES[@]}"; do
  target="$SRC/$name"
  link="$DEST/$name"

  if [ ! -e "$target" ]; then
    echo "FAIL: $name missing from .claude/global/" >&2
    FAIL=1
    continue
  fi

  # Already pointing at the right place.
  if [ -L "$link" ] && [ "$(readlink -f "$link")" = "$(readlink -f "$target")" ]; then
    printf '  ok       %s\n' "$name"
    ALREADY=$((ALREADY + 1))
    continue
  fi

  if [ "$CHECK_ONLY" -eq 1 ]; then
    if [ -e "$link" ]; then
      printf '  UNLINKED %s (real file/dir, would be backed up and replaced)\n' "$name"
    else
      printf '  MISSING  %s (would be created)\n' "$name"
    fi
    FAIL=1
    continue
  fi

  # A real file, a real directory, or a symlink pointing somewhere else.
  # Move it aside rather than delete it: it may be the only copy on this machine.
  if [ -e "$link" ] || [ -L "$link" ]; then
    mkdir -p "$BACKUP"
    mv "$link" "$BACKUP/$name"
    DID_BACKUP=1
    printf '  backed up %s -> %s/%s\n' "$name" "$BACKUP" "$name"
  fi

  ln -s "$target" "$link"
  printf '  linked   %s -> %s\n' "$name" "$target"
  LINKED=$((LINKED + 1))
done

RUNTIME_LINKER="$REPO/.claude/cfn-scripts/link-runtime-dirs.sh"

# Hand off to the runtime-dirs half. Its exit code folds into ours so a caller
# (CI, readme/macos-setup.md) only has to check one.
run_runtime_linker() {
  [ -x "$RUNTIME_LINKER" ] || { echo "FAIL: $RUNTIME_LINKER missing or not executable" >&2; return 1; }
  echo
  echo "runtime dirs (~/.claude/skills, hooks, commands, ...):"
  local args=()
  [ "$CHECK_ONLY" -eq 1 ] && args+=(--check)
  [ "$FORCE" -eq 1 ] && args+=(--force)
  "$RUNTIME_LINKER" ${args[@]+"${args[@]}"}
}

echo "---"
if [ "$CHECK_ONLY" -eq 1 ]; then
  if [ "$FAIL" -eq 0 ]; then
    echo "global config: OK ($ALREADY of ${#ENTRIES[@]} linked)"
  else
    echo "global config: NOT LINKED. Run without --check to fix." >&2
  fi
  run_runtime_linker || FAIL=1
  exit "$FAIL"
fi

[ "$DID_BACKUP" -eq 1 ] && echo "Replaced files kept at: $BACKUP"
echo "global config: $LINKED linked, $ALREADY already correct"
run_runtime_linker || FAIL=1
exit "$FAIL"
