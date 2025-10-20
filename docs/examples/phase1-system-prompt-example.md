# Phase 1 System Prompt Enhancement - Example Output

This document shows example output from the Phase 1 System Prompts Enhancement, which converts JSON context from Redis into natural language system prompts for CLI-spawned agents.

## Example Scenario

Agent: `backend-dev`
Task ID: `auth-system-phase1`
Iteration: 2
Epic Context, Phase Context, and Success Criteria stored in Redis

## Sample Input (Redis JSON)

### Epic Context
```json
{
  "epicGoal": "Build a complete JWT-based authentication system",
  "inScope": [
    "User registration and login",
    "JWT token generation and validation",
    "Password hashing with bcrypt",
    "Session management",
    "Protected API routes"
  ],
  "outOfScope": [
    "OAuth integration",
    "Social login",
    "Two-factor authentication",
    "Password reset via email"
  ],
  "phases": [
    "Phase 1: Core authentication API",
    "Phase 2: Session management",
    "Phase 3: Security hardening"
  ],
  "riskProfile": "medium"
}
```

### Phase Context
```json
{
  "currentPhase": "Phase 1: Core authentication API",
  "phaseNumber": 1,
  "dependencies": [
    "Database schema designed",
    "API framework selected (Express)"
  ],
  "deliverables": [
    "User registration endpoint",
    "Login endpoint with JWT generation",
    "Password hashing implementation",
    "Unit tests with 80% coverage"
  ],
  "blockers": []
}
```

### Success Criteria
```json
{
  "acceptanceCriteria": [
    "All endpoints respond with correct status codes",
    "Passwords are hashed using bcrypt",
    "JWTs are properly signed and validated",
    "Error handling for invalid credentials",
    "Unit tests pass with 80% coverage"
  ],
  "gateThreshold": 0.75,
  "consensusThreshold": 0.90,
  "qualityGates": {
    "testCoverage": 80,
    "securityScore": 0.90,
    "performanceBudget": 200
  },
  "definitionOfDone": [
    "Code reviewed by architect",
    "Security review complete",
    "Documentation updated",
    "Integration tests pass"
  ]
}
```

## Output (Natural Language System Prompt)

```markdown
# Project Rules (CLAUDE.md)

[Full contents of CLAUDE.md would be included here]

---

# Agent Definition: backend-dev

[Full agent markdown template from .claude/agents/core-agents/backend-dev.md would be included here]

You are a specialized Backend API Developer creating robust, scalable APIs following best practices.

Core Responsibilities:
- Design RESTful/GraphQL APIs
- Implement authentication & authorization
- Create efficient database queries
- Ensure robust error handling

Implementation Standards:
- Controller-Service-Repository pattern
- Dependency Injection
- DTO validation
- Async/await for I/O operations

---

## Epic Context

**Epic Goal:**
Build a complete JWT-based authentication system

**Risk Profile:** medium

**In Scope:**
- User registration and login
- JWT token generation and validation
- Password hashing with bcrypt
- Session management
- Protected API routes

**Out of Scope:**
- OAuth integration
- Social login
- Two-factor authentication
- Password reset via email

**Phases:**
1. Phase 1: Core authentication API
2. Phase 2: Session management
3. Phase 3: Security hardening

---

## Current Phase

**Phase:** Phase 1: Core authentication API
**Phase Number:** 1

**Dependencies:**
- Database schema designed
- API framework selected (Express)

**Deliverables:**
- User registration endpoint
- Login endpoint with JWT generation
- Password hashing implementation
- Unit tests with 80% coverage

---

## Success Criteria

**Acceptance Criteria:**
- All endpoints respond with correct status codes
- Passwords are hashed using bcrypt
- JWTs are properly signed and validated
- Error handling for invalid credentials
- Unit tests pass with 80% coverage

**Quality Gates:**
- Gate Threshold (Loop 3): 75%
- Consensus Threshold (Loop 2): 90%

**Quality Metrics:**
- Test Coverage: 80%
- Security Score: 90%
- Performance Budget: 200ms

**Definition of Done:**
- [ ] Code reviewed by architect
- [ ] Security review complete
- [ ] Documentation updated
- [ ] Integration tests pass

---

## Current Iteration

This is **iteration 2** of your task.

**Previous Iterations:**
You have completed 1 iteration before this one.

**Your Goal:**
Address feedback from previous iterations and improve the quality of your work.

**Feedback Access:**
Check Redis for iteration feedback:
```bash
redis-cli get "swarm:auth-system-phase1:${AGENT_ID}:feedback:iteration-2"
```

---

## Execution Instructions

You are executing as a CLI-spawned agent with full project context.
Follow the agent definition, project rules, and success criteria exactly.

**Remember:**
- Respect scope boundaries (in-scope vs out-of-scope)
- Meet acceptance criteria and quality gates
- Follow CFN Loop protocol if task-id is provided
- Report confidence score when complete
```

## Benefits of Natural Language Context

### Before (JSON env vars)
```bash
EPIC_CONTEXT='{"epicGoal":"Build...","inScope":[...],"outOfScope":[...]}'
```

Agent must parse JSON with jq:
```bash
EPIC_GOAL=$(echo "$EPIC_CONTEXT" | jq -r '.epicGoal')
IN_SCOPE=$(echo "$EPIC_CONTEXT" | jq -r '.inScope[]')
```

### After (Natural language system prompt)
- Agent receives formatted, readable context directly
- No JSON parsing required
- Same format as Task() agents receive
- Easier to understand scope, requirements, and expectations
- Project rules (CLAUDE.md) automatically included
- Agent instructions automatically included

## Implementation Details

**Module:** `src/cli/cli-agent-context.ts`

**Key Functions:**
- `buildCLIAgentSystemPrompt()` - Main builder function
- `formatEpicContext()` - Converts epic JSON to markdown
- `formatPhaseContext()` - Converts phase JSON to markdown
- `formatSuccessCriteria()` - Converts criteria JSON to markdown
- `loadContextFromEnv()` - Loads context from environment variables

**Integration Point:** `src/cli/agent-executor.ts`
- Calls `buildCLIAgentSystemPrompt()` before API execution
- Passes system prompt to `executeAgentAPI()`
- Works with both Anthropic and Z.ai providers

**Test Coverage:** 22 passing tests in `src/cli/cli-agent-context.test.ts`

## Token Usage Comparison

**Task() Agent:**
- Epic context in prompt: ~5K tokens
- CLAUDE.md: ~10K tokens (not cached)
- Agent template: ~2K tokens (not cached)
- **Total:** ~17K tokens per call

**CLI Agent (After Phase 1):**
- System prompt (cached): ~17K tokens cached (only charged once)
- User prompt: ~1K tokens
- **Total:** ~1K tokens per call (after first call)

**Savings:** ~94% token reduction via prompt caching (system prompt cached by Anthropic API)

## Next Steps (Future Phases)

**Phase 2: Iteration History**
- Include previous iteration results in system prompt
- Show evolution of task across iterations
- Display validator feedback

**Phase 3: Message History & Conversation Threading**
- Maintain conversation across iterations
- Agents reference previous decisions
- Natural multi-turn conversations

**Phase 4: Tool Use (Function Calling)**
- Agents query Redis dynamically
- Discover peer results
- Request specific feedback
