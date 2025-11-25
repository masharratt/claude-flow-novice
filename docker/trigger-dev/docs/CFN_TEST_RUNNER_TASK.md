# CFN Test Runner Task - Trigger.dev v4

Production-ready Trigger.dev v4 task for running test suites and parsing results as part of CFN Loop gate checks.

## Overview

The CFN Test Runner task (`cfn-test-runner.ts`) executes test commands in any working directory and returns structured results including:
- Pass rate (0.0 to 1.0)
- Test counts (total, passed, failed)
- Raw test output
- Detected test framework
- Execution duration
- Test metadata (suites, skipped, pending)

This task is used by CFN Loop **Loop 3** (Implementation Team) to gate whether results are ready for **Loop 2** (Validators) review.

## Task Definition

### Location
```
docker/trigger-dev/src/trigger/cfn-test-runner.ts
```

### Task ID
```
cfn-test-runner
```

### Exports
```typescript
// Task export
export { cfnTestRunnerTask } from "@trigger.dev/sdk/v3";

// Type exports
export type { TestRunnerPayload, TestRunnerResult };
```

## API

### Input Payload

```typescript
interface TestRunnerPayload {
  // Required: Directory where test command will execute
  workDir: string;

  // Optional: Test command (defaults to "npm test")
  command?: string;
}
```

### Output Result

```typescript
interface TestRunnerResult {
  // Whether execution was successful (command completed)
  success: boolean;

  // Pass rate from 0.0 to 1.0
  passRate: number;

  // Total tests found (passed + failed)
  totalTests: number;

  // Number of passing tests
  passedTests: number;

  // Number of failing tests
  failedTests: number;

  // Full raw output from test command
  output: string;

  // Execution duration in milliseconds
  duration: number;

  // Optional: Detected test framework
  testFramework?: string;

  // Optional: Error message if execution failed
  error?: string;

  // Optional: Additional metadata
  metadata?: {
    suites?: number;      // Number of test suites
    skipped?: number;     // Number of skipped tests
    pending?: number;     // Number of pending/todo tests
  };
}
```

## Supported Test Frameworks

### Jest
Detects and parses Jest output patterns:
```
Tests:      45 passed, 2 failed, 47 total
Test Suites: 8 passed, 1 failed, 9 total
```

### Mocha
Detects and parses Mocha output patterns:
```
42 passing (1.2s)
3 failing
1 pending
```

### Tap (Test Anything Protocol)
Detects and parses Tap output patterns:
```
# pass 42
# fail 3
1..45
```

### TypeScript Compiler (tsc --noEmit)
Detects and parses TypeScript compilation output:
```
src/app.ts(42,10): error TS2339: Property 'x' does not exist...
```
Treated as binary test: 1 pass if no errors, 1 fail if errors exist.

### Auto-Detection
If no specific framework is detected, the task tries all parsers and selects the one with the highest test count.

## Usage Examples

### Run Default Test Suite (npm test)
```typescript
import { tasks } from "@trigger.dev/sdk/v3";
import { cfnTestRunnerTask } from "./trigger/cfn-test-runner";

const result = await tasks.trigger<typeof cfnTestRunnerTask>(
  "cfn-test-runner",
  {
    workDir: "/path/to/project"
    // Uses default "npm test" command
  }
);
```

### Run Custom Test Command
```typescript
const result = await tasks.trigger<typeof cfnTestRunnerTask>(
  "cfn-test-runner",
  {
    workDir: "/path/to/project",
    command: "npm run test:integration"
  }
);
```

### Run TypeScript Type Check
```typescript
const result = await tasks.trigger<typeof cfnTestRunnerTask>(
  "cfn-test-runner",
  {
    workDir: "/path/to/project",
    command: "npx tsc --noEmit"
  }
);
```

### CFN Loop Gate Check
```typescript
import { tasks } from "@trigger.dev/sdk/v3";

// Run implementation tests
const testResult = await tasks.trigger<typeof cfnTestRunnerTask>(
  "cfn-test-runner",
  {
    workDir: "/workspace",
    command: "npm test"
  }
);

// Gate logic
if (testResult.output.passRate >= 0.95) {
  // PROCEED to Loop 2 validators
  decision = "PROCEED";
} else if (testResult.output.passRate >= 0.70) {
  // ITERATE Loop 3 (close to threshold)
  decision = "ITERATE";
} else {
  // ABORT (too many failures)
  decision = "ABORT";
}
```

## Configuration

### Timeout
- **Default**: 5 minutes (300,000 milliseconds)
- **Configurable**: Via `execa` timeout option in source code

### Retry Policy
- **MaxAttempts**: 1 (no retries)
- **Rationale**: Gate check tasks should not retry; failures are meaningful signals

### Environment
- **Test execution**: CWD is set to `workDir` parameter
- **Inherit**: Process environment, PATH, and shell defaults

## Output Parsing

### Parser Chain

1. **Detect Framework** - Analyze output for known patterns
2. **Parse Results** - Extract test counts using framework-specific regex
3. **Calculate Metrics** - Compute pass rate and duration
4. **Extract Metadata** - Find suites, skipped, pending counts
5. **Return Result** - Structured `TestRunnerResult` object

### Example Parse Results

**Jest Output:**
```
Input:  "Tests:      45 passed, 2 failed, 47 total"
Output: { passed: 45, failed: 2, total: 47, passRate: 0.9574 }
```

**Mocha Output:**
```
Input:  "42 passing\n3 failing\n1 pending"
Output: { passed: 42, failed: 3, total: 45, passRate: 0.9333 }
```

**TypeScript Output:**
```
Input:  "src/app.ts(42,10): error TS2339: ..."
Output: { passed: 0, failed: 1, total: 1, passRate: 0.0 }
```

## Error Handling

### Graceful Degradation

If command execution fails:
- **Returns**: `success: false` with error message
- **Sets**: `totalTests: 0`, `passRate: 0.0`
- **Includes**: Error message in `error` field
- **Does NOT throw**: Allows caller to handle failures

### No Tests Found

If no tests are detected in output:
- **Treats as**: Single failed test
- **Returns**: `totalTests: 1`, `passedTests: 0`, `failedTests: 1`
- **Includes**: Error message "No tests were found or parsed from output"

### Command Timeout

If test execution exceeds 5 minutes:
- **Timeout**: Enforced by `execa`
- **Result**: Command killed and error returned
- **Pass Rate**: 0.0

## Metrics and Reporting

### Duration Measurement
```typescript
const startTime = Date.now();
// Execute tests
const duration = Date.now() - startTime;
```

### Pass Rate Calculation
```typescript
// Precise to 4 decimal places
passRate = Math.round(passed / total * 10000) / 10000;
// Example: 95/100 = 0.95, 95/99 = 0.9596
```

### Metadata Extraction
- **Test Suites**: Parsed from "Test Suites: X passed"
- **Skipped Tests**: Parsed from "X skipped"
- **Pending Tests**: Parsed from "X pending"

## CFN Loop Integration

### Loop 3 (Implementation) Gate Check

```
Loop 3 Implementation:
  1. Agents execute fixes
  2. Coordinator calls cfn-test-runner
  3. Compare passRate to threshold

Thresholds by Mode:
  - MVP:      >= 0.70 (70%)
  - Standard: >= 0.95 (95%)
  - Enterprise: >= 0.98 (98%)
```

### Decision Logic

```
IF passRate >= threshold:
  decision = "PROCEED"  → Continue to Loop 2

ELSE IF passRate >= (threshold - 0.15):
  decision = "ITERATE"  → Run Loop 3 again

ELSE:
  decision = "ABORT"    → Stop (too many failures)
```

### Redis Coordination

Results are stored in Redis for orchestration:
```
test-result:{taskId}
  pass_rate: "0.95"
  total_tests: "100"
  passed_tests: "95"
  failed_tests: "5"
  duration_ms: "5000"
  framework: "jest"
  timestamp: "2025-01-12T10:30:45Z"
```

## Implementation Details

### File Structure
```
src/trigger/cfn-test-runner.ts
├── Interfaces
│   ├── TestRunnerPayload
│   └── TestRunnerResult
├── Parser Functions
│   ├── parseJestOutput()
│   ├── parseMochaOutput()
│   ├── parseTapOutput()
│   └── parseTscOutput()
├── Utility Functions
│   ├── detectTestFramework()
│   ├── extractMetadata()
│   └── runTestsWithParsing()
└── Task Export
    └── cfnTestRunnerTask
```

### Dependencies
```typescript
import { task } from "@trigger.dev/sdk/v3";  // Trigger.dev v4
import { execa } from "execa";                // Process execution
import * as path from "path";                  // Path utilities
```

### Type Safety
- Full TypeScript interfaces for input/output
- Explicit return types for all functions
- No `any` types (strict mode compliant)
- Proper error handling with discriminated unions

## Testing

### Unit Test Patterns

**Test Jest Parsing:**
```typescript
const jestOutput = "Tests:      45 passed, 2 failed, 47 total";
const result = parseJestOutput(jestOutput);
expect(result.passed).toBe(45);
expect(result.failed).toBe(2);
```

**Test Framework Detection:**
```typescript
const output = "42 passing (1.2s)\n3 failing";
expect(detectTestFramework(output)).toBe("mocha");
```

**Test Timeout Handling:**
```typescript
// Should handle 5-minute timeout gracefully
const result = await cfnTestRunnerTask.run({
  workDir: "/test",
  command: "sleep 400" // Will timeout at 300s
});
expect(result.success).toBe(false);
```

### Integration Tests

**Real Jest Suite:**
```bash
cd /path/with/jest
trigger test cfn-test-runner --payload '{"workDir":".","command":"npm test"}'
```

**Real Mocha Suite:**
```bash
cd /path/with/mocha
trigger test cfn-test-runner --payload '{"workDir":".","command":"npm test"}'
```

## Performance Characteristics

### Execution Time
- **Overhead**: ~100-500ms (Trigger.dev infrastructure)
- **Test Execution**: Depends on test suite size
- **Parsing**: ~10-50ms (negligible)

### Example Timings
```
Small Suite (50 tests):     1-2 seconds
Medium Suite (500 tests):   5-10 seconds
Large Suite (5000 tests):   30-60 seconds
TypeScript Check (500 files): 10-15 seconds
```

### Memory Usage
- **Task Memory**: ~10-50MB
- **Test Execution**: Depends on test framework
- **Output Buffer**: Stores raw test output (limit: 10MB)

## Troubleshooting

### Issue: "No tests were found or parsed"

**Cause**: Output format not recognized by parsers

**Solution**:
1. Check if test framework is in supported list
2. Verify test command runs successfully locally
3. Check for output encoding issues

### Issue: Incorrect pass rate

**Cause**: Parser failed to match test counts correctly

**Solution**:
1. Review regex patterns for framework
2. Add new detection pattern if framework variant
3. Check for localized output (different language)

### Issue: Timeout (5 minutes exceeded)

**Cause**: Test suite takes too long

**Solution**:
1. Run lighter test subset (e.g., unit tests only)
2. Use `--maxWorkers=1` for parallel test runners
3. Increase timeout (requires code modification)

### Issue: Command not found

**Cause**: Test command doesn't exist in `workDir`

**Solution**:
1. Verify `workDir` is correct
2. Check that command is installed (`npm list`)
3. Use absolute path to executable if needed

## Examples

### Trigger from Claude Code CLI (CFN Loop)

```bash
# Via Trigger.dev CLI
trigger test cfn-test-runner \
  --payload '{
    "workDir": "/home/claude/projects/myapp",
    "command": "npm test"
  }'

# Expected Output
{
  "success": true,
  "passRate": 0.95,
  "totalTests": 100,
  "passedTests": 95,
  "failedTests": 5,
  "output": "[test output...]\nTests: 95 passed, 5 failed, 100 total",
  "duration": 5000,
  "testFramework": "jest",
  "metadata": {
    "suites": 10,
    "skipped": 2
  }
}
```

### Integrate with Orchestrator

```typescript
// In CFN Loop orchestrator
import { tasks } from "@trigger.dev/sdk/v3";

async function runGateCheck(workDir: string) {
  const result = await tasks.trigger<typeof cfnTestRunnerTask>(
    "cfn-test-runner",
    { workDir }
  );

  const passRate = result.output.passRate;
  const threshold = 0.95; // Standard mode

  return {
    passed: passRate >= threshold,
    rate: passRate,
    tests: result.output.totalTests,
    framework: result.output.testFramework
  };
}
```

## Version History

- **2025-01-12**: Initial production release v1.0
  - Supports Jest, Mocha, Tap, TypeScript
  - Auto-detection of test framework
  - Proper timeout and error handling
  - Full type safety
  - CFN Loop integration ready

## Related Files

- **Task Source**: `src/trigger/cfn-test-runner.ts`
- **Type Exports**: `src/trigger/index.ts`
- **CFN Loop Integration**: `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
- **Gate Check Thresholds**: `docs/CFN_LOOP_ARCHITECTURE.md`

## Support

For issues or questions:
1. Check `CFN_TEST_RUNNER_TASK.md` (this file)
2. Review example payloads and test frameworks
3. Test locally with `trigger test cfn-test-runner`
4. File issue with task output and error message

---

**Status**: Production Ready
**Last Updated**: 2025-01-12
**Maintained By**: CFN Loop Team
