#!/usr/bin/env bash
# .claude/skills/cfn-alpha-launch/jev-gap-bucket.sh
# SHADOW ONLY: asks Jev to bucket each numbered item of docs/alpha/fix-list.md
# into {critical, high, medium} and appends one gap line per item to the shared
# JSONL log. Decides nothing: buckets go to the log only, never on stdout and
# never back into the fix-list, which is never edited. Exit 0 after a valid
# invocation regardless of API outcome so the shadow can never block alpha
# launch; usage errors exit non-zero.
#
# Usage: jev-gap-bucket.sh --fixlist <path>
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-gap-bucket.jsonl
# Line:  {type:"gap",ts,project,cwd,fixlist_mtime,item_no,section_now,
#         jev_bucket,confidence,input_tokens}
# Idempotent on fixlist_mtime: a rerun against an unchanged fix-list appends 0
# lines and makes no API call.
set -euo pipefail

CHUNK=25        # max questions per API call
ITEM_CAP=500    # per-item line cap, chars
INSTRUCTIONS="Bucket this alpha-launch gap by real urgency, not by the section it currently sits in."

usage() {
    printf 'usage: jev-gap-bucket.sh --fixlist <path>\n' >&2
    exit 64
}

FIXLIST=""
while [ $# -gt 0 ]; do
    case "$1" in
        --fixlist)
            [ -n "${2:-}" ] || usage
            FIXLIST="$2"
            shift 2
            ;;
        *) usage ;;
    esac
done
[ -n "$FIXLIST" ] || usage
[ -f "$FIXLIST" ] || { printf 'jev-gap-bucket: fix-list not found: %s\n' "$FIXLIST" >&2; exit 64; }

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CALLER="$SCRIPT_DIR/../../cfn-scripts/jev-systemone.sh"
if [ ! -f "$CALLER" ]; then
    printf 'jev-gap-bucket: error: caller script missing: %s\n' "$CALLER" >&2
    exit 0
fi

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-gap-bucket.jsonl"

command -v jq >/dev/null 2>&1 || { printf 'jev-gap-bucket: error: jq not found on PATH\n' >&2; exit 0; }

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the skill resolves from any project (reverse-symlink layout). Missing lib is
# a silent-out (exit 0) failure: the loop must never block on telemetry.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-gap-bucket: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

# GNU-tool shims for macOS (stat here); defines nothing on Linux.
# shellcheck source=/dev/null
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

mtime=$(stat -c %Y "$FIXLIST")

# Parse numbered items with the nearest preceding section header. Both the
# numbered-item and heading shapes follow the fix-list template the analyze
# instructions print (execute.sh step 4): "N. <desc> - Agent: <t> - File: <p>"
# under "## <Section>" headings.
declare -a item_nos=() item_secs=() item_lines=()
section=""
while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" =~ ^#{1,6}[[:space:]]+(.*)$ ]]; then
        section="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ ^[[:space:]]*([0-9]+)\.[[:space:]]+(.*)$ ]]; then
        item_nos+=("${BASH_REMATCH[1]}")
        item_secs+=("${section:-unknown}")
        item_lines+=("${BASH_REMATCH[2]:0:$ITEM_CAP}")
    fi
done < "$FIXLIST"

n=${#item_nos[@]}
if [ "$n" -eq 0 ]; then
    printf 'jev-gap-bucket: nothing to bucket: %s has no numbered items\n' "$(basename "$FIXLIST")" >&2
    exit 0
fi

# Idempotency: an unchanged fix-list (same mtime) was already bucketed.
if [ -f "$LOG_FILE" ] \
    && jq -e --argjson m "$mtime" \
        'select(.type == "gap" and .fixlist_mtime == $m)' "$LOG_FILE" >/dev/null 2>&1; then
    printf 'jev-gap-bucket: skip: %s: already bucketed (fixlist_mtime %s)\n' \
        "$(basename "$FIXLIST")" "$mtime" >&2
    exit 0
fi

# Bounded state: context line plus per-item {item_no, section, line}.
items_json="[]"
for ((i = 0; i < n; i++)); do
    items_json=$(jq -cn --argjson items "$items_json" \
        --argjson no "${item_nos[$i]}" \
        --arg sec "${item_secs[$i]}" \
        --arg line "${item_lines[$i]}" \
        '$items + [{item_no: $no, section: $sec, line: $line}]')
done
state=$(jq -cn \
    --arg ctx "Alpha-launch fix-list $(basename "$FIXLIST") (mtime $mtime). Bucket each numbered gap by urgency." \
    --argjson items "$items_json" \
    '{context: $ctx, items: $items}')

build_questions() {
    jq -cn --argjson nos "$1" --arg instr "$INSTRUCTIONS" '
        $nos | map({key: ., value: {
            type: "choice",
            instructions: $instr,
            criteria: {
                critical: "Blocker: exploitable, data-loss, or breaks a core flow; must be fixed before any launch.",
                high: "Ship before launch: correctness or quality issue users will likely hit, but not a blocker.",
                medium: "Polish or post-launch: minor style, consistency, or nice-to-have work."
            }
        }}) | from_entries'
}

logged=0
rc=0
resp_file=$(mktemp)
err_file=$(mktemp)
trap 'rm -f "$resp_file" "$err_file"' EXIT

for ((start = 0; start < n; start += CHUNK)); do
    chunk=("${item_nos[@]:start:CHUNK}")
    chunk_json=$(printf '%s\n' "${chunk[@]}" | jq -R . | jq -s -c '.')
    questions=$(build_questions "$chunk_json")
    input=$(jq -cn --argjson state "$state" --argjson questions "$questions" '{state: $state, questions: $questions}')

    rc=0
    printf '%s' "$input" | "$CALLER" >"$resp_file" 2>"$err_file" || rc=$?
    if [ "$rc" -eq 2 ]; then
        printf 'jev-gap-bucket: skip: %s: no TYPESAFE_API_KEY, %s items left unbucketed\n' \
            "$(basename "$FIXLIST")" "$((n - start))" >&2
        exit 0
    elif [ "$rc" -ne 0 ]; then
        err_text=$(tr '\n' ' ' < "$err_file" | sed 's/ *$//')
        printf 'jev-gap-bucket: error: %s: systemone call failed (rc %s): %s\n' \
            "$(basename "$FIXLIST")" "$rc" "$err_text" >&2
        exit 0
    fi

    usage_tokens=$(jq -r '.usage.input_tokens // 0' "$resp_file" 2>/dev/null || echo "0")
    for no in "${chunk[@]}"; do
        choice=$(jq -r --arg no "$no" '.answers[$no].choice // ""' "$resp_file" 2>/dev/null || true)
        conf=$(jq -r --arg no "$no" '.answers[$no].confidence // 0' "$resp_file" 2>/dev/null || echo "0")
        if [ -z "$choice" ]; then
            printf 'jev-gap-bucket: error: %s: no answer for item %s in systemone response\n' \
                "$(basename "$FIXLIST")" "$no" >&2
            continue
        fi
        sec_idx=-1
        for ((i = 0; i < n; i++)); do
            if [ "${item_nos[$i]}" = "$no" ]; then
                sec_idx=$i
                break
            fi
        done
        rec=$(jev_envelope gap \
            fixlist_mtime:="$mtime" \
            item_no:="$no" \
            "section_now=${item_secs[$sec_idx]}" \
            "jev_bucket=$choice" \
            confidence:="$conf" \
            input_tokens:="$usage_tokens")
        jev_append_line "$LOG_FILE" "$rec"
        logged=$((logged + 1))
    done
done

printf 'jev-gap-bucket: logged %s gap lines for %s\n' "$logged" "$(basename "$FIXLIST")" >&2
