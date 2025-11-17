#!/bin/bash

###############################################################################
# Rust Migration Benchmark Suite - Orchestrator
#
# Runs all benchmark tests in sequence and generates a comprehensive report.
#
# Usage:
#   bash run-all.sh                    # Run all tests with defaults
#   bash run-all.sh --quick            # Run quick versions (reduced iterations)
#   bash run-all.sh --skip-rust        # Skip Rust tests (if not installed)
#   bash run-all.sh --skip-docker      # Skip Docker tests
#   bash run-all.sh --mock             # Use mock AI responses (no API key)
#
# Requirements:
#   - Node.js (for Node.js tests)
#   - Rust/Cargo (for Rust tests, optional with --skip-rust)
#   - Docker (for Docker tests, optional with --skip-docker)
#   - k6 (for load testing, install: brew install k6 or npm install -g k6)
#   - jq (for JSON processing, install: brew install jq or apt install jq)
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
QUICK_MODE=false
SKIP_RUST=false
SKIP_DOCKER=false
USE_MOCK=false
RESULTS_DIR="./results"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --quick)
      QUICK_MODE=true
      shift
      ;;
    --skip-rust)
      SKIP_RUST=true
      shift
      ;;
    --skip-docker)
      SKIP_DOCKER=true
      shift
      ;;
    --mock)
      USE_MOCK=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--quick] [--skip-rust] [--skip-docker] [--mock]"
      exit 1
      ;;
  esac
done

# Create results directory
mkdir -p "$RESULTS_DIR"

# Clear previous results
echo -e "${BLUE}Clearing previous results...${NC}"
rm -f "$RESULTS_DIR"/*.json "$RESULTS_DIR"/*.log

echo ""
echo "========================================"
echo "   Rust Migration Benchmark Suite"
echo "========================================"
echo "Mode: $([ "$QUICK_MODE" = true ] && echo "QUICK" || echo "FULL")"
echo "Skip Rust: $SKIP_RUST"
echo "Skip Docker: $SKIP_DOCKER"
echo "AI Mode: $([ "$USE_MOCK" = true ] && echo "MOCK" || echo "LIVE")"
echo "Results: $RESULTS_DIR"
echo "========================================"
echo ""

###############################################################################
# Dependency Checks
###############################################################################
echo -e "${BLUE}Checking dependencies...${NC}"

check_dependency() {
  local cmd=$1
  local name=$2
  local required=$3

  if command -v "$cmd" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} $name"
    return 0
  else
    if [ "$required" = "true" ]; then
      echo -e "  ${RED}✗${NC} $name (REQUIRED)"
      return 1
    else
      echo -e "  ${YELLOW}○${NC} $name (optional, skipping related tests)"
      return 0
    fi
  fi
}

DEPS_OK=true

check_dependency "node" "Node.js" "true" || DEPS_OK=false
check_dependency "npm" "npm" "true" || DEPS_OK=false
check_dependency "jq" "jq" "true" || DEPS_OK=false

if [ "$SKIP_RUST" = false ]; then
  check_dependency "cargo" "Rust/Cargo" "false" || SKIP_RUST=true
fi

if [ "$SKIP_DOCKER" = false ]; then
  check_dependency "docker" "Docker" "false" || SKIP_DOCKER=true
fi

check_dependency "k6" "k6" "false" || echo "  (Install: brew install k6 or npm install -g k6)"

if [ "$DEPS_OK" = false ]; then
  echo -e "\n${RED}Missing required dependencies. Exiting.${NC}"
  exit 1
fi

echo ""

###############################################################################
# Install Node.js dependencies
###############################################################################
echo -e "${BLUE}Installing Node.js dependencies...${NC}"
npm install --silent
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

###############################################################################
# Test 2: WebSocket Message Bus Comparison
###############################################################################
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 2: WebSocket Message Bus${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Start Node.js message bus in background
echo -e "${BLUE}Starting Node.js message bus...${NC}"
node node-message-bus.js --port 8080 > "$RESULTS_DIR/node-ws-server.log" 2>&1 &
NODE_WS_PID=$!
sleep 2

# Check if server started
if ps -p $NODE_WS_PID > /dev/null; then
  echo -e "${GREEN}✓ Node.js message bus running (PID: $NODE_WS_PID)${NC}"
else
  echo -e "${RED}✗ Failed to start Node.js message bus${NC}"
  exit 1
fi

# Run k6 load test on Node.js
if command -v k6 > /dev/null 2>&1; then
  echo -e "${BLUE}Running k6 load test on Node.js...${NC}"

  if [ "$QUICK_MODE" = true ]; then
    k6 run -e AGENTS=50 -e DURATION=1m load-test.js > "$RESULTS_DIR/k6-node.log" 2>&1
  else
    k6 run -e AGENTS=100 -e DURATION=2m load-test.js > "$RESULTS_DIR/k6-node.log" 2>&1
  fi

  echo -e "${GREEN}✓ k6 test completed${NC}"

  # Fetch metrics
  curl -s http://localhost:8080/metrics > "$RESULTS_DIR/node-ws-metrics.json"
  echo -e "${GREEN}✓ Node.js metrics saved${NC}"
else
  echo -e "${YELLOW}○ Skipping k6 test (k6 not installed)${NC}"
fi

# Stop Node.js server
kill $NODE_WS_PID 2>/dev/null || true
sleep 1
echo ""

# Rust message bus (if not skipped)
if [ "$SKIP_RUST" = false ]; then
  echo -e "${BLUE}Building Rust message bus...${NC}"
  cd rust-message-bus
  cargo build --release --quiet
  cd ..
  echo -e "${GREEN}✓ Rust message bus built${NC}"

  echo -e "${BLUE}Starting Rust message bus...${NC}"
  ./rust-message-bus/target/release/rust-message-bus --port 8081 > "$RESULTS_DIR/rust-ws-server.log" 2>&1 &
  RUST_WS_PID=$!
  sleep 2

  if ps -p $RUST_WS_PID > /dev/null; then
    echo -e "${GREEN}✓ Rust message bus running (PID: $RUST_WS_PID)${NC}"

    # Run k6 load test on Rust
    if command -v k6 > /dev/null 2>&1; then
      echo -e "${BLUE}Running k6 load test on Rust...${NC}"

      if [ "$QUICK_MODE" = true ]; then
        k6 run -e TARGET=ws://localhost:8081/ws -e AGENTS=50 -e DURATION=1m load-test.js > "$RESULTS_DIR/k6-rust.log" 2>&1
      else
        k6 run -e TARGET=ws://localhost:8081/ws -e AGENTS=100 -e DURATION=2m load-test.js > "$RESULTS_DIR/k6-rust.log" 2>&1
      fi

      echo -e "${GREEN}✓ k6 test completed${NC}"

      # Fetch metrics
      curl -s http://localhost:8081/metrics > "$RESULTS_DIR/rust-ws-metrics.json"
      echo -e "${GREEN}✓ Rust metrics saved${NC}"
    fi

    # Stop Rust server
    kill $RUST_WS_PID 2>/dev/null || true
  else
    echo -e "${RED}✗ Failed to start Rust message bus${NC}"
  fi

  echo ""
fi

###############################################################################
# Test 3: Spawn Pattern Comparison
###############################################################################
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 3: Spawn Pattern Comparison${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$QUICK_MODE" = true ]; then
  bash spawn-cost.sh --iterations 50 --agents 5
else
  bash spawn-cost.sh --iterations 100 --agents 10
fi

echo ""

###############################################################################
# Test 4: AI SDK Streaming Performance
###############################################################################
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 4: AI SDK Streaming${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

if [ "$USE_MOCK" = true ] || [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo -e "${BLUE}Running with MOCK AI responses${NC}"
  if [ "$QUICK_MODE" = true ]; then
    node ai-streaming.js --mock --concurrent 5 --iterations 2
  else
    node ai-streaming.js --mock --concurrent 10 --iterations 5
  fi
else
  echo -e "${BLUE}Running with LIVE AI API${NC}"
  if [ "$QUICK_MODE" = true ]; then
    node ai-streaming.js --concurrent 5 --iterations 2
  else
    node ai-streaming.js --concurrent 10 --iterations 5
  fi
fi

echo ""

###############################################################################
# Test 5: Agent-to-Agent Messaging
###############################################################################
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Test 5: Agent-to-Agent Messaging${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Start Node.js message bus again for agent messaging test
echo -e "${BLUE}Starting Node.js message bus...${NC}"
node node-message-bus.js --port 8080 > "$RESULTS_DIR/agent-msg-server.log" 2>&1 &
AGENT_MSG_PID=$!
sleep 2

if ps -p $AGENT_MSG_PID > /dev/null; then
  echo -e "${GREEN}✓ Message bus running${NC}"

  if [ "$QUICK_MODE" = true ]; then
    node agent-messaging.js --agents 5 --conversations 3
  else
    node agent-messaging.js --agents 10 --conversations 5
  fi

  # Stop server
  kill $AGENT_MSG_PID 2>/dev/null || true
else
  echo -e "${RED}✗ Failed to start message bus for agent messaging test${NC}"
fi

echo ""

###############################################################################
# Generate Final Report
###############################################################################
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Final Report${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Generate valid JSON using jq to merge result files
jq -n \
  --arg timestamp "$(date -Iseconds)" \
  --arg mode "$([ "$QUICK_MODE" = true ] && echo "quick" || echo "full")" \
  --argjson rust_included "$([ "$SKIP_RUST" = false ] && echo "true" || echo "false")" \
  --argjson docker_included "$([ "$SKIP_DOCKER" = false ] && echo "true" || echo "false")" \
  --argjson node_ws "$([ -f "$RESULTS_DIR/node-ws-metrics.json" ] && cat "$RESULTS_DIR/node-ws-metrics.json" || echo "{}")" \
  --argjson rust_ws "$([ -f "$RESULTS_DIR/rust-ws-metrics.json" ] && cat "$RESULTS_DIR/rust-ws-metrics.json" || echo "{}")" \
  --argjson spawn_comparison "$([ -f "$RESULTS_DIR/spawn-comparison.json" ] && cat "$RESULTS_DIR/spawn-comparison.json" || echo "{}")" \
  --argjson ai_streaming "$([ -f "$RESULTS_DIR/ai-streaming.json" ] && cat "$RESULTS_DIR/ai-streaming.json" || echo "{}")" \
  --argjson agent_messaging "$([ -f "$RESULTS_DIR/agent-messaging.json" ] && cat "$RESULTS_DIR/agent-messaging.json" || echo "{}")" \
  '{
    timestamp: $timestamp,
    mode: $mode,
    tests_run: {
      websocket_comparison: true,
      spawn_patterns: true,
      ai_streaming: true,
      agent_messaging: true,
      rust_included: $rust_included,
      docker_included: $docker_included
    },
    results: {
      node_ws: $node_ws,
      rust_ws: $rust_ws,
      spawn_comparison: $spawn_comparison,
      ai_streaming: $ai_streaming,
      agent_messaging: $agent_messaging
    }
  }' > "$RESULTS_DIR/final-report.json"

echo -e "${GREEN}✓ Final report generated: $RESULTS_DIR/final-report.json${NC}"
echo ""

# Display summary
echo "SUMMARY:"
echo "--------"

# Initialize memory variables to prevent unset variable errors (set -u)
NODE_MEM=0
RUST_MEM=0

if [ -f "$RESULTS_DIR/node-ws-metrics.json" ]; then
  NODE_MEM=$(jq -r '.memory_mb.heapUsed // 0' "$RESULTS_DIR/node-ws-metrics.json")
  NODE_TPS=$(jq -r '.throughput_msg_per_sec // 0' "$RESULTS_DIR/node-ws-metrics.json")
  echo "Node.js WebSocket: ${NODE_MEM}MB memory, ${NODE_TPS} msg/sec"
fi

if [ -f "$RESULTS_DIR/rust-ws-metrics.json" ]; then
  RUST_MEM=$(jq -r '.memory_mb.rss // 0' "$RESULTS_DIR/rust-ws-metrics.json")
  RUST_TPS=$(jq -r '.throughput_msg_per_sec // 0' "$RESULTS_DIR/rust-ws-metrics.json")
  echo "Rust WebSocket: ${RUST_MEM}MB memory, ${RUST_TPS} msg/sec"

  if [ "$NODE_MEM" != "0" ] && [ "$RUST_MEM" != "0" ]; then
    MEM_SAVINGS=$(echo "scale=1; (1 - $RUST_MEM / $NODE_MEM) * 100" | bc)
    echo "  → Memory savings: ${MEM_SAVINGS}%"
  fi
fi

if [ -f "$RESULTS_DIR/agent-messaging.json" ]; then
  SUCCESS_RATE=$(jq -r '.summary.success_rate // 0' "$RESULTS_DIR/agent-messaging.json")
  P95_LATENCY=$(jq -r '.summary.latency_p95_ms // 0' "$RESULTS_DIR/agent-messaging.json")
  echo "Agent Messaging: ${SUCCESS_RATE}% success rate, ${P95_LATENCY}ms P95 latency"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All tests complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "View detailed results in: $RESULTS_DIR/"
echo ""
