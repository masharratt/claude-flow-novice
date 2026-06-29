#!/bin/bash
# cfn-docs-sync-check.sh
# Enforces the CLAUDE.md commit-time documentation rule:
#   Every commit that changes code MUST update readme/feature-status.md
#   and readme/state-machines.md.
#
# Behavior:
#   - Only fires when the staged diff touches CODE paths (src/, lib/, .claude/skills, etc.).
#   - Warns (exit 0) by default so doc-only / infra-only / config commits are never blocked.
#   - Set CFN_DOCS_SYNC_STRICT=1 to BLOCK the commit (exit 1) when docs are missing.
#   - Bypass entirely with git commit --no-verify.
#
# Invoked from .git/hooks/pre-commit. Standalone-testable: pass a newline-separated
# file list on stdin via CFN_DOCS_SYNC_STDIN=1 to skip `git diff`.
set -euo pipefail

YELLOW='\033[1;33m'; RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'

FEATURE_DOC="readme/feature-status.md"
STATE_DOC="readme/state-machines.md"

# Code paths that should trigger the docs-sync reminder.
CODE_REGEX='^(src/|lib/|app/|packages/|\.claude/skills/|\.claude/hooks/|\.claude/commands/)'
# Within those, only real source extensions count (skip .md, .json, .txt docs).
CODE_EXT_REGEX='\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|sh|sql)$'

# Gather staged file list (or stdin in test mode).
if [ "${CFN_DOCS_SYNC_STDIN:-0}" = "1" ]; then
    staged=$(cat)
else
    staged=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
fi

[ -z "$staged" ] && exit 0

# Does the staged set include code?
code_changed=$(echo "$staged" | grep -E "$CODE_REGEX" 2>/dev/null | grep -E "$CODE_EXT_REGEX" 2>/dev/null || true)
[ -z "$code_changed" ] && exit 0

# Are the mandated docs staged in this same commit?
feature_staged=$(echo "$staged" | grep -Fx "$FEATURE_DOC" 2>/dev/null || true)
state_staged=$(echo "$staged" | grep -Fx "$STATE_DOC" 2>/dev/null || true)

missing=()
[ -z "$feature_staged" ] && missing+=("$FEATURE_DOC")
[ -z "$state_staged" ]   && missing+=("$STATE_DOC")

if [ ${#missing[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ docs-sync: feature-status.md + state-machines.md staged${NC}"
    exit 0
fi

echo -e "${YELLOW}⚠ docs-sync: code changed but these mandated docs are not staged:${NC}" >&2
for f in "${missing[@]}"; do
    echo -e "${YELLOW}    - $f${NC}" >&2
done
echo -e "${YELLOW}  CLAUDE.md requires every code commit to update them.${NC}" >&2
echo -e "${YELLOW}  Update + 'git add' them, or bypass with: git commit --no-verify${NC}" >&2

if [ "${CFN_DOCS_SYNC_STRICT:-0}" = "1" ]; then
    echo -e "${RED}  CFN_DOCS_SYNC_STRICT=1 -> blocking commit.${NC}" >&2
    exit 1
fi
exit 0
