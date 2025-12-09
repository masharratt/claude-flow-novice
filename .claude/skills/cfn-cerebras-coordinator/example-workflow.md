# Example Agent Workflow with Cerebras Coordinator

This document demonstrates how agents can effectively use the Cerebras coordinator skill to offload code generation while maintaining architectural oversight.

## Complete Example: Creating a User Authentication API

### Step 1: Initial Assessment (Agent)
```bash
AGENT_ID="backend-developer-$(date +%s)"

# Task: Create user authentication API with registration and login
```

### Step 2: Pattern Discovery
```bash
# Query for successful authentication patterns
./.claude/skills/cfn-cerebras-coordinator/query-patterns.sh \
  --agent-id "$AGENT_ID" \
  --file-type "rs" \
  --pattern "authentication API JWT" \
  --limit 5

# Example output:
# 📊 Successful Code Generation Patterns
# Agent         | Type | Prompt Preview                                    | Confidence | Created
# --------------|------|--------------------------------------------------|------------|---------
# backend-dev   | rs   | Create JWT authentication middleware with...      | 0.95       | 2024-12-08
# backend-dev   | rs   | Implement user registration endpoint with...      | 0.92       | 2024-12-07
```

### Step 3: Generate User Model
```bash
./.claude/skills/cfn-cerebras-coordinator/coordinate-generation.sh \
  --agent-id "$AGENT_ID" \
  --file-path "src/models/user.rs" \
  --prompt "Create User struct with id, email, password_hash, created_at fields. Implement serialization/deserialization with Serde" \
  --test-command "cargo test user_model"
```

### Step 4: Generate Authentication Service
```bash
./.claude/skills/cfn-cerebras-coordinator/coordinate-generation.sh \
  --agent-id "$AGENT_ID" \
  --file-path "src/services/auth_service.rs" \
  --prompt "Create authentication service with password hashing using bcrypt, JWT token generation, and user validation methods" \
  --context-files "src/models/user.rs" \
  --test-command "cargo test auth_service"
```

### Step 5: Generate API Handler
```bash
./.claude/skills/cfn-cerebras-coordinator/coordinate-generation.sh \
  --agent-id "$AGENT_ID" \
  --file-path "src/handlers/auth_handler.rs" \
  --prompt "Create REST API handlers for user registration and login endpoints. Return JWT tokens on successful authentication. Include proper error handling for duplicate emails and invalid credentials." \
  --context-files "src/models/user.rs,src/services/auth_service.rs,src/lib.rs" \
  --test-command "cargo test auth_handler"
```

### Step 6: Generate Tests
```bash
./.claude/skills/cfn-cerebras-coordinator/coordinate-generation.sh \
  --agent-id "$AGENT_ID" \
  --file-path "tests/auth_tests.rs" \
  --prompt "Create comprehensive tests for authentication including registration, login, invalid credentials, and edge cases" \
  --context-files "src/handlers/auth_handler.rs,src/models/user.rs" \
  --test-command "cargo test auth_tests"
```

### Step 7: Integration and Review (Agent)
The agent now reviews the generated code to ensure:
- ✅ All components work together
- ✅ Security best practices are followed
- ✅ API design is consistent
- ✅ Error handling is comprehensive

### Step 8: Log Feedback
```bash
# Log successful patterns
./.claude/skills/cfn-cerebras-coordinator/feedback-logger.sh \
  --agent-id "$AGENT_ID" \
  --file-path "src/handlers/auth_handler.rs" \
  --success true \
  --learnings "Used JWT pattern from previous success, included proper error responses"

# Log any issues encountered
./.claude/skills/cfn-cerebras-coordinator/feedback-logger.sh \
  --agent-id "$AGENT_ID" \
  --file-path "src/services/auth_service.rs" \
  --success true \
  --learnings "Needed to adjust bcrypt rounds for performance"
```

## Benefits Achieved

1. **Speed**: Code generated in seconds vs minutes
2. **Quality**: Based on proven successful patterns
3. **Consistency**: Follows established code style
4. **Learning**: Each success/failure improves future generations
5. **Focus**: Agent concentrates on architecture, not boilerplate

## Advanced Workflow: Iterative Improvement

When initial generation needs improvement:

```bash
# 1. Analyze what failed
./query-patterns.sh --agent-id "$AGENT_ID" --success-rate-threshold 0.8

# 2. Generate with specific feedback
./coordinate-generation.sh \
  --agent-id "$AGENT_ID" \
  --file-path "src/handlers/auth_handler.rs" \
  --prompt "Update authentication handler to include rate limiting and refresh tokens. Previous version was missing these security features." \
  --context-files "src/models/user.rs,src/services/auth_service.rs" \
  --test-command "cargo test auth_handler" \
  --max-attempts 2

# 3. Log improvement
./feedback-logger.sh \
  --agent-id "$AGENT_ID" \
  --file-path "src/handlers/auth_handler.rs" \
  --success true \
  --learnings "Added rate limiting and refresh tokens based on security review"
```

## Key Success Indicators

Track these metrics to measure effectiveness:

```bash
# Query agent's success rate
./query-patterns.sh \
  --agent-id "$AGENT_ID" \
  --format json | jq '.patterns | length'

# Check common failure patterns
sqlite3 ./.claude/skills/cfn-cerebras-coordinator/generations.db \
  "SELECT error_message, COUNT(*) as count FROM feedback WHERE success = 0 GROUP BY error_message ORDER BY count DESC LIMIT 5"
```

This workflow creates a powerful feedback loop where agents become increasingly efficient at coordinating code generation while maintaining high architectural standards.