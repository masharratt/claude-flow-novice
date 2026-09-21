#!/usr/bin/env bash
# .claude/cfn-scripts/jev-shadow-summary.sh
# Generic summarizer for any Jev shadow JSONL log (batch 2, Phase 1). Prints
# total rows plus skip/error counts and one project x verdict table. The
# verdict value is read from the first present of: verdict, choice,
# jev_verdict, jev_bucket, score, status, tally; lines carrying none count
# under "?".
# No pilot-specific joins: every log line already carries both the current
# mechanism's outcome and Jev's verdict.
# Exit codes: 0 rows only, 1 errors present (type "error" lines or
# unparseable lines), 2 zero data rows with a rendered certified-nothing
# line, 64 usage error.
# Usage: jev-shadow-summary.sh --log jev-<name>.jsonl
#        A bare name resolves under ${CFN_DATA_DIR:-$HOME/.claude/cfn-data};
#        a path containing / is used as given.
set -euo pipefail

usage() {
    printf 'usage: jev-shadow-summary.sh --log jev-<name>.jsonl\n' >&2
    exit 64
}

LOG_ARG=""
while [ $# -gt 0 ]; do
    case "$1" in
        --log)
            [ -n "${2:-}" ] || usage
            LOG_ARG="$2"
            shift 2
            ;;
        *) usage ;;
    esac
done
[ -n "$LOG_ARG" ] || usage

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=jev-shadow-lib.sh
source "$SCRIPT_DIR/jev-shadow-lib.sh"

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$LOG_ARG"
case "$LOG_ARG" in
    */*) ;;
    *) LOG_FILE="$DATA_DIR/$LOG_ARG" ;;
esac

command -v jq >/dev/null 2>&1 || { jev_status "jev-shadow-summary: error: jq not found on PATH"; exit 3; }

if [ ! -f "$LOG_FILE" ]; then
    printf 'jev-shadow-summary: certified nothing (0 rows): log missing: %s\n' "$LOG_FILE"
    exit 2
fi

jq_prog='
    def verdict_of:
        if has("verdict") then .verdict
        elif has("choice") then .choice
        elif has("jev_verdict") then .jev_verdict
        elif has("jev_bucket") then .jev_bucket
        elif has("score") then (.score | tostring)
        elif has("status") then .status
        elif has("tally") then .tally
        else "?" end;
    [(.type // "?"), (.project // "?"), (verdict_of | tostring)] | @tsv'

parsed=""
jq_failed=0
if [ -s "$LOG_FILE" ]; then
    parsed=$(jq -r "$jq_prog" "$LOG_FILE" 2>/dev/null) || jq_failed=1
fi

raw_lines=$(grep -c . "$LOG_FILE" 2>/dev/null || true)
n_parsed=0
if [ -n "$parsed" ]; then
    n_parsed=$(printf '%s\n' "$parsed" | grep -c . || true)
fi
parse_errors=$((raw_lines - n_parsed))
if [ "$parse_errors" -lt 0 ]; then
    parse_errors=0
fi
if [ "$jq_failed" -eq 1 ] && [ "$parse_errors" -eq 0 ]; then
    # jq bailed before emitting anything: every non-empty line is unreadable.
    parse_errors=$raw_lines
fi

totals=$(printf '%s\n' "$parsed" | awk -F'\t' '
    $1 == "skip"  { sk++; next }
    $1 == "error" { er++; next }
    NF >= 3       { rows++ }
    END { printf "%d %d %d\n", rows + 0, sk + 0, er + 0 }')
read -r data_rows skip_count type_errors <<< "$totals"
err_total=$((type_errors + parse_errors))

if [ "$data_rows" -eq 0 ] && [ "$err_total" -eq 0 ]; then
    printf 'jev-shadow-summary: certified nothing (0 rows): %s\n' "$LOG_FILE"
    if [ "$skip_count" -gt 0 ]; then
        printf 'jev-shadow-summary: skip: %s\n' "$skip_count"
    fi
    exit 2
fi

printf '%s\n' "$parsed" | awk -F'\t' '
    $1 == "skip"  { sk[$2]++; next }
    $1 == "error" { er[$2]++; next }
    NF >= 3       { cnt[$2 SUBSEP $3]++ }
    END {
        sk_total = 0; for (k in sk) sk_total += sk[k]
        er_total = 0; for (k in er) er_total += er[k]
        n = 0
        for (k in cnt) {
            split(k, p, SUBSEP)
            rows[++n] = p[1] "\t" p[2] "\t" cnt[k]
        }
        for (i = 1; i <= n; i++)
            for (j = i + 1; j <= n; j++)
                if (rows[j] < rows[i]) { t = rows[i]; rows[i] = rows[j]; rows[j] = t }
        pw = 7; vw = 7
        for (i = 1; i <= n; i++) {
            split(rows[i], p, "\t")
            if (length(p[1]) > pw) pw = length(p[1])
            if (length(p[2]) > vw) vw = length(p[2])
        }
        printf "rows: %d\n", n
        printf "skip: %d\n", sk_total
        printf "error: %d\n", er_total
        if (n > 0) {
            printf "\n%-*s  %-*s  %s\n", pw, "project", vw, "verdict", "count"
            for (i = 1; i <= n; i++) {
                split(rows[i], p, "\t")
                printf "%-*s  %-*s  %s\n", pw, p[1], vw, p[2], p[3]
            }
        }
    }'

if [ "$err_total" -gt 0 ]; then
    if [ "$parse_errors" -gt 0 ]; then
        jev_status "jev-shadow-summary: $parse_errors unparseable line(s) in $LOG_FILE treated as errors"
    fi
    exit 1
fi
exit 0
