---
description: "Execute single task through autonomous CFN Loop (natural language, file path, or partial reference)"
argument-hint: "<task description or file reference>"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# CFN Loop Single - Single Task Autonomous Execution

Execute a single task through the CFN Loop without sprint/phase structure. Supports natural language, file paths, or partial file references.

🚨 **AUTONOMOUS SELF-LOOPING PROCESS**

**Task**: $ARGUMENTS

## CFN Loop Structure (4 Loops)

```
LOOP 0: Epic/Sprint Orchestration (use /cfn-loop-epic or /cfn-loop-sprints)
   ↓
LOOP 1: Phase Execution (this command - single phase)
   ↓
LOOP 2: Consensus Validation (≥90% Byzantine consensus)
   ↓
LOOP 3: Primary Swarm Execution (implementation with confidence scores)
```

## Execution Pattern

**CRITICAL:** Use CFN Loop Coordinator agent with automatic orchestration.

### Step 1: Spawn CFN Loop Coordinator (MANDATORY)

```javascript
// CTO spawns coordinator agent - DO NOT spawn implementers directly
Task("CFN Loop Coordinator", `
  Execute CFN Loop for task: $ARGUMENTS

  MANDATORY: Use orchestrator script for dependency enforcement.

  ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
    --task-id "cfn-$(date +%s)" \
    --mode standard \
    --loop3-agents "researcher,backend-dev,devops" \
    --loop2-agents "reviewer,architect,tester" \
    --product-owner "product-owner" \
    --max-iterations 10

  The orchestrator will:
  - Spawn all agents automatically
  - Enforce BLPOP dependency blocking
  - Collect consensus after validators finish
  - Wake agents for next iteration if needed
  - Report final result

  DO NOT spawn agents manually with Task().
`, "cfn-loop-coordinator")
```

### Alternative: Manual Spawning (NOT RECOMMENDED)

If you must spawn agents manually (NOT recommended), follow this pattern:

### Step 2: Execute - Primary Swarm (Loop 3)
```javascript
// Spawn ALL agents in ONE message
Task("Coder 1", `
  Implementation task...

  MANDATORY: After EVERY file edit, run:
  node config/hooks/post-edit-pipeline.js "[FILE_PATH]" --memory-key "swarm/coder-1/step-1"

  Report confidence score when complete.
`, "coder")

Task("Tester 1", "...", "tester")
Task("Backend Dev 1", "...", "backend-dev")
```

### Step 3: Self-Assessment Gate
- Collect confidence scores from ALL agents
- **PASS** (all ≥75%) → Proceed to Step 4
- **FAIL** (any <75%) → IMMEDIATELY relaunch Loop 3 with targeted agents (NO approval)

### Step 4: Verify - Consensus Swarm
**CRITICAL**: Spawn validators in SEPARATE message AFTER implementation complete:

```javascript
// MESSAGE 2: Validators (AFTER implementation)
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})

Task("Validator 1", "Review completed work at [files]", "reviewer")
Task("Validator 2", "Security audit of implementation", "security-specialist")
Task("Validator 3", "Architecture validation", "system-architect")
```

### Step 5: Product Owner Decision Gate (GOAP)
```javascript
Task("Product Owner", `
  GOAP DECISION EXECUTION - Loop 2 Iteration ${iteration}/10

  CURRENT STATE:
  - Consensus: ${consensusScore} (target: ≥0.90)
  - Validator concerns: ${JSON.stringify(concerns)}

  RETRIEVE SCOPE:
  mcp__claude-flow-novice__memory_usage({
    action: "retrieve",
    namespace: "scope-control",
    key: "project-boundaries"
  })

  EXECUTE GOAP A* SEARCH:
  1. Classify concerns: in-scope vs out-of-scope
  2. Generate action space with cost functions
  3. Run A* pathfinding
  4. Make autonomous decision

  OUTPUT: {decision: "PROCEED|DEFER|ESCALATE", ...}
`, "product-owner")
```

**Decision Outcomes:**
- **PROCEED** → IMMEDIATELY relaunch Loop 3 with targeted agents (NO approval)
- **DEFER** → Save to backlog, approve phase
- **ESCALATE** → Generate alternatives (rare)

### Step 6: Action Based on Decision
- **PROCEED** → Spawn Loop 3 swarm with Product Owner's agent selections
- **DEFER** → Transition to next phase (if applicable)
- **ESCALATE** → Only STOP if critical error

## Autonomous Execution Rules

**YOU ARE FORBIDDEN FROM:**
- ❌ Asking "Should I retry?" (ALWAYS retry if iterations < 10)
- ❌ Asking "Proceed to next step?" (AUTO-PROCEED)
- ❌ Waiting for approval during CFN Loop cycles

**YOU MUST:**
- ✅ IMMEDIATELY relaunch Loop 3 on low confidence (iteration < 10)
- ✅ IMMEDIATELY relaunch Loop 3 on consensus failure (iteration < 10)
- ✅ AUTOMATICALLY select better agents based on failure analysis
- ✅ ONLY escalate when truly blocked (critical error or max iterations)

## Iteration Limits
- **Loop 2** (Consensus): 10 iterations max
- **Loop 3** (Primary Swarm): 10 iterations max

## Example Execution

```
[Turn 1] Loop 3 Iteration 1/10
         → Primary swarm (coder, tester, backend-dev)
         → Confidence: 68%, 72%, 85%
         → Gate FAILS (2 agents <75%)
         → IMMEDIATELY retry Loop 3 (autonomous)

[Turn 2] Loop 3 Iteration 2/10
         → Primary swarm with feedback
         → Confidence: 82%, 79%, 88%
         → Gate PASSES (all ≥75%)
         → Proceed to Loop 2

[Turn 3] Loop 2 Iteration 1/10
         → Consensus validators spawned
         → Consensus: 85% (below 90%)
         → IMMEDIATELY retry (autonomous)

[Turn 4] Loop 2 Iteration 2/10
         → Product Owner: PROCEED (GOAP cost=50)
         → Loop 3 relaunched with targeted agents
         → Consensus achieved: 94% ✅
         → PHASE COMPLETE
```

## Output Format

Concise, action-oriented:
```
Loop 3 Iteration 2/10 - Confidence: 82% avg ✅
Proceeding to Loop 2 (Consensus)...

Loop 2 Iteration 1/10 - Consensus: 87% ❌
Product Owner: PROCEED (5 in-scope blockers)
IMMEDIATELY relaunching Loop 3 with:
- backend-dev (fix SQL injection)
- security-specialist (validate fix)
[Executing autonomously - no permission needed]
```
