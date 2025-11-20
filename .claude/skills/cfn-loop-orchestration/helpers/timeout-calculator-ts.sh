#!/usr/bin/env bash

##############################################################################
# Timeout Calculator (TypeScript Wrapper)
# Calculates mode and phase-specific timeouts for agent execution
#
# Usage:
#   timeout-calculator-ts.sh --mode <mvp|standard|enterprise> [--phase <phase-id>]
#
# Returns:
#   Timeout value in seconds (stdout)
##############################################################################

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPERS_DIR="$SCRIPT_DIR/../src/helpers"

# Parameters
MODE="standard"
PHASE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode) MODE="$2"; shift 2 ;;
    --phase) PHASE="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Build TypeScript invocation
TS_CODE="
import { calculateTimeout } from './timeout-calculator';

const timeout = calculateTimeout({
  mode: '$MODE',
  ${PHASE:+phase: '$PHASE'}
});

console.log(timeout);
"

# Execute TypeScript code
cd "$HELPERS_DIR"
ts-node -e "$TS_CODE"
