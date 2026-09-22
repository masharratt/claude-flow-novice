#!/usr/bin/env bash
# .claude/skills/cfn-careful/lib/jev-deny-check.sh
# SHADOW ONLY: careful-guard deny funnel (Jev batch 2, Phase 4). The
# careful-guard hook calls this immediately before its single exit 2, passing
# the matched rule name and the command string. Asks Jev whether the command
# is genuinely destructive as the matched rule intends, and appends one line
# to the shared JSONL log. Decides nothing: the verdict is recorded next to
# the hook's own deny, never shown to the user, and the hook's exit code is
# unchanged. Every internal outcome exits 0 so the shadow can never break
# the hook; usage errors exit 64.
#
# Usage: jev-deny-check.sh --rule <name> --cmd <command string>
# Log:   ${CFN_DATA_DIR:-$HOME/.claude/cfn-data}/jev-careful-guard.jsonl
# Lines: {type:"deny",ts,project,cwd,rule,cmd<=200,jev_verdict,confidence,
#         input_tokens}
#        {type:"skip",ts,project,cwd,rule,cmd<=200,reason}   no key, or the
#                         Jev call exceeded its time bound
set -euo pipefail

CMD_CAP=200       # command string cap in the log, chars
CALL_BOUND=2      # seconds; mirrors the hook's own timeout 2 around us

usage() {
    printf 'usage: jev-deny-check.sh --rule <name> --cmd <command string>\n' >&2
    exit 64
}

RULE=""
CMD=""
while [ $# -gt 0 ]; do
    case "$1" in
        --rule)
            [ -n "${2:-}" ] || usage
            RULE="$2"
            shift 2
            ;;
        --cmd)
            [ -n "${2:-}" ] || usage
            CMD="$2"
            shift 2
            ;;
        *) usage ;;
    esac
done
[ -n "$RULE" ] || usage
[ -n "$CMD" ] || usage

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
CALLER="$SCRIPT_DIR/../../../cfn-scripts/jev-systemone.sh"
if [ ! -f "$CALLER" ]; then
    printf 'jev-deny-check: error: caller script missing: %s\n' "$CALLER" >&2
    exit 0
fi

# GNU-tool shims for macOS (timeout via perl alarm). The careful-guard hook
# sources the same lib, but a shell function does not cross the process
# boundary into this script: without this source the systemone call below
# dies with "timeout: command not found" on macOS and every deny silently
# becomes a no-log skip (caught by the macOS Portability CI job).
. "$SCRIPT_DIR/../../../helpers/cfn-portable.sh" 2>/dev/null || true

# GNU-tool shims for macOS (timeout here, used to bound the caller); defines
# nothing on Linux. Without it a missing timeout binary aborts this script
# under set -e before the skip line is ever written.
# shellcheck source=/dev/null
. "$(cd "$SCRIPT_DIR/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

DATA_DIR="${CFN_DATA_DIR:-$HOME/.claude/cfn-data}"
LOG_FILE="$DATA_DIR/jev-careful-guard.jsonl"

command -v jq >/dev/null 2>&1 || { printf 'jev-deny-check: error: jq not found on PATH\n' >&2; exit 0; }

# Shared shadow lib: jev_append_line, jev_status, jev_envelope. $HOME path so
# the skill resolves from any project (reverse-symlink layout). Missing lib
# is a silent-out (exit 0) failure, same as every other shadow-internal
# failure: the hook must never block or break on telemetry.
LIB_FILE="$HOME/.claude/cfn-scripts/jev-shadow-lib.sh"
if [ -f "$LIB_FILE" ]; then
    # shellcheck source=/dev/null
    . "$LIB_FILE"
else
    printf 'jev-deny-check: error: shadow lib missing: %s\n' "$LIB_FILE" >&2
    exit 0
fi

CAPPED="${CMD:0:$CMD_CAP}"

# Skip line: rule and command recorded, verdict absent. The summarizer counts
# type "skip" separately, so an unavailable Jev shows up as coverage, not as
# silence.
log_skip() {
    local rec
    rec=$(jev_envelope skip "rule=$RULE" "cmd=$CAPPED" "reason=$1") || return 0
    jev_append_line "$LOG_FILE" "$rec"
}

resp_file=$(mktemp)
err_file=$(mktemp)
trap 'rm -f "$resp_file" "$err_file"' EXIT

# One choice question. State carries the matched rule and the capped command;
# the answer id is fixed ("deny") since there is exactly one question.
INSTRUCTIONS="A guard hook matched this shell command against a destructive-command rule and is about to block it. Judge whether the command is genuinely destructive as the matched rule intends."
state=$(jq -cn --arg rule "$RULE" --arg cmd "$CAPPED" \
    '{matched_rule: $rule, command: $cmd}')
questions=$(jq -cn --arg instr "$INSTRUCTIONS" \
    '{deny: {type: "choice", instructions: $instr, criteria: {
        destructive: "The command really does what the rule guards against: destroys files, data, git history, or containers in a way that needs a human decision.",
        not_destructive: "The rule over-matched: the command is safe, targets something disposable, or blocks a normal workflow for no real risk.",
        unclear: "The command string alone does not say."
    }}}')
input=$(jq -cn --argjson state "$state" --argjson questions "$questions" \
    '{state: $state, questions: $questions}')

rc=0
printf '%s' "$input" | timeout "$CALL_BOUND" "$CALLER" >"$resp_file" 2>"$err_file" || rc=$?
if [ "$rc" -eq 2 ]; then
    log_skip "no TYPESAFE_API_KEY"
    exit 0
elif [ "$rc" -eq 124 ]; then
    log_skip "jev call exceeded the ${CALL_BOUND}s bound"
    exit 0
elif [ "$rc" -ne 0 ]; then
    err_text=$(tr '\n' ' ' < "$err_file" | sed 's/ *$//')
    case "$err_text" in
        *"curl rc 28"*)
            log_skip "curl timeout"
            ;;
        *)
            jev_status "jev-deny-check: error: systemone call failed (rc $rc): $err_text"
            ;;
    esac
    exit 0
fi

choice=$(jq -r '.answers.deny.choice // ""' "$resp_file" 2>/dev/null || true)
conf=$(jq -r '.answers.deny.confidence // 0' "$resp_file" 2>/dev/null || echo "0")
tokens=$(jq -r '.usage.input_tokens // 0' "$resp_file" 2>/dev/null || echo "0")
if [ -z "$choice" ]; then
    jev_status "jev-deny-check: error: no answer for deny in systemone response"
    exit 0
fi
# Numeric guard before --argjson: a malformed body must not crash the append.
printf '%s' "$conf" | grep -qE '^[0-9]+(\.[0-9]+)?$' || conf=0
printf '%s' "$tokens" | grep -qE '^[0-9]+$' || tokens=0

rec=$(jev_envelope deny "rule=$RULE" "cmd=$CAPPED" "jev_verdict=$choice" \
        "confidence:=$conf" "input_tokens:=$tokens") || {
    jev_status "jev-deny-check: error: envelope build failed"
    exit 0
}
jev_append_line "$LOG_FILE" "$rec"
jev_status "jev-deny-check: logged deny line for rule $RULE"
