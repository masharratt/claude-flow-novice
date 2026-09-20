#!/usr/bin/env bash
# .claude/skills/cfn-vote-implement/jev-shadow-report.sh
# SHADOW ONLY, on demand: joins Jev triage lines with the panel's tally and
# final lines for a manifest and reports the agreement rate. Informational
# only: never part of any loop gate or exit path. Offline: no API call.
#
# Usage: jev-shadow-report.sh --manifest <path>
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-vote-triage.jsonl
# Join:  (manifest basename, suggestion_id) across type triage/tally/final;
#        a row counts as joined only when all three lines exist.
# Expected: implement_now <-> final implemented; reject <-> final rejected or
# skipped; needs_panel <-> anything.
# Exit:  0 all joined rows agree, 1 mismatches (named), 2 zero joined rows
#        with a rendered "certified nothing" line.
set -euo pipefail

usage() {
    printf 'usage: jev-shadow-report.sh --manifest <path>\n' >&2
    exit 64
}

MANIFEST=""
while [ $# -gt 0 ]; do
    case "$1" in
        --manifest)
            [ -n "${2:-}" ] || usage
            MANIFEST="$2"
            shift 2
            ;;
        *) usage ;;
    esac
done
[ -n "$MANIFEST" ] || usage

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-vote-triage.jsonl"
BASE=$(basename "$MANIFEST")

command -v jq >/dev/null 2>&1 || { printf 'jev-shadow-report: error: jq not found on PATH\n' >&2; exit 2; }

# Three-way inner join on (manifest, suggestion_id). Missing log = no rows.
joined="[]"
if [ -f "$LOG_FILE" ]; then
    joined=$(jq -s --arg m "$BASE" '
        map(select((.manifest // "") == $m))
        | (map(select(.type == "triage")) | map({key: .suggestion_id, value: .}) | from_entries) as $t
        | (map(select(.type == "tally"))  | map({key: .suggestion_id, value: .}) | from_entries) as $y
        | (map(select(.type == "final"))  | map({key: .suggestion_id, value: .}) | from_entries) as $f
        | [ ($t | keys[]) as $id
            | select($y[$id] != null and $f[$id] != null)
            | {id: $id, choice: ($t[$id].choice // ""), tally: ($y[$id].tally // ""), final: ($f[$id].status // "")} ]
    ' "$LOG_FILE" 2>/dev/null || printf '[]')
fi

count=$(jq 'length' <<<"$joined")
printf 'joined_rows: %s\n' "$count"

if [ "$count" -eq 0 ]; then
    printf 'agreements: 0\n'
    printf 'mismatches: 0\n'
    printf 'certified nothing (0 joined rows)\n'
    exit 2
fi

agree=0
mismatches=0
while IFS=$'\t' read -r id choice tally final; do
    row_agree=0
    case "$choice" in
        needs_panel) row_agree=1 ;;
        implement_now) [ "$final" = "implemented" ] && row_agree=1 ;;
        reject) { [ "$final" = "rejected" ] || [ "$final" = "skipped" ]; } && row_agree=1 ;;
    esac || true
    if [ "$row_agree" -eq 1 ]; then
        agree=$((agree + 1))
    else
        mismatches=$((mismatches + 1))
        printf 'mismatch %s: jev=%s tally=%s final=%s\n' "$id" "$choice" "$tally" "$final"
    fi
done < <(jq -r '.[] | [.id, .choice, .tally, .final] | @tsv' <<<"$joined")

printf 'agreements: %s\n' "$agree"
printf 'mismatches: %s\n' "$mismatches"

if [ "$mismatches" -gt 0 ]; then
    exit 1
fi
exit 0
