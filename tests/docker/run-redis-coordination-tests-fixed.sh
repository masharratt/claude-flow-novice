#!/bin/bash

# Redis Coordination Test Script
# Tests agent-to-agent communication via Redis pub/sub from within Docker containers

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TEST_DURATION=30
COORDINATOR_CONTAINER="cfn-test-coordinator"
AGENT_CONTAINERS=("cfn-agent-test-1" "cfn-agent-test-2" "cfn-agent-test-3")
REDIS_CONTAINER="cfn-test-redis"
TEST_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/tests/docker"

# Results tracking
RESULTS_FILE="/tmp/redis-coordination-results-$(date +%s).json"
LOG_FILE="/tmp/redis-coordination-test-$(date +%s).log"

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case $level in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            ;;
        "DEBUG")
            echo -e "${BLUE}[DEBUG]${NC} ${timestamp} - $message" | tee -a "$LOG_FILE"
            ;;
    esac
}

# Check if containers are running
check_containers() {
    log "INFO" "Checking container status..."

    # Check Redis container
    if ! docker ps | grep -q "$REDIS_CONTAINER"; then
        log "ERROR" "Redis container $REDIS_CONTAINER is not running"
        return 1
    fi

    # Check coordinator container
    if ! docker ps | grep -q "$COORDINATOR_CONTAINER"; then
        log "ERROR" "Coordinator container $COORDINATOR_CONTAINER is not running"
        return 1
    fi

    # Check agent containers
    for container in "${AGENT_CONTAINERS[@]}"; do
        if ! docker ps | grep -q "$container"; then
            log "ERROR" "Agent container $container is not running"
            return 1
        fi
    done

    log "INFO" "✅ All required containers are running"
    return 0
}

# Test Redis connectivity from containers
test_redis_connectivity() {
    log "INFO" "Testing Redis connectivity from containers..."

    for container in "${AGENT_CONTAINERS[@]}"; do
        log "INFO" "Testing Redis connection from $container..."

        if docker exec "$container" node -e "
            const Redis = require('ioredis');
            const redis = new Redis({ host: '$REDIS_CONTAINER', port: 6379 });
            redis.ping().then(() => {
                console.log('✅ Redis connection successful from $container');
                process.exit(0);
            }).catch(err => {
                console.error('❌ Redis connection failed from $container:', err.message);
                process.exit(1);
            });
        "; then
            log "INFO" "✅ $container can connect to Redis"
        else
            log "ERROR" "❌ $container cannot connect to Redis"
            return 1
        fi
    done

    return 0
}

# Copy test files to containers
deploy_test_files() {
    log "INFO" "Deploying test files to containers..."

    # Copy coordinator script
    if docker cp "$TEST_DIR/redis-coordination-test-coordinator.js" "$COORDINATOR_CONTAINER:/app/"; then
        log "INFO" "✅ Coordinator script deployed"
    else
        log "ERROR" "❌ Failed to deploy coordinator script"
        return 1
    fi

    # Copy agent scripts
    for container in "${AGENT_CONTAINERS[@]}"; do
        if docker cp "$TEST_DIR/redis-coordination-test-agent.js" "$container:/app/"; then
            log "INFO" "✅ Agent script deployed to $container"
        else
            log "ERROR" "❌ Failed to deploy agent script to $container"
            return 1
        fi
    done

    return 0
}

# Start coordination test coordinator
start_coordinator() {
    log "INFO" "Starting Redis coordination test coordinator..."

    docker exec -d "$COORDINATOR_CONTAINER" node /app/redis-coordination-test-coordinator.js

    # Wait a moment for coordinator to initialize
    sleep 3

    # Check if coordinator is running
    if docker exec "$COORDINATOR_CONTAINER" pgrep -f "redis-coordination-test-coordinator.js" > /dev/null; then
        log "INFO" "✅ Coordinator started successfully"
        return 0
    else
        log "ERROR" "❌ Coordinator failed to start"
        return 1
    fi
}

# Start coordination test agents
start_agents() {
    log "INFO" "Starting Redis coordination test agents..."

    for container in "${AGENT_CONTAINERS[@]}"; do
        log "INFO" "Starting agent in $container..."

        # Start agent in background
        docker exec -d "$container" node /app/redis-coordination-test-agent.js

        # Small delay between agent starts
        sleep 1
    done

    log "INFO" "✅ All agents started"
    return 0
}

# Monitor test progress
monitor_test_progress() {
    log "INFO" "Monitoring Redis coordination test progress..."

    local start_time=$(date +%s)
    local end_time=$((start_time + TEST_DURATION))

    while [ $(date +%s) -lt $end_time ]; do
        log "INFO" "Test progress: $((( $(date +%s) - start_time) * 100 / TEST_DURATION))% complete"

        # Check Redis activity
        local redis_activity=$(docker exec "$REDIS_CONTAINER" redis-cli info stats | grep 'total_commands_processed' | cut -d: -f2 | tr -d '\r' || echo "0")
        log "DEBUG" "Redis commands processed: $redis_activity"

        # Check connected clients
        local redis_clients=$(docker exec "$REDIS_CONTAINER" redis-cli info clients | grep 'connected_clients' | cut -d: -f2 | tr -d '\r' || echo "0")
        log "DEBUG" "Redis connected clients: $redis_clients"

        sleep 5
    done

    log "INFO" "✅ Test monitoring completed"
}

# Collect test results
collect_results() {
    log "INFO" "Collecting test results..."

    # Get test data from Redis
    log "INFO" "Collecting results from Redis..."
    docker exec "$REDIS_CONTAINER" redis-cli hgetall "test:agent_reports" > /tmp/agent-reports.txt 2>/dev/null || true
    docker exec "$REDIS_CONTAINER" redis-cli hgetall "test:reports" > /tmp/test-reports.txt 2>/dev/null || true
    docker exec "$REDIS_CONTAINER" redis-cli lrange "test:results" 0 -1 > /tmp/test-messages.txt 2>/dev/null || true

    return 0
}

# Generate comprehensive test report
generate_report() {
    log "INFO" "Generating comprehensive test report..."

    local report_file="$RESULTS_FILE"

    cat > "$report_file" << EOF
{
  "test_info": {
    "test_name": "Redis Coordination Test",
    "timestamp": "$(date -Iseconds)",
    "duration_seconds": $TEST_DURATION,
    "coordinator_container": "$COORDINATOR_CONTAINER",
    "agent_containers": [$(printf '"%s",' "${AGENT_CONTAINERS[@]}" | sed 's/,$//')],
    "redis_container": "$REDIS_CONTAINER"
  },
  "containers_tested": {
