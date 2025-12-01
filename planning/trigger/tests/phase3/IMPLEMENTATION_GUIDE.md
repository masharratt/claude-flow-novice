# Phase 3 Test Suite Implementation Guide

**Quick Reference**: Step-by-step guide to implementing the Phase 3 test suite
**For**: Backend developers and test engineers
**Time Estimate**: 3-4 weeks (144 test cases)

---

## Implementation Roadmap

### Week 1: Unit Tests (55 cases)

**Day 1-2**: Schema Validation (15 cases)
- Create `unit/schema-validation.test.ts`
- Implement Zod schema (`cfnLoop3PayloadSchema`)
- Test valid/invalid payloads
- Test edge cases (empty arrays, path traversal, etc.)

**Day 3-4**: Confidence Parsing (12 cases)
- Create `unit/confidence-parsing.test.ts`
- Implement `parseConfidenceFromOutput()` function
- Test various output formats
- Handle edge cases (missing, malformed, out-of-range)

**Day 5-6**: Gate Logic (18 cases)
- Create `unit/gate-logic.test.ts`
- Implement `qualityGateCheck()` function
- Test all mode thresholds (MVP, Standard, Enterprise)
- Implement multi-agent aggregation logic

**Day 7**: Iteration Context (10 cases)
- Create `unit/iteration-context.test.ts`
- Implement context management functions
- Test context propagation across iterations
- Test max iterations enforcement

---

### Week 2: Integration Tests (37 cases)

**Day 1-2**: Sequential Spawning (8 cases)
- Create `integration/test-sequential-spawning.sh`
- Implement sequential Docker container spawning
- Validate execution order
- Capture and verify stdout from each agent

**Day 3**: Gate Pass Triggers Loop 2 (6 cases)
- Create `integration/test-gate-pass-triggers-loop2.sh`
- Simulate Loop 3 completion with passing confidence
- Verify Loop 2 event triggering (mock for now, real trigger.dev later)
- Validate event payload structure

**Day 4**: Gate Fail Iteration (7 cases)
- Create `integration/test-gate-fail-iteration.sh`
- Simulate Loop 3 completion with failing confidence
- Verify iteration event triggering
- Validate context propagation to next iteration

**Day 5**: Max Iterations (5 cases)
- Create `integration/test-max-iterations.sh`
- Test iteration limit enforcement for all modes
- Verify abort behavior when limit reached
- Test boundary conditions (at max, just over max)

**Day 6**: Container Cleanup (6 cases)
- Create `integration/test-container-cleanup.sh`
- Verify containers removed after success
- Verify containers removed after failure
- Test network cleanup
- Verify idempotent cleanup

**Day 7**: Network Isolation (5 cases)
- Create `integration/test-network-isolation.sh`
- Verify unique networks per taskId
- Test agent isolation (no cross-talk)
- Validate network cleanup

---

### Week 3: Edge Cases + Security (52 cases)

**Day 1-2**: Agent Failure (8 cases)
- Create `edge-cases/test-agent-failure.sh`
- Test non-zero exit codes
- Test workflow abort on failure
- Test stderr capture
- Test crash scenarios (SIGKILL)

**Day 3**: Missing Confidence (6 cases)
- Create `edge-cases/test-missing-confidence.sh`
- Test agent output without confidence
- Test gate failure when confidence missing
- Test multi-agent scenarios with partial missing confidences

**Day 4**: Malformed Output (7 cases)
- Create `edge-cases/test-malformed-output.sh`
- Test binary output handling
- Test extremely long output (>1MB)
- Test invalid UTF-8, null bytes, ANSI codes

**Day 5**: Network Timeout (5 cases)
- Create `edge-cases/test-network-timeout.sh`
- Test agent startup timeout
- Test network connectivity timeout
- Test long-running agent timeout

**Day 6**: Resource Exhaustion (6 cases)
- Create `edge-cases/test-resource-exhaustion.sh`
- Test OOM handling
- Test CPU limit exceeded
- Test disk space exhaustion

**Day 7**: Security Tests (20 cases)
- Create `security/test-taskid-validation.sh` (8 cases)
- Create `security/test-shell-injection.sh` (7 cases)
- Create `security/test-env-sanitization.sh` (5 cases)
- Test path traversal, injection, sanitization

---

### Week 4: Integration + Validation

**Day 1-2**: Test Infrastructure
- Create `run-all-tests.sh` main runner
- Create `validate-test-suite.sh` meta-validator
- Ensure all tests have proper cleanup traps
- Verify GIVEN/WHEN/THEN markers

**Day 3-4**: Full Test Suite Execution
- Run complete test suite on clean environment
- Document all failures
- Fix broken tests
- Verify reproducibility (5 consecutive runs)

**Day 5**: CI/CD Integration
- Add tests to GitHub Actions workflow
- Set up test result reporting
- Configure failure notifications
- Test CI execution

**Day 6-7**: Documentation + Handoff
- Generate `PHASE3_TEST_SUITE_SUMMARY.md` with results
- Update coverage metrics in README
- Document any deviations from design
- Create handoff document for Phase 4

---

## Quick Start Templates

### Unit Test Template (Jest/TypeScript)

```typescript
// unit/example.test.ts
import { describe, test, expect } from '@jest/globals';
import { functionToTest } from '../../../trigger-dev/src/jobs/cfn-loop3';

describe('functionToTest', () => {
  describe('Valid Inputs', () => {
    test('handles valid input correctly', () => {
      // GIVEN
      const input = { /* valid data */ };

      // WHEN
      const result = functionToTest(input);

      // THEN
      expect(result).toBeDefined();
      expect(result.someProperty).toBe('expected value');
    });
  });

  describe('Invalid Inputs', () => {
    test('throws error on invalid input', () => {
      // GIVEN
      const input = { /* invalid data */ };

      // WHEN/THEN
      expect(() => functionToTest(input)).toThrow(/error message/);
    });
  });
});
```

### Integration Test Template (Bash)

```bash
#!/bin/bash
# integration/test-example.sh
# Phase 3 :: Test description (BUG #21 compliance)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

TASK_ID="phase3-example-$(date +%s)"
TEST_DIR="/tmp/trigger-test-${TASK_ID}"

cleanup() {
    log_info "Cleaning up test artifacts"
    docker rm -f $(docker ps -aq --filter "name=cfn-agent-${TASK_ID}") 2>/dev/null || true
    docker network rm "cfn-network-${TASK_ID}" 2>/dev/null || true
    rm -rf "$TEST_DIR" || true
}
trap cleanup EXIT

test_scenario_name() {
    log_step "GIVEN initial context"

    # Setup
    docker network create "cfn-network-${TASK_ID}" >/dev/null 2>&1
    mkdir -p "$TEST_DIR"

    # WHEN action occurs
    log_info "Performing action"
    local result=$(docker run --rm \
        --name "cfn-agent-${TASK_ID}" \
        --network "cfn-network-${TASK_ID}" \
        alpine:latest \
        sh -c "echo 'Test output'; echo 'Confidence: 0.95'")

    # THEN expected outcome
    assert_contains "$result" "Test output" "Output contains expected text"
    assert_contains "$result" "Confidence: 0.95" "Confidence reported correctly"

    annotate "SUCCESS: Test scenario validated"
}

test_scenario_name
```

---

## Test Implementation Checklist

### For Each Test File

- [ ] File header with shebang and `set -euo pipefail`
- [ ] Source `test-utils.sh` for helpers
- [ ] Define `cleanup()` function with `trap cleanup EXIT`
- [ ] Use unique `TASK_ID` per test run
- [ ] Use GIVEN/WHEN/THEN markers for clarity
- [ ] Use `log_step`, `log_info`, `annotate` for structured logging
- [ ] Use `assert_*` helpers from test-utils.sh
- [ ] Verify cleanup removes all containers/networks
- [ ] Test executable permission (`chmod +x`)
- [ ] Add to test catalog with unique ID

### For Jest/TypeScript Tests

- [ ] Import from `@jest/globals`
- [ ] Organize with `describe` blocks (categories)
- [ ] Use clear test names (`test('description', () => {})`)
- [ ] Use GIVEN/WHEN/THEN comments
- [ ] Use `expect()` assertions
- [ ] Test both valid and invalid inputs
- [ ] Test edge cases and boundaries
- [ ] Mock external dependencies (if needed)
- [ ] Run with coverage: `npm test -- --coverage`

---

## Key Functions to Implement

### 1. Zod Schema (TypeScript)

```typescript
// trigger-dev/src/jobs/cfn-loop3-schema.ts
import { z } from 'zod';

export const cfnLoop3PayloadSchema = z.object({
  taskId: z.string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/, "TaskId must be alphanumeric with hyphens/underscores"),

  taskDescription: z.string().min(1),

  mode: z.enum(['mvp', 'standard', 'enterprise']),

  iteration: z.number().int().positive(),

  maxIterations: z.number().int().positive().optional(),

  agents: z.array(z.object({
    type: z.string().min(1),
    task: z.string().min(1)
  })).min(1),

  context: z.object({
    previousResults: z.any().optional(),
    validatorFeedback: z.array(z.string()).optional()
  }).optional()
}).refine(
  (data) => !data.maxIterations || data.iteration <= data.maxIterations,
  { message: "Iteration cannot exceed maxIterations" }
);

export type CfnLoop3Payload = z.infer<typeof cfnLoop3PayloadSchema>;
```

### 2. Confidence Parsing (TypeScript)

```typescript
// trigger-dev/src/jobs/cfn-loop3-utils.ts

export function parseConfidenceFromOutput(output: string): number | null {
  // Match "Confidence: 0.XX" or "Confidence Score: 0.XX"
  const regex = /Confidence(?:\s+Score)?:\s*(\d+\.?\d*)/gi;
  const matches = Array.from(output.matchAll(regex));

  if (matches.length === 0) {
    return null;
  }

  // Take last match (most recent confidence)
  const lastMatch = matches[matches.length - 1];
  const confidence = parseFloat(lastMatch[1]);

  // Validate range [0.0, 1.0]
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }

  return confidence;
}

export function calculateAverageConfidence(confidences: number[]): number {
  if (confidences.length === 0) {
    return 0;
  }

  const sum = confidences.reduce((acc, val) => acc + val, 0);
  return sum / confidences.length;
}
```

### 3. Quality Gate Logic (TypeScript)

```typescript
// trigger-dev/src/jobs/cfn-loop3-gate.ts

export interface GateResult {
  passed: boolean;
  threshold: number;
  mode: string;
  confidence: number;
}

export function qualityGateCheck(confidence: number, mode: string): GateResult {
  const thresholds = {
    mvp: 0.70,
    standard: 0.95,
    enterprise: 0.98
  };

  const threshold = thresholds[mode as keyof typeof thresholds];
  const passed = confidence >= threshold;

  return {
    passed,
    threshold,
    mode,
    confidence
  };
}

export function qualityGateCheckMulti(
  confidences: number[],
  mode: string
): GateResult {
  const avgConfidence = calculateAverageConfidence(confidences);
  return qualityGateCheck(avgConfidence, mode);
}
```

### 4. Sequential Agent Spawning (TypeScript - trigger.dev job)

```typescript
// trigger-dev/src/jobs/cfn-loop3-coordination.ts
import { task } from "@trigger.dev/sdk/v3";
import { cfnLoop3PayloadSchema } from "./cfn-loop3-schema";
import { parseConfidenceFromOutput, calculateAverageConfidence } from "./cfn-loop3-utils";
import { qualityGateCheckMulti } from "./cfn-loop3-gate";
import Docker from 'dockerode';

export const cfnLoop3Coordination = task({
  id: "cfn-loop3-coordination",
  run: async (payload: unknown) => {
    // 1. Validate payload
    const validated = cfnLoop3PayloadSchema.parse(payload);
    const { taskId, mode, agents, iteration, context } = validated;

    // 2. Sequential agent spawning
    const docker = new Docker();
    const confidences: number[] = [];

    for (const agent of agents) {
      // Spawn container
      const container = await docker.createContainer({
        Image: 'cfn-agent:latest',
        Cmd: ['npx', 'claude-flow-novice', 'agent', agent.type],
        Env: [
          `TASK_ID=${taskId}`,
          `AGENT_TYPE=${agent.type}`,
          `AGENT_TASK=${agent.task}`,
          `ITERATION=${iteration}`,
          `MODE=${mode}`
        ],
        name: `cfn-agent-${taskId}-${agent.type}`,
        HostConfig: {
          Memory: 2 * 1024 * 1024 * 1024, // 2GB
          CpuQuota: 100000 // 1 CPU
        }
      });

      // Start and wait for completion
      await container.start();
      const exitData = await container.wait();

      // Capture stdout
      const logs = await container.logs({
        stdout: true,
        stderr: true
      });
      const output = logs.toString();

      // Parse confidence
      const confidence = parseConfidenceFromOutput(output);
      if (confidence !== null) {
        confidences.push(confidence);
      }

      // Cleanup container
      await container.remove({ force: true });

      // Handle non-zero exit
      if (exitData.StatusCode !== 0) {
        throw new Error(`Agent ${agent.type} failed with exit code ${exitData.StatusCode}`);
      }
    }

    // 3. Quality gate check
    const gateResult = qualityGateCheckMulti(confidences, mode);

    // 4. Trigger appropriate event
    if (gateResult.passed) {
      // Trigger Loop 2 validation
      await triggerLoop2Validation({
        taskId,
        mode,
        iteration,
        loop3Results: {
          confidence: gateResult.confidence,
          gatePassed: true
        }
      });
    } else {
      // Trigger iteration event (if under max iterations)
      await triggerIteration({
        taskId,
        mode,
        iteration: iteration + 1,
        context: {
          previousResults: { confidence: gateResult.confidence },
          validatorFeedback: context?.validatorFeedback || []
        }
      });
    }

    return {
      success: true,
      gateResult
    };
  }
});
```

---

## Testing Workflow

### Local Development

```bash
# 1. Run unit tests (fast feedback)
npm test -- planning/trigger/tests/phase3/unit

# 2. Run specific integration test
bash planning/trigger/tests/phase3/integration/test-sequential-spawning.sh

# 3. Run all tests in category
for test in planning/trigger/tests/phase3/integration/*.sh; do
    bash "$test"
done

# 4. Run complete test suite
cd planning/trigger/tests/phase3
./run-all-tests.sh

# 5. Validate test suite integrity
./validate-test-suite.sh
```

### CI/CD Pipeline

```yaml
# .github/workflows/phase3-tests.yml
name: Phase 3 Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test -- planning/trigger/tests/phase3/unit --coverage
      - uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: cd planning/trigger/tests/phase3 && ./run-all-tests.sh
```

---

## Troubleshooting Guide

### Common Errors

**Error**: `Zod schema validation fails`
```typescript
// Check schema definition matches payload structure
console.log(cfnLoop3PayloadSchema.safeParse(payload));
```

**Error**: `Docker container fails to spawn`
```bash
# Check Docker daemon is running
docker ps

# Check image exists
docker images | grep cfn-agent

# Check logs for errors
docker logs cfn-agent-${TASK_ID}
```

**Error**: `Confidence parsing returns null`
```typescript
// Check agent output format
console.log("Agent output:", output);

// Expected format: "Confidence: 0.95"
```

**Error**: `Quality gate logic incorrect`
```typescript
// Verify threshold values
const thresholds = { mvp: 0.70, standard: 0.95, enterprise: 0.98 };
console.log(`Mode: ${mode}, Threshold: ${thresholds[mode]}`);
```

---

## Success Metrics

Track these metrics during implementation:

- **Test Coverage**: Target 100% (144/144 test cases)
- **Pass Rate**: Target 100% on clean environment
- **Execution Time**: Target <25 minutes for full suite
- **Reproducibility**: 100% pass rate across 5 consecutive runs
- **BUG #21 Compliance**: 100% (all integration tests use production paths)
- **Security Coverage**: 100% (20/20 security tests passing)

---

## Next Steps After Implementation

1. **Phase 4 Planning**: Use Phase 3 patterns for Loop 2 validation tests
2. **Performance Optimization**: Profile slow tests, optimize Docker operations
3. **CI/CD Enhancement**: Add parallel test execution, failure notifications
4. **Documentation Updates**: Generate comprehensive test report
5. **Maintenance Plan**: Schedule quarterly test suite review

---

**Confidence**: 0.94

This implementation guide provides:
- ✅ Week-by-week roadmap with daily tasks
- ✅ Quick start templates for both Jest and Bash tests
- ✅ Implementation checklist for quality assurance
- ✅ Key function implementations with code examples
- ✅ Testing workflow (local + CI/CD)
- ✅ Troubleshooting guide for common errors
- ✅ Success metrics for tracking progress
