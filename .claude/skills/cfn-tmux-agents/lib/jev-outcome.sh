#!/usr/bin/env bash
# .claude/skills/cfn-tmux-agents/lib/jev-outcome.sh
# SHADOW ONLY: asks Jev to classify why a spawned tmux worker never matched
# its banner regex, and appends one outcome line to the shared JSONL log.
# Decides nothing: the caller keeps its pane dump and exit 68 unchanged.
# Exit 0 after a valid invocation regardless of API outcome so the shadow can
# never block a spawn; usage errors exit 64.
#
# Usage: jev-outcome.sh --name <n> --engine <e> --tail-file <p>
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-tmux-outcome.jsonl
# Line:  {type:"outcome",ts,project,cwd,name,engine,verdict,confidence,
#         tail_first,input_tokens}
set -euo pipefail

usage() {
    printf 'usage: jev-outcome.sh --name <n> --engine <e> --tail-file <p>\n' >&2
    exit 64
}

NAME=""
ENGINE=""
TAIL_FILE=""
while [ $# -gt 0 ]; do
    case "$1" in
        --name)      [ -n "${2:-}" ] || usage; NAME="$2"; shift 2 ;;
        --engine)    [ -n "${2:-}" ] || usage; ENGINE="$2"; shift 2 ;;
        --tail-file) [ -n "${2:-}" ] || usage; TAIL_FILE="$2"; shift 2 ;;
        *) usage ;;
    esac
done
[ -n "$NAME" ] && [ -n "$ENGINE" ] && [ -n "$TAIL_FILE" ] || usage
[ -f "$TAIL_FILE" ] || { printf 'jev-outcome: error: tail file not found: %s\n' "$TAIL_FILE" >&2; exit 64; }

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CALLER="$SCRIPT_DIR/../../../cfn-scripts/jev-systemone.sh"
if [ ! -f "$CALLER" ]; then
    printf 'jev-outcome: error: caller script missing: %s\n' "$CALLER" >&2
    exit 0
fi

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-tmux-outcome.jsonl"

command -v jq >/dev/null 2>&1 || { printf 'jev-outcome: error: jq not found on PATH\n' >&2; exit 0; }

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the skill resolves from any project (reverse-symlink layout). Missing lib
# is a silent-out (exit 0) failure, same as every other shadow-internal
# failure: the spawn path must never block on telemetry.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-outcome: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

# Bounded state: session name, engine, and the captured pane tail capped at
# 2000 chars, which is far more than the 10-line dump the caller feeds in.
STATE_CAP=2000
tail_text=$(head -c "$STATE_CAP" "$TAIL_FILE" 2>/dev/null || true)

state=$(jq -cn \
    --arg name "$NAME" \
    --arg engine "$ENGINE" \
    --arg tail "$tail_text" \
    '{name: $name, engine: $engine, pane_tail: $tail}')

INSTRUCTIONS="A spawned tmux worker never matched its banner regex. Classify the pane tail into exactly one cause."
questions=$(jq -cn --arg instr "$INSTRUCTIONS" '
    {outcome: {
        type: "choice",
        instructions: $instr,
        criteria: {
            banner_slow: "The engine was still starting (cold start, downloading, compiling): the banner would have appeared given more time.",
            auth_prompt: "The pane shows an authentication, token, or login prompt or an auth failure.",
            engine_crashed: "The pane shows a crash from the engine itself: traceback, panic, segfault, abort, unhandled exception.",
            wrong_model: "The pane shows an interactive prompt the engine printed instead of its banner, such as an update-available notice, trust or theme prompt.",
            env_error: "The pane shows a missing binary, bad environment variable, or module or loader error on the PATH side.",
            unclear: "The tail does not clearly match any of the above."
        }
    }}')

input=$(jq -cn --argjson state "$state" --argjson questions "$questions" '{state: $state, questions: $questions}')

rc=0
resp_file=$(mktemp)
err_file=$(mktemp)
trap 'rm -f "$resp_file" "$err_file"' EXIT
printf '%s' "$input" | "$CALLER" >"$resp_file" 2>"$err_file" || rc=$?
if [ "$rc" -eq 2 ]; then
    jev_status "jev-outcome: skip: no TYPESAFE_API_KEY, outcome for $NAME not classified"
    exit 0
elif [ "$rc" -ne 0 ]; then
    err_text=$(tr '\n' ' ' < "$err_file" | sed 's/ *$//')
    jev_status "jev-outcome: error: systemone call failed for $NAME (rc $rc): $err_text"
    exit 0
fi

verdict=$(jq -r '.answers.outcome.choice // ""' "$resp_file" 2>/dev/null || true)
conf=$(jq -r '.answers.outcome.confidence // 0' "$resp_file" 2>/dev/null || echo "0")
usage_tokens=$(jq -r '.usage.input_tokens // 0' "$resp_file" 2>/dev/null || echo "0")
if [ -z "$verdict" ]; then
    jev_status "jev-outcome: error: no answer for outcome in systemone response for $NAME"
    exit 0
fi
# Numeric guards: a non-numeric confidence or token count from the API must
# not kill the envelope build (exit 0 always).
case "$conf" in ''|*[!0-9.]*) conf=0 ;; esac
case "$usage_tokens" in ''|*[!0-9.]*) usage_tokens=0 ;; esac

tail_first=$(head -n 1 "$TAIL_FILE" 2>/dev/null | cut -c1-120 || true)

rec=$(jev_envelope outcome \
    "name=$NAME" \
    "engine=$ENGINE" \
    "verdict=$verdict" \
    "confidence:=$conf" \
    "tail_first=$tail_first" \
    "input_tokens:=$usage_tokens")
jev_append_line "$LOG_FILE" "$rec"
jev_status "jev-outcome: logged outcome for $NAME engine=$ENGINE verdict=$verdict"
