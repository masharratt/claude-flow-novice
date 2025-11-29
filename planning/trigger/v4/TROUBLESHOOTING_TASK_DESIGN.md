# MDAP v2 Troubleshooting Task Design

**Status**: Design | **Version**: 1.0 | **Date**: 2025-11-28

## Executive Summary

Troubleshooting is fundamentally different from code generation:
- **Implementation**: Task description → Code + Tests → Success if tests pass
- **Troubleshooting**: Error + Context → Diagnosis → Fix → Validate error is gone

This document designs a new task type (`cfn-troubleshooter`) optimized for debugging workflows within MDAP v2.

---

## Problem Analysis

### Implementation Task vs Troubleshooting Task

| Aspect | Implementation | Troubleshooting |
|--------|----------------|-----------------|
| **Input** | Task description | Error + context files + repro steps |
| **Output** | Code + tests | Root cause + fix + validation proof |
| **Validation** | Tests pass? | Error reproduces? → Error gone? |
| **Iteration** | Generate → test → done | Hypothesize → investigate → validate |
| **Context** | Implicit | Must be explicit (logs, stack traces) |
| **Success** | Code works | Error is fixed |
| **Scope** | Single function/module | Spans multiple files/systems |

### Why Current MDAP v2 Fails

1. **No File Context**
   - Can't read error logs or stack traces
   - Only has task description
   - Missing crucial diagnostic data

2. **Wrong Validation**
   - Implementation checks: "Do tests pass?"
   - Troubleshooting needs: "Does error still occur?"
   - Can't execute reproduction steps

3. **Insufficient Iteration Budget**
   - Simple: 2 iterations
   - Moderate: 3 iterations
   - Complex: 5 iterations
   - But troubleshooting often needs: 8-15 hypothesis cycles

4. **No Hypothesis Tracking**
   - Doesn't remember what was already tried
   - Can't ask follow-up questions
   - No narrowing of investigation scope

---

## Troubleshooting Task Design

### Phase-Based Investigation

```
┌─────────────────────────────────────────────────────────┐
│ Phase 1: TRIAGE (5 min)                                │
│ ├─ Parse error message                                 │
│ ├─ Identify error type (syntax/runtime/logic/perf)   │
│ ├─ Determine scope (single file/module/system)       │
│ └─ Assess complexity (simple/moderate/complex)        │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 2: INVESTIGATION (iterative)                      │
│ ├─ Read relevant code/logs                             │
│ ├─ Form hypothesis about root cause                    │
│ ├─ Propose diagnostic test or code change            │
│ ├─ Execute validation (repro script)                  │
│ └─ Repeat if error still occurs                       │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 3: DIAGNOSIS (when hypothesis confirmed)         │
│ ├─ Explain root cause clearly                         │
│ ├─ Point to exact line(s) causing issue              │
│ ├─ Explain why it's failing                          │
│ └─ Rate confidence (0-100%)                          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 4: FIX IMPLEMENTATION                             │
│ ├─ Generate minimal fix                               │
│ ├─ Include code comments explaining fix              │
│ ├─ Preserve existing functionality                    │
│ └─ No unnecessary refactoring                        │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Phase 5: VALIDATION (critical)                         │
│ ├─ Run reproduction script                            │
│ ├─ Error reproduces before fix? ✓                     │
│ ├─ Error gone after fix? ✓                            │
│ ├─ All other tests pass? ✓                            │
│ └─ No regression detected? ✓                          │
└─────────────────────────────────────────────────────────┘
```

### Task Payload

```typescript
interface TroubleshooterPayload {
  // Identification
  taskId: string;                           // Unique task ID
  agentId: string;                          // Debugging agent

  // Error Context
  errorMessage: string;                     // Full error message/stack trace
  errorType: "syntax" | "runtime" | "logic" | "performance" | "unknown";
  affectedFile?: string;                    // Primary file (if known)

  // Code Context
  codeFiles: {
    path: string;
    content: string;
    isAffected?: boolean;                   // Is this file part of the bug?
  }[];

  // Reproduction
  reproductionSteps: string;                // How to reproduce (e.g., "run npm test -- AgentCard.test.ts")
  reproductionScript: string;               // Shell script that reproduces the error
  expectedBehavior: string;                 // What should happen
  actualBehavior: string;                   // What actually happens

  // Scope and Constraints
  scope: "single-file" | "module" | "system";
  affectedComponents?: string[];            // Components involved
  constraints?: string[];                   // "Don't change API", "Must maintain performance"

  // Investigation
  previousHypotheses?: string[];            // What's already been tried
  additionalContext?: string;               // Background info (version, env, etc)

  // Configuration
  maxInvestigationCycles: number;           // Max hypothesis cycles (default: 10)
  strictValidation: boolean;                // Require error reproduction confirmation
  timeout: number;                          // Task timeout (ms)
}
```

### Result Structure

```typescript
interface TroubleshooterResult {
  success: boolean;
  taskId: string;
  agentId: string;

  // Diagnosis
  rootCause: {
    description: string;                    // What's actually broken
    explanation: string;                    // Why it's broken
    affectedLines: {
      file: string;
      line: number;
      code: string;
    }[];
    confidence: number;                     // 0-100 confidence in diagnosis
  };

  // Fix
  fix: {
    description: string;                    // What was changed
    changes: {
      file: string;
      before: string;
      after: string;
      reason: string;
    }[];
  };

  // Investigation Process
  investigation: {
    hypotheses: Array<{
      number: number;
      hypothesis: string;
      testing: string;
      result: "confirmed" | "rejected" | "inconclusive";
      reasoning: string;
    }>;
    totalCycles: number;
    cyclesUsed: number;
  };

  // Validation
  validation: {
    errorReproducedBefore: boolean;         // Could we reproduce the original error?
    errorGoneAfter: boolean;                // Is error gone after fix?
    regressionDetected: boolean;            // Did we break anything else?
    validationScript: string;               // The script we ran to validate
    validationOutput: string;               // Output from validation
  };

  // Metrics
  metrics: {
    investigationTimeMs: number;
    fixTimeMs: number;
    validationTimeMs: number;
    totalTimeMs: number;

    hypothesesTested: number;
    confidence: number;                     // Overall confidence in fix
    quality: number;                        // 0-100 score

    provider: string;                       // Which provider was used
    iterations: number;
    cost: number;
  };

  error?: string;
}
```

---

## Provider Selection for Troubleshooting

Different complexity assessment than implementation:

```typescript
function assessTroubleshootingComplexity(payload: TroubleshooterPayload): Complexity {
  let score = 0;

  // Error Type (0-30 points)
  const errorWeight = {
    "syntax": 5,      // Easy - compiler tells you
    "runtime": 15,    // Medium - stack trace available
    "logic": 25,      // Hard - need to understand intent
    "performance": 25, // Hard - need profiling
    "unknown": 30     // Hardest - no clear error
  };
  score += errorWeight[payload.errorType] || 30;

  // Scope (0-30 points)
  const scopeWeight = {
    "single-file": 10,
    "module": 20,
    "system": 30
  };
  score += scopeWeight[payload.scope] || 20;

  // Code Context (0-20 points)
  score += Math.min(20, payload.codeFiles.length * 2);

  // Previous Attempts (0-20 points)
  score += Math.min(20, (payload.previousHypotheses?.length || 0) * 3);

  // Decision
  if (score <= 30) return "simple";      // Syntax errors, single file
  if (score <= 60) return "moderate";    // Runtime errors, clear stack trace
  return "complex";                       // Logic bugs, multi-system, unknown errors
}

// Provider Routing
{
  simple: {
    provider: "cerebras",
    model: "gpt-oss-120b",
    iterations: 3,
    reasoning: "Syntax/simple runtime errors - quick diagnosis"
  },
  moderate: {
    provider: "cerebras",
    model: "llama-3.3-70b",
    iterations: 5,
    reasoning: "Multi-hypothesis testing with code analysis"
  },
  complex: {
    provider: "sonnet",
    model: "claude-3.5-sonnet",
    iterations: 8,
    reasoning: "Deep code analysis, business logic understanding"
  }
}
```

---

## Validation Strategy

### Reproduction Confirmation

```bash
#!/bin/bash
# 1. BEFORE FIX: Run reproduction script, should fail with original error
echo "[Validation] Testing original error reproduction..."
if bash "$REPRO_SCRIPT" 2>&1 | grep -q "$ERROR_PATTERN"; then
  echo "✓ Original error reproduced"
  ORIGINAL_ERROR_CONFIRMED=true
else
  echo "⚠ Warning: Original error not reproduced (might already be fixed)"
  ORIGINAL_ERROR_CONFIRMED=false
fi

# 2. AFTER FIX: Run reproduction script, should NOT contain error
echo "[Validation] Testing fix..."
if bash "$REPRO_SCRIPT" 2>&1 | grep -q "$ERROR_PATTERN"; then
  echo "✗ Error still present after fix"
  FIX_SUCCESSFUL=false
else
  echo "✓ Error is gone"
  FIX_SUCCESSFUL=true
fi

# 3. REGRESSION: Run full test suite
echo "[Validation] Checking for regressions..."
if npm test 2>&1 | grep -q "failed\|error"; then
  echo "⚠ Some tests failed - possible regression"
  REGRESSION_DETECTED=true
else
  echo "✓ All tests pass"
  REGRESSION_DETECTED=false
fi
```

### Success Criteria

```typescript
const validationSuccess = {
  // Minimum (for approval)
  minimum: {
    errorReproducedBefore: true,     // We verified the bug exists
    errorGoneAfter: true,            // Fix actually works
  },

  // High confidence (for merge)
  highConfidence: {
    errorReproducedBefore: true,
    errorGoneAfter: true,
    regressionDetected: false,       // Didn't break anything
    confidence: >= 85,               // Diagnosis confidence >85%
  },

  // Production ready
  productionReady: {
    errorReproducedBefore: true,
    errorGoneAfter: true,
    regressionDetected: false,
    confidence: >= 95,
    validationOutput: passes all checks
  }
};
```

---

## Example Workflows

### Example 1: Syntax Error (Simple)

```
Input:
  Error: "Unexpected token }"
  File: src/components/AgentCard.tsx:42
  Code: [AgentCard.tsx content]

Phase 1 - TRIAGE:
  Type: Syntax
  Scope: Single file
  Complexity: Simple
  → Route to: Cerebras gpt-oss-120b, 3 iterations

Phase 2-3 - INVESTIGATION + DIAGNOSIS:
  Hypothesis 1: Missing closing parenthesis in function call
  → Check line 42 area
  → Found: "return (<div>{condition && <Component>"
  → Missing closing parenthesis on component
  Confidence: 95%

Phase 4 - FIX:
  Change: "return (<div>{condition && <Component>"
  To:     "return (<div>{condition && <Component/>}</div>)"

Phase 5 - VALIDATION:
  Repro script: "npx tsc --noEmit"
  Before fix: "error TS1005: '}' expected"
  After fix:  ✓ No errors

Result: SUCCESS, confidence 95%, quality 98/100
```

### Example 2: Logic Bug (Complex)

```
Input:
  Error: "Agent status shows 'running' but task is done"
  Type: Logic error
  Files: [AgentStatus.tsx, useAgentMetrics.ts, cfn-implementer.ts]
  Repro: "Start task → Wait for completion → Status still shows running"
  Scope: Multi-file, multi-module

Phase 1 - TRIAGE:
  Type: Logic
  Scope: Module (3 files)
  Complexity: Complex
  → Route to: Sonnet, 8 iterations

Phase 2-3 - INVESTIGATION (simplified):
  H1: Redux state not updating → Check store actions
  H2: Async race condition → Check useEffect cleanup
  H3: Redis signal not being received → Check Redis listener
  H4: Status comparison bug → Found it!
     Line cfn-implementer.ts:145
     Comparing status === "COMPLETE" but status is "COMPLETED"

Phase 4 - FIX:
  Change: if (status === "COMPLETE")
  To:     if (status === "COMPLETED")

Phase 5 - VALIDATION:
  Repro: Start task, wait for completion, check UI
  Before: Status shows "running" indefinitely
  After: Status correctly shows "completed"

Result: SUCCESS, confidence 92%, quality 94/100
```

### Example 3: Performance Bug (Complex)

```
Input:
  Error: "Dashboard renders in 5 seconds, should be <500ms"
  Type: Performance
  Files: [Dashboard.tsx, MetricsPanel.tsx, useAgentMetrics.ts]
  Scope: Module (connected components)

Phase 1 - TRIAGE:
  Type: Performance
  Scope: System
  Complexity: Complex
  → Route to: Sonnet, 8 iterations

Phase 2-3 - INVESTIGATION:
  H1: Unnecessary re-renders → Check memo/useMemo
  H2: Inefficient queries → Check data fetching
  H3: Large data set rendering → Check virtualization
  H4: Found: useAgentMetrics hook runs selector on every render
     → Creates new object every time → Forces re-render

Phase 4 - FIX:
  Wrap selector in useMemo:
  const metrics = useMemo(
    () => selectMetrics(state),
    [state]
  );

Phase 5 - VALIDATION:
  Profiler before: 4800ms
  Profiler after: 220ms (22x faster)

Result: SUCCESS, confidence 90%, quality 92/100
```

---

## Integration with CFN Loop

### Phase Mapping

**Loop 3 (Investigation)**:
- Troubleshooter runs investigation phases 1-4
- Uses provider router for complexity-based provider selection
- Extended iteration budget (3-8 cycles vs 2-5 for impl)
- Output: Root cause + fix + validation plan

**Loop 2 (Review)**:
- Validator reviews:
  1. Is root cause diagnosis sound?
  2. Is fix minimal and correct?
  3. Does validation prove fix works?
  4. Are there edge cases?
- Decision: APPROVE, REQUEST_CHANGES, REJECT

**Product Owner**:
- Reviews validator feedback
- Decision: PROCEED (merge), ITERATE (more investigation), ABORT (escalate)

### Redis Coordination

```json
{
  "taskId": "trouble-20251128-agent-status",
  "phase": "investigation",
  "hypothesis": "Status comparison mismatch",
  "confidence": 85,
  "validationRequired": true,
  "validationScript": "npm test -- AgentStatus.test.ts",
  "expectedPattern": "passed",
  "status": "completed",
  "timestamp": "2025-11-28T10:30:45Z"
}
```

---

## Implementation Roadmap

### MVP (Phase 1)
- [ ] Create `cfn-troubleshooter.ts` task
- [ ] Implement TRIAGE + DIAGNOSIS phases
- [ ] File reading capability
- [ ] Basic validation (error goes away?)
- [ ] 3-5 iteration budget
- [ ] Moderate/Complex → Sonnet only

### Phase 2
- [ ] INVESTIGATION phase with hypothesis tracking
- [ ] Extended iteration budget (8-10 cycles)
- [ ] Reproduction script execution
- [ ] Regression detection (full test suite)
- [ ] Simple → Cerebras routing

### Phase 3
- [ ] Incremental context narrowing
- [ ] Follow-up questions ("Is X enabled?")
- [ ] Stack trace parsing and analysis
- [ ] Performance profiling integration
- [ ] Confidence scoring per hypothesis

### Phase 4
- [ ] Multi-agent investigation (parallel hypothesis testing)
- [ ] Codebase navigation (find related functions)
- [ ] Git history analysis (what changed?)
- [ ] Log aggregation (multiple error sources)

---

## Key Differences from Implementation Task

| Feature | Implementation | Troubleshooting |
|---------|----------------|-----------------|
| **Input** | Task description | Error + context files |
| **Validation** | Tests pass | Error reproduces → gone |
| **Iteration** | Generate & test | Hypothesize & investigate |
| **Context** | Implicit | Explicit (logs, code, repro) |
| **File I/O** | Not needed | Critical |
| **Complexity** | Task scope | Error type + affected scope |
| **Iterations** | 2-5 | 3-10 |
| **Output** | Code + tests | Root cause + fix + proof |

---

## Success Metrics

### For Individual Task
- ✅ Error reproduced before fix
- ✅ Error gone after fix
- ✅ No regressions detected
- ✅ Confidence ≥85%
- ✅ Quality ≥85/100

### For Integration
- ✅ 90%+ success rate on "medium" bugs
- ✅ <2 minutes per simple bug
- ✅ <5 minutes per moderate bug
- ✅ <10 minutes per complex bug
- ✅ Validator approval rate ≥80%

---

## Questions for Implementation

1. **File I/O**: How should we read files? Via task payload, or from workspace mount?
2. **Validation Timeout**: How long to wait for reproduction script? (default: 30s)
3. **Iteration Limits**: Should we be strict about max cycles or allow override?
4. **Confidence Scoring**: How should we weight diagnosis confidence vs fix correctness?
5. **Fallback Strategy**: If Sonnet fails, should we escalate to human or retry with more context?

---

## References

- Current Implementation Task: `src/trigger/cfn-implementer-cerebras.ts`
- Provider Router: `src/lib/provider-router.ts`
- CFN Loop Integration: `docker/trigger-dev/CLAUDE.md`
- Benchmark Results: `test-cerebras-v2-benchmark.ts`

---

**Status**: Design Ready | **Next Step**: Review and feedback before implementation
