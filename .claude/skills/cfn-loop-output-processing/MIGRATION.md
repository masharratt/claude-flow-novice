# Migration Guide: Bash to TypeScript Output Processing

This guide helps migrate from the old bash-based output processing scripts to the new unified TypeScript module.

## Overview

**Old Setup:**
- 3 separate bash skills with duplicate logic
- No type safety
- Limited testing
- Difficult to maintain

**New Setup:**
- 1 unified TypeScript module
- Full type safety
- 90%+ test coverage
- Easy to extend

## Files Being Replaced

| Old Bash Script | New TypeScript | Status |
|-----------------|----------------|--------|
| `cfn-loop2-output-processing/parse-feedback.sh` | `cfn-loop-output-processing/output-processor.ts` | Consolidated |
| `cfn-loop3-output-processing/parse-confidence.sh` | `cfn-loop-output-processing/output-processor.ts` | Consolidated |
| `cfn-loop3-output-processing/calculate-confidence.sh` | `cfn-loop-output-processing/output-processor.ts` | Consolidated |

## Step-by-Step Migration

### Step 1: Install and Build

```bash
cd .claude/skills/cfn-loop-output-processing

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests to verify
npm test
```

### Step 2: Update Orchestrator Integration

#### Old Loop 3 Integration (Bash)

```bash
# Old way
CONFIDENCE=$(./.claude/skills/cfn-loop3-output-processing/parse-confidence.sh "$AGENT_OUTPUT")
DELIVERABLE_CHECK=$(./.claude/skills/cfn-loop3-output-processing/verify-deliverables.sh \
  --before "$BEFORE_GIT" \
  --after "$AFTER_GIT")
FILES_CHANGED=$(echo "$DELIVERABLE_CHECK" | jq -r '.files_changed')
```

#### New Loop 3 Integration (TypeScript)

```bash
# New way
RESULT=$(npx ts-node ./.claude/skills/cfn-loop-output-processing/src/cli/process-loop3.ts \
  --agent-id "$AGENT_ID" \
  --output "$AGENT_OUTPUT" \
  --iteration "$ITERATION")

CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence')
FILES_CHANGED=$(echo "$RESULT" | jq -r '.filesChanged')
```

#### Old Loop 2 Integration (Bash)

```bash
# Old way
CONFIDENCE=$(./parse-feedback.sh --extract-confidence "$VALIDATOR_OUTPUT")
CRITICAL=$(./parse-feedback.sh --extract-critical "$VALIDATOR_OUTPUT" | jq 'length')
WARNING=$(./parse-feedback.sh --extract-warnings "$VALIDATOR_OUTPUT" | jq 'length')
```

#### New Loop 2 Integration (TypeScript)

```bash
# New way
RESULT=$(npx ts-node ./.claude/skills/cfn-loop-output-processing/src/cli/process-loop2.ts \
  --validator-id "$VALIDATOR_ID" \
  --output "$VALIDATOR_OUTPUT" \
  --iteration "$ITERATION")

SCORE=$(echo "$RESULT" | jq -r '.score')
CRITICAL=$(echo "$RESULT" | jq -r '.criticalCount')
WARNING=$(echo "$RESULT" | jq -r '.warningCount')
```

### Step 3: Update Consensus Calculation

#### Old Way (Shell Loop)

```bash
# Old way - manually loop through results
for RESULT in "${VALIDATOR_RESULTS[@]}"; do
  SCORE=$(echo "$RESULT" | jq -r '.score')
  # Manual averaging logic
done
```

#### New Way (Unified CLI)

```bash
# New way - unified consensus calculation
CONSENSUS=$(npx ts-node ./.claude/skills/cfn-loop-output-processing/src/cli/process-loop2.ts \
  --consensus \
  --results-file ./validator-results.json \
  --threshold "$THRESHOLD")

AVERAGE_SCORE=$(echo "$CONSENSUS" | jq -r '.averageScore')
PASSED=$(echo "$CONSENSUS" | jq -r '.passed')
```

### Step 4: Test Migration

```bash
# Run the new tests
npm test

# Verify CLI tools work
npx ts-node src/cli/process-loop3.ts --help
npx ts-node src/cli/process-loop2.ts --help

# Test with real output
echo "Test output with confidence: 0.85" > test-output.txt
npx ts-node src/cli/process-loop3.ts \
  --agent-id "test-1" \
  --output-file test-output.txt
```

## Programmatic Migration

If you're using the output processing functions directly in TypeScript code:

### Old Way (Bash Shell)

```bash
# Had to shell out to bash scripts
RESULT=$(./parse-confidence.sh "$OUTPUT")
```

### New Way (TypeScript Import)

```typescript
import { parseConfidence, parseLoop3Output } from '@cfn/loop-output-processing';

// Direct function calls, no shell overhead
const { score, source } = parseConfidence(output);
const result = parseLoop3Output(output, agentId, iteration);
```

## Configuration Changes

### Environment Variables

**Old:** No structured configuration
**New:** Via function parameters

```typescript
// Configure parsing behavior
const config = {
  strictMode: true,
  fallbackConfidence: 0.70,
  minimumDeliverables: 1,
  confidenceRange: [0.0, 1.0],
};

const { score } = parseConfidence(output, config);
```

## Testing Your Migration

### Validation Checklist

- [ ] All tests pass: `npm test`
- [ ] Type checking passes: `npm run type-check`
- [ ] Linting passes: `npm run lint`
- [ ] CLI tools respond to `--help`
- [ ] CLI tools return valid JSON
- [ ] Sample outputs parse correctly
- [ ] Confidence scores match old calculations
- [ ] Feedback parsing matches old behavior
- [ ] Consensus results are equivalent

### Testing Loop 3 Migration

```bash
# Test confidence extraction with various formats
npx ts-node src/cli/process-loop3.ts \
  --agent-id "test" \
  --output "Confidence: 0.85"

npx ts-node src/cli/process-loop3.ts \
  --agent-id "test" \
  --output "I'm 92% confident"

npx ts-node src/cli/process-loop3.ts \
  --agent-id "test" \
  --output "Implementation complete" \
  --files-changed 5
```

### Testing Loop 2 Migration

```bash
# Test validator output parsing
npx ts-node src/cli/process-loop2.ts \
  --validator-id "reviewer-1" \
  --output "## Validation Confidence: 0.88

### CRITICAL Issues
- None

### WARNING Issues
- Performance"
```

### Testing Consensus

```bash
# Create sample results file
cat > validator-results.json <<'EOF'
[
  {
    "validatorId": "v1",
    "score": 0.9,
    "scoreSource": "explicit",
    "issues": [],
    "criticalCount": 0,
    "warningCount": 0,
    "suggestionCount": 0,
    "recommendations": [],
    "output": "",
    "iteration": 1,
    "timestamp": "2025-11-19T00:00:00Z"
  },
  {
    "validatorId": "v2",
    "score": 0.85,
    "scoreSource": "explicit",
    "issues": [],
    "criticalCount": 0,
    "warningCount": 1,
    "suggestionCount": 0,
    "recommendations": [],
    "output": "",
    "iteration": 1,
    "timestamp": "2025-11-19T00:00:00Z"
  }
]
EOF

# Calculate consensus
npx ts-node src/cli/process-loop2.ts \
  --consensus \
  --results-file validator-results.json \
  --threshold 0.80
```

## Deprecation Timeline

### Phase 1: Now (Parallel Operation)
- New TypeScript module available
- Old bash scripts still work
- Both can run simultaneously
- Status: **STABLE**

### Phase 2: 30 Days
- Orchestrator recommended to migrate
- Bash scripts marked **DEPRECATED**
- Tests verify both outputs are equivalent
- Status: **TRANSITION**

### Phase 3: 60 Days
- All orchestrators migrated
- Bash scripts no longer recommended
- Only TypeScript module used
- Status: **LEGACY**

### Phase 4: 90 Days
- Bash scripts removed
- TypeScript module required
- Status: **FINAL**

## Troubleshooting

### "Module not found" Error

```bash
# Make sure to build first
npm run build

# Or use ts-node directly
npx ts-node src/cli/process-loop3.ts ...
```

### JSON Parse Errors

Ensure you're piping valid JSON:

```bash
# Check output structure
RESULT=$(npx ts-node src/cli/process-loop3.ts --agent-id "test" --output "test")
echo "$RESULT" | jq '.'  # Verify it's valid JSON
```

### Type Errors in IDE

Update your IDE TypeScript version:

```bash
npm install -g typescript@latest
```

### Confidence Score Mismatch

Compare outputs from both systems:

```bash
# Old way
OLD=$(./parse-confidence.sh "Confidence: 0.85")

# New way
NEW=$(npx ts-node src/cli/process-loop3.ts --agent-id "test" --output "Confidence: 0.85" | jq -r '.confidence')

# Compare
echo "Old: $OLD, New: $NEW"
```

## Rollback Plan

If you need to rollback:

1. Keep old bash scripts in version control
2. Update orchestrator to call bash scripts again
3. Remove TypeScript calls
4. Re-run tests with bash scripts
5. No data loss (both produce same JSON format)

## Getting Help

- Check `SKILL.md` for API documentation
- Run `npm test` to verify your environment
- Review CLI `--help` output
- Check test cases for usage examples

## Completion Checklist

- [ ] TypeScript module installed and built
- [ ] All tests passing (90%+ coverage)
- [ ] CLI tools tested with real outputs
- [ ] Orchestrator updated to use new module
- [ ] Confidence scores verified
- [ ] Feedback parsing verified
- [ ] Consensus calculation verified
- [ ] Old bash scripts marked deprecated
- [ ] Team notified of migration
- [ ] Documentation updated
