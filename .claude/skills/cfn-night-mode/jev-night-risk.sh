#!/usr/bin/env bash
# .claude/skills/cfn-night-mode/jev-night-risk.sh
# SHADOW ONLY: asks Jev to score one night-mode morning-report item for
# "needs human attention now" on a 0-2 scale and appends one risk line to the
# shared JSONL log. Decides nothing: report text and item order are untouched,
# the score goes to the log only, never to stdout. Exit 0 after a valid
# invocation regardless of API outcome so the shadow can never block the
# report; usage errors exit 64.
#
# Usage: jev-night-risk.sh --title <s> --decision-id <s> --slug <s>
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-night-risk.jsonl
# Line:  {type:"risk",ts,project,cwd,decision_id,slug,score,confidence,
#         input_tokens}
# Idempotent on decision_id: already-scored items are skipped, no API call.
set -euo pipefail

INSTRUCTIONS="Score this deferred night-mode decision for how urgently it needs human attention."

# 0-2 criteria; index IS the score value.
CRITERIA_JSON='[
    "No attention needed: routine, reversible, already clear from the report context.",
    "Worth a look soon: unusual pattern or risk, but nothing broken right now.",
    "Needs human attention now: possibly destructive, irreversible, or an audit gap."
]'

usage() {
    printf 'usage: jev-night-risk.sh --title <s> --decision-id <s> --slug <s>\n' >&2
    exit 64
}

TITLE="" DID="" SLUG=""
while [ $# -gt 0 ]; do
    case "$1" in
        --title) [ -n "${2:-}" ] || usage; TITLE="$2"; shift 2 ;;
        --decision-id) [ -n "${2:-}" ] || usage; DID="$2"; shift 2 ;;
        --slug) [ -n "${2:-}" ] || usage; SLUG="$2"; shift 2 ;;
        *) usage ;;
    esac
done
[ -n "$TITLE" ] && [ -n "$DID" ] && [ -n "$SLUG" ] || usage

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CALLER="$SCRIPT_DIR/../../cfn-scripts/jev-systemone.sh"
if [ ! -f "$CALLER" ]; then
    printf 'jev-night-risk: error: caller script missing: %s\n' "$CALLER" >&2
    exit 0
fi

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-night-risk.jsonl"

command -v jq >/dev/null 2>&1 || { printf 'jev-night-risk: error: jq not found on PATH\n' >&2; exit 0; }

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the skill resolves from any project (reverse-symlink layout). Missing lib
# is a silent-out (exit 0) failure, same as every other shadow-internal
# failure: the report must never block on telemetry.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-night-risk: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

# Idempotency: one risk line per decision_id, ever. JSONL is one object per
# line, so select runs per line (no slurp).
if [ -f "$LOG_FILE" ] && jq -e --arg d "$DID" \
        'select(.type == "risk" and .decision_id == $d)' "$LOG_FILE" >/dev/null 2>&1; then
    jev_status "jev-night-risk: skip: $DID already scored"
    exit 0
fi

state=$(jq -cn --arg did "$DID" --arg slug "$SLUG" --arg title "$TITLE" \
    '{decision_id: $did, slug: $slug, title: $title}')
questions=$(jq -cn --arg did "$DID" --arg instr "$INSTRUCTIONS" --argjson criteria "$CRITERIA_JSON" \
    '{($did): {type: "score", instructions: $instr, criteria: $criteria}}')
input=$(jq -cn --argjson state "$state" --argjson questions "$questions" '{state: $state, questions: $questions}')

rc=0
resp=$(printf '%s' "$input" | "$CALLER" 2>/dev/null) || rc=$?
if [ "$rc" -eq 2 ]; then
    jev_status "jev-night-risk: skip: no TYPESAFE_API_KEY, $DID left unscored"
    exit 0
elif [ "$rc" -ne 0 ]; then
    jev_status "jev-night-risk: error: systemone call failed (rc $rc) for $DID"
    exit 0
fi

score=$(printf '%s' "$resp" | jq -r --arg d "$DID" '.answers[$d].score // empty' 2>/dev/null || true)
conf=$(printf '%s' "$resp" | jq -r --arg d "$DID" '.answers[$d].confidence // 0' 2>/dev/null || echo 0)
tokens=$(printf '%s' "$resp" | jq -r '.usage.input_tokens // 0' 2>/dev/null || echo 0)
if [ -z "$score" ]; then
    jev_status "jev-night-risk: error: no score answer for $DID in systemone response"
    exit 0
fi

rec=$(jev_envelope "risk" \
        "decision_id=$DID" \
        "slug=$SLUG" \
        "score:=$score" \
        "confidence:=$conf" \
        "input_tokens:=$tokens") || {
    jev_status "jev-night-risk: error: envelope build failed for $DID"
    exit 0
}
jev_append_line "$LOG_FILE" "$rec"
jev_status "jev-night-risk: logged risk line for $DID (score $score)"
