#!/usr/bin/env bash
# Night mode PreToolUse guard.
# Registered under PreToolUse with matcher: AskUserQuestion|EnterPlanMode|ExitPlanMode
#
# Flag on:
#   AskUserQuestion  -> exit 2, self-contained decide-and-log instructions on stderr
#   EnterPlanMode    -> exit 2, planning bypass instructions on stderr
#   ExitPlanMode     -> exit 0 + JSON allow (rtk-rewrite.sh shape) so a session already
#                       in plan mode when the flag flips on is not trapped; plan capture
#                       (cfn-plan-capture.sh PostToolUse) still persists the plan.
# Fail-open: flag off or jq missing -> silent exit 0.
# Every deny/allow appends one line to $CFN_NIGHT_MODE_DIR/.night-mode-events.log:
#   <iso-utc> <tool> <title<=120 chars>
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

NIGHT_DIR="${CFN_NIGHT_MODE_DIR:-$HOME/.claude}"
FLAG="$NIGHT_DIR/.night-mode-active"
EVENTS="$NIGHT_DIR/.night-mode-events.log"

[ -f "$FLAG" ] || exit 0

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

case "$TOOL" in
    AskUserQuestion|EnterPlanMode|ExitPlanMode) ;;
    *) exit 0 ;;
esac

log_event(){ # log_event <tool> <title>
    local t=$1 q=$2 clean
    clean=$(printf '%s' "$q" | tr '\n\t' '   ')
    printf '%s %s %.120s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$t" "${clean:-$t}" >> "$EVENTS"
}

question_text(){
    printf '%s' "$INPUT" | jq -r '.tool_input.questions[0].question // .tool_input.subject // .tool_input.topic // ""' 2>/dev/null
}

case "$TOOL" in
    AskUserQuestion)
        SLUG="night-$(date +%F)"
        DEC_ID="D$(date +%H%M%S)-$$"
        log_event "AskUserQuestion" "$(question_text)"
        cat >&2 <<EOF_NM
BLOCKED: Night mode is active. No user is available to answer. Decide and continue:

1. Choose the most conservative, reversible option. Never widen scope.
2. Hard safety floor -- NEVER execute, and never "decide" to execute:
   destructive/irreversible ops (DB DELETE/DROP/TRUNCATE, deploys, git push,
   git force/reset/clean, credential changes, new Anthropic provider calls).
   Those are deferred, not decided (step 4b).
3. Commit finished work as you go (git commit). NEVER git push.
4. Record the decision now:
   bash \$HOME/.claude/skills/decision-log/record.sh --slug ${SLUG} \\
     --id ${DEC_ID} --title "<the question, short>" \\
     --chosen "<option you picked>" --rationale "<why, one line>"
   a. Normal case: as above (status accepted by default).
   b. Safety-floor case: add --blocking --status proposed
     --chosen "DEFERRED: <what you wanted>", then continue on a different path.
5. Do not ask again. Proceed with the chosen option.

These records become the morning report (night-mode.sh report on exit).
EOF_NM
        exit 2
        ;;
    EnterPlanMode)
        SLUG="night-$(date +%F)"
        DEC_ID="D$(date +%H%M%S)-$$"
        log_event "EnterPlanMode" "$(printf '%s' "$INPUT" | jq -r '.tool_input.topic // .tool_input.subject // ""' 2>/dev/null)"
        cat >&2 <<EOF_NM
BLOCKED: Night mode is active. Entering plan mode would end in an approval stall,
and no user is available to approve a plan. Instead:

1. Continue from existing planning/ artifacts if they cover the work.
2. If genuinely new planning is required, write planning/NIGHT_<topic>.md
   directly and keep working from it. Do not stop.
3. Log the bypass decision:
   bash \$HOME/.claude/skills/decision-log/record.sh --slug ${SLUG} \\
     --id ${DEC_ID} --title "plan-mode bypass" \\
     --chosen "wrote planning/NIGHT_<topic>.md and continued"

Then proceed without waiting. These records become the morning report.
EOF_NM
        exit 2
        ;;
    ExitPlanMode)
        log_event "ExitPlanMode" "(allowed under night mode; reviewed via morning report)"
        TI=$(printf '%s' "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null)
        [ -n "$TI" ] || TI='{}'
        jq -n \
            --argjson ti "$TI" \
            '{
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "allow",
                permissionDecisionReason: "Night mode active: approval stall deferred to the morning-report review.",
                updatedInput: $ti
              }
            }'
        exit 0
        ;;
esac

exit 0
