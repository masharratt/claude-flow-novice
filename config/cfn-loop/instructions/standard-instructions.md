# CFN Loop Standard Mode Instructions

---

## Mode Configuration

**Standard Mode (Default)**: Balanced quality and velocity for general feature development

**Thresholds**:
- Gate (Agent Self-Confidence): ≥0.75
- Validator Consensus: ≥0.90
- Max Loop 3 Iterations: 10 per subtask
- Max Loop 2 Iterations: 10 per phase
- Validators: 4-person team (code-quality-validator, security-specialist, perf-analyzer, tester)
- Product Owner: Single agent with balanced decision criteria
- Test Coverage: ≥80%

**When to Use Standard Mode**:
- General feature development
- Production features requiring quality validation
- Balanced time-to-market vs quality trade-off
- Most common development scenarios

---

## CFN Loop Structure

### Loop 0: Epic/Sprint Orchestration

**Purpose**: Multi-phase project coordination and high-level planning

**No Iteration Limit**: Orchestration continues until all sprints complete

**Responsibilities**:
- Parse epic JSON files into sprints and phases
- Coordinate phase transitions
- Monitor overall progress
- Aggregate sprint metrics

**Memory Pattern**:
```bash
# Store epic state in SQLite (ACL Level 4: Project, 365-day retention)
/sqlite-memory store \
  --key "cfn/epic-${epicId}/state" \
  --level project \
  --data '{
    "sprints": ["sprint-1", "sprint-2"],
    "currentSprint": "sprint-1",
    "overallConfidence": 0.85,
    "status": "in_progress"
  }' \
  --ttl 31536000
```

**Redis Coordination**:
```bash
# Publish epic-level events
redis-cli publish "cfn:epic:${epicId}:transition" '{
  "from": "sprint-1",
  "to": "sprint-2",
  "timestamp": 1234567890
}'
```

---

### Loop 1: Phase Execution

**Purpose**: Sequential execution of phases within a sprint

**No Iteration Limit**: Continues through all phases in sprint

**Responsibilities**:
- Execute phases in dependency order
- Monitor phase completion
- Coordinate between phases
- Handle phase-to-phase data flow

**Swarm Initialization** (ONCE per phase, persistent):
```bash
# Initialize phase-level swarm (persistent through all loops)
node tests/manual/test-swarm-direct.js \
  "Phase: Authentication System" \
  --executor \
  --max-agents 7 \
  --strategy development \
  --mode mesh \
  --swarm-id "phase-auth-implementation"

# Store swarm context in Redis (survives interruptions)
redis-cli setex "swarm:phase-auth-implementation:state" 86400 '{
  "swarmId": "phase-auth-implementation",
  "phase": "auth",
  "mode": "mesh",
  "persistence": true,
  "createdAt": 1234567890
}'
```

**When to Re-Initialize Swarm**:
- ✅ New phase starts (Phase 0 → Phase 1 → Phase 2...)
- ✅ Swarm corruption detected (Redis state inconsistent)
- ✅ >24 hours since last activity (TTL expiration)
- ❌ Loop 3 retry iterations (use existing swarm)
- ❌ Loop 2 consensus validations (use existing swarm)
- ❌ Agent respawns within same phase

**Memory Pattern**:
```bash
# Store phase state in SQLite (ACL Level 3: Swarm, 30-day retention)
/sqlite-memory store \
  --key "cfn/phase-${phaseId}/state" \
  --level swarm \
  --data '{
    "phase": "auth",
    "loop": 3,
    "agents": 5,
    "avgConfidence": 0.85,
    "status": "implementing"
  }' \
  --ttl 2592000
```

---

### Loop 3: Primary Swarm Implementation

**Purpose**: Core implementation work by specialist agents

**Gate**: All agents must achieve ≥0.75 confidence to proceed to Loop 2

**Max Iterations**: 10 per subtask

**Agent Count**: 2-7 agents in mesh topology; 8+ requires hierarchical with coordinators

**Standard Validation Suite** (Full):
- Code quality validation (SOLID principles, design patterns)
- Security scanning (no eval(), SQL injection, XSS, hardcoded secrets)
- Performance analysis (O(n) complexity, memory leaks)
- Test coverage ≥80% (unit + integration tests)
- Post-edit hook validation (mandatory after every file edit)

#### Spawn Process (Single Message, Batched)

**Mesh Topology (2-7 agents)**:
```bash
# Spawn all Loop 3 implementers in one message using Task tool
# Agent roles: coder, security-specialist, perf-analyzer

Task: Spawn Loop 3 implementers for authentication phase

Agents to spawn (batched):
1. coder-1: Implement core authentication logic
   - Files: src/auth/core.ts, src/auth/middleware.ts
   - Tests: src/auth/core.test.ts
   - Focus: JWT token generation, validation
   - Confidence target: ≥0.75

2. coder-2: Implement user session management
   - Files: src/auth/session.ts, src/auth/session-store.ts
   - Tests: src/auth/session.test.ts
   - Focus: Session lifecycle, cleanup
   - Confidence target: ≥0.75

3. security-specialist-1: Security hardening
   - Files: src/auth/security.ts, src/auth/rate-limit.ts
   - Tests: src/auth/security.test.ts
   - Focus: Rate limiting, brute force prevention
   - Confidence target: ≥0.75

All agents coordinate via Redis pub/sub (mandatory).
```

**Hierarchical Topology (8+ agents)**:
```bash
# Spawn coordinators in mesh, teams under them hierarchically

Task: Spawn Loop 3 implementers for complex e-commerce phase

Coordinators (mesh):
1. coordinator-auth: Coordinate authentication team (5 agents)
2. coordinator-payment: Coordinate payment team (7 agents)
3. coordinator-catalog: Coordinate catalog team (6 agents)

Each coordinator spawns their team hierarchically and reports progress via Redis.
```

#### Redis Pub/Sub Communication (Mandatory)

**Channel Naming Convention**:
- `cfn.loop.phase.start` - Phase transition events
- `cfn.loop.3.agent.spawned` - Agent lifecycle events
- `cfn.loop.3.agent.complete` - Agent completion events
- `cfn.loop.3.gate.check` - Gate evaluation events

**Loop 3 Start Event**:
```bash
# Publish phase transition event (priority 9 - highest)
redis-cli publish "cfn.loop.phase.start" '{
  "loop": 3,
  "phase": "auth",
  "swarmId": "phase-auth-implementation",
  "timestamp": 1234567890,
  "mode": "standard"
}'
```

**Agent Spawned Event**:
```bash
# Publish agent lifecycle event (priority 8)
redis-cli publish "cfn.loop.3.agent.spawned" '{
  "agent": "coder-1",
  "status": "spawned",
  "loop": 3,
  "phase": "auth",
  "swarmId": "phase-auth-implementation",
  "timestamp": 1234567890
}'
```

**Agent Completion Event**:
```bash
# Publish confidence score (priority 8)
redis-cli publish "cfn.loop.3.agent.complete" '{
  "agent": "coder-1",
  "confidence": 0.85,
  "loop": 3,
  "phase": "auth",
  "files": ["src/auth/core.ts", "src/auth/core.test.ts"],
  "reasoning": "Tests pass, security clean, coverage 85%",
  "blockers": [],
  "timestamp": 1234567890
}'
```

**Subscribe to All Loop 3 Events**:
```bash
# Subscribe with batch processing (50 events at a time)
redis-cli --csv psubscribe "cfn.loop.3.*" | while read line; do
  echo "$line" | jq .
done
```

#### SQLite Memory Patterns

**Store Implementation Results** (ACL Level 1: Private to agent):
```bash
# Each agent stores their results privately
/sqlite-memory store \
  --key "cfn/phase-auth/loop3/agent-coder-1" \
  --level private \
  --data '{
    "confidence": 0.85,
    "files": ["src/auth/core.ts", "src/auth/core.test.ts"],
    "reasoning": "Tests pass, security clean, coverage 85%",
    "blockers": [],
    "timestamp": 1234567890
  }' \
  --ttl 2592000
```

**Store Phase-Level Results** (ACL Level 3: Swarm-shared):
```bash
# Coordinator aggregates all agent results
/sqlite-memory store \
  --key "cfn/phase-auth/loop3/results" \
  --level swarm \
  --data '{
    "avgConfidence": 0.85,
    "agents": ["coder-1", "coder-2", "security-specialist-1"],
    "individualScores": [0.85, 0.87, 0.82],
    "files": [
      "src/auth/core.ts",
      "src/auth/middleware.ts",
      "src/auth/session.ts"
    ],
    "gateStatus": "pass",
    "timestamp": 1234567890
  }' \
  --ttl 2592000
```

#### Post-Edit Hook (Mandatory)

**After Every File Edit**:
```bash
# Run post-edit hook with memory key for coordination
node config/hooks/post-edit-pipeline.js \
  "src/auth/core.ts" \
  --memory-key "swarm/coder-1/auth-core" \
  --minimum-coverage 80 \
  --tdd-mode \
  --structured

# Hook provides:
# - TDD compliance validation
# - Security analysis (eval, secrets, XSS)
# - Formatting check (Prettier)
# - Coverage analysis (≥80%)
# - Actionable recommendations
```

**WASM 52x Acceleration** (enabled by default):
- JavaScript/TypeScript: AST parsing, linting, type checking
- Rust files: Pattern matching (unwrap, panic, expect detection)
- Performance: 100+ files validated in <1 second

#### Gate Evaluation

**Check if all agents ≥0.75**:
```bash
# Retrieve all agent confidence scores
/sqlite-memory retrieve \
  --key "cfn/phase-auth/loop3/*" \
  --level swarm \
  | jq '[.[] | .confidence] | add / length'

# If avg ≥0.75: Proceed to Loop 2
# If avg <0.75: Retry Loop 3 (up to 10 iterations)
```

**Gate Pass Event**:
```bash
# Publish gate pass event
redis-cli publish "cfn.loop.3.gate.pass" '{
  "phase": "auth",
  "avgConfidence": 0.85,
  "target": 0.75,
  "status": "pass",
  "nextLoop": 2,
  "timestamp": 1234567890
}'
```

#### Retry Strategy (Standard Mode)

**When Confidence <0.75**:
```bash
# Analyze failing agents
/sqlite-memory retrieve \
  --key "cfn/phase-auth/loop3/*" \
  --level swarm \
  | jq '.[] | select(.confidence < 0.75)'

# Retry template:
# 1. Replace failing agents with specialists
# 2. Add missing roles (e.g., security-specialist if SQLi detected)
# 3. Target specific issues (e.g., raise test coverage to 85%)
# 4. Max 10 iterations before escalation
```

**Retry Spawn Example**:
```bash
Task: Retry Loop 3 iteration 2 - Address low confidence in auth logic

Replace coder-1 (confidence 0.65) with specialist:
1. backend-dev-1: Reimplement auth middleware
   - Issue: Insufficient error handling
   - Focus: Comprehensive error recovery
   - Target: ≥0.75 confidence

Add missing role:
2. security-specialist-2: Add rate limiting
   - Issue: No brute force prevention
   - Focus: Implement exponential backoff
   - Target: ≥0.75 confidence

Retain high-performing agents:
- coder-2 (confidence 0.87) - no changes
- security-specialist-1 (confidence 0.82) - no changes
```

---

### Loop 2: Consensus Validation

**Purpose**: 4-person validator team reviews Loop 3 implementation

**Consensus**: ≥0.90 average confidence to proceed to Loop 4

**Max Iterations**: 10 per phase

**Validator Team** (Standard Mode):
1. **code-quality-validator**: SOLID principles, design patterns, code smells
2. **security-specialist**: Security vulnerabilities, compliance, secrets
3. **perf-analyzer**: Performance bottlenecks, O(n) complexity, memory leaks
4. **tester**: Test coverage, edge cases, integration tests

**Critical Rules**:
- NEVER mix implementers and validators in the same message
- Validators run AFTER Loop 3 gate passes (≥0.75)
- Validators read Loop 3 results from SQLite memory
- Consensus <0.90 triggers targeted Loop 3 retry

#### Spawn Process (Single Message, Batched)

```bash
Task: Spawn Loop 2 validators for authentication phase

Validators to spawn (batched):
1. code-quality-validator-1: Review code quality
   - Read: cfn/phase-auth/loop3/results
   - Focus: SOLID principles, design patterns
   - Metrics: Cyclomatic complexity, code smells
   - Confidence target: ≥0.90

2. security-specialist-1: Review security
   - Read: cfn/phase-auth/loop3/results
   - Focus: SQL injection, XSS, secrets management
   - Metrics: Security scan results, compliance
   - Confidence target: ≥0.90

3. perf-analyzer-1: Review performance
   - Read: cfn/phase-auth/loop3/results
   - Focus: O(n) complexity, memory leaks
   - Metrics: Profiling results, benchmarks
   - Confidence target: ≥0.90

4. tester-1: Review test coverage
   - Read: cfn/phase-auth/loop3/results
   - Focus: Edge cases, integration tests
   - Metrics: Coverage ≥80%, test quality
   - Confidence target: ≥0.90

All validators coordinate via Redis pub/sub (mandatory).
```

#### Redis Pub/Sub Communication

**Loop 2 Start Event**:
```bash
# Publish validation start event (priority 9)
redis-cli publish "cfn.loop.validation.start" '{
  "loop": 2,
  "phase": "auth",
  "validators": [
    "code-quality-validator-1",
    "security-specialist-1",
    "perf-analyzer-1",
    "tester-1"
  ],
  "timestamp": 1234567890
}'
```

**Validator Completion Event**:
```bash
# Publish validator consensus (priority 8)
redis-cli publish "cfn.loop.2.validator.complete" '{
  "validator": "code-quality-validator-1",
  "confidence": 0.92,
  "loop": 2,
  "phase": "auth",
  "issues": [],
  "recommendations": ["Add factory pattern for auth providers"],
  "timestamp": 1234567890
}'
```

#### SQLite Memory Patterns

**Validators Read Loop 3 Results**:
```bash
# Retrieve Loop 3 implementation results
/sqlite-memory retrieve \
  --key "cfn/phase-auth/loop3/results" \
  --level swarm

# Returns:
# {
#   "avgConfidence": 0.85,
#   "agents": ["coder-1", "coder-2"],
#   "files": ["src/auth/core.ts", "src/auth/middleware.ts"],
#   "gateStatus": "pass"
# }
```

**Store Validation Results** (ACL Level 3: Swarm-shared):
```bash
# Each validator stores their assessment
/sqlite-memory store \
  --key "cfn/phase-auth/loop2/validator-code-quality" \
  --level swarm \
  --data '{
    "confidence": 0.92,
    "issues": [],
    "recommendations": ["Add factory pattern for auth providers"],
    "metrics": {
      "complexity": 5,
      "codeSmells": 2,
      "solidCompliance": 0.90
    },
    "timestamp": 1234567890
  }' \
  --ttl 2592000
```

**Store Consensus Results** (ACL Level 3: Swarm-shared):
```bash
# Aggregate all validator scores
/sqlite-memory store \
  --key "cfn/phase-auth/loop2/consensus" \
  --level swarm \
  --data '{
    "avgConsensus": 0.92,
    "validators": [
      {"name": "code-quality-validator-1", "confidence": 0.92},
      {"name": "security-specialist-1", "confidence": 0.95},
      {"name": "perf-analyzer-1", "confidence": 0.88},
      {"name": "tester-1", "confidence": 0.93}
    ],
    "combinedIssues": [],
    "combinedRecommendations": [
      "Add factory pattern for auth providers",
      "Implement rate limiting dashboard"
    ],
    "consensusStatus": "pass",
    "timestamp": 1234567890
  }' \
  --ttl 2592000
```

#### Consensus Evaluation

**Check if consensus ≥0.90**:
```bash
# Retrieve all validator confidence scores
/sqlite-memory retrieve \
  --key "cfn/phase-auth/loop2/*" \
  --level swarm \
  | jq '[.[] | select(.confidence) | .confidence] | add / length'

# If avg ≥0.90: Proceed to Loop 4
# If avg <0.90: Retry Loop 3 with targeted fixes (up to 10 iterations)
```

**Consensus Pass Event**:
```bash
# Publish consensus pass event
redis-cli publish "cfn.loop.2.consensus.pass" '{
  "phase": "auth",
  "consensus": 0.92,
  "target": 0.90,
  "status": "pass",
  "nextLoop": 4,
  "timestamp": 1234567890
}'
```

#### Retry Strategy (Standard Mode)

**When Consensus <0.90**:
```bash
# Analyze validator issues
/sqlite-memory retrieve \
  --key "cfn/phase-auth/loop2/consensus" \
  --level swarm \
  | jq '.combinedIssues'

# Retry template:
# 1. Target specific validator issues (e.g., fix SQLi, raise coverage)
# 2. Refer recommendations to Product Owner for improvements
# 3. Relaunch Loop 3 with targeted agents
# 4. Max 10 iterations before escalation
```

**Retry Spawn Example**:
```bash
Task: Retry Loop 3 iteration 3 - Address validation issues

Target security-specialist issues:
1. security-specialist-2: Fix SQL injection vulnerability
   - Issue: Unsafe query construction in auth/core.ts
   - Focus: Use parameterized queries
   - Target: ≥0.90 validator consensus

Target tester issues:
2. tester-2: Raise test coverage to 85%
   - Issue: Edge cases not covered (session timeout)
   - Focus: Add integration tests
   - Target: ≥0.90 validator consensus

Retain high-performing agents:
- coder-2 (no issues reported)
```

---

### Loop 4: Product Owner Decision Gate

**Purpose**: Single Product Owner agent makes autonomous GOAP decision

**Decision Types**:
- **PROCEED**: Relaunch Loop 3 with targeted fixes
- **DEFER**: Approve work, backlog out-of-scope issues, launch next phase
- **ESCALATE**: Critical ambiguity requiring human review

**Standard Mode Criteria** (Balanced):
- Confidence ≥0.90 (from Loop 2 consensus)
- Test coverage ≥80%
- No critical security issues
- Performance acceptable (no O(n²) in hot paths)
- Balanced scope (not over-engineered)

#### Spawn Process (Single Agent)

```bash
Task: Spawn Product Owner for authentication phase decision

Agent to spawn:
1. product-owner-1: Make GOAP decision
   - Read: cfn/phase-auth/loop2/consensus
   - Read: cfn/phase-auth/loop3/results
   - Decision Criteria: Standard mode (balanced)
   - Output: PROCEED / DEFER / ESCALATE
   - Reasoning: Detailed explanation of decision
```

#### Redis Pub/Sub Communication

**Loop 4 Start Event**:
```bash
# Publish product owner decision start event (priority 9)
redis-cli publish "cfn.loop.4.decision.start" '{
  "loop": 4,
  "phase": "auth",
  "productOwner": "product-owner-1",
  "timestamp": 1234567890
}'
```

**Decision Event**:
```bash
# Publish product owner decision (priority 10 - critical)
redis-cli publish "cfn.loop.4.decision.made" '{
  "productOwner": "product-owner-1",
  "decision": "DEFER",
  "phase": "auth",
  "reasoning": "Work meets Standard mode criteria. Backlog enhancements.",
  "backlogItems": [
    "Add factory pattern for auth providers",
    "Implement rate limiting dashboard"
  ],
  "nextAction": "auto-transition to next phase",
  "timestamp": 1234567890
}'
```

#### SQLite Memory Patterns

**Product Owner Reads All Loop Data**:
```bash
# Retrieve all phase data for decision
/sqlite-memory retrieve \
  --key "cfn/phase-auth/*" \
  --level project

# Returns:
# - Loop 3 results (implementation)
# - Loop 2 consensus (validation)
# - All agent confidence scores
# - Combined recommendations
```

**Store Decision** (ACL Level 4: Project, 365-day retention):
```bash
# Store product owner decision
/sqlite-memory store \
  --key "cfn/phase-auth/loop4/decision" \
  --level project \
  --data '{
    "decision": "DEFER",
    "reasoning": "Work meets Standard mode criteria. Backlog enhancements.",
    "confidence": 0.92,
    "backlogItems": [
      "Add factory pattern for auth providers",
      "Implement rate limiting dashboard"
    ],
    "nextAction": "auto-transition to next phase",
    "timestamp": 1234567890
  }' \
  --ttl 31536000
```

#### Decision Logic

**PROCEED Decision**:
```bash
# Criteria: Issues found that can be fixed in current phase
# Action: Relaunch Loop 3 with targeted agents
# Example: "Security issue found - fix SQLi before moving on"
```

**DEFER Decision**:
```bash
# Criteria: Work meets acceptance criteria, enhancements can wait
# Action: Approve work, create backlog items, auto-transition to next phase
# Example: "Core auth complete. Rate limiting can be added later."
```

**ESCALATE Decision**:
```bash
# Criteria: Critical ambiguity requiring human review
# Action: Pause automation, notify human, wait for decision
# Example: "Unclear if OAuth or SAML is required - need product clarification"
```

---

## Git Commit Pattern

**Mandatory**: Commit after each loop completion with detailed metadata

### After Loop 3 Completes (Gate Pass)

```bash
# Automated commit via CLI
/github-commit --chat

# Manual commit (if CLI unavailable)
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 3 - Authentication Phase

Loop 3 Implementation Results:
- Confidence: 0.85 (target: ≥0.75) ✅
- Agents: coder-1, coder-2, security-specialist-1
- Files: src/auth/core.ts, src/auth/middleware.ts, src/auth/session.ts
- Tests: src/auth/*.test.ts (coverage: 85%)
- Security: Clean (no SQLi, XSS, or hardcoded secrets)

Ready for Loop 2 validation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### After Loop 2 Validation Completes (Consensus Pass)

```bash
# Automated commit via CLI
/github-commit --chat

# Manual commit
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Loop 2 - Validation Phase

Loop 2 Validation Results:
- Consensus: 0.92 (target: ≥0.90) ✅
- Validators:
  - code-quality-validator-1: 0.92
  - security-specialist-1: 0.95
  - perf-analyzer-1: 0.88
  - tester-1: 0.93
- Issues: None
- Recommendations:
  - Add factory pattern for auth providers (deferred to backlog)
  - Implement rate limiting dashboard (deferred to backlog)

Ready for Loop 4 Product Owner decision

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### After Loop 4 Product Owner Decision

```bash
# Automated commit via CLI
/github-commit --chat

# Manual commit
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Phase - Authentication System

Loop 4 Product Owner Decision: DEFER ✅
- Phase: Authentication System COMPLETE
- Overall Confidence: 0.92
- Decision: Work meets Standard mode criteria
- Status: Production ready
- Backlog Items:
  - Add factory pattern for auth providers
  - Implement rate limiting dashboard

Next: Auto-transition to next phase (User Profile)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### After Sprint Completes (Multiple Phases)

```bash
# Automated commit via CLI (triggers /cfn-loop-document automatically)
/github-commit --full

# Manual commit
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Sprint 1 - User Management

Sprint Summary:
- Phases Completed:
  - Authentication (0.92)
  - User Profile (0.88)
  - Permissions (0.91)
- Total Agents: 15
- Sprint Confidence: 0.90
- Status: All phases validated and production ready
- Backlog Items: 12 enhancements deferred

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Trigger documentation generation
/cfn-loop-document --sprint=user-management
```

### After Epic Completes (All Sprints)

```bash
# Automated commit via CLI
/github-commit --full

# Manual commit
git add .
git commit -m "$(cat <<'EOF'
feat(cfn-loop): Complete Epic - E-commerce Platform v1.0

Epic Summary:
- Sprints Completed:
  - User Management (0.90)
  - Product Catalog (0.89)
  - Checkout Flow (0.92)
- Total Phases: 12
- Epic Confidence: 0.90
- Status: Platform launch ready
- Total Agents: 45
- Duration: 8 days

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Trigger epic documentation
/cfn-loop-document --epic=e-commerce-v1
```

---

## Standard Mode Retry Templates

### Loop 3 Retry (Low Confidence)

**When**: Agent confidence <0.75

**Max Iterations**: 10

**Strategy**:
1. Replace failing agents with specialists
2. Add missing roles (security, performance)
3. Target specific issues from post-edit hook
4. Escalate if iteration limit reached

**Example**:
```bash
Iteration 1: Initial implementation
- coder-1: 0.65 (low test coverage)
- coder-2: 0.87 (good)
- security-specialist-1: 0.82 (good)
Average: 0.78 ❌ (but coder-1 below gate)

Iteration 2: Replace coder-1
- backend-dev-1: 0.85 (improved test coverage)
- coder-2: 0.87 (retained)
- security-specialist-1: 0.82 (retained)
Average: 0.85 ✅ (all agents ≥0.75)
```

### Loop 2 Retry (Consensus <0.90)

**When**: Validator consensus <0.90

**Max Iterations**: 10

**Strategy**:
1. Target specific validator issues
2. Refer recommendations to Product Owner
3. Relaunch Loop 3 with focused agents
4. Escalate if iteration limit reached

**Example**:
```bash
Iteration 1: Initial validation
- code-quality-validator: 0.92 (good)
- security-specialist: 0.75 (SQLi detected)
- perf-analyzer: 0.88 (good)
- tester: 0.85 (coverage 75%, target 80%)
Average: 0.85 ❌ (below 0.90 threshold)

Iteration 2: Fix security and coverage
Loop 3 retry:
- security-specialist-2: Fix SQLi (parameterized queries)
- tester-2: Raise coverage to 85%

Loop 2 re-validation:
- code-quality-validator: 0.92 (retained)
- security-specialist: 0.95 (SQLi fixed)
- perf-analyzer: 0.88 (retained)
- tester: 0.93 (coverage 85%)
Average: 0.92 ✅ (above 0.90 threshold)
```

---

## Stop Criteria

**Stop Loop 3** if:
- Iteration limit reached (10)
- Critical security error (SQL injection, XSS, hardcoded secrets)
- Compilation error blocking all progress
- Explicit STOP/PAUSE command

**Stop Loop 2** if:
- Iteration limit reached (10)
- Critical blocker (architecture mismatch, design flaw)
- Explicit STOP/PAUSE command

**Escalate to Human** if:
- Both iteration limits reached
- Product Owner decision is ESCALATE
- Critical ambiguity (unclear requirements)

---

## Complete Standard Mode Flow Example

```bash
# Loop 0: Epic orchestration (parse epic JSON)
/parse-epic ./e-commerce.json --cfn-mode=standard

# Loop 1: Phase execution (initialize swarm for auth phase)
node tests/manual/test-swarm-direct.js \
  "Phase: Authentication System" \
  --executor \
  --max-agents 7 \
  --strategy development \
  --mode mesh

# Loop 3: Implementation (spawn 3 agents in one message)
Task: Implement authentication phase
Agents: coder-1, coder-2, security-specialist-1
Redis pub/sub: All coordination via cfn.loop.3.*
SQLite memory: Store results at cfn/phase-auth/loop3/results
Post-edit hook: Run after every file edit
Gate: Check if all ≥0.75 → Pass ✅

# Commit Loop 3 completion
/github-commit --chat

# Loop 2: Validation (spawn 4 validators in one message)
Task: Validate authentication phase
Validators: code-quality, security, perf, tester
Redis pub/sub: All coordination via cfn.loop.2.*
SQLite memory: Store consensus at cfn/phase-auth/loop2/consensus
Consensus: Check if avg ≥0.90 → Pass ✅

# Commit Loop 2 validation
/github-commit --chat

# Loop 4: Product Owner decision (spawn 1 agent)
Task: Make GOAP decision for authentication phase
Agent: product-owner-1
Decision: DEFER ✅
Action: Backlog enhancements, auto-transition to next phase

# Commit Loop 4 decision
/github-commit --chat

# Auto-transition to next phase (User Profile)
# Repeat Loop 1-4 for each phase...

# After sprint completes
/github-commit --full
/cfn-loop-document --sprint=user-management
```

---

## Standard Mode Best Practices

1. **Balance Quality and Velocity**:
   - Don't over-engineer (≥0.75 gate is sufficient)
   - Don't under-validate (≥0.90 consensus ensures quality)
   - Use Standard mode for most production features

2. **Agent Selection**:
   - Core team: coder, security-specialist, perf-analyzer
   - Add specialists as needed: backend-dev, api-docs, tester
   - Avoid generic redundancy (no "coder-1, coder-2, coder-3" doing same work)

3. **Redis Coordination**:
   - ALWAYS use pub/sub (Critical Rule #19)
   - Subscribe to `cfn.loop.*` for full visibility
   - Batch events (50 at a time) for efficiency

4. **SQLite Memory**:
   - ACL Level 1 (Private) for agent-specific data
   - ACL Level 3 (Swarm) for shared phase data
   - ACL Level 4 (Project) for long-term decisions (365 days)

5. **Post-Edit Hook**:
   - Run after EVERY file edit (no exceptions)
   - Use `--minimum-coverage 80` for Standard mode
   - Use `--structured` for machine-readable output

6. **Retry Strategy**:
   - Max 10 iterations per loop (Standard mode)
   - Replace failing agents (don't retry same agent)
   - Target specific issues (don't rerun entire phase)

7. **Git Commits**:
   - Commit after every loop completion
   - Use detailed metadata (agents, confidence, files)
   - Auto-trigger documentation on sprint/epic completion

8. **Decision Criteria**:
   - DEFER: Most common (approve work, backlog enhancements)
   - PROCEED: Fix critical issues before moving on
   - ESCALATE: Rare (only for critical ambiguity)

---

## Standard Mode Metrics

**Expected Performance**:
- Gate Pass Rate: 80-90% (first attempt)
- Consensus Pass Rate: 70-80% (first attempt)
- Average Iterations per Phase: 1.5 (Loop 3) + 1.3 (Loop 2)
- Phase Completion Time: 4-8 hours (depending on complexity)
- Sprint Completion Time: 2-5 days (3-5 phases)

**Quality Indicators**:
- Test Coverage: ≥80%
- Security Score: ≥0.90
- Performance Score: ≥0.85
- Code Quality Score: ≥0.90

**Red Flags**:
- >5 Loop 3 iterations (consider architecture review)
- >5 Loop 2 iterations (consider requirements clarification)
- <0.70 gate confidence (critical blocker)
- <0.80 consensus (significant quality issues)

---

## End of Standard Mode Instructions
