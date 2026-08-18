#!/usr/bin/env bash
# tests/docker/north-star/01-agent-spawning/test-basic-validation.sh
# Phase 1 :: Basic validation of CFN Loop test framework and environment

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_TASK_ID="validation-test-$(date +%s)"

cleanup() {
  log_step "Cleanup: Removing validation test artifacts"
  rm -rf "/tmp/north-star-validation-$TEST_TASK_ID" || true
  pkill -f "validation-test" || true
}
trap cleanup EXIT

validate_test_environment() {
  log_step "GIVEN: Test environment is properly configured"

  # Check project structure
  if [ ! -d "$PROJECT_ROOT" ]; then
    log_error "Project root not found"
    return 1
  fi

  # Check test utilities
  if [ ! -f "$PROJECT_ROOT/tests/test-utils.sh" ]; then
    log_error "Test utilities not found"
    return 1
  fi

  # Check Redis connectivity
  if ! command -v redis-cli &> /dev/null; then
    log_error "Redis CLI not found"
    return 1
  fi

  if ! redis-cli ping > /dev/null 2>&1; then
    log_error "Redis not running"
    return 1
  fi

  log_info "✅ Test environment validated"
  return 0
}

validate_cfn_loop_structure() {
  log_step "WHEN: CFN Loop structure is validated"

  # Check agent profiles
  if [ -d "$PROJECT_ROOT/.claude/agents/cfn-dev-team" ]; then
    local agent_count=$(find "$PROJECT_ROOT/.claude/agents/cfn-dev-team" -name "*.md" | wc -l || echo "0")
    log_info "✅ CFN agents found: $agent_count profiles"
  else
    log_warn "⚠️  CFN agents directory not found"
  fi

  # Check skills
  if [ -d "$PROJECT_ROOT/.claude/skills" ]; then
    local skill_count=$(find "$PROJECT_ROOT/.claude/skills" -name "cfn-*" -type d | wc -l || echo "0")
    log_info "✅ CFN skills found: $skill_count skill directories"
  else
    log_warn "⚠️  CFN skills directory not found"
  fi

  # Check trigger.dev integration
  if [ -d "$PROJECT_ROOT/trigger-dev" ]; then
    log_info "✅ Trigger.dev integration found"

    # Check v3 tasks
    if [ -f "$PROJECT_ROOT/trigger-dev/src/v3/cfn-loop.task.ts" ]; then
      log_info "✅ v3 CFN Loop task found"
    else
      log_warn "⚠️  v3 CFN Loop task not found"
    fi
  else
    log_warn "⚠️  Trigger.dev integration not found"
  fi

  return 0
}

validate_redis_coordination() {
  log_step "THEN: Redis coordination capabilities are tested"

  local test_key="test:$TEST_TASK_ID:coordination"
  local test_value='{"status":"test","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"}'

  # Test Redis write
  if redis-cli SET "$test_key" "$test_value" > /dev/null 2>&1; then
    log_info "✅ Redis write operation successful"
  else
    log_error "❌ Redis write operation failed"
    return 1
  fi

  # Test Redis read
  local read_value=$(redis-cli GET "$test_key" 2>/dev/null || echo "")
  if [ "$read_value" = "$test_value" ]; then
    log_info "✅ Redis read operation successful"
  else
    log_error "❌ Redis read operation failed"
    return 1
  fi

  # Test Redis list operations (for coordination)
  local list_key="$test_key:signals"
  if redis-cli LPUSH "$list_key" "test-signal-1" > /dev/null 2>&1 && \
     redis-cli LPUSH "$list_key" "test-signal-2" > /dev/null 2>&1; then
    log_info "✅ Redis list operations successful"

    local list_length=$(redis-cli LLEN "$list_key" 2>/dev/null || echo "0")
    if [ "$list_length" -eq 2 ]; then
      log_info "✅ Redis list length validation successful"
    else
      log_error "❌ Redis list length validation failed: expected 2, got $list_length"
      return 1
    fi
  else
    log_error "❌ Redis list operations failed"
    return 1
  fi

  # Cleanup test keys
  redis-cli DEL "$test_key" "$list_key" > /dev/null 2>&1 || true

  return 0
}

validate_docker_environment() {
  log_step "AND: Docker environment is validated"

  if command -v docker &> /dev/null; then
    log_info "✅ Docker CLI available"

    # Test Docker daemon
    if docker info > /dev/null 2>&1; then
      log_info "✅ Docker daemon running"
    else
      log_error "❌ Docker daemon not running"
      return 1
    fi

    # Check for CFN agent images
    local cfn_images=$(docker images | grep -c "cfn\|claude-flow-novice" || echo "0")
    if [ "$cfn_images" -gt 0 ]; then
      log_info "✅ CFN Docker images found: $cfn_images"
    else
      log_warn "⚠️  No CFN Docker images found (may need to build)"
    fi
  else
    log_error "❌ Docker CLI not found"
    return 1
  fi

  return 0
}

validate_trigger_dev_integration() {
  log_step "AND: Trigger.dev integration is validated"

  if [ -d "$PROJECT_ROOT/trigger-dev" ]; then
    # Check package.json
    if [ -f "$PROJECT_ROOT/trigger-dev/package.json" ]; then
      local trigger_version=$(grep -o '"@trigger.dev/sdk": "[^"]*"' "$PROJECT_ROOT/trigger-dev/package.json" | cut -d'"' -f4 || echo "unknown")
      log_info "✅ Trigger.dev SDK version: $trigger_version"
    fi

    # Check environment configuration
    if [ -f "$PROJECT_ROOT/trigger-dev/.env.local" ]; then
      log_info "✅ Trigger.dev environment configuration found"

      if grep -q "TRIGGER_API_KEY" "$PROJECT_ROOT/trigger-dev/.env.local"; then
        log_info "✅ API key configured"
      else
        log_warn "⚠️  API key not configured"
      fi
    else
      log_warn "⚠️  Environment configuration not found"
    fi

    # Check worker configuration
    if [ -f "$PROJECT_ROOT/trigger-dev/src/worker.ts" ]; then
      log_info "✅ Worker configuration found"
    else
      log_warn "⚠️  Worker configuration not found"
    fi
  else
    log_warn "⚠️  Trigger.dev directory not found"
  fi

  return 0
}

# Main test execution
main() {
  annotate "CFN Loop Basic Validation" \
    "Validates test environment, Redis coordination, Docker setup, and Trigger.dev integration"

  validate_test_environment
  validate_cfn_loop_structure
  validate_redis_coordination
  validate_docker_environment
  validate_trigger_dev_integration

  log_success "CFN Loop basic validation completed successfully"
  log_info "Test framework is ready for comprehensive testing"
}

# Execute test
main "$@"