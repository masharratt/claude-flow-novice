#!/usr/bin/env bash
# .claude/cfn-scripts/jev-systemone.sh
# Generic Jev systemone caller, shared by the Jev shadow pilots (vote triage
# first). Reads {state, questions, model?} JSON on stdin, issues one POST to
# https://api.typesafe.ai/v1/systemone, and writes {answers, usage} JSON on
# stdout. Single attempt, no retry: callers see failures immediately. The
# request is bounded by --max-time 4 so a hung API cannot stall callers
# beyond that; curl rc 28 (timeout) surfaces as exit 3 like any other rc.
# Exit codes: 0 ok, 2 no API key, 3 http-or-parse error (including invalid
# stdin). Exactly one stderr line on failure; the key value is never printed.
set -euo pipefail

ENDPOINT="https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL="jev-latest"

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SETTINGS_FILE="$ROOT/.claude/settings.local.json"

# die RC MESSAGE: one stderr line, then exit with RC.
die() {
    printf 'jev-systemone: %s\n' "$2" >&2
    exit "$1"
}

command -v curl >/dev/null 2>&1 || die 3 "curl not found on PATH"
command -v jq >/dev/null 2>&1 || die 3 "jq not found on PATH"

input=$(cat)

# Stdin must parse and carry both state and questions as JSON objects.
if ! printf '%s' "$input" | jq -e '(.state | type == "object") and (.questions | type == "object")' >/dev/null 2>&1; then
    die 3 "invalid stdin JSON (need objects: state, questions)"
fi

# Key resolution: env TYPESAFE_API_KEY first, then the repo settings file.
key="${TYPESAFE_API_KEY:-}"
if [ -z "$key" ] && [ -f "$SETTINGS_FILE" ]; then
    key=$(jq -r '.env.TYPESAFE_API_KEY // empty' "$SETTINGS_FILE" 2>/dev/null || true)
fi
if [ -z "$key" ]; then
    die 2 "no TYPESAFE_API_KEY (env TYPESAFE_API_KEY or .env.TYPESAFE_API_KEY in $SETTINGS_FILE)"
fi

# Model: JEV_MODEL env overrides the stdin .model, else the default.
model="${JEV_MODEL:-}"
if [ -z "$model" ]; then
    model=$(printf '%s' "$input" | jq -r '.model // empty' 2>/dev/null || true)
fi
[ -n "$model" ] || model="$DEFAULT_MODEL"

body=$(printf '%s' "$input" | jq -c --arg m "$model" '{model: $m, state: .state, questions: .questions}')

# One POST, no retry, bounded at 4s. Silent curl: the single die line below
# is the whole failure report, curl rc included.
rc=0
response=$(curl -s --fail --max-time 4 -X POST "$ENDPOINT" \
    -H "authorization: Bearer $key" \
    -H "content-type: application/json" \
    --data-binary "$body" 2>/dev/null) || rc=$?
if [ "$rc" -ne 0 ]; then
    die 3 "systemone request failed (curl rc $rc)"
fi

# A response without answers/usage objects is a parse error, not a success.
if ! printf '%s' "$response" | jq -e '(.answers | type == "object") and (.usage | type == "object")' >/dev/null 2>&1; then
    die 3 "systemone response failed validation (answers/usage missing or malformed)"
fi

printf '%s' "$response" | jq -c '{answers: .answers, usage: .usage}'
