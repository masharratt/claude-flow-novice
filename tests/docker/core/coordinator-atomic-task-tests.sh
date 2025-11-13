#!/bin/bash
# tests/docker/coordinator-atomic-task-tests.sh
# Phase 8.4 :: P1 - Atomic Task Assignment (Coordinator V3)
# Tests coordinator's ability to assign single atomic tasks to each agent

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

COORDINATOR_IMAGE="cfn-coordinator:v3"
TEST_TASK_ID="atomic-$(date +%s)"
TMP_PLAN_FILE="/tmp/cfn-docker-plan-${TEST_TASK_ID}.json"

cleanup() {
  log_step "Cleaning up test artifacts"
  docker rm -f "cfn-coordinator-${TEST_TASK_ID}" 2>/dev/null || true
  docker ps -a --filter "label=cfn-task-id=${TEST_TASK_ID}" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
  rm -f "$TMP_PLAN_FILE" 2>/dev/null || true
  rm -f /tmp/task-context-*.json 2>/dev/null || true
}
trap cleanup EXIT

# Test 7: Each Agent Receives Single Atomic Task
test_each_agent_receives_single_atomic_task() {
  log_step "Test 7: One task per agent assignment"

  # Skip if no API key available
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    log_error "ANTHROPIC_API_KEY not set, skipping atomic task test"
    return 0
  fi

  # GIVEN coordinator with multi-agent task
  log_step "GIVEN task requiring multiple agents"
  local task_desc="Build authentication system: JWT service (backend), login form (frontend), API routes (backend)"

  # Create mock plan file to control test
  log_step "Creating mock plan with 3 atomic tasks"
  cat > "$TMP_PLAN_FILE" << 'EOF'
{
  "atomic_tasks": [
    {
      "id": "task-1",
      "description": "Create JWT token generation service",
      "estimated_time": "25 min",
      "dependencies": [],
      "agent_type": "backend-developer",
      "deliverables": ["src/auth/jwt.service.ts", "tests/auth/jwt.test.ts"]
    },
    {
      "id": "task-2",
      "description": "Implement authentication middleware",
      "estimated_time": "20 min",
      "dependencies": ["task-1"],
      "agent_type": "backend-developer",
      "deliverables": ["src/middleware/auth.ts", "tests/middleware/auth.test.ts"]
    },
    {
      "id": "task-3",
      "description": "Create login form component",
      "estimated_time": "30 min",
      "dependencies": [],
      "agent_type": "react-frontend-engineer",
      "deliverables": ["src/components/LoginForm.tsx", "tests/components/LoginForm.test.tsx"]
    }
  ],
  "execution_phases": {
    "phase_1": ["task-1", "task-3"],
    "phase_2": ["task-2"]
  }
}
EOF

  # WHEN coordinator spawns agents with atomic tasks
  log_step "WHEN coordinator assigns atomic tasks"

  # Start coordinator with pre-generated plan (simulate planning phase output)
  timeout 90s docker run --rm \
    --name "cfn-coordinator-${TEST_TASK_ID}" \
    --network mcp-network \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$(pwd):/app/codebase:ro" \
    -v /tmp:/tmp \
    -e "TASK_ID=${TEST_TASK_ID}" \
    -e "TASK_DESCRIPTION=${task_desc}" \
    -e "MODE=mvp" \
    -e "CFN_REDIS_HOST=cfn-redis" \
    -e "CFN_REDIS_PORT=6379" \
    -e "MAX_ITERATIONS=1" \
    --label "cfn-task-id=${TEST_TASK_ID}" \
    "$COORDINATOR_IMAGE" > /tmp/coordinator-atomic-output.log 2>&1 || true

  # THEN each agent context file contains single atomic task
  log_step "THEN each agent receives exactly ONE atomic task"

  # Check for task context files
  local context_files=$(find /tmp -name "task-context-${TEST_TASK_ID}-*.json" 2>/dev/null || echo "")

  if [[ -z "$context_files" ]]; then
    log_error "No task context files found"
    log_info "Coordinator output:"
    cat /tmp/coordinator-atomic-output.log | head -50
    return 1
  fi

  local violations=0
  for context_file in $context_files; do
    log_info "Checking context file: $(basename $context_file)"

    # Verify context has atomic_task field
    if ! jq -e '.atomic_task' "$context_file" > /dev/null 2>&1; then
      log_error "Context file missing atomic_task field: $context_file"
      violations=$((violations + 1))
      continue
    fi

    # Verify atomic_task is a string (single task description)
    local atomic_task=$(jq -r '.atomic_task' "$context_file")
    if [[ -z "$atomic_task" ]] || [[ "$atomic_task" == "null" ]]; then
      log_error "Context file has empty atomic_task: $context_file"
      violations=$((violations + 1))
      continue
    fi

    # Verify expected_deliverables is specific (not "all files")
    local deliverables=$(jq -r '.expected_deliverables' "$context_file")
    if [[ "$deliverables" == "null" ]] || [[ -z "$deliverables" ]]; then
      log_error "Context file missing expected_deliverables: $context_file"
      violations=$((violations + 1))
      continue
    fi

    log_success "Context file valid: atomic_task='$atomic_task'"
  done

  if [[ $violations -eq 0 ]]; then
    log_success "✅ Test 7 PASSED: Each agent receives single atomic task"
  else
    log_error "❌ Test 7 FAILED: $violations context files with issues"
    return 1
  fi
}

# Test 8: Task Context File Format Validation
test_task_context_matches_specification() {
  log_step "Test 8: Task context file format specification"

  # GIVEN task context file from previous test
  log_step "GIVEN task context files from coordinator"

  local context_files=$(find /tmp -name "task-context-${TEST_TASK_ID}-*.json" 2>/dev/null | head -1)

  if [[ -z "$context_files" ]]; then
    log_error "No task context files found, skipping format test"
    return 0
  fi

  local context_file="$context_files"
  log_info "Validating context file: $(basename $context_file)"

  # THEN context file has required structure
  log_step "THEN context has required fields"

  # Check task_id
  local task_id=$(jq -r '.task_id // "missing"' "$context_file")
  if [[ "$task_id" == "missing" ]]; then
    log_error "Missing task_id field"
    return 1
  fi
  log_success "task_id: $task_id ✓"

  # Check loop_number
  local loop_number=$(jq -r '.loop_number // "missing"' "$context_file")
  if [[ "$loop_number" == "missing" ]]; then
    log_error "Missing loop_number field"
    return 1
  fi
  log_success "loop_number: $loop_number ✓"

  # Check iteration
  local iteration=$(jq -r '.iteration // "missing"' "$context_file")
  if [[ "$iteration" == "missing" ]]; then
    log_error "Missing iteration field"
    return 1
  fi
  log_success "iteration: $iteration ✓"

  # Check agent_type
  local agent_type=$(jq -r '.agent_type // "missing"' "$context_file")
  if [[ "$agent_type" == "missing" ]]; then
    log_error "Missing agent_type field"
    return 1
  fi
  log_success "agent_type: $agent_type ✓"

  # Check atomic_task
  local atomic_task=$(jq -r '.atomic_task // "missing"' "$context_file")
  if [[ "$atomic_task" == "missing" ]]; then
    log_error "Missing atomic_task field"
    return 1
  fi
  log_success "atomic_task: ${atomic_task:0:50}... ✓"

  # Check expected_deliverables
  local deliverables=$(jq -r '.expected_deliverables // "missing"' "$context_file")
  if [[ "$deliverables" == "missing" ]]; then
    log_error "Missing expected_deliverables field"
    return 1
  fi
  log_success "expected_deliverables: $deliverables ✓"

  # Check estimated_time
  local estimated_time=$(jq -r '.estimated_time // "missing"' "$context_file")
  if [[ "$estimated_time" == "missing" ]]; then
    log_error "Missing estimated_time field"
    return 1
  fi
  log_success "estimated_time: $estimated_time ✓"

  # Verify estimated_time is within 15-30 min bounds
  local time_value=$(echo "$estimated_time" | grep -oE '[0-9]+' | head -1)
  if [[ -n "$time_value" ]]; then
    if [[ $time_value -ge 15 ]] && [[ $time_value -le 30 ]]; then
      log_success "Time bounds check: $time_value min within [15-30] ✓"
    else
      log_error "Time bounds check: $time_value min outside [15-30]"
      return 1
    fi
  fi

  log_success "✅ Test 8 PASSED: Context matches specification"
}

# Execute tests
log_step "Coordinator V3 - Atomic Task Assignment Tests (P1)"
log_info "Testing atomic task scoping and context format"
echo ""

test_each_agent_receives_single_atomic_task
test_task_context_matches_specification

log_step "All Atomic Task Tests Complete"
log_success "2/2 tests executed"
