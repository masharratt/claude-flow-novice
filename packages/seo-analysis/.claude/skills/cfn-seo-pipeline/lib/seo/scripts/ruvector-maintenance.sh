#!/bin/bash
set -euo pipefail

###############################################################################
# RuVector SEO Collections Maintenance Script
#
# Purpose: Periodic maintenance for RuVector-indexed SEO intelligence
# Modes:
#   - weekly: Update freshness scores
#   - monthly: Update freshness + prune low-freshness entries
#   - full: All maintenance + size monitoring alerts
#
# Cron Setup Examples:
#   Weekly (Sunday 2am):  0 2 * * 0 /path/to/ruvector-maintenance.sh weekly
#   Monthly (1st 3am):    0 3 1 * * /path/to/ruvector-maintenance.sh monthly
#
# Exit Codes:
#   0 - Success
#   1 - Size threshold exceeded
#   2 - Freshness update errors
#   3 - Database connection errors
###############################################################################

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Script is at: packages/seo-analysis/.claude/skills/cfn-seo-pipeline/lib/seo/scripts/
# Going up to packages/seo-analysis root (6 levels up: scripts/seo/lib/cfn-seo-pipeline/skills/.claude)
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/../../../../../.." && pwd)"
PROJECT_ROOT="$(cd "$PACKAGE_ROOT/../.." && pwd)"
LOG_DIR="${CFN_LOG_DIR:-/var/log/cfn-seo}"
LOG_FILE="${LOG_DIR}/ruvector-maintenance.log"
RUN_MODE="${1:-weekly}"
DRY_RUN="${DRY_RUN:-false}"
MAX_LOG_RUNS=10

# Collection size thresholds
declare -A SIZE_THRESHOLDS=(
  [expert_sources]=10000
  [statistics]=50000
  [keyword_research]=100000
  [competitor_intelligence]=20000
  [serp_patterns]=50000
  [content_patterns]=25000
)

# Collections to maintain
COLLECTIONS=(
  "expert_sources"
  "statistics"
  "keyword_research"
  "competitor_intelligence"
  "serp_patterns"
  "content_patterns"
)

# Freshness thresholds
ARCHIVE_THRESHOLD=0.1
DELETE_THRESHOLD=0.0
MIN_ENTRIES_PROTECTION=100  # Never delete below this count

# Stats tracking
declare -A STATS
STATS[updated_entries]=0
STATS[archived_entries]=0
STATS[deleted_entries]=0
STATS[total_size]=0
STATS[errors]=0
START_TIME=$(date +%s)

###############################################################################
# Logging Functions
###############################################################################

log_info() {
  local message="$1"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $message" | tee -a "$LOG_FILE"
}

log_warn() {
  local message="$1"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [WARN] $message" | tee -a "$LOG_FILE"
}

log_error() {
  local message="$1"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $message" | tee -a "$LOG_FILE" >&2
}

log_action() {
  local action="$1"
  local message="$2"
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ACTION] [$action] $message" | tee -a "$LOG_FILE"
}

###############################################################################
# Setup and Validation
###############################################################################

setup_logging() {
  # Create log directory if needed
  if [[ ! -d "$LOG_DIR" ]]; then
    mkdir -p "$LOG_DIR" || {
      echo "ERROR: Cannot create log directory: $LOG_DIR" >&2
      exit 3
    }
  fi

  # Rotate logs - keep last MAX_LOG_RUNS
  if [[ -f "$LOG_FILE" ]]; then
    local log_count=$(ls -1 "${LOG_FILE}".* 2>/dev/null | wc -l)
    if [[ $log_count -ge $MAX_LOG_RUNS ]]; then
      # Remove oldest logs
      ls -1t "${LOG_FILE}".* | tail -n +$MAX_LOG_RUNS | xargs rm -f 2>/dev/null || true
    fi
    # Archive current log
    mv "$LOG_FILE" "${LOG_FILE}.$(date +%Y%m%d_%H%M%S)"
  fi

  touch "$LOG_FILE"
}

validate_environment() {
  log_info "Validating environment..."

  # Check Node.js
  if ! command -v node &>/dev/null; then
    log_error "Node.js not found"
    exit 3
  fi

  # Check npx
  if ! command -v npx &>/dev/null; then
    log_error "npx not found"
    exit 3
  fi

  # Check TypeScript files exist
  local freshness_script="$PACKAGE_ROOT/.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/freshness.ts"
  local pruning_script="$PACKAGE_ROOT/src/lib/pruning.ts"

  if [[ ! -f "$freshness_script" ]]; then
    log_error "Freshness script not found: $freshness_script"
    exit 3
  fi

  if [[ ! -f "$pruning_script" ]]; then
    log_error "Pruning script not found: $pruning_script"
    exit 3
  fi

  # Check RuVector connection (basic check)
  if ! npx ts-node -e "import { testConnection } from '$freshness_script'; testConnection().catch(() => process.exit(1));" 2>/dev/null; then
    log_warn "RuVector connection test failed (may not be critical)"
  fi

  log_info "Environment validation complete"
}

###############################################################################
# Maintenance Operations
###############################################################################

update_freshness_for_collection() {
  local collection="$1"
  log_action "FRESHNESS_UPDATE" "Starting for collection: $collection"

  local cmd="npx ts-node \"$PACKAGE_ROOT/.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/freshness.ts\" updateFreshness --collection=\"$collection\""

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[DRY RUN] Would execute: $cmd"
    return 0
  fi

  local start=$(date +%s)
  local output
  local exit_code=0

  output=$(eval "$cmd" 2>&1) || exit_code=$?

  local duration=$(($(date +%s) - start))

  if [[ $exit_code -eq 0 ]]; then
    # Parse updated count from output (assuming JSON or text with count)
    local updated_count=$(echo "$output" | grep -oP 'updated["\s:]+\K\d+' | head -1 || echo "0")
    STATS[updated_entries]=$((${STATS[updated_entries]} + updated_count))
    log_action "FRESHNESS_UPDATE" "Completed for $collection: $updated_count entries updated in ${duration}s"
  else
    STATS[errors]=$((${STATS[errors]} + 1))
    log_error "Freshness update failed for $collection (exit code: $exit_code)"
    log_error "Output: $output"
    return 2
  fi
}

run_weekly_maintenance() {
  log_info "=== Starting Weekly Maintenance ==="

  local failed_collections=()

  for collection in "${COLLECTIONS[@]}"; do
    if ! update_freshness_for_collection "$collection"; then
      failed_collections+=("$collection")
    fi
    sleep 1  # Rate limiting between collections
  done

  if [[ ${#failed_collections[@]} -gt 0 ]]; then
    log_warn "Freshness updates failed for: ${failed_collections[*]}"
    return 2
  fi

  log_info "=== Weekly Maintenance Complete ==="
}

prune_collection() {
  local collection="$1"
  log_action "PRUNING" "Starting for collection: $collection"

  local cmd="npx ts-node \"$PACKAGE_ROOT/src/lib/pruning.ts\" prune"
  cmd="$cmd --collection=\"$collection\""
  cmd="$cmd --archive-threshold=$ARCHIVE_THRESHOLD"
  cmd="$cmd --delete-threshold=$DELETE_THRESHOLD"
  cmd="$cmd --min-entries=$MIN_ENTRIES_PROTECTION"

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[DRY RUN] Would execute: $cmd"
    return 0
  fi

  local start=$(date +%s)
  local output
  local exit_code=0

  output=$(eval "$cmd" 2>&1) || exit_code=$?

  local duration=$(($(date +%s) - start))

  if [[ $exit_code -eq 0 ]]; then
    # Parse archived and deleted counts
    local archived=$(echo "$output" | grep -oP 'archived["\s:]+\K\d+' | head -1 || echo "0")
    local deleted=$(echo "$output" | grep -oP 'deleted["\s:]+\K\d+' | head -1 || echo "0")

    STATS[archived_entries]=$((${STATS[archived_entries]} + archived))
    STATS[deleted_entries]=$((${STATS[deleted_entries]} + deleted))

    log_action "PRUNING" "Completed for $collection: archived=$archived, deleted=$deleted in ${duration}s"
  else
    STATS[errors]=$((${STATS[errors]} + 1))
    log_error "Pruning failed for $collection (exit code: $exit_code)"
    log_error "Output: $output"
    return 2
  fi
}

run_monthly_pruning() {
  log_info "=== Starting Monthly Pruning ==="

  local failed_collections=()

  for collection in "${COLLECTIONS[@]}"; do
    if ! prune_collection "$collection"; then
      failed_collections+=("$collection")
    fi
    sleep 1  # Rate limiting
  done

  if [[ ${#failed_collections[@]} -gt 0 ]]; then
    log_warn "Pruning failed for: ${failed_collections[*]}"
    return 2
  fi

  log_info "=== Monthly Pruning Complete ==="
}

get_collection_size() {
  local collection="$1"

  # Query RuVector for collection size
  # This is a placeholder - adjust based on actual RuVector query method
  local cmd="npx ts-node -e \"
    import { getCollectionStats } from '$PACKAGE_ROOT/.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/client.ts';
    getCollectionStats('$collection').then(stats => {
      console.log(JSON.stringify({ collection: '$collection', count: stats.count || 0 }));
    }).catch(err => {
      console.error(err);
      process.exit(1);
    });
  \""

  local output
  output=$(eval "$cmd" 2>&1) || {
    log_warn "Failed to get size for $collection"
    echo "0"
    return
  }

  # Parse count from JSON
  local count=$(echo "$output" | grep -oP '"count"\s*:\s*\K\d+' || echo "0")
  echo "$count"
}

check_collection_sizes() {
  log_info "=== Starting Size Monitoring ==="

  local threshold_exceeded=false
  local total_entries=0

  for collection in "${COLLECTIONS[@]}"; do
    local count
    count=$(get_collection_size "$collection")
    total_entries=$((total_entries + count))
    STATS[total_size]=$total_entries

    local threshold=${SIZE_THRESHOLDS[$collection]}
    local percent=$((count * 100 / threshold))

    if [[ $count -gt $threshold ]]; then
      log_error "Collection $collection exceeds threshold: $count > $threshold (${percent}%)"
      threshold_exceeded=true
    elif [[ $percent -gt 80 ]]; then
      log_warn "Collection $collection at ${percent}% of threshold: $count / $threshold"
    else
      log_info "Collection $collection: $count entries (${percent}% of threshold)"
    fi
  done

  log_info "Total entries across all collections: $total_entries"

  if [[ "$threshold_exceeded" == "true" ]]; then
    log_error "=== Size Monitoring Failed: Thresholds Exceeded ==="
    return 1
  fi

  log_info "=== Size Monitoring Complete ==="
}

###############################################################################
# Reporting
###############################################################################

generate_report() {
  local end_time=$(date +%s)
  local duration=$((end_time - START_TIME))
  local duration_min=$((duration / 60))

  log_info "=== Maintenance Report ==="
  log_info "Mode: $RUN_MODE"
  log_info "Duration: ${duration}s (${duration_min}m)"
  log_info "Entries Updated: ${STATS[updated_entries]}"
  log_info "Entries Archived: ${STATS[archived_entries]}"
  log_info "Entries Deleted: ${STATS[deleted_entries]}"
  log_info "Total Collection Size: ${STATS[total_size]} entries"
  log_info "Errors Encountered: ${STATS[errors]}"

  # Write summary to separate file for easy parsing
  local summary_file="${LOG_DIR}/ruvector-maintenance-summary.json"
  cat > "$summary_file" <<EOF
{
  "timestamp": "$(date -Iseconds)",
  "mode": "$RUN_MODE",
  "duration_seconds": $duration,
  "stats": {
    "updated_entries": ${STATS[updated_entries]},
    "archived_entries": ${STATS[archived_entries]},
    "deleted_entries": ${STATS[deleted_entries]},
    "total_size": ${STATS[total_size]},
    "errors": ${STATS[errors]}
  }
}
EOF
  log_info "Summary written to: $summary_file"
  log_info "=== Maintenance Complete ==="
}

###############################################################################
# Main Execution
###############################################################################

main() {
  setup_logging

  log_info "========================================"
  log_info "RuVector Maintenance Script Starting"
  log_info "Mode: $RUN_MODE"
  log_info "Dry Run: $DRY_RUN"
  log_info "========================================"

  validate_environment

  local exit_code=0

  case "$RUN_MODE" in
    weekly)
      run_weekly_maintenance || exit_code=$?
      ;;
    monthly)
      run_weekly_maintenance || exit_code=$?
      if [[ $exit_code -eq 0 ]]; then
        run_monthly_pruning || exit_code=$?
      fi
      ;;
    full)
      run_weekly_maintenance || exit_code=$?
      if [[ $exit_code -eq 0 ]]; then
        run_monthly_pruning || exit_code=$?
      fi
      if [[ $exit_code -eq 0 ]]; then
        check_collection_sizes || exit_code=$?
      fi
      ;;
    *)
      log_error "Unknown mode: $RUN_MODE"
      log_error "Valid modes: weekly, monthly, full"
      exit_code=1
      ;;
  esac

  generate_report

  if [[ $exit_code -ne 0 ]]; then
    log_error "Maintenance completed with errors (exit code: $exit_code)"
  else
    log_info "Maintenance completed successfully"
  fi

  exit $exit_code
}

# Execute main function
main "$@"
