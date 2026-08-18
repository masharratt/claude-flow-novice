#!/usr/bin/env bash
# tests/docker/architecture-test-helpers.sh
# Phase 4 :: Architecture-specific test helpers for P1 tests
# Extends test-helpers.sh with CFN Loop, coordinator, and provider validation utilities

# Prevent multiple sourcing
if [ -n "${ARCHITECTURE_TEST_HELPERS_LOADED:-}" ]; then
    return 0
fi
ARCHITECTURE_TEST_HELPERS_LOADED=1

# Enable strict error handling
set -euo pipefail

# Source base Docker test helpers
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
source "$PROJECT_ROOT/tests/docker/helpers/test-helpers.sh"

# ============================================================================
# ENVIRONMENT VARIABLE VALIDATION HELPERS
# ============================================================================

# Check if environment variable exists and is non-empty
# Usage: env_var_exists "CFN_REDIS_HOST"
env_var_exists() {
    local var_name="$1"

    if [ -n "${!var_name:-}" ]; then
        log_success "Environment variable exists: $var_name=${!var_name}"
        return 0
    else
        log_error "Environment variable missing or empty: $var_name"
        return 1
    fi
}

# Validate .env file format and content
# Usage: validate_env_file "/path/to/.env"
validate_env_file() {
    local env_file="$1"
    local errors=0

    log_step "Validating .env file: $env_file"

    # Check file exists
    if [ ! -f "$env_file" ]; then
        log_error "File not found: $env_file"
        return 1
    fi

    # Check for inline comments (should be filtered)
    if grep -qE '^\s*[A-Z_]+=.*#.*$' "$env_file"; then
        log_warn "Found inline comments (should be filtered during parsing)"
        errors=$((errors + 1))
    fi

    # Check for empty values
    local empty_vars
    empty_vars=$(grep -E '^\s*[A-Z_]+=\s*$' "$env_file" || echo "")

    if [ -n "$empty_vars" ]; then
        log_warn "Found variables with empty values:"
        echo "$empty_vars" | while read -r line; do
            log_warn "  - $line"
        done
        errors=$((errors + 1))
    fi

    # Check for duplicate keys
    local duplicate_keys
    duplicate_keys=$(grep -E '^\s*[A-Z_]+=' "$env_file" | \
                     sed -E 's/^\s*([A-Z_]+)=.*/\1/' | \
                     sort | uniq -d || echo "")

    if [ -n "$duplicate_keys" ]; then
        log_error "Found duplicate variable keys:"
        echo "$duplicate_keys" | while read -r key; do
            log_error "  - $key"
        done
        errors=$((errors + 1))
    fi

    if [ $errors -eq 0 ]; then
        log_success ".env file validation passed"
        return 0
    else
        log_error ".env file validation failed with $errors issues"
        return 1
    fi
}

# Check for required environment variables in container
# Usage: check_required_vars "container-name" "VAR1" "VAR2" "VAR3"
check_required_vars() {
    local container="$1"
    shift
    local required_vars=("$@")
    local missing=0

    log_info "Checking required environment variables in $container"

    for var_name in "${required_vars[@]}"; do
        local value
        value=$(docker exec "$container" printenv "$var_name" 2>/dev/null || echo "")

        if [ -z "$value" ]; then
            log_error "Missing required variable: $var_name"
            missing=$((missing + 1))
        else
            log_success "Found: $var_name"
        fi
    done

    if [ $missing -eq 0 ]; then
        return 0
    else
        log_error "$missing required variables missing"
        return 1
    fi
}

# Validate runtime environment override
# Usage: validate_runtime_override "container-name" "VAR_NAME" "expected-value"
validate_runtime_override() {
    local container="$1"
    local var_name="$2"
    local expected_value="$3"

    local actual_value
    actual_value=$(docker exec "$container" printenv "$var_name" 2>/dev/null || echo "")

    if [ "$actual_value" = "$expected_value" ]; then
        log_success "Runtime override verified: $var_name=$actual_value"
        return 0
    else
        log_error "Runtime override mismatch: $var_name"
        log_error "  Expected: $expected_value"
        log_error "  Got: $actual_value"
        return 1
    fi
}

# ============================================================================
# CFN LOOP VALIDATION HELPERS
# ============================================================================

# Validate gate threshold calculation
# Usage: validate_gate_threshold 0.85 0.90 0.80 (returns pass/fail based on average >= threshold)
validate_gate_threshold() {
    local threshold="${1:-0.75}"
    shift
    local scores=("$@")

    if [ ${#scores[@]} -eq 0 ]; then
        log_error "No confidence scores provided"
        return 1
    fi

    # Calculate average
    local sum=0
    local count=${#scores[@]}

    for score in "${scores[@]}"; do
        # Use bc for floating point math
        sum=$(echo "$sum + $score" | bc)
    done

    local average
    average=$(echo "scale=2; $sum / $count" | bc)

    log_info "Gate check: average=$average, threshold=$threshold"

    # Compare using bc
    local passes
    passes=$(echo "$average >= $threshold" | bc)

    if [ "$passes" -eq 1 ]; then
        log_success "Gate threshold PASSED (avg=$average >= $threshold)"
        return 0
    else
        log_error "Gate threshold FAILED (avg=$average < $threshold)"
        return 1
    fi
}

# Validate Loop 2 consensus score
# Usage: validate_consensus 0.90 0.88 0.92 0.91 (checks if average >= consensus threshold)
validate_consensus() {
    local consensus_threshold="${1:-0.90}"
    shift
    local validator_scores=("$@")

    if [ ${#validator_scores[@]} -eq 0 ]; then
        log_error "No validator scores provided"
        return 1
    fi

    # Calculate consensus (average)
    local sum=0
    local count=${#validator_scores[@]}

    for score in "${validator_scores[@]}"; do
        sum=$(echo "$sum + $score" | bc)
    done

    local consensus
    consensus=$(echo "scale=2; $sum / $count" | bc)

    log_info "Consensus check: consensus=$consensus, threshold=$consensus_threshold"

    local passes
    passes=$(echo "$consensus >= $consensus_threshold" | bc)

    if [ "$passes" -eq 1 ]; then
        log_success "Consensus PASSED (consensus=$consensus >= $consensus_threshold)"
        return 0
    else
        log_error "Consensus FAILED (consensus=$consensus < $consensus_threshold)"
        return 1
    fi
}

# Parse Product Owner decision from logs or output
# Usage: decision=$(parse_po_decision "container-name")
# Returns: "PROCEED" | "ITERATE" | "ABORT" | "UNKNOWN"
parse_po_decision() {
    local container="$1"

    local logs
    logs=$(docker logs "$container" 2>&1 | tail -100)

    # Look for decision patterns
    if echo "$logs" | grep -qi "DECISION.*PROCEED"; then
        echo "PROCEED"
        return 0
    elif echo "$logs" | grep -qi "DECISION.*ITERATE"; then
        echo "ITERATE"
        return 0
    elif echo "$logs" | grep -qi "DECISION.*ABORT"; then
        echo "ABORT"
        return 0
    else
        echo "UNKNOWN"
        return 1
    fi
}

# Validate CFN Loop iteration metadata
# Usage: validate_iteration_metadata "redis-key" "expected-iteration"
validate_iteration_metadata() {
    local redis_key="$1"
    local expected_iteration="$2"

    # Get iteration from Redis
    local actual_iteration
    actual_iteration=$($REDIS_CLI_CMD HGET "$redis_key" iteration 2>/dev/null || echo "")

    if [ "$actual_iteration" = "$expected_iteration" ]; then
        log_success "Iteration metadata correct: iteration=$actual_iteration"
        return 0
    else
        log_error "Iteration mismatch: expected=$expected_iteration, got=$actual_iteration"
        return 1
    fi
}

# ============================================================================
# COORDINATOR LIFECYCLE HELPERS
# ============================================================================

# Wait for coordinator to reach specific status
# Usage: wait_for_coordinator "task-id" "running" 30
wait_for_coordinator() {
    local task_id="$1"
    local expected_status="$2"
    local timeout="${3:-30}"
    local elapsed=0

    log_info "Waiting for coordinator status: $expected_status (timeout: ${timeout}s)"

    while [ $elapsed -lt $timeout ]; do
        local status
        status=$($REDIS_CLI_CMD HGET "coordinator:$task_id" status 2>/dev/null || echo "")

        if [ "$status" = "$expected_status" ]; then
            log_success "Coordinator reached status: $expected_status"
            return 0
        fi

        sleep 1
        elapsed=$((elapsed + 1))
    done

    log_error "Coordinator did not reach status $expected_status within ${timeout}s"
    return 1
}

# Get coordinator status from Redis
# Usage: status=$(get_coordinator_status "task-id")
get_coordinator_status() {
    local task_id="$1"

    $REDIS_CLI_CMD HGET "coordinator:$task_id" status 2>/dev/null || echo "unknown"
}

# Parse coordinator logs for specific patterns
# Usage: errors=$(parse_coordinator_logs "cfn-coordinator-123" "ERROR")
parse_coordinator_logs() {
    local container="$1"
    local pattern="$2"

    docker logs "$container" 2>&1 | grep "$pattern" || echo ""
}

# Check coordinator heartbeat freshness
# Usage: if check_coordinator_heartbeat "task-id" 10; then ...
check_coordinator_heartbeat() {
    local task_id="$1"
    local max_age_seconds="${2:-30}"

    local last_heartbeat
    last_heartbeat=$($REDIS_CLI_CMD HGET "coordinator:$task_id" heartbeat 2>/dev/null || echo "0")

    if [ "$last_heartbeat" = "0" ]; then
        log_error "No heartbeat found for coordinator"
        return 1
    fi

    local current_time
    current_time=$(date +%s)
    local age=$((current_time - last_heartbeat / 1000))

    if [ $age -le $max_age_seconds ]; then
        log_success "Coordinator heartbeat fresh (${age}s old)"
        return 0
    else
        log_error "Coordinator heartbeat stale (${age}s old, max: ${max_age_seconds}s)"
        return 1
    fi
}

# Validate coordinator spawned agents
# Usage: count=$(count_spawned_agents "task-id")
count_spawned_agents() {
    local task_id="$1"

    # Count agents in swarm namespace
    local agent_count
    agent_count=$($REDIS_CLI_CMD KEYS "swarm:${task_id}:*" 2>/dev/null | wc -l || echo "0")

    echo "$agent_count"
}

# ============================================================================
# PROVIDER AUTHENTICATION HELPERS
# ============================================================================

# Validate provider authentication configuration
# Usage: validate_provider_auth "zai" "/container/path/.env"
validate_provider_auth() {
    local provider="$1"
    local container="$2"

    log_info "Validating $provider authentication in $container"

    case "$provider" in
        zai)
            check_required_vars "$container" "ZAI_API_KEY" "ZAI_BASE_URL"
            return $?
            ;;
        kimi)
            check_required_vars "$container" "KIMI_API_KEY" "KIMI_BASE_URL"
            return $?
            ;;
        anthropic)
            check_required_vars "$container" "ANTHROPIC_API_KEY"
            return $?
            ;;
        openrouter)
            check_required_vars "$container" "OPENROUTER_API_KEY"
            return $?
            ;;
        *)
            log_error "Unknown provider: $provider"
            return 1
            ;;
    esac
}

# Test provider failover behavior
# Usage: test_provider_failover "container-name" "primary-provider" "fallback-provider"
test_provider_failover() {
    local container="$1"
    local primary="$2"
    local fallback="$3"

    log_step "Testing provider failover: $primary -> $fallback"

    # Check primary provider config
    if validate_provider_auth "$primary" "$container"; then
        log_success "Primary provider configured: $primary"
    else
        log_warn "Primary provider not configured, checking fallback"

        # Check fallback provider
        if validate_provider_auth "$fallback" "$container"; then
            log_success "Fallback provider configured: $fallback"
            return 0
        else
            log_error "Neither primary nor fallback provider configured"
            return 1
        fi
    fi

    return 0
}

# Validate custom routing configuration
# Usage: validate_custom_routing "container-name"
validate_custom_routing() {
    local container="$1"

    local custom_routing
    custom_routing=$(docker exec "$container" printenv CFN_CUSTOM_ROUTING 2>/dev/null || echo "false")

    if [ "$custom_routing" = "true" ]; then
        log_info "Custom routing enabled"

        # Validate required provider configuration
        local provider
        provider=$(docker exec "$container" printenv CLAUDE_API_PROVIDER 2>/dev/null || echo "")

        if [ -n "$provider" ]; then
            log_success "Provider configured: $provider"
            validate_provider_auth "$provider" "$container"
            return $?
        else
            log_error "Custom routing enabled but no provider configured"
            return 1
        fi
    else
        log_info "Custom routing disabled (using default)"
        return 0
    fi
}

# ============================================================================
# BUILD AND SYNC HELPERS
# ============================================================================

# Check Docker image freshness
# Usage: check_image_freshness "image:tag" 3600 (max age in seconds)
check_image_freshness() {
    local image="$1"
    local max_age="${2:-3600}"

    # Get image creation timestamp
    local created
    created=$(docker inspect "$image" --format='{{.Created}}' 2>/dev/null || echo "")

    if [ -z "$created" ]; then
        log_error "Image not found: $image"
        return 1
    fi

    # Convert to Unix timestamp
    local created_ts
    created_ts=$(date -d "$created" +%s 2>/dev/null || echo "0")

    local current_ts
    current_ts=$(date +%s)

    local age=$((current_ts - created_ts))

    log_info "Image age: ${age}s (max: ${max_age}s)"

    if [ $age -le $max_age ]; then
        log_success "Image is fresh: $image"
        return 0
    else
        log_warn "Image is stale: $image (${age}s old)"
        return 1
    fi
}

# Validate rsync exclusions
# Usage: validate_rsync_exclusions "/path/to/project"
validate_rsync_exclusions() {
    local project_path="$1"

    log_info "Validating rsync exclusions for: $project_path"

    # Check for .dockerignore patterns
    local dockerignore="$project_path/.dockerignore"

    if [ ! -f "$dockerignore" ]; then
        log_warn ".dockerignore not found (no explicit exclusions)"
        return 0
    fi

    # Validate common exclusion patterns
    local required_patterns=(
        "node_modules"
        ".git"
        "*.log"
    )

    local missing=0

    for pattern in "${required_patterns[@]}"; do
        if ! grep -q "$pattern" "$dockerignore"; then
            log_warn "Missing recommended exclusion pattern: $pattern"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -eq 0 ]; then
        log_success "All recommended exclusion patterns present"
        return 0
    else
        log_warn "$missing recommended patterns missing"
        return 0  # Non-fatal
    fi
}

# Verify build context size
# Usage: verify_build_context_size "/path/to/project" 100 (max MB)
verify_build_context_size() {
    local project_path="$1"
    local max_size_mb="${2:-100}"

    # Calculate directory size
    local size_kb
    size_kb=$(du -sk "$project_path" 2>/dev/null | cut -f1 || echo "0")

    local size_mb=$((size_kb / 1024))

    log_info "Build context size: ${size_mb}MB (max: ${max_size_mb}MB)"

    if [ $size_mb -le $max_size_mb ]; then
        log_success "Build context size acceptable"
        return 0
    else
        log_warn "Build context too large: ${size_mb}MB > ${max_size_mb}MB"
        return 1
    fi
}

# ============================================================================
# WAVE SPAWNING AND PARALLELISM HELPERS
# ============================================================================

# Validate wave execution parallelism
# Usage: validate_wave_parallelism "task-id" 5 (expected parallel agents)
validate_wave_parallelism() {
    local task_id="$1"
    local expected_parallel="${2:-3}"

    # Count agents spawned in current wave
    local running_agents
    running_agents=$(docker ps --filter "label=task_id=$task_id" --filter "status=running" --format "{{.Names}}" | wc -l || echo "0")

    log_info "Running agents: $running_agents (expected: $expected_parallel)"

    if [ "$running_agents" -eq "$expected_parallel" ]; then
        log_success "Wave parallelism correct: $running_agents agents"
        return 0
    else
        log_warn "Wave parallelism mismatch: expected=$expected_parallel, got=$running_agents"
        return 1
    fi
}

# Monitor sequential wave execution
# Usage: monitor_sequential_waves "task-id" 2 (number of waves)
monitor_sequential_waves() {
    local task_id="$1"
    local num_waves="${2:-2}"
    local current_wave=1

    log_step "Monitoring $num_waves sequential waves"

    while [ $current_wave -le $num_waves ]; do
        log_info "Waiting for wave $current_wave to complete"

        # Wait for wave completion (all agents stopped)
        local timeout=60
        local elapsed=0

        while [ $elapsed -lt $timeout ]; do
            local running
            running=$(docker ps --filter "label=task_id=$task_id" --filter "label=wave=$current_wave" --filter "status=running" -q | wc -l || echo "1")

            if [ "$running" -eq 0 ]; then
                log_success "Wave $current_wave completed"
                break
            fi

            sleep 2
            elapsed=$((elapsed + 2))
        done

        if [ $elapsed -ge $timeout ]; then
            log_error "Wave $current_wave did not complete within ${timeout}s"
            return 1
        fi

        current_wave=$((current_wave + 1))
    done

    log_success "All $num_waves waves completed sequentially"
    return 0
}

# ============================================================================
# TYPESCRIPT ERROR ANALYSIS HELPERS
# ============================================================================

# Parse TypeScript errors from agent output
# Usage: error_count=$(parse_typescript_errors "container-name")
parse_typescript_errors() {
    local container="$1"

    local logs
    logs=$(docker logs "$container" 2>&1)

    # Count TypeScript error patterns
    echo "$logs" | grep -cE "(error TS[0-9]+:|Type error:|Cannot find)" || echo "0"
}

# Validate error count delta
# Usage: validate_error_delta 10 5 (before, after - expect reduction)
validate_error_delta() {
    local before="$1"
    local after="$2"

    local delta=$((before - after))

    log_info "Error delta: $before -> $after (change: $delta)"

    if [ $delta -gt 0 ]; then
        log_success "Errors reduced by $delta"
        return 0
    elif [ $delta -eq 0 ]; then
        log_warn "No change in error count"
        return 1
    else
        log_error "Errors increased by ${delta#-}"
        return 1
    fi
}

# Map files to error counts
# Usage: create_error_map "container-name" > /tmp/error-map.json
create_error_map() {
    local container="$1"

    local logs
    logs=$(docker logs "$container" 2>&1)

    # Extract file:line patterns and count
    echo "$logs" | \
        grep -oE "[a-zA-Z0-9/_.-]+\.(ts|tsx):[0-9]+" | \
        sed 's/:[0-9]\+$//' | \
        sort | uniq -c | \
        awk '{print "{\"file\": \"" $2 "\", \"errors\": " $1 "}"}'
}

# ============================================================================
# DEBIAN CONTAINER EXECUTION HELPERS (Alpine → Debian Migration)
# ============================================================================

# Run agent container with proper Debian entry point and CFN environment variables
# Usage: run_agent_container "agent-id" "command-to-run" ["task-id"]
run_agent_container() {
    local agent_id="$1"
    local task_cmd="$2"
    local task_id="${3:-task-$(date +%s)}"

    docker run --rm \
        --entrypoint /bin/bash \
        --network mcp-network \
        -e CFN_AGENT_ID="$agent_id" \
        -e CFN_TASK_ID="$task_id" \
        -e CFN_REDIS_HOST="${CFN_REDIS_HOST:-cfn-redis}" \
        cfn-agent:latest \
        -c "$task_cmd"
}

# Run coordinator container with proper Debian entry point
# Usage: run_coordinator_container "task-id" "command-to-run"
run_coordinator_container() {
    local task_id="$1"
    local task_cmd="$2"

    docker run --rm \
        --entrypoint /bin/bash \
        --network mcp-network \
        -e CFN_TASK_ID="$task_id" \
        -e CFN_REDIS_HOST="${CFN_REDIS_HOST:-cfn-redis}" \
        cfn-coordinator:latest \
        -c "$task_cmd"
}

# Run orchestrator container with proper Debian entry point
# Usage: run_orchestrator_container "task-id" "command-to-run"
run_orchestrator_container() {
    local task_id="$1"
    local task_cmd="$2"

    docker run --rm \
        --entrypoint /bin/bash \
        --network mcp-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -e CFN_TASK_ID="$task_id" \
        -e CFN_REDIS_HOST="${CFN_REDIS_HOST:-cfn-redis}" \
        cfn-orchestrator:latest \
        -c "$task_cmd"
}

# ============================================================================
# EXPORT FUNCTIONS
# ============================================================================

export -f env_var_exists validate_env_file check_required_vars validate_runtime_override
export -f run_agent_container run_coordinator_container run_orchestrator_container
export -f validate_gate_threshold validate_consensus parse_po_decision validate_iteration_metadata
export -f wait_for_coordinator get_coordinator_status parse_coordinator_logs check_coordinator_heartbeat count_spawned_agents
export -f validate_provider_auth test_provider_failover validate_custom_routing
export -f check_image_freshness validate_rsync_exclusions verify_build_context_size
export -f validate_wave_parallelism monitor_sequential_waves
export -f parse_typescript_errors validate_error_delta create_error_map

log_info "Architecture test helpers loaded (P1 extension)"
