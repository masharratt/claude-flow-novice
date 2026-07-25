# CLI Mode Security Test Suite

## Overview

Comprehensive security test coverage for CLI mode agent spawning, preventing command injection, Redis key injection, DoS attacks, and information disclosure vulnerabilities.

## Test Coverage

### 1. Command Injection Prevention - Shell Metacharacters
**Test:** `test_command_injection_shell_metacharacters`

Validates that shell metacharacters in prompts are properly sanitized:
- Semicolons (;)
- Ampersands (&&)
- Pipes (|)
- Command substitution $()
- Backticks ``

**Attack Vectors Tested:**
```bash
"Test prompt; rm -rf /tmp/test-file"
"Test prompt && echo 'injected'"
"Test prompt | cat /etc/passwd"
"Test prompt $(whoami)"
"Test prompt `date`"
```

**Expected Behavior:** Commands should be sanitized or rejected; no command execution should occur.

---

### 2. Command Injection Prevention - Quote Escaping
**Test:** `test_command_injection_quote_escaping`

Validates that quote escaping attempts are prevented:
- Single quote escaping
- Double quote escaping
- SQL injection patterns
- Newline injection

**Attack Vectors Tested:**
```bash
"Test'; DROP TABLE agents; --"
"Test\"; echo 'injected'; \""
"Test' && echo 'injected' && '"
```

**Expected Behavior:** Quotes should be properly escaped or rejected.

---

### 3. Redis Key Injection Prevention
**Test:** `test_redis_key_injection`

Validates that task IDs and agent IDs are sanitized before Redis key construction:
- Wildcard injection (*)
- Key override attempts
- Path traversal in keys
- Newline injection
- Command injection via keys

**Attack Vectors Tested:**
```bash
"task:*"
"task:admin:override"
"../../../etc/passwd"
"task\nswarm:override:key"
"task; SET malicious-key 'value'"
```

**Expected Behavior:** IDs sanitized to alphanumeric + underscore/hyphen only.

**Sanitization Pattern:** `^[a-zA-Z0-9_-]+$`

---

### 4. Prompt Size Limit (DoS Prevention)
**Test:** `test_prompt_size_limit`

Validates that oversized prompts are rejected or truncated:
- Large prompt generation (100KB+)
- Memory exhaustion prevention
- Network bandwidth DoS

**Expected Behavior:** Prompts exceeding reasonable size limits (100KB) should be rejected.

---

### 5. Special Character Handling in Task ID
**Test:** `test_special_characters_task_id`

Validates that special characters in task IDs are properly sanitized:
- Spaces
- Slashes (/)
- Dollar signs ($)
- Semicolons (;)
- Pipes (|)
- Ampersands (&)
- Newlines (\n)

**Expected Behavior:** Special characters replaced with underscores (_).

---

### 6. Redis Command Injection via Prompt
**Test:** `test_redis_command_injection`

Validates that Redis commands embedded in prompts cannot be executed:
- SET command injection
- DEL command injection
- FLUSHALL attacks
- CONFIG modification

**Attack Vectors Tested:**
```bash
"Test\nSET malicious-key 'value'\n"
"Test\rDEL swarm:*\r"
"Test' FLUSHALL '"
"Test\"; CONFIG SET dir /tmp; \""
```

**Expected Behavior:** Newlines and carriage returns should be escaped; Redis commands should not execute.

---

### 7. Environment Variable Injection
**Test:** `test_environment_variable_injection`

Validates that environment variables in prompts are not expanded:
- $HOME expansion
- ${PATH} expansion
- $((arithmetic)) expansion
- $(command) substitution

**Attack Vectors Tested:**
```bash
"Test $HOME"
"Test ${PATH}"
"Test $((1+1))"
"Test $(echo vulnerable)"
```

**Expected Behavior:** Variables should remain literal, not expanded.

---

### 8. Path Traversal Prevention
**Test:** `test_path_traversal`

Validates that path traversal attempts are blocked:
- Parent directory traversal (..)
- Absolute path attempts (/etc/passwd)
- Null byte injection (%00)

**Attack Vectors Tested:**
```bash
"../../etc/passwd"
"../../../../../../../etc/shadow"
"....//....//....//etc/hosts"
"/etc/passwd%00.txt"
```

**Expected Behavior:** Paths should be rejected or confined to project root.

---

### 9. Input Validation for Agent Type
**Test:** `test_agent_type_validation`

Validates that agent type parameter is properly validated:
- Command injection via agent type
- Path traversal via agent type
- Command substitution

**Attack Vectors Tested:**
```bash
"backend-developer; rm -rf /tmp/*"
"backend-developer && whoami"
"backend-developer | cat /etc/passwd"
"../../../malicious-agent"
```

**Expected Behavior:** Only alphanumeric + underscore/hyphen allowed in agent type.

---

### 10. Error Message Information Disclosure
**Test:** `test_error_message_sanitization`

Validates that error messages do not disclose sensitive information:
- User home directories
- Passwords/secrets
- API keys
- Authentication tokens

**Sensitive Patterns Checked:**
- `/home/[username]`
- `password`
- `secret`
- `API_KEY`
- `token`

**Expected Behavior:** Error messages should be generic; no sensitive data leaked.

---

## Running the Tests

### Full Security Test Suite
```bash
./tests/cli-mode/security/test-cli-security.sh
```

### With Debug Output
```bash
DEBUG=true ./tests/cli-mode/security/test-cli-security.sh
```

### Individual Test Execution
Edit the script and comment out unwanted tests in the `tests` array.

---

## Expected Output

```
[INFO] Starting CLI mode security test suite
[INFO] Test Task ID: test-security-1732387200-12345

[STEP] GIVEN malicious prompt with shell metacharacters
[INFO] Testing injection: Test prompt; rm -rf /tmp/test-file
✓ test_command_injection_shell_metacharacters PASSED

[STEP] GIVEN malicious prompt with quote escaping attempts
✓ test_command_injection_quote_escaping PASSED

[STEP] GIVEN malicious task ID and agent ID with Redis key injection attempts
✓ test_redis_key_injection PASSED

[STEP] GIVEN oversized prompt (DoS attack scenario)
✓ test_prompt_size_limit PASSED

... (6 more tests)

==========================================
Security Test Suite Summary
==========================================
Total tests: 10
Passed: 10
Failed: 0
==========================================
All security tests passed ✓
```

---

## Test Artifacts

### Cleanup Behavior
The test suite automatically cleans up:
- Redis test keys (`swarm:${TEST_TASK_ID}:*`)
- Temporary files (`/tmp/test-cli-security-*`)
- Malicious keys created during testing

### Trap Handling
Cleanup runs even on test failure via `trap cleanup EXIT`.

---

## Integration with CI/CD

Add to `.github/workflows/test.yml`:

```yaml
- name: Run Security Tests
  run: |
    ./tests/cli-mode/security/test-cli-security.sh
```

---

## Security Best Practices Validated

1. **Input Sanitization**: All user input (prompts, task IDs, agent types) sanitized
2. **Command Injection Prevention**: Shell metacharacters escaped or rejected
3. **Redis Key Safety**: Key patterns validated before use
4. **DoS Prevention**: Size limits enforced on prompts
5. **Path Traversal Prevention**: File paths normalized and validated
6. **Information Disclosure Prevention**: Error messages sanitized

---

## Related Documentation

- **Test Authoring Standards**: `tests/CLAUDE.md`
- **CLI Mode Tests**: `tests/cli-mode/README.md`
- **Security Guidelines**: `CLAUDE.md` (Section: Security Guidelines)
- **Agent Spawning**: `.claude/skills/cfn-agent-spawning/SKILL.md`

---

## Troubleshooting

### Redis Not Available
Tests will skip Redis-specific validations if Redis is not running.

```bash
# Start Redis for full test coverage
redis-server --daemonize yes
```

### Test Failures
Check test logs for specific failure messages:

```bash
DEBUG=true ./tests/cli-mode/security/test-cli-security.sh 2>&1 | tee security-test.log
```

### Permission Issues
Ensure test script is executable:

```bash
chmod +x tests/cli-mode/security/test-cli-security.sh
```

---

## Maintenance

### Adding New Security Tests

Follow the test template pattern:

```bash
test_new_security_check() {
  log_step "GIVEN malicious input scenario"

  # WHEN security control is tested
  local result
  result=$(perform_security_check)

  # THEN assert expected behavior
  assert_success "0" "Security control prevents attack"
}
```

Add new test function to the `tests` array in `main()`.

### Coverage Expansion

Consider adding tests for:
- LDAP injection
- XML external entity (XXE) attacks
- Server-side request forgery (SSRF)
- Timing attacks
- Race conditions

---

## Compliance

This test suite validates controls for:
- **OWASP Top 10**: A1 (Injection), A5 (Security Misconfiguration)
- **CWE-78**: OS Command Injection
- **CWE-89**: SQL Injection (Redis equivalent)
- **CWE-22**: Path Traversal
- **CWE-400**: Uncontrolled Resource Consumption (DoS)

---

**Last Updated:** 2025-11-23
**Maintainer:** Backend Development Team
**Test Count:** 10 security tests
