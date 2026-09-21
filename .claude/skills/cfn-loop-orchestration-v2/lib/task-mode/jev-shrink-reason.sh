#!/usr/bin/env bash
# .claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-shrink-reason.sh
# SHADOW ONLY: asks Jev whether a declared tests_removed_reason is a specific,
# genuine flake justification and appends one verdict line to the shared JSONL
# log. Decides nothing: the coordinator still accepts or escalates the exit-3
# shrink exactly as the cfn-loop-task doc says. Exit 0 after a valid
# invocation regardless of API outcome so the shadow can never block the
# loop; usage errors exit 64. No stdout, ever.
#
# Usage: jev-shrink-reason.sh --reason <s> --baseline <n> --total <n> --run-id <id>
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-shrink-reason.jsonl
# Line:  {type:"shrink",ts,project,cwd,run_id,reason<=200,baseline,total,
#         jev_verdict,confidence,input_tokens}
set -euo pipefail

usage() {
    printf 'usage: jev-shrink-reason.sh --reason <s> --baseline <n> --total <n> --run-id <id>\n' >&2
    exit 64
}

REASON="" BASELINE="" TOTAL="" RUN_ID=""
while [ $# -gt 0 ]; do
    case "$1" in
        --reason)   [ -n "${2:-}" ] || usage; REASON="$2"; shift 2 ;;
        --baseline) [ -n "${2:-}" ] || usage; BASELINE="$2"; shift 2 ;;
        --total)    [ -n "${2:-}" ] || usage; TOTAL="$2"; shift 2 ;;
        --run-id)   [ -n "${2:-}" ] || usage; RUN_ID="$2"; shift 2 ;;
        *) usage ;;
    esac
done
[ -n "$REASON" ] && [ -n "$BASELINE" ] && [ -n "$TOTAL" ] && [ -n "$RUN_ID" ] || usage
case "$BASELINE$TOTAL" in
    *[!0-9]*) usage ;;
esac

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CALLER="$SCRIPT_DIR/../../../../cfn-scripts/jev-systemone.sh"
if [ ! -f "$CALLER" ]; then
    printf 'jev-shrink-reason: error: caller script missing: %s\n' "$CALLER" >&2
    exit 0
fi

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-shrink-reason.jsonl"

command -v jq >/dev/null 2>&1 || { printf 'jev-shrink-reason: error: jq not found on PATH\n' >&2; exit 0; }

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the script resolves from any project (reverse-symlink layout). Missing lib
# is a silent-out (exit 0) failure, same as every other shadow-internal
# failure: the loop must never block on telemetry.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-shrink-reason: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

# State carries the declared reason plus the baseline/total delta; the
# question is a single noul (boolean) judgment on that state.
state=$(jq -cn \
    --arg run_id "$RUN_ID" \
    --arg reason "$REASON" \
    --argjson baseline "$BASELINE" \
    --argjson total "$TOTAL" \
    '{run_id: $run_id, reason: $reason, baseline: $baseline, total: $total, delta: ($total - $baseline)}')
input=$(jq -cn --argjson state "$state" '{state: $state, questions: {shrink: {
    type: "noul",
    instructions: "Is this reason a specific, genuine justification for the smaller test suite?",
    criteria: {
        true: "Specific and genuine: it names what was removed and why it was flaky, duplicated, or obsolete.",
        false: "Vague or suspicious: no specifics, or it reads as cover for losing real coverage."
    }
}}}')

resp_file=$(mktemp)
trap 'rm -f "$resp_file"' EXIT

reason_cap="${REASON:0:200}"
rc=0
printf '%s' "$input" | "$CALLER" >"$resp_file" 2>/dev/null || rc=$?
if [ "$rc" -eq 2 ]; then
    rec=$(jev_envelope skip run_id="$RUN_ID" reason="$reason_cap" baseline:="$BASELINE" total:="$TOTAL")
    jev_append_line "$LOG_FILE" "$rec"
    jev_status "jev-shrink-reason: skip: no TYPESAFE_API_KEY, verdict not recorded (run $RUN_ID)"
    exit 0
elif [ "$rc" -ne 0 ]; then
    rec=$(jev_envelope error run_id="$RUN_ID" reason="$reason_cap" baseline:="$BASELINE" total:="$TOTAL" detail="systemone rc $rc")
    jev_append_line "$LOG_FILE" "$rec"
    jev_status "jev-shrink-reason: error: systemone call failed (rc $rc), verdict not recorded (run $RUN_ID)"
    exit 0
fi

noul=$(jq -r '.answers.shrink.noul // empty' "$resp_file" 2>/dev/null || true)
case "$noul" in
    ""|*[!0-9.]*) noul="" ;;
esac
if [ -z "$noul" ]; then
    rec=$(jev_envelope error run_id="$RUN_ID" reason="$reason_cap" baseline:="$BASELINE" total:="$TOTAL" detail="no noul answer in response")
    jev_append_line "$LOG_FILE" "$rec"
    jev_status "jev-shrink-reason: error: no noul answer in systemone response (run $RUN_ID)"
    exit 0
fi
tokens=$(jq -r '.usage.input_tokens // 0' "$resp_file" 2>/dev/null || echo "0")

verdict=$(awk -v n="$noul" 'BEGIN { print (n >= 0.5) ? "true" : "false" }')
rec=$(jev_envelope shrink run_id="$RUN_ID" reason="$reason_cap" baseline:="$BASELINE" total:="$TOTAL" \
    jev_verdict="$verdict" confidence:="$noul" input_tokens:="$tokens")
jev_append_line "$LOG_FILE" "$rec"
jev_status "jev-shrink-reason: logged verdict $verdict (confidence $noul) for run $RUN_ID"
