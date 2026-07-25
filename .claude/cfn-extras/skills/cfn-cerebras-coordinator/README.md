# TDD Conversation Coordinator

Iterative Test-Driven Development with Cerebras LLM and conversation memory for error recovery.

## Overview

This coordinator implements a complete TDD workflow (Red-Green-Refactor) with:
- **Conversation Memory**: Full history tracked across iterations for context-aware fixes
- **Context Gathering**: CodeSearch pattern queries + explicit context files
- **Iterative Refinement**: Failed tests trigger fix loops with error context
- **Success Logging**: Successful patterns indexed to CodeSearch for learning

## Workflow Phases

### Phase 1: Context Gathering
- Query CodeSearch for similar patterns in codebase
- Load explicit context files (types, utilities, related code)
- Store context in conversation metadata

### Phase 2: RED - Generate Tests
- Cerebras generates comprehensive failing tests
- Uses Given/When/Then structure
- Covers happy path and edge cases
- Framework-appropriate (Jest, pytest, Go testing, etc.)

### Phase 3: RED - Verify Failure
- Run tests to ensure they fail (no implementation exists)
- Validates Red phase before proceeding

### Phase 4: GREEN - Generate Implementation
- Cerebras generates minimal implementation
- Guided by test requirements
- Follows patterns from context

### Phase 5: GREEN - Verify Pass
- Run tests to check if implementation works
- If pass: success, log to CodeSearch
- If fail: enter fix loop

### Phase 6: FIX - Iterative Refinement
- Send full error output + conversation history to Cerebras
- Cerebras analyzes previous attempts and errors
- Generates fixed implementation
- Repeat until tests pass or max iterations reached

### Phase 7: Success Logging
- Index successful pattern to CodeSearch
- Save full conversation JSON for learning
- Store in `conversations/` directory

## Usage

### Basic Example

```bash
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id tdd-001 \
  --feature "Email validation function" \
  --file ./src/validators/email.ts \
  --test-command "npm test email.test.ts" \
  --max-iterations 5
```

### With Context Files

```bash
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id tdd-002 \
  --feature "User authentication with JWT" \
  --file ./src/auth/jwt-validator.ts \
  --test-command "npm test jwt-validator.test.ts" \
  --context "./src/auth/types.ts,./src/utils/crypto.ts,./src/config/jwt.ts" \
  --max-iterations 3 \
  --verbose
```

### Python Example

```bash
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id tdd-003 \
  --feature "Data sanitization for SQL injection prevention" \
  --file ./src/sanitizers/sql.py \
  --test-command "pytest test_sql.py -v" \
  --context "./src/types.py,./src/database/connection.py" \
  --max-iterations 5
```

### Go Example

```bash
./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id tdd-004 \
  --feature "Rate limiter with token bucket algorithm" \
  --file ./pkg/limiter/rate_limiter.go \
  --test-command "go test -v ./pkg/limiter/..." \
  --context "./pkg/limiter/types.go,./pkg/config/limits.go" \
  --max-iterations 5
```

## Arguments

### Required

- `--agent-id ID` - Unique agent identifier for tracking
- `--feature DESCRIPTION` - Clear description of feature to implement
- `--file PATH` - Target implementation file path
- `--test-command CMD` - Shell command to run tests

### Optional

- `--context FILES` - Comma-separated list of context file paths
- `--max-iterations N` - Maximum fix iterations (default: 5)
- `--verbose` - Enable detailed logging
- `--help` - Show usage information

## Environment Variables

### Required

- `CEREBRAS_API_KEY` - API key for Cerebras Cloud SDK access
  - **Auto-loaded by SessionStart hook**: The `.claude/hooks/cfn-load-cerebras-env.sh` hook automatically checks for this variable at session start
  - Can be set via: `export CEREBRAS_API_KEY=your_key` or in project root `.env` file
  - Hook will warn if not found and provide setup instructions

### Optional

- `CEREBRAS_MODEL` - Model name (default: `zai-glm-4.6`)
  - Recommended: `zai-glm-4.6` for fast code generation
  - Alternative: `llama3.1-70b` for complex reasoning
- `MAX_TDD_ITERATIONS` - Default max iterations (default: 5)
- `CODESEARCH_INDEX_PATH` - CodeSearch index location (default: `./.claude/skills/cfn-codesearch`)

### SessionStart Hook Integration

The SessionStart hook (`.claude/hooks/cfn-load-cerebras-env.sh`) runs automatically when you start a Claude Code session:

1. **Checks** if `CEREBRAS_API_KEY` is already set in your shell environment
2. **If not found**, attempts to load from `.env` file in project root
3. **Outputs** confirmation message: `"Cerebras API configured: model=zai-glm-4.6, key=22f73578***"`
4. **Or warns** if API key is missing with setup instructions

**To set up your API key:**

```bash
# Option 1: Export in shell (temporary, session-only)
export CEREBRAS_API_KEY=your_api_key_here

# Option 2: Add to project .env file (persistent)
echo "CEREBRAS_API_KEY=your_api_key_here" >> .env
echo "CEREBRAS_MODEL=zai-glm-4.6" >> .env

# Option 3: Add to shell profile (global, all sessions)
echo 'export CEREBRAS_API_KEY=your_api_key_here' >> ~/.bashrc
source ~/.bashrc
```

## Conversation Memory Format

Each TDD session creates a JSON file with full conversation history:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a TDD expert...",
      "timestamp": "2025-12-10T10:30:00Z"
    },
    {
      "role": "user",
      "content": "# TDD Red Phase: Write Failing Tests...",
      "timestamp": "2025-12-10T10:30:05Z"
    },
    {
      "role": "assistant",
      "content": "describe('EmailValidator', () => { ... })",
      "timestamp": "2025-12-10T10:30:12Z"
    }
  ],
  "metadata": {
    "agent_id": "tdd-001",
    "feature": "Email validation function",
    "file_path": "./src/validators/email.ts",
    "test_file": "./src/validators/email.test.ts",
    "started_at": "2025-12-10T10:30:00Z",
    "completed_at": "2025-12-10T10:35:42Z",
    "iterations": 2,
    "phase": "success",
    "context_files_count": 1,
    "patterns_found": 3
  }
}
```

## Test File Path Detection

The coordinator automatically determines test file paths based on language:

| Language | Implementation | Test File |
|----------|---------------|-----------|
| TypeScript | `src/auth.ts` | `src/auth.test.ts` |
| JavaScript | `src/utils.js` | `src/utils.test.js` |
| Python | `src/validator.py` | `src/test_validator.py` |
| Go | `pkg/handler.go` | `pkg/handler_test.go` |
| Other | `path/file.ext` | `path/file.test.ext` |

## Integration with CodeSearch

### Query Phase (Phase 1)
```bash
# Queries CodeSearch for similar patterns
./.claude/skills/cfn-codesearch/query-local.sh \
  --pattern "Email validation function" \
  --limit 3
```

### Success Phase (Phase 7)
```bash
# Indexes successful implementation
./.claude/skills/cfn-codesearch/index-code.sh \
  --path ./src/validators/email.ts \
  --source tdd-cerebras \
  --success true
```

## Error Recovery

The conversation memory enables sophisticated error recovery:

### Iteration 1 Failure
```
Tests failed:
- Expected valid email to return true
- Got false instead
```

### Cerebras Response (with full context)
- Reviews original requirements
- Analyzes previous implementation attempt
- Identifies regex pattern issue
- Generates fix addressing specific failure

### Iteration 2 Failure
```
Tests failed:
- Handling of edge case emails (plus signs)
```

### Cerebras Response (with even more context)
- Reviews both previous attempts
- Sees pattern of regex issues
- Generates more robust regex
- Tests pass on iteration 3

## Output Files

### During Execution
- `/tmp/cerebras-tdd-{agent-id}-{timestamp}.json` - Active conversation
- `{implementation-file}` - Generated implementation
- `{test-file}` - Generated tests

### After Success
- `./.claude/skills/cfn-cerebras-coordinator/conversations/{date}-{agent-id}.json` - Saved conversation
- CodeSearch index updated with successful pattern

## Best Practices

### 1. Provide Rich Context
```bash
# Good - includes related types and utilities
--context "./src/types.ts,./src/utils/validation.ts"

# Less helpful - no context
# (Cerebras may generate code incompatible with existing patterns)
```

### 2. Use Descriptive Features
```bash
# Good - specific and testable
--feature "JWT token validator that checks signature, expiration, and issuer"

# Less helpful - too vague
--feature "JWT stuff"
```

### 3. Set Appropriate Iterations
```bash
# Simple function
--max-iterations 3

# Complex algorithm
--max-iterations 5

# Critical security code
--max-iterations 7
```

### 4. Use Verbose Mode for Debugging
```bash
# Enable verbose logging
--verbose

# Check conversation file during execution
cat /tmp/cerebras-tdd-*.json | jq '.messages[-1]'
```

### 5. Learn from Conversations
```bash
# Review successful patterns
find ./.claude/skills/cfn-cerebras-coordinator/conversations/ \
  -name "*.json" \
  -exec jq '.metadata | {feature, iterations, completed_at}' {} \;

# Extract lessons
jq '.messages[] | select(.role == "assistant") | .content' \
  conversations/20251210-tdd-001.json
```

## Troubleshooting

### Tests Don't Fail in Red Phase
**Symptom**: Red phase validation fails because tests pass unexpectedly

**Causes**:
- Implementation already exists at target path
- Test file path detection incorrect
- Test command not isolated

**Solutions**:
```bash
# Remove existing implementation
rm ./src/validators/email.ts

# Check test file path
--verbose  # Shows detected test file path

# Isolate test command
--test-command "npm test -- email.test.ts --testPathPattern=email"
```

### API Errors
**Symptom**: `API returned HTTP 401` or similar

**Causes**:
- Missing or invalid `ZAI_API_KEY`
- Incorrect `ZAI_BASE_URL`
- Network issues

**Solutions**:
```bash
# Verify API key
echo $ZAI_API_KEY

# Test API directly
curl -H "Authorization: Bearer $ZAI_API_KEY" \
  ${ZAI_BASE_URL}/models

# Check network
curl -I https://api.zai.ai
```

### Max Iterations Reached
**Symptom**: Script exits after N iterations without passing tests

**Causes**:
- Feature too complex for current context
- Test command incorrect
- Implementation fundamentally flawed

**Solutions**:
```bash
# Review conversation for patterns
cat /tmp/cerebras-tdd-*.json | jq '.messages[] | select(.role == "user") | .content' | tail -20

# Add more context files
--context "./src/types.ts,./src/utils/*.ts,./docs/patterns.md"

# Simplify feature scope
# Instead of: "Complete authentication system"
# Try: "JWT signature validation only"

# Increase iterations cautiously
--max-iterations 10  # May indicate deeper issues
```

### CodeSearch Integration Issues
**Symptom**: Context gathering or success logging fails

**Causes**:
- CodeSearch index not initialized
- Incorrect `CODESEARCH_INDEX_PATH`
- Permission issues

**Solutions**:
```bash
# Check CodeSearch installation
ls -la ./.claude/skills/cfn-codesearch/

# Initialize index if needed
./.claude/skills/cfn-codesearch/initialize-index.sh

# Set custom path
export CODESEARCH_INDEX_PATH="/path/to/codesearch"
```

## Testing

Run the test suite:

```bash
./.claude/skills/cfn-cerebras-coordinator/test-tdd-coordinator.sh
```

Tests validate:
- Argument parsing and validation
- Conversation file structure
- Test file path generation logic
- Error handling

## Integration with CFN Agents

### Spawn from Agent

```javascript
Task("backend-dev", `
  Use TDD coordinator to implement feature:

  ./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \\
    --agent-id tdd-${Date.now()} \\
    --feature "Rate limiter with token bucket" \\
    --file ./src/middleware/rate-limiter.ts \\
    --test-command "npm test rate-limiter.test.ts" \\
    --context "./src/types.ts,./src/config/rate-limits.ts" \\
    --max-iterations 5 \\
    --verbose

  After completion:
  1. Review generated tests and implementation
  2. Run full test suite
  3. Report confidence and next steps
`)
```

### CLI Loop Integration

```bash
# From CFN Loop CLI coordinator
AGENT_ID="tdd-backend-$(date +%s)"

./.claude/skills/cfn-cerebras-coordinator/tdd-conversation-coordinator.sh \
  --agent-id "$AGENT_ID" \
  --feature "$FEATURE_DESCRIPTION" \
  --file "$TARGET_FILE" \
  --test-command "$TEST_CMD" \
  --context "$CONTEXT_FILES" \
  --max-iterations "${MAX_ITERATIONS:-5}"

# Check exit code
if [[ $? -eq 0 ]]; then
  echo "TDD cycle completed successfully"
  # Proceed with Loop 3 validation
else
  echo "TDD cycle failed after max iterations"
  # Trigger iteration or escalation
fi
```

## Performance Characteristics

### Typical Execution Times

| Complexity | Iterations | Duration | Cost Estimate |
|------------|-----------|----------|---------------|
| Simple validator | 1-2 | 30-60s | ~$0.02-0.05 |
| Medium algorithm | 2-3 | 60-120s | ~$0.05-0.10 |
| Complex feature | 3-5 | 120-300s | ~$0.10-0.25 |

### Token Usage

- Context gathering: 500-2000 tokens
- Test generation: 1000-3000 tokens
- Implementation: 1000-4000 tokens
- Fix iteration: 2000-5000 tokens (includes history)

### Cost Optimization

```bash
# Reduce context size
--context "./src/types.ts"  # Only essential files

# Lower max iterations
--max-iterations 3

# Use cheaper model if available
export ZAI_MODEL="glm-4.6"  # vs more expensive alternatives
```

## Future Enhancements

### Planned Features
- [ ] Parallel test generation (multiple test suites)
- [ ] Incremental test addition (add tests to existing suite)
- [ ] Refactor phase after Green (Red-Green-Refactor complete)
- [ ] Performance benchmarking integration
- [ ] Security vulnerability scanning
- [ ] Code coverage analysis and gap filling

### Experimental Ideas
- Adaptive iteration limits based on complexity
- Multi-agent collaboration (separate test writer and implementer)
- Learning rate optimization (adjust based on past success)
- Automated context file discovery via import analysis

## References

- [Test-Driven Development](https://en.wikipedia.org/wiki/Test-driven_development)
- [Given-When-Then](https://martinfowler.com/bliki/GivenWhenThen.html)
- [CodeSearch Semantic Search](..//cfn-codesearch/README.md)
- [CFN Agent Spawning](../cfn-agent-spawning/SKILL.md)
- [Project Tests Guide](../../../tests/CLAUDE.md)

## License

Part of Claude Flow Novice (CFN) framework. See project LICENSE.
