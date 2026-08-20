# CFN Loop Validation TypeScript Module

**Purpose:** Unified TypeScript validation framework for CFN Loop critical path with comprehensive type safety and vapor detection.

**Version:** 1.0.0
**Status:** Production Ready
**Coverage:** 90%+

---

## Overview

The CFN Loop Validation module provides a complete TypeScript-based validation system that replaces bash validation scripts with type-safe, testable implementations. It covers:

- **Deliverable Validation:** Verify files exist and are accessible
- **Success Criteria Validation:** Verify custom success conditions met
- **Gate Validation:** Check test pass rates against thresholds
- **Consensus Validation:** Validate validator scores and consensus
- **Vapor Detection:** Prevent "consensus on vapor" anti-pattern

---

## Architecture

### Core Components

```
src/
├── types.ts              # Type definitions (ExecutionMode, ValidationConfig, etc.)
├── validator.ts          # Main CFNValidator class
└── cli/
    ├── validate-deliverables.ts    # CLI: Check deliverables exist
    ├── validate-gate.ts             # CLI: Check gate thresholds
    └── detect-vapor.ts              # CLI: Detect vapor claims
```

### Type System

```typescript
// Execution modes with thresholds
type ExecutionMode = 'mvp' | 'standard' | 'enterprise';

// Validation configuration
interface ValidationConfig {
  mode: ExecutionMode;
  taskId: string;
  agentId?: string;
  timeout?: number;
}

// Unified result containing all validations
interface ValidationResult {
  taskId: string;
  passed: boolean;
  deliverables?: DeliverableValidationResult;
  successCriteria?: SuccessCriteriaValidationResult;
  gate?: GateValidationResult;
  consensus?: ConsensusValidationResult;
  vapor?: VaporDetectionResult;
  errors: ValidationError[];
  warnings: string[];
}
```

### Mode-Specific Thresholds

| Mode | Gate Threshold | Consensus Threshold | Use Case |
|------|----------------|-------------------|----------|
| MVP | 0.70 (70%) | 0.80 (80%) | Prototyping, POCs |
| Standard | 0.95 (95%) | 0.90 (90%) | Production features |
| Enterprise | 0.98 (98%) | 0.95 (95%) | Critical systems |

---

## Installation & Setup

```bash
# Install dependencies
cd $HOME/.claude/skills/cfn-loop-validation
npm install

# Build TypeScript
npm run build

# Run tests
npm test -- --coverage

# Type check only (no build)
npm run type-check
```

---

## Core Validator API

### Class: CFNValidator

```typescript
import { CFNValidator } from '@cfn/loop-validation';

// Create validator with configuration
const validator = new CFNValidator({
  mode: 'standard',
  taskId: 'feature-auth-system',
  agentId: 'coder-001'
});
```

### Validate Deliverables

```typescript
// Check if files exist and are accessible
const result = await validator.validateDeliverables([
  'src/auth.ts',
  'tests/auth.test.ts',
  'dist/auth.js'
]);

// Result includes:
// - exists: boolean for each file
// - sizeBytes: file size
// - lastModified: timestamp
// - mimeType: detected type
// - allExist: true if all files present
// - missingFiles: count of missing files
```

**Example:**
```typescript
const result = await validator.validateDeliverables([
  '/path/to/implementation.ts',
  '/path/to/tests.test.ts'
]);

if (!result.allExist) {
  console.log(`Missing ${result.missingFiles} deliverables`);
  for (const delivery of result.deliverables) {
    if (!delivery.exists) {
      console.log(`  - ${delivery.path} (error: ${delivery.error})`);
    }
  }
}
```

### Validate Success Criteria

```typescript
// Define criteria
const criteria: SuccessCriteria[] = [
  {
    description: 'Main implementation file exists',
    type: 'file_exists',
    condition: 'src/auth.ts must exist',
    paths: ['src/auth.ts']
  },
  {
    description: 'Tests pass',
    type: 'test_pass',
    condition: 'npm test must succeed',
    command: 'npm test',
    timeout: 30000
  },
  {
    description: 'Build succeeds',
    type: 'command_output',
    condition: 'npm run build outputs success',
    command: 'npm run build',
    expected: 'Successfully'
  }
];

// Check criteria
const result = await validator.checkSuccessCriteria(criteria);

// Result includes:
// - passed: true if all criteria met
// - passedCount: number of met criteria
// - failedCount: number of failed criteria
// - details: individual results with errors
```

### Validate Gate Pass Rate

```typescript
// Check if pass rate meets threshold
const result = await validator.validateGatePass(0.96, 'standard');

// Result includes:
// - passed: boolean
// - passRate: 0.96
// - threshold: 0.95 (standard mode)
// - gap: 0.0 if passed, or threshold - passRate
// - reason: human-readable message
```

**Example - Integration with test results:**
```typescript
// After running tests
const passRate = passedTests / totalTests; // e.g., 96/100 = 0.96

const gateResult = await validator.validateGatePass(passRate, 'standard');

if (!gateResult.passed) {
  // Failure details for iteration feedback
  const gap = (gateResult.threshold - gateResult.passRate) * 100;
  console.log(`Gap to threshold: ${gap.toFixed(2)}%`);
  console.log(`Recommendation: Fix ${Math.ceil(gap)} more tests`);
}
```

### Validate Consensus

```typescript
// Multiple validators provide scores
const validatorScores = [0.97, 0.96, 0.98]; // 3 validators

const result = await validator.validateConsensus(validatorScores, 'standard');

// Result includes:
// - passed: consensus >= threshold
// - consensusScore: average of scores
// - threshold: 0.90 (standard mode)
// - validatorCount: 3
```

### Detect Consensus on Vapor

**Most Important:** Prevents agents claiming completion without deliverables.

```typescript
// Agent claims completion
const agentOutput = `
  Task completed successfully.
  Created files:
  - implementation.ts
  - tests.test.ts
`;

// Check against expected deliverables
const expected = [
  'src/implementation.ts',
  'tests/implementation.test.ts'
];

const result = await validator.detectConsensusOnVapor(agentOutput, expected);

// Returns:
// - detected: true if claims completion but files missing
// - claimsCompletion: true if output says "completed", "done", etc.
// - deliverablesMissing: true if some files don't exist
// - missingDeliverables: list of missing files
// - confidence: 0.0-1.0 based on missing ratio
```

**Example - Integration Loop 3 validation:**
```typescript
// After Loop 3 agents complete
const vaporResult = await validator.detectConsensusOnVapor(
  agentOutput,
  expectedDeliverables
);

if (vaporResult.detected) {
  // CRITICAL: Prevent consensus on vapor
  console.error('VAPOR DETECTED:');
  console.error(`  Agent claims: "${vaporResult.agentOutput.substring(0, 100)}..."`);
  console.error(`  Missing files: ${vaporResult.missingDeliverables.join(', ')}`);
  console.error(`  Confidence: ${(vaporResult.confidence * 100).toFixed(0)}%`);

  // Feedback: Which files to create
  for (const missing of vaporResult.missingDeliverables) {
    console.log(`  Create: ${missing}`);
  }

  return 'ITERATE'; // Don't proceed to Loop 2
}
```

### Comprehensive Validation

```typescript
// Validate everything at once
const result = await validator.performValidation({
  deliverables: ['src/auth.ts', 'dist/auth.js'],
  successCriteria: [
    {
      description: 'Files exist',
      type: 'file_exists',
      condition: 'deliverables must exist',
      paths: ['src/auth.ts', 'dist/auth.js']
    }
  ],
  passRate: 0.96,
  consensusScores: [0.97, 0.98],
  agentOutput: 'Task completed successfully'
});

// Single result with all validations
if (result.passed) {
  console.log('All validations passed');
} else {
  // Handle specific failures
  if (result.vapor?.detected) {
    console.error('Vapor detected - agent claims vs deliverables mismatch');
  }
  if (result.gate?.passed === false) {
    console.error(`Gate failed: ${result.gate.gap.toFixed(2)}% gap to threshold`);
  }
  if (result.errors.length > 0) {
    result.errors.forEach(err => {
      console.error(`${err.code}: ${err.message}`);
    });
  }
}
```

---

## CLI Usage

### Validate Deliverables

```bash
# Simple path list
./validate-deliverables.sh --paths file1.js,file2.js

# From file
./validate-deliverables.sh --file-list deliverables.txt

# JSON output
./validate-deliverables.sh --paths file1.js,file2.js --json

# Exit codes:
# 0 = all files exist
# 1 = some files missing
```

**Example:**
```bash
# Check build artifacts
./validate-deliverables.sh \
  --paths "dist/auth.js,dist/auth.d.ts,dist/auth.js.map" \
  --mode standard \
  --json | jq '.deliverables[] | select(.exists == false)'
```

### Validate Gate

```bash
# Check pass rate against standard threshold (0.95)
./validate-gate.sh --pass-rate 0.96 --mode standard

# Check against custom threshold
./validate-gate.sh --pass-rate 0.96 --threshold 0.90

# JSON output
./validate-gate.sh --pass-rate 0.96 --mode enterprise --json

# Exit codes:
# 0 = gate passed
# 1 = gate failed
```

**Example:**
```bash
# Typical test flow
PASS_RATE=$(npm test 2>&1 | grep -o '[0-9]\+/[0-9]\+' | awk -F/ '{print $1/$2}')

./validate-gate.sh --pass-rate "$PASS_RATE" --mode standard --json | \
  jq '{passed: .passed, reason: .reason, gap: .gap}'
```

### Detect Vapor

```bash
# Detect claims without deliverables
./detect-vapor.sh \
  --output "Task completed successfully" \
  --deliverables "src/auth.ts,tests/auth.test.ts"

# Load output from file
./detect-vapor.sh \
  --output-file agent_output.log \
  --deliverables "src/auth.ts,src/client.ts"

# JSON output
./detect-vapor.sh \
  --output "Implementation complete" \
  --deliverables "missing1.ts,missing2.ts" \
  --json

# Exit codes:
# 0 = no vapor detected
# 1 = vapor detected
```

**Example:**
```bash
# Integration into orchestrator
VAPOR_RESULT=$(./.claude/skills/cfn-loop-validation/detect-vapor.sh \
  --output "$AGENT_OUTPUT" \
  --deliverables "$(echo $EXPECTED_FILES | tr ' ' ',')" \
  --json)

if [ "$(echo "$VAPOR_RESULT" | jq '.detected')" = "true" ]; then
  echo "ERROR: Consensus on vapor"
  echo "$VAPOR_RESULT" | jq '.missingDeliverables'
  exit 1
fi
```

---

## Vapor Detection Deep Dive

### What is Vapor?

**Consensus on Vapor** = Agent claims completion but deliverables don't exist.

```
Example: Loop 3 Agent Output
"Task completed successfully. Created:
- src/auth.ts
- tests/auth.test.ts
- dist/auth.js"

Reality: Files don't exist
=> Consensus on Vapor Detected!
```

### Why It Matters

Without vapor detection:
1. Agent claims completion
2. Loop 2 validators review "completed" task
3. Loop 2 reports consensus on non-existent work
4. Product Owner approves vapor
5. Task appears done but is actually failed

### Detection Algorithm

```typescript
// 1. Check if output claims completion
const claimsCompletion = /complete|done|finished|success|delivered|created/i.test(output);

// 2. Validate expected deliverables exist
const validation = await validateDeliverables(expectedDeliverables);

// 3. Calculate confidence
const confidence = missingCount / totalCount; // 0.0-1.0

// 4. Result
const detected = claimsCompletion && !validation.allExist;
```

### Confidence Scoring

```
Scenario 1: 1 of 3 files missing
  Confidence: 33% (1/3)
  => Moderate confidence vapor detected

Scenario 2: 3 of 3 files missing
  Confidence: 100% (3/3)
  => High confidence vapor detected

Scenario 3: 0 of 3 files missing
  Confidence: 0% (0/3)
  => No vapor (all deliverables present)
```

### Recognized Completion Keywords

The validator recognizes these as completion claims:
- "complete", "completed"
- "done", "finished"
- "success", "successful"
- "delivered"
- "implemented", "created"
- "generated"

---

## Integration Examples

### Loop 3 Agent Completion Pattern

```typescript
// At end of Loop 3 agent execution
const validator = new CFNValidator({
  mode: 'standard',
  taskId,
  agentId: process.env.AGENT_ID
});

// Perform comprehensive validation
const result = await validator.performValidation({
  deliverables: expectedFiles,
  passRate: calculatePassRate(testResults),
  agentOutput: executionLog,
  successCriteria: successCriteria
});

if (!result.passed) {
  if (result.vapor?.detected) {
    // Provide detailed feedback for iteration
    console.error('VAPOR DETECTED - Deliverables missing:');
    for (const file of result.vapor.missingDeliverables) {
      console.error(`  - ${file}`);
    }
  }

  // Report confidence based on what actually passed
  const confidence = result.gate?.passRate || 0.0;
  reportConfidence(confidence, 'ITERATE');
  process.exit(1);
}

reportConfidence(0.95, 'PROCEED');
process.exit(0);
```

### Orchestrator Vapor Detection

```bash
# After Loop 3 execution, before Loop 2

VAPOR_CHECK=$(./.claude/skills/cfn-loop-validation/detect-vapor.sh \
  --output "$LOOP3_OUTPUT" \
  --deliverables "$(echo ${EXPECTED_FILES[@]} | tr ' ' ',')" \
  --json)

if [ "$(echo "$VAPOR_CHECK" | jq '.detected')" = "true" ]; then
  log_error "Consensus on Vapor Detected"
  echo "$VAPOR_CHECK" | jq '.missingDeliverables[]' | xargs -I {} echo "  Missing: {}"

  # Feedback for next iteration
  echo "Feedback: Complete these deliverables:"
  echo "$VAPOR_CHECK" | jq '.missingDeliverables[]'

  # Skip Loop 2, retry Loop 3
  PROCEED="false"
else
  # Gate check passes, signal Loop 2
  PROCEED="true"
fi
```

---

## Error Handling

### Custom Error Types

```typescript
import { ValidationError, ConsensusOnVaporError } from '@cfn/loop-validation';

try {
  const result = await validator.detectConsensusOnVapor(output, files);

  if (result.detected) {
    throw new ConsensusOnVaporError(
      'Agent claims completion but deliverables missing',
      {
        missingDeliverables: result.missingDeliverables,
        confidence: result.confidence
      }
    );
  }
} catch (error) {
  if (error instanceof ConsensusOnVaporError) {
    // Handle vapor-specific error
    const missing = error.details?.missingDeliverables;
    console.error(`Create: ${missing.join(', ')}`);
  } else if (error instanceof ValidationError) {
    // Handle general validation error
    console.error(`${error.code}: ${error.message}`);
  }
}
```

### Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `DELIVERABLE_VALIDATION_FAILED` | File check error | Check paths, permissions |
| `CRITERIA_VALIDATION_FAILED` | Success criteria check error | Review criteria syntax |
| `GATE_VALIDATION_FAILED` | Gate check error | Check pass rate value |
| `CONSENSUS_VALIDATION_FAILED` | Consensus check error | Provide validator scores |
| `CONSENSUS_ON_VAPOR` | Agent claims vs reality mismatch | Iterate on missing files |
| `INVALID_CRITERION` | Malformed success criteria | Check criteria structure |

---

## Testing

### Unit Tests

```bash
# Full test suite with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch

# Specific test file
npm test -- validator.test.ts

# Specific test case
npm test -- --testNamePattern="detectConsensusOnVapor"
```

### Test Coverage

Current coverage targets:
- Lines: 90%+
- Statements: 90%+
- Functions: 90%+
- Branches: 85%+

### Example Test

```typescript
it('should detect vapor when completion claimed but files missing', async () => {
  const agentOutput = 'Task completed successfully. All files created.';
  const deliverables = [
    'src/auth.ts',
    'tests/auth.test.ts'
  ];

  const result = await validator.detectConsensusOnVapor(
    agentOutput,
    deliverables
  );

  expect(result.detected).toBe(true);
  expect(result.claimsCompletion).toBe(true);
  expect(result.deliverablesMissing).toBe(true);
  expect(result.missingDeliverables).toHaveLength(2);
  expect(result.confidence).toBeGreaterThan(0.5);
});
```

---

## Performance

### Timing Benchmarks

| Operation | Time | Note |
|-----------|------|------|
| Validate 10 deliverables | <10ms | Local filesystem |
| Check 5 success criteria | <100ms | Depends on commands |
| Gate check | <1ms | Threshold math only |
| Consensus check | <1ms | Score math only |
| Vapor detection | <10ms | File I/O bound |
| Full validation | <200ms | Combined operations |

### Optimization Tips

```typescript
// Cache results if checking same files multiple times
const cached = await validator.validateDeliverables(paths);

// Use targeted validation, not full performValidation
const vaporOnly = await validator.detectConsensusOnVapor(output, deliverables);

// Batch file checks
const result = await validator.validateDeliverables([
  'file1.ts',
  'file2.ts',
  'file3.ts'
  // Single call faster than 3 separate calls
]);
```

---

## Migration from Bash

### Old vs New

**Old (Bash):**
```bash
# Deliverable validation (custom regex)
for file in file1.js file2.js; do
  [ -f "$file" ] || exit 1
done

# Gate check (hardcoded thresholds)
[ $(echo "$PASS_RATE > 0.95" | bc) -eq 1 ] || exit 1

# No vapor detection available
```

**New (TypeScript):**
```typescript
// Typed deliverable validation
const result = await validator.validateDeliverables(['file1.js', 'file2.js']);
if (!result.allExist) throw new Error('Missing deliverables');

// Mode-aware gate checking
const gate = await validator.validateGatePass(passRate, 'standard');
if (!gate.passed) throw new Error(gate.reason);

// Comprehensive vapor detection
const vapor = await validator.detectConsensusOnVapor(output, expected);
if (vapor.detected) throw new ConsensusOnVaporError('...');
```

### Benefits

- Type safety (compile-time errors vs runtime surprises)
- Comprehensive testing (90%+ coverage)
- Better error handling (custom error types)
- Clearer intent (named functions, documented APIs)
- Reusable components (import and use in any project)
- Performance (optimized JS vs interpreted bash)

---

## Troubleshooting

### Build Issues

```bash
# Clean and rebuild
npm run clean && npm run build

# Type check without build
npm run type-check

# Show TypeScript errors
npx tsc --noEmit
```

### Test Failures

```bash
# Run tests with verbose output
npm test -- --verbose

# Check coverage gaps
npm test -- --coverage --collectCoverageFrom='src/**/*.ts'

# Debug specific test
npm test -- --testNamePattern="vapor" --verbose
```

### CLI Issues

```bash
# Ensure Node is installed
node --version

# Check TypeScript is compiled
ls -la dist/cli/

# Test with JSON output
./validate-deliverables.sh --paths "file.js" --json

# Manually run compiled JS
node dist/cli/validate-deliverables.js --paths "file.js"
```

---

## References

- **Types:** `/src/types.ts`
- **Validator:** `/src/validator.ts`
- **Tests:** `/tests/validator.test.ts`
- **Package:** `/package.json`
- **Config:** `/tsconfig.json`

---

## Related Documentation

- CFN Loop Architecture: `.claude/skills/cfn-loop-orchestration/SKILL.md`
- Gate Checker Details: `src/gate-checker/gate-checker.ts`
- Orchestrator Integration: `.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh`
