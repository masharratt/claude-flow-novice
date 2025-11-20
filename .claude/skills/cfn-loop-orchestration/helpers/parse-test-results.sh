#!/usr/bin/env bash
##############################################################################
# Parse Test Results - TypeScript Wrapper
# Parses test output from multiple testing frameworks
#
# This is a wrapper script that delegates to the TypeScript implementation
# for better type safety and maintainability.
#
# Usage:
#   parse-test-results.sh <framework|auto> <output_file_or_string>
#
# Frameworks:
#   - jest: Jest testing framework
#   - mocha: Mocha testing framework
#   - pytest: Python pytest
#   - tap: TAP (Test Anything Protocol)
#   - go: Go test output
#   - auto: Auto-detect framework
#
# Returns JSON:
#   {
#     "framework": "jest",
#     "total": 10,
#     "passed": 8,
#     "failed": 2,
#     "skipped": 0,
#     "passRate": 0.8,
#     "durationMs": 1234,
#     "failedTestNames": ["test1", "test2"],
#     "raw": "..."
#   }
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Path to compiled TypeScript
TS_DIST="$SKILL_ROOT/dist/helpers/parse-test-results.js"

# Check if TypeScript implementation exists
if [ ! -f "$TS_DIST" ]; then
  echo "❌ Error: TypeScript implementation not found at: $TS_DIST" >&2
  echo "   Run 'npm run build' in .claude/skills/cfn-loop-orchestration/" >&2
  exit 1
fi

# Check if node is available
if ! command -v node &>/dev/null; then
  echo "❌ Error: Node.js is required but not found in PATH" >&2
  exit 1
fi

# Execute TypeScript implementation
exec node "$TS_DIST" "$@"
