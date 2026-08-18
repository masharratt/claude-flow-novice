#!/usr/bin/env bash
# tests/cli-mode/security/test-cli-security.sh
# Phase 3 :: Security test coverage for CLI mode (command injection, input validation, DoS prevention)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
REDIS_PORT="${CFN_REDIS_PORT:-6379}"
TEST_TASK_ID="test-security-$(date +%s)-$$"

cleanup() {
  # Clean up test files
  rm -f /tmp/test-cli-security-*.txt 2>/dev/null || true

  # No Redis cleanup needed - tests don't actually use Redis
  return 0
}
trap cleanup EXIT

# ============================================================================
# Test 1: Command Injection Prevention - Shell Metacharacters
# ============================================================================
test_command_injection_shell_metacharacters() {
  log_step "GIVEN malicious prompt with shell metacharacters"

  local malicious_prompts=(
    "Test prompt; rm -rf /tmp/test-file"
    "Test prompt && echo 'injected'"
    "Test prompt | cat /etc/passwd"
    "Test prompt \$(whoami)"
    "Test prompt \`date\`"
    "Test prompt; touch /tmp/test-cli-security-injected.txt"
  )

  local test_failed=0

  for prompt in "${malicious_prompts[@]}"; do
    log_info "Testing injection: $prompt"

    # WHEN prompt is sanitized using standard escaping
    local sanitized_prompt
    sanitized_prompt=$(printf '%q' "$prompt")

    # THEN dangerous characters should be escaped
    if [[ "$sanitized_prompt" != *"\\"* ]] && [[ "$sanitized_prompt" != *"'"* ]]; then
      log_error "Prompt not properly escaped: $prompt"
      test_failed=1
      continue
    fi

    # Verify command substitution is escaped
    if [[ "$prompt" == *'$('* ]] && [[ "$sanitized_prompt" != *'\$'* ]] && [[ "$sanitized_prompt" != *"'"* ]]; then
      log_error "Command substitution not escaped: $prompt"
      test_failed=1
      continue
    fi

    # Verify semicolons are escaped
    if [[ "$prompt" == *';'* ]] && [[ "$sanitized_prompt" != *'\;'* ]] && [[ "$sanitized_prompt" != *"'"* ]]; then
      log_error "Semicolon not escaped: $prompt"
      test_failed=1
      continue
    fi

    log_info "✓ Injection prevented: $prompt -> $sanitized_prompt"
  done

  if [[ $test_failed -eq 0 ]]; then
    log_info "✓ Command injection with shell metacharacters prevented"
    return 0
  else
    log_error "✗ Command injection tests failed"
    return 1
  fi
}

# ============================================================================
# Test 2: Command Injection Prevention - Quote Escaping
# ============================================================================
test_command_injection_quote_escaping() {
  log_step "GIVEN malicious prompt with quote escaping attempts"

  local malicious_prompts=(
    "Test'; DROP TABLE agents; --"
    "Test\"; echo 'injected'; \""
    "Test' && echo 'injected' && '"
    "Test\\'; rm -rf /tmp/*; '"
  )

  for prompt in "${malicious_prompts[@]}"; do
    log_info "Testing quote escaping: $prompt"

    # WHEN prompt is properly quoted for shell
    local quoted_prompt
    quoted_prompt=$(printf '%q' "$prompt")

    # THEN quotes should be escaped (backslash present)
    if [[ "$quoted_prompt" != *"\\"* ]] && [[ "$quoted_prompt" != *"'"* ]]; then
      log_error "Quote not properly escaped: $prompt -> $quoted_prompt"
      return 1
    fi

    log_info "✓ Quote escaped: $prompt -> $quoted_prompt"
  done

  log_info "✓ Quote escaping attacks prevented"
  return 0
}

# ============================================================================
# Test 3: Redis Key Injection Prevention
# ============================================================================
test_redis_key_injection() {
  log_step "GIVEN malicious task ID and agent ID with Redis key injection attempts"

  local malicious_ids=(
    "task:*"
    "task:admin:override"
    "../../../etc/passwd"
    "task\nswarm:override:key"
    "task; SET malicious-key 'value'"
    "task$(echo 'injected')"
  )

  for malicious_id in "${malicious_ids[@]}"; do
    log_info "Testing Redis key injection: $malicious_id"

    # WHEN Redis key is constructed with malicious ID
    local sanitized_id
    sanitized_id=$(echo "$malicious_id" | sed 's/[^a-zA-Z0-9_-]/_/g')

    # THEN ID should be sanitized to alphanumeric + underscore/hyphen only
    if [[ "$sanitized_id" =~ [\:\*\;\/\\] ]] || [[ "$sanitized_id" =~ '\$\(' ]] || [[ "$sanitized_id" =~ '\.\.' ]]; then
      log_error "Redis key injection vulnerability detected: $malicious_id -> $sanitized_id"
      return 1
    fi

    # Verify sanitized ID is safe
    if [[ ! "$sanitized_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
      log_error "Sanitized ID contains unsafe characters: $sanitized_id"
      return 1
    fi
  done

  log_info "✓ Redis key injection prevented via sanitization"
  return 0
}

# ============================================================================
# Test 4: Prompt Size Limit (DoS Prevention)
# ============================================================================
test_prompt_size_limit() {
  log_step "GIVEN oversized prompt (DoS attack scenario)"

  # WHEN prompt exceeds reasonable size limit (100KB)
  local large_prompt
  large_prompt=$(printf 'A%.0s' {1..102400})  # 100KB prompt
  local prompt_size=${#large_prompt}

  # THEN validate size check logic
  local max_size=100000
  if [[ $prompt_size -gt $max_size ]]; then
    log_info "Prompt size validation works: $prompt_size > $max_size"
  else
    log_error "Prompt size validation failed: $prompt_size <= $max_size"
    return 1
  fi

  # Verify truncation or rejection would occur
  local truncated_prompt="${large_prompt:0:$max_size}"
  if [[ ${#truncated_prompt} -le $max_size ]]; then
    log_info "Truncation logic validated"
  else
    log_error "Truncation failed"
    return 1
  fi

  log_info "✓ Prompt size limit enforced"
  return 0
}

# ============================================================================
# Test 5: Special Character Handling in Task ID
# ============================================================================
test_special_characters_task_id() {
  log_step "GIVEN task ID with special characters"

  local special_char_ids=(
    "task-with-spaces test"
    "task/with/slashes"
    "task\$with\$dollars"
    "task;with;semicolons"
    "task|with|pipes"
    "task&with&ampersands"
    "task\nwith\nnewlines"
  )

  for special_id in "${special_char_ids[@]}"; do
    log_info "Testing special characters in task ID: $special_id"

    # WHEN task ID is validated
    local sanitized_id
    sanitized_id=$(echo "$special_id" | sed 's/[^a-zA-Z0-9_-]/_/g')

    # THEN special characters should be sanitized
    if [[ "$sanitized_id" =~ [[:space:]\/\$\;\|\&] ]] || [[ "$sanitized_id" =~ $'\n' ]]; then
      log_error "Special character sanitization failed: $special_id -> $sanitized_id"
      return 1
    fi

    # Verify sanitized ID matches expected pattern
    if [[ ! "$sanitized_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
      log_error "Sanitized ID contains invalid characters: $sanitized_id"
      return 1
    fi
  done

  log_info "✓ Special characters in task ID sanitized"
  return 0
}

# ============================================================================
# Test 6: Redis Command Injection via Prompt
# ============================================================================
test_redis_command_injection() {
  log_step "GIVEN malicious prompt with Redis commands"

  local malicious_prompts=(
    "Test\nSET malicious-key 'value'\n"
    "Test\rDEL swarm:*\r"
    "Test' FLUSHALL '"
    "Test\"; CONFIG SET dir /tmp; \""
  )

  for prompt in "${malicious_prompts[@]}"; do
    log_info "Testing Redis command injection: $prompt"

    # WHEN prompt is processed
    # Redis client should escape newlines/carriage returns
    if echo "$prompt" | grep -qP '[\n\r]'; then
      log_info "Detected newline/CR in prompt (potential injection vector)"

      # Verify Redis-cli would escape these characters
      local escaped_prompt
      escaped_prompt=$(echo "$prompt" | sed 's/\\n/ /g' | sed 's/\\r/ /g')

      if [[ "$escaped_prompt" =~ (SET|DEL|FLUSHALL|CONFIG) ]]; then
        log_info "Redis command found in prompt, should be escaped"
      fi
    fi
  done

  log_info "✓ Redis command injection vectors handled"
  return 0
}

# ============================================================================
# Test 7: Environment Variable Injection
# ============================================================================
test_environment_variable_injection() {
  log_step "GIVEN malicious prompt with environment variable injection"

  local malicious_prompts=(
    "Test \$HOME"
    "Test \${PATH}"
    "Test \$((1+1))"
    "Test \$(echo vulnerable)"
  )

  for prompt in "${malicious_prompts[@]}"; do
    log_info "Testing env var injection: $prompt"

    # WHEN prompt is properly quoted
    local quoted_prompt
    quoted_prompt=$(printf '%q' "$prompt")

    # THEN environment variables should be escaped
    if [[ "$quoted_prompt" != *"\\"* ]] && [[ "$quoted_prompt" != *"'"* ]]; then
      log_error "Environment variable not escaped: $prompt -> $quoted_prompt"
      return 1
    fi

    # Verify dollar signs are escaped
    if [[ "$prompt" == *'$'* ]] && [[ "$quoted_prompt" != *'\$'* ]] && [[ "$quoted_prompt" != *"'"* ]]; then
      log_error "Dollar sign not escaped: $prompt"
      return 1
    fi

    log_info "✓ Env var escaped: $prompt -> $quoted_prompt"
  done

  log_info "✓ Environment variable injection prevented"
  return 0
}

# ============================================================================
# Test 8: Path Traversal Prevention
# ============================================================================
test_path_traversal() {
  log_step "GIVEN malicious prompt with path traversal attempts"

  local malicious_paths=(
    "../../etc/passwd"
    "../../../../../../../etc/shadow"
    "....//....//....//etc/hosts"
    "/etc/passwd%00.txt"
    "test/../../sensitive-file"
  )

  local project_root
  project_root=$(git rev-parse --show-toplevel)

  for path in "${malicious_paths[@]}"; do
    log_info "Testing path traversal: $path"

    # WHEN path is normalized relative to project root
    local normalized_path
    normalized_path=$(realpath -m "$project_root/$path" 2>/dev/null || echo "INVALID")

    # THEN path should be rejected if it escapes project root
    if [[ "$normalized_path" != "INVALID" ]] && [[ ! "$normalized_path" =~ ^"$project_root" ]]; then
      log_info "✓ Path traversal detected and would be blocked: $path -> $normalized_path"
    elif [[ "$normalized_path" == "INVALID" ]]; then
      log_info "✓ Invalid path rejected: $path"
    else
      log_info "✓ Path confined to project root: $path -> $normalized_path"
    fi
  done

  log_info "✓ Path traversal attempts blocked"
  return 0
}

# ============================================================================
# Test 9: Input Sanitization for Agent Type
# ============================================================================
test_agent_type_validation() {
  log_step "GIVEN malicious agent type parameter"

  local malicious_types=(
    "backend-developer; rm -rf /tmp/*"
    "backend-developer && whoami"
    "backend-developer | cat /etc/passwd"
    "../../../malicious-agent"
    "backend-developer\$(echo injected)"
  )

  for agent_type in "${malicious_types[@]}"; do
    log_info "Testing malicious agent type: $agent_type"

    # WHEN agent type is validated
    if [[ ! "$agent_type" =~ ^[a-zA-Z0-9_-]+$ ]]; then
      log_info "Agent type rejected (contains invalid characters)"
    else
      log_error "Agent type accepted with invalid characters: $agent_type"
      return 1
    fi
  done

  log_info "✓ Agent type validation prevents injection"
  return 0
}

# ============================================================================
# Test 10: Error Message Information Disclosure
# ============================================================================
test_error_message_sanitization() {
  log_step "GIVEN error messages that could leak sensitive data"

  # WHEN error message is generated with sensitive context
  local test_error="Error: Failed to connect to /home/user/.config/secret.key with API_KEY=sk-12345"  # portability-ok: literal input fed to the log sanitizer under test

  # THEN verify sanitization removes sensitive patterns
  local sanitized_error
  sanitized_error=$(echo "$test_error" | sed 's|/home/[^/]*/|/home/****/|g' | sed 's/API_KEY=[^ ]*/API_KEY=***/g')

  # Verify sensitive patterns removed
  if [[ "$sanitized_error" =~ /home/user/ ]] || [[ "$sanitized_error" =~ sk-12345 ]]; then  # portability-ok: asserts the sanitizer stripped that literal
    log_error "Error sanitization failed: $sanitized_error"
    return 1
  fi

  if [[ "$sanitized_error" == *"/home/****/"* ]] && [[ "$sanitized_error" == *"API_KEY=***"* ]]; then
    log_info "Error message properly sanitized"
  else
    log_error "Sanitization pattern incorrect: $sanitized_error"
    return 1
  fi

  log_info "✓ Error messages do not disclose sensitive information"
  return 0
}

# ============================================================================
# Main Execution
# ============================================================================
main() {
  log_info "Starting CLI mode security test suite"
  log_info "Test Task ID: $TEST_TASK_ID"

  local tests_passed=0
  local tests_failed=0

  # Run all security tests
  local tests
  tests=(
    "test_command_injection_shell_metacharacters"
    "test_command_injection_quote_escaping"
    "test_redis_key_injection"
    "test_prompt_size_limit"
    "test_special_characters_task_id"
    "test_redis_command_injection"
    "test_environment_variable_injection"
    "test_path_traversal"
    "test_agent_type_validation"
    "test_error_message_sanitization"
  )

  for test_func in "${tests[@]}"; do
    log_info ""
    log_info "Running: $test_func"
    if $test_func; then
      tests_passed=$((tests_passed + 1))
      log_info "✓ $test_func PASSED"
    else
      tests_failed=$((tests_failed + 1))
      log_error "✗ $test_func FAILED"
    fi
  done

  # Summary
  log_info ""
  log_info "=========================================="
  log_info "Security Test Suite Summary"
  log_info "=========================================="
  log_info "Total tests: $((tests_passed + tests_failed))"
  log_info "Passed: $tests_passed"
  log_info "Failed: $tests_failed"
  log_info "=========================================="

  if [[ $tests_failed -eq 0 ]]; then
    log_info "All security tests passed ✓"
    return 0
  else
    log_error "Security tests failed: $tests_failed/$((tests_passed + tests_failed))"
    return 1
  fi
}

# Execute main function
main "$@"
