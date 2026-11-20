# shellcheck shell=bash
# cfn-tmux-agents: per-lane CARGO_TARGET_DIR for projects that opt in.
#
# Why (mdtwii-tooling request, 2026-11-19): lanes build Rust into their
# scratchpad on the root disk (one 42 GB target; root disk +62 GB in 6 days).
# A project opts in by committing .claude/cargo-target-root: one absolute
# folder (first non-blank, non-# line). Spawn then gives the pane
# CARGO_TARGET_DIR=<root>/<lane-name>. Nothing here names a project.
#
# Precedence: TMUX_AGENTS_CARGO_TARGET_DIR (explicit, per spawn) wins over the
# project file. The ambient CARGO_TARGET_DIR does NOT win: it is commonly
# exported globally in the master shell (a shared dir), and honoring it would
# silently switch the opt-in off. No file and no explicit value: no change.
#
# cfn: working-tree file, not the committed HEAD blob (glm-open-dirs pins
# HEAD because it widens a sandbox; this only picks a build folder).
# Pin to HEAD if a lane's own edits to the file should not count.

CFN_CARGO_TARGET_FILE=.claude/cargo-target-root

# _ta_cargo_root_check PATH SOURCE: rc 0 when PATH is a safe absolute folder,
# else prints the reason and returns 1.
_ta_cargo_root_check() {
  local p="$1" src="$2"
  case "$p" in /*) ;; *) echo "$src '$p' is not an absolute path" >&2; return 1 ;; esac
  [[ "$p" =~ ^[A-Za-z0-9_./+@:-]+$ ]] || { echo "$src '$p' holds characters outside [A-Za-z0-9_./+@:-]" >&2; return 1; }
  case "/$p/" in */../*) echo "$src '$p' holds '..'" >&2; return 1 ;; esac
  case "$p/" in
    /dev/shm/*|/run/shm/*) echo "$src '$p' is under /dev/shm or /run/shm (RAM-backed; stack rule: never CARGO_TARGET_DIR in RAM)" >&2; return 1 ;;
  esac
  return 0
}

# _ta_cargo_target_line CWD LANE: prints CARGO_TARGET_DIR=<dir> (nothing when
# not opted in). rc 1 with the reason on stderr for an unsafe value.
_ta_cargo_target_line() {
  local cwd="$1" lane="$2" top file root="" line
  if [ -n "${TMUX_AGENTS_CARGO_TARGET_DIR:-}" ]; then
    _ta_cargo_root_check "$TMUX_AGENTS_CARGO_TARGET_DIR" "TMUX_AGENTS_CARGO_TARGET_DIR" || return 1
    printf 'CARGO_TARGET_DIR=%s\n' "$TMUX_AGENTS_CARGO_TARGET_DIR"
    return 0
  fi
  top=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || top="$cwd"
  file="$top/$CFN_CARGO_TARGET_FILE"
  [ -e "$file" ] || [ -L "$file" ] || return 0
  if [ -L "$file" ] || [ ! -f "$file" ]; then
    echo "$file is not a regular file (symlinks refused)" >&2; return 1
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%[[:space:]]}"; line="${line##[[:space:]]}"
    case "$line" in ""|\#*) continue ;; esac
    root="$line"; break
  done < "$file"
  [ -n "$root" ] || { echo "$file has no root line" >&2; return 1; }
  root="${root%/}"
  _ta_cargo_root_check "$root" "$file root" || return 1
  # A root missing on this host (e.g. a VPS checkout of the same repo) is
  # ignored, not created: cargo would make it on whatever disk holds that path.
  if [ ! -d "$root" ]; then
    echo "cfn-tmux-agents: $file root '$root' does not exist on this host; lane $lane keeps the default CARGO_TARGET_DIR" >&2
    return 0
  fi
  printf 'CARGO_TARGET_DIR=%s/%s\n' "$root" "$lane"
}
