#!/usr/bin/env bash
# plan-paths.sh - single source of truth for where planning artifacts live.
#
# Layout (canonical, since megaplan v1.3.0): every artifact of one plan lives in
# its own per-plan directory:
#
#     planning/<slug>/SPEC_<slug>.md
#     planning/<slug>/VERIFY_<slug>.md
#     planning/<slug>/.VERIFY_<slug>.sha256
#     ...
#
# Filenames keep the `_<slug>` suffix: every sidecar/ledger name in the bars is
# derived from the basename, and the suffix keeps a file self-identifying once it
# is copied or pasted out of its directory.
#
# LEGACY: plans written before the per-plan directory landed sit flat in
# `planning/`. Readers MUST use `resolve` (nested first, flat second) so old
# plans keep working. Writers MUST use `dir` / `ensure` (always nested).
#
# Usage (CLI):
#   plan-paths.sh dir <slug>                  -> planning/<slug>            (no mkdir)
#   plan-paths.sh ensure <slug>               -> planning/<slug>            (mkdir -p)
#   plan-paths.sh resolve <slug> <basename>   -> existing path, exit 1 if neither exists
#   plan-paths.sh write <slug> <basename>     -> nested path (mkdir -p parent)
#   plan-paths.sh newest <glob>               -> newest match across nested + flat
#   plan-paths.sh slug-of <path>              -> slug inferred from a planning path
#
# Usage (sourced):
#   source .claude/skills/cfn-megaplan/lib/plan-paths.sh
#   PDIR=$(plan_ensure "$SLUG"); VERIFY=$(plan_resolve "$SLUG" "VERIFY_${SLUG}.md")
#
# Env:
#   CFN_PLANNING_ROOT   planning root, default `planning`
#
# Exit codes: 0 ok, 1 not found, 2 usage error.
#
# Safe to `source`: it sets no shell options and defines only `plan_*` functions.
# CFN_PLANNING_ROOT is read at CALL time, so a caller that renders several roots
# (cfn-workbench --root) can re-point it per call.

_plan_root() { printf '%s' "${CFN_PLANNING_ROOT:-planning}"; }

plan_dir() {
  [ -n "${1:-}" ] || { echo "plan-paths: slug required" >&2; return 2; }
  printf '%s/%s\n' "$(_plan_root)" "$1"
}

plan_ensure() {
  local d
  d=$(plan_dir "${1:-}") || return $?
  mkdir -p "$d"
  printf '%s\n' "$d"
}

# resolve <slug> <basename> - nested first, flat (legacy) second.
plan_resolve() {
  local slug="${1:-}" base="${2:-}" root
  [ -n "$slug" ] && [ -n "$base" ] || { echo "plan-paths: resolve needs <slug> <basename>" >&2; return 2; }
  root=$(_plan_root)
  local nested="$root/$slug/$base" flat="$root/$base"
  if [ -e "$nested" ]; then printf '%s\n' "$nested"; return 0; fi
  if [ -e "$flat" ]; then printf '%s\n' "$flat"; return 0; fi
  printf '%s\n' "$nested"   # canonical path, for the error message the caller prints
  return 1
}

# write <slug> <basename> - always the nested path; creates the directory.
plan_write() {
  local slug="${1:-}" base="${2:-}"
  [ -n "$slug" ] && [ -n "$base" ] || { echo "plan-paths: write needs <slug> <basename>" >&2; return 2; }
  local d
  d=$(plan_ensure "$slug") || return $?
  printf '%s/%s\n' "$d" "$base"
}

# newest <glob> - newest match, searching per-plan dirs and the flat legacy root.
# cfn: one directory level deep, nest per-plan dirs deeper and this stops finding them
plan_newest() {
  local pat="${1:-PLAN_*.md}" root
  root=$(_plan_root)
  # shellcheck disable=SC2086
  ls -t $root/*/$pat $root/$pat 2>/dev/null | head -1
}

# slug-of <path> - the plan slug a planning path belongs to.
# Nested path -> its directory name. Flat path -> the basename's `_<slug>` suffix.
plan_slug_of() {
  local p="${1:-}"
  [ -n "$p" ] || { echo "plan-paths: slug-of needs <path>" >&2; return 2; }
  local parent base
  parent=$(basename "$(dirname "$p")")
  if [ "$parent" != "$(basename "$(_plan_root)")" ] && [ "$parent" != "." ]; then
    printf '%s\n' "$parent"; return 0
  fi
  base=$(basename "$p"); base="${base%.*}"; base="${base#.}"
  printf '%s\n' "${base#*_}"
}

# CLI dispatch only when executed, not when sourced.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  set -euo pipefail
  cmd="${1:-}"; shift || true
  case "$cmd" in
    dir)     plan_dir "$@" ;;
    ensure)  plan_ensure "$@" ;;
    resolve) plan_resolve "$@" ;;
    write)   plan_write "$@" ;;
    newest)  plan_newest "$@" ;;
    slug-of) plan_slug_of "$@" ;;
    *)
      echo 'usage: plan-paths.sh {dir|ensure|resolve|write|newest|slug-of} [args]' >&2
      exit 2 ;;
  esac
fi
