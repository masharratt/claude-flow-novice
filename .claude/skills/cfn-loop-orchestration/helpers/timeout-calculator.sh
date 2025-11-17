#!/usr/bin/env bash

##############################################################################
# Timeout Calculator
# Calculates phase-specific timeouts for agent execution
#
# Usage:
#   timeout-calculator.sh --phase-id <phase-identifier>
#
# Returns:
#   Timeout value in seconds (stdout)
##############################################################################

set -euo pipefail

# Parameters
PHASE_ID=""
DEFAULT_TIMEOUT=3600  # 60 minutes

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --phase-id) PHASE_ID="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Phase-specific timeout configuration
# Based on empirical data from Sprint 6
case "$PHASE_ID" in
  phase-1)
    # Backend work - relatively fast
    echo 900  # 15 minutes
    ;;
  phase-2)
    # React components - more complex
    echo 3600  # 60 minutes
    ;;
  phase-3)
    # Advanced components - complex
    echo 3600  # 60 minutes
    ;;
  phase-4)
    # Testing/integration - moderate
    echo 1800  # 30 minutes
    ;;
  *)
    # Unknown phase - use default
    echo $DEFAULT_TIMEOUT
    ;;
esac
