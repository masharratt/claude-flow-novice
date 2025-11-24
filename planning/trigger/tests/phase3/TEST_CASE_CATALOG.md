# Phase 3 Test Case Catalog

**Total Test Cases**: 144
**Last Updated**: 2025-11-23

---

## Test Case Numbering Convention

Format: `P3-{Category}-{Script}-{Number}`

**Categories**:
- **UNIT**: Unit tests (Jest/TypeScript)
- **INT**: Integration tests (Bash)
- **EDGE**: Edge case tests (Bash)
- **SEC**: Security tests (Bash)

---

## Unit Tests (55 total)

### Schema Validation (15 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-UNIT-SCHEMA-01 | Accept minimal valid MVP payload | Pass |
| P3-UNIT-SCHEMA-02 | Accept full payload with all optional fields | Pass |
| P3-UNIT-SCHEMA-03 | Accept all valid modes (mvp, standard, enterprise) | Pass |
| P3-UNIT-SCHEMA-04 | Reject missing taskId | Throw error |
| P3-UNIT-SCHEMA-05 | Reject invalid taskId format (path traversal) | Throw error |
| P3-UNIT-SCHEMA-06 | Reject invalid mode | Throw error |
| P3-UNIT-SCHEMA-07 | Reject empty agents array | Throw error |
| P3-UNIT-SCHEMA-08 | Reject negative iteration | Throw error |
| P3-UNIT-SCHEMA-09 | Reject iteration exceeding maxIterations | Throw error |
| P3-UNIT-SCHEMA-10 | Validate agent type (non-empty string) | Throw error on empty |
| P3-UNIT-SCHEMA-11 | Validate agent task (non-empty string) | Throw error on empty |
| P3-UNIT-SCHEMA-12 | Accept multiple agents in correct order | Pass |
| P3-UNIT-SCHEMA-13 | Accept optional context object | Pass |
| P3-UNIT-SCHEMA-14 | Accept empty context object | Pass |
| P3-UNIT-SCHEMA-15 | Reject malformed context (non-object) | Throw error |

### Confidence Parsing (12 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-UNIT-CONF-01 | Parse "Confidence: 0.95" format | Return 0.95 |
| P3-UNIT-CONF-02 | Parse "Confidence Score: 0.85" format | Return 0.85 |
| P3-UNIT-CONF-03 | Parse confidence at end of output | Return correct value |
| P3-UNIT-CONF-04 | Parse confidence in middle of output | Return correct value |
| P3-UNIT-CONF-05 | Parse confidence with extra whitespace | Return correct value |
| P3-UNIT-CONF-06 | Parse last confidence when multiple present | Return last value |
| P3-UNIT-CONF-07 | Return null when confidence missing | Return null |
| P3-UNIT-CONF-08 | Return null for malformed confidence (no number) | Return null |
| P3-UNIT-CONF-09 | Return null for out-of-range confidence (>1.0) | Return null |
| P3-UNIT-CONF-10 | Return null for out-of-range confidence (<0.0) | Return null |
| P3-UNIT-CONF-11 | Return null for empty output | Return null |
| P3-UNIT-CONF-12 | Return null for whitespace-only output | Return null |

### Gate Logic (18 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-UNIT-GATE-01 | MVP: Pass when confidence equals threshold (0.70) | Pass |
| P3-UNIT-GATE-02 | MVP: Pass when confidence exceeds threshold (0.75) | Pass |
| P3-UNIT-GATE-03 | MVP: Fail when confidence below threshold (0.69) | Fail |
| P3-UNIT-GATE-04 | Standard: Pass when confidence equals threshold (0.95) | Pass |
| P3-UNIT-GATE-05 | Standard: Pass when confidence exceeds threshold (0.97) | Pass |
| P3-UNIT-GATE-06 | Standard: Fail when confidence below threshold (0.94) | Fail |
| P3-UNIT-GATE-07 | Enterprise: Pass when confidence equals threshold (0.98) | Pass |
| P3-UNIT-GATE-08 | Enterprise: Pass when confidence exceeds threshold (0.99) | Pass |
| P3-UNIT-GATE-09 | Enterprise: Fail when confidence below threshold (0.97) | Fail |
| P3-UNIT-GATE-10 | Handle perfect confidence (1.0) in all modes | Pass |
| P3-UNIT-GATE-11 | Handle zero confidence (0.0) in all modes | Fail |
| P3-UNIT-GATE-12 | Return correct mode in result | Pass |
| P3-UNIT-GATE-13 | Calculate average confidence from multiple agents | Return average |
| P3-UNIT-GATE-14 | Pass gate when average exceeds threshold | Pass |
| P3-UNIT-GATE-15 | Fail gate when average below threshold | Fail |
| P3-UNIT-GATE-16 | Handle single agent (no aggregation) | Return single value |
| P3-UNIT-GATE-17 | Exclude null confidences from average | Calculate correctly |
| P3-UNIT-GATE-18 | Validate threshold boundaries (0.70, 0.95, 0.98) | Pass/Fail correctly |

### Iteration Context (10 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-UNIT-CTX-01 | Create initial context for iteration 1 | No previous results |
| P3-UNIT-CTX-02 | Create context with previous results for iteration 2 | Include previous |
| P3-UNIT-CTX-03 | Include validator feedback in context | Feedback present |
| P3-UNIT-CTX-04 | Propagate context to next iteration on gate failure | Increment iteration |
| P3-UNIT-CTX-05 | Preserve validator feedback across iterations | Feedback preserved |
| P3-UNIT-CTX-06 | Allow iteration within max limit | Within limit |
| P3-UNIT-CTX-07 | Block iteration exceeding max limit | Blocked |
| P3-UNIT-CTX-08 | Allow iteration at max limit boundary | Within limit |
| P3-UNIT-CTX-09 | Serialize context to JSON for event payload | Valid JSON |
| P3-UNIT-CTX-10 | Deserialize context from JSON | Correct object |

---

## Integration Tests (37 total)

### Sequential Spawning (8 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-INT-SEQ-01 | Agents spawn sequentially (not concurrently) | Sequential timing |
| P3-INT-SEQ-02 | Agent execution order matches payload order | Correct order |
| P3-INT-SEQ-03 | Stdout captured from each agent sequentially | All output captured |
| P3-INT-SEQ-04 | Each agent completes before next starts | No overlap |
| P3-INT-SEQ-05 | Agent containers cleaned up after execution | No lingering containers |
| P3-INT-SEQ-06 | Sequential spawn timing measured correctly | Timing data accurate |
| P3-INT-SEQ-07 | Agent stdout logged to correct files | File per agent |
| P3-INT-SEQ-08 | All agents receive correct taskId | TaskId propagated |

### Gate Pass Triggers Loop 2 (6 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-INT-LOOP2-01 | Loop 2 event triggered when confidence >= threshold (MVP) | Event triggered |
| P3-INT-LOOP2-02 | Loop 2 event contains correct payload | Valid payload |
| P3-INT-LOOP2-03 | Loop 2 event triggered in Standard mode | Event triggered |
| P3-INT-LOOP2-04 | Loop 2 event triggered in Enterprise mode | Event triggered |
| P3-INT-LOOP2-05 | Loop 2 event includes Loop 3 results | Results included |
| P3-INT-LOOP2-06 | Multi-agent average triggers Loop 2 correctly | Aggregation correct |

### Gate Fail Iteration (7 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-INT-ITER-01 | Iteration event triggered when confidence < threshold | Event triggered |
| P3-INT-ITER-02 | Iteration event contains previous results | Results included |
| P3-INT-ITER-03 | Iteration increments correctly | Iteration N+1 |
| P3-INT-ITER-04 | Context propagated to next iteration | Context preserved |
| P3-INT-ITER-05 | Gate failure in MVP mode triggers iteration | Event triggered |
| P3-INT-ITER-06 | Gate failure in Standard mode triggers iteration | Event triggered |
| P3-INT-ITER-07 | Gate failure in Enterprise mode triggers iteration | Event triggered |

### Max Iterations (5 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-INT-MAX-01 | Allow iteration within max limit | Continue |
| P3-INT-MAX-02 | Block iteration exceeding max limit | Abort |
| P3-INT-MAX-03 | MVP max iterations (5) enforced | Limit enforced |
| P3-INT-MAX-04 | Standard max iterations (10) enforced | Limit enforced |
| P3-INT-MAX-05 | Enterprise max iterations (15) enforced | Limit enforced |

### Container Cleanup (6 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-INT-CLEAN-01 | Agent containers removed after successful execution | No containers |
| P3-INT-CLEAN-02 | Agent containers removed after failed execution | No containers |
| P3-INT-CLEAN-03 | Docker networks cleaned up | No networks |
| P3-INT-CLEAN-04 | Cleanup handles multiple agents | All removed |
| P3-INT-CLEAN-05 | Cleanup idempotent (can run multiple times) | No errors |
| P3-INT-CLEAN-06 | Cleanup logs errors but doesn't fail | Graceful handling |

### Network Isolation (5 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-INT-NET-01 | Each agent has isolated network | Isolation verified |
| P3-INT-NET-02 | Agents cannot access each other's networks | No cross-talk |
| P3-INT-NET-03 | Network names unique per taskId | Unique names |
| P3-INT-NET-04 | Network cleanup after execution | Networks removed |
| P3-INT-NET-05 | Network creation errors handled gracefully | Error handling |

---

## Edge Case Tests (32 total)

### Agent Failure (8 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-EDGE-FAIL-01 | Agent exits with non-zero code | Exit code captured |
| P3-EDGE-FAIL-02 | Workflow aborts on agent failure | Abort correctly |
| P3-EDGE-FAIL-03 | Stderr captured from failed agent | Stderr logged |
| P3-EDGE-FAIL-04 | Failed agent exit code propagated | Code propagated |
| P3-EDGE-FAIL-05 | Cleanup runs even after failure | Cleanup executed |
| P3-EDGE-FAIL-06 | Agent crash (SIGKILL) handled | Crash detected |
| P3-EDGE-FAIL-07 | Agent timeout (hung process) handled | Timeout enforced |
| P3-EDGE-FAIL-08 | Multiple agent failures logged correctly | All failures logged |

### Missing Confidence (6 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-EDGE-CONF-01 | Agent output without confidence treated as null | Null returned |
| P3-EDGE-CONF-02 | Gate fails when confidence missing | Fail gate |
| P3-EDGE-CONF-03 | Workflow continues with warning | Warning logged |
| P3-EDGE-CONF-04 | Multi-agent: Some missing confidences excluded | Average calculated |
| P3-EDGE-CONF-05 | All missing confidences causes gate failure | Fail gate |
| P3-EDGE-CONF-06 | Missing confidence logged to stderr | Error logged |

### Malformed Output (7 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-EDGE-MAL-01 | Binary output handled gracefully | No crash |
| P3-EDGE-MAL-02 | Extremely long output (>1MB) truncated | Truncation logged |
| P3-EDGE-MAL-03 | Invalid UTF-8 sequences handled | Encoding error |
| P3-EDGE-MAL-04 | Empty stdout handled | Empty output logged |
| P3-EDGE-MAL-05 | Output with null bytes handled | Sanitized |
| P3-EDGE-MAL-06 | ANSI escape codes stripped correctly | Clean output |
| P3-EDGE-MAL-07 | JSON parsing errors handled (if applicable) | Error logged |

### Network Timeout (5 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-EDGE-NET-01 | Agent startup timeout (30s) enforced | Timeout logged |
| P3-EDGE-NET-02 | Network connectivity timeout handled | Timeout error |
| P3-EDGE-NET-03 | Docker daemon unresponsive handled | Error logged |
| P3-EDGE-NET-04 | Container pull timeout handled | Timeout error |
| P3-EDGE-NET-05 | Long-running agent timeout (5min) enforced | Timeout enforced |

### Resource Exhaustion (6 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-EDGE-RES-01 | Agent OOM (out of memory) handled | OOM detected |
| P3-EDGE-RES-02 | CPU limit exceeded logged | Limit logged |
| P3-EDGE-RES-03 | Disk space exhaustion handled | Error logged |
| P3-EDGE-RES-04 | Docker daemon resource limits respected | Limits enforced |
| P3-EDGE-RES-05 | Multiple agents competing for resources | Fair allocation |
| P3-EDGE-RES-06 | Resource cleanup after agent killed | Resources released |

---

## Security Tests (20 total)

### TaskId Validation (8 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-SEC-TASK-01 | Reject taskId with path traversal (../) | Rejected |
| P3-SEC-TASK-02 | Accept valid alphanumeric taskId | Accepted |
| P3-SEC-TASK-03 | Reject taskId with special characters (~!@#$) | Rejected |
| P3-SEC-TASK-04 | Reject taskId exceeding length limit (100 chars) | Rejected |
| P3-SEC-TASK-05 | Reject taskId with null bytes | Rejected |
| P3-SEC-TASK-06 | Reject taskId with absolute paths (/etc/passwd) | Rejected |
| P3-SEC-TASK-07 | Reject taskId with environment variable injection | Rejected |
| P3-SEC-TASK-08 | Accept taskId with hyphens and underscores | Accepted |

### Shell Injection (7 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-SEC-SHELL-01 | Reject task description with shell metacharacters | Escaped |
| P3-SEC-SHELL-02 | Reject task description with command substitution | Escaped |
| P3-SEC-SHELL-03 | Reject agent output with backticks | Escaped |
| P3-SEC-SHELL-04 | Reject agent type with semicolons | Rejected |
| P3-SEC-SHELL-05 | Accept task description with quotes (properly escaped) | Escaped |
| P3-SEC-SHELL-06 | Reject task description with pipe characters | Escaped |
| P3-SEC-SHELL-07 | Reject environment variables with injection attempts | Rejected |

### Environment Sanitization (5 cases)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| P3-SEC-ENV-01 | Validate environment variable names (alphanumeric) | Valid only |
| P3-SEC-ENV-02 | Reject environment variables with shell injection | Rejected |
| P3-SEC-ENV-03 | Sanitize environment variable values | Sanitized |
| P3-SEC-ENV-04 | Prevent LD_PRELOAD injection | Blocked |
| P3-SEC-ENV-05 | Validate Docker environment variable limits | Enforced |

---

## Test Execution Order

### Phase 1: Unit Tests (Fast - 1-2 minutes)
1. Schema validation (15 cases)
2. Confidence parsing (12 cases)
3. Gate logic (18 cases)
4. Iteration context (10 cases)

**Total**: 55 cases

### Phase 2: Integration Tests (Medium - 5-10 minutes)
1. Sequential spawning (8 cases)
2. Gate pass triggers Loop 2 (6 cases)
3. Gate fail iteration (7 cases)
4. Max iterations (5 cases)
5. Container cleanup (6 cases)
6. Network isolation (5 cases)

**Total**: 37 cases

### Phase 3: Edge Cases (Medium - 5-10 minutes)
1. Agent failure (8 cases)
2. Missing confidence (6 cases)
3. Malformed output (7 cases)
4. Network timeout (5 cases)
5. Resource exhaustion (6 cases)

**Total**: 32 cases

### Phase 4: Security Tests (Fast - 2-3 minutes)
1. TaskId validation (8 cases)
2. Shell injection (7 cases)
3. Environment sanitization (5 cases)

**Total**: 20 cases

---

## Coverage Analysis

### Functional Coverage

| Area | Coverage | Test Cases |
|------|----------|------------|
| Payload validation | 100% | 15 |
| Confidence parsing | 100% | 12 |
| Quality gate logic | 100% | 18 |
| Sequential spawning | 100% | 8 |
| Event triggering | 100% | 13 |
| Iteration management | 100% | 12 |
| Container lifecycle | 100% | 14 |
| Error handling | 100% | 16 |
| Security validation | 100% | 20 |

### Risk Coverage

| Risk | Mitigation | Test Cases |
|------|------------|------------|
| Path traversal attacks | TaskId validation | 8 |
| Shell injection | Input sanitization | 7 |
| Resource exhaustion | Limit enforcement | 6 |
| Agent failures | Error handling | 8 |
| Network issues | Timeout/isolation | 10 |
| Data corruption | Output validation | 7 |
| Concurrent access | Sequential execution | 8 |

---

## Test Data Requirements

### Valid Payloads

```json
{
  "minimal_mvp": {
    "taskId": "task-123",
    "taskDescription": "Implement feature",
    "mode": "mvp",
    "iteration": 1,
    "agents": [
      { "type": "backend-developer", "task": "Implement API" }
    ]
  },
  "full_standard": {
    "taskId": "task-456",
    "taskDescription": "Implement feature with tests",
    "mode": "standard",
    "iteration": 2,
    "maxIterations": 10,
    "agents": [
      { "type": "backend-developer", "task": "Implement API" },
      { "type": "frontend-developer", "task": "Build UI" },
      { "type": "tester", "task": "Write tests" }
    ],
    "context": {
      "previousResults": { "confidence": 0.85 },
      "validatorFeedback": ["Add error handling"]
    }
  }
}
```

### Invalid Payloads

```json
{
  "path_traversal": {
    "taskId": "../../../etc/passwd",
    "taskDescription": "Malicious",
    "mode": "mvp",
    "iteration": 1,
    "agents": [{ "type": "test", "task": "test" }]
  },
  "shell_injection": {
    "taskId": "task-123",
    "taskDescription": "Test $(rm -rf /)",
    "mode": "mvp",
    "iteration": 1,
    "agents": [{ "type": "test; rm -rf /", "task": "test" }]
  }
}
```

---

## Test Reporting Template

```markdown
# Phase 3 Test Execution Report

**Date**: YYYY-MM-DD
**Execution Time**: X minutes
**Pass Rate**: XX/144 (XX%)

## Summary

| Category | Total | Pass | Fail | Skip |
|----------|-------|------|------|------|
| Unit Tests | 55 | XX | XX | XX |
| Integration | 37 | XX | XX | XX |
| Edge Cases | 32 | XX | XX | XX |
| Security | 20 | XX | XX | XX |
| **Total** | **144** | **XX** | **XX** | **XX** |

## Failed Tests

- P3-XXX-XXX: Description of failure
- ...

## Recommendations

- ...
```

---

**Confidence**: 0.94

This catalog provides:
1. ✅ Complete enumeration of all 144 test cases
2. ✅ Unique IDs for traceability
3. ✅ Execution order and timing estimates
4. ✅ Coverage analysis (functional + risk)
5. ✅ Test data requirements (valid/invalid payloads)
6. ✅ Reporting template for execution results
