#!/usr/bin/env bash
# .claude/skills/cfn-tech-debt/jev-rot-risk.sh
# SHADOW ONLY: asks Jev to score rot risk (0-2) for every has_trigger==false
# row in a tech-debt ledger and appends one score line per row to the shared
# JSONL log. Decides nothing: scores go to the log only, never on stdout, and
# the ledger file is only ever read, never written. Exit 0 after a valid
# invocation regardless of API outcome so the shadow can never block a
# harvest; usage errors exit non-zero.
#
# Usage: jev-rot-risk.sh --ledger <path>
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-rot-risk.jsonl
# Line:  {type:"rot",ts,project,cwd,ledger_generated,file,line,
#         ceiling<=160,score,confidence,input_tokens}
set -euo pipefail

CHUNK=25        # max questions per API call
CEILING_CAP=160 # per-row ceiling cap, chars (matches the line-shape contract)
INSTRUCTIONS="Score the rot risk of this deliberate shortcut (a cfn: ceiling marker with no upgrade trigger). 0 means stable and justified, 1 means starting to rot, 2 means actively rotting and already costing work."

usage() {
    printf 'usage: jev-rot-risk.sh --ledger <path>\n' >&2
    exit 64
}

LEDGER=""
while [ $# -gt 0 ]; do
    case "$1" in
        --ledger)
            [ -n "${2:-}" ] || usage
            LEDGER="$2"
            shift 2
            ;;
        *) usage ;;
    esac
done
[ -n "$LEDGER" ] || usage
[ -f "$LEDGER" ] || { printf 'jev-rot-risk: ledger not found: %s\n' "$LEDGER" >&2; exit 64; }

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CALLER="$SCRIPT_DIR/../../cfn-scripts/jev-systemone.sh"
if [ ! -f "$CALLER" ]; then
    printf 'jev-rot-risk: error: caller script missing: %s\n' "$CALLER" >&2
    exit 0
fi

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-rot-risk.jsonl"
BASE=$(basename "$LEDGER")

command -v jq >/dev/null 2>&1 || { printf 'jev-rot-risk: error: jq not found on PATH\n' >&2; exit 0; }

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the skill resolves from any project (reverse-symlink layout). Missing lib
# is a silent-out (exit 0) failure, same as every other shadow-internal
# failure: the harvest must never block on telemetry.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-rot-risk: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

generated=$(jq -r '.generated // ""' "$LEDGER" 2>/dev/null || echo "")

# Only has_trigger==false rows are scored; the ledger itself is read-only.
rows=$(jq -c --argjson cap "$CEILING_CAP" '
    [.markers[] | select(.has_trigger == false)] |
    map({file, line: (.line | tonumber), ceiling: ((.ceiling // "") | .[0:$cap])})' \
    "$LEDGER" 2>/dev/null || echo "[]")
n=$(jq 'length' <<<"$rows")
if [ "$n" -eq 0 ]; then
    printf 'jev-rot-risk: nothing to score: %s has no no-trigger rows\n' "$BASE" >&2
    exit 0
fi

# Row ids R001..R999 (zero padded, [-3:] keeps it correct past 9).
ids=$(jq -cn --argjson n "$n" '[range(1; $n + 1) | "R" + ("00" + (. | tostring))[-3:]]')

# State: the ledger context plus the capped rows, ids folded in so state and
# questions stay aligned.
state=$(jq -cn --arg generated "$generated" --argjson rows "$rows" '
    {ledger_generated: $generated, rows: $rows}')

# One score question per row, chunked at $CHUNK per API call.
build_questions() {
    jq -cn --argjson rows "$rows" --arg instr "$INSTRUCTIONS" --argjson from "$1" --argjson to "$2" '
        [range($from; $to)] |
        map(. as $i |
            {key: ("R" + ("00" + ($i + 1 | tostring))[-3:]), value: {
                type: "score",
                instructions: $instr,
                criteria: {
                    "0": "Stable: the shortcut is justified where it sits, nothing is drifting, and nobody has worked around it.",
                    "1": "Starting to rot: minor drift or a workaround has appeared, but nothing is blocked yet.",
                    "2": "Actively rotting: the shortcut is already causing bugs, workarounds, or blocked work."
                }
            }})
        | from_entries' <<<"$rows"
}

log_skip_row() {
    local idx="$1"
    local file line
    file=$(jq -r ".[$idx].file // \"?\"" <<<"$rows")
    line=$(jq -r ".[$idx].line // 0" <<<"$rows")
    printf 'jev-rot-risk: skip: no TYPESAFE_API_KEY, row unskipped: %s:%s\n' "$file" "$line" >&2
}

logged=0
usage_tokens=0
for ((start = 0; start < n; start += CHUNK)); do
    end=$((start + CHUNK))
    [ "$end" -le "$n" ] || end=$n
    questions=$(build_questions "$start" "$end")
    input=$(jq -cn --argjson state "$state" --argjson questions "$questions" '{state: $state, questions: $questions}')

    resp_file=$(mktemp)
    err_file=$(mktemp)
    rc=0
    printf '%s' "$input" | "$CALLER" >"$resp_file" 2>"$err_file" || rc=$?
    if [ "$rc" -eq 2 ]; then
        rm -f "$resp_file" "$err_file"
        for ((i = start; i < n; i++)); do
            log_skip_row "$i"
        done
        exit 0
    elif [ "$rc" -ne 0 ]; then
        err_text=$(tr '\n' ' ' < "$err_file" | sed 's/ *$//')
        rm -f "$resp_file" "$err_file"
        printf 'jev-rot-risk: error: %s: systemone call failed (rc %s): %s\n' "$BASE" "$rc" "$err_text" >&2
        exit 0
    fi

    usage_tokens=$(jq -r '.usage.input_tokens // 0' "$resp_file" 2>/dev/null || echo "0")
    for ((i = start; i < end; i++)); do
        id=$(jq -r ".[$i]" <<<"$ids")
        file=$(jq -r ".rows[$i].file" <<<"$state")
        line=$(jq -r ".rows[$i].line" <<<"$state")
        ceiling=$(jq -r ".rows[$i].ceiling" <<<"$state")
        score=$(jq -r --arg id "$id" '.answers[$id].score // .answers[$id].choice // ""' "$resp_file" 2>/dev/null || true)
        conf=$(jq -r --arg id "$id" '.answers[$id].confidence // 0' "$resp_file" 2>/dev/null || echo "0")
        if [ -z "$score" ]; then
            printf 'jev-rot-risk: error: %s: no answer for %s in systemone response\n' "$BASE" "$id" >&2
            continue
        fi
        if [[ "$score" =~ ^[0-2]$ ]]; then
            score_pair="score:=$score"
        else
            score_pair="score=$score"
        fi
        rec=$(jev_envelope rot \
            "ledger_generated=$generated" \
            "file=$file" \
            "line:=$line" \
            "ceiling=$ceiling" \
            "$score_pair" \
            "confidence:=$conf" \
            "input_tokens:=$usage_tokens")
        jev_append_line "$LOG_FILE" "$rec"
        logged=$((logged + 1))
    done
    rm -f "$resp_file" "$err_file"
done

printf 'jev-rot-risk: logged %s score lines for %s\n' "$logged" "$BASE" >&2
