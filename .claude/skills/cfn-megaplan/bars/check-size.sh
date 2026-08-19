#!/usr/bin/env bash
# Bar checker — enforces per-artifact-kind byte size caps for cfn-megaplan-fast
# planning artifacts (also run by cfn-megaplan + cfn-megaplan-lite at every level
# join, with the tier profile caps), so a phase output cannot silently balloon and get re-read
# in full by every downstream phase (the #1 cost driver in
# planning/cfn_megaplan_fast/PLAN_cfn_megaplan_fast.md §1).
#
# Checks:
#   - a single artifact's byte size against the cap for its KIND
#   - KIND is inferred from the basename prefix before the first `_` (e.g.
#     SPEC_foo.md -> SPEC), or forced via --kind; unknown KIND -> exit 2
#   - caps come from a profile JSON's `.caps.<KIND>` (--profile <path>, or the
#     default profile at .claude/skills/cfn-megaplan-fast/profiles/fast.json
#     resolved from the repo root); a missing profile file, or a profile with
#     no cap for that kind, falls back to the built-in defaults table below
#   - --all <dir> scans every recognized artifact (basename prefix matches a
#     known KIND) directly inside a directory; unrecognized files are ignored
#
# Usage:  check-size.sh <artifact.md> [--profile <path>] [--kind <KIND>] [--json]
#         check-size.sh --all <dir> [--profile <path>] [--json]
# Output: one line per file to stdout:
#           OK <KIND> <bytes>/<cap> <path>
#           OVER <KIND> <bytes>/<cap> (+<excess>) <path>
#         --json emits a findings array instead of the lines above:
#           [{"file":"...","ac_id":"<KIND>","field":"size","issue":"over cap by N bytes","severity":"error"}]
#           [] when clean.
# Exit:   0 = all (recognized) files at or under their cap
#         1 = one or more files over cap
#         2 = usage error / missing file / unknown kind
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- canonical default caps (bytes), single source of truth ----
declare -A DEFAULT_CAPS=(
  [SPEC]=24576
  [DECISIONS]=8192
  [DATA]=32768
  [ARCH]=32768
  [UX]=32768
  [REVIEW]=16384
  [TEST]=24576
  [PLAN]=40960
  [VERIFY]=40960
  [PSEUDO]=16384
  [DESIGN]=16384
  [OPS]=16384
  [RESEARCH]=16384
  [MEGAPLANFAST]=16384
  [MEGAPLAN]=16384
  [PARTSPEC]=12288
)

usage() {
  echo 'usage: check-size.sh <artifact.md> [--profile <path>] [--kind <KIND>] [--json]' >&2
  echo '       check-size.sh --all <dir> [--profile <path>] [--json]' >&2
}

find_repo_root() {
  local d="$SCRIPT_DIR"
  while [ "$d" != "/" ]; do
    if [ -d "$d/.claude" ]; then printf '%s' "$d"; return 0; fi
    d="$(dirname "$d")"
  done
  return 1
}

is_known_kind() { [ -n "${DEFAULT_CAPS[$1]+x}" ]; }

get_cap() { # kind
  local kind="$1" cap=""
  if [ -n "$PROFILE_PATH" ] && [ -f "$PROFILE_PATH" ]; then
    cap=$(jq -r --arg k "$kind" '.caps[$k] // empty' "$PROFILE_PATH" 2>/dev/null || true)
  fi
  if [ -z "$cap" ] || [ "$cap" = "null" ]; then
    cap="${DEFAULT_CAPS[$kind]}"
  fi
  printf '%s' "$cap"
}

infer_kind() { # path -> KIND (may be unrecognized)
  local base; base="$(basename "$1")"
  printf '%s' "${base%%_*}"
}

json_escape() {
  local s=$1
  s=${s//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# ---- arg parsing ----
MODE="single"
ARTIFACT=""
DIR=""
PROFILE_PATH=""
KIND_OVERRIDE=""
JSON_OUT=0

if [ $# -eq 0 ]; then usage; exit 2; fi

while [ $# -gt 0 ]; do
  case "$1" in
    --all)
      MODE="all"; DIR="${2:-}"
      [ $# -ge 2 ] && shift 2 || shift
      ;;
    --profile)
      PROFILE_PATH="${2:-}"
      [ $# -ge 2 ] && shift 2 || shift
      ;;
    --kind)
      KIND_OVERRIDE="${2:-}"
      [ $# -ge 2 ] && shift 2 || shift
      ;;
    --json) JSON_OUT=1; shift ;;
    --) shift ;;
    -*) usage; exit 2 ;;
    *) ARTIFACT="$1"; shift ;;
  esac
done

REPO_ROOT="$(find_repo_root || true)"
if [ -z "$PROFILE_PATH" ] && [ -n "$REPO_ROOT" ]; then
  PROFILE_PATH="$REPO_ROOT/.claude/skills/cfn-megaplan-fast/profiles/fast.json"
fi

# ---- gather the file list ----
FILES=()
if [ "$MODE" = "all" ]; then
  if [ -z "$DIR" ] || [ ! -d "$DIR" ]; then
    echo "error: directory not found: $DIR" >&2
    exit 2
  fi
  for f in "$DIR"/*; do
    [ -f "$f" ] || continue
    k="$(infer_kind "$f")"
    is_known_kind "$k" || continue
    FILES+=("$f")
  done
else
  if [ -z "$ARTIFACT" ]; then usage; exit 2; fi
  if [ ! -f "$ARTIFACT" ]; then
    echo "error: file not found: $ARTIFACT" >&2
    exit 2
  fi
  FILES+=("$ARTIFACT")
fi

# ---- evaluate ----
findings=()
any_over=0

for f in "${FILES[@]}"; do
  if [ "$MODE" = "single" ] && [ -n "$KIND_OVERRIDE" ]; then
    kind="$KIND_OVERRIDE"
  else
    kind="$(infer_kind "$f")"
  fi

  if ! is_known_kind "$kind"; then
    echo "error: unknown kind '$kind' for $f" >&2
    exit 2
  fi

  cap="$(get_cap "$kind")"
  bytes="$(wc -c < "$f" | tr -d '[:space:]')"

  if [ "$bytes" -gt "$cap" ]; then
    any_over=1
    excess=$((bytes - cap))
    if [ "$JSON_OUT" -eq 0 ]; then
      printf 'OVER %s %s/%s (+%s) %s\n' "$kind" "$bytes" "$cap" "$excess" "$f"
    fi
    findings+=("{\"file\":\"$(json_escape "$f")\",\"ac_id\":\"$(json_escape "$kind")\",\"field\":\"size\",\"issue\":\"over cap by ${excess} bytes\",\"severity\":\"error\"}")
  else
    if [ "$JSON_OUT" -eq 0 ]; then
      printf 'OK %s %s/%s %s\n' "$kind" "$bytes" "$cap" "$f"
    fi
  fi
done

if [ "$JSON_OUT" -eq 1 ]; then
  if [ "${#findings[@]}" -eq 0 ]; then
    echo '[]'
  else
    printf '[%s]\n' "$(IFS=,; echo "${findings[*]}")"
  fi
fi

[ "$any_over" -eq 0 ] && exit 0
exit 1
