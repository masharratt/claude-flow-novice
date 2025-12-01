# CFN Loop Iteration Type Integration Guide

## Overview

This guide explains how to integrate the new North Star 2 iteration types into the CFN Loop workflow.

**Type File:** `/src/types/cfn-types.ts`
**Related:** `/src/workflows/cfn-loop.ts`

## Integration Checklist

### Phase 1: Workflow Modifications

Update `/src/workflows/cfn-loop.ts` to support forced iteration:

```typescript
// 1. Import new types and utilities
import {
  ForceIterationConfig,
  IterationResult,
  isForceIterationApplicable,
  validateForceIterationConfig,
  createIterationResult,
} from '../types/cfn-types';

// 2. At iteration start, check for force iteration
while (currentIteration <= payload.maxIterations) {
  const applyForce = isForceIterationApplicable(
    payload.forceIteration,
    currentIteration
  );

  if (applyForce) {
    // Skip real testing, use forced values
    const forceConfig = payload.forceIteration!;

    // Use forced gate result
    const gatePassed = forceConfig.gateResult === 'PASS';
    const gatePassRate = forceConfig.gatePassRate ??
      (gatePassed ? 0.95 : 0.70);

    // Use forced consensus result
    const consensusMet = forceConfig.consensusResult === 'PASS';
    const consensusScore = forceConfig.consensusScore ??
      (consensusMet ? 0.92 : 0.75);

    // Create PO decision
    const productOwnerDecision: ProductOwnerDecision = {
      decision: forceConfig.poDecision,
      reasoning: forceConfig.reason ||
        `Forced outcome for iteration ${currentIteration}`,
      decidedAt: new Date().toISOString(),
    };

    // Track iteration result
    const iterationResult = createIterationResult(
      currentIteration,
      gatePassed,
      gatePassRate,
      thresholds.loop3PassRateThreshold,
      consensusMet,
      consensusScore,
      thresholds.loop2ConsensusThreshold,
      productOwnerDecision,
      forceConfig
    );

    iterationResults.push(iterationResult);

    // Route based on forced decision
    if (forceConfig.poDecision === 'PROCEED') {
      break; // Exit loop, return success
    } else if (forceConfig.poDecision === 'ABORT') {
      // Exit loop, return abort result
      break;
    }
    // ITERATE: continue to next iteration
  } else {
    // Normal flow: execute actual tests
    // ... existing gate check, consensus, PO decision logic ...

    // Track iteration result with actual values
    const iterationResult = createIterationResult(
      currentIteration,
      gateResult.passed,
      gateResult.passRate,
      thresholds.loop3PassRateThreshold,
      consensusResult.consensusMet,
      consensusResult.averageScore,
      thresholds.loop2ConsensusThreshold,
      productOwnerDecision,
      undefined // No force config applied
    );

    iterationResults.push(iterationResult);
  }

  currentIteration++;
}

// 3. Include iteration results in final result
return {
  // ... existing result fields ...
  iterationResults: iterationResults, // NEW
} as CFNLoopResult;
```

### Phase 2: Test File Updates

Update test files to use force iteration:

```typescript
// tests/e2e/north-star-2-iteration-workflow.test.ts

import {
  ForceIterationConfig,
  CFNLoopPayload,
  validateForceIterationConfig,
} from '../../src/types/cfn-types';

describe('North Star Test 2', () => {
  it('tests gate failure scenario', async () => {
    // Create force iteration config
    const forceConfig: ForceIterationConfig = {
      iteration: 1,
      gateResult: 'FAIL',
      consensusResult: 'PASS',
      poDecision: 'ITERATE',
      gatePassRate: 0.70,
      reason: 'Test pass rate below threshold',
    };

    // Validate config
    const errors = validateForceIterationConfig(forceConfig);
    expect(errors).toHaveLength(0);

    // Create payload with force iteration
    const payload: CFNLoopPayload = {
      taskId: `test-${Date.now()}`,
      description: 'Gate failure test',
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

    // Trigger workflow
    const result = await sendEvent('cfn.loop.start', payload);

    // Verify iteration was tracked
    expect(result.iterationResults).toBeDefined();
    expect(result.iterationResults?.[0].iteration).toBe(1);
    expect(result.iterationResults?.[0].gatePassed).toBe(false);
    expect(result.iterationResults?.[0].forceApplied).toBe(true);
  });
});
```

### Phase 3: Type Validation

Add validation in workflow entry points:

```typescript
// src/cli/trigger-cfn-loop.ts

export async function triggerCFNLoop(
  options: TriggerCFNLoopOptions & { forceIteration?: ForceIterationConfig }
): Promise<TriggerResult> {
  const payload: CFNLoopPayload = {
    // ... existing payload construction ...
    forceIteration: options.forceIteration,
  };

  // Validate force iteration if provided
  if (payload.forceIteration) {
    const errors = validateForceIterationConfig(payload.forceIteration);
    if (errors.length > 0) {
      throw new Error(
        `Invalid force iteration config: ${errors.join(', ')}`
      );
    }
  }

  return sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);
}
```

## Common Integration Patterns

### Pattern 1: Conditional Force Iteration

```typescript
interface TestOptions {
  enableForceIteration?: boolean;
  forcedIteration?: ForceIterationConfig;
}

function buildPayload(taskId: string, options: TestOptions): CFNLoopPayload {
  const payload: CFNLoopPayload = {
    taskId,
    description: 'Test payload',
    mode: 'standard',
    maxIterations: 5,
    currentIteration: 1,
    startedAt: new Date().toISOString(),
    successCriteria: {
      testCommand: 'npm test',
      passRateThreshold: 0.95,
    },
  };

  if (options.enableForceIteration && options.forcedIteration) {
    payload.forceIteration = options.forcedIteration;
  }

  return payload;
}
```

### Pattern 2: Validate Before Sending

```typescript
async function sendCFNLoopSafely(
  payload: CFNLoopPayload
): Promise<void> {
  // Validate force iteration if present
  if (payload.forceIteration) {
    const errors = validateForceIterationConfig(payload.forceIteration);
    if (errors.length > 0) {
      console.error('Invalid force iteration config:');
      errors.forEach((e) => console.error(`  - ${e}`));
      throw new Error('Configuration validation failed');
    }
  }

  await sendEvent('cfn.loop.start', payload);
}
```

### Pattern 3: Track Multiple Scenarios

```typescript
interface IterationScenario {
  name: string;
  forceConfig: ForceIterationConfig;
  expectedOutcome: 'PROCEED' | 'ITERATE' | 'ABORT';
}

const scenarios: IterationScenario[] = [
  {
    name: 'Gate failure forces iteration',
    forceConfig: {
      iteration: 1,
      gateResult: 'FAIL',
      consensusResult: 'PASS',
      poDecision: 'ITERATE',
    },
    expectedOutcome: 'ITERATE',
  },
  {
    name: 'Consensus failure forces iteration',
    forceConfig: {
      iteration: 2,
      gateResult: 'PASS',
      consensusResult: 'FAIL',
      poDecision: 'ITERATE',
    },
    expectedOutcome: 'ITERATE',
  },
  {
    name: 'All pass, PO approves',
    forceConfig: {
      iteration: 5,
      gateResult: 'PASS',
      consensusResult: 'PASS',
      poDecision: 'PROCEED',
    },
    expectedOutcome: 'PROCEED',
  },
];

async function testAllScenarios() {
  for (const scenario of scenarios) {
    const payload: CFNLoopPayload = {
      taskId: `scenario-${scenario.name}`,
      description: scenario.name,
      mode: 'standard',
      maxIterations: 5,
      currentIteration: 1,
      startedAt: new Date().toISOString(),
      successCriteria: {
        testCommand: 'npm test',
        passRateThreshold: 0.95,
      },
      forceIteration: scenario.forceConfig,
    };

    const result = await sendEvent('cfn.loop.start', payload);

    const finalDecision = result.iterationResults?.[0]?.productOwnerDecision.decision;
    expect(finalDecision).toBe(scenario.expectedOutcome);
  }
}
```

## Validation Strategy

### Pre-Integration Checks

```bash
# 1. Verify TypeScript compilation
npx tsc --noEmit

# 2. Run type-specific tests
npm run test:types

# 3. Verify exports
node -e "const t = require('./src/types/cfn-types');
  console.log('Exports:', Object.keys(t).length);"
```

### Integration Testing

```typescript
// Verify workflow accepts new types
describe('CFN Loop Workflow', () => {
  it('accepts CFNLoopPayload with forceIteration', async () => {
    const payload: CFNLoopPayload = {
      // ... with forceIteration field
    };

    // Should not throw type errors
    await sendEvent('cfn.loop.start', payload);
  });

  it('processes forced iteration correctly', async () => {
    const payload: CFNLoopPayload = {
      // ... with valid forceIteration
    };

    const result = await sendEvent('cfn.loop.start', payload);

    // Verify iteration results included
    expect(result.iterationResults).toBeDefined();
  });

  it('maintains backward compatibility', async () => {
    const payload: CFNLoopPayload = {
      // ... WITHOUT forceIteration
    };

    // Should work as before
    await sendEvent('cfn.loop.start', payload);
  });
});
```

## Migration Path

### For Existing Code

1. **No changes required** - `forceIteration` is optional
2. **No breaking changes** - All existing types work unchanged
3. **Gradual adoption** - Add force iteration to specific tests first

### For New Code

1. **Import new utilities** - Use `validateForceIterationConfig`, etc.
2. **Define scenarios** - Create `ForceIterationConfig` objects
3. **Add to payloads** - Include `forceIteration` field
4. **Verify results** - Check `iterationResults` array

## Debugging Tips

### Inspect Force Iteration State

```typescript
if (payload.forceIteration) {
  console.log('Force iteration enabled:', {
    iteration: payload.forceIteration.iteration,
    gate: payload.forceIteration.gateResult,
    consensus: payload.forceIteration.consensusResult,
    decision: payload.forceIteration.poDecision,
  });
}
```

### Verify Iteration Results

```typescript
if (result.iterationResults) {
  console.table(result.iterationResults.map((r) => ({
    iteration: r.iteration,
    gatePassed: r.gatePassed,
    consensusMet: r.consensusMet,
    decision: r.productOwnerDecision.decision,
    forceApplied: r.forceApplied,
  })));
}
```

### Validate Configuration

```typescript
const forceConfig: ForceIterationConfig = { /* ... */ };
const errors = validateForceIterationConfig(forceConfig);

if (errors.length > 0) {
  console.error('Configuration errors:');
  errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
}
```

## See Also

- **Type Definitions:** `/src/types/cfn-types.ts`
- **Full Documentation:** `/docs/NORTH_STAR_2_TYPES.md`
- **Quick Reference:** `/docs/FORCE_ITERATION_QUICK_REFERENCE.md`
- **Example Test:** `/tests/e2e/north-star-2-iteration-workflow.test.ts`
