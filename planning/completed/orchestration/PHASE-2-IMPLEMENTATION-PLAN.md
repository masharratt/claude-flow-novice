# Phase 2: CLI Integration - Implementation Plan

**Epic:** Redis Agent Coordination
**Phase:** 2 of 6
**Status:** 🟡 READY TO START
**Duration:** 4-6 days
**Dependencies:** ✅ Phase 1 Complete (Templates & Coordinators validated)

---

## Objective

Modify `spawn-workers.js` to auto-inject Redis coordination instructions using validated patterns from Phase 0/1.

---

## Validated Patterns from Phase 0

1. **Sequential** (default) - Simple, proven, current behavior
2. **Bidirectional** (✅ validated 2025-10-17) - Iterative feedback loops, 50%+ cost savings
3. **Collaborative Waiting** (✅ validated 2025-10-17) - Q&A mode, graceful shutdown
4. **Release Gate** (✅ validated 2025-10-17) - Barrier synchronization, coordinated exit

---

## Deliverables

### Deliverable 1: Add --topology Flag

**File:** `src/cli/hybrid-routing/spawn-workers.js`

**Changes:**
```javascript
// Parse topology flag (lines ~1270-1280)
const topology = parseArg(args, 'topology', 'sequential');

// Validate topology
const validTopologies = ['sequential', 'bidirectional', 'collaborative', 'release-gate'];
if (!validTopologies.includes(topology)) {
  throw new Error(`Invalid topology: ${topology}. Valid: ${validTopologies.join(', ')}`);
}

// Add to HybridWorkerSpawner options
this.topology = options.topology || 'sequential';
```

**Acceptance Criteria:**
- ✅ --topology flag parses correctly
- ✅ Validates against 4 allowed patterns
- ✅ Defaults to 'sequential' if not specified
- ✅ --help shows topology options

---

### Deliverable 2: Add --dependencies Flag

**File:** `src/cli/hybrid-routing/spawn-workers.js`

**Changes:**
```javascript
// Parse dependencies flag (lines ~1270-1280)
const dependenciesArg = parseArg(args, 'dependencies');
const dependencies = dependenciesArg ? parseDependencyGraph(dependenciesArg) : null;

function parseDependencyGraph(depString) {
  // Format: "producer:consumer1,consumer2|agent1:agent2"
  // Example: "architect:coder,tester"
  const edges = depString.split('|');
  const graph = { edges: [], nodes: new Set() };

  for (const edge of edges) {
    const [from, toList] = edge.split(':');
    const toNodes = toList.split(',');

    graph.nodes.add(from);
    toNodes.forEach(to => {
      graph.nodes.add(to);
      graph.edges.push({ from, to });
    });
  }

  return graph;
}
```

**Acceptance Criteria:**
- ✅ --dependencies parses dependency graph
- ✅ Validates graph structure
- ✅ Supports multiple dependency edges
- ✅ --help shows dependency format examples

---

### Deliverable 3: Inject Redis Coordination Instructions

**File:** `src/cli/hybrid-routing/spawn-workers.js`

**Changes:** Modify `spawnWorker()` method (lines 370-444) to inject explicit bash examples

**Critical Learning from Phase 0:**
> Task-spawned agents CAN execute bash correctly, but ONLY when given explicit, step-by-step command examples (not pattern descriptions).

**Example Injection:**
```javascript
// Generate topology-specific system prompt addition
generateTopologyInstructions(topology, workerId, agentType) {
  switch(topology) {
    case 'bidirectional':
      return `
## Redis Bidirectional Coordination

You are in a bidirectional feedback loop with a reviewer agent.

**CRITICAL: Use Bash tool for ALL redis-cli commands. Execute exactly as shown.**

### Iteration Loop (max 3 iterations)

**Step 1: Complete Your Work**
After finishing your task, send work to reviewer via bash:
\`\`\`bash
redis-cli lpush "swarm:bidirectional:${agentType}:done" '{"content":"your work","confidence":0.85,"iteration":1}'
\`\`\`

**Step 2: Wait for Reviewer Feedback**
Wait for feedback (30 second timeout) via bash:
\`\`\`bash
timeout 30 redis-cli --csv blpop "swarm:bidirectional:${agentType}:feedback" 0
\`\`\`

**Step 3: Parse Feedback**
Parse CSV format: "channel","json_data"
Extract JSON from second column (remove quotes)

**Step 4: Check Decision**
If status = "approved": Exit with success
If status = "needs_fixes": Improve work and repeat Step 1

**Example Workflow:**
\`\`\`bash
# Iteration 1: Send initial work
redis-cli lpush "swarm:bidirectional:coder:done" '{"content":"code","confidence":0.65}'

# Wait for feedback
feedback=$(timeout 30 redis-cli --csv blpop "swarm:bidirectional:coder:feedback" 0)

# Parse (CSV format: "channel","json_data")
# If needs_fixes, improve and resend

# Iteration 2: Send improved work
redis-cli lpush "swarm:bidirectional:coder:done" '{"content":"improved code","confidence":0.85}'

# Wait for approval
redis-cli --csv blpop "swarm:bidirectional:coder:feedback" 0
\`\`\`
`;

    case 'collaborative':
      return `
## Redis Collaborative Waiting State

You will complete your primary work, then enter Q&A mode to answer team questions.

**CRITICAL: Use Bash tool for ALL redis-cli commands. Execute exactly as shown.**

### Phase 1: Complete Primary Work

After finishing, signal completion via bash:
\`\`\`bash
redis-cli set "swarm:collab:${agentType}:status" "work_complete"
redis-cli incr "swarm:collab:agents_done"
\`\`\`

### Phase 2: Q&A Waiting Loop (60 seconds max)

Check for questions from team members via bash:
\`\`\`bash
# Check if all agents done (exit if true)
all_done=$(redis-cli get "swarm:collab:all_done")
if [ "$all_done" = "true" ]; then
  exit 0
fi

# Wait for question (5 second timeout)
question=$(timeout 5 redis-cli --csv blpop "swarm:collab:${agentType}:questions" 0)

# If question received, parse and answer
# Send answer via:
redis-cli lpush "swarm:collab:REQUESTER:answers" '{"answer":"your answer"}'
\`\`\`

### Phase 3: Exit When All Done

When coordinator sets all_done flag, exit gracefully:
\`\`\`bash
redis-cli set "swarm:collab:${agentType}:status" "complete"
\`\`\`
`;

    case 'release-gate':
      return `
## Redis Release Gate (Barrier Synchronization)

All agents must reach the barrier before anyone can exit. Coordinator releases all simultaneously.

**CRITICAL: Use Bash tool for ALL redis-cli commands. Execute exactly as shown.**

### Phase 1: Complete Your Work

Finish your primary task, then signal waiting mode via bash:
\`\`\`bash
redis-cli set "swarm:gate:${agentType}:status" "work_complete"
redis-cli incr "swarm:gate:agents_waiting"
redis-cli set "swarm:gate:${agentType}:status" "waiting"
\`\`\`

### Phase 2: Wait at Barrier

Wait for coordinator release signal (60 seconds max) via bash:
\`\`\`bash
# Loop until release
for i in {1..60}; do
  release=$(redis-cli get "swarm:gate:release")
  if [ "$release" = "true" ]; then
    break
  fi
  sleep 1
done
\`\`\`

### Phase 3: Exit After Release

Once released, mark complete and exit via bash:
\`\`\`bash
redis-cli set "swarm:gate:${agentType}:status" "released"
\`\`\`

**Pattern:** No agent exits until ALL agents reach the barrier, then all exit together.
`;

    case 'sequential':
    default:
      return `
## Redis Sequential Coordination

Simple sequential pattern - agents complete independently, no coordination required.

**Optional:** You can signal completion for monitoring:
\`\`\`bash
redis-cli set "swarm:sequential:${agentType}:status" "complete"
\`\`\`
`;
  }
}
```

**Acceptance Criteria:**
- ✅ Explicit bash examples (not pattern descriptions)
- ✅ All 4 patterns have complete instructions
- ✅ Instructions injected into system prompt
- ✅ Validated against Phase 0 test patterns

---

### Deliverable 4: Update Help Text

**File:** `src/cli/hybrid-routing/spawn-workers.js`

**Changes:** Add to --help output (lines 1288-1355)

```
COORDINATION PATTERNS:
  --topology PATTERN     Coordination pattern (default: sequential)
    sequential           Simple completion, no coordination (default)
    bidirectional        Iterative feedback loops (coder ↔ reviewer)
    collaborative        Q&A waiting state (architect answers questions)
    release-gate         Barrier synchronization (all agents wait, released together)

  --dependencies GRAPH   Agent dependency graph (optional)
    Format: "producer:consumer1,consumer2|agent1:agent2"
    Example: "architect:coder,tester|coder:reviewer"

EXAMPLES:
  # Bidirectional feedback (code review loop)
  node src/cli/hybrid-routing/spawn-workers.js "Refactor API" \\
    --agents=coder,reviewer \\
    --topology=bidirectional

  # Collaborative waiting (architect Q&A)
  node src/cli/hybrid-routing/spawn-workers.js "Design auth system" \\
    --agents=architect,coder,tester \\
    --topology=collaborative

  # Release gate (barrier synchronization)
  node src/cli/hybrid-routing/spawn-workers.js "Deploy services" \\
    --agents=backend,frontend,database \\
    --topology=release-gate

  # With dependency graph
  node src/cli/hybrid-routing/spawn-workers.js "Build feature" \\
    --agents=architect,coder,tester \\
    --topology=collaborative \\
    --dependencies="architect:coder,tester"
```

**Acceptance Criteria:**
- ✅ Help text shows all 4 patterns
- ✅ Examples for each pattern
- ✅ Dependency graph format documented

---

### Deliverable 5: Integration Test

**File:** Create `tests/manual/test-cli-redis-injection.md`

**Test Scenarios:**

```bash
# Test 1: Bidirectional (2 agents)
node src/cli/hybrid-routing/spawn-workers.js "Implement authenticate() function" \\
  --agents=coder,reviewer \\
  --topology=bidirectional \\
  --max-agents=2

# Expected:
# - Coder creates low-quality code (confidence 0.65)
# - Reviewer rejects with feedback
# - Coder improves code (confidence 0.85)
# - Reviewer approves
# - Both agents exit

# Verify:
redis-cli get "swarm:bidirectional:coder:final_confidence"  # 0.85
redis-cli get "swarm:bidirectional:reviewer:decision"        # approved
redis-cli llen "swarm:bidirectional:coder:done"              # 0
redis-cli llen "swarm:bidirectional:coder:feedback"          # 0

# Test 2: Collaborative (3 agents)
node src/cli/hybrid-routing/spawn-workers.js "Design authentication system" \\
  --agents=architect,coder,tester \\
  --topology=collaborative \\
  --max-agents=3

# Expected:
# - Architect completes design, enters waiting
# - Coder asks question about error handling
# - Architect answers
# - Tester asks question about edge cases
# - Architect answers
# - All agents signal done
# - Coordinator releases all

# Verify:
redis-cli get "swarm:collab:architect:status"  # complete
redis-cli get "swarm:collab:coder:status"      # complete
redis-cli get "swarm:collab:tester:status"     # complete
redis-cli get "swarm:collab:all_done"          # true

# Test 3: Release Gate (3 agents)
node src/cli/hybrid-routing/spawn-workers.js "Prepare for deployment" \\
  --agents=backend,frontend,database \\
  --topology=release-gate \\
  --max-agents=3

# Expected:
# - All agents complete work at different speeds
# - All enter waiting mode
# - Coordinator detects all waiting
# - Coordinator releases all
# - All agents exit together

# Verify:
redis-cli get "swarm:gate:backend:status"   # released
redis-cli get "swarm:gate:frontend:status"  # released
redis-cli get "swarm:gate:database:status"  # released
redis-cli get "swarm:gate:agents_waiting"   # 3
redis-cli get "swarm:gate:release"          # true
```

**Acceptance Criteria:**
- ✅ All 3 tests pass
- ✅ Redis state shows correct final values
- ✅ Agents execute real bash commands (not simulate)
- ✅ All queues empty (messages consumed)

---

## Implementation Order

1. **Day 1-2:** Add --topology and --dependencies flags + validation
2. **Day 2-3:** Implement Redis instruction injection for all 4 patterns
3. **Day 3-4:** Update help text and documentation
4. **Day 4-5:** Integration testing with CLI spawning
5. **Day 5-6:** Validation, bug fixes, documentation updates

---

## Success Criteria

✅ **Code Changes:**
- --topology flag implemented with 4 patterns
- --dependencies flag implemented with graph parsing
- Redis instructions injected with explicit bash examples
- Help text updated with examples

✅ **Testing:**
- All 3 integration tests pass
- Redis state verification succeeds
- Queue consumption verified (llen = 0)
- Agents execute real bash (not simulate)

✅ **Documentation:**
- Test file created: `tests/manual/test-cli-redis-injection.md`
- Phase 2 completion report created
- PHASE-0-RESULTS.md updated with CLI validation

---

## Risks & Mitigation

### Risk 1: z.ai Agents May Not Follow Instructions
**Mitigation:** Test with simple 2-agent bidirectional first, validate execution fidelity

### Risk 2: Instruction Injection Complexity
**Mitigation:** Use template strings, test each pattern independently

### Risk 3: Backward Compatibility
**Mitigation:** Make --topology optional, default to 'sequential' (current behavior)

---

## Dependencies

- ✅ Phase 0 complete (patterns validated)
- ✅ Phase 1 complete (templates created)
- ✅ spawn-workers.js exists and functional
- ✅ Redis running locally
- ⏳ z.ai API key configured

---

**Last Updated:** 2025-10-17
**Status:** 🟡 READY TO START
**Next Action:** Begin Deliverable 1 (Add --topology flag)
