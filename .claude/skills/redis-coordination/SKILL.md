# Redis Coordination Skill

**Autonomous pattern selection for multi-agent coordination using Redis Lists (LPUSH/BLPOP)**

---

## Overview

This skill enables Claude to autonomously select the correct Redis coordination pattern based on agent count and dependency structure. Replaces pub/sub with Redis Lists for guaranteed message delivery and blocking waits.

**Core Principle:** LPUSH to signal completion, BLPOP to wait for dependencies.

---

## Pattern Selection Logic

Claude autonomously selects coordination pattern based on:

| Agent Count | Dependencies | Pattern | Coordinator Required |
|-------------|--------------|---------|---------------------|
| 2 agents | Sequential (A → B) | **Simple Chain** | ❌ No |
| 2-5 agents | Linear chain (A → B → C) | **Sequential Chain** | ❌ No |
| 3+ agents | 1:Many (A → B,C,D) | **Hierarchical Broadcast** | ✅ Yes |
| 3+ agents | Many:1 (A,B,C → D) | **Mesh Hybrid** | ⚠️ Optional |
| 5+ agents | Complex graph | **Hierarchical Orchestration** | ✅ Yes (coordinator-hybrid) |

---

## Pattern 1: Simple Chain (2 Agents)

**Use Case:** Agent B waits for Agent A to complete before starting.

**Redis Pattern:**
```bash
# Agent A completes work
redis-cli lpush "swarm:task:agentA:done" '{"confidence":0.85,"result":"..."}'

# Agent B blocks until Agent A done
result=$(timeout 300 redis-cli --csv blpop "swarm:task:agentA:done" 0)
# Continues only after Agent A pushes to list
```

**When to Use:**
- 2 agents only
- Agent B depends on Agent A output
- No coordinator needed

**Example:** analyst → coder

---

## Pattern 2: Hierarchical Broadcast (1:Many Dependencies)

**Use Case:** One agent's output feeds multiple downstream agents.

**Problem:** BLPOP is destructive - only ONE agent can consume each message!

**Solution:** Coordinator receives result and broadcasts to multiple agents via separate lists.

**Redis Pattern:**
```bash
# Step 1: Researcher completes
redis-cli lpush "swarm:task:researcher:done" '{"findings":"..."}'

# Step 2: Coordinator receives and broadcasts
data=$(redis-cli --csv blpop "swarm:task:researcher:done" 0)
redis-cli lpush "swarm:task:analyzer:inbox" "$data"
redis-cli lpush "swarm:task:architect:inbox" "$data"

# Step 3: Multiple agents read from their dedicated inboxes
# Analyzer
result=$(redis-cli --csv blpop "swarm:task:analyzer:inbox" 0)

# Architect (receives same data)
result=$(redis-cli --csv blpop "swarm:task:architect:inbox" 0)
```

**When to Use:**
- 3+ agents
- One agent's output needed by 2+ downstream agents
- Hierarchical topology (coordinator required)

**Example:** researcher → [analyzer, architect, coder]

**Script:** See `examples/hierarchical-pattern.sh`

---

## Pattern 3: Mesh Hybrid (Many:1 Dependencies)

**Use Case:** Multiple agents complete independently, one agent waits for ALL.

**Redis Pattern:**
```bash
# Agents A, B, C complete independently
redis-cli lpush "swarm:task:agentA:done" '{"data":"..."}'
redis-cli set "swarm:task:agentA:result" '{"data":"..."}'  # Persistent copy
redis-cli expire "swarm:task:agentA:result" 3600

redis-cli lpush "swarm:task:agentB:done" '{"data":"..."}'
redis-cli set "swarm:task:agentB:result" '{"data":"..."}'
redis-cli expire "swarm:task:agentB:result" 3600

redis-cli lpush "swarm:task:agentC:done" '{"data":"..."}'
redis-cli set "swarm:task:agentC:result" '{"data":"..."}'
redis-cli expire "swarm:task:agentC:result" 3600

# Agent D waits for ALL (first uses BLPOP, rest use GET)
redis-cli --csv blpop "swarm:task:agentA:done" 0
dataB=$(redis-cli get "swarm:task:agentB:result")
dataC=$(redis-cli get "swarm:task:agentC:result")
```

**When to Use:**
- 2-5 agents
- Multiple agents complete independently
- One agent aggregates results
- Peer-to-peer coordination (mesh topology)

**Example:** [coder, tester, reviewer] → validator

**Script:** See `examples/mesh-pattern.sh`

---

## Timeout Handling (Mandatory)

All BLPOP operations MUST have timeouts to prevent infinite blocking.

**Redis Pattern:**
```bash
# Timeout after 5 minutes (300 seconds)
result=$(timeout 300 redis-cli --csv blpop "swarm:task:agent:done" 0)

# Check timeout status
if [ $? -eq 124 ]; then
  echo "ERROR: Agent timeout after 5 minutes"
  redis-cli lpush "swarm:task:coordinator:error" '{"agent":"X","error":"timeout"}'
  exit 1
fi
```

**Timeout Guidelines:**
- Default: 300s (5 minutes) for normal operations
- Research tasks: 600s (10 minutes)
- Complex builds: 900s (15 minutes)
- Always report timeout errors to coordinator

**Script:** See `examples/timeout-handling.sh`

---

## Channel Naming Convention

**Format:** `swarm:{task-id}:{agent-role}:{event-type}`

**Examples:**
```
swarm:auth:researcher:done          # Agent completion
swarm:auth:coder:progress           # Progress updates
swarm:auth:validator:result         # Final results
swarm:auth:coordinator:status       # Coordinator status
swarm:auth:analyzer:inbox           # Broadcast inbox (hierarchical)
```

**Special Channels:**
```
swarm:{task-id}:prereqs:complete    # All prerequisites met
swarm:{task-id}:coordinator:summary # Final summary for main chat
swarm:{task-id}:coordinator:error   # Error reporting
```

---

## Autonomous Pattern Selection (Claude Logic)

When user requests multi-agent work, Claude analyzes:

```
1. Count agents required
2. Identify dependencies between agents
3. Determine if 1:Many, Many:1, or complex graph
4. Select pattern:
   - 2 agents, sequential → Simple Chain
   - 3-5 agents, linear → Sequential Chain
   - 3+ agents, 1:Many → Hierarchical Broadcast (spawn coordinator)
   - 3+ agents, Many:1 → Mesh Hybrid
   - 5+ agents, complex → Hierarchical Orchestration (coordinator-hybrid)
```

**Decision Tree:**
```
Agent Count?
├─ 2 → Simple Chain (no coordinator)
├─ 3-5 → Check dependencies
│   ├─ 1:Many → Hierarchical Broadcast (coordinator)
│   ├─ Many:1 → Mesh Hybrid (optional coordinator)
│   └─ Sequential → Sequential Chain (no coordinator)
└─ 6+ → Hierarchical Orchestration (coordinator-hybrid required)
```

---

## Status Reporting Pattern

Agents report progress periodically while working:

```bash
# During work (every 30-60s)
redis-cli lpush "swarm:task:coder:status" '{
  "progress": 0.5,
  "message": "Implementing authentication logic",
  "confidence": 0.75
}'

# On completion
redis-cli lpush "swarm:task:coder:done" '{
  "confidence": 0.88,
  "filesModified": ["auth.js", "auth.test.js"],
  "testsWritten": 12,
  "testsPassing": 12
}'
```

---

## Coordinator Summary Pattern

Coordinator aggregates all agent results and reports to main chat:

```bash
# Coordinator collects all agent results
redis-cli --csv blpop "swarm:task:researcher:done" 0
redis-cli --csv blpop "swarm:task:analyzer:done" 0
redis-cli --csv blpop "swarm:task:architect:done" 0

# Aggregate and report
redis-cli lpush "swarm:task:coordinator:summary" '{
  "status": "complete",
  "agents": {
    "researcher": {"confidence": 0.85, "findings": "..."},
    "analyzer": {"confidence": 0.90, "issues": 2},
    "architect": {"confidence": 0.88, "design": "..."}
  },
  "aggregateConfidence": 0.88,
  "result": "Authentication system researched, analyzed, and designed"
}'
```

---

## Error Handling Pattern

Agents report errors to coordinator via dedicated error channel:

```bash
# Agent encounters error
redis-cli lpush "swarm:task:coordinator:error" '{
  "agent": "coder",
  "error": "Test failure in auth.test.js",
  "confidence": 0.45,
  "blockers": ["Unit test failing: login with invalid credentials"]
}'

# Coordinator monitors error channel
redis-cli --csv blpop "swarm:task:coordinator:error" 0

# Coordinator decides:
# - If recoverable: spawn fix agent
# - If critical: report to main chat
```

---

## Integration with CFN Loop

Redis coordination enables CFN Loop consensus calculation:

```bash
# Each validator reports confidence via Redis
redis-cli lpush "swarm:cfn:validator-1:result" '{"confidence":0.85}'
redis-cli lpush "swarm:cfn:validator-2:result" '{"confidence":0.90}'
redis-cli lpush "swarm:cfn:validator-3:result" '{"confidence":0.78}'
redis-cli lpush "swarm:cfn:validator-4:result" '{"confidence":0.92}'

# Coordinator calculates consensus
results=$(redis-cli lrange "swarm:cfn:validator-*:result" 0 -1)
consensus=$(echo "$results" | jq '[.[] | .confidence] | add / length')

# Apply CFN Loop decision logic
if (( $(echo "$consensus >= 0.90" | bc -l) )); then
  echo "PROCEED: Consensus $consensus >= threshold 0.90"
elif [ $iteration -lt $maxIterations ]; then
  echo "LOOP: Consensus $consensus < 0.90, iteration $iteration/$maxIterations"
  # Relaunch agents immediately (no permission needed)
else
  echo "ESCALATE: Max iterations reached"
fi
```

---

## Quick Reference

**Wait for single agent:**
```bash
timeout 300 redis-cli --csv blpop "swarm:task:agent:done" 0
```

**Wait for multiple agents (sequential):**
```bash
timeout 300 redis-cli --csv blpop "swarm:task:agentA:done" 0
timeout 300 redis-cli --csv blpop "swarm:task:agentB:done" 0
```

**Broadcast to multiple agents (coordinator):**
```bash
data=$(redis-cli --csv blpop "swarm:task:source:done" 0)
redis-cli lpush "swarm:task:dest1:inbox" "$data"
redis-cli lpush "swarm:task:dest2:inbox" "$data"
```

**Report completion:**
```bash
redis-cli lpush "swarm:task:agent:done" '{"confidence":0.85,"result":"..."}'
```

**Report error:**
```bash
redis-cli lpush "swarm:task:coordinator:error" '{"agent":"X","error":"..."}'
```

---

## Examples

See `examples/` directory:
- `hierarchical-pattern.sh` - 1:Many broadcast coordination
- `mesh-pattern.sh` - Many:1 aggregation coordination
- `timeout-handling.sh` - Comprehensive timeout handling

---

## Benefits

1. **Guaranteed Delivery:** Messages persist in lists until consumed
2. **Blocking Waits:** BLPOP blocks until dependency ready
3. **Autonomous Selection:** Claude picks pattern based on agent count/dependencies
4. **Timeout Safety:** All operations have timeout protection
5. **Error Recovery:** Dedicated error reporting channel
6. **CFN Loop Integration:** Enables consensus-driven iteration
7. **No Missed Messages:** Unlike pub/sub, lists persist messages