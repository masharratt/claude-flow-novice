#!/bin/sh
# CFN Careful Guard - PreToolUse hook for destructive command detection
# Intercepts Bash tool calls and blocks dangerous patterns
# NOTE: POSIX sh only. No jq dependency (may not be installed).
#
# Shadow stage (Jev batch 2, Phase 4): when a rule matches, the hook fires
# the deny funnel under cfn-careful/lib with the matched rule name and the
# command string. The funnel asks Jev whether the command is genuinely
# destructive as the rule intends and appends one JSONL line. Shadow only:
# it decides nothing, never runs on allow or whitelist paths, and cannot
# change the verdict, the messages, or the exit code. Its output is
# discarded. timeout 2 keeps it inside the hook's 5s budget.


# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
INPUT=$(timeout 1 cat 2>/dev/null || echo "")

# Extract command from JSON without jq.
# Two steps, because POSIX sed has no non-greedy match: strip everything up to
# and including the opening quote, then cut at the first unescaped closing
# quote. A single greedy 's/..."\(.*\)"/\1/' captured through to the LAST quote
# in the payload, leaving the JSON tail ("}}") glued to the command and
# swallowing any field that followed it (e.g. "description"). Mid-string
# patterns still matched, so the damage stayed invisible until a rule needed
# to anchor at end-of-command.
COMMAND=$(echo "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"//p' | head -1)

# Cut at the first quote that is not backslash-escaped. POSIX sed has no
# alternation, so protect escaped quotes with a placeholder first, cut at the
# first remaining (necessarily unescaped) quote, then restore. GNU BRE
# alternation here cut escaped quotes wrongly on BSD sed.
COMMAND=$(printf '%s' "$COMMAND" | sed -e 's/\\"/\\%/g' -e 's/".*//' -e 's/\\%/"/g')

# Unescape the sequences that appear in real commands (quoted payloads), so
# matching and the deny log see the actual text. Other JSON escapes are rare
# and left as-is.
COMMAND=$(printf '%s' "$COMMAND" | sed 's/\\"/"/g; s/\\\\/\\/g')

[ -z "$COMMAND" ] && exit 0

# Normalize: lowercase for pattern matching
CMD_LOWER=$(echo "$COMMAND" | tr '[:upper:]' '[:lower:]')

# Name of the first matching deny rule, if any. Every branch below sets this
# and falls through to the single shared exit 2 at the end of the file.
DENY_RULE=""

# --- Anchored matching ---
# Command-shaped rules below must match at the START of a command segment:
# beginning of the command, or right after a separator (; & | ( or backtick).
# This keeps quoted prose (tmux send-keys payloads, echo strings, chat text)
# that merely MENTIONS a destructive command from being denied, while a real
# command after a separator is still caught. The db rule stays whole-string:
# destructive SQL genuinely travels inside quoted strings that execute.
# cfn: anchored matching misses destructive commands inside quoted
# bash -c / exec / ssh argument strings; add an argv-parsing stage if that
# incident class is ever observed.
ANCHOR='[;&|(`][[:space:]]*'

# Every command segment, including the first, is preceded by a separator in
# MATCH_CMD: the synthetic leading "; " lets one portable ERE match segment
# starts without a ^ inside an alternation, which BSD grep rejects.
MATCH_CMD="; $CMD_LOWER"

# --- File destruction ---
# Every rm is judged by where it points (skills/cfn-careful/lib/rm-target-check.py):
# temp, rebuildable and git-restorable targets pass; unrecoverable work asks
# the user; home, system folders, repo roots and .git are blocked. The ask is
# held until the other rules have run, so a deny elsewhere still wins.
# Without python3 it falls back to the old flag-and-whitelist rule.
# Fleet workers never get the ask (nobody answers it; the worker stalls): the
# check returns worker-deny with guidance instead, and so does the time-out
# fallback below. Worker = FLEET_RUN_DIR set, or a session under
# $HOME/fleet-repos/<project>-wt/<ws> (remote --host spawns).
RM_ASK=""
RM_ASK_UNFINISHED='ask
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Delete check: could not finish in time"}}'
if [ -n "${FLEET_RUN_DIR:-}" ]; then
    RM_WORKER=1
else
    case "${CLAUDE_PROJECT_DIR:-}/ $PWD/" in
        *"$HOME"/fleet-repos/*-wt/?*) RM_WORKER=1 ;;
        *) RM_WORKER="" ;;
    esac
fi
[ -z "$RM_WORKER" ] || RM_ASK_UNFINISHED='worker-deny
Delete check: could not finish in time. You are an unattended fleet worker, so this is blocked instead of waiting on a permission prompt nobody will answer. To proceed: rewrite the rm with a literal, fully spelled-out path to exactly what you mean to delete. If that is blocked too, do not delete it: stop and report to the master.'
RM_LIB="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../skills/cfn-careful/lib" 2>/dev/null && pwd)/rm-target-check.py"
# The rm gate also treats the JSON newline escape (a literal backslash-n in
# COMMAND) as a separator: an rm at the start of a later line used to skip the
# check entirely. Over-matching only costs a python run that answers "none".
RM_GATE_CMD=$(printf '%s' "$MATCH_CMD" | sed 's/\\n/; /g')
if echo "$RM_GATE_CMD" | grep -qE "$ANCHOR"'rm[[:space:]]'; then
    if command -v python3 >/dev/null 2>&1 && [ -f "$RM_LIB" ]; then
        RM_OUT=$(printf '%s' "$INPUT" | timeout 4 python3 -I "$RM_LIB" 2>/dev/null) \
            || RM_OUT="$RM_ASK_UNFINISHED"
        RM_VERDICT=$(printf '%s\n' "$RM_OUT" | head -1)
        RM_BODY=$(printf '%s\n' "$RM_OUT" | sed '1d')
        case "$RM_VERDICT" in
            deny)
                echo "BLOCKED: Destructive file deletion: $RM_BODY." >&2
                echo "Nothing should delete this. If it is truly intended, ask the user to run it themselves." >&2
                DENY_RULE=file-deletion ;;
            worker-deny)
                echo "BLOCKED: $RM_BODY" >&2
                DENY_RULE=file-deletion ;;
            ask) RM_ASK="$RM_BODY" ;;
        esac
    elif echo "$MATCH_CMD" | grep -qE "$ANCHOR"'rm[[:space:]]+(-[a-z]*r[a-z]*f|--recursive|-[a-z]*f[a-z]*r)' \
         && ! echo "$CMD_LOWER" | grep -qE '(node_modules|\.next|dist|__pycache__|\.cache|\.turbo|/tmp/)'; then
        echo "BLOCKED: Destructive file deletion detected." >&2
        echo "If intentional, remove specific files by name or confirm with the user." >&2
        DENY_RULE=file-deletion
    fi
fi

if [ -n "$DENY_RULE" ]; then
    :
# --- Database destruction ---
elif echo "$CMD_LOWER" | grep -qiE '(drop[[:space:]]+table|drop[[:space:]]+database|truncate[[:space:]]+)'; then
    echo "BLOCKED: Destructive database operation detected." >&2
    echo "Confirm with the user before executing database destruction." >&2
    DENY_RULE=db-destruction
# --- Git force operations ---
# The force flag must be a whole argument of the git push itself: same command
# segment, same line. The old `git push .*(-f|--force)` matched any later -f
# on the line (`| tail -1`, `--ff-only`, a branch named feature-fix), and 14 of
# 14 logged force-push blocks were false. Segments are split one per line
# (separators and the JSON "\n" escape become newlines) so ^ and $ bound one
# command. Forms caught: -f / -uf, --force*, +refspec, git -C dir push.
elif printf '%s' "$CMD_LOWER" | sed 's/\\n/;/g' | tr ';&|`(' '\n\n\n\n\n' \
     | grep -qE '^[[:space:]]*git([[:space:]]+-c[[:space:]]+[^[:space:]]+)*[[:space:]]+push([[:space:]]+[^[:space:]]+)*[[:space:]]+(-[a-z0-9]*f[a-z0-9]*|--force[a-z-]*|\+[^[:space:]]+)([[:space:]]|$)'; then
    echo "BLOCKED: Force push detected." >&2
    echo "Force push can overwrite remote history. Confirm with the user." >&2
    DENY_RULE=force-push
elif echo "$MATCH_CMD" | grep -qE "$ANCHOR"'git[[:space:]]+reset[[:space:]]+--hard'; then
    echo "BLOCKED: Hard reset detected." >&2
    echo "This discards uncommitted changes. Confirm with the user." >&2
    DENY_RULE=hard-reset
elif echo "$MATCH_CMD" | grep -qE "$ANCHOR"'git[[:space:]]+clean[[:space:]]+.*-f'; then
    echo "BLOCKED: git clean -f detected." >&2
    echo "This removes untracked files permanently. Confirm with the user." >&2
    DENY_RULE=git-clean
# Promised by cfn-careful/SKILL.md and by CLAUDE.md ("Rollback: use backup
# scripts, NOT git checkout"), but never implemented. Discards uncommitted
# work silently, and the pathspec forms are the destructive ones -- plain
# `git checkout <branch>` is a normal branch switch and must stay allowed.
elif echo "$MATCH_CMD" | grep -qE "$ANCHOR"'git[[:space:]]+checkout[[:space:]]+(--[[:space:]]+)?(\.|\*)([[:space:]]|$)'; then
    echo "BLOCKED: git checkout of working-tree paths detected." >&2
    echo "This discards uncommitted changes. Use the edit-safety backup scripts to roll back." >&2
    DENY_RULE=checkout-paths
# --- Container destruction ---
elif echo "$MATCH_CMD" | grep -qE "$ANCHOR"'(kubectl[[:space:]]+delete|docker[[:space:]]+system[[:space:]]+prune|docker[[:space:]]+rm[[:space:]]+-f)'; then
    echo "BLOCKED: Destructive container operation detected." >&2
    echo "Confirm with the user before executing." >&2
    DENY_RULE=container-destruction
# --- Disk overwrite ---
elif echo "$MATCH_CMD" | grep -qE "$ANCHOR"'dd[[:space:]]+if=/dev/(zero|random|urandom)'; then
    echo "BLOCKED: Disk overwrite detected." >&2
    DENY_RULE=disk-overwrite
fi

# Shadow deny funnel: fired only when a rule matched, immediately before the
# single shared exit 2. Allow and whitelist paths above exit before this
# point and never reach the funnel. Every funnel outcome is ignored; the
# verdict, the messages, and the exit code are unchanged.
if [ -n "$DENY_RULE" ]; then
    timeout 2 "$HOME/.claude/skills/cfn-careful/lib/jev-deny-check.sh" --rule "$DENY_RULE" --cmd "$COMMAND" >/dev/null 2>&1 || true
    exit 2
fi

# Allow shadow (one-week trial, ends by itself on JEV_ALLOW_SHADOW_UNTIL): Jev
# judges every command the rules let through, so its catches and false alarms
# can be measured before it is ever allowed to block. Detached in the
# background so it adds no latency; output discarded, verdict unchanged.
# CFN_JEV_ALLOW_SYNC=1 runs it in the foreground (tests only).
JEV_ALLOW="$HOME/.claude/skills/cfn-careful/lib/jev-allow-check.sh"
if [ "${CFN_JEV_ALLOW_SHADOW:-on}" != off ] && [ -f "$JEV_ALLOW" ]; then
    JEV_GUARD=allow
    [ -z "$RM_ASK" ] || JEV_GUARD=ask
    if [ -n "${CFN_JEV_ALLOW_SYNC:-}" ]; then
        bash "$JEV_ALLOW" --cmd "$COMMAND" --guard "$JEV_GUARD" >/dev/null 2>&1 || true
    else
        ( bash "$JEV_ALLOW" --cmd "$COMMAND" --guard "$JEV_GUARD" >/dev/null 2>&1 & )
    fi
fi

# A delete that needs the user's say: Claude Code shows a permission prompt.
if [ -n "$RM_ASK" ]; then
    printf '%s\n' "$RM_ASK"
fi

exit 0
