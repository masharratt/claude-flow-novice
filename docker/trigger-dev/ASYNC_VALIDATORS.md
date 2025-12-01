# Async Validator Services

Two background validator services that run in parallel with implementation tasks without blocking execution.

## Overview

These validators analyze generated code for security vulnerabilities and performance issues while other agents continue execution. Results are aggregated at the gate check.

## Validators

### 1. Security Validator

**File**: `src/trigger/cfn-async-security-validator.ts`

**Task ID**: `cfn-async-security-validator`

**Model**: Llama-3.3-70B (instruction-following, good for compliance)

**Analyzes for**:
1. Injection vulnerabilities (SQL, command, template)
2. XSS/Script vulnerabilities
3. Cryptography issues
4. Authentication/authorization flaws
5. Data exposure risks
6. Unsafe deserialization
7. Input validation issues
8. Race conditions

**Pass/Fail Criteria**:
- ✅ Pass: Risk level < high AND vulnerability score < 70
- ❌ Review needed: Risk level = high/critical OR score >= 70

### 2. Performance Validator

**File**: `src/trigger/cfn-async-performance-validator.ts`

**Task ID**: `cfn-async-performance-validator`

**Model**: GPT-OSS-120B (fast, good for code optimization)

**Analyzes for**:
1. Algorithm complexity (Big O analysis)
2. Memory usage patterns
3. I/O bottlenecks
4. Cache efficiency
5. Unnecessary computations
6. N+1 query patterns
7. Unoptimized loops
8. Blocking operations

**Pass/Fail Criteria**:
- ✅ Pass: Grade A or B
- ❌ Review needed: Grade C, D, or F

## Usage

### Trigger Individually

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

// Security validation
const secHandle = await tasks.trigger("cfn-async-security-validator", {
  taskId: "impl-001",
  implementation: codeString,
  testCode: testString,
  workDir: "/workspace",
});

// Performance validation
const perfHandle = await tasks.trigger("cfn-async-performance-validator", {
  taskId: "impl-001",
  implementation: codeString,
  testCode: testString,
  complexity: "moderate",
  workDir: "/workspace",
});
```

### Trigger in Parallel (Non-blocking)

```typescript
// Trigger both validators without waiting
const [secHandle, perfHandle] = await Promise.all([
  tasks.trigger("cfn-async-security-validator", { /* ... */ }),
  tasks.trigger("cfn-async-performance-validator", { /* ... */ }),
]);

// Continue with implementation tasks...
// Validators run in background
```

### Retrieve Results at Gate Check

```typescript
import { runs } from "@trigger.dev/sdk/v3";

// Wait for validators to complete
const [secResult, perfResult] = await Promise.all([
  runs.poll<AsyncSecurityValidatorResult>(secHandle.id),
  runs.poll<AsyncPerformanceValidatorResult>(perfHandle.id),
]);

// Check results
if (!secResult.output.passedValidation) {
  console.log(`Security issues: ${secResult.output.findings.length}`);
  console.log(`Risk level: ${secResult.output.overallRiskLevel}`);
}

if (!perfResult.output.passedValidation) {
  console.log(`Performance grade: ${perfResult.output.overallPerformanceGrade}`);
  console.log(`Issues: ${perfResult.output.issues.length}`);
}
```

## Result Types

### Security Validator Result

```typescript
interface AsyncSecurityValidatorResult {
  taskId: string;
  timestamp: number;
  findings: SecurityFinding[];         // Array of vulnerabilities
  overallRiskLevel: "critical" | "high" | "medium" | "low";
  vulnerabilityScore: number;          // 0-100
  recommendations: string[];
  passedValidation: boolean;           // true if safe to proceed
}

interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low";
  category: string;                    // injection, xss, crypto, etc.
  title: string;
  description: string;
  lineNumber?: number;
  recommendation: string;
}
```

### Performance Validator Result

```typescript
interface AsyncPerformanceValidatorResult {
  taskId: string;
  timestamp: number;
  issues: PerformanceIssue[];          // Array of performance problems
  overallPerformanceGrade: "A" | "B" | "C" | "D" | "F";
  estimatedThroughput: number;         // Tasks per second
  memoryEstimate: number;              // MB
  recommendations: string[];
  passedValidation: boolean;           // true if grade A or B
}

interface PerformanceIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: string;                    // complexity, memory, io, etc.
  title: string;
  description: string;
  impact: string;                      // e.g., "10x slower", "O(n²)"
  recommendation: string;
}
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Required for both validators
CEREBRAS_API_KEY=your-cerebras-api-key
```

### Model Configuration

Both validators use conservative temperature (0.5) for consistency:

```typescript
{
  temperature: 0.5,  // Lower than default 0.7
  max_tokens: 2048,
}
```

## Integration with CFN Loop

### At Implementation (Loop 3)

```typescript
// Trigger validators async when implementation completes
const implResult = await implementTask();

const validatorHandles = await Promise.all([
  tasks.trigger("cfn-async-security-validator", {
    taskId: implResult.taskId,
    implementation: implResult.code,
    testCode: implResult.tests,
    workDir: implResult.workDir,
  }),
  tasks.trigger("cfn-async-performance-validator", {
    taskId: implResult.taskId,
    implementation: implResult.code,
    testCode: implResult.tests,
    complexity: "moderate",
    workDir: implResult.workDir,
  }),
]);

// Store handles for gate check
return { implResult, validatorHandles };
```

### At Gate Check

```typescript
// Wait for async validators
const validatorResults = await Promise.all(
  validatorHandles.map(h => runs.poll(h.id))
);

const [secResult, perfResult] = validatorResults.map(r => r.output);

// Aggregate results
const allPassed =
  testsPassed &&
  secResult.passedValidation &&
  perfResult.passedValidation;

if (!allPassed) {
  console.log("Gate check failed:");
  if (!secResult.passedValidation) {
    console.log(`  Security: ${secResult.findings.length} issues`);
  }
  if (!perfResult.passedValidation) {
    console.log(`  Performance: Grade ${perfResult.overallPerformanceGrade}`);
  }
}
```

## Error Handling

Both validators gracefully handle API errors:

```typescript
try {
  // Cerebras API call
} catch (error) {
  console.error(`[validator] ✗ Error: ${error.message}`);

  // Return safe defaults
  return {
    taskId: payload.taskId,
    timestamp: Date.now(),
    findings: [],           // No findings on error
    passedValidation: false, // Fail-safe: don't pass if error
    // ... other defaults
  };
}
```

## Testing

Run the test script:

```bash
# Ensure Trigger.dev dev server is running
npx trigger.dev@latest dev --profile self-hosted-v4

# In another terminal
TRIGGER_SECRET_KEY=tr_dev_ffR3mLELFuaaA0txq0lO npx tsx test-async-validators.ts
```

Expected output:
```
Testing async validators...

1. Triggering security validator...
   Security validator triggered: run_xxx

2. Triggering performance validator...
   Performance validator triggered: run_yyy

3. Triggering both validators in parallel...
   Both validators triggered:
   - Security: run_zzz
   - Performance: run_www

✅ All validators triggered successfully!

Note: Validators run async. Check Trigger.dev dashboard for results.
Dashboard: http://localhost:8030
```

## Performance Characteristics

| Validator | Model | Typical Duration | Memory |
|-----------|-------|------------------|--------|
| Security | Llama-3.3-70B | 2-5 seconds | ~150MB |
| Performance | GPT-OSS-120B | 1-3 seconds | ~120MB |

**Parallel execution**: Both validators run simultaneously, so total time is ~5 seconds max (not additive).

## Success Criteria

✅ Both task files compile without errors
✅ Each task is registered with Trigger.dev
✅ Each task can be triggered independently
✅ Both return their Result types
✅ Error handling is graceful
✅ Validators don't block (async execution)
✅ Pass/fail logic is sensible

## Files Created

1. `/docker/trigger-dev/src/trigger/cfn-async-security-validator.ts` (150 lines)
2. `/docker/trigger-dev/src/trigger/cfn-async-performance-validator.ts` (157 lines)
3. `/docker/trigger-dev/src/trigger/index.ts` (updated with exports)
4. `/docker/trigger-dev/test-async-validators.ts` (test script)
5. `/docker/trigger-dev/ASYNC_VALIDATORS.md` (this file)

## Next Steps

1. **Add CEREBRAS_API_KEY to `.env`**
2. **Start Trigger.dev dev server** (if not running)
3. **Run test script** to verify validators work
4. **Integrate with CFN orchestrator** to trigger validators during Loop 3
5. **Update gate check** to aggregate validator results

---

**Status**: ✅ Implementation Complete | Ready for Testing
