#!/usr/bin/env bash

##############################################################################
# CFN Error Logging - CLI Integration Script
# Version: 1.0.0
#
# Integration script for CLI CFN Loop error logging
# Automatically triggers error capture on CLI failures
#
# Usage: Source this script in CLI commands or orchestrator scripts
# source /path/to/integrate-cli.sh
##############################################################################

# CFN Error Logging CLI Integration
# This script provides helper functions for CLI CFN Loop error logging

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ERROR_LOGGING_SCRIPT="$SCRIPT_DIR/invoke-error-logging.sh"

# Helper function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Ensure error logging script exists
if [ ! -f "$ERROR_LOGGING_SCRIPT" ]; then
  echo "⚠️  Warning: CFN error logging script not found at $ERROR_LOGGING_SCRIPT"
  return 1
fi

# Function to capture error on CFN Loop failure
cfn_capture_error() {
  local task_id="$1"
  local error_type="${2:-cli}"
  local error_message="${3:-CFN Loop failed}"
  local exit_code="${4:-$?}"
  local context_json="${5:-}"

  # Only capture if we have a task ID
  if [ -n "$task_id" ]; then
    "$ERROR_LOGGING_SCRIPT" \
      --action capture \
      --task-id "$task_id" \
      --error-type "$error_type" \
      --error-message "$error_message" \
      --exit-code "$exit_code" \
      --context "$context_json" \
      >/dev/null 2>&1 || true
  fi
}

# Function to generate error report
cfn_generate_report() {
  local task_id="$1"
  local format="${2:-markdown}"

  if [ -n "$task_id" ]; then
    "$ERROR_LOGGING_SCRIPT" \
      --action report \
      --task-id "$task_id" \
      --format "$format" \
      2>/dev/null || echo "Failed to generate report for task: $task_id"
  else
    echo "❌ Error: Task ID required for report generation"
    return 1
  fi
}

# Function to show available error logs
cfn_list_errors() {
  local since="${1:-24h}"
  local format="${2:-table}"

  "$ERROR_LOGGING_SCRIPT" \
    --action list \
    --since "$since" \
    --format "$format" \
    2>/dev/null || echo "Failed to list error logs"
}

# Function to run system diagnostics
cfn_run_diagnostics() {
  "$ERROR_LOGGING_SCRIPT" \
    --action diagnostics \
    2>/dev/null || echo "Failed to run diagnostics"
}

# Function to validate dependencies
cfn_validate_dependencies() {
  "$ERROR_LOGGING_SCRIPT" \
    --action validate \
    2>/dev/null || echo "Failed to validate dependencies"
}

# Enhanced CLI command wrapper with error logging
cfn_cli_wrapper() {
  local command="$1"
  local task_id="$2"
  shift 2

  # Generate task ID if not provided
  if [ -z "$task_id" ]; then
    task_id="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"
  fi

  # Execute the command with error capture
  if "$command"; then
    local exit_code=$?
    log "✅ CLI command succeeded for task: $task_id"
    return $exit_code
  else
    local exit_code=$?
    log "❌ CLI command failed for task: $task_id (exit code: $exit_code)"

    # Capture error details
    cfn_capture_error "$task_id" "cli" "CLI command failed: $command" "$exit_code"

    # Generate and show report
    echo ""
    echo "📋 Generating error report..."
    cfn_generate_report "$task_id"

    return $exit_code
  fi
}

# Error trap for automatic capture
# Usage: trap 'cfn_error_trap $TASK_ID "CLI operation failed"' ERR
cfn_error_trap() {
  local task_id="$1"
  local context="${2:-Unknown error occurred}"
  local exit_code="${3:-$?}"

  log "🚨 CFN Error Trap activated"
  cfn_capture_error "$task_id" "trap" "$context" "$exit_code"

  # Generate report automatically
  if [ -n "$task_id" ]; then
    echo ""
    echo "📋 Auto-generated error report:"
    cfn_generate_report "$task_id"
  fi
}

# Pre-flight validation with error capture
cfn_preflight_check() {
  local task_id="$1"

  log "🔍 Running pre-flight validation for task: $task_id"

  # Validate dependencies
  if ! cfn_validate_dependencies; then
    local exit_code=$?
    cfn_capture_error "$task_id" "preflight" "Pre-flight validation failed" "$exit_code"
    return $exit_code
  fi

  # Validate environment
  local issues=()

  # Check Redis
  if ! redis-cli ping >/dev/null 2>&1; then
    issues+=("Redis not connected")
  fi

  # Check available memory
  if command -v free >/dev/null 2>&1; then
    local available_mem=$(free -m 2>/dev/null | awk 'NR==2{print int($7)}' || echo "0")
    if [ "$available_mem" -lt 512 ]; then
      issues+=("Low memory (${available_mem}MB available)")
    fi
  fi

  # Check disk space
  if command -v df >/dev/null 2>&1; then
    local available_space=$(df "$PROJECT_ROOT" 2>/dev/null | awk 'NR==2{print int($4/1024)}' || echo "0")
    if [ "$available_space" -lt 100 ]; then
      issues+=("Low disk space (${available_space}MB available)")
    fi
  fi

  if [ ${#issues[@]} -gt 0 ]; then
    log "⚠️  Pre-flight issues detected:"
    for issue in "${issues[@]}"; do
      log "  - $issue"
    done

    # Don't fail on warnings, just capture
    local context_json="{\"warnings\": [$(printf '"%s",' "${issues[@]}" | sed 's/,$//')],\"severity\": \"warning\"}"
    cfn_capture_error "$task_id" "preflight-warnings" "Pre-flight validation completed with warnings" "0" "$context_json"
  else
    log "✅ Pre-flight validation passed"
  fi
}

# Post-error cleanup with error logging
cfn_post_error_cleanup() {
  local task_id="$1"
  local exit_code="${2:-$?}"

  log "🧹 Running post-error cleanup for task: $task_id"

  # Capture final error state
  cfn_capture_error "$task_id" "cleanup" "Post-error cleanup triggered" "$exit_code"

  # Run cleanup
  if [ -f "$ERROR_LOGGING_SCRIPT" ]; then
    "$ERROR_LOGGING_SCRIPT" --action cleanup --retention-days 7 >/dev/null 2>&1 || true
  fi

  log "✅ Post-error cleanup completed"
}

# Export functions for use in other scripts
export -f cfn_capture_error
export -f cfn_generate_report
export -f cfn_list_errors
export -f cfn_run_diagnostics
export -f cfn_validate_dependencies
export -f cfn_cli_wrapper
export -f cfn_error_trap
export -f cfn_preflight_check
export -f cfn_post_error_cleanup

# Convenience aliases
alias cfn-logs='cfn_list_errors'
alias cfn-report='cfn_generate_report'
alias cfn-diag='cfn_run_diagnostics'
alias cfn-check='cfn_validate_dependencies'

log "CFN Error Logging CLI integration loaded"