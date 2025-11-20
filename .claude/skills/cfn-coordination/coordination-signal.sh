#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli/coordination-signal.js
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


# Bash wrapper for TypeScript coordination-signal CLI
# Provides backward compatibility with existing bash-based coordination
#
# Usage:
#   coordination-signal.sh --task-id <id> --channel <ch> --message <msg> [options]
#
# This wrapper delegates to the TypeScript CLI tool which provides:
# - Type-safe Redis operations
# - Unified namespace handling (swarm/cfn_loop)
# - Automatic timeout management
# - Better error handling

set -euo pipefail

# Get the project root
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "${PWD}")

# Path to the compiled TypeScript CLI
CLI_PATH="${PROJECT_ROOT}/dist/cli/coordination-signal.js"

# Check if CLI is compiled
if [ ! -f "$CLI_PATH" ]; then
    echo "Error: TypeScript CLI not compiled. Run 'npm run build' first." >&2
    exit 1
fi

# Ensure Node.js is available
if ! command -v node &>/dev/null; then
    echo "Error: Node.js not found. Required to run coordination CLI." >&2
    exit 1
fi

# Pass all arguments to the TypeScript CLI
exec node "$CLI_PATH" "$@"
