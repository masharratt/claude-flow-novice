#!/usr/bin/env bash

##############################################################################
# CFN Error Logging Skill - Main Invocation Script
# Version: 1.0.0
#
# Comprehensive error logging and diagnostic capture for CFN Loop failures
# Creates detailed error reports that users can send for debugging
#
# Usage:
#   invoke-error-logging.sh --action <capture|report|cleanup|list> \
#                        --task-id <unique-id> \
#                        [--error-type <type>] \
#                        [--error-message <message>] \
#                        [--exit-code <number>] \
#                        [--context <json>]
##############################################################################

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Determine script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
LOG_BASE_DIR="/tmp/cfn_error_logs"
RETENTION_DAYS="${CFN_ERROR_LOG_RETENTION:-7}"
MAX_LOG_SIZE_MB="${CFN_ERROR_LOG_MAX_SIZE_MB:-100}"

# Initialize variables
ACTION=""
TASK_ID=""
ERROR_TYPE=""
ERROR_MESSAGE=""
EXIT_CODE=""
CONTEXT_JSON=""
FORMAT="markdown"
SINCE_TIME=""

# Helper functions
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

show_usage() {
  cat << EOF
CFN Error Logging Skill v1.0.0

Usage: $0 --action <action> --task-id <id> [options]

ACTIONS:
  capture      Capture error data and diagnostics
  report       Generate user-friendly error report
  cleanup      Clean up old error logs
  list         List error logs
  diagnostics  Run system diagnostics
  validate     Validate dependencies

REQUIRED:
  --action <action>     Action to perform

OPTIONAL:
  --task-id <id>        CFN Loop task identifier (required for capture, report, list)

OPTIONS:
  --error-type <type>    Type of error (orchestrator, agent-spawn, timeout, etc.)
  --error-message <msg>  Human-readable error description
  --exit-code <code>     Process exit code
  --context <json>       Additional context data
  --format <format>      Report format (markdown|json)
  --since <time>         List errors since time (e.g., "24h", "7d")
  --retention-days <n>   Cleanup retention period (default: 7)

EXAMPLES:
  # Capture error on CFN Loop failure
  $0 --action capture --task-id "cfn-cli-1731234567" --error-type "orchestrator" --error-message "Agent spawning failed" --exit-code 1

  # Generate user report
  $0 --action report --task-id "cfn-cli-1731234567" --format markdown

  # List recent errors
  $0 --action list --since "24h" --format table

  # Clean old logs
  $0 --action cleanup --retention-days 7
EOF
}

validate_parameters() {
  if [ -z "$ACTION" ]; then
    echo "❌ Error: Missing required action parameter"
    echo "Use --help for usage information"
    exit 1
  fi

  # Task ID is required for most actions but optional for diagnostics, validate, cleanup, and list
  case "$ACTION" in
    diagnostics|validate|cleanup|list)
      # Task ID optional for these actions
      ;;
    *)
      if [ -z "$TASK_ID" ]; then
        echo "❌ Error: Missing required task-id parameter for action '$ACTION'"
        echo "Use --help for usage information"
        exit 1
      fi
      ;;
  esac

  # Validate action
  case "$ACTION" in
    capture|report|cleanup|list|diagnostics|validate)
      ;;
    *)
      echo "❌ Error: Invalid action '$ACTION'"
      echo "Valid actions: capture, report, cleanup, list, diagnostics, validate"
      exit 1
      ;;
  esac

  # Validate task ID format (only if task ID is provided)
  if [ -n "$TASK_ID" ] && [[ ! "$TASK_ID" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    echo "❌ Error: Invalid task ID format"
    echo "Task ID should contain only letters, numbers, hyphens, and underscores"
    exit 1
  fi
}

setup_directories() {
  # Create log directory structure
  mkdir -p "$LOG_BASE_DIR"
  mkdir -p "$LOG_BASE_DIR/reports"
  mkdir -p "$LOG_BASE_DIR/compressed"

  # Set permissions
  chmod 755 "$LOG_BASE_DIR"
  chmod 755 "$LOG_BASE_DIR/reports"
  chmod 755 "$LOG_BASE_DIR/compressed"
}

collect_system_diagnostics() {
  local diagnostics_file="$1"

  log "Collecting system diagnostics..."

  # System information
  {
    echo "{"
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"hostname\": \"$(hostname 2>/dev/null || echo 'unknown')\","
    echo "  \"user\": \"$(whoami 2>/dev/null || echo 'unknown')\","
    echo "  \"working_directory\": \"$(pwd)\","
    echo "  \"os\": \"$(uname -s 2>/dev/null || echo 'unknown')\","
    echo "  \"os_version\": \"$(uname -r 2>/dev/null || echo 'unknown')\","
    echo "  \"architecture\": \"$(uname -m 2>/dev/null || echo 'unknown')\","

    # Hardware information
    echo "  \"hardware\": {"
    echo "    \"cpu_cores\": $(nproc 2>/dev/null || echo 'unknown'),"

    if command -v free >/dev/null 2>&1; then
      local mem_info=$(free -h 2>/dev/null || echo "Memory: Unknown")
      echo "    \"memory\": \"$mem_info\""
    else
      echo "    \"memory\": \"Memory information unavailable\""
    fi

    if command -v df >/dev/null 2>&1; then
      local disk_info=$(df -h / 2>/dev/null | tail -1 || echo "Disk: Unknown")
      echo "    \"disk\": \"$disk_info\""
    else
      echo "    \"disk\": \"Disk information unavailable\""
    fi

    echo "  },"

    # Software information
    echo "  \"software\": {"

    if command -v node >/dev/null 2>&1; then
      echo "    \"node_version\": \"$(node --version 2>/dev/null || echo 'unknown')\","
    else
      echo "    \"node_version\": \"not found\""
    fi

    if command -v npx >/dev/null 2>&1; then
      echo "    \"npx_version\": \"$(npx --version 2>/dev/null || echo 'unknown')\","
    else
      echo "    \"npx_version\": \"not found\""
    fi

    if command -v docker >/dev/null 2>&1; then
      echo "    \"docker_version\": \"$(docker --version 2>/dev/null || echo 'unknown')\","
    else
      echo "    \"docker_version\": \"not found\""
    fi

    if command -v redis-cli >/dev/null 2>&1; then
      echo "    \"redis_available\": true"
      if redis-cli ping >/dev/null 2>&1; then
        echo "    \"redis_connected\": true"
        echo "    \"redis_info\": \"$(redis-cli info server 2>/dev/null | head -5 | tr '\n' ' ' || echo '')\""
      else
        echo "    \"redis_connected\": false"
      fi
    else
      echo "    \"redis_available\": false"
      echo "    "redis_connected": false"
    fi

    echo "  },"

    # Environment
    echo "  \"environment\": {"
    echo "    \"path\": \"${PATH:-not set}\","
    echo "    \"home\": \"${HOME:-not set}\","
    echo "    \"shell\": \"${SHELL:-not set}\","
    echo "    \"lang\": \"${LANG:-not set}\""
    echo "  },"

    # Processes
    if command -v pgrep >/dev/null 2>&1; then
      local cfn_processes=$(pgrep -f "claude-flow-novice\|cfn-" 2>/dev/null | wc -l || echo "0")
      echo "  \"processes\": {"
      echo "    \"cfn_running\": $cfn_processes,"
      echo "    \"total_processes\": $(ps aux 2>/dev/null | wc -l || echo 'unknown')"
      echo "  }"
    else
      echo "  \"processes\": {"
      echo "    \"cfn_running\": \"unknown\","
      echo "    \"total_processes\": \"unknown\""
      echo "  }"
    fi

    echo "}"
  } > "$diagnostics_file"
}

collect_cfn_state() {
  local state_file="$1"

  log "Collecting CFN Loop state..."

  {
    echo "{"
    echo "  \"task_id\": \"$TASK_ID\","
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"error_type\": \"$ERROR_TYPE\","
    echo "  \"error_message\": \"$ERROR_MESSAGE\","
    echo "  \"exit_code\": ${EXIT_CODE:-null},"

    # Redis state
    if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
      echo "  \"redis_state\": {"
      echo "    \"connected\": true,"

      # Task context
      local task_context=$(redis-cli HGETALL "cfn_loop:task:$TASK_ID:context" 2>/dev/null || echo "")
      if [ -n "$task_context" ]; then
        echo "    \"task_context\": {"
        echo "$task_context" | sed 's/^/    "/' | sed 's/" "/", "/g' | sed 's/$/"/'
        echo "    },"
      else
        echo "    \"task_context\": null,"
      fi

      # Agent PIDs
      local agent_pids=$(redis-cli KEYS "cfn_loop:task:$TASK_ID:agent:*:pid" 2>/dev/null | wc -l || echo "0")
      echo "    \"tracked_agents\": $agent_pids,"

      # Recent signals
      local recent_signals=$(redis-cli LRANGE "swarm:$TASK_ID:*:done" 0 9 2>/dev/null | wc -l || echo "0")
      echo "    \"recent_signals\": $recent_signals"
      echo "  },"
    else
      echo "  \"redis_state\": {"
      echo "    \"connected\": false,"
      echo "    \"reason\": \"Redis not available or not connected\""
      echo "  },"
    fi

    # Checkpoint state
    local checkpoint_file="/tmp/cfn_loop_${TASK_ID}_checkpoint.json"
    if [ -f "$checkpoint_file" ]; then
      echo "  \"checkpoint\": {"
      echo "    \"available\": true,"
      echo "    \"last_iteration\": $(jq -r '.iteration' "$checkpoint_file" 2>/dev/null || echo 'unknown'),"
      echo "    \"mode\": \"$(jq -r '.mode' "$checkpoint_file" 2>/dev/null || echo 'unknown')\","
      echo "    \"timestamp\": $(jq -r '.timestamp' "$checkpoint_file" 2>/dev/null || echo 'unknown')"
      echo "  },"
    else
      echo "  \"checkpoint\": {"
      echo "    \"available\": false"
      echo "  },"
    fi

    # Temporary files
    local temp_dir="/tmp/cfn_loop_${TASK_ID}"
    if [ -d "$temp_dir" ]; then
      local temp_files=$(find "$temp_dir" -type f 2>/dev/null | wc -l || echo "0")
      echo "  \"temp_files\": {"
      echo "    \"directory\": \"$temp_dir\","
      echo "    \"file_count\": $temp_files"
      echo "  },"
    else
      echo "  \"temp_files\": null,"
    fi

    # Context JSON
    if [ -n "$CONTEXT_JSON" ]; then
      echo "  \"context\": $CONTEXT_JSON"
    fi

    echo "}"
  } > "$state_file"
}

capture_error() {
  local timestamp=$(date +%s)
  local error_log_file="$LOG_BASE_DIR/cfn-error-${TASK_ID}-${timestamp}.json"

  log "Capturing error data for task: $TASK_ID"

  setup_directories

  # Create comprehensive error log
  {
    echo "{"
    echo "  \"capture_id\": \"error-${TASK_ID}-${timestamp}\","
    echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
    echo "  \"unix_timestamp\": $timestamp,"

    # Error details
    echo "  \"error\": {"
    echo "    \"type\": \"$ERROR_TYPE\","
    echo "    \"message\": \"$ERROR_MESSAGE\","
    echo "    \"exit_code\": ${EXIT_CODE:-null},"
    echo "    \"task_id\": \"$TASK_ID\""
    echo "  },"

    # Include system diagnostics and CFN state
    echo "  \"system_diagnostics\": $(cat "${LOG_BASE_DIR}/sys-diagnostics-${timestamp}.json"),"
    echo "  \"cfn_state\": $(cat "${LOG_BASE_DIR}/cfn-state-${TASK_ID}-${timestamp}.json")"

    echo "}"
  } > "$error_log_file"

  # Clean up temporary diagnostic files
  rm -f "${LOG_BASE_DIR}/sys-diagnostics-${timestamp}.json" 2>/dev/null || true
  rm -f "${LOG_BASE_DIR}/cfn-state-${TASK_ID}-${timestamp}.json" 2>/dev/null || true

  log "Error data captured: $error_log_file"
  log "Generate report with: $0 --action report --task-id $TASK_ID"
}

generate_report() {
  local timestamp=$(date +%s)
  local file_ext="md"

  if [ "$FORMAT" = "json" ]; then
    file_ext="json"
  fi

  local report_file="$LOG_BASE_DIR/reports/cfn-report-${TASK_ID}-${timestamp}.${file_ext}"

  # Find the most recent error log for this task
  local error_log=$(find "$LOG_BASE_DIR" -name "cfn-error-${TASK_ID}-*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2- || echo "")

  if [ -z "$error_log" ] || [ ! -f "$error_log" ]; then
    echo "❌ No error log found for task: $TASK_ID"
    echo "Available tasks:"
    find "$LOG_BASE_DIR" -name "cfn-error-*.json" -type f -exec basename {} \; 2>/dev/null | sort -u | sed 's/cfn-error-//g' | sed 's/-[0-9]*\.json$//' | head -10
    return 1
  fi

  log "Generating error report for task: $TASK_ID"

  # Parse error log data
  local error_type=$(jq -r '.error.type' "$error_log" 2>/dev/null || echo "unknown")
  local error_message=$(jq -r '.error.message' "$error_log" 2>/dev/null || echo "No message")
  local exit_code=$(jq -r '.error.exit_code' "$error_log" 2>/dev/null || echo "unknown")
  local error_timestamp=$(jq -r '.timestamp' "$error_log" 2>/dev/null || echo "unknown")

  # System diagnostics
  local redis_available=$(jq -r '.system_diagnostics.software.redis_connected' "$error_log" 2>/dev/null || echo "false")
  local node_version=$(jq -r '.system_diagnostics.software.node_version' "$error_log" 2>/dev/null || echo "not found")
  local npx_version=$(jq -r '.system_diagnostics.software.npx_version' "$error_log" 2>/dev/null || echo "not found")

  # Generate troubleshooting steps
  local troubleshooting_steps=""
  case "$error_type" in
    "orchestrator")
      troubleshooting_steps="1. ✅ Check task configuration parameters\n2. ✅ Verify orchestrator script permissions\n3. ❌ Check system resources (memory/disk)\n4. ✅ Validate agent availability"
      ;;
    "agent-spawn")
      troubleshooting_steps="1. ✅ Check Node.js installation: node --version\n2. ✅ Check npx availability: npx --version\n3. ❌ Check Redis connection: redis-cli ping\n4. ✅ Check available memory: free -h"
      ;;
    "timeout")
      troubleshooting_steps="1. ✅ Check system load: top\n2. ✅ Verify network connectivity\n3. ❌ Increase timeout values if needed\n4. ✅ Check for stuck processes"
      ;;
    "resource")
      troubleshooting_steps="1. ✅ Check available memory: free -h\n2. ✅ Check disk space: df -h\n3. ❌ Close unnecessary applications\n4. ✅ Check process limits: ulimit -a"
      ;;
    *)
      troubleshooting_steps="1. ✅ Check system diagnostics below\n2. ✅ Review error message context\n3. ❌ Check CFN Loop configuration\n4. ✅ Verify all dependencies"
      ;;
  esac

  # Generate report
  cat > "$report_file" << EOF
# CFN Loop Error Report

## 🚨 Error Summary
- **Task ID**: $TASK_ID
- **Error Type**: $error_type
- **Message**: $error_message
- **Timestamp**: $error_timestamp
- **Exit Code**: $exit_code

## 📋 Quick Diagnosis
**Most Likely Cause**: Based on error type $error_type
**Recommended Action**: Follow troubleshooting steps below

## 🔧 Troubleshooting Steps
$troubleshooting_steps

## 📊 System State

### Software Dependencies
- **Node.js**: $node_version
- **npx**: $npx_version
- **Redis**: $(if [ "$redis_available" = "true" ]; then echo "✅ Connected"; else echo "❌ Not Connected"; fi)
- **Docker**: $(if command -v docker >/dev/null 2>&1; then docker --version | head -1; else echo "Not installed"; fi)

### System Resources
$(jq -r '.system_diagnostics.hardware.memory' "$error_log" 2>/dev/null || echo "Memory information unavailable")
$(jq -r '.system_diagnostics.hardware.disk' "$error_log" 2>/dev/null || echo "Disk information unavailable")

### Process Status
- **CFN Processes Running**: $(jq -r '.system_diagnostics.processes.cfn_running' "$error_log" 2>/dev/null || echo "Unknown")
- **Total Processes**: $(jq -r '.system_diagnostics.processes.total_processes' "$error_log" 2>/dev/null || echo "Unknown")

## 📝 Send This Report
**To**: Your Claude assistant
**Include**:
- Complete error details above
- Any recent changes to your setup
- Steps you were trying to perform
- Command you executed

## 📁 Log Files
- **Error Log**: $(basename "$error_log")
- **Log Location**: $LOG_BASE_DIR
- **Generated**: $(date)

## 🔍 Additional Information

### CFN Loop State
$(if [ -f "/tmp/cfn_loop_${TASK_ID}_checkpoint.json" ]; then
  echo "- **Last Checkpoint**: $(jq -r '.iteration' "/tmp/cfn_loop_${TASK_ID}_checkpoint.json" 2>/dev/null || echo "Unknown")"
  echo "- **Mode**: $(jq -r '.mode' "/tmp/cfn_loop_${TASK_ID}_checkpoint.json" 2>/dev/null || echo "Unknown")"
else
  echo "- **No checkpoint available**"
fi)

### Temporary Files
$(if [ -d "/tmp/cfn_loop_${TASK_ID}" ]; then
  local temp_count=$(find "/tmp/cfn_loop_${TASK_ID}" -type f 2>/dev/null | wc -l || echo "0")
  echo "- **Temp Files**: $temp_count files"
else
  echo "- **No temporary files**"
fi)
EOF

  log "Error report generated: $report_file"
  echo ""
  echo "📋 Error report saved to: $report_file"
  echo "📤 Send this file to your Claude assistant for debugging help"
  echo ""
  echo "💡 Quick copy command:"
  echo "   cat $report_file | pbcopy  # macOS"
  echo "   cat $report_file | xclip -selection clipboard  # Linux"
}

list_error_logs() {
  local query="$1"

  log "Listing error logs..."

  case "$FORMAT" in
    "table")
      echo "Available Error Logs:"
      printf "%-20s %-12s %-20s %-30s\n" "Task ID" "Type" "Timestamp" "Error Message"
      printf "%-20s %-12s %-20s %-30s\n" "--------------------" "------------" "--------------------" "------------------------------"

      find "$LOG_BASE_DIR" -name "cfn-error-*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | while read -r timestamp file; do
        local task_id=$(basename "$file" | sed 's/cfn-error-//' | sed 's/-[0-9]*\.json$//')
        local error_type=$(jq -r '.error.type' "$file" 2>/dev/null || echo "unknown")
        local error_message=$(jq -r '.error.message' "$file" 2>/dev/null | head -c 30)
        local file_timestamp=$(date -d "@$timestamp" "+%Y-%m-%d %H:%M" 2>/dev/null || echo "unknown")

        printf "%-20s %-12s %-20s %-30s\n" "$task_id" "$error_type" "$file_timestamp" "$error_message"
      done
      ;;
    "json")
      find "$LOG_BASE_DIR" -name "cfn-error-*.json" -type f -exec basename {} \; 2>/dev/null | sort -u | sed 's/cfn-error-//g' | sed 's/-[0-9]*\.json$//' | jq -R '{
        "task_id": .,
        "logs": [
          (input | split("\n")[] | select(length > 0) | . as $task_id |
            "cfn-error-\($task_id)-*.json" |
            [
              inputs | select(test("cfn-error-\($task_id)-"; .)) |
              {
                "file": .,
                "timestamp": (inputs | test(.; test("cfn-error-\($task_id)-"; .)) | input_filename | split("-") | .[2] | split("\\.") | .[0] | tonumber) | strftime("%Y-%m-%d %H:%M:%S")
              }
            ]
          )
        ]
      }' | while read -r line; do
        if [ -n "$query" ] && [[ "$line" =~ "$query" ]]; then
          echo "$line"
        elif [ -z "$query" ]; then
          echo "$line"
        fi
      done
      ;;
    *)
      echo "Available error logs:"
      find "$LOG_BASE_DIR" -name "cfn-error-*.json" -type f -exec basename {} \; 2>/dev/null | sort -u | sed 's/cfn-error-//g' | sed 's/-[0-9]*\.json$//'
      ;;
  esac
}

cleanup_logs() {
  local retention_secs=$((RETENTION_DAYS * 24 * 3600))
  local current_time=$(date +%s)
  local cutoff_time=$((current_time - retention_secs))

  log "Cleaning up error logs older than $RETENTION_DAYS days..."

  local cleaned_count=0
  local compressed_count=0

  # Compress old logs
  while IFS= read -r -d '' file; do
    local file_time=$(date -r "$file" +%s 2>/dev/null || echo "0")
    if [ "$file_time" -lt "$cutoff_time" ]; then
      if gzip "$file" 2>/dev/null; then
        mv "$file.gz" "$LOG_BASE_DIR/compressed/"
        ((compressed_count++))
      fi
    fi
  done < <(find "$LOG_BASE_DIR" -name "cfn-error-*.json" -type f -print0 2>/dev/null)

  # Remove very old compressed logs (30 days)
  local old_cutoff=$((current_time - (30 * 24 * 3600)))
  while IFS= read -r -d '' file; do
    local file_time=$(date -r "$file" +%s 2>/dev/null || echo "0")
    if [ "$file_time" -lt "$old_cutoff" ]; then
      rm -f "$file"
      ((cleaned_count++))
    fi
  done < <(find "$LOG_BASE_DIR/compressed" -name "*.json.gz" -type f -print0 2>/dev/null)

  # Check total size and enforce limit
  local total_size=$(du -sm "$LOG_BASE_DIR" 2>/dev/null | cut -f1 || echo "0")
  if [ "$total_size" -gt "$MAX_LOG_SIZE_MB" ]; then
    log "Log directory size (${total_size}MB) exceeds limit (${MAX_LOG_SIZE_MB}MB)"
    # Remove oldest files until under limit
    while [ "$total_size" -gt "$MAX_LOG_SIZE_MB" ]; do
      local oldest_file=$(find "$LOG_BASE_DIR" -name "*.json*" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | head -1 | cut -d' ' -f2-)
      if [ -n "$oldest_file" ] && [ -f "$oldest_file" ]; then
        rm -f "$oldest_file"
        total_size=$(du -sm "$LOG_BASE_DIR" 2>/dev/null | cut -f1 || echo "0")
      fi
    done
  fi

  log "Cleanup completed: $compressed_count files compressed, $cleaned_count files removed"
}

run_diagnostics() {
  log "Running system diagnostics..."

  echo "=== CFN Loop System Diagnostics ==="
  echo ""

  # Basic system info
  echo "🖥️  System Information:"
  echo "  Hostname: $(hostname 2>/dev/null || echo 'unknown')"
  echo "  User: $(whoami 2>/dev/null || echo 'unknown')"
  echo "  Shell: $SHELL"
  echo "  Working Directory: $(pwd)"
  echo ""

  # Dependency checks
  echo "📦 Dependency Status:"

  local deps_status=0

  if command -v node >/dev/null 2>&1; then
    echo "  ✅ Node.js: $(node --version)"
  else
    echo "  ❌ Node.js: NOT FOUND"
    ((deps_status++))
  fi

  if command -v npx >/dev/null 2>&1; then
    echo "  ✅ npx: $(npx --version)"
  else
    echo "  ❌ npx: NOT FOUND"
    ((deps_status++))
  fi

  if command -v docker >/dev/null 2>&1; then
    echo "  ✅ Docker: $(docker --version | head -1)"
  else
    echo "  ⚠️  Docker: NOT FOUND (optional)"
  fi

  if command -v redis-cli >/dev/null 2>&1; then
    echo "  ✅ Redis CLI: Available"
    if redis-cli ping >/dev/null 2>&1; then
      echo "  ✅ Redis Server: CONNECTED"
    else
      echo "  ❌ Redis Server: NOT CONNECTED"
      ((deps_status++))
    fi
  else
    echo "  ❌ Redis CLI: NOT FOUND"
    ((deps_status++))
  fi

  echo ""

  # Resource status
  echo "💻 Resource Status:"

  if command -v free >/dev/null 2>&1; then
    echo "  Memory: $(free -h | grep '^Mem:' | awk '{print $3 "/" $2 " (" $4 ")"}')"
    echo "  Swap: $(free -h | grep '^Swap:' | awk '{print $3 "/" $2 " (" $4 ")"}' || echo 'Swap not available')"
  else
    echo "  Memory: Information unavailable"
  fi

  if command -v df >/dev/null 2>&1; then
    echo "  Disk: $(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $4 ")"}')"
  else
    echo "  Disk: Information unavailable"
  fi

  echo ""

  # CFN Loop specific
  echo "🔄 CFN Loop Status:"

  local cfn_processes=$(pgrep -f "claude-flow-novice\|cfn-" 2>/dev/null | wc -l || echo "0")
  echo "  CFN Processes Running: $cfn_processes"

  if [ -d "/tmp" ]; then
    local cfn_temp_dirs=$(find /tmp -name "cfn_loop_*" -type d 2>/dev/null | wc -l || echo "0")
    echo "  Temporary Directories: $cfn_temp_dirs"
  fi

  echo ""

  # Error log status
  if [ -d "$LOG_BASE_DIR" ]; then
    local error_count=$(find "$LOG_BASE_DIR" -name "cfn-error-*.json" -type f 2>/dev/null | wc -l || echo "0")
    local report_count=$(find "$LOG_BASE_DIR/reports" -name "*.md" -type f 2>/dev/null | wc -l || echo "0")
    echo "📊 Error Log Status:"
    echo "  Error Logs: $error_count"
    echo "  Reports Generated: $report_count"
    echo "  Log Directory: $LOG_BASE_DIR"
    echo "  Total Size: $(du -sh "$LOG_BASE_DIR" 2>/dev/null | cut -f1 || echo 'unknown')"
  else
    echo "📊 Error Log Status: Directory not found"
  fi

  echo ""

  # Overall status
  if [ "$deps_status" -eq 0 ]; then
    echo "✅ Overall Status: HEALTHY"
  else
    echo "⚠️  Overall Status: ISSUES DETECTED ($deps_status problems)"
  fi

  echo ""
}

validate_dependencies() {
  log "Validating CFN Loop dependencies..."

  local validation_status=0
  local missing_deps=()

  # Check required dependencies
  local required_deps=("node" "npx" "jq" "bc")
  for dep in "${required_deps[@]}"; do
    if ! command -v "$dep" >/dev/null 2>&1; then
      missing_deps+=("$dep")
      ((validation_status++))
    fi
  done

  if [ ${#missing_deps[@]} -gt 0 ]; then
    echo "❌ Missing Dependencies:"
    for dep in "${missing_deps[@]}"; do
      echo "  - $dep"
    done
    echo ""
    echo "💡 Installation Commands:"
    if [[ " ${missing_deps[*]}" =~ "node" ]] || [[ " ${missing_deps[*]}" =~ "npx" ]]; then
      echo "  # Install Node.js and npx:"
      echo "  curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -"
      echo "  sudo apt-get install -y nodejs npm"
      echo "  sudo npm install -g npx"
    fi
    if [[ " ${missing_deps[*]}" =~ "jq" ]]; then
      echo "  # Install jq:"
      echo "  sudo apt-get install -y jq"
    fi
    if [[ " ${missing_deps[*]}" =~ "bc" ]]; then
      echo "  # Install bc:"
      echo "  sudo apt-get install -y bc"
    fi
  else
    echo "✅ All required dependencies are available"
  fi

  echo ""

  # Check optional dependencies
  echo "🔍 Optional Dependencies:"

  local optional_deps=("redis-cli" "docker")
  for dep in "${optional_deps[@]}"; do
    if command -v "$dep" >/dev/null 2>&1; then
      case "$dep" in
        "redis-cli")
          if redis-cli ping >/dev/null 2>&1; then
            echo "  ✅ Redis Server: Running"
          else
            echo "  ⚠️  Redis CLI: Available, Server Not Connected"
          fi
          ;;
        "docker")
          echo "  ✅ Docker: $(docker --version | head -1)"
          ;;
      esac
    else
      echo "  ⚪  $dep: Not Available (optional)"
    fi
  done

  return $validation_status
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --action)
      ACTION="$2"
      shift 2
      ;;
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --error-type)
      ERROR_TYPE="$2"
      shift 2
      ;;
    --error-message)
      ERROR_MESSAGE="$2"
      shift 2
      ;;
    --exit-code)
      EXIT_CODE="$2"
      shift 2
      ;;
    --context)
      CONTEXT_JSON="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --since)
      SINCE_TIME="$2"
      shift 2
      ;;
    --retention-days)
      RETENTION_DAYS="$2"
      shift 2
      ;;
    --help|-h)
      show_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      show_usage
      exit 1
      ;;
  esac
done

# Validate parameters
validate_parameters

# Execute action
case "$ACTION" in
  capture)
    collect_system_diagnostics "${LOG_BASE_DIR}/sys-diagnostics-$(date +%s).json"
    collect_cfn_state "${LOG_BASE_DIR}/cfn-state-${TASK_ID}-$(date +%s).json"
    capture_error
    ;;
  report)
    generate_report
    ;;
  cleanup)
    cleanup_logs
    ;;
  list)
    list_error_logs "$SINCE_TIME"
    ;;
  diagnostics)
    run_diagnostics
    ;;
  validate)
    validate_dependencies
    ;;
esac

log "Error logging action '$ACTION' completed"