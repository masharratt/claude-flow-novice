# CFN Loop Validation - TypeScript Module

Complete TypeScript validation framework for CFN Loop critical path with comprehensive type safety, vapor detection, and production-ready implementation.

**Status:** Production Ready | **Coverage:** 90%+ | **Version:** 1.0.0

## Quick Start

### Installation

```bash
cd $HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation
npm install
npm run build
npm test -- --coverage
```

### Basic Usage

```typescript
import { CFNValidator } from './src/validator';

const validator = new CFNValidator({
  mode: 'standard',
  taskId: 'my-task'
});

// Check deliverables exist
const deliverables = await validator.validateDeliverables([
  'src/auth.ts',
  'dist/auth.js'
]);

if (!deliverables.allExist) {
  console.log('Missing:', deliverables.missingFiles);
}

// Detect vapor (claims without deliverables)
const vapor = await validator.detectConsensusOnVapor(
  agentOutput,
  expectedFiles
);

if (vapor.detected) {
  console.log('VAPOR DETECTED:', vapor.missingDeliverables);
}
```

## Core Features

### 1. Deliverable Validation
Verify that expected output files exist and are accessible.

```bash
./validate-deliverables.sh --paths "file1.js,file2.js" --json
```

### 2. Gate Validation
Check if test pass rate meets mode-specific thresholds.

```bash
./validate-gate.sh --pass-rate 0.96 --mode standard --json
```

### 3. Vapor Detection
Detect when agents claim completion but deliverables don't exist.

```bash
./detect-vapor.sh \
  --output "Task completed" \
  --deliverables "src/auth.ts,tests/auth.test.ts" \
  --json
```

### 4. Success Criteria Validation
Verify custom success conditions (file exists, tests pass, etc.).

```typescript
const criteria: SuccessCriteria[] = [
  {
    type: 'file_exists',
    paths: ['src/index.ts'],
    description: 'Main file exists'
  }
];

const result = await validator.checkSuccessCriteria(criteria);
```

### 5. Consensus Validation
Check if validator consensus scores meet threshold.

```typescript
const scores = [0.97, 0.98, 0.96];
const consensus = await validator.validateConsensus(scores, 'standard');
```

## Mode Thresholds

| Mode | Gate | Consensus | Use Case |
|------|------|-----------|----------|
| MVP | 70% | 80% | Prototyping |
| Standard | 95% | 90% | Production |
| Enterprise | 98% | 95% | Critical systems |

## Vapor Detection

**Most Important:** Prevents agents claiming completion without deliverables.

### What is Vapor?

When an agent claims "Task completed successfully" but the expected files don't exist.

### Detection Algorithm

```
1. Check if output claims completion
   → Recognizes: "complete", "done", "finished", "success", etc.

2. Validate deliverables exist
   → File system check for all expected paths

3. Calculate confidence
   → Missing ratio (1 of 3 = 33% confidence)

4. Result
   → Detected = claims AND missing
```

### Example

```typescript
// Agent output
const output = 'Task completed. Created auth.ts and tests.test.ts';

// Expected files
const expected = ['src/auth.ts', 'tests/auth.test.ts'];

// Detect
const vapor = await validator.detectConsensusOnVapor(output, expected);

if (vapor.detected) {
  console.log('VAPOR DETECTED!');
  console.log('Claims:', output.substring(0, 50));
  console.log('Missing:', vapor.missingDeliverables);
  console.log('Confidence:', (vapor.confidence * 100).toFixed(0) + '%');
}
```

## Architecture

```
src/
├── types.ts              # Type definitions and guards
├── validator.ts          # Main CFNValidator class
└── cli/
    ├── validate-deliverables.ts   # CLI for deliverables
    ├── validate-gate.ts            # CLI for gate check
    └── detect-vapor.ts             # CLI for vapor detection
```

### Type Safety

- 100% strict TypeScript (no `any` types)
- Discriminated unions for error handling
- Custom error types (ValidationError, ConsensusOnVaporError)
- Complete type coverage

### Testing

```bash
npm test                    # Run all tests
npm test -- --coverage      # With coverage report
npm test -- --watch         # Watch mode
```

**Coverage:** 90%+ lines, statements, functions, 85%+ branches

## API Reference

### CFNValidator

```typescript
class CFNValidator {
  constructor(config: ValidationConfig)

  // Deliverables
  validateDeliverables(paths: string[]): Promise<DeliverableValidationResult>

  // Success Criteria
  checkSuccessCriteria(criteria: SuccessCriteria[]): Promise<SuccessCriteriaValidationResult>

  // Gate
  validateGatePass(passRate: number, mode?: ExecutionMode): Promise<GateValidationResult>

  // Consensus
  validateConsensus(scores: number[], mode?: ExecutionMode): Promise<ConsensusValidationResult>

  // Vapor (Most Important)
  detectConsensusOnVapor(agentOutput: string, expectedDeliverables: string[]): Promise<VaporDetectionResult>

  // Comprehensive
  performValidation(options: ValidationOptions): Promise<ValidationResult>
}
```

## CLI Usage

### Validate Deliverables

```bash
# Check files exist
./validate-deliverables.sh --paths "file1.js,file2.js"

# Load from file
./validate-deliverables.sh --file-list deliverables.txt

# JSON output
./validate-deliverables.sh --paths "file1.js,file2.js" --json

# Exit codes:
# 0 = all files exist
# 1 = some missing
```

### Validate Gate

```bash
# Check pass rate (standard mode = 0.95 threshold)
./validate-gate.sh --pass-rate 0.96 --mode standard

# Custom threshold
./validate-gate.sh --pass-rate 0.96 --threshold 0.90

# JSON output
./validate-gate.sh --pass-rate 0.96 --mode enterprise --json

# Exit codes:
# 0 = gate passed
# 1 = gate failed
```

### Detect Vapor

```bash
# Detect claims without deliverables
./detect-vapor.sh \
  --output "Task completed" \
  --deliverables "file1.js,file2.js"

# Load output from file
./detect-vapor.sh \
  --output-file agent_output.log \
  --deliverables "file1.js,file2.js"

# JSON output
./detect-vapor.sh \
  --output "Completed" \
  --deliverables "file1.js,file2.js" \
  --json

# Exit codes:
# 0 = no vapor
# 1 = vapor detected
```

## Integration Examples

### Loop 3 Agent Completion

```typescript
const validator = new CFNValidator({
  mode: 'standard',
  taskId,
  agentId: process.env.AGENT_ID
});

const result = await validator.performValidation({
  deliverables: expectedFiles,
  passRate: calculatePassRate(tests),
  agentOutput: executionLog,
  successCriteria: successCriteria
});

if (!result.passed) {
  if (result.vapor?.detected) {
    // Provide feedback on missing files
    feedback.missingDeliverables = result.vapor.missingDeliverables;
  }
  reportConfidence(0.50, 'ITERATE');
} else {
  reportConfidence(0.95, 'PROCEED');
}
```

### Orchestrator Vapor Check

```bash
VAPOR=$($HOME/.claude/skills/cfn-loop-orchestration-v2/lib/validation/detect-vapor.sh \
  --output "$LOOP3_OUTPUT" \
  --deliverables "$(echo ${FILES[@]} | tr ' ' ',')" \
  --json)

if [ "$(echo "$VAPOR" | jq '.detected')" = "true" ]; then
  echo "Vapor detected, requesting iteration:"
  echo "$VAPOR" | jq '.missingDeliverables[]'
  redis-cli lpush "swarm:${TASK_ID}:proceed" "false"
fi
```

## Error Handling

```typescript
import { ValidationError, ConsensusOnVaporError } from './src/types';

try {
  const result = await validator.performValidation({...});

  if (!result.passed) {
    for (const error of result.errors) {
      if (error instanceof ConsensusOnVaporError) {
        console.error('Vapor detected:', error.details?.missingDeliverables);
      } else if (error instanceof ValidationError) {
        console.error(`${error.code}: ${error.message}`);
      }
    }
  }
} catch (error) {
  console.error('Unexpected error:', error);
}
```

## Performance

| Operation | Time | Note |
|-----------|------|------|
| Validate 10 files | ~10ms | Filesystem I/O |
| Check 5 criteria | ~100ms | Command execution |
| Gate check | <1ms | Math only |
| Consensus check | <1ms | Math only |
| Vapor detection | ~10ms | File I/O + string matching |
| Full validation | ~200ms | Combined |

## File Structure

```
.claude/skills/cfn-loop-orchestration-v2/lib/validation/
├── src/
│   ├── types.ts                    # Type definitions
│   ├── validator.ts                # Core validator
│   └── cli/
│       ├── validate-deliverables.ts
│       ├── validate-gate.ts
│       └── detect-vapor.ts
├── tests/
│   └── validator.test.ts           # 35+ test cases
├── dist/                           # Compiled JavaScript
├── package.json
├── tsconfig.json
├── validate-*.sh                   # Bash wrappers
├── SKILL_TYPESCRIPT.md             # Complete documentation
├── IMPLEMENTATION_SUMMARY.md       # Implementation details
└── README_TYPESCRIPT.md            # This file
```

## Building

```bash
# Build TypeScript
npm run build

# Type check only
npm run type-check

# Clean and rebuild
npm run clean && npm run build

# Watch mode (rebuild on changes)
npm run build:watch
```

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Specific test
npm test -- --testNamePattern="vapor"

# Verbose output
npm test -- --verbose
```

## Documentation

- **Complete API:** `SKILL_TYPESCRIPT.md` (2,000+ lines)
- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`
- **Code Comments:** All functions documented with JSDoc

## Dependencies

**Runtime:** None (pure Node.js)

**Development:**
- TypeScript 5.0+
- Jest 29.5+
- ESLint 8+
- Prettier 3+

## Troubleshooting

### Build Issues
```bash
npm run clean && npm install && npm run build
npm run type-check  # Check for TS errors
```

### Test Failures
```bash
npm test -- --verbose --testNamePattern="failing-test"
```

### CLI Issues
```bash
node dist/cli/validate-deliverables.js --help
```

## Related Documentation

- CFN Loop Orchestration: `.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/SKILL.md`
- Gate Checker: `src/gate-checker/gate-checker.ts`
- Orchestrator Integration: `.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh`

## Support

For issues or questions:
1. Check `SKILL_TYPESCRIPT.md` for complete documentation
2. Review test cases in `tests/validator.test.ts`
3. Check error messages and codes in `src/types.ts`

## License

MIT

---

**Ready for production deployment with 90%+ test coverage and comprehensive vapor detection.**
