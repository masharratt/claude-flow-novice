# Redis Lists (LPUSH/BLPOP) Agent Coordination

**How agents coordinate and wait for each other using Redis Lists (guaranteed delivery and waiting)**

---

## Architecture

```
Main Chat (Thin Layer)
  ↓
  Single Message: Spawn coordinator + all agents
  ↓
Coordinator + Agents (All communicate via Redis)
  ↓
Redis Lists (lpush/blpop) for coordination, status, results
```

## CRITICAL: Use LPUSH + BLPOP (Not Pub/Sub)

**Redis Lists** (lpush/blpop) for agent coordination, NOT Pub/Sub (publish/subscribe)

```bash
# ✅ CORRECT: LPUSH to signal completion
redis-cli lpush "swarm:task:agent:complete" '{"status":"done","confidence":0.85}'

# ✅ CORRECT: BLPOP to wait (blocks until item available)
timeout 300 redis-cli --csv blpop "swarm:task:agent:complete" 0

# ❌ WRONG: PUBLISH doesn't work with BLPOP
redis-cli lpush "swarm:task:agent:complete" '{"status":"done"}'
```

**Why LPUSH/BLPOP?**
- **BLPOP blocks** until list item is available (perfect for waiting)
- **LPUSH adds** item to list and triggers blocked BLPOP immediately
- **Pub/Sub is real-time only** - missed if subscriber not listening
- **Lists persist** - messages stay until consumed

**Agent Pattern:**
```bash
# Agent A completes work
redis-cli lpush "swarm:task:agentA:done" '{"result":"..."}'

# Agent B waits for Agent A
result=$(timeout 300 redis-cli --csv blpop "swarm:task:agentA:done" 0)
# Blocks here until Agent A pushes to list
echo "Agent A done: $result"
```

---

## CRITICAL: BLPOP is Destructive (1:Many Dependencies)

**⚠️ Problem:** BLPOP **removes** items from the list - only ONE agent can consume each message!

```bash
# Agent A pushes one message
redis-cli lpush "swarm:task:agentA:done" '{"data":"..."}'

# Agent B pops it (message consumed, list now empty)
redis-cli blpop "swarm:task:agentA:done" 0  # ✅ Gets the message

# Agent C tries to pop (list empty - will timeout!)
redis-cli blpop "swarm:task:agentA:done" 0  # ❌ TIMEOUT - message already consumed!
```

**Solutions for 1:Many Dependencies:**

### Solution 1: Hierarchical Coordinator (Recommended)

Use coordinator to **broadcast** results to multiple dependents:

```javascript
// Hierarchical: Coordinator receives and broadcasts
Task("coordinator-hybrid", `
  Receive from researcher, broadcast to analyzer + architect.

  Use Bash tool:
  # Wait for researcher
  data=$(redis-cli --csv blpop "swarm:task:researcher:done" 0)

  # Broadcast to BOTH dependents (separate lists)
  redis-cli lpush "swarm:task:analyzer:inbox" "$data"
  redis-cli lpush "swarm:task:architect:inbox" "$data"

  echo "Coordinator broadcasted researcher results"
`, "coordinator")

Task("researcher", `
  Research patterns.

  Use Bash tool:
  redis-cli lpush "swarm:task:researcher:done" '{"findings":"..."}'
`, "researcher")

Task("analyzer", `
  Analyze research.

  Use Bash tool:
  # Read from coordinator's broadcast
  data=$(redis-cli --csv blpop "swarm:task:analyzer:inbox" 0)
  echo "Analyzer received: $data"
`, "analyst")

Task("architect", `
  Design architecture.

  Use Bash tool:
  # Read from coordinator's broadcast
  data=$(redis-cli --csv blpop "swarm:task:architect:inbox" 0)
  echo "Architect received: $data"
`, "architect")
```

**When to use:** 3+ agents, coordinator manages workflow, hierarchical topology

### Solution 2: Mesh with Hybrid LPUSH+SET (No Coordinator)

For peer-to-peer mesh: **LPUSH for first consumer, SET for additional readers**

```bash
# Agent A completes work
redis-cli lpush "swarm:task:agentA:done" '{"data":"..."}'       # For first waiter (BLPOP)
redis-cli set "swarm:task:agentA:result" '{"data":"..."}'       # For additional readers (GET)
redis-cli expire "swarm:task:agentA:result" 3600                # Cleanup after 1 hour

# Agent B (first waiter - uses BLPOP)
data=$(redis-cli --csv blpop "swarm:task:agentA:done" 0)

# Agent C (additional reader - uses GET)
data=$(redis-cli get "swarm:task:agentA:result")
```

**When to use:** 2-5 agents, peer-to-peer coordination, mesh topology, no coordinator needed

---

## Topology Decision Guide

| Scenario | Topology | Pattern | Coordinator |
|----------|----------|---------|-------------|
| **1:1 dependency** (A → B) | N/A | LPUSH/BLPOP | ❌ No |
| **Sequential chain** (A → B → C → D) | N/A | LPUSH/BLPOP | ❌ No |
| **1:Many** (A → B,C,D) | **Hierarchical** | Coordinator broadcast | ✅ Yes |
| **Many:1** (A,B,C → D) | Mesh | Hybrid LPUSH+SET | ⚠️ Optional |
| **Complex graph** (mixed dependencies) | **Hierarchical** | Coordinator orchestration | ✅ Yes |

---

## Main Chat Pattern (Single Message Spawn)

**Main chat does ONLY:**
1. Minimal investigation to determine task type
2. Select coordinator type (hierarchical/mesh)
3. Identify required agents and dependencies
4. Spawn ALL agents in single message
5. Wait for coordinator to report completion

**Example:**
```javascript
// User: "Research authentication implementation"
// Main chat thinks: "Research task → hierarchical coordinator + researcher + code-analyzer + architect"

// Single message spawn:
Task("coordinator-hybrid", `
  Orchestrate research task via Redis on channel: swarm:research:auth

  Agents spawned:
  - researcher (agent-1)
  - code-analyzer (agent-2)
  - architect (agent-3)

  Coordination:
  1. Monitor Redis channel: swarm:research:auth:*
  2. Track agent status and results
  3. Aggregate findings
  4. Report to main chat when complete
`, "coordinator")

Task("researcher", `
  Research authentication patterns.

  **Redis Coordination:**
  Channel: swarm:research:auth:researcher

  On completion:
  redis-cli lpush "swarm:research:auth:researcher:complete" '{"confidence":0.85,"findings":"..."}'
`, "researcher")

Task("code-analyzer", `
  Analyze existing auth code.

  **Redis Coordination:**
  Channel: swarm:research:auth:analyzer

  Dependencies:
  - WAIT FOR: swarm:research:auth:researcher:complete

  Pattern:
  redis-cli --csv blpop "swarm:research:auth:researcher:complete"
  # Wait for message, then proceed

  On completion:
  redis-cli lpush "swarm:research:auth:analyzer:complete" '{"confidence":0.90,"findings":"..."}'
`, "code-analyzer")

Task("architect", `
  Design auth architecture.

  **Redis Coordination:**
  Channel: swarm:research:auth:architect

  Dependencies:
  - WAIT FOR: swarm:research:auth:researcher:complete
  - WAIT FOR: swarm:research:auth:analyzer:complete

  Pattern:
  redis-cli --csv blpop "swarm:research:auth:researcher:complete"
  redis-cli --csv blpop "swarm:research:auth:analyzer:complete"
  # Wait for BOTH messages, then proceed

  On completion:
  redis-cli lpush "swarm:research:auth:architect:complete" '{"confidence":0.88,"design":"..."}'
`, "architect")
```

---

## Redis Dependency Patterns

### Pattern 1: Sequential Dependencies (A → B → C)

```javascript
// Agent B waits for Agent A
Task("coder", `
  Implement feature.

  **Dependencies:**
  - WAIT FOR: swarm:task:analyst:complete

  **Wait Pattern:**
  bash: timeout 300 redis-cli --csv blpop "swarm:task:analyst:complete" 0
  # Blocks until analyst publishes to channel

  Proceed with implementation after analyst complete.

  **On Completion:**
  redis-cli lpush "swarm:task:coder:complete" '{"status":"done","confidence":0.85}'
`, "coder")
```

### Pattern 2: Parallel Dependencies (A + B → C)

```javascript
// Validator waits for BOTH reviewer AND tester
Task("validator", `
  Validate implementation.

  **Dependencies:**
  - WAIT FOR: swarm:task:reviewer:complete
  - WAIT FOR: swarm:task:tester:complete

  **Wait Pattern (Both required):**

  # Method 1: Sequential blocking
  redis-cli --csv blpop "swarm:task:reviewer:complete" 0
  redis-cli --csv blpop "swarm:task:tester:complete" 0

  # Method 2: Check both available
  while [ -z "$(redis-cli get swarm:task:reviewer:status)" ] || [ -z "$(redis-cli get swarm:task:tester:status)" ]; do
    sleep 2
  done

  Proceed with validation after BOTH complete.

  **On Completion:**
  redis-cli lpush "swarm:task:validator:complete" '{"status":"validated","confidence":0.92}'
`, "validator")
```

### Pattern 3: Optional Dependencies (A → B if A succeeds)

```javascript
// Security specialist only runs if code-analyzer finds issues
Task("security-specialist", `
  Review security issues.

  **Conditional Dependency:**
  - WAIT FOR: swarm:task:analyzer:complete
  - CHECK: If analyzer.issues > 0, proceed. Else skip.

  **Wait Pattern:**
  result=$(redis-cli --csv blpop "swarm:task:analyzer:complete" 0 | jq -r '.issues')

  if [ "$result" -gt 0 ]; then
    echo "Issues found, proceeding with security review..."
    # Do security work
  else
    echo "No issues found, skipping security review"
    redis-cli lpush "swarm:task:security:complete" '{"status":"skipped"}'
    exit 0
  fi
`, "security-specialist")
```

---

## Coordinator Orchestration Patterns

### Pattern 1: Sequential Workflow

```javascript
Task("coordinator-hybrid", `
  Coordinate security fix workflow.

  **Agents:**
  1. code-analyzer (parallel: security-specialist)
  2. coder (waits for analyzer + security)
  3. reviewer (waits for coder)
  4. validator (waits for reviewer)

  **Orchestration via Redis:**

  1. Monitor all agent channels:
     redis-cli psubscribe "swarm:task:*:complete"

  2. Track completion state:
     {
       "analyzer": false,
       "security": false,
       "coder": false,
       "reviewer": false,
       "validator": false
     }

  3. Update state on each message:
     - swarm:task:analyzer:complete → analyzer: true
     - swarm:task:security:complete → security: true
     - etc.

  4. Report to main chat when ALL complete:
     "All agents complete. Security issue resolved. Confidence: 0.88"
`, "coordinator")
```

### Pattern 2: Parallel + Aggregation

```javascript
Task("coordinator-hybrid", `
  Coordinate research with parallel agents.

  **Agents:**
  - researcher (parallel)
  - code-analyzer (parallel)
  - perf-analyzer (parallel)
  - architect (waits for all 3)

  **Redis Orchestration:**

  # Subscribe to all completion events
  redis-cli psubscribe "swarm:research:*:complete"

  # Track parallel completion
  completed=0
  required=3  # researcher, code-analyzer, perf-analyzer

  while [ $completed -lt $required ]; do
    # Wait for any completion
    message=$(redis-cli --csv blpop "swarm:research:completions" 0)
    completed=$((completed + 1))
  done

  # Signal architect to proceed
  redis-cli lpush "swarm:research:prereqs:complete" '{"ready":true}'

  # Wait for architect
  redis-cli --csv blpop "swarm:research:architect:complete" 0

  # Aggregate and report
  "Research complete. Architecture designed. Confidence: 0.90"
`, "coordinator")
```

---

## Agent Self-Coordination (No Coordinator)

For simple tasks, agents can coordinate peer-to-peer:

```javascript
// Simple 2-agent workflow
Task("analyst", `
  Analyze requirements.

  On completion:
  redis-cli lpush "swarm:task:analyst:done" '{"findings":"..."}}'
`, "analyst")

Task("coder", `
  Implement solution.

  Wait for analyst:
  redis-cli --csv blpop "swarm:task:analyst:done" 0

  Read findings and implement.
`, "coder")
```

---

## Redis Channel Naming Convention

```
swarm:{task-id}:{agent-role}:{event-type}

Examples:
- swarm:auth:researcher:complete
- swarm:auth:coder:progress
- swarm:auth:validator:result
- swarm:auth:coordinator:status

Coordinator channels:
- swarm:{task-id}:coordinator:status
- swarm:{task-id}:prereqs:complete
- swarm:{task-id}:all:complete
```

---

## Timeout Patterns

All blocking operations should have timeouts:

```bash
# Timeout after 5 minutes
timeout 300 redis-cli --csv blpop "swarm:task:agent:complete" 0

# Handle timeout
if [ $? -eq 124 ]; then
  echo "TIMEOUT: Agent did not complete within 5 minutes"
  redis-cli lpush "swarm:task:coordinator:error" '{"agent":"X","error":"timeout"}'
fi
```

---

## Status Reporting Pattern

Agents should report periodic status:

```bash
# While working, report progress every 30s
while working; do
  redis-cli lpush "swarm:task:coder:status" '{"progress":0.5,"message":"Implementing auth..."}'
  sleep 30
done

# On completion
redis-cli lpush "swarm:task:coder:complete" '{"confidence":0.85,"files":["auth.js"]}'
```

---

## Main Chat Summary Pattern

After spawning agents, main chat waits for coordinator summary:

```javascript
// Main chat after spawning all agents:
"Coordinator and agents spawned. Monitoring Redis channel: swarm:task:coordinator:summary"

// Coordinator reports when done:
redis-cli lpush "swarm:task:coordinator:summary" '{
  "status": "complete",
  "agents": {
    "researcher": {"confidence": 0.85},
    "code-analyzer": {"confidence": 0.90},
    "architect": {"confidence": 0.88}
  },
  "result": "Authentication system researched and designed"
}'
```

---

## Key Benefits

1. **Async Coordination**: Agents work independently, coordinate via Redis
2. **Dependency Management**: Explicit wait patterns prevent race conditions
3. **Timeout Safety**: All blocking ops have timeouts
4. **Progress Tracking**: Coordinator monitors all agents in real-time
5. **Main Chat Simplicity**: Just spawn + wait, no orchestration logic
6. **Works in Both Modes**: CLI spawning (cost-savings) and Task spawning use same Redis patterns
