#!/usr/bin/env bash
# .claude/skills/cfn-loop-orchestration-v2/lib/task-mode/jev-retry-context.sh
# SHADOW ONLY: slices a failed test run into failure units, asks Jev to
# classify each unit into a fixed 8-bucket cause menu, groups the verdicts,
# and writes a reduced context file for spot-checking. Decides nothing: the
# coordinator's grep of the raw test output stays authoritative, and the
# reduced file is never fed back into the loop. Exit 0 after a valid
# invocation regardless of API outcome so the shadow can never block the
# loop; usage errors exit 64. No stdout.
#
# Usage: jev-retry-context.sh --run-id <id> [--test-output <path>]
#        --test-output defaults to /tmp/test-output-${RUN_ID}.txt
# Out:   /tmp/test-context-${RUN_ID}.md (only on a fully successful triage)
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-retry-context.jsonl
# Line:  {type:"stats",ts,project,cwd,run_id,total_units,buckets:{8 counts},
#         low_conf,orig_lines,reduced_lines}
# Idempotent on run_id: a run that already has a stats line is skipped and
# makes no API call.
set -euo pipefail

MAX_UNITS=60       # unit cap: one question per unit, never more
CHUNK=25           # max questions per API call
UNIT_TEXT_CAP=2000 # per-unit text cap, chars
LOW_CONF=0.6       # below this confidence the unit keeps its full excerpt

BUCKETS=(compile_error assertion_mismatch timeout missing_env_or_dep connection_or_infra oom_killed flaky_timing unclear)

INSTRUCTIONS="Classify this failing-test excerpt into exactly one cause bucket, based only on the excerpt text."

usage() {
    printf 'usage: jev-retry-context.sh --run-id <id> [--test-output <path>]\n' >&2
    exit 64
}

RUN_ID=""
TEST_OUTPUT=""
while [ $# -gt 0 ]; do
    case "$1" in
        --run-id)      [ -n "${2:-}" ] || usage; RUN_ID="$2"; shift 2 ;;
        --test-output) [ -n "${2:-}" ] || usage; TEST_OUTPUT="$2"; shift 2 ;;
        *) usage ;;
    esac
done
[ -n "$RUN_ID" ] || usage
[ -n "$TEST_OUTPUT" ] || TEST_OUTPUT="/tmp/test-output-${RUN_ID}.txt"
[ -f "$TEST_OUTPUT" ] || { printf 'jev-retry-context: error: test output not found: %s\n' "$TEST_OUTPUT" >&2; exit 64; }

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CALLER="$SCRIPT_DIR/../../../../cfn-scripts/jev-systemone.sh"
if [ ! -f "$CALLER" ]; then
    printf 'jev-retry-context: error: caller script missing: %s\n' "$CALLER" >&2
    exit 0
fi

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-retry-context.jsonl"
REDUCED="/tmp/test-context-${RUN_ID}.md"

command -v jq >/dev/null 2>&1 || { printf 'jev-retry-context: error: jq not found on PATH\n' >&2; exit 0; }

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the script resolves from any project (reverse-symlink layout). Missing lib
# is a silent-out (exit 0) failure, same as every other shadow-internal
# failure: the loop must never block on telemetry.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-retry-context: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

# Idempotency: a stats line for this run-id means the run is already triaged.
if [ -f "$LOG_FILE" ]; then
    if jq -re --arg r "$RUN_ID" 'select(.type == "stats" and .run_id == $r) | .run_id' \
        "$LOG_FILE" >/dev/null 2>&1; then
        jev_status "jev-retry-context: skip: run $RUN_ID already triaged (stats line exists)"
        exit 0
    fi
fi

# Slice units: a failure-marker line (same FAIL / X / X markers the
# coordinator greps) opens a unit of the marker line plus the next 3 lines.
lines=()
while IFS= read -r ln || [ -n "$ln" ]; do
    lines+=("$ln")
done < "$TEST_OUTPUT"
n_lines=${#lines[@]}
unit_texts=()
i=0
while [ "$i" -lt "$n_lines" ]; do
    # shellcheck disable=SC2076
    if [[ "${lines[$i]}" =~ (FAIL|✗|✕) ]]; then
        unit="${lines[$i]}"
        for off in 1 2 3; do
            if [ $((i + off)) -lt "$n_lines" ]; then
                unit+=$'\n'"${lines[$((i + off))]}"
            fi
        done
        if [ "${#unit}" -gt "$UNIT_TEXT_CAP" ]; then
            unit="${unit:0:$UNIT_TEXT_CAP}"
        fi
        unit_texts+=("$unit")
        if [ "${#unit_texts[@]}" -ge "$MAX_UNITS" ]; then
            break
        fi
        i=$((i + 4))
    else
        i=$((i + 1))
    fi
done
n_units=${#unit_texts[@]}
if [ "$n_units" -eq 0 ]; then
    jev_status "jev-retry-context: no failure markers found in $TEST_OUTPUT (run $RUN_ID)"
    exit 0
fi

units_json="[]"
for t in "${unit_texts[@]}"; do
    units_json=$(printf '%s' "$units_json" | jq -c --arg t "$t" \
        '. + [{id: ("u" + (length + 1 | tostring)), text: $t}]')
done
state=$(jq -cn --arg run_id "$RUN_ID" --arg source "$TEST_OUTPUT" --argjson units "$units_json" \
    '{run_id: $run_id, source: $source, units: $units}')

all_ids=()
for ((k = 1; k <= n_units; k++)); do
    all_ids+=("u$k")
done

resp_file=$(mktemp)
err_file=$(mktemp)
trap 'rm -f "$resp_file" "$err_file"' EXIT

choices=()
confs=()
for ((start = 0; start < n_units; start += CHUNK)); do
    chunk=("${all_ids[@]:$start:$CHUNK}")
    chunk_json=$(printf '%s\n' "${chunk[@]}" | jq -R . | jq -s -c '.')
    questions=$(printf '%s' "$units_json" | jq -c --argjson ids "$chunk_json" \
        --arg instr "$INSTRUCTIONS" '
        [.[] | select(.id as $id | $ids | index($id))]
        | map({key: .id, value: {type: "choice", instructions: $instr, criteria: {
            compile_error: "A type, syntax, or module-resolution error, or a build step that failed before tests could run.",
            assertion_mismatch: "The test ran and an expected value did not match what the code produced.",
            timeout: "The runner killed the test for exceeding a time limit.",
            missing_env_or_dep: "A required environment variable, file, or dependency is absent.",
            connection_or_infra: "A network, database, or external service connection failure.",
            oom_killed: "The process was killed for memory exhaustion (OOM, Killed, heap out of memory).",
            flaky_timing: "A race, sleep-based wait, or order-dependent timing failure.",
            unclear: "The excerpt shows no cause: noise, empty, or unreadable."
        }}})
        | from_entries')
    input=$(jq -cn --argjson state "$state" --argjson questions "$questions" \
        '{state: $state, questions: $questions}')

    rc=0
    printf '%s' "$input" | "$CALLER" >"$resp_file" 2>"$err_file" || rc=$?
    if [ "$rc" -eq 2 ]; then
        rec=$(jev_envelope skip run_id="$RUN_ID" total_units:="$n_units" detail="no TYPESAFE_API_KEY")
        jev_append_line "$LOG_FILE" "$rec"
        jev_status "jev-retry-context: skip: no TYPESAFE_API_KEY, $((n_units - start)) units untriaged (run $RUN_ID)"
        exit 0
    elif [ "$rc" -ne 0 ]; then
        rec=$(jev_envelope error run_id="$RUN_ID" total_units:="$n_units" detail="systemone rc $rc")
        jev_append_line "$LOG_FILE" "$rec"
        jev_status "jev-retry-context: error: systemone call failed (rc $rc), no reduced file written (run $RUN_ID)"
        exit 0
    fi

    for id in "${chunk[@]}"; do
        choice=$(jq -r --arg id "$id" '.answers[$id].choice // ""' "$resp_file" 2>/dev/null || true)
        conf=$(jq -r --arg id "$id" '.answers[$id].confidence // 0' "$resp_file" 2>/dev/null || echo "0")
        choices+=("$choice")
        confs+=("$conf")
    done
done

# Tally: an off-menu or missing answer falls back to unclear at confidence 0.
# Bucket tallies use printf -v plus ${!var} indirection (bash 3.1+) instead of
# associative arrays (bash 4 only) so macOS bash 3.2 stays supported.
for b in "${BUCKETS[@]}"; do
    printf -v "count_$b" '%s' 0
done
low_conf_count=0
full_ids=()
for ((k = 0; k < n_units; k++)); do
    choice="${choices[$k]}"
    conf="${confs[$k]:-0}"
    valid=""
    case " ${BUCKETS[*]} " in
        *" $choice "*) valid=1 ;;
    esac
    if [ -z "$valid" ]; then
        if [ -n "$choice" ]; then
            jev_status "jev-retry-context: error: no answer for u$((k + 1)) in systemone response (run $RUN_ID)"
        fi
        choice="unclear"
        conf="0"
    fi
    cntvar="count_$choice"
    printf -v "$cntvar" '%s' $(( ${!cntvar} + 1 ))
    is_low=$(awk -v c="$conf" -v t="$LOW_CONF" 'BEGIN { print (c + 0 < t) ? 1 : 0 }')
    if [ "$is_low" -eq 1 ]; then
        low_conf_count=$((low_conf_count + 1))
    fi
    exvar="excerpt_$choice"
    if [ -z "${!exvar:-}" ]; then
        printf -v "$exvar" '%s' "${unit_texts[$k]}"
    fi
    if [ "$choice" = "unclear" ] || [ "$is_low" -eq 1 ]; then
        full_ids+=("u$((k + 1))")
        printf -v "fb_u$((k + 1))" '%s' "$choice"
    fi
done

# Reduced file: per-bucket counts, one verbatim excerpt per bucket, and the
# full excerpt of every low-confidence or unclear unit.
{
    printf '# Jev retry context (shadow) - run %s\n\n' "$RUN_ID"
    printf 'Source: %s\n' "$TEST_OUTPUT"
    printf 'Units triaged: %s, low confidence or unclear: %s\n' "$n_units" "$low_conf_count"
    printf 'Shadow spot-check only. The coordinator grep of the raw output stays authoritative.\n\n'
    printf '## Bucket counts\n'
    for b in "${BUCKETS[@]}"; do
        cntvar="count_$b"
        printf -- '- %s: %s\n' "$b" "${!cntvar}"
    done
    printf '\n## First excerpt per bucket\n'
    for b in "${BUCKETS[@]}"; do
        exvar="excerpt_$b"
        cntvar="count_$b"
        [ -n "${!exvar:-}" ] || continue
        printf '\n### %s (%s)\n```\n%s\n```\n' "$b" "${!cntvar}" "${!exvar}"
    done
    if [ "${#full_ids[@]}" -gt 0 ]; then
        printf '\n## Low confidence or unclear (full excerpts)\n'
        for fid in "${full_ids[@]}"; do
            idx="${fid#u}"
            idx=$((idx - 1))
            fbvar="fb_$fid"
            printf '\n### %s (%s)\n```\n%s\n```\n' "$fid" "${!fbvar}" "${unit_texts[$idx]}"
        done
    fi
} > "$REDUCED"

orig_lines=$(wc -l < "$TEST_OUTPUT")
orig_lines=$((orig_lines))
reduced_lines=$(wc -l < "$REDUCED")
reduced_lines=$((reduced_lines))

buckets_json="{"
first=1
for b in "${BUCKETS[@]}"; do
    if [ "$first" -eq 1 ]; then
        first=0
    else
        buckets_json+=","
    fi
    cntvar="count_$b"
    buckets_json+="\"$b\":${!cntvar}"
done
buckets_json+="}"

rec=$(jev_envelope stats run_id="$RUN_ID" total_units:="$n_units" buckets:="$buckets_json" \
    low_conf:="$low_conf_count" orig_lines:="$orig_lines" reduced_lines:="$reduced_lines")
jev_append_line "$LOG_FILE" "$rec"
jev_status "jev-retry-context: logged stats for run $RUN_ID ($n_units units, $orig_lines -> $reduced_lines lines): $REDUCED"
