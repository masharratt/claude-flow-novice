#!/usr/bin/env bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: agent-definition-parser.ts
#
# This script will be removed in 90 days. Please migrate to TypeScript.
#
# Migration Guide: See docs/BASH_DEPRECATION_NOTICE.md
# TypeScript Benefits:
#   - Type safety (zero runtime type errors)
#   - 90%+ test coverage
#   - Better performance
#   - Comprehensive documentation
#
# Automatic Migration:
#   Set USE_TYPESCRIPT=true to use TypeScript implementation automatically
#
##############################################################################


# Parse Agent Provider Parameters
# Extracts provider and model from agent profile's PROVIDER_PARAMETERS section
# Usage: parse-agent-provider.sh AGENT_TYPE [--field provider|model]

set -euo pipefail

AGENT_TYPE="${1:-}"
FIELD="${2:---field}"
FIELD_VALUE="${3:-provider}"

if [[ -z "$AGENT_TYPE" ]]; then
    echo "Usage: $0 AGENT_TYPE [--field provider|model]" >&2
    exit 1
fi

# Find agent file in multiple locations
AGENT_FILE=""
SEARCH_PATHS=(
    ".claude/agents/cfn-dev-team/**/${AGENT_TYPE}.md"
    ".claude/agents/custom/${AGENT_TYPE}.md"
    ".claude/agents/${AGENT_TYPE}.md"
)

for pattern in "${SEARCH_PATHS[@]}"; do
    # Use find with glob pattern
    while IFS= read -r -d '' file; do
        if [[ -f "$file" ]]; then
            AGENT_FILE="$file"
            break 2
        fi
    done < <(find .claude/agents -type f -name "${AGENT_TYPE}.md" -print0 2>/dev/null)
done

if [[ -z "$AGENT_FILE" ]]; then
    # Agent file not found, return empty (will fallback to main chat settings)
    echo ""
    exit 0
fi

# Extract PROVIDER_PARAMETERS section
# Format:
# <!-- PROVIDER_PARAMETERS
# provider: kimi
# model: kimi-k2-turbo-preview
# -->

PARAM_VALUE=$(awk '
    /<!-- PROVIDER_PARAMETERS/,/-->/ {
        if ($0 ~ /^'"${FIELD_VALUE}"':/) {
            sub(/^'"${FIELD_VALUE}"':[ \t]*/, "")
            print $0
            exit
        }
    }
' "$AGENT_FILE" | tr -d '\r' | xargs)

echo "$PARAM_VALUE"
