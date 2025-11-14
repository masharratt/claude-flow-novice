# Security Vulnerability Remediation Checklist

**Status:** ACTION REQUIRED
**Priority Level:** CRITICAL
**Target Gate:** 0.90+ Confidence (Enterprise Mode)

---

## Vulnerability #1: Environment Variable Injection (CVSS 8.1)

### Whitelist Validation
- [x] Dangerous variable list implemented
- [x] LD_PRELOAD blocked
- [x] DOCKER_HOST blocked
- [x] LD_LIBRARY_PATH blocked
- [x] Format validation (VAR_NAME=value)
- [x] Integration in spawn-wave.sh

### Control Character Sanitization
- [ ] **CRITICAL: Replace control character conversion with removal**
  - **File:** `.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh`
  - **Line:** 250
  - **Current:** `value=$(echo "$value" | LC_ALL=C sed 's/[[:cntrl:]]/ /g')`
  - **Required:** `value=$(echo "$value" | LC_ALL=C sed 's/[[:cntrl:]]//g')`
  - **Reason:** Prevents escape sequence injection through space-separated control chars

### Environment Variable Value Length
- [x] 2048 character limit enforced
- [x] Truncation warning logged

### Test Coverage
- [x] Whitelist rejection tests
- [ ] **REQUIRED: Control character removal test** (currently failing)
- [ ] **REQUIRED: Null byte removal test** (currently failing)

---

## Vulnerability #2: Container Name Collision (CVSS 7.2)

### Hash-Based Naming
- [x] SHA256 implementation confirmed
- [x] 12-character truncation provides sufficient entropy
- [x] Consistent hashing verified
- [x] Different inputs produce different hashes

### Collision Detection
- [x] `container_name_exists()` function implemented
- [x] Exact match filtering prevents false positives
- [x] Detection called in spawn-wave.sh:254-258

### Name Format Validation
- [x] Pattern: `cfn-wave<N>-<12-char-hash>`
- [x] Length < 30 characters (Docker safe)
- [x] Regex validation in place

### Test Coverage
- [x] Hash generation test: PASS
- [x] Consistency test: PASS
- [x] Uniqueness test: PASS
- [x] Long ID truncation test: PASS

**STATUS: FULLY REMEDIATED - NO ACTION REQUIRED**

---

## Vulnerability #3: Task Prompt Injection (CVSS 7.1)

### Current Implementation
- [x] Function called: `sanitize_env_value()` in spawn-wave.sh:275
- [x] Length limit: 2048 characters
- [x] Whitespace normalization: spaces collapsed
- [x] Trim leading/trailing spaces

### Control Character Handling
- [ ] **CRITICAL: Implement proper task prompt sanitization**
  - **File:** `.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh`
  - **Add Function:** `sanitize_task_prompt()`
  - **Implementation Required:**
    ```bash
    sanitize_task_prompt() {
      local prompt="$1"

      # Remove (don't convert) all control characters
      prompt=$(echo "$prompt" | LC_ALL=C sed 's/[[:cntrl:]]//g')

      # Remove shell metacharacters that could escape Docker env parsing
      prompt=$(echo "$prompt" | sed 's/[`$(){}|&;<>]//g')

      # Collapse multiple spaces
      prompt=$(echo "$prompt" | sed 's/[[:space:]]\+/ /g')

      # Trim leading/trailing whitespace
      prompt=$(echo "$prompt" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

      # Enforce length limit
      if (( ${#prompt} > 2048 )); then
        log_warn "Task prompt truncated from ${#prompt} to 2048 chars"
        prompt="${prompt:0:2048}"
      fi

      echo "$prompt"
    }
    ```

### Integration Point
- [ ] **REQUIRED: Update spawn-wave.sh:275**
  - **Change:** `task_prompt=$(sanitize_env_value "$task_prompt")`
  - **To:** `task_prompt=$(sanitize_task_prompt "$task_prompt")`
  - **Reason:** Use specialized function with character removal

### Test Coverage
- [ ] **REQUIRED: Newline removal test** (currently failing)
- [ ] **REQUIRED: Null byte removal test** (currently failing)
- [ ] **REQUIRED: Shell metacharacter removal test**
- [x] Length limit test: PASS
- [x] Space collapsing test: PASS
- [x] Normal text preservation test: PASS

---

## Integration Issue #1: Cleanup Pattern Validation (MEDIUM)

### Current Regex
- **Location:** `.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh:169`
- **Pattern:** `^cfn-wave[0-9]+-[a-zA-Z0-9_-]+(\*)?$`
- **Issue:** Requires alphanumeric component before wildcard

### Required Fix
- [ ] **MEDIUM: Update cleanup pattern regex**
  - **File:** `.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh`
  - **Line:** 169
  - **Current:** `if ! [[ "$pattern" =~ ^cfn-wave[0-9]+-[a-zA-Z0-9_-]+(\*)?$ ]]; then`
  - **Updated:** `if ! [[ "$pattern" =~ ^cfn-wave[0-9]+(-[a-zA-Z0-9_-]*)?(\*)?$ ]]; then`
  - **Reason:** Allows patterns like `cfn-wave1-*` and `cfn-wave1-batch-*`

### Test Coverage
- [ ] **REQUIRED: Wildcard pattern test** (currently failing)
- [x] Dangerous pattern rejection: PASS
- [x] Semicolon pattern rejection: PASS

---

## Implementation Order (Critical Path)

### Phase 1: Control Character Handling (BLOCKING)
**Estimated Time:** 30 minutes
**Risk:** HIGH - Affects both Vulnerability #1 and #3

**Steps:**
1. [ ] Read `.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh`
2. [ ] Create backup via `./.claude/hooks/cfn-invoke-pre-edit.sh`
3. [ ] Update line 250 to remove control characters instead of converting
4. [ ] Run post-edit validation
5. [ ] Re-run security validation test suite
6. [ ] Verify tests pass

### Phase 2: Task Prompt Sanitization (BLOCKING)
**Estimated Time:** 45 minutes
**Risk:** HIGH - Prevents shell injection

**Steps:**
1. [ ] Add `sanitize_task_prompt()` function to docker-helpers.sh
2. [ ] Export function in export block
3. [ ] Update spawn-wave.sh to call `sanitize_task_prompt()`
4. [ ] Create unit tests for new function
5. [ ] Re-run security validation test suite
6. [ ] Verify all tests pass

### Phase 3: Cleanup Pattern Validation (MEDIUM)
**Estimated Time:** 20 minutes
**Risk:** MEDIUM - Affects cleanup operations

**Steps:**
1. [ ] Read cleanup pattern validation function
2. [ ] Update regex to allow pure wildcard patterns
3. [ ] Test with sample patterns
4. [ ] Run security validation test suite
5. [ ] Verify integration tests pass

### Phase 4: Comprehensive Testing (VALIDATION)
**Estimated Time:** 60 minutes
**Risk:** LOW - Verification only

**Steps:**
1. [ ] Execute full security validation test suite
2. [ ] Verify all 21 tests pass
3. [ ] Generate confidence score report
4. [ ] Document test results
5. [ ] Gate check: confirm score >= 0.75

---

## Testing Checklist

### Unit Tests Required
```bash
# Environment Variable Injection
- [ ] Reject LD_PRELOAD
- [ ] Reject DOCKER_HOST
- [ ] Reject LD_LIBRARY_PATH
- [ ] Accept valid variables
- [ ] Reject invalid format
- [ ] Remove control characters (not convert)
- [ ] Enforce 2048 char limit

# Container Name Collision
- [ ] Generate hash-based name
- [ ] Consistent hashing
- [ ] Different inputs → different hashes
- [ ] Collision detection function
- [ ] Safe truncation

# Task Prompt Injection
- [ ] Remove newlines (not convert)
- [ ] Remove null bytes (not convert)
- [ ] Remove escape sequences
- [ ] Preserve normal text
- [ ] Collapse spaces
- [ ] Enforce length limit
- [ ] Remove shell metacharacters

# Integration Tests
- [ ] Cleanup pattern wildcard validation
- [ ] Reject dangerous patterns
- [ ] Reject command injection patterns
```

### Security Validation Test Execution
```bash
# Full test suite (21 tests required)
/tmp/security_validation_test.sh

# Expected output:
# - Tests Passed: 21
# - Tests Failed: 0
# - Status: ALL TESTS PASSED (100%)
```

---

## Success Criteria

### Vulnerability #1: Environment Variable Injection
- [x] Whitelist implemented and validated
- [ ] Control character sanitization removes (not converts) characters
- [x] Format validation in place
- [x] Integration tested
- **Target:** All Unit Tests PASS

### Vulnerability #2: Container Name Collision
- [x] Hash-based naming verified
- [x] Collision detection confirmed
- [x] Safe truncation validated
- [x] All tests PASS
- **Status:** COMPLETE

### Vulnerability #3: Task Prompt Injection
- [ ] Dedicated sanitization function implemented
- [ ] Control characters removed (not converted)
- [ ] Shell metacharacters removed
- [ ] Length limit enforced
- [ ] Integration tested
- **Target:** All Unit Tests PASS

### Overall Security Gate
- **Confidence Score Target:** >= 0.90
- **Test Pass Rate:** 100% (21/21)
- **Integration Status:** All three vulnerabilities remediated
- **Code Quality:** Bash syntax valid, no new injection risks

---

## Rollback Plan

If any phase fails testing:

1. **Automatic Revert:** Use backup system
   ```bash
   ./.claude/skills/pre-edit-backup/revert-file.sh \
     "./.claude/skills/cfn-docker-wave-execution/lib/docker-helpers.sh" \
     --agent-id "$AGENT_ID"
   ```

2. **Manual Rollback:** Git checkout
   ```bash
   git checkout HEAD -- ./.claude/skills/cfn-docker-wave-execution/
   ```

3. **Document Issue:** Create bug report with test failures

---

## Sign-Off Requirements

**Before Production Deployment:**
1. [ ] All 21 security validation tests PASS
2. [ ] Confidence score >= 0.90
3. [ ] Code review completed
4. [ ] No new command injection vectors introduced
5. [ ] Bash syntax validation clean
6. [ ] Documentation updated with security notes

---

**Created:** 2025-11-14
**Target Completion:** Before next release
**Validator:** Security Specialist Agent
**Mode:** Enterprise Security Audit
