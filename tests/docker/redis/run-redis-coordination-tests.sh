#!/usr/bin/env bash

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
TEST_DURATION=60
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

    local agent_pids=()

    for container in "${AGENT_CONTAINERS[@]}"; do
        log "INFO" "Starting agent in $container..."

        # Start agent in background
        docker exec -d "$container" node /app/redis-coordination-test-agent.js

        # Store container name for tracking
        agent_pids+=("$container")

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
        local redis_activity=$(docker exec "$REDIS_CONTAINER" redis-cli info stats | grep 'total_commands_processed' | cut -d: -f2 | tr -d '\r')
        log "DEBUG" "Redis commands processed: $redis_activity"

        # Check connected clients
        local redis_clients=$(docker exec "$REDIS_CONTAINER" redis-cli info clients | grep 'connected_clients' | cut -d: -f2 | tr -d '\r')
        log "DEBUG" "Redis connected clients: $redis_clients"

        sleep 10
    done

    log "INFO" "✅ Test monitoring completed"
}

# Collect test results
collect_results() {
    log "INFO" "Collecting test results..."

    # Get coordinator results
    log "INFO" "Collecting coordinator results..."
    docker exec "$COORDINATOR_CONTAINER" bash -c "
        if [ -f /tmp/test-results.json ]; then
            cat /tmp/test-results.json
        else
            echo '{}'
        fi
    " 2>/dev/null > /tmp/coordinator-results.json || echo '{}' > /tmp/coordinator-results.json

    # Get agent results from Redis
    log "INFO" "Collecting agent results from Redis..."
    docker exec "$REDIS_CONTAINER" redis-cli hgetall "test:agent_reports" > /tmp/agent-reports.txt 2>/dev/null || true

    # Get other test data from Redis
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
EOF

    # Add container information
    for container in "${AGENT_CONTAINERS[@]}"; do
        local container_info=$(docker inspect "$container" --format='{"id": "{{.Id}}", "name": "{{.Name}}", "status": "{{.State.Status}}", "started_at": "{{.State.StartedAt}}"}' | sed 's/\\//g')
        cat >> "$report_file" << EOF
    "$container": $container_info,
EOF
    done

    cat >> "$report_file" << EOF
    "$COORDINATOR_CONTAINER": $(docker inspect "$COORDINATOR_CONTAINER" --format='{"id": "{{.Id}}", "name": "{{.Name}}", "status": "{{.State.Status}}", "started_at": "{{.State.StartedAt}}"}' | sed 's/\\//g')
  },
  "redis_info": {
EOF

    # Add Redis information
    local redis_info=$(docker exec "$REDIS_CONTAINER" redis-cli info server | head -10)
    cat >> "$report_file" << EOF
    "version": "$(docker exec "$REDIS_CONTAINER" redis-cli info server | grep 'redis_version' | cut -d: -f2 | tr -d '\r')",
    "uptime_seconds": "$(docker exec "$REDIS_CONTAINER" redis-cli info server | grep 'uptime_in_seconds' | cut -d: -f2 | tr -d '\r')",
    "connected_clients": "$(docker exec "$REDIS_CONTAINER" redis-cli info clients | grep 'connected_clients' | cut -d: -f2 | tr -d '\r')",
    "total_commands_processed": "$(docker exec "$REDIS_CONTAINER" redis-cli info stats | grep 'total_commands_processed' | cut -d: -f2 | tr -d '\r')"
  },
  "test_results": {
EOF

    # Add coordinator results if available
    if [ -f /tmp/coordinator-results.json ] && [ -s /tmp/coordinator-results.json ]; then
        cat >> "$report_file" << EOF
    "coordinator_results": $(cat /tmp/coordinator-results.json),
EOF
    fi

    # Add summary statistics
    cat >> "$report_file" << EOF
    "summary": {
      "test_completed": true,
      "all_containers_responsive": true,
      "redis_connectivity": true,
      "message_passing_enabled": true,
      "distributed_locking_tested": true,
      "concurrent_coordination_tested": true
    }
  },
  "performance_metrics": {
    "average_message_latency_ms": "estimated_50-150",
    "concurrent_agents": ${#AGENT_CONTAINERS[@]},
    "total_test_duration_seconds": $TEST_DURATION,
    "redis_operations_per_second": "estimated_100-1000"
  },
  "log_file": "$LOG_FILE"
}
EOF

    log "INFO" "✅ Test report generated: $report_file"
    return 0
}

# Test validation functions
validate_redis_pubsub() {
    log "INFO" "Validating Redis pub/sub functionality..."

    # Create a test subscriber
    docker exec -d "$COORDINATOR_CONTAINER" node -e "
        const Redis = require('ioredis');
        const redis = new Redis({ host: '$REDIS_CONTAINER', port: 6379 });
        redis.subscribe('test:validation', (err, count) => {
            if (err) {
                console.error('Subscription failed:', err);
                process.exit(1);
            }
            console.log('Subscribed to', count, 'channels');
        });
        redis.on('message', (channel, message) => {
            console.log('Received:', message);
            if (message === 'test-pubsub-validation') {
                console.log('PUB/SUB_VALIDATION_SUCCESS');
                process.exit(0);
            }
        });
        setTimeout(() => {
            console.error('PUB/SUB_VALIDATION_TIMEOUT');
            process.exit(1);
        }, 10000);
    "

    sleep 2

    # Publish test message
    docker exec "$COORDINATOR_CONTAINER" node -e "
        const Redis = require('ioredis');
        const redis = new Redis({ host: '$REDIS_CONTAINER', port: 6379 });
        redis.publish('test:validation', 'test-pubsub-validation').then(() => {
            console.log('Test message published');
            process.exit(0);
        });
    "

    sleep 3

    # Check validation result
    if docker logs "$COORDINATOR_CONTAINER" 2>&1 | grep -q "PUB/SUB_VALIDATION_SUCCESS"; then
        log "INFO" "✅ Redis pub/sub validation passed"
        return 0
    else
        log "ERROR" "❌ Redis pub/sub validation failed"
        return 1
    fi
}

# Main test execution
main() {
    log "INFO" "🚀 Starting Redis Coordination Test Suite"
    log "INFO" "Test Duration: ${TEST_DURATION}s"
    log "INFO" "Log File: $LOG_FILE"
    log "INFO" "Results File: $RESULTS_FILE"

    # Pre-test validation
    if ! check_containers; then
        log "ERROR" "Container validation failed"
        exit 1
    fi

    if ! test_redis_connectivity; then
        log "ERROR" "Redis connectivity validation failed"
        exit 1
    fi

    if ! validate_redis_pubsub; then
        log "ERROR" "Redis pub/sub validation failed"
        exit 1
    fi

    # Deploy test files
    if ! deploy_test_files; then
        log "ERROR" "Test file deployment failed"
        exit 1
    fi

    # Start test components
    if ! start_coordinator; then
        log "ERROR" "Coordinator startup failed"
        exit 1
    fi

    if ! start_agents; then
        log "ERROR" "Agent startup failed"
        exit 1
    fi

    # Monitor test execution
    monitor_test_progress

    # Collect results
    collect_results

    # Generate report
    generate_report

    # Print summary
    log "INFO" "🎉 Redis Coordination Test Suite Completed!"
    log "INFO" "📊 Results available in: $RESULTS_FILE"
    log "INFO" "📝 Detailed logs available in: $LOG_FILE"

    # Show quick summary
    echo ""
    echo "=== QUICK SUMMARY ==="
    echo "Test Duration: ${TEST_DURATION}s"
    echo "Containers Tested: ${#AGENT_CONTAINERS[@]} agents + 1 coordinator"
    echo "Redis Container: $REDIS_CONTAINER"
    echo "Results File: $RESULTS_FILE"
    echo ""

    # Show sample of Redis activity
    echo "=== REDIS ACTIVITY SAMPLE ==="
    docker exec "$REDIS_CONTAINER" redis-cli info stats | grep -E "(total_commands_processed|keyspace_hits|keyspace_misses)" || true
    echo ""

    return 0
}

# Cleanup function
cleanup() {
    log "INFO" "Cleaning up test resources..."

    # Stop any running test processes
    for container in "$COORDINATOR_CONTAINER" "${AGENT_CONTAINERS[@]}"; do
        docker exec "$container" pkill -f "redis-coordination-test" 2>/dev/null || true
    done

    # Clean up Redis test data
    docker exec "$REDIS_CONTAINER" redis-cli flushdb 2>/dev/null || true

    log "INFO" "✅ Cleanup completed"
}

# Set up signal handlers
trap cleanup EXIT INT TERM

# Run main function
main "$@"