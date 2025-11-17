#!/bin/bash

###############################################################################
# Test 3: Spawn Pattern Comparison
#
# Compares the cost of different agent lifecycle patterns:
# 1. Spawn-Kill Pattern: Current CFN Loop approach (npx spawn -> execute -> kill)
# 2. Persistent Pattern: Long-running agents receiving messages
# 3. Docker Spawn-Kill: Containerized version of spawn-kill
# 4. Docker Persistent: Containerized persistent agents
#
# Measures: time, memory, CPU, Docker overhead
#
# Usage: bash spawn-cost.sh [--iterations 100] [--agents 10]
###############################################################################

set -euo pipefail

# Configuration
ITERATIONS=100
AGENTS=10
RESULTS_DIR="./results"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --iterations)
      ITERATIONS="$2"
      shift 2
      ;;
    --agents)
      AGENTS="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Create results directory
mkdir -p "$RESULTS_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Test 3: Spawn Pattern Comparison"
echo "========================================"
echo "Iterations: $ITERATIONS"
echo "Agents: $AGENTS"
echo "========================================"

###############################################################################
# Test 1: Spawn-Kill Pattern (Node.js CLI)
###############################################################################
test_spawn_kill_cli() {
  echo ""
  echo -e "${YELLOW}[1/4] Testing Spawn-Kill Pattern (Node.js CLI)...${NC}"

  local start_time=$(date +%s%3N)
  local start_mem=$(ps -o rss= -p $$ | awk '{print $1}')

  for i in $(seq 1 $ITERATIONS); do
    # Simulate agent spawn: create new Node.js process
    node -e "
      const agentId = 'agent-$i';
      const task = 'Simple task execution';
      // Simulate work
      const result = Math.random() * 100;
      process.exit(0);
    " > /dev/null 2>&1
  done

  local end_time=$(date +%s%3N)
  local end_mem=$(ps -o rss= -p $$ | awk '{print $1}')

  local duration=$((end_time - start_time))
  local mem_diff=$((end_mem - start_mem))

  echo "Duration: ${duration}ms"
  echo "Memory Delta: ${mem_diff}KB"
  echo "Avg per spawn: $((duration / ITERATIONS))ms"

  # Save results
  cat > "$RESULTS_DIR/spawn-kill-cli.json" <<EOF
{
  "pattern": "spawn-kill-cli",
  "iterations": $ITERATIONS,
  "duration_ms": $duration,
  "memory_delta_kb": $mem_diff,
  "avg_per_operation_ms": $((duration / ITERATIONS))
}
EOF

  echo -e "${GREEN}✓ Spawn-Kill CLI test complete${NC}"
}

###############################################################################
# Test 2: Persistent Pattern (Node.js)
###############################################################################
test_persistent_nodejs() {
  echo ""
  echo -e "${YELLOW}[2/4] Testing Persistent Pattern (Node.js)...${NC}"

  local start_time=$(date +%s%3N)

  # Use spawner script with real IPC message passing
  local result=$(node "$SCRIPT_DIR/persistent-spawner.js" "$AGENTS" "$ITERATIONS" 2>&1)

  local end_time=$(date +%s%3N)

  # Parse results from spawner
  if ! echo "$result" | jq empty 2>/dev/null; then
    echo -e "${RED}✗ Spawner failed or returned invalid JSON${NC}"
    echo "$result"
    return 1
  fi

  local messages_acked=$(echo "$result" | jq -r '.messages_acked')
  local spawn_duration=$(echo "$result" | jq -r '.duration_ms')
  local avg_latency=$(echo "$result" | jq -r '.avg_latency_ms')

  # Calculate total test duration (includes spawn overhead)
  local total_duration=$((end_time - start_time))

  echo "Total Duration: ${total_duration}ms"
  echo "Messaging Duration: ${spawn_duration}ms"
  echo "Messages Acked: ${messages_acked}/${ITERATIONS}"
  echo "Avg per message: ${avg_latency}ms"
  echo "Agents used: $AGENTS"

  # Save results
  cat > "$RESULTS_DIR/persistent-nodejs.json" <<EOF
{
  "pattern": "persistent-nodejs",
  "iterations": $ITERATIONS,
  "agents": $AGENTS,
  "total_duration_ms": $total_duration,
  "messaging_duration_ms": $spawn_duration,
  "messages_acked": $messages_acked,
  "avg_per_operation_ms": $avg_latency
}
EOF

  echo -e "${GREEN}✓ Persistent Node.js test complete${NC}"
}

###############################################################################
# Test 3: Docker Spawn-Kill Pattern
###############################################################################
test_spawn_kill_docker() {
  echo ""
  echo -e "${YELLOW}[3/4] Testing Spawn-Kill Pattern (Docker)...${NC}"

  # Build minimal test image if it doesn't exist
  if ! docker image inspect cfn-bench-agent:latest > /dev/null 2>&1; then
    echo "Building test Docker image..."

    cat > /tmp/Dockerfile.bench <<EOF
FROM node:20-alpine
WORKDIR /app
CMD ["node", "-e", "const result = Math.random() * 100; process.exit(0);"]
EOF

    docker build -f /tmp/Dockerfile.bench -t cfn-bench-agent:latest /tmp > /dev/null 2>&1
    rm /tmp/Dockerfile.bench
  fi

  local start_time=$(date +%s%3N)

  for i in $(seq 1 $((ITERATIONS / 10))); do
    # Run and remove container (simulate spawn-kill)
    docker run --rm cfn-bench-agent:latest > /dev/null 2>&1
  done

  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))

  # Scale to full iterations
  local scaled_duration=$((duration * 10))

  echo "Duration (${ITERATIONS} iterations): ${scaled_duration}ms"
  echo "Avg per spawn: $((scaled_duration / ITERATIONS))ms"

  # Save results
  cat > "$RESULTS_DIR/spawn-kill-docker.json" <<EOF
{
  "pattern": "spawn-kill-docker",
  "iterations": $ITERATIONS,
  "duration_ms": $scaled_duration,
  "avg_per_operation_ms": $((scaled_duration / ITERATIONS)),
  "note": "Scaled from ${ITERATIONS}/10 actual runs"
}
EOF

  echo -e "${GREEN}✓ Spawn-Kill Docker test complete${NC}"
}

###############################################################################
# Test 4: Docker Persistent Pattern
###############################################################################
test_persistent_docker() {
  echo ""
  echo -e "${YELLOW}[4/4] Testing Persistent Pattern (Docker)...${NC}"

  # Build persistent agent image if needed
  if ! docker image inspect cfn-bench-persistent:latest > /dev/null 2>&1; then
    echo "Building persistent Docker image..."

    cat > /tmp/Dockerfile.persistent <<EOF
FROM node:20-alpine
WORKDIR /app
CMD ["node", "-e", "process.stdin.resume();"]
EOF

    docker build -f /tmp/Dockerfile.persistent -t cfn-bench-persistent:latest /tmp > /dev/null 2>&1
    rm /tmp/Dockerfile.persistent
  fi

  # Start persistent containers
  local container_ids=()

  for i in $(seq 1 $AGENTS); do
    local container_id=$(docker run -d cfn-bench-persistent:latest)
    container_ids+=($container_id)
  done

  sleep 2 # Allow containers to start

  local start_time=$(date +%s%3N)

  # Measure baseline memory
  local start_mem=0
  for cid in "${container_ids[@]}"; do
    local mem=$(docker stats --no-stream --format "{{.MemUsage}}" $cid | awk '{print $1}' | sed 's/MiB//')
    start_mem=$(echo "$start_mem + $mem" | bc)
  done

  # Simulate message sending (exec commands in containers)
  for i in $(seq 1 $((ITERATIONS / 10))); do
    local target_idx=$((i % AGENTS))
    local target_cid=${container_ids[$target_idx]}

    # Send "message" via exec
    docker exec $target_cid sh -c "echo 'message-$i'" > /dev/null 2>&1
  done

  local end_time=$(date +%s%3N)
  local duration=$((end_time - start_time))
  local scaled_duration=$((duration * 10))

  # Measure final memory
  local end_mem=0
  for cid in "${container_ids[@]}"; do
    local mem=$(docker stats --no-stream --format "{{.MemUsage}}" $cid | awk '{print $1}' | sed 's/MiB//')
    end_mem=$(echo "$end_mem + $mem" | bc)
  done

  # Cleanup: stop and remove containers
  for cid in "${container_ids[@]}"; do
    docker stop $cid > /dev/null 2>&1
    docker rm $cid > /dev/null 2>&1
  done

  echo "Duration (${ITERATIONS} iterations): ${scaled_duration}ms"
  echo "Avg per message: $((scaled_duration / ITERATIONS))ms"
  echo "Baseline memory: ${start_mem}MB"

  # Save results
  cat > "$RESULTS_DIR/persistent-docker.json" <<EOF
{
  "pattern": "persistent-docker",
  "iterations": $ITERATIONS,
  "agents": $AGENTS,
  "duration_ms": $scaled_duration,
  "baseline_memory_mb": $start_mem,
  "avg_per_operation_ms": $((scaled_duration / ITERATIONS)),
  "note": "Scaled from ${ITERATIONS}/10 actual runs"
}
EOF

  echo -e "${GREEN}✓ Persistent Docker test complete${NC}"
}

###############################################################################
# Run all tests
###############################################################################
test_spawn_kill_cli
test_persistent_nodejs
test_spawn_kill_docker
test_persistent_docker

###############################################################################
# Generate comparison report
###############################################################################
echo ""
echo "========================================"
echo "Comparison Report"
echo "========================================"

cat > "$RESULTS_DIR/spawn-comparison.json" <<EOF
{
  "test_config": {
    "iterations": $ITERATIONS,
    "agents": $AGENTS,
    "timestamp": "$(date -Iseconds)"
  },
  "results": {
    "spawn_kill_cli": $(cat "$RESULTS_DIR/spawn-kill-cli.json"),
    "persistent_nodejs": $(cat "$RESULTS_DIR/persistent-nodejs.json"),
    "spawn_kill_docker": $(cat "$RESULTS_DIR/spawn-kill-docker.json"),
    "persistent_docker": $(cat "$RESULTS_DIR/persistent-docker.json")
  }
}
EOF

echo ""
echo "Results saved to: $RESULTS_DIR/spawn-comparison.json"
echo ""

# Display summary
echo "SUMMARY:"
echo "--------"
jq -r '.results | to_entries | .[] | "\(.key): \(.value.avg_per_operation_ms)ms avg"' "$RESULTS_DIR/spawn-comparison.json"

echo ""
echo -e "${GREEN}✓ All spawn pattern tests complete${NC}"
