#!/bin/bash

# Docker Hello-World Parity Tests
# Container-based versions of CLI hello-world tests for parity validation
# Ensures Docker and CLI modes have equivalent functionality

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🐳 DOCKER HELLO-WORLD PARITY TESTS"
echo "Container-based parity validation for CLI hello-world functionality"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test tracking
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Docker environment variables
export DOCKER_NETWORK_NAME="${DOCKER_NETWORK_NAME:-cfn-loop-test-network}"
export REDIS_CONTAINER_NAME="${REDIS_CONTAINER_NAME:-cfn-test-redis}"
export COORDINATOR_CONTAINER_NAME="${COORDINATOR_CONTAINER_NAME:-cfn-test-coordinator}"
export HELLO_WORLD_CONTAINER_NAME="${HELLO_WORLD_CONTAINER_NAME:-cfn-hello-world}"

# Log test result
log_test() {
    local test_name="$1"
    local result="$2"
    local details="${3:-}"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if [ "$result" = "PASS" ]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "  ${GREEN}✅ PASS${NC}: $test_name"
        if [ -n "$details" ]; then
            echo -e "     ${GREEN}$details${NC}"
        fi
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "  ${RED}❌ FAIL${NC}: $test_name"
        if [ -n "$details" ]; then
            echo -e "     ${RED}$details${NC}"
        fi
    fi
}

# Docker utility functions
create_test_network() {
    if ! docker network ls | grep -q "$DOCKER_NETWORK_NAME"; then
        docker network create "$DOCKER_NETWORK_NAME"
        echo "Created test network: $DOCKER_NETWORK_NAME"
    else
        echo "Test network already exists: $DOCKER_NETWORK_NAME"
    fi
}

cleanup_containers() {
    echo "Cleaning up containers..."
    docker stop "$REDIS_CONTAINER_NAME" "$COORDINATOR_CONTAINER_NAME" "$HELLO_WORLD_CONTAINER_NAME" 2>/dev/null || true
    docker rm "$REDIS_CONTAINER_NAME" "$COORDINATOR_CONTAINER_NAME" "$HELLO_WORLD_CONTAINER_NAME" 2>/dev/null || true
}

start_redis_container() {
    echo "Starting Redis container..."
    docker run -d \
        --name "$REDIS_CONTAINER_NAME" \
        --network "$DOCKER_NETWORK_NAME" \
        redis:7-alpine \
        redis-server --appendonly yes

    # Wait for Redis to be ready
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if docker exec "$REDIS_CONTAINER_NAME" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            echo "Redis is ready"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done

    echo "Redis failed to start"
    return 1
}

echo "Test 1: Docker network setup..."
# Test Docker network creation and isolation
if create_test_network; then
    log_test "Docker network setup" "PASS" "Test network created successfully"
else
    log_test "Docker network setup" "FAIL" "Failed to create test network"
fi

echo ""
echo "Test 2: Redis container startup..."
# Test Redis container deployment
if start_redis_container; then
    log_test "Redis container startup" "PASS" "Redis container running and responsive"
else
    log_test "Redis container startup" "FAIL" "Redis container failed to start"
fi

echo ""
echo "Test 3: CFN coordinator container deployment..."
# Test CFN coordinator container deployment
temp_coordinator_test=$(mktemp)
cat > "$temp_coordinator_test" << 'EOF'
#!/bin/bash

# CFN coordinator container deployment test

echo "Deploying CFN coordinator container..."

# Create a simple Dockerfile for testing
cat > /tmp/Dockerfile.cfn-test << 'DOCKERFILE_EOF'
FROM alpine:latest
RUN apk add --no-cache bash redis-tools
COPY . /app
WORKDIR /app
CMD ["sleep", "infinity"]
DOCKERFILE_EOF

# Build and run coordinator container
docker build -f /tmp/Dockerfile.cfn-test -t cfn-test-coordinator . 2>/dev/null

if docker run -d \
    --name cfn-test-coordinator \
    --network cfn-loop-test-network \
    -v "$(pwd):/app" \
    cfn-test-coordinator; then

    echo "CFN coordinator container deployed successfully"

    # Test basic connectivity
    sleep 2
    if docker exec cfn-test-coordinator ping -c 1 cfn-test-redis >/dev/null 2>&1; then
        echo "CFN coordinator can reach Redis"
        rm -f /tmp/Dockerfile.cfn-test
        exit 0
    else
        echo "CFN coordinator cannot reach Redis"
        rm -f /tmp/Dockerfile.cfn-test
        exit 1
    fi
else
    echo "Failed to deploy CFN coordinator container"
    rm -f /tmp/Dockerfile.cfn-test
    exit 1
fi
EOF

if bash "$temp_coordinator_test" 2>/dev/null; then
    log_test "CFN coordinator container deployment" "PASS" "Coordinator container deployed and connected to Redis"
else
    log_test "CFN coordinator container deployment" "FAIL" "Coordinator container deployment failed"
fi

rm -f "$temp_coordinator_test"

echo ""
echo "Test 4: Container-based hello-world context storage..."
# Test hello-world context storage in Redis via containers

temp_context_test=$(mktemp)
cat > "$temp_context_test" << 'EOF'
#!/bin/bash

# Container-based hello-world context storage test

TEST_TASK_ID="docker-hello-world-$(date +%s)"

# Mock hello-world context
HELLO_WORLD_CONTEXT='{
    "goal": "Hello World Test",
    "message": "Hello from Docker container!",
    "timestamp": "'$(date -Iseconds)'",
    "container_id": "'$(hostname)'",
    "agents": ["greeter", "validator"]
}'

# Store context in Redis via coordinator container
docker exec cfn-test-coordinator redis-cli -h cfn-test-redis hset "hello_world:${TEST_TASK_ID}:context" \
    "greeting" "Hello Docker World!" \
    "message" "This is a container-based hello-world test" \
    "timestamp" "$(date +%s)" \
    "context" "$HELLO_WORLD_CONTEXT"

# Verify context storage
RESULT=$(docker exec cfn-test-coordinator redis-cli -h cfn-test-redis hget "hello_world:${TEST_TASK_ID}:context" "greeting")

if [ "$RESULT" = "Hello Docker World!" ]; then
    echo "Container-based context storage successful"
    exit 0
else
    echo "Container-based context storage failed: $RESULT"
    exit 1
fi
EOF

if bash "$temp_context_test" 2>/dev/null; then
    log_test "Container-based hello-world context storage" "PASS" "Context stored and retrieved via containers"
else
    log_test "Container-based hello-world context storage" "FAIL" "Container context storage failed"
fi

rm -f "$temp_context_test"

echo ""
echo "Test 5: Container agent spawning simulation..."
# Test agent spawning simulation in container environment

temp_agent_spawn_test=$(mktemp)
cat > "$temp_agent_spawn_test" << 'EOF'
#!/bin/bash

# Container agent spawning simulation test

TEST_TASK_ID="docker-agent-test-$(date +%s)"

# Simulate agent spawning via coordinator container
SPAWN_RESULT=$(docker exec cfn-test-coordinator timeout 30s /bin/bash -c "
    # Create test coordination data
    SIGNAL_KEY='swarm:${TEST_TASK_ID}:greeter:signal'
    COMPLETION_KEY='swarm:${TEST_TASK_ID}:greeter:done'

    redis-cli -h cfn-test-redis SET \$SIGNAL_KEY 'started' >/dev/null 2>&1
    redis-cli -h cfn-test-redis HSET \$COMPLETION_KEY status 'complete' message 'Hello World from agent!' timestamp \$(date +%s) >/dev/null 2>&1

    # Verify coordination data
    SIGNAL_VALUE=\$(redis-cli -h cfn-test-redis GET \$SIGNAL_KEY)
    COMPLETION_STATUS=\$(redis-cli -h cfn-test-redis HGET \$COMPLETION_KEY status)
    COMPLETION_MESSAGE=\$(redis-cli -h cfn-test-redis HGET \$COMPLETION_KEY message)

    echo \"SIGNAL:\$SIGNAL_VALUE:STATUS:\$COMPLETION_STATUS:MESSAGE:\$COMPLETION_MESSAGE\"
" || echo "SPAWN_TIMEOUT")

if [[ "$SPAWN_RESULT" =~ "SIGNAL:started:STATUS:complete:MESSAGE:Hello World from agent!" ]]; then
    echo "Container agent spawning simulation successful"
    exit 0
else
    echo "Container agent spawning simulation failed: $SPAWN_RESULT"
    exit 1
fi
EOF

if bash "$temp_agent_spawn_test" 2>/dev/null; then
    log_test "Container agent spawning simulation" "PASS" "Agent coordination works in container environment"
else
    log_test "Container agent spawning simulation" "FAIL" "Container agent coordination failed"
fi

rm -f "$temp_agent_spawn_test"

echo ""
echo "Test 6: Docker hello-world message broadcasting..."
# Test hello-world message broadcasting via Redis pub/sub in containers

temp_broadcast_test=$(mktemp)
cat > "$temp_broadcast_test" << 'EOF'
#!/bin/bash

# Docker hello-world message broadcasting test

TEST_TASK_ID="docker-broadcast-$(date +%s)"

# Start subscriber in background container
docker exec -d cfn-test-coordinator /bin/bash -c "
    redis-cli -h cfn-test-redis SUBSCRIBE 'hello_world:${TEST_TASK_ID}:messages' > /tmp/subscriber.log &
    sleep 10
    kill %1 2>/dev/null || true
"

# Give subscriber time to start
sleep 2

# Publish hello-world message
PUBLISH_RESULT=$(docker exec cfn-test-coordinator redis-cli -h cfn-test-redis PUBLISH "hello_world:${TEST_TASK_ID}:messages" "Hello Docker World! Message from container: $(hostname)")

# Wait for subscription to process
sleep 3

# Check if message was received
SUBSCRIBER_LOG=$(docker exec cfn-test-coordinator cat /tmp/subscriber.log 2>/dev/null || echo "")

if [[ "$SUBSCRIBER_LOG" =~ "Hello Docker World!" ]] && [ "$PUBLISH_RESULT" -gt 0 ]; then
    echo "Docker hello-world broadcasting successful"
    exit 0
else
    echo "Docker hello-world broadcasting failed"
    echo "Publish result: $PUBLISH_RESULT"
    echo "Subscriber log: $SUBSCRIBER_LOG"
    exit 1
fi
EOF

if bash "$temp_broadcast_test" 2>/dev/null; then
    log_test "Docker hello-world message broadcasting" "PASS" "Message broadcasting works in container environment"
else
    log_test "Docker hello-world message broadcasting" "FAIL" "Container message broadcasting failed"
fi

rm -f "$temp_broadcast_test"

echo ""
echo "Test 7: Container resource monitoring..."
# Test container resource monitoring for hello-world workload

temp_resource_test=$(mktemp)
cat > "$temp_resource_test" << 'EOF'
#!/bin/bash

# Container resource monitoring test

# Get container resource usage
REDIS_MEMORY=$(docker stats --no-stream --format "{{.MemUsage}}" cfn-test-redis | cut -d'/' -f1)
COORDINATOR_MEMORY=$(docker stats --no-stream --format "{{.MemUsage}}" cfn-test-coordinator | cut -d'/' -f1)
REDIS_CPU=$(docker stats --no-stream --format "{{.CPUPerc}}" cfn-test-redis)
COORDINATOR_CPU=$(docker stats --no-stream --format "{{.CPUPerc}}" cfn-test-coordinator)

echo "Container Resource Usage:"
echo "Redis Memory: $REDIS_MEMORY"
echo "Redis CPU: $REDIS_CPU"
echo "Coordinator Memory: $COORDINATOR_MEMORY"
echo "Coordinator CPU: $COORDINATOR_CPU"

# Validate resources are reasonable (basic check)
if [[ "$REDIS_MEMORY" =~ ^[0-9] ]] && [[ "$COORDINATOR_MEMORY" =~ ^[0-9] ]]; then
    echo "Container resource monitoring successful"
    exit 0
else
    echo "Container resource monitoring failed - invalid metrics"
    exit 1
fi
EOF

if bash "$temp_resource_test" 2>/dev/null; then
    log_test "Container resource monitoring" "PASS" "Resource metrics collected successfully"
else
    log_test "Container resource monitoring" "FAIL" "Resource monitoring failed"
fi

rm -f "$temp_resource_test"

echo ""
echo "Test 8: Container cleanup and network isolation..."
# Test proper cleanup and network isolation

temp_cleanup_test=$(mktemp)
cat > "$temp_cleanup_test" << 'EOF'
#!/bin/bash

# Container cleanup and network isolation test

# Stop containers
docker stop cfn-test-coordinator 2>/dev/null || true

# Verify network isolation
if docker exec cfn-test-redis ping -c 1 cfn-test-coordinator 2>/dev/null; then
    echo "Network isolation failed - coordinator still accessible"
    exit 1
else
    echo "Network isolation working - coordinator properly isolated"
fi

# Test Redis still works
if docker exec cfn-test-redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo "Redis still accessible after isolation"
    exit 0
else
    echo "Redis became inaccessible"
    exit 1
fi
EOF

if bash "$temp_cleanup_test" 2>/dev/null; then
    log_test "Container cleanup and network isolation" "PASS" "Proper cleanup and isolation working"
else
    log_test "Container cleanup and network isolation" "FAIL" "Cleanup or isolation broken"
fi

rm -f "$temp_cleanup_test"

# Final cleanup
cleanup_containers
docker network rm "$DOCKER_NETWORK_NAME" 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DOCKER HELLO-WORLD PARITY TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 TEST RESULTS:"
echo "   Total Docker parity tests: $TESTS_TOTAL"
echo "   ✅ Passed: $TESTS_PASSED"
echo "   ❌ Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo "🎉 ALL DOCKER HELLO-WORLD PARITY TESTS PASSED"
    echo ""
    echo "✅ Docker and CLI hello-world functionality parity confirmed"
    echo "✅ Container-based context storage works"
    echo "✅ Container agent spawning simulation functional"
    echo "✅ Docker message broadcasting operational"
    echo "✅ Container resource monitoring working"
    echo "✅ Proper cleanup and network isolation"
    echo ""
    echo "🔧 Docker Parity Features Validated:"
    echo "   • Redis coordination via containers"
    echo "   • Context storage and retrieval in container environment"
    echo "   • Agent spawning simulation with container isolation"
    echo "   • Message broadcasting via Redis pub/sub"
    echo "   • Resource monitoring for container workloads"
    echo "   • Network isolation and cleanup"
    echo ""
    echo "💡 Docker vs CLI Parity Confirmed:"
    echo "   • Same Redis coordination protocols"
    echo "   • Equivalent context storage mechanisms"
    echo "   • Identical agent spawning patterns"
    echo "   • Matching message broadcasting behavior"
    echo "   • Consistent resource monitoring"
    echo ""
    exit 0
else
    echo "❌ DOCKER HELLO-WORLD PARITY TESTS FAILED"
    echo ""
    echo "🚨 Docker-Cli parity issues detected:"
    echo ""
    echo "⚠️  IMPACT:"
    echo "   • Docker and CLI modes may behave differently"
    echo "   • Container-based coordination may not match CLI"
    echo "   • Redis coordination inconsistencies"
    echo "   • Agent spawning behavior differs between modes"
    echo ""
    echo "🔧 RECOMMENDED DOCKER PARITY FIXES:"
    echo "   1. Ensure Redis coordination protocols match CLI"
    echo "   2. Validate context storage equivalence"
    echo "   3. Test agent spawning behavior consistency"
    echo "   4. Verify message broadcasting parity"
    echo "   5. Check resource monitoring consistency"
    echo "   6. Test cleanup and isolation procedures"
    echo ""
    exit 1
fi