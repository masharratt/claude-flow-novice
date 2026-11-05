#!/usr/bin/env bash
# cfn-fanout-guard: PreToolUse (Agent|Workflow|Bash) + PostToolUse (Agent) hook.
# WARN only, never blocks. Fires when a session launches a burst of workers
# before any one item has run end to end and been checked.
#
# Origin: MDTWII night of 2026-11-04/05, fan-out happened before one real item
# ran through. Written rules were ignored; this fires at the moment of the mistake.
#
# What counts as a spawn (weight):
#   Agent                                      1 (parallel agents in one message
#                                                arrive as separate calls)
#   Bash: cfn-tmux-agents ... spawn            1
#   Bash: cfn-fleet ... assign                 1
#   Workflow                                   THRESHOLD (a burst on its own)
#   Bash: claude -p / --print inside a for/while loop or xargs, xargs -P N (N>1)
#         or GNU parallel running claude|codex|glm|cfn-*     THRESHOLD
# Known false positives: a loop running `claude -p` over items that are already
# validated, xargs -P over a script whose name contains claude/codex/glm/cfn-.
#
# Warns once per burst when the sliding-window count reaches THRESHOLD and the
# session has no pilot marker. Pilot marker, either:
#   bash $HOME/.claude/hooks/cfn-fanout-guard.sh --pilot-ok "<what was checked>"
#   (session id from CLAUDE_CODE_SESSION_ID) or an Agent that finished (PostToolUse,
#   foreground only) before the oldest spawn in the current window.
#
# Env: CFN_FANOUT_WINDOW (s, 60), CFN_FANOUT_THRESHOLD (4), CFN_FANOUT_GUARD=off,
#      CFN_FANOUT_NOW (epoch s, tests only), CFN_FANOUT_STATE_TTL_DAYS (2).
# State: ${XDG_RUNTIME_DIR:-/tmp}/cfn-guards/<session_id>/fanout/ (stale dirs reaped).
# Fail open: any internal error -> exit 0, one line on stderr.
set -uo pipefail

WINDOW="${CFN_FANOUT_WINDOW:-60}"
THRESHOLD="${CFN_FANOUT_THRESHOLD:-4}"
TTL_DAYS="${CFN_FANOUT_STATE_TTL_DAYS:-2}"
[[ "$WINDOW" =~ ^[0-9]+$ ]] || WINDOW=60
[[ "$THRESHOLD" =~ ^[0-9]+$ ]] && [ "$THRESHOLD" -gt 0 ] || THRESHOLD=4

now(){ echo "${CFN_FANOUT_NOW:-$(date +%s)}"; }
state_dir(){ echo "${XDG_RUNTIME_DIR:-/tmp}/cfn-guards/$1/fanout"; }
safe_sid(){ [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }

# --- CLI: --pilot-ok "<what was checked>" ------------------------------------
if [ "${1:-}" = "--pilot-ok" ]; then
  SID="${CLAUDE_CODE_SESSION_ID:-${CFN_SESSION_ID:-}}"
  if [ -z "$SID" ] || ! safe_sid "$SID"; then
    echo "fanout-guard: no session id (CLAUDE_CODE_SESSION_ID unset); pilot marker not recorded" >&2
    exit 1
  fi
  D=$(state_dir "$SID")
  mkdir -p "$D" 2>/dev/null && printf '%s %s\n' "$(now)" "${2:-unspecified}" > "$D/pilot-ok" \
    || { echo "fanout-guard: cannot write $D/pilot-ok" >&2; exit 1; }
  echo "fanout-guard: pilot recorded for session $SID: ${2:-unspecified}"
  exit 0
fi

# Classify a Bash command: prints weight (0 = not a spawn).
bash_weight(){
  local c="$1"
  local worker='(claude|codex|glm|cfn-[a-z-]+)'
  if [[ "$c" =~ (for|while)[[:space:]].*(claude|codex)[[:space:]]+(-p|--print|exec)([[:space:]]|$) ]] \
     || [[ "$c" =~ xargs.*(claude|codex)[[:space:]]+(-p|--print|exec)([[:space:]]|$) ]]; then
    echo "$THRESHOLD"; return
  fi
  if [[ "$c" =~ xargs[[:space:]].*-P[[:space:]]*([0-9]+) ]] && [ "${BASH_REMATCH[1]}" -gt 1 ] && [[ "$c" =~ $worker ]]; then
    echo "$THRESHOLD"; return
  fi
  if [[ "$c" =~ (^|[;&|[:space:]])parallel[[:space:]] ]] && [[ "$c" =~ $worker ]]; then
    echo "$THRESHOLD"; return
  fi
  if [[ "$c" =~ cfn-tmux-agents.*[[:space:]]spawn([[:space:]]|$) ]] || [[ "$c" =~ tmux-agents\.sh[[:space:]]+spawn([[:space:]]|$) ]]; then
    echo 1; return
  fi
  if [[ "$c" =~ cfn-fleet.*[[:space:]]assign([[:space:]]|$) ]]; then echo 1; return; fi
  echo 0
}

main(){
  [ "${CFN_FANOUT_GUARD:-on}" = "off" ] && return 0
  local RAW; RAW=$(timeout 1 cat 2>/dev/null || true)
  [ -n "$RAW" ] || return 0
  command -v jq >/dev/null 2>&1 || return 0

  local EVENT TOOL SID AGENT_ID
  { read -r EVENT; read -r TOOL; read -r SID; read -r AGENT_ID; } < <(
    printf '%s' "$RAW" | jq -r '(.hook_event_name // ""), (.tool_name // ""), (.session_id // ""), (.agent_id // "")' 2>/dev/null)
  [ -n "$AGENT_ID" ] && return 0            # subagents are leaves; depth guard owns them
  [ -n "$SID" ] && safe_sid "$SID" || return 0

  local D; D=$(state_dir "$SID")
  local T; T=$(now)

  # Reap state dirs of long-dead sessions.
  find "${XDG_RUNTIME_DIR:-/tmp}/cfn-guards" -mindepth 1 -maxdepth 1 -type d -mtime "+$TTL_DAYS" -exec rm -rf {} + 2>/dev/null || true

  if [ "$EVENT" = "PostToolUse" ]; then
    [ "$TOOL" = "Agent" ] || return 0
    [ "$(printf '%s' "$RAW" | jq -r '.tool_input.run_in_background // false' 2>/dev/null)" = "true" ] && return 0
    mkdir -p "$D" 2>/dev/null || return 0
    [ -f "$D/first-done" ] || printf '%s\n' "$T" > "$D/first-done"
    return 0
  fi

  local W=0
  case "$TOOL" in
    Agent)    W=1 ;;
    Workflow) W=$THRESHOLD ;;
    Bash)     W=$(bash_weight "$(printf '%s' "$RAW" | jq -r '.tool_input.command // ""' 2>/dev/null)") ;;
    *)        return 0 ;;
  esac
  [ "$W" -gt 0 ] || return 0

  mkdir -p "$D" 2>/dev/null || { echo "fanout-guard: cannot create $D (fail open)" >&2; return 0; }

  # Prune to the window; an empty window means a new burst.
  local LOG="$D/spawns" CUT=$(( T - WINDOW )) KEPT=""
  if [ -f "$LOG" ]; then
    KEPT=$(awk -v c="$CUT" '$1 > c' "$LOG")
  fi
  [ -z "$KEPT" ] && rm -f "$D/warned"
  { [ -n "$KEPT" ] && printf '%s\n' "$KEPT"; printf '%s %s\n' "$T" "$W"; } > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"

  local COUNT OLDEST
  COUNT=$(awk '{s+=$2} END{print s+0}' "$LOG")
  OLDEST=$(awk 'NR==1{print $1}' "$LOG")
  [ "$COUNT" -ge "$THRESHOLD" ] || return 0
  [ -f "$D/warned" ] && return 0
  [ -f "$D/pilot-ok" ] && return 0
  if [ -f "$D/first-done" ] && [ "$(cat "$D/first-done")" -lt "$OLDEST" ] 2>/dev/null; then return 0; fi

  : > "$D/warned"
  local MSG="fan-out: run one real item end to end and check the result before launching ${COUNT}. missing=[pilot: no item ran end to end and was checked in this session] count=${COUNT} threshold=${THRESHOLD} window=${WINDOW}s. If one already ran, record it: bash \$HOME/.claude/hooks/cfn-fanout-guard.sh --pilot-ok \"<what was checked>\""
  jq -nc --arg m "$MSG" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$m}}'
  return 0
}

main || echo "fanout-guard: internal error (fail open)" >&2
exit 0
