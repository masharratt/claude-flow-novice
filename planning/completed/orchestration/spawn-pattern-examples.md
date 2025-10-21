# Main Chat Spawn Pattern Examples

**How main chat spawns coordinator + agents in single message for different task types.**

---

## Pattern: Research Task

**User Request:** "Research authentication implementation options"

**Main Chat Thinks:**
- Task type: Research
- Topology: Hierarchical (coordinator + 3 specialists)
- Agents needed: researcher, code-analyzer, architect
- Dependencies: researcher + analyzer → architect

**Single Message Spawn:**

```javascript
// Initialize swarm first
executeSwarm({
  swarmId: "research-auth-001",
  objective: "Research authentication implementation",
  strategy: "research",
  mode: "hierarchical",
  persistence: true
})

// Spawn ALL agents in single message
Task("coordinator-hybrid", `
  Coordinate authentication research via Redis.

  **Redis Channel:** swarm:research-auth:coordinator

  **Agents Spawned:**
  - researcher (agent-1)
  - code-analyzer (agent-2)
  - architect (agent-3)

  **Orchestration:**
  1. Monitor: swarm:research-auth:*:complete
  2. Track agent completion status
  3. Aggregate findings when all complete
  4. Report summary to main chat

  **Expected Flow:**
  researcher + code-analyzer (parallel) → architect → summary
`, "coordinator")

Task("researcher", `
  Research authentication patterns (OAuth, JWT, sessions).

  Use Bash tool:
  redis-cli lpush "swarm:research-auth:researcher:done" '{
    "confidence": 0.85,
    "findings": "JWT most suitable for stateless API...",
    "timestamp": "'$(date +%s)'"
  }'
`, "researcher")

Task("code-analyzer", `
  Analyze existing authentication code in codebase.

  Use Bash tool:
  # Read from coordinator's broadcast
  data=$(redis-cli --csv blpop "swarm:research-auth:analyzer:inbox" 0)
  echo "Analyzing: $data"

  redis-cli lpush "swarm:research-auth:analyzer:done" '{
    "confidence": 0.90,
    "patterns": ["Session-based in /src/auth", "No JWT implementation"],
    "timestamp": "'$(date +%s)'"
  }'
`, "code-analyzer")

Task("architect", `
  Design authentication architecture based on research.

  Use Bash tool:
  # Read from coordinator's broadcast
  researcher_data=$(redis-cli --csv blpop "swarm:research-auth:architect:inbox" 0)
  echo "Architect received researcher data: $researcher_data"

  redis-cli lpush "swarm:research-auth:architect:done" '{
    "confidence": 0.88,
    "design": "Hybrid approach: JWT for API, sessions for web...",
    "timestamp": "'$(date +%s)'"
  }'
`, "architect")

Task("coordinator-hybrid", `
  Coordinate research task via Redis.

  Use Bash tool:
  # Wait for researcher to complete
  data=$(redis-cli --csv blpop "swarm:research-auth:researcher:done" 0)

  # Broadcast to BOTH dependents (analyzer + architect)
  redis-cli lpush "swarm:research-auth:analyzer:inbox" "$data"
  redis-cli lpush "swarm:research-auth:architect:inbox" "$data"

  # Wait for both dependents to complete
  timeout 300 redis-cli --csv blpop "swarm:research-auth:analyzer:done" 0
  timeout 300 redis-cli --csv blpop "swarm:research-auth:architect:done" 0

  # Publish final summary
  redis-cli lpush "swarm:research-auth:coordinator:summary" '{
    "status": "complete",
    "confidence": 0.88,
    "agents": {
      "researcher": {"confidence": 0.85},
      "code-analyzer": {"confidence": 0.90},
      "architect": {"confidence": 0.88}
    },
    "result": "Authentication research and architecture design complete",
    "timestamp": "'$(date +%s)'"
  }'
`, "coordinator")

// Main chat done - coordinator handles everything from here
```

---

## Pattern: Security Fix

**User Request:** "Fix the SQL injection vulnerability in user.js"

**Main Chat Thinks:**
- Task type: Security fix
- Topology: Hierarchical (coordinator + 4 agents)
- Agents needed: code-analyzer, coder, reviewer, validator
- Dependencies: analyzer → coder → reviewer → validator

**Single Message Spawn:**

```javascript
executeSwarm({
  swarmId: "security-fix-001",
  objective: "Fix SQL injection in user.js",
  strategy: "development",
  mode: "hierarchical",
  persistence: true
})

Task("coordinator-hybrid", `
  Coordinate security fix workflow via Redis.

  **Redis Channel:** swarm:security-fix:coordinator

  **Agents Spawned:**
  - code-analyzer (agent-1) → identifies vulnerability
  - coder (agent-2) → implements fix
  - reviewer (agent-3) → reviews fix
  - validator (agent-4) → validates security

  **Sequential Flow:**
  analyzer → coder → reviewer → validator

  Monitor completion and report when validator approves.
`, "coordinator")

Task("code-analyzer", `
  Analyze user.js for SQL injection vulnerability.

  **Redis Channel:** swarm:security-fix:analyzer

  Identify exact lines with vulnerability and provide fix recommendations.

  **On Completion:**
  redis-cli publish "swarm:security-fix:analyzer:complete" '{
    "confidence": 0.95,
    "vulnerability": "Line 42: raw SQL concatenation",
    "recommendation": "Use parameterized queries"
  }'
`, "code-analyzer")

Task("coder", `
  Implement SQL injection fix in user.js.

  **Redis Channel:** swarm:security-fix:coder

  **Dependencies:**
  timeout 300 redis-cli --csv blpop "swarm:security-fix:analyzer:complete" 0

  Read analyzer findings, implement parameterized query fix.

  **Post-Edit Hook (MANDATORY):**
  node config/hooks/post-edit-pipeline.js "src/user.js" --memory-key "swarm/security-fix/coder"

  **On Completion:**
  redis-cli publish "swarm:security-fix:coder:complete" '{
    "confidence": 0.85,
    "files": ["src/user.js"],
    "changes": "Replaced concatenation with parameterized query"
  }'
`, "coder")

Task("reviewer", `
  Review security fix implementation.

  **Redis Channel:** swarm:security-fix:reviewer

  **Dependencies:**
  timeout 300 redis-cli --csv blpop "swarm:security-fix:coder:complete" 0

  Read coder's changes, verify fix is correct and secure.

  **On Completion:**
  redis-cli publish "swarm:security-fix:reviewer:complete" '{
    "confidence": 0.90,
    "approved": true,
    "findings": "Fix correct, no additional issues"
  }'
`, "reviewer")

Task("validator", `
  Validate security fix end-to-end.

  **Redis Channel:** swarm:security-fix:validator

  **Dependencies:**
  timeout 300 redis-cli --csv blpop "swarm:security-fix:reviewer:complete" 0

  Run security tests, verify vulnerability is fixed.

  **On Completion:**
  redis-cli publish "swarm:security-fix:validator:complete" '{
    "confidence": 0.92,
    "validated": true,
    "tests": "SQL injection tests pass"
  }'
`, "validator")
```

---

## Pattern: Feature Implementation

**User Request:** "Implement user profile editing feature"

**Main Chat Thinks:**
- Task type: Feature implementation
- Topology: Mesh (coordinator + 5 agents, some parallel)
- Agents needed: analyst, architect, backend-dev, frontend-dev, tester
- Dependencies: analyst → architect → (backend + frontend parallel) → tester

**Single Message Spawn:**

```javascript
executeSwarm({
  swarmId: "feature-profile-edit",
  objective: "Implement user profile editing",
  strategy: "development",
  mode: "mesh",
  persistence: true
})

Task("coordinator-hybrid", `
  Coordinate profile editing feature via Redis.

  **Redis Channel:** swarm:profile-edit:coordinator

  **Agents:** analyst → architect → (backend-dev || frontend-dev) → tester

  **Parallel Phase:**
  - backend-dev and frontend-dev work in parallel after architect
  - tester waits for BOTH to complete

  Monitor and aggregate results.
`, "coordinator")

Task("analyst", `
  Analyze requirements for profile editing feature.

  **On Completion:**
  redis-cli publish "swarm:profile-edit:analyst:complete" '{
    "requirements": ["Edit name, email, avatar", "Validation rules", "Save button"]
  }'
`, "analyst")

Task("architect", `
  Design profile editing architecture.

  **Dependencies:**
  timeout 300 redis-cli --csv blpop "swarm:profile-edit:analyst:complete" 0

  Design API endpoints, database schema changes, frontend components.

  **On Completion:**
  redis-cli publish "swarm:profile-edit:architect:complete" '{
    "api": "PUT /api/users/:id/profile",
    "schema": "Add updated_at timestamp",
    "components": "ProfileEditForm component"
  }'
`, "architect")

Task("backend-dev", `
  Implement profile editing API.

  **Dependencies:**
  timeout 300 redis-cli --csv blpop "swarm:profile-edit:architect:complete" 0

  Implement PUT /api/users/:id/profile with validation.

  **Post-Edit Hook:**
  node config/hooks/post-edit-pipeline.js "src/api/users.js" --memory-key "swarm/profile-edit/backend"

  **On Completion:**
  redis-cli publish "swarm:profile-edit:backend:complete" '{"confidence": 0.85}'
`, "backend-dev")

Task("mobile-dev", `
  Implement profile editing UI.

  **Dependencies:**
  timeout 300 redis-cli --csv blpop "swarm:profile-edit:architect:complete" 0

  Build ProfileEditForm component with validation.

  **Post-Edit Hook:**
  node config/hooks/post-edit-pipeline.js "src/components/ProfileEditForm.jsx" --memory-key "swarm/profile-edit/frontend"

  **On Completion:**
  redis-cli publish "swarm:profile-edit:frontend:complete" '{"confidence": 0.88}'
`, "mobile-dev")

Task("tester", `
  Test profile editing feature end-to-end.

  **Dependencies (WAIT FOR BOTH):**
  timeout 300 redis-cli --csv blpop "swarm:profile-edit:backend:complete" 0
  timeout 300 redis-cli --csv blpop "swarm:profile-edit:frontend:complete" 0

  Run integration tests, verify feature works end-to-end.

  **On Completion:**
  redis-cli publish "swarm:profile-edit:tester:complete" '{
    "confidence": 0.90,
    "tests": "All profile edit tests pass"
  }'
`, "tester")
```

---

## Pattern: Performance Optimization

**User Request:** "Optimize the dashboard query performance"

**Main Chat Thinks:**
- Task type: Performance optimization
- Topology: Hierarchical (coordinator + 4 agents)
- Agents needed: perf-analyzer, code-analyzer, coder, tester
- Dependencies: (perf-analyzer + code-analyzer parallel) → coder → tester

**Single Message Spawn:**

```javascript
executeSwarm({
  swarmId: "perf-dashboard",
  objective: "Optimize dashboard query performance",
  strategy: "optimization",
  mode: "hierarchical",
  persistence: true
})

Task("coordinator-hybrid", `
  Coordinate performance optimization via Redis.

  **Agents:** (perf-analyzer || code-analyzer) → coder → tester

  Monitor and report when optimization complete.
`, "coordinator")

Task("perf-analyzer", `
  Profile dashboard query performance.

  Identify slow queries, bottlenecks, N+1 problems.

  **On Completion:**
  redis-cli publish "swarm:perf-dashboard:perf-analyzer:complete" '{
    "bottlenecks": ["N+1 query in getUserData", "Missing index on user_id"]
  }'
`, "perf-analyzer")

Task("code-analyzer", `
  Analyze dashboard query code structure.

  Identify optimization opportunities in code.

  **On Completion:**
  redis-cli publish "swarm:perf-dashboard:code-analyzer:complete" '{
    "opportunities": ["Eager loading", "Query batching", "Add index"]
  }'
`, "code-analyzer")

Task("coder", `
  Implement performance optimizations.

  **Dependencies (WAIT FOR BOTH):**
  timeout 300 redis-cli --csv blpop "swarm:perf-dashboard:perf-analyzer:complete" 0
  timeout 300 redis-cli --csv blpop "swarm:perf-dashboard:code-analyzer:complete" 0

  Implement eager loading, add database index, batch queries.

  **Post-Edit Hook:**
  node config/hooks/post-edit-pipeline.js "src/dashboard/queries.js" --memory-key "swarm/perf-dashboard/coder"

  **On Completion:**
  redis-cli publish "swarm:perf-dashboard:coder:complete" '{"confidence": 0.85}'
`, "coder")

Task("tester", `
  Validate performance improvements.

  **Dependencies:**
  timeout 300 redis-cli --csv blpop "swarm:perf-dashboard:coder:complete" 0

  Run performance benchmarks, verify query time reduced.

  **On Completion:**
  redis-cli publish "swarm:perf-dashboard:tester:complete" '{
    "confidence": 0.90,
    "improvement": "Query time reduced from 2.5s to 0.3s"
  }'
`, "tester")
```

---

## Key Patterns Summary

| Task Type | Topology | Agents | Dependencies |
|-----------|----------|--------|--------------|
| **Research** | Hierarchical | researcher, code-analyzer, architect | (researcher + analyzer) → architect |
| **Security Fix** | Hierarchical | analyzer, coder, reviewer, validator | analyzer → coder → reviewer → validator |
| **Feature** | Mesh | analyst, architect, backend, frontend, tester | analyst → architect → (backend \|\| frontend) → tester |
| **Optimization** | Hierarchical | perf-analyzer, code-analyzer, coder, tester | (perf + code) → coder → tester |

---

## Main Chat Responsibilities

**DO:**
✅ Minimal investigation to determine task type
✅ Select appropriate coordinator and topology
✅ Identify required agents and their dependencies
✅ Spawn ALL agents in single message with Redis coordination
✅ Wait for coordinator to report completion

**DON'T:**
❌ Orchestrate agents directly
❌ Spawn agents across multiple messages
❌ Handle agent coordination logic
❌ Monitor individual agent progress (coordinator does this)

---

## Coordinator Responsibilities

**DO:**
✅ Monitor all agent Redis channels
✅ Track agent completion status
✅ Handle errors and timeouts
✅ Aggregate results from all agents
✅ Report summary to main chat when complete

---

## Agent Responsibilities

**DO:**
✅ Declare Redis channel for status/completion
✅ Declare dependencies (which agents to wait for)
✅ Block on Redis channels until dependencies complete
✅ Publish completion message when done
✅ Include confidence score in completion message

**Example Agent Prompt Template:**

```javascript
Task("agent-role", `
  [Task description]

  **Redis Channel:** swarm:task-id:agent-role

  **Dependencies:**
  [If any dependencies:]
  timeout 300 redis-cli --csv blpop "swarm:task-id:other-agent:complete" 0

  [Task implementation]

  **On Completion:**
  redis-cli publish "swarm:task-id:agent-role:complete" '{
    "confidence": 0.XX,
    "result": "..."
  }'
`, "agent-role")
```
