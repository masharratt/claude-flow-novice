# Bidirectional JSON Context Structure for CFN Loop

**Version:** 2.10.0
**Created:** 2025-10-23
**Status:** Design Specification

---

## Overview

Establish consistent JSON structures for:
1. **Input Context** - Orchestrator → Agent (via --context parameter)
2. **Output Response** - Agent → Orchestrator (via structured output)
3. **Redis Storage** - Both directions stored for audit, recovery, analytics

---

## Input Context Structure (Orchestrator → Agent)

### Loop 3 Agent Context

```typescript
interface Loop3Context {
  // Core task information
  loop: "loop3";
  iteration: number;
  task: string;                    // Brief task description

  // Epic/Phase context
  epicGoal?: string;               // High-level epic objective
  phaseId?: string;                // Current phase identifier

  // Scope definition
  inScope: string[];               // What to implement
  outOfScope: string[];            // What NOT to implement

  // Deliverables (CRITICAL)
  deliverables: string[];          // File paths to create
  directory?: string;              // Target directory

  // Success criteria
  acceptanceCriteria: string[];    // Measurable requirements

  // Iteration feedback (iteration > 1)
  previousFeedback?: Array<{
    iteration: number;
    source: string;               // "validator", "product-owner"
    feedback: string;
    timestamp: string;
  }>;

  // Agent coordination
  taskId: string;
  agentId: string;
  agentType: string;

  // Instructions (optional)
  instructions?: string[];         // Step-by-step guidance
}
```

**Example:**
```json
{
  "loop": "loop3",
  "iteration": 1,
  "task": "Implement JWT authentication system",
  "epicGoal": "Build secure user authentication",
  "phaseId": "phase-1-backend",
  "inScope": [
    "JWT token generation",
    "Token validation middleware",
    "Refresh token flow"
  ],
  "outOfScope": [
    "OAuth integration",
    "Social login",
    "2FA"
  ],
  "deliverables": [
    "src/auth/jwt.ts",
    "src/auth/middleware.ts",
    "tests/auth/jwt.test.ts"
  ],
  "directory": "./src/auth",
  "acceptanceCriteria": [
    "All tests pass",
    "Coverage >= 80%",
    "No hardcoded secrets",
    "JWT expiry works correctly"
  ],
  "taskId": "auth-001",
  "agentId": "backend-dev-1-1",
  "agentType": "backend-dev"
}
```

### Loop 2 Validator Context

```typescript
interface Loop2Context {
  // Core task information
  loop: "loop2";
  iteration: number;
  task: string;

  // What to validate
  validationTarget: {
    loop3AgentIds: string[];       // Which agents to review
    deliverables: string[];        // Files to validate
    acceptanceCriteria: string[];  // Success criteria from Loop 3
  };

  // Loop 3 results
  loop3Results: Array<{
    agentId: string;
    agentType: string;
    confidence: number;
    filesCreated: string[];
    summary?: string;
  }>;

  // Validation instructions
  reviewAspects: string[];         // What to check (quality, security, performance, etc.)

  // Agent coordination
  taskId: string;
  agentId: string;
  agentType: string;
}
```

**Example:**
```json
{
  "loop": "loop2",
  "iteration": 1,
  "task": "Validate JWT authentication implementation",
  "validationTarget": {
    "loop3AgentIds": ["backend-dev-1-1"],
    "deliverables": [
      "src/auth/jwt.ts",
      "src/auth/middleware.ts",
      "tests/auth/jwt.test.ts"
    ],
    "acceptanceCriteria": [
      "All tests pass",
      "Coverage >= 80%",
      "No hardcoded secrets"
    ]
  },
  "loop3Results": [
    {
      "agentId": "backend-dev-1-1",
      "agentType": "backend-dev",
      "confidence": 0.85,
      "filesCreated": [
        "src/auth/jwt.ts",
        "src/auth/middleware.ts",
        "tests/auth/jwt.test.ts"
      ]
    }
  ],
  "reviewAspects": [
    "Code quality",
    "Security vulnerabilities",
    "Test coverage",
    "Error handling"
  ],
  "taskId": "auth-001",
  "agentId": "reviewer-1-1",
  "agentType": "reviewer"
}
```

### Product Owner Context

```typescript
interface ProductOwnerContext {
  // Core task information
  loop: "loop4";
  iteration: number;
  task: string;

  // Decision data
  loop2Consensus: number;          // Aggregated validator score
  consensusThreshold: number;      // Required threshold (0.90)

  // Gate data
  loop3GateScore: number;          // Self-validation score
  gateThreshold: number;           // Required threshold (0.75)

  // Deliverable verification
  deliverables: string[];
  filesCreated: string[];          // Actual files created
  deliverablesMissing: string[];   // Expected but not created

  // Loop results summary
  loop3Summary: Array<{
    agentId: string;
    confidence: number;
    filesCreated: string[];
  }>;
  loop2Summary: Array<{
    agentId: string;
    confidence: number;
    issues: string[];
  }>;

  // Decision framework
  maxIterations: number;
  currentIteration: number;

  // Agent coordination
  taskId: string;
  agentId: string;
}
```

**Example:**
```json
{
  "loop": "loop4",
  "iteration": 1,
  "task": "Decide on JWT authentication implementation",
  "loop2Consensus": 0.88,
  "consensusThreshold": 0.90,
  "loop3GateScore": 0.85,
  "gateThreshold": 0.75,
  "deliverables": [
    "src/auth/jwt.ts",
    "src/auth/middleware.ts",
    "tests/auth/jwt.test.ts"
  ],
  "filesCreated": [
    "src/auth/jwt.ts",
    "src/auth/middleware.ts",
    "tests/auth/jwt.test.ts"
  ],
  "deliverablesMissing": [],
  "loop3Summary": [
    {
      "agentId": "backend-dev-1-1",
      "confidence": 0.85,
      "filesCreated": ["src/auth/jwt.ts", "src/auth/middleware.ts", "tests/auth/jwt.test.ts"]
    }
  ],
  "loop2Summary": [
    {
      "agentId": "reviewer-1-1",
      "confidence": 0.90,
      "issues": ["Add error handling in token refresh"]
    },
    {
      "agentId": "tester-1-1",
      "confidence": 0.86,
      "issues": ["Improve edge case coverage"]
    }
  ],
  "maxIterations": 10,
  "currentIteration": 1,
  "taskId": "auth-001",
  "agentId": "product-owner-1-1"
}
```

---

## Output Response Structure (Agent → Orchestrator)

### Loop 3 Agent Response

```typescript
interface Loop3Response {
  // Agent identification
  agentId: string;
  agentType: string;
  iteration: number;

  // Self-assessment
  confidence: number;              // 0.0-1.0
  gatePass: boolean;               // confidence >= gateThreshold

  // Deliverables
  filesCreated: string[];          // Actual files created
  filesModified: string[];         // Existing files modified

  // Task summary
  summary: string;                 // Brief description of work done
  approach?: string;               // How the task was approached

  // Issues encountered
  issues?: Array<{
    severity: "critical" | "warning" | "info";
    description: string;
    resolution?: string;
  }>;

  // Next steps (if confidence < 1.0)
  improvements?: string[];

  // Execution metadata
  latencyMs?: number;              // Execution time
  tokensUsed?: {
    input: number;
    output: number;
  };

  // Status
  status: "complete" | "partial" | "failed";
  error?: string;                  // If status=failed
}
```

**Example:**
```json
{
  "agentId": "backend-dev-1-1",
  "agentType": "backend-dev",
  "iteration": 1,
  "confidence": 0.85,
  "gatePass": true,
  "filesCreated": [
    "src/auth/jwt.ts",
    "src/auth/middleware.ts",
    "tests/auth/jwt.test.ts"
  ],
  "filesModified": [],
  "summary": "Implemented JWT authentication with token generation, validation middleware, and comprehensive tests",
  "approach": "Created JWT utilities using jsonwebtoken library, implemented Express middleware for token validation, wrote unit tests covering happy path and error cases",
  "issues": [
    {
      "severity": "warning",
      "description": "Edge case test coverage could be improved",
      "resolution": "Added basic edge cases, recommend additional testing for token expiry edge cases"
    }
  ],
  "improvements": [
    "Add more edge case tests for token expiry",
    "Improve error messages in middleware"
  ],
  "latencyMs": 45230,
  "tokensUsed": {
    "input": 12500,
    "output": 3200
  },
  "status": "complete"
}
```

### Loop 2 Validator Response

```typescript
interface Loop2Response {
  // Agent identification
  agentId: string;
  agentType: string;
  iteration: number;

  // Validation result
  confidence: number;              // 0.0-1.0
  consensusReached: boolean;       // confidence >= consensusThreshold

  // Validation findings
  findings: Array<{
    category: string;              // "quality", "security", "performance", "testing"
    severity: "critical" | "warning" | "suggestion";
    issue: string;
    suggestion: string;
    affectedFiles?: string[];
  }>;

  // Approval status
  approved: boolean;
  approvalConditions?: string[];   // Conditions for approval

  // Feedback for iteration
  feedback?: string[];             // What to improve in next iteration

  // Summary
  summary: string;

  // Execution metadata
  latencyMs?: number;

  // Status
  status: "complete" | "failed";
  error?: string;
}
```

**Example:**
```json
{
  "agentId": "reviewer-1-1",
  "agentType": "reviewer",
  "iteration": 1,
  "confidence": 0.90,
  "consensusReached": true,
  "findings": [
    {
      "category": "quality",
      "severity": "warning",
      "issue": "Error handling in token refresh could be more robust",
      "suggestion": "Add specific error types for different failure modes (expired, invalid, malformed)",
      "affectedFiles": ["src/auth/jwt.ts"]
    },
    {
      "category": "testing",
      "severity": "suggestion",
      "issue": "Edge case coverage could be improved",
      "suggestion": "Add tests for edge cases: token exactly at expiry, malformed tokens, missing claims",
      "affectedFiles": ["tests/auth/jwt.test.ts"]
    }
  ],
  "approved": true,
  "approvalConditions": [
    "Error handling improvements acceptable for iteration 1",
    "Edge case tests can be added in iteration 2 if needed"
  ],
  "feedback": [
    "Improve error handling granularity",
    "Add edge case tests"
  ],
  "summary": "Implementation meets core requirements. Code quality is good with minor improvements needed in error handling and test coverage.",
  "latencyMs": 23500,
  "status": "complete"
}
```

### Product Owner Response

```typescript
interface ProductOwnerResponse {
  // Agent identification
  agentId: string;
  iteration: number;

  // Decision
  decision: "PROCEED" | "ITERATE" | "ABORT";
  reasoning: string;

  // Decision criteria met
  criteriaEvaluation: {
    consensusReached: boolean;
    gatePass: boolean;
    deliverablesVerified: boolean;
    withinIterationLimit: boolean;
  };

  // Feedback for iteration (if ITERATE)
  iterationFeedback?: string[];

  // Recommendations
  recommendations?: string[];

  // Summary
  summary: string;

  // Execution metadata
  latencyMs?: number;

  // Status
  status: "complete" | "failed";
  error?: string;
}
```

**Example:**
```json
{
  "agentId": "product-owner-1-1",
  "iteration": 1,
  "decision": "ITERATE",
  "reasoning": "Consensus (0.88) slightly below threshold (0.90). Gate passed (0.85 >= 0.75) and all deliverables created. Minor improvements will push consensus above threshold.",
  "criteriaEvaluation": {
    "consensusReached": false,
    "gatePass": true,
    "deliverablesVerified": true,
    "withinIterationLimit": true
  },
  "iterationFeedback": [
    "Improve error handling granularity in src/auth/jwt.ts",
    "Add edge case tests for token expiry scenarios",
    "Enhance error messages in middleware"
  ],
  "recommendations": [
    "Focus on validator feedback items",
    "Estimated 1 iteration to reach consensus"
  ],
  "summary": "Implementation is solid (gate passed, deliverables complete) but needs minor quality improvements to reach consensus threshold. Iterate once to address validator feedback.",
  "latencyMs": 8200,
  "status": "complete"
}
```

---

## Redis Storage Schema

### Input Context Storage

**Key Pattern:** `cfn_loop:task:{TASK_ID}:loop{N}:input:{AGENT_ID}`

**Storage:**
```bash
redis-cli SET "cfn_loop:task:auth-001:loop3:input:backend-dev-1-1" '{
  "loop": "loop3",
  "iteration": 1,
  "task": "Implement JWT authentication",
  ...
}' EX 86400  # 24 hour TTL
```

**Retrieval:**
```bash
redis-cli GET "cfn_loop:task:auth-001:loop3:input:backend-dev-1-1"
```

### Output Response Storage

**Key Pattern:** `cfn_loop:task:{TASK_ID}:loop{N}:output:{AGENT_ID}`

**Storage:**
```bash
redis-cli SET "cfn_loop:task:auth-001:loop3:output:backend-dev-1-1" '{
  "agentId": "backend-dev-1-1",
  "confidence": 0.85,
  "filesCreated": [...],
  ...
}' EX 86400
```

**Retrieval:**
```bash
redis-cli GET "cfn_loop:task:auth-001:loop3:output:backend-dev-1-1"
```

### Aggregated Context (for recovery/audit)

**Key Pattern:** `cfn_loop:task:{TASK_ID}:context`

**Storage (HSET for structured data):**
```bash
redis-cli HSET "cfn_loop:task:auth-001:context" \
  "epic_goal" "Build secure authentication" \
  "deliverables" '["src/auth/jwt.ts","tests/auth/jwt.test.ts"]' \
  "acceptance_criteria" '["Tests pass","Coverage >= 80%"]'
```

### Message History (for audit trail)

**Key Pattern:** `cfn_loop:task:{TASK_ID}:messages`

**Storage (LIST for chronological order):**
```bash
redis-cli LPUSH "cfn_loop:task:auth-001:messages" '{
  "timestamp": "2025-10-23T20:00:00Z",
  "direction": "input",
  "loop": "loop3",
  "agentId": "backend-dev-1-1",
  "context": {...}
}'

redis-cli LPUSH "cfn_loop:task:auth-001:messages" '{
  "timestamp": "2025-10-23T20:05:00Z",
  "direction": "output",
  "loop": "loop3",
  "agentId": "backend-dev-1-1",
  "response": {...}
}'
```

**Retrieval (last 50 messages):**
```bash
redis-cli LRANGE "cfn_loop:task:auth-001:messages" 0 49
```

---

## Implementation Changes

### Orchestrator Changes

**File:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`

**Current (lines 776-799):**
```bash
LOOP3_AGENT_CONTEXT="Loop 3 implementation...
Deliverables: file1.md, file2.md..."
```

**New:**
```bash
# Build JSON context
LOOP3_AGENT_CONTEXT=$(jq -n \
  --arg task "Loop 3 implementation for iteration $ITERATION" \
  --arg epicGoal "$EPIC_GOAL" \
  --argjson inScope "$(echo "$IN_SCOPE" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson outScope "$(echo "$OUT_SCOPE" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson deliverables "$(echo "$DELIVERABLES" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --argjson criteria "$(echo "$ACCEPTANCE" | jq -R -s 'split("\n") | map(select(length > 0))')" \
  --arg directory "${DIRECTORY:-}" \
  --arg taskId "$TASK_ID" \
  --arg agentId "$UNIQUE_AGENT_ID" \
  --arg agentType "$AGENT" \
  --argjson iteration "$ITERATION" \
  '{
    loop: "loop3",
    iteration: $iteration,
    task: $task,
    epicGoal: $epicGoal,
    inScope: $inScope,
    outOfScope: $outScope,
    deliverables: $deliverables,
    directory: (if $directory == "" then null else $directory end),
    acceptanceCriteria: $criteria,
    taskId: $taskId,
    agentId: $agentId,
    agentType: $agentType
  }')

# Store input context in Redis
redis-cli SET "cfn_loop:task:${TASK_ID}:loop3:input:${UNIQUE_AGENT_ID}" "$LOOP3_AGENT_CONTEXT" EX 86400 >/dev/null

# Add to message history
redis-cli LPUSH "cfn_loop:task:${TASK_ID}:messages" "$(jq -n \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg direction "input" \
  --arg loop "loop3" \
  --arg agentId "$UNIQUE_AGENT_ID" \
  --argjson context "$LOOP3_AGENT_CONTEXT" \
  '{timestamp: $timestamp, direction: $direction, loop: $loop, agentId: $agentId, context: $context}')" >/dev/null
```

### Output Processing Changes

**File:** `.claude/skills/loop3-output-processing/parse-confidence.sh`

**New:** Add structured JSON extraction

**File:** `.claude/skills/loop3-output-processing/extract-response.sh` (NEW)

```bash
#!/bin/bash
# Extract structured JSON response from agent output

AGENT_OUTPUT="$1"

# Try to extract JSON block from output
JSON_RESPONSE=$(echo "$AGENT_OUTPUT" | grep -oP '```json\s*\K.*?(?=\s*```)' | head -1)

if [ -z "$JSON_RESPONSE" ]; then
  # Fallback: try to find JSON object in output
  JSON_RESPONSE=$(echo "$AGENT_OUTPUT" | grep -oP '\{.*"confidence".*\}' | head -1)
fi

if [ -n "$JSON_RESPONSE" ]; then
  # Validate JSON
  if echo "$JSON_RESPONSE" | jq . >/dev/null 2>&1; then
    echo "$JSON_RESPONSE"
    exit 0
  fi
fi

# Fallback: build minimal response
jq -n \
  --arg summary "$(echo "$AGENT_OUTPUT" | tail -20 | head -10)" \
  --argjson confidence "$(parse-confidence.sh "$AGENT_OUTPUT")" \
  '{
    confidence: $confidence,
    summary: $summary,
    status: "complete"
  }'
```

### Agent Template Update

**File:** `.claude/agents/core-agents/coder.md`

**Add section:**
```markdown
## Output Format

Provide structured JSON response:

\`\`\`json
{
  "agentId": "${AGENT_ID}",
  "agentType": "coder",
  "iteration": ${ITERATION},
  "confidence": 0.85,
  "gatePass": true,
  "filesCreated": ["file1.ts", "file2.ts"],
  "summary": "Brief description of work completed",
  "issues": [
    {
      "severity": "warning",
      "description": "Issue description",
      "resolution": "How it was resolved"
    }
  ],
  "status": "complete"
}
\`\`\`
```

---

## Benefits

### Consistency
- ✅ Standardized input across all agents
- ✅ Standardized output across all loops
- ✅ Easier to parse and validate

### Visibility
- ✅ Full audit trail in Redis
- ✅ Message history for debugging
- ✅ Clear agent communication flow

### Recovery
- ✅ Swarm can resume from stored context
- ✅ Iteration history preserved
- ✅ Decision rationale captured

### Analytics
- ✅ Confidence trends over iterations
- ✅ Agent performance metrics
- ✅ Feedback effectiveness analysis

### Clarity
- ✅ Enhanced JSON parser formats context as markdown
- ✅ Agents receive clear, structured information
- ✅ No ambiguity in requirements

---

## Migration Path

### Phase 1: Input Context (Week 1)
- Update orchestrator to build JSON context
- Store input context in Redis
- Enhanced parser handles JSON → markdown
- Backward compatible (plain text still works)

### Phase 2: Output Responses (Week 2)
- Add extraction script for JSON responses
- Update agent templates with response format
- Store output responses in Redis
- Fallback to current parsing if no JSON

### Phase 3: Message History (Week 3)
- Implement message history logging
- Add audit trail endpoints
- Build recovery mechanism

### Phase 4: Validation & Testing (Week 4)
- Comprehensive testing
- Performance validation
- Documentation updates

---

## Success Metrics

- 100% of agents receive JSON context
- 90%+ of agents return structured JSON responses
- Zero regression in existing functionality
- Message history coverage: 100%
- Recovery mechanism tested and validated

---

**Document Version:** 1.0.0
**Next Steps:** Implement Phase 1 (Input Context)
**Related Files:**
- `src/cli/agent-prompt-builder.ts` (enhanced parser)
- `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh` (context building)
- `.claude/skills/loop3-output-processing/` (response extraction)

