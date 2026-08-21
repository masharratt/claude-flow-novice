# Validation Abstraction Layer - TypeScript Module Guide

## Overview

The `validator.ts` module provides a unified, type-safe abstraction layer for all validation operations in the CFN Loop orchestration system. It abstracts gate checking, consensus validation, and deliverable verification under a consistent interface.

**Module Location:** `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/src/helpers/validator.ts`
**Test Suite:** `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/tests/validator.test.ts`
**Lines of Code:** 276 (implementation) + 643 (tests)

## Core Components

### 1. ValidationResult Interface

Unified result type for all validation operations:

```typescript
export interface ValidationResult {
  passed: boolean;           // Validation passed/failed
  score: number;            // 0.0-1.0 score
  threshold: number;        // Comparison threshold
  reason: string;          // Human-readable reason
  metadata?: Record<string, any>; // Type-specific metadata
}
```

**Key Features:**
- Consistent interface across all validator types
- Rich metadata for debugging and analysis
- Human-readable failure reasons

### 2. Validator Interface

Abstract validator contract:

```typescript
export interface Validator {
  validate(data: any): Promise<ValidationResult>;
  name: string;
}
```

All validators implement this interface asynchronously.

### 3. Built-in Validators

#### GateValidator
Validates Loop 3 test pass rates against mode-specific thresholds.

```typescript
const validator = new GateValidator();
const result = await validator.validate({
  passRate: 0.96,
  mode: 'standard',
  threshold?: 0.95  // Optional custom threshold
});
```

**Thresholds (by mode):**
- MVP: 0.70
- Standard: 0.95
- Enterprise: 0.98

#### ConsensusValidator
Validates Loop 2 validator consensus scores.

```typescript
const validator = new ConsensusValidator();
const result = await validator.validate({
  scores: [0.92, 0.89, 0.94],
  mode: 'standard',
  threshold?: 0.90  // Optional custom threshold
});
```

**Thresholds (by mode):**
- MVP: 0.80
- Standard: 0.90
- Enterprise: 0.95

**Metadata includes:**
- `scoreCount`: Number of validators
- `min`/`max`: Score range
- `scores`: Original score array

#### DeliverableValidator
Verifies expected deliverables exist (prevents "consensus on vapor").

```typescript
const validator = new DeliverableValidator();
const result = await validator.validate({
  files: ['src/feature.ts', 'tests/feature.test.ts'],
  expectedTypes?: ['.ts'],
  requireGitChanges?: true,
  taskType?: 'implement new authentication module'
});
```

**Metadata includes:**
- `found`: Files that exist
- `missing`: Files not found
- `typeErrors`: Type mismatches
- `gitChanges`: Git diff count
- `requiresChanges`: Implementation task detected

### 4. CompositeValidator

Combines multiple validators with AND logic (all must pass):

```typescript
const composite = new CompositeValidator([
  new GateValidator(),
  new ConsensusValidator(),
  new DeliverableValidator()
]);

const result = await composite.validate({
  passRate: 0.96,
  mode: 'standard',
  scores: [0.92, 0.89],
  files: ['src/feature.ts']
});
```

**Features:**
- Runs all validators in parallel
- Combines results with AND logic
- Tracks individual validator results
- Includes all failure reasons

### 5. ValidatorFactory

Factory pattern for creating validators:

```typescript
// Single validator
const gateValidator = ValidatorFactory.create('gate');
const consensusValidator = ValidatorFactory.create('consensus');
const deliverableValidator = ValidatorFactory.create('deliverable');

// Composite validator
const composite = ValidatorFactory.createComposite(['gate', 'consensus']);
```

**Supported types:**
- `'gate'` → GateValidator
- `'consensus'` → ConsensusValidator
- `'deliverable'` → DeliverableValidator

### 6. ValidationContext

Encapsulates validation state and registry:

```typescript
const context = new ValidationContext();

// Register validators
context.registerValidator('gate', new GateValidator());
context.registerValidator('consensus', new ConsensusValidator());

// Validate with single validator
const result = await context.validate('gate', {
  passRate: 0.96,
  mode: 'standard'
});

// Validate all registered validators
const results = await context.validateAll(['gate', 'consensus'], {
  passRate: 0.96,
  mode: 'standard',
  scores: [0.92, 0.89]
});
// Returns: Map<string, ValidationResult>
```

## Usage Patterns

### Pattern 1: Single Validator

```typescript
import { GateValidator } from './helpers/validator';

const validator = new GateValidator();
const result = await validator.validate({
  passRate: 0.96,
  mode: 'standard'
});

if (result.passed) {
  console.log('Gate passed!');
} else {
  console.error(`Gate failed: ${result.reason}`);
}
```

### Pattern 2: Validation Context with Multiple Validators

```typescript
import { ValidationContext, ValidatorFactory } from './helpers/validator';

const context = new ValidationContext();
context.registerValidator('gate', ValidatorFactory.create('gate'));
context.registerValidator('consensus', ValidatorFactory.create('consensus'));

const results = await context.validateAll(['gate', 'consensus'], {
  passRate: 0.96,
  mode: 'standard',
  scores: [0.92, 0.89, 0.94]
});

// Check results
results.forEach((result, name) => {
  console.log(`${name}: ${result.passed ? 'PASS' : 'FAIL'}`);
});
```

### Pattern 3: Composite Validation

```typescript
import { ValidatorFactory } from './helpers/validator';

const composite = ValidatorFactory.createComposite(['gate', 'consensus', 'deliverable']);

const result = await composite.validate({
  passRate: 0.96,
  mode: 'standard',
  scores: [0.92, 0.89],
  files: ['src/feature.ts', 'tests/feature.test.ts'],
  taskType: 'implement authentication'
});

if (result.passed) {
  console.log('All validations passed!');
} else {
  console.log('Some validations failed:\n' + result.reason);
}
```

### Pattern 4: Custom Threshold Validation

```typescript
import { GateValidator } from './helpers/validator';

const validator = new GateValidator();

// Use custom threshold instead of mode default
const result = await validator.validate({
  passRate: 0.92,
  threshold: 0.90,  // Custom threshold
  mode: 'standard'
});
```

## Integration with Orchestrator

The validator module is designed to integrate with the CFN Loop orchestrator:

```typescript
// In orchestrator.ts
import { ValidatorFactory, ValidationContext } from './helpers/validator';

class Orchestrator {
  private validationContext: ValidationContext;

  constructor() {
    this.validationContext = new ValidationContext();
    this.setupValidators();
  }

  private setupValidators() {
    this.validationContext.registerValidator('gate', ValidatorFactory.create('gate'));
    this.validationContext.registerValidator('consensus', ValidatorFactory.create('consensus'));
    this.validationContext.registerValidator('deliverable', ValidatorFactory.create('deliverable'));
  }

  async validateLoop3Results(testResults: TestResult[], mode: ExecutionMode) {
    const passRate = calculatePassRate(testResults);
    const result = await this.validationContext.validate('gate', {
      passRate,
      mode
    });
    return result;
  }

  async validateLoop2Results(consensusScores: number[], mode: ExecutionMode) {
    const result = await this.validationContext.validate('consensus', {
      scores: consensusScores,
      mode
    });
    return result;
  }

  async validateDeliverables(files: string[], taskType: string) {
    const result = await this.validationContext.validate('deliverable', {
      files,
      taskType,
      requireGitChanges: true
    });
    return result;
  }
}
```

## Error Handling

All validators throw typed errors for invalid input:

```typescript
import { ConsensusValidator } from './helpers/validator';

const validator = new ConsensusValidator();

try {
  await validator.validate({
    scores: [1.5, 0.9],  // Invalid: score > 1.0
    mode: 'standard'
  });
} catch (error) {
  console.error('Validation error:', error.message);
  // Output: "Invalid consensus score: 1.5 (must be 0.0-1.0)"
}
```

## CLI Usage

Run validators from command line:

```bash
# Gate validation
node dist/helpers/validator.js gate '{"passRate":0.96,"mode":"standard"}'

# Consensus validation
node dist/helpers/validator.js consensus '{"scores":[0.92,0.89,0.94],"mode":"standard"}'

# Deliverable validation
node dist/helpers/validator.js deliverable '{"files":["src/feature.ts"]}'
```

## Test Coverage

Comprehensive test suite with 51 tests:

### Test Categories

1. **GateValidator Tests (9 tests)**
   - Basic gate logic (pass/fail)
   - Mode-specific thresholds (MVP, Standard, Enterprise)
   - Custom thresholds
   - Gap calculation
   - Edge cases (0.0, 1.0)

2. **ConsensusValidator Tests (12 tests)**
   - Score collection and statistics
   - Mode-specific thresholds
   - Score range validation
   - Error handling (invalid scores, empty arrays)
   - Metadata preservation

3. **DeliverableValidator Tests (8 tests)**
   - File existence checking
   - Type validation
   - Git change tracking
   - Implementation task detection
   - Anti-pattern detection (consensus on vapor)

4. **CompositeValidator Tests (5 tests)**
   - Multiple validator combination
   - AND logic enforcement
   - Result tracking
   - Composite naming

5. **ValidatorFactory Tests (5 tests)**
   - Single validator creation
   - Composite creation
   - Unknown type handling

6. **ValidationContext Tests (4 tests)**
   - Validator registration
   - Single validation
   - Batch validation
   - Error on missing validator

7. **Integration Tests (3 tests)**
   - Complete CFN Loop workflow
   - Mixed pass/fail scenarios
   - Validation history

8. **Error Handling Tests (2 tests)**
   - Invalid data handling
   - Meaningful error messages

### Running Tests

```bash
# Run all validator tests
npm test -- tests/validator.test.ts

# Run with coverage
npm test -- tests/validator.test.ts --coverage

# Run with verbose output
npm test -- tests/validator.test.ts --verbose

# Run specific test suite
npm test -- tests/validator.test.ts -t "GateValidator"
```

## Architecture Benefits

1. **Type Safety**
   - All validators implement consistent interface
   - TypeScript guarantees at compile time
   - No runtime type checks needed

2. **Extensibility**
   - Easy to add new validators
   - Composite pattern enables combinations
   - Factory pattern enables flexibility

3. **Maintainability**
   - Unified validation interface
   - Clear separation of concerns
   - Comprehensive documentation

4. **Testability**
   - Each validator tested independently
   - Composite validators tested together
   - Mock-friendly interfaces

5. **Reusability**
   - Validators work standalone
   - Can be combined in any configuration
   - Validation context enables registry pattern

## Performance Considerations

- Validators run asynchronously
- Composite validators run validators in parallel
- No external dependencies (uses existing helpers)
- Minimal memory footprint

## Related Files

- **Helper Modules:**
  - `src/helpers/gate-check.ts` (gate validation logic)
  - `src/helpers/consensus.ts` (consensus statistics)
  - `src/helpers/deliverable-verifier.ts` (file verification)

- **Types:**
  - `src/types.ts` (core type definitions)

- **Integration Points:**
  - `src/orchestrator/orchestrator.ts` (main orchestrator)
  - `src/gate-checker/gate-checker.ts` (gate checking logic)

## Future Enhancements

Potential improvements for future versions:

1. **Custom Validator Plugins**
   - Allow external validators via registration

2. **Validation Chains**
   - Conditional validation based on previous results
   - Fallback validators if primary fails

3. **Validation Rules Engine**
   - Complex validation rules with conditions
   - Business logic validation

4. **Validation Caching**
   - Cache validation results
   - Time-based or event-based invalidation

5. **Metrics Collection**
   - Track validation performance
   - Aggregate statistics across runs

## Troubleshooting

### Validator Returns Unexpected Result

**Issue:** Validator passes/fails unexpectedly
**Solution:** Check the metadata in ValidationResult for detailed information

```typescript
const result = await validator.validate(data);
console.log('Score:', result.score);
console.log('Threshold:', result.threshold);
console.log('Metadata:', result.metadata);
```

### Type Errors in TypeScript

**Issue:** Cannot pass data to validator
**Solution:** Ensure data matches expected interface

```typescript
// Correct
await validator.validate({
  scores: [0.9, 0.85],
  mode: 'standard'
});

// Incorrect
await validator.validate([0.9, 0.85]);
```

### Composite Validator Partial Failures

**Issue:** Composite passes even though some validators fail
**Solution:** Check individual validator results in metadata

```typescript
const result = await composite.validate(data);
const validatorResults = result.metadata?.validatorResults;
validatorResults.forEach(vr => {
  console.log(`${vr.type}: ${vr.passed ? 'PASS' : 'FAIL'}`);
});
```

## References

- CFN Loop Orchestration: `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/`
- Test Suite: `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/tests/validator.test.ts`
- Type Definitions: `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/src/types.ts`
