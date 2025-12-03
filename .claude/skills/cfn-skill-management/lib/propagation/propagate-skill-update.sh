#!/usr/bin/env bash
#
# propagate-skill-update.sh - Bash wrapper for TypeScript Skill Propagation System
#
# This script provides backward compatibility with the original bash implementation
# while delegating to the TypeScript implementation for core functionality.
#
# Usage:
#   propagate-skill-update.sh SKILL_NAME NEW_VERSION UPDATE_PATH [CHANGE_TYPE] [NOTIFY_AGENTS]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Export environment variables for TypeScript CLI
export CFN_SKILLS_DB_PATH="${CFN_SKILLS_DB_PATH:-./.claude/skills-database/skills.db}"
export PHASE4_POSTGRES_HOST="${PHASE4_POSTGRES_HOST:-}"
export PHASE4_POSTGRES_DB="${PHASE4_POSTGRES_DB:-workflow_codification}"
export PHASE4_POSTGRES_USER="${PHASE4_POSTGRES_USER:-}"
export PHASE4_POSTGRES_PASS="${PHASE4_POSTGRES_PASS:-}"
export ENABLE_AGENT_NOTIFICATIONS="${ENABLE_AGENT_NOTIFICATIONS:-false}"
export DEBUG="${DEBUG:-0}"

# Check if TypeScript is compiled
if [[ ! -f "$SCRIPT_DIR/dist/cli.js" ]]; then
    echo "[ERROR] TypeScript build not found. Run 'npm run build' in $SCRIPT_DIR" >&2
    exit 1
fi

# Run TypeScript implementation
node "$SCRIPT_DIR/dist/cli.js" "$@"
