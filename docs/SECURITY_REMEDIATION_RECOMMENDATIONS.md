# Security Remediation Recommendations
## Test-Driven Gate Implementation

---

## Fix #1: Path Traversal Validation (CRITICAL)

**File**: `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`  
**Lines**: 28-35  
**Priority**: CRITICAL  
**Effort**: 5 minutes

### Current Code:
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
```

### Fixed Code:
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# SECURITY: Validate PROJECT_ROOT is within expected boundaries
# Prevents symlink attacks and execution context manipulation
if [[ ! "$PROJECT_ROOT" =~ ^/home/user/claude-flow-novice ]]; then
  echo "❌ SECURITY ERROR: PROJECT_ROOT outside expected path: $PROJECT_ROOT" >&2
  echo "   Expected path to start with: /home/user/claude-flow-novice" >&2
  echo "   Actual path: $PROJECT_ROOT" >&2
  exit 1
fi
```

### Why This Matters:
- Prevents symlink-based attacks
- Ensures commands execute in correct context
- Prevents directory traversal vulnerabilities

---

## Fix #2: Enhanced JSON Schema Validation (HIGH)

**File**: `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`  
**Lines**: 60-80  
**Priority**: HIGH  
**Effort**: 20 minutes

### Current Code:
```bash
validate_success_criteria() {
  local CRITERIA="$1"

  if [ -z "$CRITERIA" ]; then
    echo "No success criteria provided" >&2
    return 1
  fi

  if ! echo "$CRITERIA" | jq empty 2>/dev/null; then
    echo "Invalid JSON in success criteria" >&2
    return 1
  fi

  if ! echo "$CRITERIA" | jq -e '.test_suites' >/dev/null 2>&1; then
    echo "Missing test_suites array in success criteria" >&2
    return 1
  fi

  return 0
}
```

### Fixed Code:
```bash
validate_success_criteria() {
  local CRITERIA="$1"
  local MAX_SUITES=100
  local MAX_TIMEOUT=3600
  local MIN_TIMEOUT=1

  # Validate empty
  if [ -z "$CRITERIA" ]; then
    echo "No success criteria provided" >&2
    return 1
  fi

  # Validate JSON structure
  if ! echo "$CRITERIA" | jq empty 2>/dev/null; then
    echo "Invalid JSON in success criteria" >&2
    return 1
  fi

  # Validate required field exists
  if ! echo "$CRITERIA" | jq -e '.test_suites | type == "array"' >/dev/null 2>&1; then
    echo "Missing test_suites array in success criteria" >&2
    return 1
  fi

  # Validate array size (prevent DoS)
  local SUITE_COUNT
  SUITE_COUNT=$(echo "$CRITERIA" | jq '.test_suites | length' 2>/dev/null) || {
    echo "Failed to count test suites" >&2
    return 1
  }

  if [ "$SUITE_COUNT" -eq 0 ]; then
    echo "test_suites array cannot be empty" >&2
    return 1
  fi

  if [ "$SUITE_COUNT" -gt "$MAX_SUITES" ]; then
    echo "Too many test suites: $SUITE_COUNT (max $MAX_SUITES)" >&2
    return 1
  fi

  # Validate each suite
  echo "$CRITERIA" | jq -r '.test_suites[] | @json' | while read -r SUITE_JSON; do
    local NAME COMMAND THRESHOLD TIMEOUT

    # Validate required fields
    NAME=$(echo "$SUITE_JSON" | jq -r '.name // empty' 2>/dev/null)
    COMMAND=$(echo "$SUITE_JSON" | jq -r '.command // empty' 2>/dev/null)

    if [ -z "$NAME" ] || [ -z "$COMMAND" ]; then
      echo "Test suite missing required fields: name, command" >&2
      return 1
    fi

    # Validate pass_threshold (must be 0.0-1.0)
    THRESHOLD=$(echo "$SUITE_JSON" | jq -r '.pass_threshold // "0.95"' 2>/dev/null)
    if ! [[ "$THRESHOLD" =~ ^(0(\.[0-9]+)?|1(\.0+)?)$ ]]; then
      echo "Invalid pass_threshold '$THRESHOLD' in suite '$NAME' (must be 0.0-1.0)" >&2
      return 1
    fi

    # Validate timeout (must be positive integer, reasonable bounds)
    TIMEOUT=$(echo "$SUITE_JSON" | jq -r '.timeout // "300"' 2>/dev/null)
    if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]]; then
      echo "Invalid timeout '$TIMEOUT' in suite '$NAME' (must be integer)" >&2
      return 1
    fi

    if [ "$TIMEOUT" -lt "$MIN_TIMEOUT" ] || [ "$TIMEOUT" -gt "$MAX_TIMEOUT" ]; then
      echo "Timeout out of range in suite '$NAME': $TIMEOUT (must be $MIN_TIMEOUT-$MAX_TIMEOUT)" >&2
      return 1
    fi
  done

  return 0
}
```

### Why This Matters:
- Prevents array-based DoS attacks (1000s of suites)
- Validates numeric ranges at parse time (fail fast)
- Provides clear error messages for invalid data
- Prevents invalid timeout values causing resource exhaustion

---

## Fix #3: Secure Temporary File Creation (HIGH)

**File**: `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`  
**Lines**: 145-160  
**Priority**: HIGH  
**Effort**: 5 minutes

### Current Code:
```bash
  # Temporary file for results
  local RESULTS_FILE=$(mktemp)
  trap "rm -f '$RESULTS_FILE'" EXIT
```

### Fixed Code:
```bash
  # Temporary file for results (secure permissions)
  local RESULTS_FILE
  RESULTS_FILE=$(mktemp -t "cfn-gate-results-XXXXXX") || {
    echo "❌ SECURITY ERROR: Failed to create secure temp file" >&2
    return 1
  }
  chmod 600 "$RESULTS_FILE" || {
    echo "❌ SECURITY ERROR: Failed to restrict temp file permissions" >&2
    rm -f "$RESULTS_FILE"
    return 1
  }
  trap "rm -f '$RESULTS_FILE'" EXIT
```

### Additional Fix for store_test_results():
```bash
store_test_results() {
  local TASK_ID="$1"
  local PASS_RATE="$2"
  local RESULTS_FILE="$3"

  # ... existing Redis code ...

  # Task mode: store in temp file with secure permissions
  if ! command -v redis-cli >/dev/null 2>&1 || ! redis-cli ping >/dev/null 2>&1; then
    local OUTPUT_DIR="/tmp/cfn-gate-results"
    mkdir -p "$OUTPUT_DIR" || return 1
    chmod 700 "$OUTPUT_DIR"  # Only owner can read
    
    echo "$PASS_RATE" > "$OUTPUT_DIR/$TASK_ID.pass_rate"
    chmod 600 "$OUTPUT_DIR/$TASK_ID.pass_rate"  # Owner only
    
    cp "$RESULTS_FILE" "$OUTPUT_DIR/$TASK_ID.results.json"
    chmod 600 "$OUTPUT_DIR/$TASK_ID.results.json"  # Owner only
  fi
}
```

### Why This Matters:
- Prevents other users from reading test results
- Protects sensitive data in test output (credentials, etc.)
- Follows Unix security best practices (principle of least privilege)

---

## Fix #4: Total Execution Time Limit (HIGH)

**File**: `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`  
**Lines**: 280-320 (in gate_check_test_driven function)  
**Priority**: HIGH  
**Effort**: 15 minutes

### Current Code:
```bash
gate_check_test_driven() {
  # ... setup ...
  
  # Execute each test suite
  local SUITE_COUNT=0
  while IFS= read -r SUITE; do
    SUITE_COUNT=$((SUITE_COUNT + 1))
    
    local RESULT
    RESULT=$(execute_test_suite "$SUITE") || {
      # ... error handling ...
    }
    
    echo "$RESULT" >> "$RESULTS_FILE"
  done <<< "$TEST_SUITES"
  
  # ... rest of function ...
}
```

### Fixed Code:
```bash
gate_check_test_driven() {
  # Configuration for execution limits
  local MAX_TIMEOUT_PER_SUITE=600     # 10 minutes per suite
  local MAX_TOTAL_TIME=1800           # 30 minutes total
  local START_TIME
  START_TIME=$(date +%s)
  
  # ... setup ...
  
  # Execute each test suite with time tracking
  local SUITE_COUNT=0
  while IFS= read -r SUITE; do
    SUITE_COUNT=$((SUITE_COUNT + 1))
    
    # Check total execution time before starting new suite
    local ELAPSED
    ELAPSED=$(($(date +%s) - START_TIME))
    if [ $ELAPSED -gt $MAX_TOTAL_TIME ]; then
      echo "❌ SECURITY: Total execution time exceeded (${ELAPSED}s > ${MAX_TOTAL_TIME}s)" >&2
      echo "   Aborting remaining test suites to prevent DoS" >&2
      echo "{\"pass_rate\": 0.0, \"passed\": 0, \"failed\": 1, \"total\": 1, \"status\": \"time_limit_exceeded\"}"
      return 1
    fi
    
    # Cap individual suite timeout
    local SUITE_TIMEOUT
    SUITE_TIMEOUT=$(echo "$SUITE" | jq -r '.timeout // 300')
    if [ "$SUITE_TIMEOUT" -gt "$MAX_TIMEOUT_PER_SUITE" ]; then
      echo "⚠️  Suite timeout capped at ${MAX_TIMEOUT_PER_SUITE}s (requested: ${SUITE_TIMEOUT}s)" >&2
      # Modify the suite JSON to use capped timeout
      SUITE=$(echo "$SUITE" | jq ".timeout = $MAX_TIMEOUT_PER_SUITE")
    fi
    
    local RESULT
    RESULT=$(execute_test_suite "$SUITE") || {
      if is_required "$SUITE"; then
        FAILED_REQUIRED=$((FAILED_REQUIRED + 1))
        echo "    ❌ Required test suite failed" >&2
      fi
    }
    
    echo "$RESULT" >> "$RESULTS_FILE"
  done <<< "$TEST_SUITES"
  
  # ... rest of function ...
}
```

### Why This Matters:
- Prevents 8+ hour DoS attacks (100 suites × 300s timeout)
- Ensures gate check completes in reasonable timeframe
- Tracks total execution time across all suites
- Provides clear visibility into time constraints

---

## Fix #5: Output Sanitization (HIGH)

**File**: `.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh`  
**Lines**: 1-20 (add new function)  
**Priority**: HIGH  
**Effort**: 10 minutes

### New Function to Add:
```bash
# Sanitize sensitive data from test output
# Redacts common credential patterns to prevent information disclosure
sanitize_test_output() {
    local output="$1"
    
    # Redact common credential patterns
    output=$(echo "$output" | sed -E 's/(password|passwd)[=:]\s*([^ ;|&"'"'"']+)/\1=***REDACTED***/gi')
    output=$(echo "$output" | sed -E 's/(api[_-]?key)[=:]\s*([^ ;|&"'"'"']+)/\1=***REDACTED***/gi')
    output=$(echo "$output" | sed -E 's/(token|secret|auth)[=:]\s*([^ ;|&"'"'"']+)/\1=***REDACTED***/gi')
    output=$(echo "$output" | sed -E 's/(username|user)[=:]\s*([^ ;|&"'"'"']+)/\1=***REDACTED***/gi')
    
    # Redact connection strings
    output=$(echo "$output" | sed -E 's/mongodb:[^ ;|&"'"'"']*/@REDACTED@/gi')
    output=$(echo "$output" | sed -E 's/postgresql?:[^ ;|&"'"'"']*/@REDACTED@/gi')
    output=$(echo "$output" | sed -E 's/mysql:[^ ;|&"'"'"']*/@REDACTED@/gi')
    
    # Redact AWS credentials
    output=$(echo "$output" | sed -E 's/AKIA[0-9A-Z]{16}/***AWS_KEY_REDACTED***/g')
    output=$(echo "$output" | sed -E 's/aws_secret_access_key[=:]\s*([^ ;|&"'"'"']+)/aws_secret_access_key=***REDACTED***/gi')
    
    echo "$output"
}
```

### Modify parse functions to use sanitization:
```bash
parse_jest_output() {
    local output="$1"
    
    # Sanitize output before processing
    output=$(sanitize_test_output "$output")
    
    # ... rest of function uses sanitized output ...
}

# Do same for: parse_mocha_output, parse_pytest_output, parse_tap_output, parse_go_test_output
```

### Why This Matters:
- Prevents credential leakage in test results
- Redacts API keys, passwords, tokens
- Protects database connection strings
- Reduces information disclosure risk

---

## Fix #6: Documentation (CRITICAL)

**File**: `docs/SECURITY_CONSIDERATIONS_GATE.md` (new file)  
**Priority**: CRITICAL  
**Effort**: 15 minutes

### Content:
```markdown
# Security Considerations: Test-Driven Gate Implementation

## ⚠️ Critical Assumption: Trusted Input Sources

The test-driven gate implementation assumes that `success_criteria` JSON comes from **trusted sources only**:

### Trusted Sources ✅
- Code repository (checked into version control)
- CI/CD configuration files
- Admin-provided configuration
- Internal orchestration logic

### Untrusted Sources ❌
- User-provided input
- External APIs
- Unauthenticated requests
- User-controlled database values

## Why Trusted Source is Required

The command validation function **intentionally allows** `&&` and `||` operators:

```json
{
  "test_suites": [{
    "command": "npm test && echo 'ok'",  // ✅ ALLOWED
    "command": "npm test; echo 'evil'"   // ❌ BLOCKED
  }]
}
```

This design decision enables safe command chaining while blocking other injection vectors.

## Security Design

### Blocked Patterns
- `;` - Command separator
- `|` - Pipe
- `>` `<` - Redirects
- `` ` `` - Backticks
- `$()` - Command substitution
- `{}` - Brace expansion
- `()` - Subshells

### Allowed Patterns (by design)
- `&&` - AND operator (safe for chaining tests)
- `||` - OR operator (safe fallback behavior)

## Deployment Requirements

### Before Using in Production:

1. **Validate source of success_criteria**
   ```bash
   # Ensure criteria comes from code repo or admin config
   if [[ ! "$CRITERIA_SOURCE" =~ ^/(home/user|etc)/.*$ ]]; then
     echo "ERROR: success_criteria from untrusted source"
     exit 1
   fi
   ```

2. **Implement rate limiting**
   - Limit gate check iterations
   - Prevent DoS via repeated failures

3. **Monitor execution**
   - Log all gate check invocations
   - Alert on unusual patterns

4. **File permissions**
   - Ensure /tmp/cfn-gate-results is 700 (owner only)
   - Rotate test result logs regularly

5. **Network isolation**
   - Restrict outbound network from test execution
   - Use firewall rules if available

## Compliance Checklist

Before deploying to production, verify:

- [ ] success_criteria source is documented
- [ ] success_criteria origin is validated
- [ ] Rate limiting is configured
- [ ] Execution timeout limits are set
- [ ] File permissions are secured (600/700)
- [ ] Credentials are redacted from output
- [ ] Audit logging is enabled
- [ ] Security team has reviewed configuration

## Threat Model

### Attack Vector 1: Malicious success_criteria
**Threat**: Attacker provides success_criteria with malicious commands  
**Mitigation**: Accept criteria from trusted sources only  
**Validation**: Implement origin checks

### Attack Vector 2: DoS via Many Suites
**Threat**: Attacker provides 1000 test suites with long timeouts  
**Mitigation**: Implement array size and time limits  
**Validation**: Enforce MAX_SUITES=100, MAX_TOTAL_TIME=1800

### Attack Vector 3: Credential Leakage
**Threat**: Test output contains credentials  
**Mitigation**: Sanitize output before storage  
**Validation**: Verify redaction rules are applied

### Attack Vector 4: Symlink Attacks
**Threat**: Attacker creates symlinks to redirect execution  
**Mitigation**: Validate PROJECT_ROOT path  
**Validation**: Check path matches expected prefix

## Recommended Architecture

```
┌─────────────────┐
│  Trusted Source │ (code repo / admin)
│ success_criteria │
└────────┬────────┘
         │
         ▼
    ┌─────────────────────┐
    │  Origin Validation  │ ← Checks file path starts with /home/user/...
    └────────┬────────────┘
             │
             ▼
     ┌──────────────────┐
     │ Schema Validation │ ← Validates JSON structure & fields
     └────────┬─────────┘
              │
              ▼
      ┌───────────────────┐
      │ Command Validation │ ← Blocks dangerous metacharacters
      └────────┬──────────┘
               │
               ▼
        ┌─────────────────────┐
        │ Resource-Limited    │ ← Enforces timeouts & execution limits
        │ Execution           │
        └────────┬────────────┘
                 │
                 ▼
         ┌──────────────────────┐
         │ Output Sanitization  │ ← Redacts credentials
         └──────────────────────┘
```

## Incident Response

If suspicious activity detected:

1. **Immediate**: Stop all gate check executions
2. **Investigation**: Review gate check logs and success_criteria sources
3. **Remediation**: Update allowed success_criteria sources
4. **Recovery**: Re-run gate checks with validated criteria
5. **Post-mortem**: Audit configuration and access controls

## References

- CWE-78: Improper Neutralization of Special Elements used in an OS Command
- OWASP A03:2021 – Injection
- CWE-22: Improper Limitation of a Pathname to a Restricted Directory
```

### Why This Matters:
- Documents the trusted input assumption clearly
- Provides deployment security checklist
- Explains the threat model
- Guides incident response

---

## Implementation Priority

### Phase 1 (Immediate - 1 hour)
1. Fix #1: Path traversal validation ✓
2. Fix #6: Documentation ✓

### Phase 2 (This week - 2 hours)
3. Fix #2: JSON schema validation ✓
4. Fix #3: Secure temp files ✓

### Phase 3 (This sprint - 1 hour)
5. Fix #4: Total execution time limits ✓
6. Fix #5: Output sanitization ✓

### Phase 4 (Testing)
7. Add security tests to test-gate-check.sh
8. Run security audit again
9. Document changes in changelog

---

## Verification Checklist

After implementing fixes, verify:

- [ ] Path traversal validation blocks invalid paths
- [ ] JSON schema validation catches invalid fields
- [ ] Temp files created with 600 permissions
- [ ] Total execution time limit enforced
- [ ] Output sanitization redacts credentials
- [ ] All tests passing
- [ ] No new failures in existing test suite
- [ ] Security audit confidence increased to 0.88+

