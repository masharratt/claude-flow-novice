#!/usr/bin/env bash
###############################################################################
# SQLite Memory CLI - Bash Wrapper
# Provides agent-accessible memory operations via simple CLI interface
#
# Usage:
#   ./memory-cli.sh set --key <key> --value <value> --acl <level>
#   ./memory-cli.sh get --key <key>
#   ./memory-cli.sh delete --key <key>
#   ./memory-cli.sh query --pattern <glob>
#   ./memory-cli.sh list --acl <level>
###############################################################################

set -euo pipefail

# Detect project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Path to TypeScript CLI
MEMORY_CLI_TS="$PROJECT_ROOT/src/cli/memory-cli.ts"
MEMORY_CLI_DIST="$PROJECT_ROOT/dist/cli/memory-cli.js"

# Configuration
CONFIG_FILE="$PROJECT_ROOT/.claude/skills/sqlite-memory/config.json"
AGENT_ID="${AGENT_ID:-$(whoami)}"

###############################################################################
# Helper Functions
###############################################################################

log_info() {
  echo "[INFO] $*" >&2
}

log_error() {
  echo "[ERROR] $*" >&2
}

check_dependencies() {
  # Check if Node.js is available
  if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js to use memory-cli."
    exit 1
  fi

  # Check if tsx is available for TypeScript execution
  if ! command -v tsx &> /dev/null && ! command -v npx &> /dev/null; then
    log_error "tsx or npx is not available. Please install tsx or npx."
    exit 1
  fi
}

run_memory_cli() {
  # Try to run compiled version first (faster), fallback to TypeScript
  if [ -f "$MEMORY_CLI_DIST" ]; then
    node "$MEMORY_CLI_DIST" "$@"
  elif [ -f "$MEMORY_CLI_TS" ]; then
    # Use tsx for direct TypeScript execution
    if command -v tsx &> /dev/null; then
      tsx "$MEMORY_CLI_TS" "$@"
    else
      npx tsx "$MEMORY_CLI_TS" "$@"
    fi
  else
    log_error "Memory CLI not found at $MEMORY_CLI_TS or $MEMORY_CLI_DIST"
    exit 1
  fi
}

###############################################################################
# Main Execution
###############################################################################

main() {
  # Check dependencies
  check_dependencies

  # Ensure memory directory exists
  MEMORY_DIR="$PROJECT_ROOT/.artifacts/memory"
  mkdir -p "$MEMORY_DIR"

  # Pass all arguments to TypeScript CLI
  run_memory_cli "$@"
}

# Execute main with all arguments
main "$@"
