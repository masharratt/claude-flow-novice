#!/usr/bin/env bash
# PostToolUse guard: warn when a CLAUDE.md grows past its token ceiling.
# Non-destructive — edit is already applied; this only surfaces a warning to Claude.
# Thresholds mirror ~/.claude/references/claude-md-structure.md.
#   Root CLAUDE.md:   target 1500 tok, ceiling 2500 tok
#   Nested CLAUDE.md: target 500 tok,  ceiling 1000 tok
# Token estimate: words * 1.3 (cheap, no tokenizer dependency).

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')
[ -z "$FILE" ] && exit 0

# Only CLAUDE.md files.
case "$(basename "$FILE")" in
  CLAUDE.md) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

# Exempt the user-global config (~/.claude/CLAUDE.md) — governed separately, not a project file.
case "$FILE" in
  "$HOME/.claude/CLAUDE.md"|/root/.claude/CLAUDE.md) exit 0 ;;
esac

WORDS=$(wc -w < "$FILE" 2>/dev/null || echo 0)
TOKENS=$(( WORDS * 13 / 10 ))

# Nested if any CLAUDE.md exists in an ancestor dir; else treat as root.
DIR=$(dirname "$FILE")
PARENT=$(dirname "$DIR")
NESTED=0
while [ "$PARENT" != "/" ] && [ "$PARENT" != "." ]; do
  if [ -f "$PARENT/CLAUDE.md" ]; then NESTED=1; break; fi
  PARENT=$(dirname "$PARENT")
done

if [ "$NESTED" = "1" ]; then
  CEIL=1000; TARGET=500; KIND="nested"
else
  CEIL=2500; TARGET=1500; KIND="root"
fi

if [ "$TOKENS" -gt "$CEIL" ]; then
  echo "WARNING: $FILE is ~${TOKENS} tokens (${WORDS} words), over the ${KIND} CLAUDE.md ceiling of ${CEIL}. Break sections out into reference files with load-when pointers. See ~/.claude/references/claude-md-structure.md." >&2
  exit 2
elif [ "$TOKENS" -gt "$TARGET" ]; then
  echo "NOTE: $FILE is ~${TOKENS} tokens (${WORDS} words), over the ${KIND} target of ${TARGET} (ceiling ${CEIL}). Consider trimming or breaking out." >&2
  exit 2
fi
exit 0
