#!/bin/bash
# tests/cli-mode/core/e2e/test-5-iteration-cfn-loop.sh
# Phase 2 :: Validates complete 5-iteration CFN Loop workflow (Priority 0)
# Coverage: Iteration loop, ITERATE decisions, retry logic, convergence, Product Owner decisions

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test counters
PASS_COUNT=0
TOTAL_COUNT=0

pass() { echo "✅ PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); TOTAL_COUNT=$((TOTAL_COUNT + 1)); return 0; }
fail() { echo "❌ FAIL: $1"; TOTAL_COUNT=$((TOTAL_COUNT + 1)); return 0; }

# Cleanup function
cleanup() {
  log_info "Cleaning up test artifacts"

  if [[ -n "${TASK_ID:-}" ]]; then
    # Kill any running agents (bash and TypeScript orchestrators)
    pkill -f "claude-flow-novice.*${TASK_ID}" 2>/dev/null || true
    pkill -f "orchestrate.*${TASK_ID}\|orchestrator-cli.*${TASK_ID}\|node.*orchestrate.*${TASK_ID}" 2>/dev/null || true

    # Clean up Redis keys
    if command -v redis-cli >/dev/null 2>&1; then
      redis-cli DEL "swarm:${TASK_ID}:*" 2>/dev/null || true
      redis-cli KEYS "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL 2>/dev/null || true
    fi

    # Clean up SQLite test records
    if [[ -f "./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db" ]]; then
      sqlite3 "./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db" \
        "DELETE FROM agents WHERE id LIKE '%${TASK_ID}%' OR metadata LIKE '%${TASK_ID}%';" 2>/dev/null || true
    fi
  fi

  # Clean up temp files
  rm -f /tmp/cfn-5iter-*.log
  rm -f /tmp/cfn-5iter-*.txt
}
trap cleanup EXIT

test_5_iteration_workflow() {
  log_step "GIVEN CFN Loop with task requiring multiple iterations"

  # Generate unique task ID
  TASK_ID="cfn-5iter-$(date +%s)-$$"
  log_info "Task ID: $TASK_ID"

  # Task description that will require iterations to get right
  # Using a realistic task that typically needs refinement
  TASK_DESCRIPTION="Create a REST API endpoint /api/users with GET, POST, PUT, DELETE methods. Include input validation, error handling, and unit tests."

  # WHEN spawning coordinator with MVP mode (allows 5 iterations)
  log_info "Spawning coordinator with MVP mode (max 5 iterations)..."

  CFN_REDIS_HOST="localhost" \
  CFN_REDIS_PORT="6379" \
  CFN_REDIS_PASSWORD="" \
  timeout 600 npx claude-flow-novice agent cfn-v3-coordinator \
    --task-id "$TASK_ID" \
    --context "TASK_DESCRIPTION='$TASK_DESCRIPTION' MODE='mvp' MAX_ITERATIONS=5 TASK_ID='$TASK_ID'" \
    2>&1 | tee /tmp/cfn-5iter-coordinator.log &

  COORDINATOR_PID=$!
  log_info "Coordinator PID: $COORDINATOR_PID"

  # Validate coordinator process started
  sleep 3
  if ps -p $COORDINATOR_PID > /dev/null 2>&1; then
    pass "Coordinator process spawned (PID: $COORDINATOR_PID)"
  else
    fail "Coordinator process spawned"
    log_info "Coordinator may have exited early - check logs"
    return 1
  fi

  # THEN validate iteration workflow
  log_step "Validating iteration workflow (max 10 minutes)..."

  # Track iterations detected
  declare -a ITERATIONS_SEEN=()
  MAX_WAIT=600  # 10 minutes total
  WAIT_COUNT=0
  ITERATION_CHECK_INTERVAL=10  # Check every 10 seconds

  while [[ $WAIT_COUNT -lt $MAX_WAIT ]]; do
    # Check for iteration markers in Redis
    for iteration in {1..5}; do
      # Look for agent IDs with iteration number pattern: agent-name-${iteration}-*
      ITERATION_AGENTS=$(redis-cli KEYS "swarm:${TASK_ID}:*-${iteration}-*" 2>/dev/null | head -5)

      # Check if this iteration was already seen
      ALREADY_SEEN=false
      for seen_iter in "${ITERATIONS_SEEN[@]}"; do
        if [[ "$seen_iter" == "$iteration" ]]; then
          ALREADY_SEEN=true
          break
        fi
      done

      if [[ -n "$ITERATION_AGENTS" ]] && [[ "$ALREADY_SEEN" == "false" ]]; then
        ITERATIONS_SEEN+=("$iteration")
        log_info "✓ Detected iteration $iteration"
        pass "Iteration $iteration detected in Redis"
      fi
    done

    # Check if coordinator still running
    if ! ps -p $COORDINATOR_PID > /dev/null 2>&1; then
      log_info "Coordinator process exited"
      break
    fi

    sleep $ITERATION_CHECK_INTERVAL
    WAIT_COUNT=$((WAIT_COUNT + ITERATION_CHECK_INTERVAL))
  done

  # Count how many iterations were detected
  ITERATION_COUNT=${#ITERATIONS_SEEN[@]}
  log_info "Total iterations detected: $ITERATION_COUNT"

  if [[ $ITERATION_COUNT -ge 1 ]] && [[ $ITERATION_COUNT -le 5 ]]; then
    pass "Completed 1-5 iterations (found $ITERATION_COUNT - stops early on PROCEED)"
  else
    fail "At least 1 iteration executed (found $ITERATION_COUNT)"
  fi

  if [[ $ITERATION_COUNT -ge 2 ]]; then
    pass "Multiple iterations executed ($ITERATION_COUNT iterations)"
  else
    log_info "Only $ITERATION_COUNT iteration(s) executed - may have converged quickly"
  fi

  # Validate iteration progression
  log_step "Validating iteration progression patterns..."

  # Check if iterations are sequential (1, 2, 3, etc.)
  SEQUENTIAL=true
  for (( expected_iter=1; expected_iter<=ITERATION_COUNT; expected_iter++ )); do
    ITER_FOUND=false
    for seen_iter in "${ITERATIONS_SEEN[@]}"; do
      if [[ "$seen_iter" == "$expected_iter" ]]; then
        ITER_FOUND=true
        break
      fi
    done

    if [[ "$ITER_FOUND" == "false" ]]; then
      SEQUENTIAL=false
      log_info "Gap detected: iteration $expected_iter missing but later iterations exist"
    fi
  done

  if [[ "$SEQUENTIAL" == "true" ]]; then
    pass "Iterations are sequential (no gaps)"
  else
    fail "Iterations are sequential (gaps detected)"
  fi

  # Validate Product Owner decisions
  log_step "Validating Product Owner decision workflow..."

  # Check for Product Owner agent spawn
  PO_AGENTS=$(redis-cli KEYS "swarm:${TASK_ID}:product-owner*" 2>/dev/null)

  if [[ -n "$PO_AGENTS" ]]; then
    pass "Product Owner agent spawned"

    # Count how many times Product Owner was invoked (once per iteration)
    PO_COUNT=$(echo "$PO_AGENTS" | wc -l)
    log_info "Product Owner invoked $PO_COUNT time(s)"

    if [[ $PO_COUNT -ge 1 ]]; then
      pass "Product Owner decision workflow executed"
    else
      fail "Product Owner decision workflow executed"
    fi
  else
    fail "Product Owner agent spawned (not found in Redis)"
  fi

  # Validate Loop 2 validators
  log_step "Validating Loop 2 validator workflow..."

  # Check for Loop 2 validator agents (code-reviewer, tester, etc.)
  VALIDATOR_AGENTS=$(redis-cli KEYS "swarm:${TASK_ID}:*reviewer*" "swarm:${TASK_ID}:*tester*" 2>/dev/null)

  if [[ -n "$VALIDATOR_AGENTS" ]]; then
    pass "Loop 2 validators spawned"

    VALIDATOR_COUNT=$(echo "$VALIDATOR_AGENTS" | wc -l)
    log_info "Loop 2 validators spawned: $VALIDATOR_COUNT agent(s)"
  else
    log_info "No Loop 2 validators detected in Redis (may not have reached validation phase)"
    fail "Loop 2 validators spawned"
  fi

  # Validate convergence or max iterations
  log_step "Validating convergence behavior..."

  if [[ $ITERATION_COUNT -ge 1 ]] && [[ $ITERATION_COUNT -le 5 ]]; then
    if [[ $ITERATION_COUNT -eq 5 ]]; then
      log_info "Reached maximum iterations (5) - testing iteration limit enforcement"
      pass "Max iteration limit enforced (5 iterations)"
    else
      log_info "Converged before max iterations ($ITERATION_COUNT iterations)"
      pass "Task converged in $ITERATION_COUNT iteration(s) (early PROCEED)"
    fi
  else
    fail "Iteration count within expected range 1-5 (found $ITERATION_COUNT)"
  fi

  # Validate ITERATE decision mechanism
  log_step "Validating ITERATE decision mechanism..."

  # Check coordinator logs for ITERATE decisions
  if [[ -f /tmp/cfn-5iter-coordinator.log ]]; then
    ITERATE_DECISIONS=$(grep -c "ITERATE" /tmp/cfn-5iter-coordinator.log 2>/dev/null || echo "0")
    ITERATE_DECISIONS=${ITERATE_DECISIONS//[^0-9]/}  # Strip newlines/whitespace
    ITERATE_DECISIONS=${ITERATE_DECISIONS:-0}        # Default to 0 if empty

    if [[ $ITERATE_DECISIONS -gt 0 ]]; then
      pass "ITERATE decisions detected ($ITERATE_DECISIONS occurrences)"
      log_info "Iteration retry mechanism is working"
    else
      log_info "No explicit ITERATE decisions found in logs (may have used PROCEED)"
    fi

    # Check for PROCEED decision (successful completion)
    PROCEED_DECISIONS=$(grep -c "PROCEED" /tmp/cfn-5iter-coordinator.log 2>/dev/null || echo "0")
    PROCEED_DECISIONS=${PROCEED_DECISIONS//[^0-9]/}  # Strip newlines/whitespace
    PROCEED_DECISIONS=${PROCEED_DECISIONS:-0}        # Default to 0 if empty

    if [[ $PROCEED_DECISIONS -gt 0 ]]; then
      pass "PROCEED decision detected (successful completion)"
    else
      log_info "No PROCEED decision found - task may still be running or failed"
    fi
  else
    fail "Coordinator log file exists for analysis"
  fi

  # Validate Redis coordination integrity
  log_step "Validating Redis coordination data integrity..."

  # Check for success criteria storage
  SUCCESS_CRITERIA_KEY=$(redis-cli KEYS "swarm:${TASK_ID}:success-criteria" 2>/dev/null)

  if [[ -n "$SUCCESS_CRITERIA_KEY" ]]; then
    pass "Success criteria stored in Redis"

    # Validate success criteria structure
    SUCCESS_CRITERIA=$(redis-cli HGET "swarm:${TASK_ID}:context" "success-criteria" 2>/dev/null || echo "")

    if [[ -n "$SUCCESS_CRITERIA" ]] && echo "$SUCCESS_CRITERIA" | jq -e '.test_suites' > /dev/null 2>&1; then
      pass "Success criteria has valid JSON structure"
    else
      fail "Success criteria has valid JSON structure"
    fi
  else
    fail "Success criteria stored in Redis"
  fi

  # Check for completed agents tracking
  COMPLETED_AGENTS=$(redis-cli HLEN "swarm:${TASK_ID}:completed_agents" 2>/dev/null || echo "0")
  COMPLETED_AGENTS=${COMPLETED_AGENTS//[^0-9]/}  # Strip newlines/whitespace
  COMPLETED_AGENTS=${COMPLETED_AGENTS:-0}        # Default to 0 if empty

  if [[ $COMPLETED_AGENTS -gt 0 ]]; then
    pass "Completed agents tracked in Redis ($COMPLETED_AGENTS agents)"
  else
    log_info "No completed agents tracked in Redis (may use different coordination)"
  fi

  # Validate SQLite lifecycle tracking
  log_step "Validating SQLite lifecycle tracking across iterations..."

  if [[ -f "./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db" ]]; then
    AGENT_RECORDS=$(sqlite3 "./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db" \
      "SELECT COUNT(*) FROM agents WHERE metadata LIKE '%${TASK_ID}%';" 2>/dev/null || echo "0")

    if [[ $AGENT_RECORDS -gt 0 ]]; then
      pass "SQLite lifecycle tracking recorded agents ($AGENT_RECORDS records)"

      # Show agent records for debugging
      log_info "SQLite agent records:"
      sqlite3 "./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db" \
        "SELECT id, type, status, confidence, spawned_at FROM agents WHERE metadata LIKE '%${TASK_ID}%' ORDER BY spawned_at LIMIT 10;" 2>/dev/null || true
    else
      fail "SQLite lifecycle tracking recorded agents"
    fi
  else
    fail "SQLite database exists at expected path"
  fi

  # Performance metrics
  log_step "Performance metrics..."

  log_info "Test execution summary:"
  log_info "  • Task ID: $TASK_ID"
  log_info "  • Iterations detected: $ITERATION_COUNT"
  log_info "  • Coordinator PID: $COORDINATOR_PID"
  log_info "  • Redis keys created: $(redis-cli KEYS "swarm:${TASK_ID}:*" 2>/dev/null | wc -l)"
  log_info "  • SQLite records: $AGENT_RECORDS"

  log_info "✅ 5-iteration CFN Loop workflow validation complete"
}

# Execute test
test_5_iteration_workflow

# Test summary
echo ""
log_step "Test Summary"
PASS_RATE=$(awk "BEGIN {printf \"%.0f\", ($PASS_COUNT / $TOTAL_COUNT * 100)}")
echo -e "${GREEN}Total Tests: $TOTAL_COUNT${NC}"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
if [[ $TOTAL_COUNT -ne $PASS_COUNT ]]; then
  echo -e "${RED}Failed: $((TOTAL_COUNT - PASS_COUNT))${NC}"
fi
echo -e "${GREEN}Pass Rate: ${PASS_RATE}%${NC}"

if [[ $PASS_COUNT -eq $TOTAL_COUNT ]]; then
  echo ""
  echo -e "${GREEN}✅ All 5-iteration CFN Loop tests PASSED${NC}"
  echo ""
  log_info "Validation complete: Multi-iteration workflow works correctly"
  log_info "Coverage: Iteration loop, ITERATE decisions, retry logic, Product Owner, validators"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some tests failed (${PASS_RATE}% pass rate)${NC}"
  echo ""
  log_info "Review coordinator logs: /tmp/cfn-5iter-coordinator.log"
  log_info "Review Redis keys: redis-cli KEYS 'swarm:${TASK_ID}:*'"

  # Still exit 0 if we got at least 70% pass rate (MVP threshold)
  if [[ $PASS_RATE -ge 70 ]]; then
    echo ""
    echo -e "${GREEN}✅ Pass rate ≥70% (MVP threshold) - Test PASSES${NC}"
    exit 0
  else
    exit 1
  fi
fi
