#!/usr/bin/env bash
# Night mode context injection.
# Registered under SessionStart AND UserPromptSubmit; branches on payload shape:
#   hook_event_name present -> trust it
#   else .prompt present     -> UserPromptSubmit
#   else                     -> SessionStart
#
# Flag ON  + SessionStart: plain stdout = "NIGHT MODE ACTIVE (since <ts>). Full contract:"
#                          + SKILL.md body read at runtime, frontmatter stripped.
#                          (SessionStart re-fires on resume AND compaction.)
# Flag ON  + UserPromptSubmit: JSON hookSpecificOutput.additionalContext (~60-token reminder).
# Flag OFF + pending-review marker: review reminder in the event-correct shape
#                                   (plain text for SessionStart, JSON for UserPromptSubmit).
# Flag OFF + no marker: silent. jq missing: fail-open exit 0.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_MD="$BASE/skills/cfn-night-mode/SKILL.md"
NIGHT_DIR="${CFN_NIGHT_MODE_DIR:-$HOME/.claude}"
FLAG="$NIGHT_DIR/.night-mode-active"
PENDING="$NIGHT_DIR/.night-mode-pending-review"

INPUT=$(cat)

EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null)
if [ -z "$EVENT" ]; then
    if printf '%s' "$INPUT" | jq -e 'has("prompt")' >/dev/null 2>&1; then
        EVENT="UserPromptSubmit"
    else
        EVENT="SessionStart"
    fi
fi

FLAG_TS=""
[ -f "$FLAG" ] && FLAG_TS=$(cat "$FLAG")

emit_ups(){ # emit_ups <context-text> -> valid UserPromptSubmit JSON via jq -n
    jq -n --arg ctx "$1" \
        '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
}

skill_body(){
    # strip YAML frontmatter, then leading blank lines
    awk 'NR==1 && $0=="---" {fm=1; next}
         fm==1   && /^---[[:space:]]*$/ {fm=0; next}
         fm==1 {next}
         {print}' "$SKILL_MD" 2>/dev/null | awk 'NF && !started {started=1} started {print}'
}

if [ -n "$FLAG_TS" ]; then
    case "$EVENT" in
        SessionStart)
            BODY="$(skill_body)"
            if [ -z "$(printf '%s' "$BODY" | tr -d '[:space:]')" ]; then
                # cfn: fallback paragraph if SKILL.md moved/renamed; upgrade trigger = skill path change
                BODY="(night-mode contract file missing; core rules: no AskUserQuestion, no plan stalls, choose the most conservative reversible option, never widen scope, defer destructive ops as blocking proposed decisions, log every decision under slug night-<date>, commit finished work and never push.)"
            fi
            printf 'NIGHT MODE ACTIVE (since %s). Full contract:\n\n%s\n' "$FLAG_TS" "$BODY"
            ;;
        *)
            REMINDER=$(printf 'Night mode is ON: no AskUserQuestion, no plan stalls; no user is awake to answer. Decide with the most conservative reversible option; never widen scope. Never execute destructive ops: DB DELETE/DROP/TRUNCATE, deploys, git push, force/reset/clean, credential changes, new Anthropic provider calls. Defer those as blocking proposed decisions instead. Log every choice now with decision-log record.sh (slug night-%s) and continue. Commit finished work; never push. Full contract was injected at session start.' "$(date +%F)")
            emit_ups "$REMINDER"
            ;;
    esac
    exit 0
fi

# flag off: only the pending-review reminder may speak
if [ -f "$PENDING" ]; then
    MARKER_TS="$(cat "$PENDING" 2>/dev/null || echo unknown)"
    PRE='Night mode ended ('
    MID=') so decisions await review: run bash $HOME/.claude/skills/cfn-night-mode/night-mode.sh report to see what was decided overnight. Acknowledge once reviewed with report --ack.'
    REMINDER="${PRE}${MARKER_TS}${MID}"
    case "$EVENT" in
        SessionStart) printf '%s\n' "$REMINDER" ;;
        *)            emit_ups "$REMINDER" ;;
    esac
fi

exit 0
