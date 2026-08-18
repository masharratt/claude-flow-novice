#!/usr/bin/env bash
################################################################################
# CFN Log Operations - Search Library
# Task 4.4: Distributed Logging Standardization
#
# Provides log search and filtering utilities
#
################################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default paths
LOG_DIR="${LOG_DIR:-/var/log/cfn}"

################################################################################
# Logging Functions
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

################################################################################
# Core Search Functions
################################################################################

# Search logs by correlation ID
search_by_correlation_id() {
    local correlation_id="$1"
    local limit="${2:-100}"
    local format="${3:-text}"

    log_info "Searching logs for correlation ID: $correlation_id"

    local count=0
    local found=false

    # Search through all log files
    find "$LOG_DIR" -name "*.log" -type f 2>/dev/null | while IFS= read -r log_file; do
        # Use jq to filter logs with matching correlation ID
        local matches=$(jq -r "select(.correlationId == \"$correlation_id\")" "$log_file" 2>/dev/null || true)

        if [ -n "$matches" ]; then
            found=true
            while IFS= read -r match; do
                [ -z "$match" ] && continue

                case "$format" in
                    json)
                        echo "$match"
                        ;;
                    text)
                        echo "$match" | jq -r '"\(.timestamp) [\(.level)] \(.message)"'
                        ;;
                    detailed)
                        echo "$match" | jq '.'
                        ;;
                esac

                ((count++))
                [ "$count" -ge "$limit" ] && break
            done <<< "$matches"
        fi
    done

    if [ "$found" = false ]; then
        log_info "No logs found for correlation ID: $correlation_id"
        return 1
    fi

    log_success "Found $count log entries"
    return 0
}

# Search logs by agent ID
search_by_agent_id() {
    local agent_id="$1"
    local limit="${2:-100}"
    local format="${3:-text}"

    log_info "Searching logs for agent ID: $agent_id"

    local count=0
    local found=false

    find "$LOG_DIR" -name "*.log" -type f 2>/dev/null | while IFS= read -r log_file; do
        local matches=$(jq -r "select(.context.agentId == \"$agent_id\")" "$log_file" 2>/dev/null || true)

        if [ -n "$matches" ]; then
            found=true
            while IFS= read -r match; do
                [ -z "$match" ] && continue

                case "$format" in
                    json)
                        echo "$match"
                        ;;
                    text)
                        echo "$match" | jq -r '"\(.timestamp) [\(.level)] \(.message)"'
                        ;;
                    detailed)
                        echo "$match" | jq '.'
                        ;;
                esac

                ((count++))
                [ "$count" -ge "$limit" ] && break
            done <<< "$matches"
        fi
    done

    if [ "$found" = false ]; then
        log_info "No logs found for agent ID: $agent_id"
        return 1
    fi

    log_success "Found $count log entries"
    return 0
}

# Search logs by task ID
search_by_task_id() {
    local task_id="$1"
    local limit="${2:-100}"
    local format="${3:-text}"

    log_info "Searching logs for task ID: $task_id"

    local count=0
    local found=false

    find "$LOG_DIR" -name "*.log" -type f 2>/dev/null | while IFS= read -r log_file; do
        local matches=$(jq -r "select(.context.taskId == \"$task_id\")" "$log_file" 2>/dev/null || true)

        if [ -n "$matches" ]; then
            found=true
            while IFS= read -r match; do
                [ -z "$match" ] && continue

                case "$format" in
                    json)
                        echo "$match"
                        ;;
                    text)
                        echo "$match" | jq -r '"\(.timestamp) [\(.level)] \(.message)"'
                        ;;
                    detailed)
                        echo "$match" | jq '.'
                        ;;
                esac

                ((count++))
                [ "$count" -ge "$limit" ] && break
            done <<< "$matches"
        fi
    done

    if [ "$found" = false ]; then
        log_info "No logs found for task ID: $task_id"
        return 1
    fi

    log_success "Found $count log entries"
    return 0
}

# Search logs by level
search_by_level() {
    local level="$1"
    local limit="${2:-100}"
    local format="${3:-text}"
    local since="${4:-}"

    log_info "Searching logs for level: $level"

    local count=0
    local cutoff_date=""

    # Calculate cutoff date if since is specified
    if [ -n "$since" ]; then
        if [[ "$since" =~ ^([0-9]+)h$ ]]; then
            cutoff_date=$(date -u -d "-${BASH_REMATCH[1]} hours" +"%Y-%m-%dT%H:%M:%SZ")
        elif [[ "$since" =~ ^([0-9]+)m$ ]]; then
            cutoff_date=$(date -u -d "-${BASH_REMATCH[1]} minutes" +"%Y-%m-%dT%H:%M:%SZ")
        fi
    fi

    # Build jq filter
    local jq_filter="select(.level == \"$level\")"
    if [ -n "$cutoff_date" ]; then
        jq_filter="$jq_filter | select(.timestamp > \"$cutoff_date\")"
    fi

    find "$LOG_DIR" -name "*.log" -type f 2>/dev/null | while IFS= read -r log_file; do
        jq -r "$jq_filter" "$log_file" 2>/dev/null | while IFS= read -r match; do
            [ -z "$match" ] && continue

            case "$format" in
                json)
                    echo "$match"
                    ;;
                text)
                    echo "$match" | jq -r '"\(.timestamp) [\(.level)] \(.message)"'
                    ;;
                detailed)
                    echo "$match" | jq '.'
                    ;;
            esac

            ((count++))
            [ "$count" -ge "$limit" ] && break 2
        done
    done

    if [ "$count" -eq 0 ]; then
        log_info "No logs found with level: $level"
        return 1
    fi

    log_success "Found $count log entries"
    return 0
}

# Search logs by message pattern
search_by_pattern() {
    local pattern="$1"
    local limit="${2:-100}"
    local format="${3:-text}"

    log_info "Searching logs for pattern: $pattern"

    local count=0
    local found=false

    find "$LOG_DIR" -name "*.log" -type f 2>/dev/null | while IFS= read -r log_file; do
        # Use grep to find matching lines, then parse as JSON
        grep -F "$pattern" "$log_file" 2>/dev/null | while IFS= read -r line; do
            [ -z "$line" ] && continue

            # Try to parse as JSON
            if echo "$line" | jq . >/dev/null 2>&1; then
                case "$format" in
                    json)
                        echo "$line"
                        ;;
                    text)
                        echo "$line" | jq -r '"\(.timestamp) [\(.level)] \(.message)"'
                        ;;
                    detailed)
                        echo "$line" | jq '.'
                        ;;
                esac

                ((count++))
                [ "$count" -ge "$limit" ] && break 2
            fi
        done
    done

    if [ "$count" -eq 0 ]; then
        log_info "No logs found matching pattern: $pattern"
        return 1
    fi

    log_success "Found $count log entries"
    return 0
}

# Search logs by source
search_by_source() {
    local source="$1"
    local limit="${2:-100}"
    local format="${3:-text}"

    log_info "Searching logs for source: $source"

    local count=0
    local found=false

    find "$LOG_DIR" -name "*.log" -type f 2>/dev/null | while IFS= read -r log_file; do
        local matches=$(jq -r "select(.source | contains(\"$source\"))" "$log_file" 2>/dev/null || true)

        if [ -n "$matches" ]; then
            found=true
            while IFS= read -r match; do
                [ -z "$match" ] && continue

                case "$format" in
                    json)
                        echo "$match"
                        ;;
                    text)
                        echo "$match" | jq -r '"\(.timestamp) [\(.level)] \(.message)"'
                        ;;
                    detailed)
                        echo "$match" | jq '.'
                        ;;
                esac

                ((count++))
                [ "$count" -ge "$limit" ] && break
            done <<< "$matches"
        fi
    done

    if [ "$found" = false ]; then
        log_info "No logs found for source: $source"
        return 1
    fi

    log_success "Found $count log entries"
    return 0
}

# Combined search with multiple filters
search_logs() {
    local correlation_id=""
    local agent_id=""
    local task_id=""
    local level=""
    local pattern=""
    local source=""
    local since=""
    local format="text"
    local limit="100"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --correlation-id)
                correlation_id="$2"
                shift 2
                ;;
            --agent-id)
                agent_id="$2"
                shift 2
                ;;
            --task-id)
                task_id="$2"
                shift 2
                ;;
            --level)
                level="$2"
                shift 2
                ;;
            --pattern)
                pattern="$2"
                shift 2
                ;;
            --source)
                source="$2"
                shift 2
                ;;
            --since)
                since="$2"
                shift 2
                ;;
            --format)
                format="$2"
                shift 2
                ;;
            --limit)
                limit="$2"
                shift 2
                ;;
            --log-dir)
                LOG_DIR="$2"
                shift 2
                ;;
            --help)
                echo "Search logs by various criteria"
                echo "Usage: search_logs [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --correlation-id ID   Search by correlation ID"
                echo "  --agent-id ID         Search by agent ID"
                echo "  --task-id ID          Search by task ID"
                echo "  --level LEVEL         Filter by level (debug|info|warn|error)"
                echo "  --pattern PATTERN     Search message text"
                echo "  --source SOURCE       Filter by source"
                echo "  --since DURATION      Logs from last N hours/minutes"
                echo "  --format FORMAT       Output format (text|json|detailed)"
                echo "  --limit COUNT         Maximum results (default: 100)"
                echo "  --log-dir DIR         Log directory (default: /var/log/cfn)"
                return 0
                ;;
            *)
                log_error "Unknown option: $1"
                return 1
                ;;
        esac
    done

    # Validate input
    if [ -z "$correlation_id" ] && [ -z "$agent_id" ] && \
       [ -z "$task_id" ] && [ -z "$level" ] && \
       [ -z "$pattern" ] && [ -z "$source" ]; then
        log_error "At least one search criterion required"
        return 1
    fi

    # Check log directory
    if [ ! -d "$LOG_DIR" ]; then
        log_error "Log directory not found: $LOG_DIR"
        return 1
    fi

    # Execute searches based on criteria
    if [ -n "$correlation_id" ]; then
        search_by_correlation_id "$correlation_id" "$limit" "$format"
    elif [ -n "$agent_id" ]; then
        search_by_agent_id "$agent_id" "$limit" "$format"
    elif [ -n "$task_id" ]; then
        search_by_task_id "$task_id" "$limit" "$format"
    elif [ -n "$level" ]; then
        search_by_level "$level" "$limit" "$format" "$since"
    elif [ -n "$pattern" ]; then
        search_by_pattern "$pattern" "$limit" "$format"
    elif [ -n "$source" ]; then
        search_by_source "$source" "$limit" "$format"
    fi
}

# Export functions
export -f log_info
export -f log_error
export -f log_success
export -f search_by_correlation_id
export -f search_by_agent_id
export -f search_by_task_id
export -f search_by_level
export -f search_by_pattern
export -f search_by_source
export -f search_logs
