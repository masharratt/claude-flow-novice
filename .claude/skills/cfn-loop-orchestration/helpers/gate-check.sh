#!/usr/bin/env bash
##############################################################################
# Gate Check - TypeScript Wrapper
# Validates Loop 3 self-assessment using test pass rate thresholds
#
# This is a wrapper script that delegates to the TypeScript implementation
# for better type safety and maintainability.
#
# Usage:
#   gate-check.sh --pass-rate <0.0-1.0> \
#                 [--threshold <0.0-1.0>] \
#                 [--mode <mvp|standard|enterprise>]
#
# Mode-Specific Thresholds:
#   - mvp:        0.70 (70% pass rate)
#   - standard:   0.95 (95% pass rate) [default]
#   - enterprise: 0.98 (98% pass rate)
#
# Returns JSON:
#   {
#     "passed": true|false,
#     "passRate": 0.96,
#     "threshold": 0.95,
#     "mode": "standard",
#     "gap": 0.0,
#     "reason": "Gate PASSED: ..."
#   }
#
# Exit Codes:
#   0: Gate passed
#   1: Gate failed
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Path to compiled TypeScript
TS_DIST="$SKILL_ROOT/dist/helpers/gate-check.js"

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
