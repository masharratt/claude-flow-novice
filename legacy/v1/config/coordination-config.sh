#!/usr/bin/env bash
# CLI Coordination Configuration
# Phase 1 Sprint 1.3: Centralized configuration system

set -euo pipefail

# ==============================================================================
# STORAGE CONFIGURATION
# ==============================================================================

# Base directory for coordination infrastructure (default: /dev/shm for performance)
export CFN_BASE_DIR="${CFN_BASE_DIR:-/dev/shm/cfn}"

# ==============================================================================
# RESOURCE LIMITS CONFIGURATION (DoS Prevention)
# ==============================================================================

# Maximum global message count across all agents (default: 100000)
export CFN_MAX_GLOBAL_MESSAGES="${CFN_MAX_GLOBAL_MESSAGES:-100000}"

# Maximum payload size in bytes (default: 1MB = 1048576 bytes)
export CFN_MAX_PAYLOAD_SIZE="${CFN_MAX_PAYLOAD_SIZE:-1048576}"

# File descriptor warning threshold percentage (default: 80%)
export CFN_FD_WARNING_THRESHOLD="${CFN_FD_WARNING_THRESHOLD:-80}"

# Metrics storage
export CFN_METRICS_DIR="${CFN_METRICS_DIR:-$CFN_BASE_DIR/metrics}"
export CFN_METRICS_FILE="${CFN_METRICS_FILE:-$CFN_METRICS_DIR/cfn-metrics.jsonl}"

# Health monitoring storage
export CFN_HEALTH_DIR="${CFN_HEALTH_DIR:-$CFN_BASE_DIR/health}"
export CFN_HEALTH_FILE="${CFN_HEALTH_FILE:-$CFN_HEALTH_DIR/agent-health.jsonl}"

# Alert storage
export CFN_ALERT_DIR="${CFN_ALERT_DIR:-$CFN_BASE_DIR/alerts}"
export CFN_ALERT_FILE="${CFN_ALERT_FILE:-$CFN_ALERT_DIR/cfn-alerts.jsonl}"

# ==============================================================================
# PERFORMANCE CONFIGURATION
# ==============================================================================

# Maximum concurrent agents (default: 50 per coordinator, hierarchical beyond)
export CFN_MAX_AGENTS="${CFN_MAX_AGENTS:-50}"

# Shard count for metrics distribution (default: 16 for optimal load distribution)
export CFN_SHARD_COUNT="${CFN_SHARD_COUNT:-16}"

# Batch size for metric processing (default: 10 metrics per batch)
export CFN_BATCH_SIZE="${CFN_BATCH_SIZE:-10}"

# ==============================================================================
# TIMEOUT CONFIGURATION (milliseconds)
# ==============================================================================

# Coordination phase timeout (default: 10 seconds)
export CFN_COORDINATION_TIMEOUT="${CFN_COORDINATION_TIMEOUT:-10000}"

# Health check timeout (default: 30 seconds)
export CFN_HEALTH_TIMEOUT="${CFN_HEALTH_TIMEOUT:-30}"

# Message delivery timeout (default: 5 seconds)
export CFN_MESSAGE_TIMEOUT="${CFN_MESSAGE_TIMEOUT:-5000}"

# ==============================================================================
# MONITORING CONFIGURATION
# ==============================================================================

# Enable metrics collection (default: true)
export CFN_METRICS_ENABLED="${CFN_METRICS_ENABLED:-true}"

# Enable alerting system (default: true)
export CFN_ALERTING_ENABLED="${CFN_ALERTING_ENABLED:-true}"

# Alert check interval in seconds (default: 30 seconds)
export CFN_ALERT_INTERVAL="${CFN_ALERT_INTERVAL:-30}"

# ==============================================================================
# ALERTING THRESHOLDS
# ==============================================================================

# Coordination time alert threshold in milliseconds (default: 10000ms = 10s)
export CFN_ALERT_COORD_TIME_MS="${CFN_ALERT_COORD_TIME_MS:-10000}"

# Delivery rate alert threshold percentage (default: 90%)
export CFN_ALERT_DELIVERY_RATE="${CFN_ALERT_DELIVERY_RATE:-90}"

# Consensus score alert threshold percentage (default: 90%)
export CFN_ALERT_CONSENSUS_SCORE="${CFN_ALERT_CONSENSUS_SCORE:-90}"

# Confidence score alert threshold percentage (default: 75%)
export CFN_ALERT_CONFIDENCE_SCORE="${CFN_ALERT_CONFIDENCE_SCORE:-75}"

# ==============================================================================
# DATA RETENTION CONFIGURATION
# ==============================================================================

# Metrics retention in hours (default: 48 hours)
export CFN_METRICS_RETENTION_HOURS="${CFN_METRICS_RETENTION_HOURS:-48}"

# Alert retention in hours (default: 24 hours)
export CFN_ALERT_RETENTION_HOURS="${CFN_ALERT_RETENTION_HOURS:-24}"

# Health check retention in hours (default: 12 hours)
export CFN_HEALTH_RETENTION_HOURS="${CFN_HEALTH_RETENTION_HOURS:-12}"

# ==============================================================================
# VALIDATION FUNCTIONS
# ==============================================================================

# validate_numeric_range - Validate numeric value within range
# Args: $1=value, $2=min, $3=max, $4=name
validate_numeric_range() {
  local value="$1"
  local min="$2"
  local max="$3"
  local name="$4"

  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "ERROR: $name must be numeric, got '$value'" >&2
    return 1
  fi

  if [ "$value" -lt "$min" ] || [ "$value" -gt "$max" ]; then
    echo "ERROR: $name must be $min-$max, got $value" >&2
    return 1
  fi

  return 0
}

# validate_boolean - Validate boolean value
# Args: $1=value, $2=name
validate_boolean() {
  local value="$1"
  local name="$2"

  if [[ "$value" != "true" && "$value" != "false" ]]; then
    echo "ERROR: $name must be 'true' or 'false', got '$value'" >&2
    return 1
  fi

  return 0
}

# validate_directory_writable - Validate directory is writable
# Args: $1=path, $2=name
validate_directory_writable() {
  local path="$1"
  local name="$2"
  local parent_dir
  parent_dir="$(dirname "$path")"

  if [ ! -d "$parent_dir" ]; then
    echo "ERROR: Parent directory of $name does not exist: $parent_dir" >&2
    return 1
  fi

  if [ ! -w "$parent_dir" ]; then
    echo "ERROR: Cannot write to parent directory of $name: $parent_dir" >&2
    return 1
  fi

  return 0
}

# validate_config - Validate all configuration values
validate_config() {
  local errors=0

  # Validate performance configuration
  if ! validate_numeric_range "$CFN_MAX_AGENTS" 1 1000 "CFN_MAX_AGENTS"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_SHARD_COUNT" 1 64 "CFN_SHARD_COUNT"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_BATCH_SIZE" 1 100 "CFN_BATCH_SIZE"; then
    errors=$((errors + 1))
  fi

  # Validate timeout configuration
  if ! validate_numeric_range "$CFN_COORDINATION_TIMEOUT" 100 300000 "CFN_COORDINATION_TIMEOUT"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_HEALTH_TIMEOUT" 1 300 "CFN_HEALTH_TIMEOUT"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_MESSAGE_TIMEOUT" 100 60000 "CFN_MESSAGE_TIMEOUT"; then
    errors=$((errors + 1))
  fi

  # Validate monitoring configuration
  if ! validate_boolean "$CFN_METRICS_ENABLED" "CFN_METRICS_ENABLED"; then
    errors=$((errors + 1))
  fi

  if ! validate_boolean "$CFN_ALERTING_ENABLED" "CFN_ALERTING_ENABLED"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_ALERT_INTERVAL" 1 3600 "CFN_ALERT_INTERVAL"; then
    errors=$((errors + 1))
  fi

  # Validate threshold configuration
  if ! validate_numeric_range "$CFN_ALERT_COORD_TIME_MS" 100 60000 "CFN_ALERT_COORD_TIME_MS"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_ALERT_DELIVERY_RATE" 1 100 "CFN_ALERT_DELIVERY_RATE"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_ALERT_CONSENSUS_SCORE" 1 100 "CFN_ALERT_CONSENSUS_SCORE"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_ALERT_CONFIDENCE_SCORE" 1 100 "CFN_ALERT_CONFIDENCE_SCORE"; then
    errors=$((errors + 1))
  fi

  # Validate retention configuration
  if ! validate_numeric_range "$CFN_METRICS_RETENTION_HOURS" 1 720 "CFN_METRICS_RETENTION_HOURS"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_ALERT_RETENTION_HOURS" 1 720 "CFN_ALERT_RETENTION_HOURS"; then
    errors=$((errors + 1))
  fi

  if ! validate_numeric_range "$CFN_HEALTH_RETENTION_HOURS" 1 720 "CFN_HEALTH_RETENTION_HOURS"; then
    errors=$((errors + 1))
  fi

  # Validate directory permissions
  if ! validate_directory_writable "$CFN_BASE_DIR" "CFN_BASE_DIR"; then
    errors=$((errors + 1))
  fi

  return $errors
}

# ==============================================================================
# INITIALIZATION FUNCTIONS
# ==============================================================================

# init_directories - Create required directories
init_directories() {
  mkdir -p "$CFN_BASE_DIR" "$CFN_METRICS_DIR" "$CFN_HEALTH_DIR" "$CFN_ALERT_DIR" 2>/dev/null || true

  # Verify directories were created
  for dir in "$CFN_BASE_DIR" "$CFN_METRICS_DIR" "$CFN_HEALTH_DIR" "$CFN_ALERT_DIR"; do
    if [ ! -d "$dir" ]; then
      echo "ERROR: Failed to create directory: $dir" >&2
      return 1
    fi
  done

  return 0
}

# load_config - Load and validate configuration
load_config() {
  # Validate configuration
  if ! validate_config; then
    echo "ERROR: Configuration validation failed" >&2
    return 1
  fi

  # Initialize directories
  if ! init_directories; then
    echo "ERROR: Failed to initialize directories" >&2
    return 1
  fi

  echo "Configuration loaded successfully" >&2
  return 0
}

# print_config - Display current configuration
print_config() {
  cat <<EOF
CLI Coordination Configuration:

STORAGE:
  Base Directory:    $CFN_BASE_DIR
  Metrics Directory: $CFN_METRICS_DIR
  Health Directory:  $CFN_HEALTH_DIR
  Alert Directory:   $CFN_ALERT_DIR

RESOURCE LIMITS:
  Max Global Messages: $CFN_MAX_GLOBAL_MESSAGES
  Max Payload Size:    $CFN_MAX_PAYLOAD_SIZE bytes ($(($CFN_MAX_PAYLOAD_SIZE / 1024))KB)
  FD Warning Threshold: ${CFN_FD_WARNING_THRESHOLD}%

PERFORMANCE:
  Max Agents:        $CFN_MAX_AGENTS
  Shard Count:       $CFN_SHARD_COUNT
  Batch Size:        $CFN_BATCH_SIZE

TIMEOUTS (ms):
  Coordination:      $CFN_COORDINATION_TIMEOUT
  Health Check:      $CFN_HEALTH_TIMEOUT (seconds)
  Message Delivery:  $CFN_MESSAGE_TIMEOUT

MONITORING:
  Metrics Enabled:   $CFN_METRICS_ENABLED
  Alerting Enabled:  $CFN_ALERTING_ENABLED
  Alert Interval:    $CFN_ALERT_INTERVAL seconds

THRESHOLDS:
  Coordination Time: ${CFN_ALERT_COORD_TIME_MS}ms
  Delivery Rate:     ${CFN_ALERT_DELIVERY_RATE}%
  Consensus Score:   ${CFN_ALERT_CONSENSUS_SCORE}%
  Confidence Score:  ${CFN_ALERT_CONFIDENCE_SCORE}%

RETENTION (hours):
  Metrics:           $CFN_METRICS_RETENTION_HOURS
  Alerts:            $CFN_ALERT_RETENTION_HOURS
  Health Checks:     $CFN_HEALTH_RETENTION_HOURS
EOF
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# Load configuration if sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  # Script executed directly - print configuration
  if load_config; then
    print_config
    exit 0
  else
    exit 1
  fi
else
  # Script sourced - auto-load configuration
  load_config
fi
