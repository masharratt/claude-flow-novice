#!/usr/bin/env bash
# CFN tmux read-only allow - PreToolUse hook (matcher: Bash)
#
# Auto-approves tmux calls that only LOOK at sessions, so they stop raising a
# permission prompt:
#   tmux [-L name | -S path] <capture-pane | ls | list-sessions | list-windows
#        | list-panes | has-session> [plain args]   [| tail | head | grep | wc ...]
#
# Anything else produces no output, so the normal permission flow (and every
# other hook, including deny rules) still decides. The checks are deliberately
# blunt: any character that could chain a second tmux command (';' or '\;'),
# run a shell (#() formats, $(), backticks), redirect output, or expand a glob
# makes the hook stay silent rather than try to parse it.
#
# Tests: tests/test-tmux-readonly-allow.sh

command -v jq >/dev/null 2>&1 || exit 0

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0
[ "$TOOL" = "Bash" ] || exit 0
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0
[ -n "$CMD" ] || exit 0

# Whole command: letters, digits, space and a few inert punctuation marks only.
# Quotes are allowed here but refused in the tmux part below.
SAFE_CHARS='^[A-Za-z0-9 _.:/%@=+,|'\''"-]+$'
[[ "$CMD" =~ $SAFE_CHARS ]] || exit 0

# No empty pipe stage ("a |", "a | | b", "| a").
EMPTY_STAGE='(^[[:space:]]*\|)|(\|[[:space:]]*\|)|(\|[[:space:]]*$)'
[[ "$CMD" =~ $EMPTY_STAGE ]] && exit 0

IFS='|' read -ra STAGES <<< "$CMD"

# Stage 1: tmux itself, unquoted.
FIRST="${STAGES[0]}"
[[ "$FIRST" == *"'"* || "$FIRST" == *'"'* ]] && exit 0
read -ra TOK <<< "$FIRST"
[ "${TOK[0]:-}" = "tmux" ] || exit 0

i=1
while [ "${TOK[$i]:-}" = "-L" ] || [ "${TOK[$i]:-}" = "-S" ]; do
  next="${TOK[$((i + 1))]:-}"
  [ -n "$next" ] && [ "${next#-}" = "$next" ] || exit 0
  i=$((i + 2))
done

case "${TOK[$i]:-}" in
  capture-pane|capturep|ls|list-sessions|list-windows|lsw|list-panes|lsp|has-session|has) ;;
  *) exit 0 ;;
esac

# Later stages: plain text readers only.
for ((s = 1; s < ${#STAGES[@]}; s++)); do
  read -ra RT <<< "${STAGES[$s]}"
  case "${RT[0]:-}" in
    tail|head|grep|wc) ;;
    *) exit 0 ;;
  esac
done

printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"read-only tmux (cfn-tmux-readonly-allow)"}}'
exit 0
