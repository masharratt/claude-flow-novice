#!/usr/bin/env bash

# COMPLETED ONE-OFF MIGRATION (Oct 2025, commit 921604f4d). Retained for history.
# MUST NOT be re-run.
#
# The core rule below, `.claude/skills/` -> `.claude/skills/cfn-`, is not
# idempotent: each run prepends another `cfn-`, yielding `cfn-cfn-`, then
# `cfn-cfn-cfn-`. The original run corrupted 94 files that way. Some of the
# damage was only found in Aug 2026, because a single substitution produces a
# path that still looks plausible. Every target name already carries the `cfn-`
# prefix now, so a re-run can only damage.
#
# If you need a path sweep, write a fresh script that validates every target
# exists before writing, and verify it resolves after. See
# tests/test-shell-portability.sh for the gate that catches this class.
echo "REFUSING TO RUN: scripts/update_paths.sh is a completed one-off migration" >&2
echo "  (commit 921604f4d). Its .claude/skills/ -> .claude/skills/cfn- rule is not" >&2
echo "  idempotent; re-running prepends another cfn- and corrupts every path it" >&2
echo "  touches. Read the comment block in this file before doing anything." >&2
exit 1

# Path replacements

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
SKILL_REPLACEMENTS=(
    ".claude/skills/redis-coordination/:\.claude/skills/cfn-redis-coordination/"
    ".claude/skills/agent-spawning/:\.claude/skills/cfn-agent-spawning/"
    ".claude/skills/playbook/:\.claude/skills/cfn-playbook/"
    ".claude/skills/:\.claude/skills/cfn-"
)

HOOK_REPLACEMENTS=(
    ".claude/hooks/invoke-post-edit.sh:\.claude/hooks/cfn-invoke-post-edit.sh"
    ".claude/hooks/post-edit.sh:\.claude/hooks/cfn-post-edit.sh"
    ".claude/hooks/:\.claude/hooks/cfn-"
)

DATA_REPLACEMENTS=(
    ".claude/data/:\.claude/cfn-data/"
)

# Function to perform replacements in a file
replace_paths() {
    local file="$1"
    local replacements=("${@:2}")

    # Perform replacements for each pattern
    for replacement in "${replacements[@]}"; do
        IFS=':' read -r old_path new_path <<< "$replacement"
        sed -i "s|${old_path}|${new_path}|g" "$file"
    done
}

# Find and update markdown files
find .claude/agents/cfn-dev-team -name "*.md" | while read -r file; do
    echo "Processing $file"

    # Skill path replacements
    replace_paths "$file" "${SKILL_REPLACEMENTS[@]}"

    # Hook path replacements
    replace_paths "$file" "${HOOK_REPLACEMENTS[@]}"

    # Data path replacements
    replace_paths "$file" "${DATA_REPLACEMENTS[@]}"
done

echo "Path replacements complete!"