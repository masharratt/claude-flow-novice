#!/usr/bin/env bash
################################################################################
# CFN Distributed Log Aggregator
# Task 4.4: Distributed Logging Standardization
#
# Aggregates logs from Docker containers and file system into unified
# searchable log files with structured JSON format.
#
# Usage:
#   ./log-aggregator.sh [OPTIONS]
#
# Options:
#   --source SOURCE         Log source (docker, filesystem, all)
#   --output OUTPUT_DIR     Output directory (default: /var/log/cfn/aggregated)
#   --pattern PATTERN       Log file pattern (default: *.log)
#   --correlate-by FIELD    Correlate by field (correlationId, agentId, taskId)
#   --since DURATION        Only aggregate logs from last N hours/minutes (e.g., 24h, 2h)
#   --deduplicate          Remove duplicate log entries
#   --validate             Validate JSON structure
#   --rotate               Rotate aggregated logs after aggregation
#   --compress             Compress aggregated logs
#   --debug                Enable debug output
#   --help                 Display this message
#
################################################################################

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_CONFIG="${PROJECT_ROOT}/docker/logging-config.json"

# Default paths
DEFAULT_OUTPUT_DIR="/var/log/cfn/aggregated"
DEFAULT_PATTERN="*.log"
DOCKER_LOG_PATH="/var/lib/docker/containers"
FILESYSTEM_LOG_PATH="/var/log/cfn"

# Runtime variables
OUTPUT_DIR="${DEFAULT_OUTPUT_DIR}"
SOURCE="all"
PATTERN="${DEFAULT_PATTERN}"
CORRELATE_BY="correlationId"
SINCE=""
DEDUPLICATE=false
VALIDATE=false
ROTATE_AFTER=false
COMPRESS_AFTER=false
DEBUG=false
TEMP_AGGREGATE="/tmp/cfn-aggregate-$$.log"
AGGREGATION_STARTTIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
AGGREGATION_PID=$$

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" >&2
}

debug() {
    if [ "$DEBUG" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $*" >&2
    fi
}

# Display usage
usage() {
    sed -n '2,/^$/p' "$0" | sed '$d'  # head -n -N is GNU-only
    exit 0
}

# Cleanup temporary files
cleanup() {
    if [ -f "$TEMP_AGGREGATE" ]; then
        rm -f "$TEMP_AGGREGATE"
        debug "Cleaned up temporary aggregate file"
    fi
}

trap cleanup EXIT

################################################################################
# Docker Log Processing
################################################################################

# Extract JSON logs from Docker containers
extract_docker_logs() {
    local container_logs_dir="$1"
    local output_file="$2"

    if [ ! -d "$container_logs_dir" ]; then
        log_warn "Docker logs directory not found: $container_logs_dir"
        return 1
    fi

    log_info "Extracting logs from Docker containers..."
    local count=0
    local processed=0

    # Process each container's log file
    while IFS= read -r -d '' log_file; do
        ((count++))
        debug "Processing Docker log: $log_file"

        # Extract container name from path
        local container_name=$(basename "$(dirname "$log_file")")

        # Process the log file and add container metadata
        jq --arg container "$container_name" \
           --arg timestamp "$AGGREGATION_STARTTIME" \
           '. + {source: $container, aggregatedAt: $timestamp}' \
           "$log_file" 2>/dev/null >> "$output_file" || {
            debug "Failed to process Docker log: $log_file"
        }
        ((processed++))
    done < <(find "$container_logs_dir" -name "*-json.log" -print0 2>/dev/null)

    log_info "Processed $processed of $count Docker container logs"
    return 0
}

################################################################################
# Filesystem Log Processing
################################################################################

# Extract JSON logs from filesystem
extract_filesystem_logs() {
    local fs_log_path="$1"
    local pattern="$2"
    local output_file="$3"

    if [ ! -d "$fs_log_path" ]; then
        log_warn "Filesystem logs directory not found: $fs_log_path"
        return 1
    fi

    log_info "Extracting logs from filesystem ($fs_log_path)..."
    local count=0
    local processed=0

    # Process each log file matching pattern
    while IFS= read -r -d '' log_file; do
        ((count++))
        debug "Processing filesystem log: $log_file"

        # Determine relative path for source identification
        local relative_path="${log_file#$fs_log_path/}"

        # Skip already-rotated logs (only recent ones)
        if [[ "$log_file" =~ \.(gz|bz2|xz)$ ]]; then
            debug "Skipping compressed log: $log_file"
            continue
        fi

        # Process JSON logs directly
        if [[ "$log_file" =~ \.json\.log$ ]] || [[ "$log_file" =~ \.json$ ]]; then
            jq --arg source "$relative_path" \
               --arg timestamp "$AGGREGATION_STARTTIME" \
               '. + {source: $source, aggregatedAt: $timestamp}' \
               "$log_file" 2>/dev/null >> "$output_file" || {
                debug "Failed to parse JSON log: $log_file"
            }
        else
            # Convert plain text logs to JSON format
            while IFS= read -r line; do
                [ -z "$line" ] && continue
                local log_entry=$(cat <<EOF
{
  "timestamp": "$AGGREGATION_STARTTIME",
  "level": "info",
  "message": "$line",
  "source": "$relative_path",
  "aggregatedAt": "$AGGREGATION_STARTTIME",
  "raw": true
}
EOF
)
                echo "$log_entry" >> "$output_file"
            done < "$log_file"
        fi
        ((processed++))
    done < <(find "$fs_log_path" -name "$pattern" -type f -print0 2>/dev/null)

    log_info "Processed $processed of $count filesystem logs"
    return 0
}

################################################################################
# Log Filtering and Time-Based Selection
################################################################################

# Filter logs by time (since N hours/minutes ago)
filter_logs_by_time() {
    local input_file="$1"
    local duration="$2"
    local output_file="$3"

    if [ -z "$duration" ]; then
        cp "$input_file" "$output_file"
        return 0
    fi

    log_info "Filtering logs by time: since $duration"

    # Calculate cutoff timestamp
    local cutoff_seconds=0
    if [[ "$duration" =~ ^([0-9]+)h$ ]]; then
        cutoff_seconds=$(( ${BASH_REMATCH[1]} * 3600 ))
    elif [[ "$duration" =~ ^([0-9]+)m$ ]]; then
        cutoff_seconds=$(( ${BASH_REMATCH[1]} * 60 ))
    else
        log_error "Invalid duration format: $duration (use Xh or Xm)"
        return 1
    fi

    local cutoff_date=$(date -u -d "-${cutoff_seconds} seconds" +"%Y-%m-%dT%H:%M:%SZ")
    debug "Cutoff timestamp: $cutoff_date"

    # Filter logs newer than cutoff
    jq --arg cutoff "$cutoff_date" \
       'select(.timestamp > $cutoff)' \
       "$input_file" > "$output_file" || return 1

    log_info "Filtered logs from: $cutoff_date"
}

################################################################################
# Log Deduplication
################################################################################

# Remove duplicate log entries based on message hash
deduplicate_logs() {
    local input_file="$1"
    local output_file="$2"

    log_info "Deduplicating log entries..."

    jq -s 'unique_by(.timestamp + .message + (.source // ""))' \
       "$input_file" | \
    jq -r '.[]' > "$output_file" || {
        log_error "Failed to deduplicate logs"
        return 1
    }

    local original_count=$(jq -s 'length' "$input_file")
    local dedup_count=$(jq -s 'length' "$output_file")
    local removed=$(( original_count - dedup_count ))

    log_info "Deduplicated: removed $removed duplicate entries"
}

################################################################################
# Log Validation
################################################################################

# Validate JSON structure of log entries
validate_logs() {
    local input_file="$1"

    log_info "Validating JSON log structure..."

    local valid_count=0
    local invalid_count=0
    local required_fields=("timestamp" "level" "message" "source")

    while IFS= read -r line; do
        [ -z "$line" ] && continue

        # Validate JSON
        if ! echo "$line" | jq . >/dev/null 2>&1; then
            ((invalid_count++))
            debug "Invalid JSON: $line"
            continue
        fi

        # Check required fields
        local missing_fields=()
        for field in "${required_fields[@]}"; do
            if ! echo "$line" | jq -e ".$field" >/dev/null 2>&1; then
                missing_fields+=("$field")
            fi
        done

        if [ ${#missing_fields[@]} -gt 0 ]; then
            ((invalid_count++))
            debug "Missing required fields: ${missing_fields[*]}"
        else
            ((valid_count++))
        fi
    done < "$input_file"

    local total=$(( valid_count + invalid_count ))
    local percentage=$(( valid_count * 100 / total ))

    log_info "Validation complete: $valid_count/$total valid ($percentage%)"

    if [ $percentage -lt 90 ]; then
        log_warn "Only $percentage% of logs are valid (target: 90%)"
        return 1
    fi

    return 0
}

################################################################################
# Log Correlation and Grouping
################################################################################

# Correlate logs by specified field
correlate_logs() {
    local input_file="$1"
    local correlation_field="$2"
    local output_dir="$3"

    log_info "Correlating logs by: $correlation_field"

    mkdir -p "$output_dir/correlations"

    # Group logs by correlation field
    jq -s "group_by(.$correlation_field)" "$input_file" | \
    jq -r '.[] as $group |
            ($group[0].'$correlation_field' // "unknown") as $key |
            {correlationId: $key, count: ($group | length), logs: $group}' | \
    while IFS= read -r correlation_entry; do
        [ -z "$correlation_entry" ] && continue

        local correlation_id=$(echo "$correlation_entry" | jq -r '.correlationId')
        local output_file="$output_dir/correlations/$correlation_id.log"

        echo "$correlation_entry" | jq '.logs[]' >> "$output_file"
    done

    log_info "Correlation complete: logs grouped by $correlation_field"
}

################################################################################
# Log Compression
################################################################################

# Compress aggregated logs
compress_logs() {
    local log_file="$1"

    log_info "Compressing logs: $log_file"

    if [ ! -f "$log_file" ]; then
        log_error "Log file not found: $log_file"
        return 1
    fi

    gzip -9 -f "$log_file" || {
        log_error "Failed to compress logs"
        return 1
    }

    log_success "Compressed: ${log_file}.gz"
}

################################################################################
# Performance Metrics
################################################################################

# Calculate and report aggregation metrics
calculate_metrics() {
    local start_time="$1"
    local aggregated_file="$2"

    local end_time=$(date +%s%N)
    local duration_ms=$(( (end_time - start_time) / 1000000 ))
    local log_count=$(jq -s 'length' "$aggregated_file" 2>/dev/null || echo 0)
    local file_size=$(stat -c%s "$aggregated_file" 2>/dev/null || echo 0)

    cat > "${aggregated_file%.log}.metrics" <<EOF
{
  "aggregationTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "durationMs": $duration_ms,
  "logCount": $log_count,
  "fileSizeBytes": $file_size,
  "logsPerSecond": $(( log_count * 1000 / max(duration_ms, 1) )),
  "throughputMBps": $(( (file_size / 1048576) * 1000 / max(duration_ms, 1) ))
}
EOF

    log_info "Aggregation metrics:"
    log_info "  Duration: ${duration_ms}ms"
    log_info "  Log entries: $log_count"
    log_info "  File size: $(numfmt --to=iec-i --suffix=B $file_size 2>/dev/null || echo $file_size)"
}

################################################################################
# Main Aggregation Workflow
################################################################################

main() {
    local start_time=$(date +%s%N)

    log_info "CFN Log Aggregator started (PID: $AGGREGATION_PID)"
    log_info "Aggregation time: $AGGREGATION_STARTTIME"
    debug "Configuration: source=$SOURCE, output=$OUTPUT_DIR, correlate=$CORRELATE_BY"

    # Create output directory
    mkdir -p "$OUTPUT_DIR"

    # Aggregate logs based on source
    case "$SOURCE" in
        docker)
            extract_docker_logs "$DOCKER_LOG_PATH" "$TEMP_AGGREGATE" || true
            ;;
        filesystem)
            extract_filesystem_logs "$FILESYSTEM_LOG_PATH" "$PATTERN" "$TEMP_AGGREGATE" || true
            ;;
        all)
            extract_docker_logs "$DOCKER_LOG_PATH" "$TEMP_AGGREGATE" || true
            extract_filesystem_logs "$FILESYSTEM_LOG_PATH" "$PATTERN" "$TEMP_AGGREGATE" || true
            ;;
        *)
            log_error "Unknown source: $SOURCE"
            return 1
            ;;
    esac

    if [ ! -f "$TEMP_AGGREGATE" ] || [ ! -s "$TEMP_AGGREGATE" ]; then
        log_warn "No logs found to aggregate"
        return 1
    fi

    # Apply time filter if specified
    if [ -n "$SINCE" ]; then
        filter_logs_by_time "$TEMP_AGGREGATE" "$SINCE" "${TEMP_AGGREGATE}.filtered"
        mv "${TEMP_AGGREGATE}.filtered" "$TEMP_AGGREGATE"
    fi

    # Deduplicate if requested
    if [ "$DEDUPLICATE" = true ]; then
        deduplicate_logs "$TEMP_AGGREGATE" "${TEMP_AGGREGATE}.dedup"
        mv "${TEMP_AGGREGATE}.dedup" "$TEMP_AGGREGATE"
    fi

    # Sort by timestamp
    jq -s 'sort_by(.timestamp)' "$TEMP_AGGREGATE" > "${TEMP_AGGREGATE}.sorted"
    mv "${TEMP_AGGREGATE}.sorted" "$TEMP_AGGREGATE"

    # Validate if requested
    if [ "$VALIDATE" = true ]; then
        validate_logs "$TEMP_AGGREGATE" || log_warn "Validation warnings present"
    fi

    # Correlate logs if requested
    if [ "$CORRELATE_BY" != "none" ]; then
        correlate_logs "$TEMP_AGGREGATE" "$CORRELATE_BY" "$OUTPUT_DIR"
    fi

    # Move to final location
    local output_file="$OUTPUT_DIR/aggregated-$(date +%Y%m%d-%H%M%S).log"
    mv "$TEMP_AGGREGATE" "$output_file"
    log_success "Aggregated logs: $output_file"

    # Calculate metrics
    calculate_metrics "$start_time" "$output_file"

    # Compress if requested
    if [ "$COMPRESS_AFTER" = true ]; then
        compress_logs "$output_file"
    fi

    # Rotate if requested
    if [ "$ROTATE_AFTER" = true ] && [ -x "$(command -v logrotate)" ]; then
        log_info "Rotating logs with logrotate..."
        logrotate -f /etc/logrotate.d/cfn-logs >/dev/null 2>&1 || log_warn "Logrotate failed"
    fi

    log_success "Log aggregation complete"
}

################################################################################
# Argument Parsing
################################################################################

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source)
            SOURCE="$2"
            shift 2
            ;;
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --pattern)
            PATTERN="$2"
            shift 2
            ;;
        --correlate-by)
            CORRELATE_BY="$2"
            shift 2
            ;;
        --since)
            SINCE="$2"
            shift 2
            ;;
        --deduplicate)
            DEDUPLICATE=true
            shift
            ;;
        --validate)
            VALIDATE=true
            shift
            ;;
        --rotate)
            ROTATE_AFTER=true
            shift
            ;;
        --compress)
            COMPRESS_AFTER=true
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Run main aggregation
main "$@"
