# CFN Loop Output Processing - TypeScript Module

Type-safe, consolidated output processing for CFN Loop agents.

## Quick Start

### Installation

```bash
npm install
npm run build
```

### Usage

#### Process Loop 3 (Implementer) Output

```bash
npx ts-node src/cli/process-loop3.ts \
  --agent-id "coder-1" \
  --output "Implementation complete. Confidence: 0.85"
```

#### Process Loop 2 (Validator) Output

```bash
npx ts-node src/cli/process-loop2.ts \
  --validator-id "reviewer-1" \
  --output "Validation passed. Confidence: 0.92"
```

#### Calculate Consensus

```bash
npx ts-node src/cli/process-loop2.ts \
  --consensus \
  --results-file ./validator-results.json \
  --threshold 0.75
```

### Programmatic Usage

```typescript
import {
  parseConfidence,
  extractFeedback,
  parseLoop3Output,
  parseLoop2Output,
  calculateConsensus,
} from './src/output-processor';

// Extract confidence score
const { score, source } = parseConfidence('Confidence: 0.85');

// Parse validator feedback
const result = parseLoop2Output(validatorOutput, 'reviewer-1');

// Calculate consensus from multiple validators
const consensus = calculateConsensus([result1, result2, result3], 0.75);
```

## Features

- **5+ Confidence Patterns**: Explicit numeric, percentage, qualitative, parentheses, etc.
- **Robust Feedback Parsing**: Markdown sections, inline format, multiple severity levels
- **Consensus Calculation**: Aggregate results from multiple validators
- **Type-Safe Interfaces**: Full TypeScript support with strict mode
- **90%+ Test Coverage**: Comprehensive test suite with edge cases
- **CLI Tools**: Process agent outputs directly
- **Zero Dependencies**: Uses Node.js standard library only

## Testing

```bash
# Run all tests with coverage
npm test

# Run specific test suite
npm test -- --testNamePattern="parseConfidence"

# Watch mode
npm test -- --watch

# Check type coverage
npm run type-check
```

## Documentation

See `SKILL.md` for complete documentation including:
- Architecture and design patterns
- Type definitions and interfaces
- Function reference with examples
- CLI tool documentation
- Integration guide
- Migration guide from bash scripts

## Related Skills

- [Agent Output Processing](../cfn-agent-output-processing/SKILL.md)
- [Loop Orchestration](../cfn-loop-orchestration/SKILL.md)

## What's New

This module consolidates three separate bash skills:
- `cfn-loop2-output-processing/parse-feedback.sh`
- `cfn-loop3-output-processing/parse-confidence.sh`
- `cfn-loop3-output-processing/calculate-confidence.sh`

Into a single, type-safe TypeScript module with 90%+ test coverage.

## License

MIT
