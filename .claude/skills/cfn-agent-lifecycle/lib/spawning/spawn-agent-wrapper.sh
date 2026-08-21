#!/usr/bin/env bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli/spawn-agent-cli.js
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

# Backward Compatibility Wrapper for Agent Spawner
#
# Provides backward compatibility with bash version by delegating
# to TypeScript implementation. Maintains 100% CLI interface compatibility.
#
# Usage: Same as original spawn-agent.sh
#   spawn-agent-wrapper.sh <agent-type> --task-id <id> [options]

set -euo pipefail

# ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Block Task Mode agents
# Task Mode agents spawn via Task() tool and should NOT use agent spawning CLI
# CLI mode requires TASK_ID environment variable (validates existence, not pattern)
if [[ -z "${TASK_ID:-}" ]]; then
    echo "❌ ERROR: TASK_ID environment variable required for CLI mode" >&2
    echo "🚨 ANTI-023: This script is for CLI-spawned coordinators only" >&2
    echo "💡 Task Mode agents should use Task() tool, not CLI spawning" >&2
    exit 1
fi

# Sanitize TASK_ID to prevent command injection
if [[ "${TASK_ID}" =~ [^a-zA-Z0-9._-] ]]; then
    echo "❌ ERROR: TASK_ID contains invalid characters: ${TASK_ID}" >&2
    echo "Allowed: alphanumeric, dot, underscore, hyphen" >&2
    exit 1
fi

# Validate required parameters for CLI mode
if [[ -z "${1:-}" ]]; then
    echo "❌ ERROR: Agent type required" >&2
    exit 1
fi

# Get the project root
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)}"

# Delegate to TypeScript implementation
# The CLI expects agent type as first argument, followed by options
node "${PROJECT_ROOT}/dist/cli/spawn-agent-cli.js" "$@"
exit $?
