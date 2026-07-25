# Agent Output Migration Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-15

## Overview

This guide helps migrate from legacy stdout text output to the standardized Agent Output JSON Schema v1.0. The migration provides:

- **Type safety**: Strict TypeScript interfaces
- **Validation**: Zero-dependency validation library
- **Backward compatibility**: Legacy parser for existing outputs
- **Performance**: <10ms validation, <5MB memory overhead

## Migration Strategy

### Phase 1: Validation (Immediate)

Add validation to existing agents without changing output format:

```typescript
import { parseAgentOutput } from './lib/agent-output-parser';

// Agent produces legacy stdout text
const stdout = agentExecution();

// Parse and validate legacy output
const result = parseAgentOutput(stdout);

if (result.success && result.output) {
  // Use structured output
  console.log(`Confidence: ${result.output.confidence}`);
  console.log(`Deliverables: ${result.output.deliverables?.length || 0}`);
} else {
  // Handle parse errors
  console.error('Parse errors:', result.errors);
}
```

### Phase 2: Hybrid Output (Gradual Migration)

Update agents to output both JSON and text for backward compatibility:

```typescript
import type { Loop3Output } from './types/agent-output';

// Create structured output
const output: Loop3Output = {
  output_type: 'loop3',
  success: true,
  confidence: 0.85,
  iteration: 1,
  deliverables: [
    {
      path: 'src/auth.ts',
      type: 'implementation',
      status: 'created',
    },
  ],
  errors: [],
  metadata: {
    agent_type: 'backend-developer',
    timestamp: new Date().toISOString(),
  },
};

// Output both formats
console.log(JSON.stringify(output));  // For new consumers
console.log('\n--- Legacy Format ---');  // For old consumers
console.log(`Confidence: ${output.confidence}`);
console.log(`Created: ${output.deliverables.length} files`);
```

### Phase 3: JSON-Only (Complete Migration)

Switch to JSON-only output with validation:

```typescript
import { validateAgentOutput } from './lib/agent-output-validator';
import type { Loop3Output } from './types/agent-output';

const output: Loop3Output = {
  // ... structured output
};

// Validate before outputting
const validation = validateAgentOutput(output);
if (!validation.valid) {
  console.error('Output validation failed:', validation.errors);
  process.exit(1);
}

// Output JSON only
console.log(JSON.stringify(output));
```

## Legacy Output Patterns

### Loop 3 (Implementer) Text Format

**Old Format:**
```text
Implementation complete
Confidence: 0.85
Iteration: 1

Deliverables:
- created: src/auth.ts
- modified: src/index.ts
- created: tests/auth.test.ts

Metrics:
Files created: 2
Files modified: 1
Lines of code: 450
Test coverage: 92%

Summary: Implemented JWT authentication with refresh tokens
```

**New Format:**
```json
{
  "output_type": "loop3",
  "success": true,
  "confidence": 0.85,
  "iteration": 1,
  "deliverables": [
    {
      "path": "src/auth.ts",
      "type": "implementation",
      "status": "created"
    },
    {
      "path": "src/index.ts",
      "type": "implementation",
      "status": "modified"
    },
    {
      "path": "tests/auth.test.ts",
      "type": "test",
      "status": "created"
    }
  ],
  "metrics": {
    "files_created": 2,
    "files_modified": 1,
    "lines_of_code": 450,
    "test_coverage": 0.92
  },
  "summary": "Implemented JWT authentication with refresh tokens",
  "errors": [],
  "metadata": {
    "agent_type": "backend-developer",
    "timestamp": "2025-11-15T10:30:00Z"
  }
}
```

### Loop 2 (Validator) Text Format

**Old Format:**
```text
Code Review Complete
Confidence: 0.90
Approved: false

Issues Found:
- [high] Security: SQL injection vulnerability (src/db.ts:45)
- [medium] Quality: Missing error handling (src/api.ts:123)

Recommendations:
- Use parameterized queries for all SQL operations
- Add try-catch blocks around API calls
- Implement input validation middleware
```

**New Format:**
```json
{
  "output_type": "loop2",
  "success": true,
  "confidence": 0.90,
  "iteration": 1,
  "validation_type": "review",
  "issues": [
    {
      "severity": "high",
      "category": "security",
      "message": "SQL injection vulnerability",
      "location": "src/db.ts:45",
      "recommendation": "Use parameterized queries for all SQL operations"
    },
    {
      "severity": "medium",
      "category": "quality",
      "message": "Missing error handling",
      "location": "src/api.ts:123",
      "recommendation": "Add try-catch blocks around API calls"
    }
  ],
  "recommendations": [
    "Use parameterized queries for all SQL operations",
    "Add try-catch blocks around API calls",
    "Implement input validation middleware"
  ],
  "approved": false,
  "errors": [],
  "metadata": {
    "agent_type": "reviewer",
    "timestamp": "2025-11-15T10:35:00Z"
  }
}
```

### Product Owner Text Format

**Old Format:**
```text
Decision: PROCEED

Rationale: All deliverables complete and validated. Consensus achieved at 0.93 (threshold: 0.90). Gate score: 0.87 (threshold: 0.75).

Next Action: Mark task as complete
Iteration: 2
Confidence: 0.95
```

**New Format:**
```json
{
  "output_type": "product_owner",
  "success": true,
  "confidence": 0.95,
  "iteration": 2,
  "decision": "PROCEED",
  "rationale": "All deliverables complete and validated. Consensus achieved at 0.93 (threshold: 0.90). Gate score: 0.87 (threshold: 0.75).",
  "deliverables_validated": true,
  "next_action": "mark_task_complete",
  "consensus_score": 0.93,
  "gate_score": 0.87,
  "errors": [],
  "metadata": {
    "agent_type": "product-owner",
    "timestamp": "2025-11-15T10:40:00Z"
  }
}
```

## Migration Checklist

### For Agent Developers

- [ ] Import agent output types from `src/types/agent-output.ts`
- [ ] Update agent to output structured JSON
- [ ] Add output validation before returning
- [ ] Include required metadata fields
- [ ] Test with validation library
- [ ] Update agent documentation
- [ ] Add integration tests

### For Orchestrator/Coordinator

- [ ] Import validation library from `src/lib/agent-output-validator.ts`
- [ ] Add JSON parsing with fallback to legacy parser
- [ ] Validate all agent outputs
- [ ] Log validation errors
- [ ] Update error handling for validation failures
- [ ] Add metrics for validation success rate
- [ ] Monitor legacy vs. JSON output ratio

### For Skills/Scripts

- [ ] Update stdout parsing to use `parseAgentOutput()`
- [ ] Handle both JSON and legacy formats during transition
- [ ] Add validation for critical paths
- [ ] Update tests for new output format
- [ ] Document migration timeline

## Backward Compatibility

### Legacy Parser Features

The legacy parser (`agent-output-parser.ts`) provides best-effort parsing of text output:

```typescript
import { parseAgentOutput } from './lib/agent-output-parser';

const textOutput = `
Implementation complete
Confidence: 0.85
Created: src/auth.ts
Created: tests/auth.test.ts
`;

const result = parseAgentOutput(textOutput);

if (result.success && result.output) {
  console.log('Parsed output type:', result.output.output_type);
  console.log('Confidence:', result.output.confidence);
  console.log('Deliverables:', result.output.deliverables);
} else {
  console.error('Parse failed:', result.errors);
  console.log('Parser confidence:', result.confidence);
}
```

### Parser Capabilities

**Supported Patterns:**

✅ JSON in markdown code blocks
✅ Confidence score extraction (0.0-1.0 and 0-100 formats)
✅ Iteration number extraction
✅ Deliverable file listings
✅ Issue severity and category detection
✅ Decision keywords (PROCEED/ITERATE/ABORT)
✅ Metrics extraction (files, lines, coverage)

**Limitations:**

⚠️ Lower confidence for complex nested data
⚠️ Limited validation (best-effort parsing)
⚠️ May miss optional fields
⚠️ Cannot infer all metadata

### Handling Parse Failures

```typescript
const result = parseAgentOutput(legacyOutput);

if (!result.success) {
  console.error('Failed to parse legacy output:');
  result.errors.forEach((error) => console.error(`  - ${error}`));

  // Fallback: use raw text output
  console.log('Raw output:', legacyOutput);

  // Log for manual review
  fs.appendFileSync('parse-failures.log',
    `${new Date().toISOString()}\n${legacyOutput}\n\n`);
}
```

## Testing Migration

### Unit Tests

```typescript
import { validateAgentOutput } from './lib/agent-output-validator';
import type { Loop3Output } from './types/agent-output';

test('agent produces valid JSON output', () => {
  const output = myAgent.execute();

  // Parse JSON
  const parsed = JSON.parse(output);

  // Validate structure
  const validation = validateAgentOutput(parsed);
  expect(validation.valid).toBe(true);
  expect(validation.errors).toHaveLength(0);

  // Type-safe access
  const typedOutput = parsed as Loop3Output;
  expect(typedOutput.deliverables).toBeDefined();
});
```

### Integration Tests

```typescript
import { parseAgentOutput } from './lib/agent-output-parser';

test('parser handles legacy output', () => {
  const legacyOutput = `
    Confidence: 0.85
    Created: src/file.ts
  `;

  const result = parseAgentOutput(legacyOutput);
  expect(result.success).toBe(true);
  expect(result.output?.confidence).toBe(0.85);
});

test('parser handles JSON output', () => {
  const jsonOutput = JSON.stringify({
    output_type: 'loop3',
    success: true,
    confidence: 0.85,
    // ... rest of output
  });

  const result = parseAgentOutput(jsonOutput);
  expect(result.success).toBe(true);
  expect(result.confidence).toBeGreaterThan(0.9);
});
```

## Common Migration Issues

### Issue 1: Confidence Score Format

**Problem:** Legacy output uses percentage (0-100)
**Solution:** Parser auto-converts to 0.0-1.0 format

```typescript
// Legacy: "Confidence: 85%"
// Parsed: confidence: 0.85
```

### Issue 2: Missing Output Type

**Problem:** Legacy output doesn't specify output_type
**Solution:** Parser infers from keywords

```typescript
// Legacy text with "deliverables" → detected as loop3
// Legacy text with "approved" → detected as loop2
// Legacy text with "PROCEED" → detected as product_owner
```

### Issue 3: Nested Error Context

**Problem:** Text format can't represent nested objects
**Solution:** Use JSON format for complex error context

```typescript
{
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "Input validation failed",
      "context": {
        "field": "email",
        "constraint": "format",
        "value": "invalid-email"
      }
    }
  ]
}
```

### Issue 4: Large Deliverable Arrays

**Problem:** Text format hard to parse with many deliverables
**Solution:** Use JSON array format

```typescript
{
  "deliverables": [
    { "path": "file1.ts", "type": "implementation", "status": "created" },
    { "path": "file2.ts", "type": "test", "status": "created" },
    // ... 100+ files
  ]
}
```

## Rollout Timeline

### Week 1-2: Validation Phase

- Deploy validation library
- Add validation to orchestrator
- Monitor validation failures
- Fix critical parsing issues

### Week 3-4: Hybrid Phase

- Update high-traffic agents to output JSON
- Keep legacy output for monitoring
- Measure adoption rate
- Fix edge cases in parser

### Week 5-6: JSON-Only Phase

- Switch remaining agents to JSON
- Remove legacy output generation
- Keep legacy parser for old logs
- Monitor for issues

### Week 7+: Cleanup

- Remove hybrid output code
- Deprecate legacy parser (keep for historical data)
- Update all documentation
- Archive migration artifacts

## Monitoring

### Metrics to Track

1. **Validation success rate**: % of outputs that pass validation
2. **Parser confidence**: Average confidence score for legacy parsing
3. **Format distribution**: JSON vs. legacy output ratio
4. **Validation errors**: Common error types and frequencies
5. **Performance**: Validation time and memory usage

### Alerts

- Validation success rate drops below 95%
- Parse confidence drops below 0.7
- Validation errors spike above baseline
- Performance degrades beyond thresholds

## Support

For migration questions:

1. Check schema documentation: `docs/AGENT_OUTPUT_SCHEMA.md`
2. Review type definitions: `src/types/agent-output.ts`
3. Examine test examples: `tests/agent-output-validator.test.ts`
4. Run validation tests: `npm test agent-output-validator`

## Appendix: Code Examples

### Example 1: Complete Agent Migration

**Before (Legacy Text Output):**
```typescript
function executeAgent() {
  // ... agent logic

  console.log('Implementation complete');
  console.log(`Confidence: ${confidence}`);
  console.log('Deliverables:');
  files.forEach(file => console.log(`- created: ${file}`));
}
```

**After (JSON Output with Validation):**
```typescript
import { validateAgentOutput } from './lib/agent-output-validator';
import type { Loop3Output } from './types/agent-output';

function executeAgent(): Loop3Output {
  // ... agent logic

  const output: Loop3Output = {
    output_type: 'loop3',
    success: true,
    confidence: 0.85,
    iteration: 1,
    deliverables: files.map(file => ({
      path: file,
      type: 'implementation',
      status: 'created',
    })),
    errors: [],
    metadata: {
      agent_type: 'backend-developer',
      execution_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    },
  };

  // Validate before returning
  const validation = validateAgentOutput(output);
  if (!validation.valid) {
    throw new Error(`Invalid output: ${JSON.stringify(validation.errors)}`);
  }

  // Output JSON
  console.log(JSON.stringify(output));

  return output;
}
```

### Example 2: Orchestrator Update

**Before:**
```typescript
const stdout = await spawnAgent();
const confidenceMatch = stdout.match(/Confidence: ([0-9.]+)/);
const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
```

**After:**
```typescript
import { parseAgentOutput, validateAgentOutput } from './lib/agent-output-validator';

const stdout = await spawnAgent();

// Try JSON first, fallback to legacy parser
let output;
try {
  const parsed = JSON.parse(stdout);
  const validation = validateAgentOutput(parsed);
  if (validation.valid) {
    output = parsed;
  } else {
    console.warn('JSON validation failed, trying legacy parser');
    const result = parseAgentOutput(stdout);
    output = result.output;
  }
} catch {
  // Not JSON, use legacy parser
  const result = parseAgentOutput(stdout);
  output = result.output;
}

const confidence = output?.confidence || 0.5;
```
