#!/usr/bin/env bash
# PagerDuty Events API v2 Integration for CFN Loop Alerting
# This script sends alerts to PagerDuty using the Events API v2

set -euo pipefail

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_NAME="$(basename "$0")"
readonly LOG_FILE="/var/log/cfn/pagerduty-integration.log"

# PagerDuty API endpoints
readonly PAGERDUTY_EVENTS_API="https://events.pagerduty.com/v2/enqueue"

# Default configuration
DEFAULT_ROUTING_KEY="${PAGERDUTY_SERVICE_KEY:-}"
DEFAULT_SEVERITY="critical"
DEFAULT_SOURCE="cfn-loop"
DEFAULT_COMPONENT="alertmanager"
DEFAULT_CLASS="infrastructure"

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $SCRIPT_NAME: $message" | tee -a "$LOG_FILE"
}

# Validate required environment variables
validate_env() {
    local routing_key="${1:-$DEFAULT_ROUTING_KEY}"
    
    if [[ -z "$routing_key" ]]; then
        log "ERROR" "PAGERDUTY_SERVICE_KEY environment variable is required"
        return 1
    fi
    
    if [[ ! "$routing_key" =~ ^[a-f0-9]{32}-[a-f0-9]{32}-[a-f0-9]{32}-[a-f0-9]{32}-[a-f0-9]{32}$ ]]; then
        log "ERROR" "Invalid PagerDuty routing key format"
        return 1
    fi
    
    return 0
}

# Validate severity level
validate_severity() {
    local severity="$1"
    local valid_severities=("critical" "error" "warning" "info")
    
    if [[ ! " ${valid_severities[*]} " =~ " $severity " ]]; then
        log "ERROR" "Invalid severity '$severity'. Must be one of: ${valid_severities[*]}"
        return 1
    fi
    
    return 0
}

# Validate event action
validate_action() {
    local action="$1"
    local valid_actions=("trigger" "acknowledge" "resolve")
    
    if [[ ! " ${valid_actions[*]} " =~ " $action " ]]; then
        log "ERROR" "Invalid action '$action'. Must be one of: ${valid_actions[*]}"
        return 1
    fi
    
    return 0
}

# Create PagerDuty event payload
create_payload() {
    local action="$1"
    local routing_key="$2"
    local dedup_key="${3:-}"
    
    local payload
    payload="{
        \"routing_key\": \"$routing_key\",
        \"event_action\": \"$action\""
    
    if [[ -n "$dedup_key" ]]; then
        payload+="
        ,\"dedup_key\": \"$dedup_key\""
    fi
    
    echo "$payload"
}

# Add payload details
add_payload_details() {
    local payload="$1"
    shift
    local details=("$@")
    
    local details_json=""
    for detail in "${details[@]}"; do
        if [[ -n "$details_json" ]]; then
            details_json+=","
        fi
        details_json+="$detail"
    done
    
    echo "${payload%, }"
}

# Send HTTP request to PagerDuty
send_to_pagerduty() {
    local payload="$1"
    
    local response
    local http_code
    
    log "INFO" "Sending event to PagerDuty..."
    
    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$PAGERDUTY_EVENTS_API" 2>&1) || {
        log "ERROR" "Failed to send request to PagerDuty: $response"
        return 1
    }
    
    http_code="${response: -3}"
    response_body="${response%???}"
    
    case "$http_code" in
        202)
            log "INFO" "Event successfully accepted by PagerDuty"
            local dedup_key=$(echo "$response_body" | jq -r '.dedup_key // empty')
            if [[ -n "$dedup_key" ]]; then
                echo "$dedup_key"
            fi
            return 0
            ;;
        400)
            log "ERROR" "Bad request - invalid payload: $response_body"
            return 1
            ;;
        401)
            log "ERROR" "Unauthorized - invalid routing key"
            return 1
            ;;
        429)
            local retry_after=$(echo "$response_body" | jq -r '.errors[0] // "30"' | grep -o '[0-9]\+')
            log "WARN" "Rate limited. Retrying after ${retry_after}s..."
            sleep "$retry_after"
            return 2
            ;;
        *)
            log "ERROR" "Unexpected response from PagerDuty: HTTP $http_code - $response_body"
            return 1
            ;;
    esac
}

# Trigger new alert
trigger_alert() {
    local severity="${1:-$DEFAULT_SEVERITY}"
    local source="${2:-$DEFAULT_SOURCE}"
    local component="${3:-$DEFAULT_COMPONENT}"
    local class="${4:-$DEFAULT_CLASS}"
    local group="${5:-cfn-loop}"
    local summary="$6"
    local dedup_key="$7"
    
    validate_severity "$severity" || return 1
    
    local payload
    payload=$(create_payload "trigger" "$DEFAULT_ROUTING_KEY" "$dedup_key")
    
    payload=$(add_payload_details "$payload" "
        \"payload\": {
            \"summary\": \"$summary\",
            \"source\": \"$source\",
            \"severity\": \"$severity\",
            \"component\": \"$component\",
            \"class\": \"$class\",
            \"group\": \"$group\",
            \"custom_details\": {
                \"alert_source\": \"cfn-loop-alertmanager\",
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",
                \"environment\": \"${ENVIRONMENT:-production}\",
                \"service\": \"${SERVICE_NAME:-cfn-loop}\"
            }
        }
    }")
    
    log "INFO" "Triggering alert: $summary"
    send_to_pagerduty "$payload"
}

# Acknowledge existing alert
acknowledge_alert() {
    local dedup_key="$1"
    
    if [[ -z "$dedup_key" ]]; then
        log "ERROR" "Deduplication key is required for acknowledgment"
        return 1
    fi
    
    local payload
    payload=$(create_payload "acknowledge" "$DEFAULT_ROUTING_KEY" "$dedup_key")
    
    payload=$(add_payload_details "$payload" "}")
    
    log "INFO" "Acknowledging alert with dedup key: $dedup_key"
    send_to_pagerduty "$payload"
}

# Resolve existing alert
resolve_alert() {
    local dedup_key="$1"
    
    if [[ -z "$dedup_key" ]]; then
        log "ERROR" "Deduplication key is required for resolution"
        return 1
    fi
    
    local payload
    payload=$(create_payload "resolve" "$DEFAULT_ROUTING_KEY" "$dedup_key")
    
    payload=$(add_payload_details "$payload" "}")
    
    log "INFO" "Resolving alert with dedup key: $dedup_key"
    send_to_pagerduty "$payload"
}

# Process alert from Alertmanager webhook format
process_alertmanager_alert() {
    local alert_data="$1"
    
    local alertname
    local severity
    local summary
    local description
    local team
    local instance
    local status
    
    # Parse Alertmanager alert data
    alertname=$(echo "$alert_data" | jq -r '.alert.labels.alertname // empty')
    severity=$(echo "$alert_data" | jq -r '.alert.labels.severity // "warning"')
    summary=$(echo "$alert_data" | jq -r '.alert.annotations.summary // empty')
    description=$(echo "$alert_data" | jq -r '.alert.annotations.description // empty')
    team=$(echo "$alert_data" | jq -r '.alert.labels.team // "unknown"')
    instance=$(echo "$alert_data" | jq -r '.alert.labels.instance // empty')
    status=$(echo "$alert_data" | jq -r '.status // "firing"')
    
    if [[ -z "$alertname" ]] || [[ -z "$summary" ]]; then
        log "ERROR" "Missing required alert fields (alertname or summary)"
        return 1
    fi
    
    # Map severity to PagerDuty severity
    case "$severity" in
        "critical")
            severity="critical"
            ;;
        "warning")
            severity="warning"
            ;;
        "info")
            severity="info"
            ;;
        *)
            severity="error"
            ;;
    esac
    
    # Create dedup key
    local dedup_key="cfn-loop-${alertname}-${team}-${instance}"
    dedup_key="${dedup_key//[^a-zA-Z0-9-]/-}"  # Clean up dedup key
    
    # Process based on alert status
    case "$status" in
        "firing")
            trigger_alert "$severity" "cfn-loop" "$alertname" "infrastructure" "cfn-loop" "$summary" "$dedup_key"
            ;;
        "resolved")
            resolve_alert "$dedup_key"
            ;;
        *)
            log "WARN" "Unknown alert status: $status"
            return 1
            ;;
    esac
}

# Batch process multiple alerts
process_batch_alerts() {
    local alerts_file="$1"
    
    if [[ ! -f "$alerts_file" ]]; then
        log "ERROR" "Alerts file not found: $alerts_file"
        return 1
    fi
    
    local alerts_processed=0
    local alerts_failed=0
    
    while IFS= read -r alert_line; do
        if [[ -n "$alert_line" ]]; then
            if process_alertmanager_alert "$alert_line"; then
                ((alerts_processed++))
            else
                ((alerts_failed++))
            fi
        fi
    done < "$alerts_file"
    
    log "INFO" "Batch processing complete: $alerts_processed successful, $alerts_failed failed"
    
    return "$alerts_failed"
}

# Health check for PagerDuty integration
health_check() {
    log "INFO" "Performing health check..."
    
    validate_env || return 1
    
    # Send a test event with minimal details
    local test_payload="{
        \"routing_key\": \"$DEFAULT_ROUTING_KEY\",
        \"event_action\": \"trigger\",
        \"payload\": {
            \"summary\": \"CFN Loop PagerDuty Health Check\",
            \"source\": \"cfn-loop-health-check\",
            \"severity\": \"info\",
            \"class\": \"health-check\"
        }
    }"
    
    local response
    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$test_payload" \
        "$PAGERDUTY_EVENTS_API" 2>/dev/null) || {
        log "ERROR" "Health check failed - cannot reach PagerDuty API"
        return 1
    }
    
    local http_code="${response: -3}"
    
    if [[ "$http_code" == "202" ]]; then
        log "INFO" "Health check passed"
        return 0
    else
        log "ERROR" "Health check failed - HTTP $http_code"
        return 1
    fi
}

# Display usage information
usage() {
    cat << EOF
Usage: $SCRIPT_NAME [OPTIONS] <COMMAND>

Commands:
    trigger <severity> <summary> [dedup_key]    Trigger a new alert
    acknowledge <dedup_key>                     Acknowledge an alert
    resolve <dedup_key>                         Resolve an alert
    webhook                                      Process alerts from stdin (Alertmanager format)
    batch <alerts_file>                          Process alerts from file
    health-check                                Perform health check

Options:
    -r, --routing-key KEY      PagerDuty routing key (default: \$PAGERDUTY_SERVICE_KEY)
    -s, --source SOURCE        Event source (default: cfn-loop)
    -c, --component COMPONENT  Component name (default: alertmanager)
    -g, --group GROUP          Event group (default: cfn-loop)
    -h, --help                 Show this help message

Environment Variables:
    PAGERDUTY_SERVICE_KEY     PagerDuty integration service key (required)
    ENVIRONMENT               Environment name (default: production)
    SERVICE_NAME              Service name (default: cfn-loop)

Examples:
    $SCRIPT_NAME trigger critical "CFN Loop stuck in task X"
    $SCRIPT_NAME acknowledge dedup-key-12345
    $SCRIPT_NAME resolve dedup-key-12345
    echo '{"alert":{"labels":{"alertname":"TestAlert"}}}' | $SCRIPT_NAME webhook
    $SCRIPT_NAME batch alerts.json
    $SCRIPT_NAME health-check

EOF
}

# Main script execution
main() {
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")"
    
    local routing_key="$DEFAULT_ROUTING_KEY"
    local source="$DEFAULT_SOURCE"
    local component="$DEFAULT_COMPONENT"
    local group="cfn-loop"
    
    # Parse command line options
    while [[ $# -gt 0 ]]; do
        case $1 in
            -r|--routing-key)
                routing_key="$2"
                shift 2
                ;;
            -s|--source)
                source="$2"
                shift 2
                ;;
            -c|--component)
                component="$2"
                shift 2
                ;;
            -g|--group)
                group="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                log "ERROR" "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                break
                ;;
        esac
    done
    
    # Update defaults with parsed options
    DEFAULT_ROUTING_KEY="$routing_key"
    DEFAULT_SOURCE="$source"
    DEFAULT_COMPONENT="$component"
    
    # Validate environment
    validate_env || exit 1
    
    # Execute command
    if [[ $# -eq 0 ]]; then
        log "ERROR" "No command specified"
        usage
        exit 1
    fi
    
    local command="$1"
    shift
    
    case "$command" in
        "trigger")
            if [[ $# -lt 2 ]]; then
                log "ERROR" "trigger command requires severity and summary"
                usage
                exit 1
            fi
            trigger_alert "$@"
            ;;
        "acknowledge")
            if [[ $# -lt 1 ]]; then
                log "ERROR" "acknowledge command requires dedup_key"
                usage
                exit 1
            fi
            acknowledge_alert "$@"
            ;;
        "resolve")
            if [[ $# -lt 1 ]]; then
                log "ERROR" "resolve command requires dedup_key"
                usage
                exit 1
            fi
            resolve_alert "$@"
            ;;
        "webhook")
            # Read alerts from stdin
            while IFS= read -r alert_line; do
                if [[ -n "$alert_line" ]]; then
                    process_alertmanager_alert "$alert_line"
                fi
            done
            ;;
        "batch")
            if [[ $# -lt 1 ]]; then
                log "ERROR" "batch command requires alerts file"
                usage
                exit 1
            fi
            process_batch_alerts "$@"
            ;;
        "health-check")
            health_check
            ;;
        *)
            log "ERROR" "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi