# TDD Conversation Coordinator - Quick Start

Get started with iterative TDD in under 5 minutes.

## Prerequisites

```bash
# 1. Check dependencies
which curl jq || sudo apt install curl jq

# 2. Set API key
export ZAI_API_KEY="your-cerebras-api-key"

# 3. Verify coordinator exists
ls -lh ./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh
```

## Your First TDD Cycle (2 minutes)

### Example 1: Simple Validator

```bash
# Navigate to project root
cd /path/to/project

# Run TDD coordinator
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id my-first-tdd \
  --feature "Email validator that accepts RFC-compliant addresses" \
  --file ./src/validators/email-validator.ts \
  --test-command "npm test email-validator.test.ts" \
  --max-iterations 3 \
  --verbose
```

**What happens**:
1. Generates comprehensive tests (RED phase)
2. Verifies tests fail (no implementation yet)
3. Generates implementation (GREEN phase)
4. Runs tests - if fail, enters fix loop
5. Saves conversation to `conversations/` directory
6. Indexes pattern to CodeSearch

**Expected output**:
```
================================================
   TDD Conversation Coordinator
================================================
Feature:        Email validator that accepts RFC-compliant addresses
Target File:    ./src/validators/email-validator.ts
Agent ID:       my-first-tdd
Max Iterations: 3
================================================

[2025-12-10 10:30:05] Phase 1: Gathering context
[2025-12-10 10:30:07] Phase 2 (RED): Generating failing tests
[2025-12-10 10:30:15] Tests written to: ./src/validators/email-validator.test.ts
[2025-12-10 10:30:16] Phase 3 (RED): Verifying tests fail as expected
[2025-12-10 10:30:17] Tests failed as expected - Red Phase validated
[2025-12-10 10:30:18] Phase 4 (GREEN): Generating implementation
[2025-12-10 10:30:28] Implementation written to: ./src/validators/email-validator.ts

--- Iteration 1/3 ---
[2025-12-10 10:30:30] Phase 5 (GREEN): Running tests to verify implementation
[2025-12-10 10:30:32] All tests pass - Green Phase complete

================================================
   SUCCESS! All tests pass.
================================================

Summary:
  Feature:        Email validator that accepts RFC-compliant addresses
  Implementation: ./src/validators/email-validator.ts
  Tests:          ./src/validators/email-validator.test.ts
  Iterations:     1
  Conversation:   Saved for learning
```

## Check Your Results

```bash
# View generated test file
cat ./src/validators/email-validator.test.ts

# View generated implementation
cat ./src/validators/email-validator.ts

# Run tests manually
npm test email-validator.test.ts

# Review conversation history
cat ./.claude/skills/cfn-cerebras-coordinator/conversations/*.json | jq .
```

## Common Use Cases

### Use Case 1: Validator Function
```bash
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id validator-001 \
  --feature "URL validator with protocol, domain, and path checking" \
  --file ./src/validators/url.ts \
  --test-command "npm test url.test.ts" \
  --max-iterations 3
```

### Use Case 2: Data Transformer
```bash
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id transformer-001 \
  --feature "JSON to CSV transformer with nested object flattening" \
  --file ./src/transformers/json-to-csv.ts \
  --test-command "npm test json-to-csv.test.ts" \
  --context "./src/types.ts" \
  --max-iterations 5
```

### Use Case 3: API Handler
```bash
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id api-001 \
  --feature "REST API handler for user registration with validation" \
  --file ./src/handlers/register.ts \
  --test-command "npm test register.test.ts" \
  --context "./src/types.ts,./src/middleware/validation.ts" \
  --max-iterations 5 \
  --verbose
```

## Interactive Mode

Run example wizard for guided setup:

```bash
./.claude/skills/cfn-cerebras-coordinator/example-usage.sh
```

**Menu options**:
1. Simple TypeScript function
2. Python data validator
3. Go HTTP middleware
4. Complex authentication flow
5. Custom example (interactive prompts)

## Understanding Iterations

### Iteration 1: Initial Implementation
- Cerebras generates code from feature description
- Usually handles happy path
- May miss edge cases

### Iteration 2: Error Recovery
- Tests fail with specific error
- Cerebras reviews full conversation history
- Analyzes what went wrong
- Generates fix addressing specific failure

### Iteration 3+: Refinement
- Handles remaining edge cases
- Fixes subtle bugs
- Improves error handling
- Each iteration has full context of previous attempts

## Troubleshooting

### Problem: Tests don't fail in Red phase
**Solution**: Remove existing implementation file first
```bash
rm ./src/validators/email-validator.ts
# Then run coordinator
```

### Problem: API error (HTTP 401)
**Solution**: Check API key
```bash
echo $ZAI_API_KEY  # Should show your key
export ZAI_API_KEY="your-key-here"
```

### Problem: Tests still failing after max iterations
**Solution 1**: Increase iterations
```bash
--max-iterations 7
```

**Solution 2**: Add more context
```bash
--context "./src/types.ts,./src/utils/*.ts"
```

**Solution 3**: Simplify feature scope
```bash
# Instead of: "Complete authentication system"
# Try: "Password hash comparison function"
```

### Problem: Test command not found
**Solution**: Install test framework
```bash
# For npm/jest
npm install --save-dev jest @types/jest

# For Python/pytest
pip install pytest

# For Go
# Built-in, no install needed
```

## Next Steps

### 1. Review Documentation
```bash
# Complete usage guide
cat ./.claude/skills/cfn-cerebras-coordinator/README.md

# Coordinator comparison
cat ./.claude/skills/cfn-cerebras-coordinator/TDD_COORDINATOR_OVERVIEW.md
```

### 2. Run Test Suite
```bash
./.claude/skills/cfn-cerebras-coordinator/test-tdd-coordinator.sh
```

### 3. Learn from Conversations
```bash
# Find successful patterns
find ./.claude/skills/cfn-cerebras-coordinator/conversations/ \
  -name "*.json" \
  -exec jq '.metadata | {feature, iterations}' {} \;

# Review a specific conversation
jq . conversations/20251210-*.json
```

### 4. Integrate with CFN Agents
```javascript
// From an agent
Task("backend-dev", `
  Implement feature using TDD coordinator:

  ./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \\
    --agent-id backend-tdd-001 \\
    --feature "Rate limiter with token bucket algorithm" \\
    --file ./src/middleware/rate-limiter.ts \\
    --test-command "npm test rate-limiter.test.ts" \\
    --context "./src/types.ts" \\
    --max-iterations 5

  Report results and confidence.
`)
```

## Cost Estimation

| Complexity | Iterations | Duration | Cost |
|------------|-----------|----------|------|
| Simple validator | 1-2 | 30-60s | $0.02-0.05 |
| Medium algorithm | 2-3 | 60-120s | $0.05-0.10 |
| Complex feature | 3-5 | 120-300s | $0.10-0.25 |

**Cost factors**:
- Context file size
- Feature complexity
- Number of iterations
- Test suite size

## Best Practices

### 1. Write Clear Feature Descriptions
```bash
# Good - specific and testable
--feature "JWT validator that verifies signature, checks expiration, validates issuer"

# Less helpful - too vague
--feature "JWT stuff"
```

### 2. Provide Relevant Context
```bash
# Good - includes types and related utilities
--context "./src/types.ts,./src/utils/crypto.ts"

# Less helpful - too much unrelated code
--context "./src/**/*.ts"
```

### 3. Start with Lower Iterations
```bash
# Try 3 iterations first
--max-iterations 3

# Increase only if needed
--max-iterations 5
```

### 4. Use Verbose Mode for Learning
```bash
# See detailed logs
--verbose

# Understand what's happening at each phase
```

### 5. Save Successful Patterns
```bash
# Conversations automatically saved to:
./.claude/skills/cfn-cerebras-coordinator/conversations/

# Review and learn from them
```

## Getting Help

1. **Check README**: `cat README.md`
2. **Run tests**: `./test-tdd-coordinator.sh`
3. **Enable verbose**: `--verbose` flag
4. **Review conversations**: `cat conversations/*.json | jq .`
5. **Simplify feature**: Break into smaller pieces

## Summary

**You've learned**:
- How to run a TDD cycle with conversation memory
- How iterations and error recovery work
- Common use cases and examples
- Troubleshooting techniques
- Cost estimation

**Next actions**:
1. Try a simple feature first
2. Review generated code and tests
3. Experiment with context files
4. Monitor conversation logs
5. Integrate into your workflow

**Key command**:
```bash
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id YOUR_ID \
  --feature "YOUR_FEATURE" \
  --file YOUR_FILE \
  --test-command "YOUR_TEST_CMD" \
  --max-iterations 3
```

Happy TDD! 🧪
