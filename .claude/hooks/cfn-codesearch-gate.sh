#!/usr/bin/env bash
# PreToolUse (matcher: Bash|Grep). CodeSearch-first gate.
#
# Why: the CLAUDE.md "CodeSearch first" rule alone did not hold. Over
# 2026-11-07..10, 69 server sessions made 0 search.sh calls and ~460 grep/rg
# calls (the earlier nudge hooks were unwired 2026-09-03 to trust the rule).
#
# What: in a project that has a CodeSearch index (directly, or via the main
# checkout of the same repo for fleet clones), the session's first recursive
# grep / rg / git grep / Grep-tool call is denied with the exact search.sh
# command to run instead. Once the session has run search.sh, everything
# passes for the rest of the session. Piped greps (output filters) and
# single-file greps always pass.
#
# Cheap by design (the old hooks were dropped for per-Bash overhead): non-search
# commands cost one jq parse; only search commands touch git and sqlite.
# Fails open on any error. Off switch: CFN_CODESEARCH_GATE=off.
# Usage log (shared with search.sh): ${CFN_CS_LOG_DIR:-~/.local/share/codesearch/logs}/usage-YYYY-MM.tsv
# cfn: once-per-session gate, per-query gating if sessions search once then grep everything
set -uo pipefail

[ "${CFN_CODESEARCH_GATE:-on}" = off ] && exit 0
command -v jq >/dev/null 2>&1 || exit 0
INPUT=$(cat 2>/dev/null) || exit 0
# \x1f, not tab: tab is IFS whitespace, so an empty field would collapse and shift the rest.
IFS=$'\x1f' read -r SESSION CWD TOOL CMD < <(jq -r '[.session_id // "", .cwd // "", .tool_name // "",
  ((.tool_input.command // "") | gsub("[\n\u001f]"; " "))] | join("\u001f")' <<<"$INPUT" 2>/dev/null) || exit 0
SESSION=$(printf '%s' "${SESSION:-}" | tr -cd 'A-Za-z0-9_-')
[ -n "$SESSION" ] || exit 0

GATE_DIR="${CFN_CS_GATE_DIR:-${TMPDIR:-/tmp}/cfn-codesearch-gate}"
MARK="$GATE_DIR/$SESSION"
LOG_DIR="${CFN_CS_LOG_DIR:-$HOME/.local/share/codesearch/logs}"
log() { mkdir -p "$LOG_DIR" 2>/dev/null &&
  printf '%s\t%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$1" "$2" "$3" >>"$LOG_DIR/usage-$(date +%Y-%m).tsv" 2>/dev/null; }

# Recursive code search as the head of any &&/||/; segment (not after a pipe).
is_code_grep() {
  local c="$1" seg
  c="${c//&&/$'\n'}"; c="${c//||/$'\n'}"; c="${c//;/$'\n'}"
  while IFS= read -r seg; do
    seg="${seg%%|*}"
    seg="${seg#"${seg%%[![:space:]]*}"}"
    case "$seg" in
      rg|"rg "*|"ag "*|"git grep"*) return 0 ;;
      "grep "*) [[ " $seg " =~ \ (-[A-Za-z]*[rR][A-Za-z]*|--recursive)\  ]] && return 0 ;;
    esac
  done <<<"$c"
  return 1
}

case "$TOOL" in
  Bash)
    if [[ "$CMD" == *cfn-codesearch/search.sh* ]]; then
      mkdir -p "$GATE_DIR" 2>/dev/null && : >"$MARK" 2>/dev/null
      exit 0
    fi
    is_code_grep "$CMD" || exit 0 ;;
  Grep) ;;
  *) exit 0 ;;
esac

ROOT="${CLAUDE_PROJECT_DIR:-$(git -C "${CWD:-.}" rev-parse --show-toplevel 2>/dev/null || echo "${CWD:-}")}"
ROOT="${ROOT%/}"
[ -n "$ROOT" ] || exit 0

if [ -e "$MARK" ]; then log "$ROOT" grep-after-search "$TOOL"; exit 0; fi

LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd -P)/skills/cfn-codesearch/lib/index-root.sh"
[ -f "$LIB" ] || LIB="$HOME/.claude/skills/cfn-codesearch/lib/index-root.sh"
[ -f "$LIB" ] || exit 0
. "$LIB"
DB="${CODESEARCH_DB:-$HOME/.local/share/codesearch/index_v2.db}"
IDX=$(cs_index_root "$ROOT" "$DB" 2>/dev/null)
[ -n "$IDX" ] || exit 0

log "$ROOT" deny "$TOOL"
REASON="CodeSearch first: this project has a search index and this session has not used it yet. Run: bash \$HOME/.claude/skills/cfn-codesearch/search.sh \"<what you are looking for>\" --top 5 . It ranks files by name, content and meaning in one call. After one search, grep and rg work normally for the rest of this session."
jq -nc --arg r "$REASON" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
exit 0
