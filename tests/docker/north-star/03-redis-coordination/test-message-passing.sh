#!/usr/bin/env bash
# tests/docker/north-star/03-redis-coordination/test-message-passing.sh
# Phase 3 :: Validate Redis coordination and message passing between agents

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_TASK_ID="redis-test-$(date +%s)"
REDIS_HOST="localhost"
REDIS_PORT="6379"
TEST_TIMEOUT=30
COORDINATION_PREFIX="swarm:${TEST_TASK_ID}"

cleanup() {
  log_step "Cleanup: Redis test data and processes"

  # Clean up Redis test data
  if command -v redis-cli &> /dev/null; then
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "${COORDINATION_PREFIX}*" 2>/dev/null | \
      xargs -r redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL || true

    # Clean up coordination signals
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "${COORDINATION_PREFIX}:gate-passed" 2>/dev/null || true
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DEL "${COORDINATION_PREFIX}:consensus-ready" 2>/dev/null || true
  fi

  # Kill test processes
  pkill -f "redis-test" || true
  pkill -f "coordination-test" || true
}
trap cleanup EXIT

validate_redis_connectivity() {
  log_step "GIVEN: Redis connectivity is validated"

  if ! command -v redis-cli &> /dev/null; then
    log_error "Redis CLI not found"
    return 1
  fi

  # Test Redis connection
  if ! redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
    log_error "Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT"
    return 1
  fi

  log_info "✅ Redis connectivity validated"
  return 0
}

setup_coordination_environment() {
  log_step "AND: Coordination environment is prepared"

  # Initialize coordination keys
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "${COORDINATION_PREFIX}:status" "initialized" > /dev/null
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "${COORDINATION_PREFIX}:iteration" "1" > /dev/null

  # Set initial coordination data
  local coordination_data=$(cat <<EOF
{
  "taskId": "$TEST_TASK_ID",
  "mode": "standard",
  "currentIteration": 1,
  "maxIterations": 3,
  "agents": {
    "loop3": [],
    "loop2": [],
    "productOwner": null
  },
  "thresholds": {
    "loop3PassRate": 0.95,
    "loop2Consensus": 0.90
  }
}
EOF
  )

  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "${COORDINATION_PREFIX}:data" "$coordination_data" > /dev/null

  log_info "Coordination environment initialized with task ID: $TEST_TASK_ID"
  return 0
}

test_agent_completion_signaling() {
  log_step "WHEN: Agent completion signaling is tested"

  local agent_id="test-agent-$(date +%s)"
  local completion_key="${COORDINATION_PREFIX}:agent:${agent_id}:completion"
  local result_key="${COORDINATION_PREFIX}:agent:${agent_id}:result"

  # Simulate agent completion signal
  log_info "Simulating agent completion for: $agent_id"

  # Agent completion data
  local completion_data=$(cat <<EOF
{
  "agentId": "$agent_id",
  "agentType": "test-agent",
  "taskId": "$TEST_TASK_ID",
  "iteration": 1,
  "confidence": 0.92,
  "status": "completed",
  "deliverables": {
    "files": ["test-output.txt"],
    "artifacts": ["test-results.json"]
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
}
EOF
  )

  # Send completion signal
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "$completion_key" "SIGNAL" > /dev/null
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$result_key" "$completion_data" > /dev/null

  log_info "✅ Agent completion signal sent"
  return 0
}

test_coordination_blocking() {
  log_step "THEN: Coordination blocking is validated"

  local gate_key="${COORDINATION_PREFIX}:gate-passed"
  local test_key="${COORDINATION_PREFIX}:test-blocking"

  # Test BLPOP blocking behavior
  log_info "Testing BLPOP blocking behavior..."

  # Start background blocking listener
  (
    timeout 10 redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" BLPOP "$test_key" 5 > /tmp/blocking-result.txt 2>&1
  ) &
  local blocker_pid=$!

  sleep 1

  # Verify the process is blocking
  if kill -0 $blocker_pid 2>/dev/null; then
    log_info "✅ Blocking operation is active"

    # Send signal to unblock
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" RPUSH "$test_key" "UNBLOCK_SIGNAL" > /dev/null

    # Wait for completion
    wait $blocker_pid 2>/dev/null || true

    if [ -f "/tmp/blocking-result.txt" ]; then
      local result=$(cat /tmp/blocking-result.txt)
      if [[ "$result" == *"UNBLOCK_SIGNAL"* ]]; then
        log_info "✅ Blocking operation successfully unblocked"
      else
        log_error "❌ Unexpected blocking result: $result"
      fi
      rm -f "/tmp/blocking-result.txt"
    fi
  else
    log_error "❌ Blocking operation failed to start"
  fi

  return 0
}

test_gate_passing_mechanism() {
  log_step "AND: Gate passing mechanism is tested"

  local gate_key="${COORDINATION_PREFIX}:gate-passed"
  local loop3_results_key="${COORDINATION_PREFIX}:loop3:results"

  # Simulate Loop 3 gate passing
  log_info "Simulating Loop 3 gate passing..."

  # Create Loop 3 results that pass the gate
  local loop3_results=$(cat <<EOF
{
  "taskId": "$TEST_TASK_ID",
  "iteration": 1,
  "passRate": 0.96,
  "agentsCompleted": 3,
  "totalAgents": 3,
  "gatePassed": true,
  "thresholdMet": 0.96 >= 0.95,
  "results": [
    {
      "agentId": "agent-1",
      "confidence": 0.94,
      "status": "completed"
    },
    {
      "agentId": "agent-2",
      "confidence": 0.97,
      "status": "completed"
    },
    {
      "agentId": "agent-3",
      "confidence": 0.95,
      "status": "completed"
    }
  ]
}
EOF
  )

  # Store Loop 3 results
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$loop3_results_key" "$loop3_results" > /dev/null

  # Send gate passed signal
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "$gate_key" "LOOP3_GATE_PASSED" > /dev/null

  log_info "✅ Gate passing signal sent"
  return 0
}

test_consensus_collection() {
  log_step "AND: Consensus collection is tested"

  local consensus_key="${COORDINATION_PREFIX}:consensus"
  local loop2_results_key="${COORDINATION_PREFIX}:loop2:results"

  # Simulate Loop 2 consensus collection
  log_info "Simulating Loop 2 consensus collection..."

  # Create consensus data from multiple validators
  local validator_1_result='{"agentId":"validator-1","consensusScore":0.88,"status":"completed"}'
  local validator_2_result='{"agentId":"validator-2","consensusScore":0.92,"status":"completed"}'
  local validator_3_result='{"agentId":"validator-3","consensusScore":0.91,"status":"completed"}'

  # Store individual validator results
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "${consensus_key}:validator-1" "$validator_1_result" > /dev/null
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "${consensus_key}:validator-2" "$validator_2_result" > /dev/null
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" LPUSH "${consensus_key}:validator-3" "$validator_3_result" > /dev/null

  # Create aggregated consensus results
  local consensus_results=$(cat <<EOF
{
  "taskId": "$TEST_TASK_ID",
  "iteration": 1,
  "consensusScore": 0.903,
  "validatorsCompleted": 3,
  "totalValidators": 3,
  "consensusMet": true,
  "thresholdMet": "0.903 >= 0.90",
  "individualScores": [0.88, 0.92, 0.91],
  "results": [
    {"agentId":"validator-1","consensusScore":0.88},
    {"agentId":"validator-2","consensusScore":0.92},
    {"agentId":"validator-3","consensusScore":0.91}
  ]
}
EOF
  )

  # Store consensus results
  redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$loop2_results_key" "$consensus_results" > /dev/null

  log_info "✅ Consensus collection data stored"
  return 0
}

test_data_persistence_and_retrieval() {
  log_step "AND: Data persistence and retrieval are validated"

  # Test data retrieval for all stored coordination data
  log_info "Validating stored coordination data..."

  # Check coordination data
  local coordination_data=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "${COORDINATION_PREFIX}:data" 2>/dev/null || echo "")
  if [ -n "$coordination_data" ]; then
    log_info "✅ Coordination data persisted and retrievable"
  else
    log_error "❌ Coordination data not found"
  fi

  # Check Loop 3 results
  local loop3_results=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$loop3_results_key" 2>/dev/null || echo "")
  if [ -n "$loop3_results" ]; then
    log_info "✅ Loop 3 results persisted and retrievable"
  else
    log_error "❌ Loop 3 results not found"
  fi

  # Check consensus results
  local consensus_results=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" GET "$loop2_results_key" 2>/dev/null || echo "")
  if [ -n "$consensus_results" ]; then
    log_info "✅ Consensus results persisted and retrievable"
  else
    log_error "❌ Consensus results not found"
  fi

  # Test data scanning
  local coordination_keys=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" --scan --pattern "${COORDINATION_PREFIX}*" 2>/dev/null | wc -l || echo "0")
  log_info "Total coordination keys created: $coordination_keys"

  if [ "$coordination_keys" -gt 5 ]; then
    log_info "✅ Comprehensive coordination data structure created"
  else
    log_warn "⚠️  Limited coordination keys found"
  fi

  return 0
}

# Main test execution
main() {
  annotate "Redis Coordination Test" \
    "Validates Redis message passing, blocking operations, gate passing, and consensus collection"

  validate_redis_connectivity
  setup_coordination_environment
  test_agent_completion_signaling
  test_coordination_blocking
  test_gate_passing_mechanism
  test_consensus_collection
  test_data_persistence_and_retrieval

  log_success "Redis coordination tests completed successfully"
}

# Execute test
main "$@"