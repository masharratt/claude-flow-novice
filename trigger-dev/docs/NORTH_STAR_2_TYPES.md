# North Star 2 - CFN Loop Type Definitions

## Overview

This document describes the TypeScript type definitions added to support North Star 2 iteration testing. These types enable **controlled iteration testing** by allowing test code to inject specific outcomes at predefined iteration points.

**File Location:** `/src/types/cfn-types.ts`

## New Types

### ForceIterationConfig

Controls iteration outcomes for testing purposes. Allows you to force specific results at a given iteration number.

```typescript
export interface ForceIterationConfig {
  /** Iteration number to force (1-based) */
  iteration: number;

  /** Force specific gate result (pass/fail) */
  gateResult: 'PASS' | 'FAIL';

  /** Force specific consensus result (pass/fail) */
  consensusResult: 'PASS' | 'FAIL';

  /** Force Product Owner decision */
  poDecision: 'PROCEED' | 'ITERATE' | 'ABORT';

  /** Optional override for gate pass rate (0.0-1.0) */
  gatePassRate?: number;

  /** Optional override for consensus score (0.0-1.0) */
  consensusScore?: number;

  /** Optional reason for forced outcome */
  reason?: string;
}
```

**Usage Example:**
```typescript
const forceConfig: ForceIterationConfig = {
  iteration: 2,
  gateResult: 'FAIL',
  consensusResult: 'PASS',
  poDecision: 'ITERATE',
  gatePassRate: 0.75,
  consensusScore: 0.92,
  reason: 'Testing iteration 2 with gate failure',
};
```

### Enhanced CFNLoopPayload

Extended with optional `forceIteration` parameter for controlled testing.

```typescript
export interface CFNLoopPayload {
  // ... existing fields ...

  /** Force specific iteration outcomes for testing (optional, North Star 2) */
  forceIteration?: ForceIterationConfig;
}
```

**Key Changes:**
- `forceIteration` is **optional** - existing code continues to work unchanged
- When present, test framework uses forced values instead of calculating actual results
- Enables deterministic, reproducible iteration testing

### IterationResult

Tracks the outcome of each iteration step.

```typescript
export interface IterationResult {
  /** Iteration number (1-based) */
  iteration: number;

  /** Gate check passed this iteration */
  gatePassed: boolean;

  /** Actual gate pass rate achieved */
  gatePassRate: number;

  /** Gate pass rate threshold for mode */
  gateThreshold: number;

  /** Consensus threshold met this iteration */
  consensusMet: boolean;

  /** Actual consensus score achieved */
  consensusScore: number;

  /** Consensus threshold for mode */
  consensusThreshold: number;

  /** Product Owner decision for this iteration */
  productOwnerDecision: ProductOwnerDecision;

  /** Timestamp when iteration completed */
  completedAt: string;

  /** Whether forced override was applied */
  forceApplied: boolean;

  /** Force configuration if applied */
  forceConfig?: ForceIterationConfig;
}
```

### Enhanced CFNLoopResult

Extended to track all iteration results.

```typescript
export interface CFNLoopResult {
  // ... existing fields ...

  /** Iteration results tracking (North Star 2) */
  iterationResults?: IterationResult[];
}
```

## Utility Functions

### isForceIterationApplicable()

Check if a force iteration config applies to the current iteration.

```typescript
export function isForceIterationApplicable(
  forceConfig: ForceIterationConfig | undefined,
  currentIteration: number
): boolean
```

**Returns:** `true` if force config matches current iteration, `false` otherwise.

**Example:**
```typescript
if (isForceIterationApplicable(payload.forceIteration, currentIteration)) {
  // Use forced values instead of actual test results
}
```

### validateForceIterationConfig()

Validates force iteration configuration for correctness.

```typescript
export function validateForceIterationConfig(
  forceConfig: ForceIterationConfig
): string[]
```

**Returns:** Array of validation errors (empty if valid).

**Validated Constraints:**
- `iteration >= 1`
- `gateResult` must be 'PASS' or 'FAIL'
- `consensusResult` must be 'PASS' or 'FAIL'
- `poDecision` must be 'PROCEED', 'ITERATE', or 'ABORT'
- `gatePassRate` must be 0.0-1.0 (if provided)
- `consensusScore` must be 0.0-1.0 (if provided)

**Example:**
```typescript
const errors = validateForceIterationConfig(forceConfig);
if (errors.length > 0) {
  console.error('Invalid force config:', errors);
  throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
}
```

### createIterationResult()

Factory function to create a properly structured iteration result.

```typescript
export function createIterationResult(
  iteration: number,
  gatePassed: boolean,
  gatePassRate: number,
  gateThreshold: number,
  consensusMet: boolean,
  consensusScore: number,
  consensusThreshold: number,
  productOwnerDecision: ProductOwnerDecision,
  forceConfig?: ForceIterationConfig
): IterationResult
```

**Example:**
```typescript
const result = createIterationResult(
  2,                    // iteration
  false,                // gatePassed
  0.75,                 // gatePassRate
  0.95,                 // gateThreshold
  true,                 // consensusMet
  0.92,                 // consensusScore
  0.90,                 // consensusThreshold
  productOwnerDecision,
  forceConfig           // optional
);
```

## Integration Points

### CFN Loop Workflow

The `cfn-loop.ts` workflow should:

1. **Check for force iteration:** At each iteration, check if `forceIteration` applies
2. **Use forced values:** If force config applies, use `gateResult`, `consensusResult`, and `poDecision` from config
3. **Skip actual testing:** When force iteration is applied, skip real test execution
4. **Track iterations:** Collect `IterationResult` objects and include in final result

### Test Files

Test files can now:

1. **Create controlled test scenarios:** Define specific iteration outcomes
2. **Verify iteration tracking:** Check `iterationResults` in final result
3. **Validate multi-iteration workflows:** Test all iteration paths without waiting for real tests

**Example Test Pattern:**
```typescript
const forceConfig: ForceIterationConfig = {
  iteration: 2,
  gateResult: 'FAIL',
  consensusResult: 'PASS',
  poDecision: 'ITERATE',
  reason: 'Gate failure forces iteration',
};

const payload: CFNLoopPayload = {
  taskId: 'test-123',
  description: 'Test iteration path',
  // ... other fields ...
  forceIteration: forceConfig,
};

const result = await sendEvent('cfn.loop.start', payload);

// Verify iteration was tracked
assert(result.iterationResults?.[0].forceApplied === true);
assert(result.iterationResults?.[0].forceConfig?.iteration === 2);
```

## Backward Compatibility

All changes are backward compatible:

- `forceIteration` is optional on `CFNLoopPayload`
- `iterationResults` is optional on `CFNLoopResult`
- Existing code without force iteration continues to work
- All existing types and functions remain unchanged

## Export Summary

The following are exported from `cfn-types.ts`:

**Types (18):**
- `CFNMode`
- `ForceIterationConfig` (NEW)
- `CFNLoopPayload` (enhanced)
- `SuccessCriteria`
- `Loop3JobPayload`
- `AgentResult`
- `TestResults`
- `TestSuiteResult`
- `GateCheckResult`
- `Loop2JobPayload`
- `ValidatorResult`
- `ConsensusResult`
- `ProductOwnerDecision`
- `IterationResult` (NEW)
- `CFNLoopResult` (enhanced)
- `AgentSpawningRequest`
- `AgentSpawningResponse`
- `ThresholdConfig`

**Functions (4):**
- `isForceIterationApplicable()` (NEW)
- `createIterationResult()` (NEW)
- `validateForceIterationConfig()` (NEW)
- `getThresholdConfig()`

## Testing

To validate the types in test code:

```bash
# Run TypeScript compilation check
npx tsc --noEmit

# Run type-specific tests (if available)
npm run test:types
```

## See Also

- **North Star 2 Test:** `/tests/e2e/north-star-2-iteration-workflow.test.ts`
- **CFN Loop Workflow:** `/src/workflows/cfn-loop.ts`
- **CFN Types Reference:** `/src/types/cfn-types.ts`
