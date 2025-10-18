#!/bin/bash

# Agent Spawning CLI Wrapper
# Enables agents to spawn other agents or stop existing agents via simple CLI interface

set -euo pipefail

# ============================================================================
# DEPENDENCY CHECKS
# ============================================================================

check_dependencies() {
  local missing_deps=()

  # Check bash version
  if [[ "${BASH_VERSINFO[0]}" -lt 4 ]]; then
    missing_deps+=("bash>=4.0")
  fi

  # Check required command-line tools
  local required_tools=("npx" "node" "grep" "sed")
  for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" &> /dev/null; then
      missing_deps+=("$tool")
    fi
  done

  # Check required Node.js modules
  if ! npx -c "require('redis') && require('dotenv')" &> /dev/null; then
    missing_deps+=("redis" "dotenv")
  fi

  # Specific Claude Flow dependencies
  local claude_deps=(
    "Task tool"
    "session-manager.js"
    "redis-coordination scripts"
  )

  for dep in "${claude_deps[@]}"; do
    if [[ ! -d "$PROJECT_ROOT/.claude" ]]; then
      missing_deps+=("$dep")
    fi
  done

  # Report missing dependencies
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    log_error "Missing Dependencies:"
    for dep in "${missing_deps[@]}"; do
      echo "  - $dep"
    done

    log_warning "Recommended Installation:"
    echo "  1. Install Node.js and npm (latest LTS version)"
    echo "  2. Run: npm install redis dotenv"
    echo "  3. Clone Claude Flow Novice repository"

    exit 1
  fi
}

# Rest of the script remains the same as the previous version...
# (includes all previous functions like log_info, show_usage, etc.)

# Augment main function to include dependency check
main() {
  check_dependencies  # Add this line before argument parsing

  # Existing main function logic remains unchanged
  ...
}

# Run main function
main "$@"