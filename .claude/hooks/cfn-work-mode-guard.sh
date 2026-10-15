#!/usr/bin/env bash
# Work mode PreToolUse guard. Registered under PreToolUse with matcher: Bash
#
# Work mode = the user is at work and the Mac screen may be seen: nothing may open a
# visible window. Rules (block/allow regexes, generic plus per-project) live in
# skills/cfn-work-mode/patterns.conf, not here.
#
# Flag on + a simple command matches a block rule:
#   exit 2, stderr names what was refused and the allowed alternative, and the whole
#   command is appended to $CFN_WORK_MODE_DIR/.work-mode-queue.log so the user can run it
#   later (work-mode.sh queue / off print it).
# Fail-open: flag off, jq missing, or patterns file missing -> silent exit 0.
# Tests: cfn-work-mode-guard.test.sh (next to this file).
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${CFN_WORK_MODE_DIR:-$HOME/.claude}"
FLAG="$WORK_DIR/.work-mode-active"
QUEUE="$WORK_DIR/.work-mode-queue.log"
PATTERNS="${CFN_WORK_MODE_PATTERNS:-$BASE/skills/cfn-work-mode/patterns.conf}"

[ -f "$FLAG" ] || exit 0
[ -f "$PATTERNS" ] || exit 0

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
[ "$TOOL" = "Bash" ] || exit 0
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$CMD" ] || exit 0
CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$CWD" ] || CWD="$PWD"

# Project = folder holding the repo's common .git (worktrees resolve to the main repo),
# else the cwd's own name.
project_of(){
    local common
    common=$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || common=""
    if [ -n "$common" ]; then
        basename "$(dirname "$common")"
    else
        basename "$1"
    fi
}
PROJECT=$(project_of "$CWD")

# Split into simple commands on ; & | ( ) ` and newlines outside quotes. One per line.
split_segments(){
    printf '%s' "$1" | awk '
    BEGIN { RS = "\001" }
    {
        s = $0; out = ""; q = ""; n = length(s)
        for (i = 1; i <= n; i++) {
            c = substr(s, i, 1)
            if (q == "") {
                if (c == "\\") { out = out c substr(s, i + 1, 1); i++; continue }
                if (c == "\"" || c == "\x27") { q = c; out = out c; continue }
                if (index(";&|()`\n", c) > 0) { print out; out = ""; continue }
                out = out c
            } else {
                if (q == "\"" && c == "\\") { out = out c substr(s, i + 1, 1); i++; continue }
                if (c == q) q = ""
                if (c == "\n") c = " "
                out = out c
            }
        }
        print out
    }'
}

# Strip leading whitespace, VAR=value assignments and wrapper words.
normalize(){
    local s=$1 prev=""
    local re_assign='^[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'"'"'[^'"'"']*'"'"'|[^ ]*)[[:space:]]+'
    local re_wrap='^(env|nohup|exec|time|command|builtin|then|do|else|!|\{)[[:space:]]+'
    local re_timeout='^(g?timeout)[[:space:]]+[^ ]+[[:space:]]+'
    while [ "$s" != "$prev" ]; do
        prev=$s
        s="${s#"${s%%[![:space:]]*}"}"
        if [[ $s =~ $re_assign ]] || [[ $s =~ $re_wrap ]] || [[ $s =~ $re_timeout ]]; then
            s="${s:${#BASH_REMATCH[0]}}"
        fi
    done
    printf '%s' "$s"
}

# Rules as action\037scope\037regex\037message, comments and blanks dropped.
RULES=$(awk -F' ;; ' '
    /^[[:space:]]*(#|$)/ { next }
    NF >= 3 { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2)
              msg = (NF >= 4) ? $4 : ""
              printf "%s\037%s\037%s\037%s\n", $1, $2, $3, msg }' "$PATTERNS")

# Prints the block message for a segment; returns 0 when blocked.
check_segment(){
    local seg=$1 action scope re msg
    while IFS=$'\037' read -r action scope re msg; do
        [ -n "$action" ] || continue
        [ "$scope" = "*" ] || [ "$scope" = "$PROJECT" ] || continue
        if [[ $seg =~ $re ]]; then
            if [ "$action" = "block" ]; then
                printf '%s' "$msg"
                return 0
            fi
            return 1
        fi
    done <<< "$RULES"
    return 1
}

while IFS= read -r raw; do
    seg=$(normalize "$raw")
    [ -n "$seg" ] || continue
    if MSG=$(check_segment "$seg"); then
        ONE_LINE=$(printf '%s' "$CMD" | tr '\n\t' '  ')
        mkdir -p "$WORK_DIR" 2>/dev/null
        printf '%s\t%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PROJECT" "$CWD" "$ONE_LINE" >> "$QUEUE" 2>/dev/null
        cat >&2 <<EOF_WM
BLOCKED: WORK MODE is on. The user is at work and the screen may be seen, so nothing may open a visible window.
Refused: ${seg:0:200}
Why and what to do instead: $MSG
Queued: the full command was saved for the user to run later (work-mode.sh queue). Do not retry it or find another way to show a window; carry on with other work.
EOF_WM
        exit 2
    fi
done < <(split_segments "$CMD")

exit 0
