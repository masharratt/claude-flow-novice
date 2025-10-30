---
name: agent-lifecycle-documentation
description: Documentation for agent lifecycle management and waiting mode protocols
model: claude-sonnet-4
tools: [Read]
type: documentation
---

# Agent Lifecycle Documentation

**Version:** 2.0 (Post-Waiting Mode Removal)
**Last Updated:** 2025-10-21
**Status:** Current Standard

---

## Overview

This document clarifies the complete lifecycle of agents in the CFN Loop system, removing ambiguity about exit vs. waiting patterns.

**Core Principle:** Agents are **stateless, single-execution workers** that exit cleanly after completing their work and reporting results.

---

## Lifecycle States

### State 1: Spawned
**Duration:** Instantaneous
**Who:** Orchestrator via CLI (`npx cfn-spawn agent <type>`)
**Agent State:** Process starting, loading context

**Actions:**
- Agent process created
- Context injected via CLI parameters
- Tools initialized
- Task description received

### State 2: Executing
**Duration:** Variable (15 seconds - 60 minutes depending on agent type)
**Who:** Agent (autonomous)
**Agent State:** Working on assigned task

**Actions:**
- Read task specifications
- Execute work (code, review, validation, decision)
- Use tools (Read, Write, Edit, Bash, etc.)
- Build results

### State 3: Reporting
**Duration:** 1-5 seconds
**Who:** Agent (mandatory protocol)
**Agent State:** Completing execution

**Actions (in order):**
1. **Signal completion:**
   ```bash
   redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
   ```

2. **Report confidence:**
   ```bash
   ./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \

**After reporting, exit cleanly. Do NOT enter waiting mode.**

**Why This Matters:**
- Orchestrator collects confidence/consensus scores from Redis
- Enables adaptive agent specialization for next iteration
- Prevents orchestrator blocking on wait $PID
- Coordinator spawns appropriate specialist based on feedback type

     --task-id "$TASK_ID" \
     --agent-id "$AGENT_ID" \
     --confidence [0.0-1.0] \
     --iteration $ITERATION
   ```

3. **Store results (if applicable):**
   ```bash
   redis-cli setex "swarm:${TASK_ID}:${AGENT_ID}:result" 86400 "$RESULT_JSON"
   ```

### State 4: Exiting
**Duration:** Instantaneous
**Who:** Agent (natural process termination)
**Agent State:** Process terminating

**Actions:**
- Clean exit (exit code 0)
- Process terminates
- Resources released
- ~~NO waiting mode~~ ❌ (removed)
- ~~NO wake signal needed~~ ❌ (removed)

---

## CFN Loop Protocol (Complete)

### For Loop 3 Implementers (coder, backend-dev, etc.)

```markdown
## CFN Loop Redis Completion Protocol

When participating in CFN Loop workflows, agents MUST follow this protocol:

### Step 1: Complete Work
Execute assigned task (code implementation, feature development, bug fixing)

### Step 2: Signal Completion
```bash
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### Step 3: Report Confidence Score
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \

**After reporting, exit cleanly. Do NOT enter waiting mode.**

**Why This Matters:**
- Orchestrator collects confidence/consensus scores from Redis
- Enables adaptive agent specialization for next iteration
- Prevents orchestrator blocking on wait $PID
- Coordinator spawns appropriate specialist based on feedback type

  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence [0.0-1.0] \
  --iteration 1
```

Confidence score guidelines:
- 1.0: Perfect implementation, all requirements met, no issues
- 0.9-0.99: Excellent, minor refinements possible
- 0.75-0.89: Good, gate threshold met, ready for validation
- 0.5-0.74: Below gate, needs iteration
- 0.0-0.49: Significant issues, requires major rework

### Step 4: Exit Cleanly
Agent work is complete. Exit cleanly to allow orchestrator to proceed.

**Note:** If another iteration is needed, orchestrator will spawn a fresh agent
(possibly a different specialist based on feedback). This enables adaptive
agent specialization per PATTERN-022.
```

### For Loop 2 Validators (reviewer, tester, security-specialist, etc.)

```markdown
## CFN Loop Redis Completion Protocol

### Step 1: Wait for Gate Pass Signal
```bash
# Wait for Loop 3 to pass gate threshold
redis-cli blpop "swarm:${TASK_ID}:gate-passed" 0
```

### Step 2: Retrieve Loop 3 Results
```bash
# Get agent outputs and confidence scores from Redis
redis-cli get "swarm:${TASK_ID}:coder-1:result"
redis-cli get "swarm:${TASK_ID}:coder-1:confidence"
```

### Step 3: Perform Validation
Execute validation task (code review, security audit, testing)

### Step 4: Signal Completion
```bash
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### Step 5: Report Consensus Score
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \

**After reporting, exit cleanly. Do NOT enter waiting mode.**

**Why This Matters:**
- Orchestrator collects confidence/consensus scores from Redis
- Enables adaptive agent specialization for next iteration
- Prevents orchestrator blocking on wait $PID
- Coordinator spawns appropriate specialist based on feedback type

  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence [0.0-1.0] \
  --iteration 1
```

Consensus score guidelines:
- 1.0: Perfect quality, no issues found
- 0.9-0.99: Excellent, consensus threshold typically met
- 0.75-0.89: Good, minor issues found
- 0.5-0.74: Below consensus, needs iteration
- 0.0-0.49: Significant issues, requires rework

### Step 6: Exit Cleanly
Validation complete. Exit cleanly to allow orchestrator to calculate consensus.
```

### For Product Owner

```markdown
## CFN Loop Product Owner Protocol

### Step 1: Wait for Consensus Completion
```bash
# Wait for Loop 2 to complete consensus validation
redis-cli blpop "swarm:${TASK_ID}:consensus-complete" 0
```

### Step 2: Retrieve All Context
```bash
# Get Loop 2 consensus, feedback, acceptance criteria
redis-cli get "swarm:${TASK_ID}:loop2:consensus"
redis-cli lrange "swarm:${TASK_ID}:loop2:feedback" 0 -1
redis-cli get "swarm:${TASK_ID}:success-criteria"
```

### Step 3: Make Strategic Decision
Analyze consensus, feedback, and business requirements.

Output one of:
- **PROCEED:** Task complete, meets acceptance criteria
- **ITERATE:** Needs another iteration (provide specific feedback)
- **ABORT:** Out of scope or max iterations reached

### Step 4: Report Decision
```bash
redis-cli lpush "swarm:${TASK_ID}:product-owner:decision" "$DECISION_JSON"
```

### Step 5: Exit Cleanly
Decision made. Exit to allow orchestrator to proceed with final actions.
```

---

## Orchestrator Responsibilities

### Agent Spawning
```bash
# Spawn agent via CLI
npx cfn-spawn agent <agent-type> \
  --task-id "$TASK_ID" \
  --iteration "$ITERATION" \
  --context "$CONTEXT_JSON" &

AGENT_PID=$!
```

### Agent Monitoring
```bash
# Wait for agent to complete and exit naturally
wait $AGENT_PID
EXIT_CODE=$?

# Check completion signal
DONE_SIGNAL=$(redis-cli lpop "swarm:${TASK_ID}:${AGENT_ID}:done")

# Retrieve confidence
CONFIDENCE=$(redis-cli get "swarm:${TASK_ID}:${AGENT_ID}:confidence")
```

### No Wake Calls Needed
❌ **Removed:** `invoke-waiting-mode.sh wake` calls
✅ **Current:** Agents exit, orchestrator spawns fresh agents for next iteration

---

## Iteration Pattern

### Single Iteration (Typical)
```
1. Orchestrator spawns Loop 3 agents
2. Loop 3 agents work → report confidence → EXIT
3. Orchestrator checks gate threshold
4. If PASS: Orchestrator spawns Loop 2 agents
5. Loop 2 agents validate → report consensus → EXIT
6. Orchestrator checks consensus threshold
7. If PASS: Orchestrator spawns Product Owner
8. Product Owner decides → EXIT
9. Task complete
```

### Multi-Iteration (If Gate/Consensus Fails)
```
1. Orchestrator spawns Loop 3 agents (iteration 1)
2. Loop 3 agents work → report confidence → EXIT
3. Gate check FAILS (confidence < 0.75)
4. Orchestrator spawns NEW Loop 3 agents (iteration 2) ← Fresh agents!
5. New agents work → report confidence → EXIT
6. Gate check PASSES
7. Continue to Loop 2...
```

**Key Point:** Each iteration spawns **fresh agents**, enabling adaptive specialization:
- Iteration 1: coder
- Iteration 2: rust-developer (if feedback mentions Rust)
- Iteration 3: backend-dev (if feedback mentions API)

---

## Anti-Patterns (Forbidden)

### ❌ Anti-Pattern 1: Waiting Mode
```bash
# WRONG - DO NOT USE:
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID"
```

**Why forbidden:**
- Blocks orchestrator indefinitely
- Creates process zombies
- Prevents adaptive specialization
- Requires manual wake calls (complexity)

### ❌ Anti-Pattern 2: Fork/Resume Pattern
```bash
# WRONG - DO NOT USE:
redis-cli get "swarm:${TASK_ID}:${AGENT}:fork-id"
npx cfn-fork resume --fork-id "$FORK_ID"
```

**Why forbidden:**
- Adds complexity (conversation state management)
- Not needed (fresh agents work better)
- Harder to debug (stateful resume)

### ❌ Anti-Pattern 3: Manual Agent Spawning
```bash
# WRONG - DO NOT USE in CFN Loop:
Task("coder", "implement feature")
```

**Why forbidden:**
- Bypasses CFN Loop protocol
- No confidence reporting
- No Redis coordination
- Breaks orchestrator flow

---

## Correct Patterns (Recommended)

### ✅ Pattern 1: Clean Exit After Reporting
```bash
# Agent code (end of execution):

# Step 1: Signal done
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Step 2: Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \

**After reporting, exit cleanly. Do NOT enter waiting mode.**

**Why This Matters:**
- Orchestrator collects confidence/consensus scores from Redis
- Enables adaptive agent specialization for next iteration
- Prevents orchestrator blocking on wait $PID
- Coordinator spawns appropriate specialist based on feedback type

  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.95 \
  --iteration 1

# Step 3: Exit cleanly
exit 0
```

### ✅ Pattern 2: Orchestrator Wait Pattern
```bash
# Orchestrator code:

# Spawn agent in background
npx cfn-spawn agent coder \
  --task-id "$TASK_ID" \
  --context "$CONTEXT" &
AGENT_PID=$!

# Wait for agent to complete
wait $AGENT_PID
EXIT_CODE=$?

# Retrieve results from Redis (agent already exited)
CONFIDENCE=$(redis-cli get "swarm:${TASK_ID}:coder-1:confidence")
```

### ✅ Pattern 3: Adaptive Specialization
```bash
# Orchestrator iteration logic:

if [ "$GATE_PASSED" = "false" ]; then
  # Analyze feedback to select specialist
  if [[ "$FEEDBACK" =~ "security" ]]; then
    SPECIALIST="security-specialist"
  elif [[ "$FEEDBACK" =~ "performance" ]]; then
    SPECIALIST="perf-analyzer"
  else
    SPECIALIST="$ORIGINAL_AGENT"  # Retry with same type
  fi

  # Spawn fresh specialist (not resume old agent)
  npx cfn-spawn agent "$SPECIALIST" \
    --task-id "$TASK_ID" \
    --iteration $((ITERATION + 1)) \
    --feedback "$FEEDBACK" &
fi
```

---

## Timeout Handling

### Agent-Level Timeouts
Agents have role-based timeouts:
- **Implementers:** 60 minutes (coder, backend-dev)
- **Validators:** 30 minutes (reviewer, tester)
- **Product Owner:** 15 minutes (strategic decision)
- **Researchers:** 120 minutes (deep analysis)

### Timeout Behavior
```bash
# If agent times out:
# 1. Process killed by orchestrator
# 2. Agent marked as failed
# 3. No confidence reported (defaults to 0.0)
# 4. Orchestrator spawns replacement agent
```

---

## Error Handling

### Agent Failure Scenarios

**1. Exit Code Non-Zero:**
```bash
wait $AGENT_PID
EXIT_CODE=$?

if [ "$EXIT_CODE" -ne 0 ]; then
  # Agent failed - log error, spawn replacement
  CONFIDENCE=0.0
fi
```

**2. No Completion Signal:**
```bash
DONE_SIGNAL=$(redis-cli lpop "swarm:${TASK_ID}:${AGENT_ID}:done")

if [ -z "$DONE_SIGNAL" ]; then
  # Agent didn't signal completion - treat as failure
  CONFIDENCE=0.0
fi
```

**3. Missing Confidence:**
```bash
CONFIDENCE=$(redis-cli get "swarm:${TASK_ID}:${AGENT_ID}:confidence")

if [ -z "$CONFIDENCE" ] || [ "$CONFIDENCE" = "(nil)" ]; then
  # No confidence reported - default to 0.0
  CONFIDENCE=0.0
fi
```

---

## Redis Key Conventions

### Agent Completion Keys
```
swarm:{TASK_ID}:{AGENT_ID}:done          → "complete" (signal)
swarm:{TASK_ID}:{AGENT_ID}:confidence    → "0.95" (score)
swarm:{TASK_ID}:{AGENT_ID}:result        → JSON (output)
```

### Coordination Keys
```
swarm:{TASK_ID}:gate-passed              → "1" (Loop 3 → Loop 2 signal)
swarm:{TASK_ID}:consensus-complete       → "1" (Loop 2 → PO signal)
swarm:{TASK_ID}:product-owner:decision   → JSON (PO decision)
```

### Metrics Keys
```
swarm:{TASK_ID}:metrics:loop3_consensus  → List of JSON metrics
swarm:{TASK_ID}:metrics:loop2_consensus  → List of JSON metrics
swarm:{TASK_ID}:metrics:iteration_start  → List of timestamps
```

---

## Summary

**Agent Lifecycle (4 States):**
1. **Spawned** - Process starts, context loaded
2. **Executing** - Agent works autonomously
3. **Reporting** - Signal completion, report confidence
4. **Exiting** - Clean exit (exit code 0)

**Key Changes from v1.0:**
- ❌ Removed: Waiting mode (Step 4)
- ❌ Removed: Wake calls from orchestrator
- ❌ Removed: Fork/resume pattern
- ✅ Added: Clean exit after reporting
- ✅ Added: Adaptive agent specialization
- ✅ Added: Fresh agents per iteration

**Benefits:**
- Simpler orchestrator (no wake logic)
- Stateless agents (easier debugging)
- Adaptive specialization (better results)
- No process zombies (clean resource management)

**Next Steps:**
- See P4: Product Owner structured JSON output
- See P5: Coordinator simplification (780 → 200 lines)
- See P6: Unified agent spawning patterns

---

**Version History:**
- v1.0: Original with waiting mode
- v2.0 (2025-10-21): Waiting mode removed, PATTERN-022 compliant
