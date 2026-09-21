#!/usr/bin/env bash
# .claude/skills/cfn-vote-implement/jev-triage.sh
# SHADOW ONLY: asks Jev to pre-triage review suggestions from a vote manifest
# and appends one triage line per suggestion to the shared JSONL log. Decides
# nothing: choices go to the log only, never on stdout and never shown to
# voters. Exit 0 after a valid invocation regardless of API outcome so the
# shadow can never block the loop; usage errors exit non-zero.
#
# Usage: jev-triage.sh --manifest <path>
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-vote-triage.jsonl
# Line:  {type:"triage",ts,project,cwd,manifest,suggestion_id,choice,
#         confidence,input_tokens}
# Idempotent on (manifest, suggestion_id): already-triaged suggestions are
# skipped and make no API call.
set -euo pipefail

CHUNK=25          # max questions per API call
DESC_CAP=2000     # per-suggestion description cap, chars
STATE_CAP=32768   # total state cap, bytes
INSTRUCTIONS="Triage this code-review suggestion for a vote panel. Pick the option matching when it should be handled."

usage() {
    printf 'usage: jev-triage.sh --manifest <path>\n' >&2
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
[ -f "$MANIFEST" ] || { printf 'jev-triage: manifest not found: %s\n' "$MANIFEST" >&2; exit 64; }

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CALLER="$SCRIPT_DIR/../../cfn-scripts/jev-systemone.sh"
if [ ! -f "$CALLER" ]; then
    printf 'jev-triage: error: caller script missing: %s\n' "$CALLER" >&2
    exit 0
fi

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-vote-triage.jsonl"
BASE=$(basename "$MANIFEST")

command -v jq >/dev/null 2>&1 || { printf 'jev-triage: error: jq not found on PATH\n' >&2; exit 0; }

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the skill resolves from any project (reverse-symlink layout). Missing lib
# is a silent-out (exit 0) failure, same as every other shadow-internal
# failure: the loop must never block on telemetry.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-triage: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

total=$(jq '.suggestions | length' "$MANIFEST" 2>/dev/null || echo "0")
if [ "$total" -eq 0 ]; then
    printf 'jev-triage: nothing to triage: %s has no suggestions\n' "$BASE" >&2
    exit 0
fi

ids=$(jq -r '[.suggestions[].id] | join("\n")' "$MANIFEST")

# Idempotency: drop suggestion ids already triaged for this manifest.
# JSONL is one object per line, so select runs per line (no slurp).
done_ids=""
if [ -f "$LOG_FILE" ]; then
    done_ids=$(jq -r --arg m "$BASE" \
        'select(.type == "triage" and .manifest == $m) | .suggestion_id' \
        "$LOG_FILE" 2>/dev/null || true)
fi
remaining=$(comm -13 \
    <(printf '%s' "$done_ids" | sort) \
    <(printf '%s' "$ids" | sort) | grep -v '^$' || true)

if [ -z "$remaining" ]; then
    printf 'jev-triage: skip: %s: all %s suggestions already triaged\n' "$BASE" "$total" >&2
    exit 0
fi

# Bounded state: per-suggestion fields with the description capped, then the
# whole state shrunk until it fits the byte cap.
build_state() {
    jq -c --argjson cap "$1" \
        '{context: (.context // ""), suggestions: [.suggestions[] | {id, title, one_liner, category, impact, files, description: ((.description // "") | .[0:$cap])}]}' \
        "$MANIFEST"
}
cap=$DESC_CAP
state=$(build_state "$cap")
while [ "${#state}" -gt "$STATE_CAP" ] && [ "$cap" -ge 250 ]; do
    cap=$((cap / 2))
    state=$(build_state "$cap")
done
if [ "${#state}" -gt "$STATE_CAP" ]; then
    state=$(jq -c '{context: (.context // ""), suggestions: [.suggestions[] | {id, title, one_liner}]}' "$MANIFEST")
fi

# One choice question per suggestion, chunked at $CHUNK per API call.
build_questions() {
    jq -c --argjson ids "$2" --arg instr "$INSTRUCTIONS" '
        [.suggestions[] | select(.id as $id | $ids | index($id))]
        | map({key: .id, value: {
            type: "choice",
            instructions: $instr,
            criteria: {
                implement_now: "Clear cut: mechanical, low risk, and obviously correct without discussion.",
                needs_panel: "Ambiguous, risky, architectural, or otherwise deserving of the vote panel.",
                reject: "Not worth doing: invalid, already intended behavior, or negligible value."
            }
        }})
        | from_entries' "$MANIFEST"
}

mapfile -t rem_ids <<< "$remaining"
n=${#rem_ids[@]}
logged=0
rc=0
resp_file=$(mktemp)
err_file=$(mktemp)
trap 'rm -f "$resp_file" "$err_file"' EXIT

for ((start = 0; start < n; start += CHUNK)); do
    chunk=("${rem_ids[@]:start:CHUNK}")
    chunk_json=$(printf '%s\n' "${chunk[@]}" | jq -R . | jq -s -c '.')
    questions=$(build_questions "$MANIFEST" "$chunk_json")
    input=$(jq -cn --argjson state "$state" --argjson questions "$questions" '{state: $state, questions: $questions}')

    rc=0
    printf '%s' "$input" | "$CALLER" >"$resp_file" 2>"$err_file" || rc=$?
    if [ "$rc" -eq 2 ]; then
        printf 'jev-triage: skip: %s: no TYPESAFE_API_KEY, %s suggestions left untriaged\n' \
            "$BASE" "$((n - start))" >&2
        exit 0
    elif [ "$rc" -ne 0 ]; then
        err_text=$(tr '\n' ' ' < "$err_file" | sed 's/ *$//')
        printf 'jev-triage: error: %s: systemone call failed (rc %s): %s\n' "$BASE" "$rc" "$err_text" >&2
        exit 0
    fi

    usage_tokens=$(jq -r '.usage.input_tokens // 0' "$resp_file" 2>/dev/null || echo "0")
    for id in "${chunk[@]}"; do
        choice=$(jq -r --arg id "$id" '.answers[$id].choice // ""' "$resp_file" 2>/dev/null || true)
        conf=$(jq -r --arg id "$id" '.answers[$id].confidence // 0' "$resp_file" 2>/dev/null || echo "0")
        if [ -z "$choice" ]; then
            printf 'jev-triage: error: %s: no answer for %s in systemone response\n' "$BASE" "$id" >&2
            continue
        fi
        ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        rec=$(jq -cn \
            --arg ts "$ts" \
            --arg project "$(basename "$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || pwd)")" \
            --arg cwd "$(pwd)" \
            --arg manifest "$BASE" \
            --arg id "$id" \
            --arg choice "$choice" \
            --argjson conf "$conf" \
            --argjson tokens "$usage_tokens" \
            '{type: "triage", ts: $ts, project: $project, cwd: $cwd, manifest: $manifest,
              suggestion_id: $id, choice: $choice, confidence: $conf, input_tokens: $tokens}')
        jev_append_line "$LOG_FILE" "$rec"
        logged=$((logged + 1))
    done
done

printf 'jev-triage: logged %s triage lines for %s\n' "$logged" "$BASE" >&2
