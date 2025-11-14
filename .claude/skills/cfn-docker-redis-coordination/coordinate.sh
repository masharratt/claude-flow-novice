#!/bin/bash

# CFN Docker Redis Coordination Implementation
# Usage: ./coordinate.sh [OPERATION] [OPTIONS]

set -euo pipefail

# Default configuration
DEFAULT_REDIS_HOST="localhost"
DEFAULT_REDIS_PORT=6379
DEFAULT_REDIS_DB=0
DEFAULT_TIMEOUT=30
DEFAULT_TTL=3600

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

# Function to display usage
usage() {
    cat << EOF
CFN Docker Redis Coordination

Usage: $0 [OPERATION] [OPTIONS]

Operations:
  init-task              Initialize coordination for new task
  store-context          Store task context
  get-context            Retrieve task context
  register-agent         Register new agent
  update-status          Update agent status
  signal-complete        Signal agent completion
  wait-loop              Wait for loop completion
  collect-consensus      Collect validator consensus
  recover-task           Recover interrupted task
  monitor-agents         Monitor agent status
  health-check           Check Redis health
  metrics                Show performance metrics
  cleanup                Clean up expired data
  debug                  Debug coordination state

Options:
  --task-id ID           Task identifier
  --agent-id ID          Agent identifier
  --agent-type TYPE      Agent type
  --container-id ID      Docker container ID
  --confidence NUM       Confidence score (0.0-1.0)
  --iteration NUM        Loop iteration number
  --loop-number NUM      Loop number (1-4)
  --agent-count NUM      Expected number of agents for wait-loop
  --context-file PATH    JSON context file
  --timeout SECONDS      Operation timeout
  --ttl SECONDS          Data TTL
  --required-consensus   Consensus threshold (0.0-1.0)
  --host HOST            Redis host (default: localhost)
  --port PORT            Redis port (default: 6379)
  --db DB                Redis database (default: 0)
  --password PASS        Redis password
  --verbose              Enable verbose logging
  --help                 Show this help message

Examples:
  $0 init-task --task-id task-auth --context-file context.json
  $0 register-agent --agent-id agent-001 --agent-type frontend --task-id task-auth
  $0 signal-complete --agent-id agent-001 --task-id task-auth --confidence 0.85
  $0 wait-loop --task-id task-auth --loop-number 3 --agent-count 3
  $0 collect-consensus --task-id task-auth --loop-number 2 --required-consensus 0.90

EOF
}

# Redis connection check
check_redis_connection() {
    local host="${REDIS_HOST:-$DEFAULT_REDIS_HOST}"
    local port="${REDIS_PORT:-$DEFAULT_REDIS_PORT}"
    local password="${REDIS_PASSWORD:-}"

    if ! command -v redis-cli &> /dev/null; then
        log_error "redis-cli command not found. Please install Redis tools."
        return 1
    fi

    local redis_cmd="redis-cli -h $host -p $port"

    # Try with password first if provided
    if [[ -n "$password" ]]; then
        local redis_cmd_with_pass="$redis_cmd -a $password"
        # Test with password, suppress stderr to avoid AUTH error warnings
        if $redis_cmd_with_pass ping &> /dev/null; then
            REDIS_CMD="$redis_cmd_with_pass"
            return 0
        fi
        # Password failed, try without password (some Redis instances don't require auth)
    fi

    # Try without password
    if $redis_cmd ping &> /dev/null; then
        REDIS_CMD="$redis_cmd"
        return 0
    fi

    log_error "Cannot connect to Redis at $host:$port"
    return 1
}

# Parse command line arguments
OPERATION=""
TASK_ID=""
AGENT_ID=""
AGENT_TYPE=""
CONTAINER_ID=""
CONFIDENCE=""
ITERATION=""
LOOP_NUMBER=""
AGENT_COUNT=""
CONTEXT_FILE=""
TIMEOUT="${DEFAULT_TIMEOUT}"
TTL="${DEFAULT_TTL}"
REQUIRED_CONSENSUS=""
REDIS_HOST="${CFN_REDIS_HOST:-${REDIS_HOST:-$DEFAULT_REDIS_HOST}}"
REDIS_PORT="${CFN_REDIS_PORT:-${REDIS_PORT:-$DEFAULT_REDIS_PORT}}"
REDIS_DB="${CFN_REDIS_DB:-${REDIS_DB:-$DEFAULT_REDIS_DB}}"
REDIS_PASSWORD="${CFN_REDIS_PASSWORD:-${REDIS_PASSWORD:-}}"
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --task-id)
            TASK_ID="$2"
            shift 2
            ;;
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --agent-type)
            AGENT_TYPE="$2"
            shift 2
            ;;
        --container-id)
            CONTAINER_ID="$2"
            shift 2
            ;;
        --confidence)
            CONFIDENCE="$2"
            shift 2
            ;;
        --iteration)
            ITERATION="$2"
            shift 2
            ;;
        --loop-number)
            LOOP_NUMBER="$2"
            shift 2
            ;;
        --agent-count)
            AGENT_COUNT="$2"
            shift 2
            ;;
        --context-file)
            CONTEXT_FILE="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --ttl)
            TTL="$2"
            shift 2
            ;;
        --required-consensus)
            REQUIRED_CONSENSUS="$2"
            shift 2
            ;;
        --host)
            REDIS_HOST="$2"
            shift 2
            ;;
        --port)
            REDIS_PORT="$2"
            shift 2
            ;;
        --db)
            REDIS_DB="$2"
            shift 2
            ;;
        --password)
            REDIS_PASSWORD="$2"
            shift 2
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
        *)
            if [[ -z "$OPERATION" ]]; then
                OPERATION="$1"
            else
                log_error "Too many arguments"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate operation
if [[ -z "$OPERATION" ]]; then
    log_error "Operation is required"
    usage
    exit 1
fi

# Check Redis connection
if ! check_redis_connection; then
    exit 1
fi

# Redis key generation functions
task_context_key() {
    echo "cfn_docker:task:$1:context"
}

agent_key() {
    echo "cfn_docker:agent:$1"
}

agent_status_key() {
    echo "cfn_docker:task:$1:agent:$2:done"
}

confidence_key() {
    echo "cfn_docker:task:$1:confidence:$2"
}

consensus_key() {
    echo "cfn_docker:task:$1:loop:$2:consensus"
}

# Operation implementations
init_task() {
    local task_id="$1"
    local context_file="$2"

    if [[ -z "$task_id" ]]; then
        log_error "Task ID is required"
        return 1
    fi

    if [[ -n "$context_file" && ! -f "$context_file" ]]; then
        log_error "Context file not found: $context_file"
        return 1
    fi

    log "Initializing coordination for task: $task_id"

    # Store task metadata
    $REDIS_CMD HSET "cfn_docker:task:$task_id:meta" \
        "created_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        "ttl" "$TTL" \
        "created_by" "cfn-docker-redis-coordination" \
        > /dev/null

    # Store context if provided
    if [[ -n "$context_file" ]]; then
        log "Storing context from: $context_file"
        local context_key=$(task_context_key "$task_id")

        # Read JSON file and store each field
        if jq -e 'keys[]' "$context_file" &> /dev/null; then
            while IFS= read -r key; do
                local value=$(jq -r ".$key" "$context_file")
                $REDIS_CMD HSET "$context_key" "$key" "$value" > /dev/null
            done < <(jq -r 'keys[]' "$context_file")
        else
            log_error "Invalid JSON in context file: $context_file"
            return 1
        fi

        # Set TTL on context
        $REDIS_CMD EXPIRE "$context_key" "$TTL" > /dev/null
    fi

    # Set TTL on metadata
    $REDIS_CMD EXPIRE "cfn_docker:task:$task_id:meta" "$TTL" > /dev/null

    log_success "Task coordination initialized: $task_id"
}

store_context() {
    local task_id="$1"
    local context_file="$2"

    if [[ -z "$task_id" || -z "$context_file" ]]; then
        log_error "Task ID and context file are required"
        return 1
    fi

    if [[ ! -f "$context_file" ]]; then
        log_error "Context file not found: $context_file"
        return 1
    fi

    log "Storing context for task: $task_id"
    local context_key=$(task_context_key "$task_id")

    # Store JSON fields
    while IFS= read -r key; do
        local value=$(jq -r ".$key" "$context_file")
        $REDIS_CMD HSET "$context_key" "$key" "$value" > /dev/null
    done < <(jq -r 'keys[]' "$context_file")

    # Set TTL
    $REDIS_CMD EXPIRE "$context_key" "$TTL" > /dev/null

    log_success "Context stored for task: $task_id"
}

get_context() {
    local task_id="$1"
    local agent_id="$2"

    if [[ -z "$task_id" ]]; then
        log_error "Task ID is required"
        return 1
    fi

    local context_key=$(task_context_key "$task_id")

    if ! $REDIS_CMD EXISTS "$context_key" &> /dev/null; then
        log_error "No context found for task: $task_id"
        return 1
    fi

    log "Retrieving context for task: $task_id"

    # Get all fields and create JSON
    local context_json="{"
    local first=true

    while IFS= read -r field; do
        if [[ "$first" == false ]]; then
            context_json="${context_json},"
        fi
        local value=$($REDIS_CMD HGET "$context_key" "$field")
        context_json="${context_json}\"$field\":\"$value\""
        first=false
    done < <($REDIS_CMD HKEYS "$context_key")

    context_json="${context_json}}"

    echo "$context_json"
    log_success "Context retrieved for task: $task_id"
}

register_agent() {
    local task_id="$1"
    local agent_id="$2"
    local agent_type="$3"
    local container_id="$4"

    if [[ -z "$task_id" || -z "$agent_id" || -z "$agent_type" ]]; then
        log_error "Task ID, Agent ID, and Agent Type are required"
        return 1
    fi

    log "Registering agent: $agent_id (type: $agent_type)"

    # Store agent information
    $REDIS_CMD HSET "$(agent_key "$agent_id")" \
        "agent_type" "$agent_type" \
        "container_id" "${container_id:-}" \
        "task_id" "$task_id" \
        "status" "spawning" \
        "iteration" "1" \
        "created_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        > /dev/null

    # Add to status history
    $REDIS_CMD LPUSH "cfn_docker:agent:$agent_id:status_history" \
        '{"status":"spawning","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
        > /dev/null

    # Set TTL
    $REDIS_CMD EXPIRE "$(agent_key "$agent_id")" "$TTL" > /dev/null

    log_success "Agent registered: $agent_id"
}

update_status() {
    local agent_id="$1"
    local status="$2"
    local iteration="${3:-1}"

    if [[ -z "$agent_id" || -z "$status" ]]; then
        log_error "Agent ID and status are required"
        return 1
    fi

    log "Updating status for agent $agent_id: $status"

    # Update agent status
    $REDIS_CMD HSET "$(agent_key "$agent_id")" \
        "status" "$status" \
        "iteration" "$iteration" \
        "updated_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        > /dev/null

    # Add to status history
    $REDIS_CMD LPUSH "cfn_docker:agent:$agent_id:status_history" \
        '{"status":"'$status'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
        > /dev/null

    log_success "Status updated for agent $agent_id: $status"
}

signal_complete() {
    local task_id="$1"
    local agent_id="$2"
    local confidence="$3"
    local iteration="${4:-1}"

    if [[ -z "$task_id" || -z "$agent_id" || -z "$confidence" ]]; then
        log_error "Task ID, Agent ID, and confidence are required"
        return 1
    fi

    # Validate confidence
    if ! [[ "$confidence" =~ ^0\.[0-9]+$|^1\.0$ ]]; then
        log_error "Confidence must be between 0.0 and 1.0"
        return 1
    fi

    log "Agent $agent_id signaling completion with confidence: $confidence"

    # Signal completion
    $REDIS_CMD LPUSH "$(agent_status_key "$task_id" "$agent_id")" "complete" > /dev/null

    # Store confidence
    local agent_type=$($REDIS_CMD HGET "$(agent_key "$agent_id")" "agent_type")
    $REDIS_CMD HSET "$(confidence_key "$task_id" "$agent_id")" \
        "confidence" "$confidence" \
        "iteration" "$iteration" \
        "reported_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        "agent_type" "${agent_type:-unknown}" \
        > /dev/null

    # Update agent status
    update_status "$agent_id" "completed" "$iteration"

    log_success "Agent $agent_id completion signaled"
}

wait_loop() {
    local task_id="$1"
    local loop_number="$2"
    local agent_count="$3"
    local timeout="${4:-$TIMEOUT}"

    if [[ -z "$task_id" || -z "$loop_number" || -z "$agent_count" ]]; then
        log_error "Task ID, loop number, and agent count are required"
        return 1
    fi

    log "Waiting for Loop $loop_number completion ($agent_count agents, timeout: ${timeout}s)"

    local start_time=$(date +%s)
    local completed_agents=0

    while [[ $(($(date +%s) - start_time)) -lt $timeout ]]; do
        completed_agents=0

        # Count completed agents for this task
        while IFS= read -r agent_id; do
            if $REDIS_CMD EXISTS "$(agent_status_key "$task_id" "$agent_id")" &> /dev/null; then
                ((completed_agents++))
            fi
        done < <($REDIS_CMD KEYS "cfn_docker:agent:*" | grep -o "cfn_docker:agent:[^:]*" | cut -d: -f3)

        if [[ $completed_agents -ge $agent_count ]]; then
            log_success "Loop $loop_number completed ($completed_agents/$agent_count agents)"
            return 0
        fi

        if [[ "$VERBOSE" == true ]]; then
            log "Progress: $completed_agents/$agent_count agents completed"
        fi

        sleep 5
    done

    log_error "Loop $loop_number timeout: only $completed_agents/$agent_count agents completed"
    return 1
}

collect_consensus() {
    local task_id="$1"
    local loop_number="$2"
    local required_consensus="$3"
    local timeout="${4:-$TIMEOUT}"

    if [[ -z "$task_id" || -z "$loop_number" || -z "$required_consensus" ]]; then
        log_error "Task ID, loop number, and required consensus are required"
        return 1
    fi

    log "Collecting Loop $loop_number consensus (threshold: $required_consensus)"

    local start_time=$(date +%s)
    local responses=0
    local total_confidence=0

    # Wait for validator responses
    while [[ $(($(date +%s) - start_time)) -lt $timeout ]]; do
        responses=0
        total_confidence=0

        # Count validator responses
        while IFS= read -r confidence_key; do
            local confidence=$($REDIS_CMD HGET "$confidence_key" "confidence")
            if [[ -n "$confidence" ]]; then
                total_confidence=$(echo "$total_confidence + $confidence" | bc -l)
                ((responses++))
            fi
        done < <($REDIS_CMD KEYS "$(confidence_key "$task_id" "*")")

        if [[ $responses -gt 0 ]]; then
            local average_confidence=$(echo "scale=3; $total_confidence / $responses" | bc -l)
            log "Responses: $responses, Average confidence: $average_confidence"

            if (( $(echo "$average_confidence >= $required_consensus" | bc -l) )); then
                local decision="PROCEED"
                if (( $(echo "$average_confidence >= 0.95" | bc -l) )); then
                    decision="COMPLETE"
                fi

                # Store consensus result
                $REDIS_CMD HSET "$(consensus_key "$task_id" "$loop_number")" \
                    "total_validators" "$responses" \
                    "responses_received" "$responses" \
                    "average_confidence" "$average_confidence" \
                    "consensus_reached" "true" \
                    "decision" "$decision" \
                    "collected_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                    > /dev/null

                log_success "Consensus reached: $average_confidence >= $required_consensus"
                return 0
            fi
        fi

        sleep 5
    done

    log_error "Consensus collection timeout: $responses responses, average: $(echo "scale=3; $total_confidence / $responses" | bc -l)"
    return 1
}

health_check() {
    log "Performing Redis health check"

    # Test basic connectivity
    if ! $REDIS_CMD ping &> /dev/null; then
        log_error "Redis ping failed"
        return 1
    fi

    # Test memory usage
    local memory_info=$($REDIS_CMD INFO memory | grep used_memory_human)
    log "Memory usage: $memory_info"

    # Test latency
    local latency_start=$(date +%s%N)
    $REDIS_CMD ping &> /dev/null
    local latency_end=$(date +%s%N)
    local latency_ms=$(( (latency_end - latency_start) / 1000000 ))
    log "Latency: ${latency_ms}ms"

    # Test data access
    local key_count=$($REDIS_CMD DBSIZE)
    log "Total keys: $key_count"

    log_success "Redis health check completed"
}

# Main operation dispatcher
case "$OPERATION" in
    init-task)
        init_task "$TASK_ID" "$CONTEXT_FILE"
        ;;
    store-context)
        store_context "$TASK_ID" "$CONTEXT_FILE"
        ;;
    get-context)
        get_context "$TASK_ID" "$AGENT_ID"
        ;;
    register-agent)
        register_agent "$TASK_ID" "$AGENT_ID" "$AGENT_TYPE" "$CONTAINER_ID"
        ;;
    update-status)
        update_status "$AGENT_ID" "$TASK_ID" "$ITERATION"
        ;;
    signal-complete)
        signal_complete "$TASK_ID" "$AGENT_ID" "$CONFIDENCE" "$ITERATION"
        ;;
    wait-loop)
        wait_loop "$TASK_ID" "$LOOP_NUMBER" "${AGENT_COUNT:-3}" "$TIMEOUT"
        ;;
    collect-consensus)
        collect_consensus "$TASK_ID" "$LOOP_NUMBER" "$REQUIRED_CONSENSUS" "$TIMEOUT"
        ;;
    health-check)
        health_check
        ;;
    *)
        log_error "Unknown operation: $OPERATION"
        usage
        exit 1
        ;;
esac