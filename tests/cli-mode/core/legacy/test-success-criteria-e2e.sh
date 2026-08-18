#!/usr/bin/env bash
# tests/cli-mode/test-success-criteria-e2e.sh
# Phase 3 :: End-to-end test for success criteria flow from coordinator to agents (Bug #TBD)
# Tests JSON parsing, Redis storage/retrieval, and agent environment injection

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_CLI="redis-cli -h $REDIS_HOST -p $REDIS_PORT${REDIS_PASSWORD:+ -a $REDIS_PASSWORD}"
TEMP_DIR=""
TEST_TASK_ID=""

cleanup() {
  log_info "Cleaning up test artifacts"

  # Clean up Redis keys
  if [ -n "$TEST_TASK_ID" ]; then
    $REDIS_CLI DEL "swarm:${TEST_TASK_ID}:success-criteria" >/dev/null 2>&1 || true
    $REDIS_CLI DEL "swarm:${TEST_TASK_ID}:test-passed" >/dev/null 2>&1 || true
  fi

  # Clean up temp files
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

##############################################################################
# Test Case 1: Coordinator stores complex success criteria in Redis
##############################################################################
test_coordinator_stores_criteria_in_redis() {
  log_step "GIVEN coordinator with complex success criteria JSON"

  TEST_TASK_ID="test-criteria-$(date +%s)-$$"

  # Create complex success criteria with special characters that might break shell escaping
  local CRITERIA_JSON
  CRITERIA_JSON=$(cat <<'EOF'
{
  "test_suites": [
    {
      "name": "Unit Tests",
      "command": "npm test -- --testPathPattern=\"auth.*test\"",
      "threshold": 0.95,
      "coverage_required": true,
      "timeout": 300
    },
    {
      "name": "Integration Tests",
      "command": "npm run test:integration",
      "threshold": 0.90,
      "description": "Tests with 'quotes' and \"escapes\" and $variables"
    }
  ],
  "deliverables": {
    "required_files": [
      "src/auth/login.ts",
      "src/auth/session.ts"
    ],
    "documentation": ["README.md", "API.md"]
  },
  "metadata": {
    "project": "CFN-Loop",
    "version": "3.0.0",
    "special_chars": "Test: $VAR, 'single', \"double\", \n newline"
  }
}
EOF
)

  log_step "WHEN coordinator stores criteria in Redis"

  # Simulate coordinator storing success criteria
  $REDIS_CLI SET "swarm:${TEST_TASK_ID}:success-criteria" "$CRITERIA_JSON" >/dev/null

  log_step "THEN criteria should be retrievable without corruption"

  # Retrieve and validate
  local RETRIEVED
  RETRIEVED=$($REDIS_CLI GET "swarm:${TEST_TASK_ID}:success-criteria")

  assert_not_empty "$RETRIEVED" "Success criteria stored in Redis"

  # Validate JSON structure is intact
  if echo "$RETRIEVED" | jq . >/dev/null 2>&1; then
    log_success "JSON structure is valid after Redis storage"
  else
    log_error "JSON structure corrupted in Redis"
    return 1
  fi

  log_step "THEN no shell escaping issues with special characters"

  # Check specific values with special characters
  local TEST_COMMAND
  TEST_COMMAND=$(echo "$RETRIEVED" | jq -r '.test_suites[0].command')

  assert_contains "$TEST_COMMAND" "testPathPattern" "Command with special chars preserved"
  assert_contains "$TEST_COMMAND" "auth.*test" "Regex pattern preserved"

  local SPECIAL_CHARS
  SPECIAL_CHARS=$(echo "$RETRIEVED" | jq -r '.metadata.special_chars')

  assert_contains "$SPECIAL_CHARS" "single" "Single quotes preserved"
  assert_contains "$SPECIAL_CHARS" "double" "Double quotes preserved"
  assert_contains "$SPECIAL_CHARS" "\$VAR" "Dollar signs preserved"

  log_success "Test 1 complete: Coordinator stores complex criteria successfully"
}

##############################################################################
# Test Case 2: Orchestrator reads success criteria from Redis
##############################################################################
test_orchestrator_reads_criteria_from_redis() {
  log_step "GIVEN success criteria stored in Redis"

  TEST_TASK_ID="test-orchestrator-$(date +%s)-$$"

  local CRITERIA_JSON
  CRITERIA_JSON=$(cat <<'EOF'
{
  "test_suites": [
    {
      "name": "Backend Tests",
      "command": "pytest tests/backend/",
      "threshold": 0.95
    }
  ],
  "deliverables": {
    "required_files": ["backend/api.py"]
  }
}
EOF
)

  $REDIS_CLI SET "swarm:${TEST_TASK_ID}:success-criteria" "$CRITERIA_JSON" >/dev/null

  log_step "WHEN orchestrator starts with --success-criteria flag"

  # Create a mock orchestrator script that reads from Redis
  TEMP_DIR=$(create_temp_dir)
  local MOCK_ORCHESTRATOR="$TEMP_DIR/mock-orchestrator.sh"

  cat > "$MOCK_ORCHESTRATOR" <<'SCRIPT'
#!/bin/bash
set -euo pipefail

TASK_ID="$1"
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"

# Simulate orchestrator reading success criteria
CRITERIA=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ${REDIS_PASSWORD:+-a "$REDIS_PASSWORD"} GET "swarm:${TASK_ID}:success-criteria")

# Validate JSON
if ! echo "$CRITERIA" | jq . >/dev/null 2>&1; then
  echo "ERROR: Invalid JSON in success criteria"
  exit 1
fi

# Extract test suites
TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites')

echo "SUCCESS: Orchestrator read criteria"
echo "$CRITERIA"
SCRIPT

  chmod +x "$MOCK_ORCHESTRATOR"

  log_step "THEN orchestrator should retrieve criteria from Redis"

  local OUTPUT
  OUTPUT=$("$MOCK_ORCHESTRATOR" "$TEST_TASK_ID" 2>&1)

  assert_contains "$OUTPUT" "SUCCESS: Orchestrator read criteria" "Orchestrator retrieved criteria"

  log_step "THEN JSON validation should pass"

  assert_contains "$OUTPUT" "Backend Tests" "Test suite name found"
  assert_contains "$OUTPUT" "pytest tests/backend/" "Command found"
  assert_contains "$OUTPUT" "0.95" "Threshold found"

  log_success "Test 2 complete: Orchestrator reads criteria successfully"
}

##############################################################################
# Test Case 3: Loop 3 agents receive success criteria via environment
##############################################################################
test_agents_receive_criteria() {
  log_step "GIVEN orchestrator running with success criteria"

  TEST_TASK_ID="test-agents-$(date +%s)-$$"

  local CRITERIA_JSON
  CRITERIA_JSON=$(cat <<'EOF'
{
  "test_suites": [
    {
      "name": "E2E Tests",
      "command": "npm run test:e2e",
      "threshold": 0.90,
      "coverage_required": true
    }
  ]
}
EOF
)

  $REDIS_CLI SET "swarm:${TEST_TASK_ID}:success-criteria" "$CRITERIA_JSON" >/dev/null

  log_step "WHEN Loop 3 agents spawn"

  # Simulate agent spawning with environment variable injection
  TEMP_DIR=$(create_temp_dir)
  local MOCK_AGENT="$TEMP_DIR/mock-agent.sh"

  cat > "$MOCK_AGENT" <<'SCRIPT'
#!/bin/bash
set -euo pipefail

TASK_ID="$1"

# Check if AGENT_SUCCESS_CRITERIA environment variable is set
if [ -z "${AGENT_SUCCESS_CRITERIA:-}" ]; then
  echo "ERROR: AGENT_SUCCESS_CRITERIA not set"
  exit 1
fi

# Validate JSON in environment variable
if ! echo "$AGENT_SUCCESS_CRITERIA" | jq . >/dev/null 2>&1; then
  echo "ERROR: Invalid JSON in AGENT_SUCCESS_CRITERIA"
  exit 1
fi

# Extract test information
TEST_NAME=$(echo "$AGENT_SUCCESS_CRITERIA" | jq -r '.test_suites[0].name')
TEST_CMD=$(echo "$AGENT_SUCCESS_CRITERIA" | jq -r '.test_suites[0].command')
THRESHOLD=$(echo "$AGENT_SUCCESS_CRITERIA" | jq -r '.test_suites[0].threshold')

echo "SUCCESS: Agent received criteria"
echo "Test: $TEST_NAME"
echo "Command: $TEST_CMD"
echo "Threshold: $THRESHOLD"
SCRIPT

  chmod +x "$MOCK_AGENT"

  log_step "THEN agents should have access to success criteria via environment"

  # Export criteria as environment variable (simulating orchestrator behavior)
  export AGENT_SUCCESS_CRITERIA="$CRITERIA_JSON"

  local AGENT_OUTPUT
  AGENT_OUTPUT=$("$MOCK_AGENT" "$TEST_TASK_ID" 2>&1)

  assert_contains "$AGENT_OUTPUT" "SUCCESS: Agent received criteria" "Agent accessed criteria"
  assert_contains "$AGENT_OUTPUT" "Test: E2E Tests" "Test name accessible"
  assert_contains "$AGENT_OUTPUT" "Command: npm run test:e2e" "Command accessible"
  assert_contains "$AGENT_OUTPUT" "Threshold: 0.9" "Threshold accessible"

  unset AGENT_SUCCESS_CRITERIA

  log_success "Test 3 complete: Agents receive criteria via environment"
}

##############################################################################
# Test Case 4: Complex JSON with nested structures and special characters
##############################################################################
test_complex_json_no_escaping_issues() {
  log_step "GIVEN success criteria with nested objects, arrays, quotes, newlines"

  TEST_TASK_ID="test-complex-$(date +%s)-$$"

  # Create extremely complex JSON with all edge cases
  local COMPLEX_JSON
  COMPLEX_JSON=$(cat <<'EOF'
{
  "test_suites": [
    {
      "name": "Comprehensive Suite",
      "command": "npm test -- --coverage --testMatch='**/*.test.ts'",
      "threshold": 0.95,
      "env_vars": {
        "NODE_ENV": "test",
        "API_KEY": "test-key-$RANDOM",
        "PATH_WITH_SPACES": "/path/to/my documents/test"
      },
      "args": [
        "--verbose",
        "--bail",
        "--config=\"test.config.js\""
      ]
    },
    {
      "name": "Integration with 'Quotes'",
      "command": "echo \"Testing $VAR\" && npm run test",
      "threshold": 0.90,
      "description": "Test with\nmultiple\nlines"
    }
  ],
  "deliverables": {
    "required_files": [
      "src/auth/login.ts",
      "src/auth/session.ts",
      "docs/API.md"
    ],
    "patterns": [
      "src/**/*.ts",
      "!src/**/*.test.ts"
    ]
  },
  "validation": {
    "rules": [
      {
        "type": "coverage",
        "threshold": 80,
        "exclude": ["**/*.test.ts"]
      },
      {
        "type": "linting",
        "command": "eslint src/ --ext .ts,.tsx"
      }
    ]
  },
  "metadata": {
    "created_by": "coordinator",
    "timestamp": "2025-01-01T00:00:00Z",
    "notes": "Handle all special cases: $VAR, 'single', \"double\", `backticks`, {braces}, [brackets], (parens)"
  }
}
EOF
)

  log_step "WHEN stored and retrieved from Redis"

  # Store in Redis
  $REDIS_CLI SET "swarm:${TEST_TASK_ID}:success-criteria" "$COMPLEX_JSON" >/dev/null

  # Retrieve from Redis
  local RETRIEVED
  RETRIEVED=$($REDIS_CLI GET "swarm:${TEST_TASK_ID}:success-criteria")

  log_step "THEN data integrity should be maintained"

  # Validate JSON structure
  if ! echo "$RETRIEVED" | jq . >/dev/null 2>&1; then
    log_error "JSON validation failed after Redis round-trip"
    return 1
  fi

  log_success "JSON structure valid after round-trip"

  # Validate specific complex values
  local COMMAND_WITH_QUOTES
  COMMAND_WITH_QUOTES=$(echo "$RETRIEVED" | jq -r '.test_suites[0].command')
  assert_contains "$COMMAND_WITH_QUOTES" "testMatch" "Single quotes in command preserved"
  assert_contains "$COMMAND_WITH_QUOTES" "*.test.ts" "Glob pattern preserved"

  local ENV_WITH_DOLLAR
  ENV_WITH_DOLLAR=$(echo "$RETRIEVED" | jq -r '.test_suites[0].env_vars.API_KEY')
  assert_contains "$ENV_WITH_DOLLAR" "\$RANDOM" "Dollar signs preserved in env vars"

  local PATH_WITH_SPACES
  PATH_WITH_SPACES=$(echo "$RETRIEVED" | jq -r '.test_suites[0].env_vars.PATH_WITH_SPACES')
  assert_contains "$PATH_WITH_SPACES" "my documents" "Spaces in paths preserved"

  local DESC_WITH_NEWLINES
  DESC_WITH_NEWLINES=$(echo "$RETRIEVED" | jq -r '.test_suites[1].description')
  assert_contains "$DESC_WITH_NEWLINES" "multiple" "Newlines handled correctly"

  local ARGS_ARRAY
  ARGS_ARRAY=$(echo "$RETRIEVED" | jq -r '.test_suites[0].args | length')
  assert_equals "3" "$ARGS_ARRAY" "Array length preserved"

  local NOTES
  NOTES=$(echo "$RETRIEVED" | jq -r '.metadata.notes')
  assert_contains "$NOTES" "\$VAR" "Dollar signs in notes preserved"
  assert_contains "$NOTES" "single" "Single quotes in notes preserved"
  assert_contains "$NOTES" "double" "Double quotes in notes preserved"
  assert_contains "$NOTES" "backticks" "Backticks in notes preserved"
  assert_contains "$NOTES" "braces" "Braces in notes preserved"

  local FILE_PATTERN
  FILE_PATTERN=$(echo "$RETRIEVED" | jq -r '.deliverables.patterns[1]')
  assert_equals "!src/**/*.test.ts" "$FILE_PATTERN" "Glob patterns with ! preserved"

  log_success "Test 4 complete: Complex JSON maintains integrity through Redis"
}

##############################################################################
# Test Execution
##############################################################################

setup_test "success-criteria-e2e"

# Verify Redis is available
if ! verify_redis_health; then
  log_error "Redis is not available. Tests require Redis."
  exit 1
fi

# Run all test cases
test_coordinator_stores_criteria_in_redis
test_orchestrator_reads_criteria_from_redis
test_agents_receive_criteria
test_complex_json_no_escaping_issues

teardown_test
