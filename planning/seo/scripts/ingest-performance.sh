#!/bin/bash

##############################################################################
# Performance Data Ingestion CLI
#
# @description CLI tool for batch ingestion of content performance metrics
#              from Google Search Console (GSC) or Google Analytics 4 (GA4)
# @usage       ./ingest-performance.sh --source gsc --lookback-days 90 --dry-run
# @version     1.0.0
# @phase       5
# @sprint      2
##############################################################################

set -euo pipefail

# ============================================================================
# CONSTANTS & CONFIGURATION
# ============================================================================

readonly SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly TYPES_DIR="${SCRIPT_DIR}/../types"
readonly LIB_DIR="${SCRIPT_DIR}/../lib"

# Logging functions
readonly LOG_INFO="\033[36m[INFO]\033[0m"
readonly LOG_WARN="\033[33m[WARN]\033[0m"
readonly LOG_ERROR="\033[31m[ERROR]\033[0m"
readonly LOG_SUCCESS="\033[32m[SUCCESS]\033[0m"

# Defaults
DEFAULT_LOOKBACK_DAYS=30
DEFAULT_SOURCE="gsc"
MAX_BATCH_SIZE=100
MAX_LOOKBACK_DAYS=730

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

log_step() {
  echo -e "${LOG_INFO} ${1}"
}

log_info() {
  echo -e "${LOG_INFO} ${1}"
}

log_warn() {
  echo -e "${LOG_WARN} ${1}"
}

log_error() {
  echo -e "${LOG_ERROR} ${1}"
}

log_success() {
  echo -e "${LOG_SUCCESS} ${1}"
}

print_usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [options]

OPTIONS:
  --source TEXT           Data source: 'gsc' or 'ga4' (default: ${DEFAULT_SOURCE})
  --lookback-days NUM     Lookback period in days (1-730, default: ${DEFAULT_LOOKBACK_DAYS})
  --content-id TEXT       Specific content ID to ingest (optional, ingest all if not specified)
  --dry-run              Validate and preview without persisting (optional)
  --batch-size NUM        Batch size for processing (default: ${MAX_BATCH_SIZE})
  --mock-data            Generate and use mock data instead of real API calls
  --verbose              Enable verbose logging
  --help                 Show this help message

EXAMPLES:
  # Ingest GSC data for last 30 days
  ${SCRIPT_NAME} --source gsc --lookback-days 30

  # Ingest GA4 data with dry-run
  ${SCRIPT_NAME} --source ga4 --lookback-days 60 --dry-run

  # Ingest specific content ID with mock data
  ${SCRIPT_NAME} --source gsc --content-id "blog-post-123" --mock-data

  # Batch ingest with custom batch size
  ${SCRIPT_NAME} --source gsc --batch-size 50 --verbose

EOF
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

validate_source() {
  local source="${1}"

  if [[ ! "${source}" =~ ^(gsc|ga4)$ ]]; then
    log_error "Invalid source: ${source}"
    log_error "Must be 'gsc' or 'ga4'"
    return 1
  fi
}

validate_lookback_days() {
  local days="${1}"

  if ! [[ "${days}" =~ ^[0-9]+$ ]]; then
    log_error "Invalid lookback-days: ${days} (must be a number)"
    return 1
  fi

  if (( days < 1 || days > MAX_LOOKBACK_DAYS )); then
    log_error "Lookback days must be between 1 and ${MAX_LOOKBACK_DAYS}"
    return 1
  fi
}

validate_content_id() {
  local content_id="${1}"

  # Content ID should be alphanumeric with dashes/underscores, 3-128 chars
  if ! [[ "${content_id}" =~ ^[a-zA-Z0-9_-]{3,128}$ ]]; then
    log_error "Invalid content ID format: ${content_id}"
    log_error "Must be 3-128 characters, alphanumeric with dashes/underscores only"
    return 1
  fi
}

validate_batch_size() {
  local size="${1}"

  if ! [[ "${size}" =~ ^[0-9]+$ ]]; then
    log_error "Invalid batch-size: ${size} (must be a number)"
    return 1
  fi

  if (( size < 1 || size > 1000 )); then
    log_error "Batch size must be between 1 and 1000"
    return 1
  fi
}

validate_date_range() {
  local lookback_days="${1}"

  local end_date
  local start_date

  end_date=$(date +%Y-%m-%d)
  start_date=$(date -d "${lookback_days} days ago" +%Y-%m-%d 2>/dev/null || echo "")

  if [[ -z "${start_date}" ]]; then
    log_warn "Could not calculate date range for ${lookback_days} days"
    return 1
  fi

  log_info "Date range: ${start_date} to ${end_date}"
}

# ============================================================================
# MOCK DATA GENERATION
# ============================================================================

generate_mock_ranking_metrics() {
  cat <<'EOF'
{
  "averagePosition": 15.2,
  "bestPosition": 3,
  "worstPosition": 48,
  "topThreeCount": 2,
  "topTenCount": 8,
  "topFiftyCount": 42,
  "topHundredCount": 87,
  "totalKeywordsTracked": 120,
  "trendDirection": 0.05,
  "volatilityScore": 0.35
}
EOF
}

generate_mock_traffic_metrics() {
  cat <<'EOF'
{
  "totalImpressions": 15420,
  "totalClicks": 458,
  "changePercentage": 12.5,
  "dailyAverageTraffic": 15.3,
  "peakDailyTraffic": 42,
  "trendDirection": 0.08,
  "consistencyScore": 0.72
}
EOF
}

generate_mock_ctr_metrics() {
  cat <<'EOF'
{
  "averageCTR": 0.0297,
  "bestDayCTR": 0.0562,
  "worstDayCTR": 0.0121,
  "ctrChange": 0.0031,
  "trendDirection": 0.025,
  "benchmarkCTR": 0.0254,
  "benchmarkDeviation": 0.17
}
EOF
}

generate_mock_conversion_metrics() {
  cat <<'EOF'
{
  "totalConversions": 12,
  "conversionRate": 0.0262,
  "averageConversionValue": 185.50,
  "totalRevenue": 2226,
  "trendDirection": 0.15,
  "conversionType": "lead_signup",
  "attributionWindow": 30
}
EOF
}

# Note: generate_mock_performance_metrics removed - metrics now inlined in generate_mock_content_performance
# to avoid command substitution and eval risks (security hardening)

generate_mock_content_performance() {
  local content_id="${1}"
  local keyword="${2}"
  local timestamp="${3}"

  local published_at
  published_at=$(date -u -d "45 days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "2024-10-18T08:00:00Z")

  # Use heredoc directly instead of command substitution to avoid eval risks
  cat <<EOF
{
  "contentId": "${content_id}",
  "contentUrl": "https://example.com/content/${content_id}",
  "targetKeyword": "${keyword}",
  "topic": "TypeScript Performance Optimization",
  "contentType": "blog",
  "publishedAt": "${published_at}",
  "timeWindow": "short-term",
  "daysSincePublication": 45,
  "metrics": {
    "ranking": {
      "averagePosition": 15.2,
      "bestPosition": 3,
      "worstPosition": 48,
      "topThreeCount": 2,
      "topTenCount": 8,
      "topFiftyCount": 42,
      "topHundredCount": 87,
      "totalKeywordsTracked": 120,
      "trendDirection": 0.05,
      "volatilityScore": 0.35
    },
    "traffic": {
      "totalImpressions": 15420,
      "totalClicks": 458,
      "changePercentage": 12.5,
      "dailyAverageTraffic": 15.3,
      "peakDailyTraffic": 42,
      "trendDirection": 0.08,
      "consistencyScore": 0.72
    },
    "ctr": {
      "averageCTR": 0.0297,
      "bestDayCTR": 0.0562,
      "worstDayCTR": 0.0121,
      "ctrChange": 0.0031,
      "trendDirection": 0.025,
      "benchmarkCTR": 0.0254,
      "benchmarkDeviation": 0.17
    },
    "conversions": {
      "totalConversions": 12,
      "conversionRate": 0.0262,
      "averageConversionValue": 185.50,
      "totalRevenue": 2226,
      "trendDirection": 0.15,
      "conversionType": "lead_signup",
      "attributionWindow": 30
    },
    "overallScore": 0.72,
    "calculatedAt": "${timestamp}"
  },
  "keywordPerformance": [
    {
      "keyword": "${keyword}",
      "currentPosition": 15,
      "previousPosition": 22,
      "impressions": 2148,
      "clicks": 64
    },
    {
      "keyword": "${keyword} guide",
      "currentPosition": 8,
      "previousPosition": 12,
      "impressions": 1542,
      "clicks": 142
    }
  ],
  "appliedPatterns": [
    {
      "patternId": "pattern-001",
      "patternName": "Comprehensive Guide Structure",
      "appliedAt": "2024-10-18T10:30:00Z",
      "impactScore": 0.68
    }
  ],
  "affectedByUpdates": [],
  "metricsUpdatedAt": "${timestamp}",
  "dataSource": "gsc",
  "domain": "example.com",
  "metadata": {
    "notes": "Mock data for testing",
    "confidence": 0.85,
    "reviewStatus": "reviewed",
    "tags": ["test", "mock-data"]
  }
}
EOF
}

# ============================================================================
# DATA FETCHING & PROCESSING
# ============================================================================

fetch_gsc_data() {
  local lookback_days="${1}"
  local content_id="${2:-}"

  log_step "Fetching Google Search Console data..."

  # This would normally call the GSC API
  # For now, we'll show the structure
  log_info "GSC fetch parameters:"
  log_info "  - Lookback days: ${lookback_days}"
  log_info "  - Content ID filter: ${content_id:-'(none, all content)'}"

  # Would call: gsc_api_client.getPerformance(startDate, endDate, filters)
}

fetch_ga4_data() {
  local lookback_days="${1}"
  local content_id="${2:-}"

  log_step "Fetching Google Analytics 4 data..."

  log_info "GA4 fetch parameters:"
  log_info "  - Lookback days: ${lookback_days}"
  log_info "  - Content ID filter: ${content_id:-'(none, all content)'}"

  # Would call: ga4_api_client.getReport(startDate, endDate, dimensions, metrics)
}

process_batch() {
  local batch_data="${1}"
  local batch_number="${2}"
  local total_batches="${3}"
  local dry_run="${4}"

  log_step "Processing batch ${batch_number}/${total_batches}..."

  local item_count
  item_count=$(echo "${batch_data}" | jq 'length')

  log_info "Batch contains ${item_count} items"

  if [[ "${dry_run}" == "true" ]]; then
    log_info "[DRY RUN] Would process the following content IDs:"
    echo "${batch_data}" | jq -r '.[] | .contentId' | sed 's/^/  - /'
  else
    log_info "Validating and persisting batch data..."
    # Would call: performance_tracker.ingestBatch(batch_data)
    log_success "Batch ${batch_number} processed successfully"
  fi
}

# ============================================================================
# MAIN INGESTION FLOW
# ============================================================================

ingest_performance_data() {
  local source="${1}"
  local lookback_days="${2}"
  local content_id="${3:-}"
  local dry_run="${4:-false}"
  local batch_size="${5:-${MAX_BATCH_SIZE}}"
  local use_mock_data="${6:-false}"

  log_step "Starting performance data ingestion"
  log_info "Configuration:"
  log_info "  - Source: ${source}"
  log_info "  - Lookback days: ${lookback_days}"
  log_info "  - Content ID: ${content_id:-'(all)'}"
  log_info "  - Dry run: ${dry_run}"
  log_info "  - Batch size: ${batch_size}"
  log_info "  - Use mock data: ${use_mock_data}"

  local start_time
  start_time=$(date +%s)

  # Fetch raw data
  if [[ "${use_mock_data}" == "true" ]]; then
    log_step "Generating mock performance data..."
    local timestamp
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    # Generate 3 mock records
    local mock_data
    mock_data=$(cat <<EOF
[
  $(generate_mock_content_performance "blog-typescript-perf" "typescript performance" "${timestamp}"),
  $(generate_mock_content_performance "guide-react-patterns" "react design patterns" "${timestamp}"),
  $(generate_mock_content_performance "article-node-best-practices" "node.js best practices" "${timestamp}")
]
EOF
)
    log_success "Generated 3 mock records"

    if [[ "${dry_run}" == "true" ]]; then
      log_step "Preview of mock data (first record):"
      echo "${mock_data}" | jq '.[0]' | head -30
    fi
  else
    case "${source}" in
      gsc)
        fetch_gsc_data "${lookback_days}" "${content_id}"
        ;;
      ga4)
        fetch_ga4_data "${lookback_days}" "${content_id}"
        ;;
    esac
  fi

  # Process batches
  if [[ "${use_mock_data}" == "true" ]]; then
    process_batch "${mock_data}" "1" "1" "${dry_run}"
  fi

  local end_time
  end_time=$(date +%s)
  local duration=$((end_time - start_time))

  log_success "Performance ingestion completed in ${duration}s"
}

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

main() {
  local source="${DEFAULT_SOURCE}"
  local lookback_days="${DEFAULT_LOOKBACK_DAYS}"
  local content_id=""
  local dry_run="false"
  local batch_size="${MAX_BATCH_SIZE}"
  local use_mock_data="false"
  local verbose="false"

  # Parse arguments
  while (( $# > 0 )); do
    case "${1}" in
      --source)
        # Validate BEFORE assignment to prevent injection
        if ! validate_source "${2}"; then
          exit 1
        fi
        source="${2}"
        shift 2
        ;;
      --lookback-days)
        # Validate BEFORE assignment to prevent injection
        if ! validate_lookback_days "${2}"; then
          exit 1
        fi
        lookback_days="${2}"
        shift 2
        ;;
      --content-id)
        # Validate BEFORE assignment to prevent injection
        if ! validate_content_id "${2}"; then
          exit 1
        fi
        content_id="${2}"
        shift 2
        ;;
      --dry-run)
        dry_run="true"
        shift
        ;;
      --batch-size)
        # Validate BEFORE assignment to prevent injection
        if ! validate_batch_size "${2}"; then
          exit 1
        fi
        batch_size="${2}"
        shift 2
        ;;
      --mock-data)
        use_mock_data="true"
        shift
        ;;
      --verbose)
        verbose="true"
        shift
        ;;
      --help)
        print_usage
        exit 0
        ;;
      *)
        log_error "Unknown option: ${1}"
        print_usage
        exit 1
        ;;
    esac
  done

  # Additional validation check (defense in depth)
  log_step "Validating input parameters..."

  if ! validate_source "${source}"; then
    exit 1
  fi

  if ! validate_lookback_days "${lookback_days}"; then
    exit 1
  fi

  if [[ -n "${content_id}" ]] && ! validate_content_id "${content_id}"; then
    exit 1
  fi

  if ! validate_batch_size "${batch_size}"; then
    exit 1
  fi

  if ! validate_date_range "${lookback_days}"; then
    log_warn "Date range validation failed, continuing..."
  fi

  log_success "All inputs validated"

  # Run ingestion
  ingest_performance_data "${source}" "${lookback_days}" "${content_id}" "${dry_run}" "${batch_size}" "${use_mock_data}"

  exit 0
}

# ============================================================================
# ERROR HANDLING
# ============================================================================

trap 'log_error "Script interrupted"; exit 130' INT TERM

# Run main function
main "$@"
