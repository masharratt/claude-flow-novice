# Force Iteration Quick Reference

Quick guide to using `forceIteration` for North Star 2 controlled testing.

## Basic Usage

### 1. Create a Force Iteration Config

```typescript
import { ForceIterationConfig, validateForceIterationConfig } from '../src/types/cfn-types';

const forceConfig: ForceIterationConfig = {
  iteration: 2,           // Which iteration to force
  gateResult: 'FAIL',     // Force gate to fail
  consensusResult: 'PASS', // Force consensus to pass
  poDecision: 'ITERATE',  // Force PO to request iteration
};

// Optional: Validate the config
const errors = validateForceIterationConfig(forceConfig);
if (errors.length > 0) throw new Error(errors.join(', '));
```

### 2. Add to CFN Loop Payload

```typescript
import { CFNLoopPayload, CFNMode } from '../src/types/cfn-types';

const payload: CFNLoopPayload = {
  taskId: 'test-scenario-1',
  description: 'Test gate failure scenario',
  mode: 'standard' as CFNMode,
  maxIterations: 5,
  currentIteration: 1,
  startedAt: new Date().toISOString(),
  successCriteria: {
    testCommand: 'npm test',
    passRateThreshold: 0.95,
  },
  forceIteration: forceConfig, // Add force config
};
```

### 3. Trigger CFN Loop

```typescript
import { sendEvent } from '../../trigger-dev-client';

const result = await sendEvent('cfn.loop.start', payload);
console.log('Event triggered:', result.id);
```

## Common Test Scenarios

### Scenario 1: Gate Failure → Iteration

```typescript
const gateFail: ForceIterationConfig = {
  iteration: 1,
  gateResult: 'FAIL',      // Gate fails
  consensusResult: 'PASS',
  poDecision: 'ITERATE',
  gatePassRate: 0.70,      // Below threshold (0.95)
};
```

### Scenario 2: Gate Pass, Consensus Fail → Iteration

```typescript
const consensusFail: ForceIterationConfig = {
  iteration: 2,
  gateResult: 'PASS',      // Gate passes
  consensusResult: 'FAIL',  // Consensus fails
  poDecision: 'ITERATE',
  gatePassRate: 0.98,
  consensusScore: 0.75,    // Below threshold (0.90)
};
```

### Scenario 3: Both Pass, PO Decides Iteration

```typescript
const poIterate: ForceIterationConfig = {
  iteration: 3,
  gateResult: 'PASS',
  consensusResult: 'PASS',
  poDecision: 'ITERATE',   // PO wants refinement
  gatePassRate: 0.96,
  consensusScore: 0.88,
  reason: 'Security review flagged potential issues',
};
```

### Scenario 4: Complete Success

```typescript
const success: ForceIterationConfig = {
  iteration: 5,
  gateResult: 'PASS',
  consensusResult: 'PASS',
  poDecision: 'PROCEED',   // All gates open
  gatePassRate: 0.99,
  consensusScore: 0.95,
};
```

### Scenario 5: Abort Decision

```typescript
const abort: ForceIterationConfig = {
  iteration: 3,
  gateResult: 'PASS',
  consensusResult: 'PASS',
  poDecision: 'ABORT',     // Stop iteration
  reason: 'Critical issue found during review',
};
```

## Validation Helpers

### Check If Force Applies to Current Iteration

```typescript
import { isForceIterationApplicable } from '../src/types/cfn-types';

if (isForceIterationApplicable(payload.forceIteration, currentIteration)) {
  // Use forced values
  const decision = payload.forceIteration!.poDecision;
  console.log('Using forced decision:', decision);
}
```

### Create Iteration Result

```typescript
import { createIterationResult } from '../src/types/cfn-types';

const iterResult = createIterationResult(
  2,                      // iteration number
  false,                  // gatePassed
  0.70,                   // gatePassRate
  0.95,                   // gateThreshold
  true,                   // consensusMet
  0.92,                   // consensusScore
  0.90,                   // consensusThreshold
  productOwnerDecision,
  forceConfig             // optional force config
);

console.log('Iteration result:', iterResult);
```

## Type Safety Patterns

### Pattern 1: Optional Force Iteration

```typescript
interface TestPayload {
  payload: CFNLoopPayload;
  expectedIterations: number;
  forceIteration?: ForceIterationConfig; // Optional
}

function createTestScenario(options: TestPayload) {
  const payload: CFNLoopPayload = {
    ...options.payload,
    forceIteration: options.forceIteration, // May be undefined
  };
  return payload;
}
```

### Pattern 2: Guaranteed Force Iteration

```typescript
function createForcedTestPayload(
  taskId: string,
  forceConfig: ForceIterationConfig
): CFNLoopPayload {
  const payload: CFNLoopPayload = {
    taskId,
    description: `Forced iteration test for iteration ${forceConfig.iteration}`,
    mode: 'standard',
    maxIterations: 5,
    currentIteration: 1,
    startedAt: new Date().toISOString(),
    successCriteria: {
      testCommand: 'npm test',
      passRateThreshold: 0.95,
    },
    forceIteration: forceConfig, // Always present
  };

  // Validate before returning
  const errors = validateForceIterationConfig(forceConfig);
  if (errors.length > 0) throw new Error(errors.join(', '));

  return payload;
}
```

### Pattern 3: Iteration Result Tracking

```typescript
async function trackIterationOutcomes(result: CFNLoopResult) {
  if (!result.iterationResults) {
    console.log('No iteration results tracked');
    return;
  }

  for (const iterResult of result.iterationResults) {
    console.log(`Iteration ${iterResult.iteration}:`, {
      gate: iterResult.gatePassed ? 'PASS' : 'FAIL',
      gateRate: `${(iterResult.gatePassRate * 100).toFixed(1)}%`,
      consensus: iterResult.consensusMet ? 'PASS' : 'FAIL',
      consensusScore: `${(iterResult.consensusScore * 100).toFixed(1)}%`,
      decision: iterResult.productOwnerDecision.decision,
      forceApplied: iterResult.forceApplied,
    });
  }
}
```

## Error Handling

### Validate Configuration

```typescript
import { validateForceIterationConfig } from '../src/types/cfn-types';

const forceConfig: ForceIterationConfig = { /* ... */ };
const errors = validateForceIterationConfig(forceConfig);

if (errors.length > 0) {
  console.error('Invalid force iteration config:');
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}
```

### Type Guard for Force Iteration

```typescript
function hasForcedIteration(
  payload: CFNLoopPayload
): payload is CFNLoopPayload & { forceIteration: ForceIterationConfig } {
  return payload.forceIteration !== undefined;
}

// Usage
if (hasForcedIteration(payload)) {
  const forced = payload.forceIteration; // Guaranteed to exist
  console.log('Using force iteration:', forced.iteration);
}
```

## North Star 2 Test Example

Complete example from North Star 2 test:

```typescript
describe('North Star Test 2: 5-Iteration Workflow', () => {
  it('iteration 1: gate failure forces iteration', async () => {
    const forceConfig: ForceIterationConfig = {
      iteration: 1,
      gateResult: 'FAIL',
      consensusResult: 'PASS',
      poDecision: 'ITERATE',
      gatePassRate: 0.75,
      reason: 'Test pass rate below threshold',
    };

    const payload: CFNLoopPayload = {
      taskId: `test-${Date.now()}`,
      description: 'Iteration 1: Gate failure test',
      mode: 'standard',
      maxIterations: 5,
      currentIteration: 1,
      startedAt: new Date().toISOString(),
      successCriteria: {
        testCommand: 'npm test',
        passRateThreshold: 0.95,
      },
      forceIteration: forceConfig,
    };

    const result = await sendEvent('cfn.loop.start', payload);

    // Verify iteration was tracked
    expect(result.iterationResults).toBeDefined();
    expect(result.iterationResults?.[0].iteration).toBe(1);
    expect(result.iterationResults?.[0].gatePassed).toBe(false);
    expect(result.iterationResults?.[0].forceApplied).toBe(true);
  });
});
```

## See Also

- **Full Documentation:** `/docs/NORTH_STAR_2_TYPES.md`
- **Type Definitions:** `/src/types/cfn-types.ts`
- **North Star 2 Test:** `/tests/e2e/north-star-2-iteration-workflow.test.ts`
