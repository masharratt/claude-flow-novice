# Output Processing Examples

Complete examples showing how to use the consolidated TypeScript module.

## Loop 3 Examples (Implementers)

### Example 1: Extract Confidence from Agent Output

**Input:**
```
I've successfully implemented the authentication module with JWT support.
All unit tests are passing (24/24).
Confidence: 0.92

Created files:
- src/auth/jwt-handler.ts
- src/auth/token-manager.ts
- tests/auth.test.ts
- src/middleware/auth.ts
```

**Command:**
```bash
npx ts-node src/cli/process-loop3.ts \
  --agent-id "backend-dev-1" \
  --output "I've successfully implemented the authentication module with JWT support.
All unit tests are passing (24/24).
Confidence: 0.92

Created files:
- src/auth/jwt-handler.ts
- src/auth/token-manager.ts
- tests/auth.test.ts
- src/middleware/auth.ts" \
  --iteration 1
```

**Output:**
```json
{
  "agentId": "backend-dev-1",
  "confidence": 0.92,
  "confidenceSource": "explicit",
  "filesChanged": 4,
  "deliverables": [],
  "output": "I've successfully implemented...",
  "iteration": 1,
  "timestamp": "2025-11-19T10:30:00.000Z"
}
```

### Example 2: Calculate Fallback Confidence

**Input (no explicit confidence):**
```
Implemented database migration and schema updates.
- Created migration files
- Updated schema definitions
- All tests passing
```

**Command:**
```bash
npx ts-node src/cli/process-loop3.ts \
  --agent-id "backend-dev-2" \
  --output "Implemented database migration and schema updates..." \
  --files-changed 3
```

**Output:**
```json
{
  "agentId": "backend-dev-2",
  "confidence": 0.75,
  "confidenceSource": "calculated",
  "filesChanged": 3,
  "deliverables": [],
  "output": "Implemented database migration...",
  "iteration": 1,
  "timestamp": "2025-11-19T10:31:00.000Z"
}
```

### Example 3: Parse Test Results

**Input:**
```
Feature implementation complete.
Tests passed: 15
Tests failed: 0
Confidence: 0.88
```

**Command:**
```bash
npx ts-node src/cli/process-loop3.ts \
  --agent-id "backend-dev-3" \
  --output "Feature implementation complete.
Tests passed: 15
Tests failed: 0
Confidence: 0.88"
```

**Output:**
```json
{
  "agentId": "backend-dev-3",
  "confidence": 0.88,
  "confidenceSource": "explicit",
  "filesChanged": 0,
  "deliverables": [],
  "testsPassedCount": 15,
  "testsFailed": 0,
  "passRate": 1.0,
  "output": "Feature implementation complete...",
  "iteration": 1,
  "timestamp": "2025-11-19T10:32:00.000Z"
}
```

## Loop 2 Examples (Validators)

### Example 1: Parse Validator Feedback

**Input:**
```
## Validation Confidence: 0.88

### CRITICAL Issues
- None

### WARNING Issues
- Missing error handling in edge case
- Could optimize database queries

### SUGGESTION Items
- Add integration tests
- Improve code comments
- Consider caching strategy

Recommendations:
- Implement error boundary component
- Add API rate limiting
- Document the API contracts
```

**Command:**
```bash
npx ts-node src/cli/process-loop2.ts \
  --validator-id "reviewer-1" \
  --output "## Validation Confidence: 0.88

### CRITICAL Issues
- None

### WARNING Issues
- Missing error handling in edge case
- Could optimize database queries

### SUGGESTION Items
- Add integration tests
- Improve code comments
- Consider caching strategy

Recommendations:
- Implement error boundary component
- Add API rate limiting
- Document the API contracts" \
  --iteration 1
```

**Output:**
```json
{
  "validatorId": "reviewer-1",
  "score": 0.88,
  "scoreSource": "explicit",
  "issues": [
    {
      "severity": "WARNING",
      "text": "Missing error handling in edge case"
    },
    {
      "severity": "WARNING",
      "text": "Could optimize database queries"
    },
    {
      "severity": "SUGGESTION",
      "text": "Add integration tests"
    },
    {
      "severity": "SUGGESTION",
      "text": "Improve code comments"
    },
    {
      "severity": "SUGGESTION",
      "text": "Consider caching strategy"
    }
  ],
  "criticalCount": 0,
  "warningCount": 2,
  "suggestionCount": 3,
  "recommendations": [
    "Implement error boundary component",
    "Add API rate limiting",
    "Document the API contracts"
  ],
  "output": "## Validation Confidence: 0.88...",
  "iteration": 1,
  "timestamp": "2025-11-19T10:35:00.000Z"
}
```

### Example 2: Critical Issues Found

**Input:**
```
## Validation Confidence: 0.45

### CRITICAL Issues
- SQL injection vulnerability in user search
- Missing authentication check on admin endpoints
- Hardcoded API keys in source code

### WARNING Issues
- Performance issue: N+1 database query
- Missing input validation

### SUGGESTION Items
- Add logging
```

**Command:**
```bash
npx ts-node src/cli/process-loop2.ts \
  --validator-id "security-reviewer-1" \
  --output "## Validation Confidence: 0.45

### CRITICAL Issues
- SQL injection vulnerability in user search
- Missing authentication check on admin endpoints
- Hardcoded API keys in source code

### WARNING Issues
- Performance issue: N+1 database query
- Missing input validation

### SUGGESTION Items
- Add logging"
```

**Output:**
```json
{
  "validatorId": "security-reviewer-1",
  "score": 0.45,
  "scoreSource": "explicit",
  "issues": [
    {
      "severity": "CRITICAL",
      "text": "SQL injection vulnerability in user search"
    },
    {
      "severity": "CRITICAL",
      "text": "Missing authentication check on admin endpoints"
    },
    {
      "severity": "CRITICAL",
      "text": "Hardcoded API keys in source code"
    },
    {
      "severity": "WARNING",
      "text": "Performance issue: N+1 database query"
    },
    {
      "severity": "WARNING",
      "text": "Missing input validation"
    },
    {
      "severity": "SUGGESTION",
      "text": "Add logging"
    }
  ],
  "criticalCount": 3,
  "warningCount": 2,
  "suggestionCount": 1,
  "recommendations": [],
  "output": "## Validation Confidence: 0.45...",
  "iteration": 1,
  "timestamp": "2025-11-19T10:36:00.000Z"
}
```

## Consensus Examples

### Example 1: Calculate Consensus from Multiple Validators

**Setup - Create results file:**
```bash
cat > validator-results.json <<'EOF'
[
  {
    "validatorId": "reviewer-1",
    "score": 0.92,
    "scoreSource": "explicit",
    "issues": [],
    "criticalCount": 0,
    "warningCount": 0,
    "suggestionCount": 1,
    "recommendations": ["Add unit tests"],
    "output": "",
    "iteration": 1,
    "timestamp": "2025-11-19T10:35:00.000Z"
  },
  {
    "validatorId": "reviewer-2",
    "score": 0.88,
    "scoreSource": "explicit",
    "issues": [],
    "criticalCount": 0,
    "warningCount": 2,
    "suggestionCount": 0,
    "recommendations": [],
    "output": "",
    "iteration": 1,
    "timestamp": "2025-11-19T10:36:00.000Z"
  },
  {
    "validatorId": "tester-1",
    "score": 0.85,
    "scoreSource": "explicit",
    "issues": [],
    "criticalCount": 0,
    "warningCount": 1,
    "suggestionCount": 2,
    "recommendations": ["Increase test coverage"],
    "output": "",
    "iteration": 1,
    "timestamp": "2025-11-19T10:37:00.000Z"
  }
]
EOF
```

**Command:**
```bash
npx ts-node src/cli/process-loop2.ts \
  --consensus \
  --results-file ./validator-results.json \
  --threshold 0.80
```

**Output:**
```json
{
  "averageScore": 0.88,
  "threshold": 0.8,
  "passed": true,
  "validatorCount": 3,
  "scoredCount": 3,
  "minScore": 0.85,
  "maxScore": 0.92,
  "summary": "PASS: 88% consensus from 3 validators (2 warnings)",
  "details": {
    "criticalIssuesTotal": 0,
    "warningIssuesTotal": 3,
    "suggestionsTotal": 3
  }
}
```

### Example 2: Consensus with Critical Issues

**Input - Results with critical issues:**
```json
[
  {
    "validatorId": "security-1",
    "score": 0.3,
    "scoreSource": "explicit",
    "issues": [],
    "criticalCount": 2,
    "warningCount": 0,
    "suggestionCount": 0,
    "recommendations": [],
    "output": "",
    "iteration": 1,
    "timestamp": "2025-11-19T10:35:00.000Z"
  },
  {
    "validatorId": "quality-1",
    "score": 0.65,
    "scoreSource": "explicit",
    "issues": [],
    "criticalCount": 1,
    "warningCount": 2,
    "suggestionCount": 0,
    "recommendations": [],
    "output": "",
    "iteration": 1,
    "timestamp": "2025-11-19T10:36:00.000Z"
  }
]
```

**Command:**
```bash
npx ts-node src/cli/process-loop2.ts \
  --consensus \
  --results-file ./critical-results.json \
  --threshold 0.75
```

**Output:**
```json
{
  "averageScore": 0.475,
  "threshold": 0.75,
  "passed": false,
  "validatorCount": 2,
  "scoredCount": 2,
  "minScore": 0.3,
  "maxScore": 0.65,
  "summary": "FAIL: 47% consensus from 2 validators (3 critical, 2 warnings)",
  "details": {
    "criticalIssuesTotal": 3,
    "warningIssuesTotal": 2,
    "suggestionsTotal": 0
  }
}
```

## Programmatic Examples

### TypeScript Direct Usage

```typescript
import {
  parseConfidence,
  extractFeedback,
  parseLoop3Output,
  parseLoop2Output,
  calculateConsensus,
  Loop2Result,
  ConsensusResult,
} from '@cfn/loop-output-processing';

// Example 1: Extract confidence
const { score, source } = parseConfidence(agentOutput);
console.log(`Confidence: ${score} (source: ${source})`);

// Example 2: Parse Loop 3 output
const loop3Result = parseLoop3Output(
  agentOutput,
  'backend-dev-1',
  1,
  { before: beforeGit, after: afterGit }
);
console.log(`Files changed: ${loop3Result.filesChanged}`);
console.log(`Confidence: ${loop3Result.confidence}`);

// Example 3: Parse validator output
const validatorResult = parseLoop2Output(validatorOutput, 'reviewer-1');
console.log(`Critical issues: ${validatorResult.criticalCount}`);
console.log(`Score: ${validatorResult.score}`);

// Example 4: Calculate consensus
const results: Loop2Result[] = [validatorResult1, validatorResult2];
const consensus: ConsensusResult = calculateConsensus(results, 0.75);

if (consensus.passed) {
  console.log(`Consensus achieved: ${consensus.summary}`);
} else {
  console.log(`Consensus failed: ${consensus.summary}`);
}

// Example 5: Extract and categorize feedback
const feedback = extractFeedback(validatorOutput);
const criticalIssues = feedback.filter(f => f.severity === 'CRITICAL');
const warnings = feedback.filter(f => f.severity === 'WARNING');

console.log(`Found ${criticalIssues.length} critical issues`);
console.log(`Found ${warnings.length} warnings`);
```

### Bash Integration

```bash
#!/bin/bash
set -euo pipefail

AGENT_OUTPUT=$(cat agent-output.txt)
TASK_ID="task-123"

# Process Loop 3 output
RESULT=$(npx ts-node ./.claude/skills/cfn-loop-output-processing/src/cli/process-loop3.ts \
  --agent-id "coder-1" \
  --output "$AGENT_OUTPUT" \
  --iteration 1)

# Extract values
CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence')
FILES_CHANGED=$(echo "$RESULT" | jq -r '.filesChanged')

# Report to Redis
redis-cli LPUSH "swarm:${TASK_ID}:coder-1:confidence" "$CONFIDENCE"

# Check gate
if (( $(echo "$CONFIDENCE > 0.85" | bc -l) )); then
  echo "PASS: Confidence above threshold (${CONFIDENCE})"
else
  echo "FAIL: Confidence below threshold (${CONFIDENCE})"
fi
```

## Edge Cases

### Example 1: Missing Confidence

**Input:**
```
Implemented feature as requested. All tests pass.
```

**Processing:**
```typescript
const { score, source } = parseConfidence(output);
// score: 0.0, source: 'none'

// Fallback to file count
const fallback = calculateFallbackConfidence(5);
// fallback: 0.75
```

### Example 2: Percentage Format

**Input:**
```
I'm 92% confident this works correctly.
```

**Processing:**
```typescript
const { score, source } = parseConfidence(output);
// score: 0.92, source: 'explicit'
// (automatically converted from percentage)
```

### Example 3: Qualitative Confidence

**Input:**
```
Validation complete with high confidence.
```

**Processing:**
```typescript
const { score, source } = parseConfidence(output);
// score: 0.9, source: 'qualitative'
// (mapped from "high confidence")
```

### Example 4: Malformed Input

**Input:**
```
JSON parse failed: {"invalid: json}
```

**Processing:**
```typescript
const result = parseJson('{"invalid: json}');
// result: null (safe error handling)
```

## Performance Examples

### Benchmarks

```bash
# Parse confidence: <1ms
time npx ts-node src/cli/process-loop3.ts \
  --agent-id "test" \
  --output "Confidence: 0.85"

# Parse 50 lines of feedback: <2ms
time npx ts-node src/cli/process-loop2.ts \
  --validator-id "test" \
  --output "$LARGE_FEEDBACK"

# Calculate consensus from 10 validators: <5ms
time npx ts-node src/cli/process-loop2.ts \
  --consensus \
  --results-file ./10-validators.json

# Full test suite: ~2.3 seconds
time npm test
```

## Summary

The module handles:
- Simple explicit confidence values
- Percentage and qualitative formats
- Complex markdown feedback structures
- Multi-validator consensus calculations
- Edge cases and invalid input
- High performance processing
- Type-safe operations with full IDE support
