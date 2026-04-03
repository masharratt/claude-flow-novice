#!/bin/sh
# CFN Careful Guard - PreToolUse hook for destructive command detection
# Intercepts Bash tool calls and blocks dangerous patterns
# NOTE: POSIX sh only. No jq dependency (may not be installed).

INPUT=$(timeout 1 cat 2>/dev/null || echo "")

# Extract command from JSON without jq
# Pattern: "command":"<value>" or "command": "<value>"
COMMAND=$(echo "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)"/\1/p' | head -1)

# Handle escaped quotes in command value - trim at next unescaped quote
COMMAND=$(echo "$COMMAND" | sed 's/\([^\\]\)".*/\1/')

[ -z "$COMMAND" ] && exit 0

# Normalize: lowercase for pattern matching
CMD_LOWER=$(echo "$COMMAND" | tr '[:upper:]' '[:lower:]')

# --- File destruction ---
# Check for rm -rf / rm -r but allow safe dirs
if echo "$CMD_LOWER" | grep -qE 'rm[[:space:]]+(-[a-z]*r[a-z]*f|--recursive|-[a-z]*f[a-z]*r)'; then
    # Whitelisted safe deletion targets
    if echo "$CMD_LOWER" | grep -qE '(node_modules|\.next|dist|__pycache__|\.cache|\.turbo|/tmp/)'; then
        exit 0
    fi
    echo "BLOCKED: Destructive file deletion detected." >&2
    echo "If intentional, remove specific files by name or confirm with the user." >&2
    exit 2
fi

# --- Database destruction ---
if echo "$CMD_LOWER" | grep -qiE '(drop[[:space:]]+table|drop[[:space:]]+database|truncate[[:space:]]+)'; then
    echo "BLOCKED: Destructive database operation detected." >&2
    echo "Confirm with the user before executing database destruction." >&2
    exit 2
fi

# --- Git force operations ---
if echo "$CMD_LOWER" | grep -qE 'git[[:space:]]+push[[:space:]]+.*(-f|--force)'; then
    echo "BLOCKED: Force push detected." >&2
    echo "Force push can overwrite remote history. Confirm with the user." >&2
    exit 2
fi

if echo "$CMD_LOWER" | grep -qE 'git[[:space:]]+reset[[:space:]]+--hard'; then
    echo "BLOCKED: Hard reset detected." >&2
    echo "This discards uncommitted changes. Confirm with the user." >&2
    exit 2
fi

if echo "$CMD_LOWER" | grep -qE 'git[[:space:]]+clean[[:space:]]+.*-f'; then
    echo "BLOCKED: git clean -f detected." >&2
    echo "This removes untracked files permanently. Confirm with the user." >&2
    exit 2
fi

# --- Container destruction ---
if echo "$CMD_LOWER" | grep -qE '(kubectl[[:space:]]+delete|docker[[:space:]]+system[[:space:]]+prune|docker[[:space:]]+rm[[:space:]]+-f)'; then
    echo "BLOCKED: Destructive container operation detected." >&2
    echo "Confirm with the user before executing." >&2
    exit 2
fi

# --- Disk overwrite ---
if echo "$CMD_LOWER" | grep -qE 'dd[[:space:]]+if=/dev/(zero|random|urandom)'; then
    echo "BLOCKED: Disk overwrite detected." >&2
    exit 2
fi

exit 0
