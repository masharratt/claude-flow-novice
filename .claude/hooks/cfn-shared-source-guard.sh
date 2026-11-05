#!/usr/bin/env bash
# cfn-shared-source-guard — PreToolUse (Edit|Write) hook. WARNS, never blocks.
#
# Why: a defect in a shared part was inherited by many units before anyone listed
# who depends on it (MDTWII, 2026-11-04). This fires at the edit: if the existing
# file has >= CFN_SHARED_SOURCE_THRESHOLD dependents (files that reference it by
# path, basename or module name), it adds context naming the count and up to
# CFN_SHARED_SOURCE_MAX_PATHS paths.
#
# Data source: CodeSearch lexical index first (candidates are then verified with a
# literal grep, since BM25 ranks rather than proves); bounded `git grep -l` when
# the index is absent, empty or errors. Neither available: silent.
#
# Once per file per session. Dependents cached per file+HEAD (shared across
# sessions, cleaned after a day). Skips docs, tests, .backups/, new files.
# Fail open: any internal problem -> exit 0, at most one stderr line.
# Latency: shares cfn-hook-budget.sh (CFN_SSG_BUDGET_MS, default 2500 of the 5s hook timeout).
#
# Env: CFN_SHARED_SOURCE_GUARD=off | CFN_SHARED_SOURCE_THRESHOLD (5) |
#      CFN_SHARED_SOURCE_MAX_PATHS (15) | CFN_SSG_CODESEARCH_BIN / _DB (test hooks).
set -uo pipefail
trap 'exit 0' ERR

THRESHOLD="${CFN_SHARED_SOURCE_THRESHOLD:-5}"
MAX_PATHS="${CFN_SHARED_SOURCE_MAX_PATHS:-15}"
CANDIDATES=80
BUDGET_MS="${CFN_SSG_BUDGET_MS:-2500}"
BIN="${CFN_SSG_CODESEARCH_BIN:-$HOME/.local/bin/local-codesearch}"
DB="${CFN_SSG_CODESEARCH_DB:-${CODESEARCH_DB:-$HOME/.local/share/codesearch/index_v2.db}}"
GENERIC_STEMS=" index main mod init __init__ utils util lib types config test setup common base "
[[ "$THRESHOLD" =~ ^[0-9]+$ ]] || THRESHOLD=5
[[ "$MAX_PATHS" =~ ^[0-9]+$ ]] || MAX_PATHS=15

[ "${CFN_SHARED_SOURCE_GUARD:-on}" = off ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
RAW=$(timeout 1 cat 2>/dev/null || true)
[ -n "$RAW" ] || exit 0

TOOL=$(printf '%s' "$RAW" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0
case "$TOOL" in Edit|Write|MultiEdit) ;; *) exit 0 ;; esac
FILE=$(printf '%s' "$RAW" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
SID=$(printf '%s' "$RAW" | jq -r '.session_id // "nosession"' 2>/dev/null)
CWD=$(printf '%s' "$RAW" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$FILE" ] && [ -f "$FILE" ] || exit 0          # new file or no path: nothing depends on it yet
SID="${SID//[^A-Za-z0-9_.-]/_}"

# Skips: docs, tests, backups.
case "$FILE" in
  */.backups/*|*/node_modules/*) exit 0 ;;
  */tests/*|*/test/*|*/__tests__/*|*/spec/*) exit 0 ;;
  *.md|*.markdown|*.txt|*.rst) exit 0 ;;
esac
BASE="${FILE##*/}"
case "$BASE" in test-*|test_*|*_test.*|*.test.*|*.spec.*) exit 0 ;; esac

# Project root: git toplevel of the file, else the project dir.
ROOT=$(git -C "${FILE%/*}" rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$ROOT" ] || ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || exit 0
ROOT="${ROOT%/}"
REL="${FILE#"$ROOT"/}"
HAVE_GIT=0; git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1 && HAVE_GIT=1
HAVE_IDX=0; [ -x "$BIN" ] && [ -f "$DB" ] && HAVE_IDX=1
[ "$HAVE_GIT" = 1 ] || [ "$HAVE_IDX" = 1 ] || exit 0

STATE="${XDG_RUNTIME_DIR:-/tmp}/cfn-guards"
SDIR="$STATE/$SID"; CDIR="$STATE/cache"
mkdir -p "$SDIR" "$CDIR" 2>/dev/null || exit 0
find "$STATE" -mindepth 1 -maxdepth 1 -type d ! -name cache -mtime +1 -exec rm -rf {} + 2>/dev/null || true
find "$CDIR" -type f -mtime +1 -delete 2>/dev/null || true

hash_of(){ printf '%s' "$1" | { sha1sum 2>/dev/null || shasum; } | cut -c1-16; }
KEY=$(hash_of "$FILE")
[ -e "$SDIR/warned-$KEY" ] && exit 0                 # once per file per session

HEAD_SHA=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo nohead)
CACHE="$CDIR/$KEY-${HEAD_SHA:0:12}"

compute_dependents(){ # prints repo-relative paths, one per line
  # shellcheck disable=SC1091
  source "$(dirname "${BASH_SOURCE[0]}")/cfn-hook-budget.sh" 2>/dev/null || return 0
  cfn_budget_init "$BUDGET_MS"
  local stem="${BASE%.*}" pats=(-e "$BASE") tmp lim
  case "$BASE" in
    *.sh|*.py|*.ts|*.tsx|*.js|*.jsx|*.mjs|*.rs|*.go)
      if [ "${#stem}" -ge 4 ] && [[ "$GENERIC_STEMS" != *" $stem "* ]]; then pats+=(-e "$stem"); fi ;;
  esac
  tmp=$(mktemp "$STATE/.dep.XXXXXX") || return 0
  local filt='\.(md|markdown|txt|rst)$|(^|/)\.backups/|(^|/)node_modules/|(^|/)\.playwright-mcp/|(^|/)[^/]*archive[^/]*/'
  if [ "$HAVE_IDX" = 1 ] && lim=$(cfn_budget 1200); then
    cfn_run_bounded "$lim" "$tmp" bash -c 'cd "$1" && "$2" --project-dir "$1" lexical "$3" -n "$4" --db "$5"' _ \
      "$ROOT" "$BIN" "${BASE%.*}" "$CANDIDATES" "$DB"
    local cand="$tmp.c" ver="$tmp.v"
    sed -E 's/ \(score: [-0-9.]+\)$//' "$tmp" | grep -E '^[^ ]' | grep -vxF -- "$REL" \
      | grep -Ev "$filt" | head -n "$CANDIDATES" > "$cand" || true
    if [ -s "$cand" ] && lim=$(cfn_budget 800); then
      # Verify: BM25 ranks, it does not prove a reference. Literal grep over the candidates only.
      cfn_run_bounded "$lim" "$ver" bash -c 'cd "$1"; shift; xargs -d "\n" grep -lIF "$@" -- < "$0" 2>/dev/null' "$cand" "$ROOT" "${pats[@]}"
      if [ -s "$ver" ]; then cat "$ver"; rm -f "$tmp" "$cand" "$ver"; return 0; fi
    fi
    rm -f "$cand" "$ver"
  fi
  if [ "$HAVE_GIT" = 1 ] && lim=$(cfn_budget 1200); then
    cfn_run_bounded "$lim" "$tmp" git -C "$ROOT" grep -l -I -F "${pats[@]}" -- .
    grep -vxF -- "$REL" "$tmp" | grep -Ev "$filt" || true
  fi
  rm -f "$tmp"
}

if [ -f "$CACHE" ]; then
  DEPS=$(cat "$CACHE")
else
  DEPS=$(compute_dependents | sort -u) || DEPS=""
  printf '%s\n' "$DEPS" > "$CACHE" 2>/dev/null || true
fi
COUNT=0; [ -n "$DEPS" ] && COUNT=$(printf '%s\n' "$DEPS" | grep -c .)
[ "$COUNT" -ge "$THRESHOLD" ] || exit 0

: > "$SDIR/warned-$KEY"
SHOWN=$(printf '%s\n' "$DEPS" | head -n "$MAX_PATHS" | sed 's/^/- /')
MSG="shared source: ${REL} has dependents count=${COUNT} threshold=${THRESHOLD} (showing up to ${MAX_PATHS}). List and check dependents before changing behaviour.
${SHOWN}"
jq -nc --arg m "$MSG" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$m}}'
exit 0
