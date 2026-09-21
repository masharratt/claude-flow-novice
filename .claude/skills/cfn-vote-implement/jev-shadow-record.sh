#!/usr/bin/env bash
# .claude/skills/cfn-vote-implement/jev-shadow-record.sh
# SHADOW ONLY: appends the panel's real vote outcome for a manifest to the
# shared JSONL log so it can be joined against Jev's triage lines later.
# Records either the vote tallies (yes-count per suggestion) or the final
# per-suggestion decisions written back to the manifest. Offline: no API call.
#
# Usage:
#   jev-shadow-record.sh --manifest <path> --tallies '<json map id->"N-yes">'
#   jev-shadow-record.sh --manifest <path> --finals '<json map id->status>'
# with N in 0..3 and status in implemented|skipped|rejected.
# Log: ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-vote-triage.jsonl
# Lines: {type:"tally",ts,project,cwd,manifest,suggestion_id,tally}
#        {type:"final",ts,project,cwd,manifest,suggestion_id,status}
# Usage errors exit non-zero (64). Appends never fail the caller loudly.
set -euo pipefail

usage() {
    printf 'usage: jev-shadow-record.sh --manifest <path> (--tallies <json> | --finals <json>)\n' >&2
    exit 64
}

MANIFEST=""
MODE=""
MAP=""
while [ $# -gt 0 ]; do
    case "$1" in
        --manifest)
            [ -n "${2:-}" ] || usage
            MANIFEST="$2"
            shift 2
            ;;
        --tallies)
            [ -n "${2:-}" ] || usage
            MODE="tally"
            MAP="$2"
            shift 2
            ;;
        --finals)
            [ -n "${2:-}" ] || usage
            MODE="final"
            MAP="$2"
            shift 2
            ;;
        *) usage ;;
    esac
done
[ -n "$MANIFEST" ] && [ -n "$MODE" ] && [ -n "$MAP" ] || usage
[ -f "$MANIFEST" ] || { printf 'jev-shadow-record: manifest not found: %s\n' "$MANIFEST" >&2; exit 64; }

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-vote-triage.jsonl"
BASE=$(basename "$MANIFEST")

command -v jq >/dev/null 2>&1 || { printf 'jev-shadow-record: error: jq not found on PATH\n' >&2; exit 0; }

# Validate the map: non-empty object with values in the mode's domain.
jq -e 'type == "object" and length > 0' >/dev/null 2>&1 <<<"$MAP" || usage
if [ "$MODE" = "tally" ]; then
    jq -e '[.[] | test("^[0-3]-yes$")] | all' >/dev/null 2>&1 <<<"$MAP" || {
        printf 'jev-shadow-record: invalid tallies (expected id -> "N-yes", N in 0..3)\n' >&2
        exit 64
    }
else
    jq -e '[.[] | test("^(implemented|skipped|rejected)$")] | all' >/dev/null 2>&1 <<<"$MAP" || {
        printf 'jev-shadow-record: invalid finals (expected id -> implemented|skipped|rejected)\n' >&2
        exit 64
    }
fi

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the skill resolves from any project (reverse-symlink layout). Missing lib
# is a silent-out (exit 0) failure: appends must never fail the caller loudly.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-shadow-record: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
project=$(basename "$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || pwd)")
cwd=$(pwd)

logged=0
value_field="tally"
[ "$MODE" = "final" ] && value_field="status"
for id in $(jq -r 'keys[]' <<<"$MAP"); do
    value=$(jq -r --arg id "$id" '.[$id]' <<<"$MAP")
    rec=$(jq -cn \
        --arg ts "$ts" \
        --arg project "$project" \
        --arg cwd "$cwd" \
        --arg manifest "$BASE" \
        --arg id "$id" \
        --arg value "$value" \
        --arg type "$MODE" \
        --arg field "$value_field" \
        '{type: $type, ts: $ts, project: $project, cwd: $cwd, manifest: $manifest,
          suggestion_id: $id, ($field): $value}')
    jev_append_line "$LOG_FILE" "$rec"
    logged=$((logged + 1))
done

printf 'jev-shadow-record: logged %s %s lines for %s\n' "$logged" "$MODE" "$BASE" >&2
