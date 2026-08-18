#!/bin/sh
# CFN Careful Guard - PreToolUse hook for destructive command detection
# Intercepts Bash tool calls and blocks dangerous patterns
# NOTE: POSIX sh only. No jq dependency (may not be installed).


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

# Cut at the first quote that is not backslash-escaped.
COMMAND=$(printf '%s' "$COMMAND" | sed 's/\(\(\\.\|[^"\\]\)*\)".*/\1/')

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

# Promised by cfn-careful/SKILL.md and by CLAUDE.md ("Rollback: use backup
# scripts, NOT git checkout"), but never implemented. Discards uncommitted
# work silently, and the pathspec forms are the destructive ones -- plain
# `git checkout <branch>` is a normal branch switch and must stay allowed.
if echo "$CMD_LOWER" | grep -qE 'git[[:space:]]+checkout[[:space:]]+(--[[:space:]]+)?(\.|\*)([[:space:]]|$)'; then
    echo "BLOCKED: git checkout of working-tree paths detected." >&2
    echo "This discards uncommitted changes. Use the edit-safety backup scripts to roll back." >&2
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
