#!/usr/bin/env bash
# Slack Integration Script for CFN Loop Alerting
# Supports multi-channel routing and rich message formatting

set -euo pipefail

# Configuration
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
SCRIPT_NAME="$(basename "$0")"
LOG_FILE="/var/log/cfn-loop/slack-integration.log"

# Default channels
DEFAULT_CHANNELS=(
    "#alerts-critical"    # For critical alerts
    "#alerts-warning"     # For warning alerts  
    "#alerts-info"        # For info alerts
    "#alerts-debug"       # For debug/test messages
)

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Logging function
log() {
    local level="$1"
    shift
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $SCRIPT_NAME: $*" | tee -a "$LOG_FILE"
}

# Validate configuration
validate_config() {
    if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
        log "ERROR" "SLACK_WEBHOOK_URL environment variable is required"
        exit 1
    fi
    
    # Basic webhook URL validation
    if [[ ! "$SLACK_WEBHOOK_URL" =~ https://hooks\.slack\.com/services/ ]]; then
        log "ERROR" "Invalid Slack webhook URL format. Expected: https://hooks.slack.com/services/..."
        exit 1
    fi
}

# Determine channel based on severity and team
get_channel_for_alert() {
    local severity="$1"
    local team="${2:-default}"
    local custom_channel="${3:-}"
    
    # Use explicit channel if provided
    if [[ -n "$custom_channel" ]]; then
        echo "$custom_channel"
        return
    fi
    
    # Team-specific channel routing
    case "$team" in
        "backend"|"platform")
            case "$severity" in
                "critical") echo "#alerts-platform-critical" ;;
                "warning") echo "#alerts-platform-warning" ;;
                "info") echo "#alerts-platform-info" ;;
                *) echo "#alerts-platform-debug" ;;
            esac
            ;;
        "devops"|"infrastructure")
            case "$severity" in
                "critical") echo "#alerts-infra-critical" ;;
                "warning") echo "#alerts-infra-warning" ;;
                "info") echo "#alerts-infra-info" ;;
                *) echo "#alerts-infra-debug" ;;
            esac
            ;;
        *)
            # Default routing
            case "$severity" in
                "critical") echo "${DEFAULT_CHANNELS[0]}" ;;
                "warning") echo "${DEFAULT_CHANNELS[1]}" ;;
                "info") echo "${DEFAULT_CHANNELS[2]}" ;;
                *) echo "${DEFAULT_CHANNELS[3]}" ;;
            esac
            ;;
    esac
}

# Get color based on severity
get_color_for_severity() {
    local severity="$1"
    
    case "$severity" in
        "critical") echo "danger" ;;
        "warning") echo "warning" ;;
        "info") echo "good" ;;
        *) echo "#CCCCCC" ;;
    esac
}

# Get emoji based on severity
get_emoji_for_severity() {
    local severity="$1"
    
    case "$severity" in
        "critical") echo ":rotating_light:" ;;
        "warning") echo ":warning:" ;;
        "info") echo ":information_source:" ;;
        *) echo ":grey_question:" ;;
    esac
}

# Create Slack message payload
create_message() {
    local severity="$1"
    local title="$2"
    local message="$3"
    local team="${4:-default}"
    local custom_channel="${5:-}"
    local runbook_url="${6:-}"
    local alert_name="${7:-}"
    local instance="${8:-}"
    local extra_details="${9:-}"
    
    local channel
    channel=$(get_channel_for_alert "$severity" "$team" "$custom_channel")
    
    local color
    color=$(get_color_for_severity "$severity")
    
    local emoji
    emoji=$(get_emoji_for_severity "$severity")
    
    # Build main message
    local main_message="$emoji *${title}*"
    
    if [[ -n "$team" && "$team" != "default" ]]; then
        main_message="$main_message\n*Team:* $team"
    fi
    
    if [[ -n "$alert_name" ]]; then
        main_message="$main_message\n*Alert:* $alert_name"
    fi
    
    if [[ -n "$instance" ]]; then
        main_message="$main_message\n*Instance:* $instance"
    fi
    
    main_message="$main_message\n\n$message"
    
    # Create message JSON
    local payload
    payload=$(cat <<EOF
{
  "channel": "$channel",
  "username": "CFN Loop Monitor",
  "icon_emoji": ":robot_face:",
  "attachments": [
    {
      "color": "$color",
      "title": "$title",
      "text": "$message",
      "fields": [],
      "footer": "CFN Loop Monitoring",
      "ts": $(date +%s)
    }
  ]
}
EOF
)
    
    # Add fields if available
    local fields=""
    if [[ -n "$team" && "$team" != "default" ]]; then
        fields+='{"title": "Team", "value": "'"$team"'", "short": true},'
    fi
    
    if [[ -n "$alert_name" ]]; then
        fields+='{"title": "Alert", "value": "'"$alert_name"'", "short": true},'
    fi
    
    if [[ -n "$instance" ]]; then
        fields+='{"title": "Instance", "value": "'"$instance"'", "short": true},'
    fi
    
    if [[ -n "$severity" ]]; then
        fields+='{"title": "Severity", "value": "'"$severity"'", "short": true},'
    fi
    
    if [[ -n "$runbook_url" ]]; then
        fields+='{"title": "Runbook", "value": "<'"$runbook_url"'|View Runbook>", "short": false},'
    fi
    
    if [[ -n "$extra_details" ]]; then
        fields+='{"title": "Additional Details", "value": "'"$extra_details"'", "short": false},'
    fi
    
    # Add environment info
    fields+='{"title": "Environment", "value": "'"${ENVIRONMENT:-development}"'", "short": true},'
    fields+='{"title": "Timestamp", "value": "'"$(date '+%Y-%m-%d %H:%M:%S UTC')"'", "short": true}'
    
    # Insert fields into JSON
    if [[ -n "$fields" ]]; then
        payload=$(echo "$payload" | jq '.attachments[0].fields = ['"${fields%,}"']')
    fi
    
    # Add actions if runbook URL provided
    if [[ -n "$runbook_url" ]]; then
        payload=$(echo "$payload" | jq '
            .attachments[0].actions = [
                {"type": "button", "text": "View Runbook", "url": "'"$runbook_url"'"},
                {"type": "button", "text": "View Dashboard", "url": "http://localhost:3000"}
            ]
        ')
    fi
    
    echo "$payload"
}

# Send message to Slack
send_message() {
    local payload="$1"
    local response
    local http_code
    
    log "INFO" "Sending message to Slack..."
    
    # Extract channel for logging
    local channel
    channel=$(echo "$payload" | jq -r '.channel // unknown')
    
    # Send to Slack API
    response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$SLACK_WEBHOOK_URL" 2>&1)
    
    # Extract HTTP code and response body
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | sed '$d')  # head -n -N is GNU-only
    
    # Check response
    if [[ "$http_code" == "200" ]]; then
        if echo "$response_body" | jq -e '.ok' >/dev/null 2>&1; then
            log "INFO" "Message sent successfully to channel $channel"
            echo "$response_body"
            return 0
        else
            local error_msg
            error_msg=$(echo "$response_body" | jq -r '.error // "Unknown error"' 2>/dev/null || echo "Unknown error")
            log "ERROR" "Slack API error: $error_msg"
            return 1
        fi
    else
        log "ERROR" "Failed to send message (HTTP $http_code): $response_body"
        return 1
    fi
}

# Send alert notification
send_alert() {
    local severity="$1"
    local title="$2"
    local message="$3"
    local team="${4:-default}"
    local channel="${5:-}"
    local runbook_url="${6:-}"
    local alert_name="${7:-}"
    local instance="${8:-}"
    local extra_details="${9:-}"
    
    local payload
    payload=$(create_message "$severity" "$title" "$message" "$team" "$channel" "$runbook_url" "$alert_name" "$instance" "$extra_details")
    
    log "INFO" "Sending $severity alert: $title"
    send_message "$payload"
}

# Send status update
send_status() {
    local status="$1"  # success, failure, in_progress
    local message="$2"
    local team="${3:-default}"
    local channel="${4:-#alerts-debug}"
    
    local color emoji title
    case "$status" in
        "success")
            color="good"
            emoji=":white_check_mark:"
            title="Success"
            ;;
        "failure")
            color="danger"
            emoji=":x:"
            title="Failure"
            ;;
        "in_progress"|"progress")
            color="warning"
            emoji=":hourglass_flowing_sand:"
            title="In Progress"
            ;;
        *)
            color="#CCCCCC"
            emoji=":information_source:"
            title="Status Update"
            ;;
    esac
    
    local payload
    payload=$(cat <<EOF
{
  "channel": "$channel",
  "username": "CFN Loop Monitor",
  "icon_emoji": ":robot_face:",
  "attachments": [
    {
      "color": "$color",
      "title": "$emoji $title",
      "text": "$message",
      "fields": [
        {"title": "Team", "value": "$team", "short": true},
        {"title": "Timestamp", "value": "$(date '+%Y-%m-%d %H:%M:%S UTC')", "short": true}
      ],
      "footer": "CFN Loop Monitoring",
      "ts": $(date +%s)
    }
  ]
}
EOF
)
    
    log "INFO" "Sending status update ($status): $message"
    send_message "$payload"
}

# Test Slack connectivity
test_connectivity() {
    log "INFO" "Testing Slack connectivity..."
    
    local test_payload
    test_payload=$(cat <<EOF
{
  "channel": "#alerts-debug",
  "username": "CFN Loop Monitor",
  "icon_emoji": ":robot_face:",
  "attachments": [
    {
      "color": "good",
      "title": ":white_check_mark: Slack Integration Test",
      "text": "CFN Loop monitoring system is testing Slack connectivity",
      "fields": [
        {"title": "Test Time", "value": "$(date '+%Y-%m-%d %H:%M:%S UTC')", "short": true},
        {"title": "Environment", "value": "${ENVIRONMENT:-development}", "short": true}
      ],
      "footer": "CFN Loop Monitoring",
      "ts": $(date +%s)
    }
  ]
}
EOF
)
    
    if send_message "$test_payload"; then
        log "INFO" "Slack connectivity test passed"
        return 0
    else
        log "ERROR" "Slack connectivity test failed"
        return 1
    fi
}

# Create emergency broadcast to all channels
emergency_broadcast() {
    local message="$1"
    local severity="${2:-critical}"
    
    log "WARNING" "Sending emergency broadcast: $message"
    
    local channels=("${DEFAULT_CHANNELS[@]}")
    channels+=("#alerts-emergency")
    
    for channel in "${channels[@]}"; do
        local payload
        payload=$(cat <<EOF
{
  "channel": "$channel",
  "username": "CFN Loop Emergency",
  "icon_emoji": ":rotating_light:",
  "attachments": [
    {
      "color": "danger",
      "title": ":rotating_light: EMERGENCY BROADCAST",
      "text": "$message",
      "fields": [
        {"title": "Severity", "value": "$severity", "short": true},
        {"title": "Timestamp", "value": "$(date '+%Y-%m-%d %H:%M:%S UTC')", "short": true},
        {"title": "Action Required", "value": "Immediate attention required", "short": false}
      ],
      "footer": "CFN Loop Emergency System",
      "ts": $(date +%s)
    }
  ]
}
EOF
)
        
        send_message "$payload" || true  # Continue even if one channel fails
    done
}

# Show usage
usage() {
    cat << EOF
Usage: $SCRIPT_NAME <command> [options]

Commands:
  alert <severity> <title> <message> [team] [channel] [runbook_url] [alert_name] [instance] [extra_details]
    Send alert notification
    
  status <status> <message> [team] [channel]
    Send status update (success/failure/in_progress)
    
  test
    Test Slack connectivity
    
  broadcast <message> [severity]
    Send emergency broadcast to all channels
    
  help
    Show this help message

Parameters:
  severity     critical, warning, info
  status       success, failure, in_progress
  team         Team name (default, backend, devops, etc.)
  channel      Override channel (default: auto-routing by severity)
  runbook_url  Link to runbook or documentation

Environment Variables:
  SLACK_WEBHOOK_URL   Required: Slack webhook URL
  ENVIRONMENT        Optional: Environment name (default: development)

Examples:
  # Send critical alert
  $SCRIPT_NAME alert critical "Agent Spawn Failure" "25% failure rate detected" platform "#alerts-platform-critical" "https://docs/runbooks/agent-spawn.md" "HighAgentFailureRate"
  
  # Send status update
  $SCRIPT_NAME status success "Deployment completed successfully" backend
  
  # Test connectivity
  $SCRIPT_NAME test

EOF
}

# Main execution
main() {
    # Check for required commands
    if ! command -v curl >/dev/null 2>&1; then
        log "ERROR" "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        log "ERROR" "jq is required but not installed"
        exit 1
    fi
    
    # Validate configuration
    validate_config
    
    # Parse command
    local command="${1:-}"
    
    case "$command" in
        "alert")
            if [[ $# -lt 4 ]]; then
                log "ERROR" "Insufficient arguments for alert command"
                usage
                exit 1
            fi
            send_alert "$2" "$3" "$4" "${5:-default}" "${6:-}" "${7:-}" "${8:-}" "${9:-}" "${10:-}"
            ;;
        "status")
            if [[ $# -lt 3 ]]; then
                log "ERROR" "Insufficient arguments for status command"
                usage
                exit 1
            fi
            send_status "$2" "$3" "${4:-default}" "${5:-}"
            ;;
        "test")
            test_connectivity
            ;;
        "broadcast")
            if [[ $# -lt 2 ]]; then
                log "ERROR" "Message required for broadcast command"
                usage
                exit 1
            fi
            emergency_broadcast "$2" "${3:-critical}"
            ;;
        "help"|"-h"|"--help")
            usage
            ;;
        *)
            log "ERROR" "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"