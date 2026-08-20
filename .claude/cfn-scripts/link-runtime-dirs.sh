#!/usr/bin/env bash
# Link the CFN runtime directories into ~/.claude/.
#
# CLAUDE.md has always documented ~/.claude/skills, ~/.claude/hooks and friends
# as reverse symlinks into this repo, but nothing created them: they were made by
# hand on one machine years ago. A fresh clone got the tooling and none of the
# links, so every "$HOME/.claude/skills/cfn-*" invocation resolved to nothing.
# This is the missing half of link-global-config.sh, which only ever linked the
# config layer (.claude/global/).
#
# Idempotent. Re-running is a no-op. Anything real it would overwrite is moved
# aside to a timestamped backup first, never deleted, and a populated real
# directory is refused outright unless --force is passed: that directory may be
# somebody's own skills tree.
#
# Usage:
#   .claude/cfn-scripts/link-runtime-dirs.sh            # link
#   .claude/cfn-scripts/link-runtime-dirs.sh --check    # verify only, no writes
#   .claude/cfn-scripts/link-runtime-dirs.sh --force    # also replace populated real dirs (backed up)
set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
SRC="$REPO/.claude"
DEST="$HOME/.claude"

# Entries linked into ~/.claude/. The path is the same on both sides, so
# .claude/skills -> ~/.claude/skills. agents/cfn-dev-team is nested on purpose:
# ~/.claude/agents stays a real directory holding project-local agents, and only
# the cfn-dev-team child is a link.
ENTRIES=(
  skills
  hooks
  commands
  agents/cfn-dev-team
  core
  helpers
  cfn-config
  cfn-data
  cfn-extras
  cfn-scripts
  adaptive-context
  agent-principles
  prompts
  tooling
)

CHECK_ONLY=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --force) FORCE=1 ;;
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "FAIL: unknown argument '$arg' (want --check or --force)" >&2; exit 2 ;;
  esac
done

[ -d "$SRC" ]  || { echo "FAIL: $SRC not found. Wrong repo?" >&2; exit 1; }
[ -d "$DEST" ] || { echo "FAIL: $DEST not found. Install Claude Code first." >&2; exit 1; }

BACKUP="$HOME/.claude-runtime-links-backup-$(date +%Y%m%d-%H%M%S)"
FAIL=0
LINKED=0
ALREADY=0
BLOCKED=0
DID_BACKUP=0

# ln -s needs elevation or Developer Mode on native Windows. Half a link set is
# worse than none, so the first failure stops the run with something actionable.
symlink_or_die() {
  local target="$1" link="$2"
  if ln -s "$target" "$link" 2>/dev/null; then
    return 0
  fi
  echo "FAIL: could not create symlink $link" >&2
  echo "  Creating symlinks needs privileges this shell does not have." >&2
  echo "  Native Windows: enable Developer Mode, or run an elevated shell." >&2
  echo "  Better: run CFN from WSL2 (see readme/macos-setup.md for the non-Linux notes)." >&2
  echo "  Stopping now rather than leaving half the runtime dirs linked." >&2
  exit 1
}

# Move a path into the timestamped backup, preserving its nesting.
back_up() {
  local link="$1" name="$2"
  mkdir -p "$BACKUP/$(dirname "$name")"
  mv "$link" "$BACKUP/$name"
  DID_BACKUP=1
  printf '  backed up %s -> %s/%s\n' "$name" "$BACKUP" "$name"
}

for name in "${ENTRIES[@]}"; do
  target="$SRC/$name"
  link="$DEST/$name"

  if [ ! -d "$target" ]; then
    echo "FAIL: $name missing from .claude/ in this repo" >&2
    FAIL=1
    continue
  fi

  # Nested entries need their parent to be a real directory on the ~/.claude
  # side. If the parent is itself a link, linking the child would write into
  # whatever it points at, so refuse instead.
  parent="$(dirname "$name")"
  if [ "$parent" != "." ]; then
    if [ -L "$DEST/$parent" ]; then
      printf '  CONFLICT %s (parent ~/.claude/%s is a symlink, not a real dir)\n' "$name" "$parent" >&2
      FAIL=1
      BLOCKED=$((BLOCKED + 1))
      continue
    fi
    if [ ! -d "$DEST/$parent" ]; then
      if [ "$CHECK_ONLY" -eq 1 ]; then
        printf '  MISSING  %s (parent ~/.claude/%s would be created)\n' "$name" "$parent"
        FAIL=1
        continue
      fi
      mkdir -p "$DEST/$parent"
    fi
  fi

  # Already pointing at the right place.
  if [ -L "$link" ] && [ "$(readlink -f "$link")" = "$(readlink -f "$target")" ]; then
    printf '  ok       %s\n' "$name"
    ALREADY=$((ALREADY + 1))
    continue
  fi

  # Classify what is in the way, because the three cases are not equally safe.
  kind=none
  if [ -L "$link" ]; then
    kind=wrong-link
  elif [ -d "$link" ]; then
    if [ -n "$(ls -A "$link" 2>/dev/null)" ]; then kind=real-dir; else kind=empty-dir; fi
  elif [ -e "$link" ]; then
    kind=real-file
  fi

  if [ "$CHECK_ONLY" -eq 1 ]; then
    case "$kind" in
      none)       printf '  MISSING  %s (would be created)\n' "$name" ;;
      wrong-link) printf '  WRONG    %s -> %s (points outside this repo)\n' "$name" "$(readlink "$link")" ;;
      empty-dir)  printf '  UNLINKED %s (empty real dir, would be replaced)\n' "$name" ;;
      real-file)  printf '  UNLINKED %s (real file, would be backed up and replaced)\n' "$name" ;;
      real-dir)   printf '  UNLINKED %s (POPULATED real dir, needs --force)\n' "$name" ;;
    esac
    FAIL=1
    continue
  fi

  case "$kind" in
    real-dir)
      if [ "$FORCE" -ne 1 ]; then
        echo "REFUSING: ~/.claude/$name is a real directory with content." >&2
        echo "  It is not a link into this repo, so replacing it would hide files that" >&2
        echo "  may exist nowhere else. Inspect it, then re-run with --force to move it" >&2
        echo "  aside into a timestamped backup (nothing is deleted)." >&2
        FAIL=1
        BLOCKED=$((BLOCKED + 1))
        continue
      fi
      printf '  !! %s is a populated real dir; --force given, moving it aside\n' "$name" >&2
      back_up "$link" "$name"
      ;;
    wrong-link)
      printf '  !! %s pointed at %s, not this repo\n' "$name" "$(readlink "$link")" >&2
      back_up "$link" "$name"
      ;;
    real-file)
      printf '  !! %s was a real file, not a link\n' "$name" >&2
      back_up "$link" "$name"
      ;;
    empty-dir)
      rmdir "$link"
      printf '  replaced %s (was an empty dir)\n' "$name"
      ;;
  esac

  symlink_or_die "$target" "$link"
  printf '  linked   %s -> %s\n' "$name" "$target"
  LINKED=$((LINKED + 1))
done

echo "---"
if [ "$CHECK_ONLY" -eq 1 ]; then
  if [ "$FAIL" -eq 0 ]; then
    echo "runtime dirs: OK ($ALREADY of ${#ENTRIES[@]} linked)"
  else
    echo "runtime dirs: NOT LINKED. Run without --check to fix." >&2
  fi
  exit "$FAIL"
fi

[ "$DID_BACKUP" -eq 1 ] && echo "Replaced paths kept at: $BACKUP"
if [ "$BLOCKED" -gt 0 ]; then
  echo "runtime dirs: $LINKED linked, $ALREADY already correct, $BLOCKED BLOCKED (see above)" >&2
else
  echo "runtime dirs: $LINKED linked, $ALREADY already correct"
fi
exit "$FAIL"
