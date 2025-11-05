#!/bin/bash
# Test memory monitoring with existing containers

set -euo pipefail

echo "=== Testing Memory Monitoring Concept ==="

# Test with existing image
IMAGE_NAME="claude-flow-novice:stability-test"
TEST_AGENT_ID="test-memory-$(date +%s)"
REDIS_HOST="host.docker.internal"

echo "Using image: $IMAGE_NAME"
echo "Agent ID: $TEST_AGENT_ID"

# Test 1: Basic container with memory monitoring
echo
echo "Test 1: Container with memory monitoring"

docker run -d \
    --name "memory-test-$TEST_AGENT_ID" \
    --memory=512m \
    -e AGENT_ID="$TEST_AGENT_ID" \
    -e MEMORY_MONITORING=true \
    -e MEMORY_REPORT_INTERVAL=5 \
    -e MEMORY_ALERT_THRESHOLD=70 \
    -e REDIS_HOST="$REDIS_HOST" \
    -e REDIS_PORT=6379 \
    -v "$(pwd)/docker/scripts/monitor-wrapper.sh:/app/monitor-wrapper.sh:ro" \
    "$IMAGE_NAME" \
    sh -c "
        echo 'Container started'
        echo 'AGENT_ID=$AGENT_ID'
        echo 'Testing memory monitoring...'

        # Simulate memory monitoring
        for i in {1..6}; do
            timestamp=\$(date +%s)
            memory_usage=\$((50 + i * 5))
            memory_mb=\$((200 + i * 50))

            echo \"[\$timestamp] Memory: \${memory_usage}% (\${memory_mb}MB/512MB) - \$HOSTNAME\"

            # Try to report to Redis if available
            if command -v redis-cli >/dev/null 2>&1; then
                redis-cli -h '$REDIS_HOST' -p 6379 \
                    hset \"cfn_memory:$TEST_AGENT_ID:\$timestamp\" \
                    container_name \"memory-test-$TEST_AGENT_ID\" \
                    memory_usage \"\$memory_usage\" \
                    memory_mb \"\$memory_mb\" \
                    memory_limit_mb \"512\" \
                    timestamp \"\$timestamp\" \
                    agent_id \"$TEST_AGENT_ID\" >/dev/null 2>&1 || true
            fi

            sleep 2
        done

        echo 'Memory monitoring test completed'
    "

echo "Container started: memory-test-$TEST_AGENT_ID"

# Wait for container to complete
echo "Waiting for memory monitoring test..."
docker wait "memory-test-$TEST_AGENT_ID" >/dev/null

# Get container logs
echo
echo "=== Container Logs ==="
docker logs "memory-test-$TEST_AGENT_ID"

# Check Redis data if available
echo
echo "=== Checking Redis Data ==="
if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli -h "$REDIS_HOST" -p 6379 ping >/dev/null 2>&1; then
        echo "Redis connection successful"

        # Get memory data for our test agent
        echo "Memory entries for $TEST_AGENT_ID:"
        redis-cli -h "$REDIS_HOST" -p 6379 \
            keys "cfn_memory:$TEST_AGENT_ID:*" | head -3 | while read key; do
            if [ -n "$key" ]; then
                echo "Key: $key"
                redis-cli -h "$REDIS_HOST" -p 6379 hgetall "$key"
                echo "---"
            fi
        done

        # Check for alerts
        echo "Memory alerts:"
        redis-cli -h "$REDIS_HOST" -p 6379 lrange "cfn_memory_alerts" 0 -1 || echo "No alerts found"
    else
        echo "Redis not accessible at $REDIS_HOST:6379"
    fi
else
    echo "Redis CLI not available"
fi

# Cleanup
echo
echo "Cleaning up..."
docker rm "memory-test-$TEST_AGENT_ID" >/dev/null 2>&1 || true

echo "Memory monitoring test completed!"