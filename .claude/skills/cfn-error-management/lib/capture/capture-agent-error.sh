#!/bin/bash
set -euo pipefail

# Mandatory error capture script for CFN Loop agents
# Categorizes and logs agent failures

# Argument validation
if [[ $# -lt 4 ]]; then
    echo "Usage: $0 <AGENT_TYPE> <TASK_ID> <AGENT_ID> <EXIT_CODE> [STDERR]"
    exit 1
fi

AGENT_TYPE="$1"
TASK_ID="$2"
AGENT_ID="$3"
EXIT_CODE="$4"
STDERR="${5:-}"

# Error category determination
categorize_error() {
    local exit_code="$1"
    local stderr="$2"

    if [[ $exit_code -eq 124 ]]; then
        echo "TIMEOUT"
    elif [[ $exit_code -ne 0 ]]; then
        echo "CRASH"
    elif [[ -n "$stderr" ]]; then
        if echo "$stderr" | grep -qE "MODULE_NOT_FOUND|ENOENT|dependency"; then
            echo "DEPENDENCY_FAILURE"
        elif echo "$stderr" | grep -qE "invalid|unparseable|syntax error"; then
            echo "INVALID_OUTPUT"
        else
            echo "CRASH"
        fi
    else
        echo "NO_DELIVERABLES"
    fi
}

# Determine retry recommendation
should_retry() {
    local category="$1"
    case "$category" in
        "TIMEOUT"|"CRASH")
            echo "true"
            ;;
        "DEPENDENCY_FAILURE"|"INVALID_OUTPUT")
            echo "false"
            ;;
        *)
            echo "false"
            ;;
    esac
}

# Categorize error
ERROR_CATEGORY=$(categorize_error "$EXIT_CODE" "$STDERR")
RETRY_RECOMMENDED=$(should_retry "$ERROR_CATEGORY")

# Check decision log for prior similar errors
PRIOR_ERRORS=""
if [ -f "$HOME/.claude/decision-log/decisions.db" ]; then
    SEARCH_TERMS="${ERROR_CATEGORY} ${AGENT_TYPE}"
    [ -n "$STDERR" ] && SEARCH_TERMS="$SEARCH_TERMS $(echo "$STDERR" | head -c 200 | sed 's/[^a-zA-Z0-9 ]/ /g' | tr -s ' ' | head -c 100)"
    PRIOR_ERRORS=$(timeout 2s "$HOME/.claude/skills/decision-log/query.sh" "$SEARCH_TERMS" 3 2>/dev/null || echo "")
fi

# Ensure logs directory exists
mkdir -p ".claude/logs/errors"

# Generate structured error report
ERROR_LOG_FILE=".claude/logs/errors/${TASK_ID}_${AGENT_ID}_$(date +%Y%m%d_%H%M%S).json"
cat <<EOF > "$ERROR_LOG_FILE"
{
    "schema_version": "1.0.0",
    "agent_id": "$AGENT_ID",
    "agent_type": "$AGENT_TYPE",
    "task_id": "$TASK_ID",
    "category": "$ERROR_CATEGORY",
    "exit_code": $EXIT_CODE,
    "stderr": "$(echo "$STDERR" | base64 -w 0)",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "retry_recommended": $RETRY_RECOMMENDED,
    "error_log_file": "$ERROR_LOG_FILE",
    "prior_errors": "$(echo "$PRIOR_ERRORS" | base64 -w 0)"
}
EOF

# Publish error to Redis for centralized tracking
redis-cli LPUSH "error_queue:$TASK_ID" "$ERROR_LOG_FILE"

# Output error category for potential scripting use
echo "$ERROR_CATEGORY"

exit 0