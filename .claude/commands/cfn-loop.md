---
description: "Execute autonomous 3-loop self-correcting CFN workflow with automatic retry and consensus validation"
argument-hint: "<task description> [--phase=name] [--max-loop2=10] [--max-loop3=10]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep"]
---

# CFN Loop - Autonomous 3-Loop Self-Correcting Workflow

Execute task through autonomous 3-loop CFN structure with automatic retry and consensus validation.

🚨 **AUTONOMOUS SELF-LOOPING PROCESS**

**Task**: $ARGUMENTS

## CFN Loop Structure (3 Loops)

```
LOOP 1: Phase Completion or Escalation
   ↓
LOOP 2: Consensus Validation (≥90% Byzantine consensus)
   ↓
LOOP 3: Primary Swarm Execution with subtask iterations
```

## Command Options

```bash
/cfn-loop "Implement JWT authentication" --phase=implementation
/cfn-loop "Fix security vulnerabilities" --phase=security-audit --max-loop2=10
/cfn-loop "Refactor API layer" --max-loop3=15
/cfn-loop "Add test coverage for auth module" --phase=testing --max-loop2=10
```

**Options:**
- `--phase=<name>`: Optional phase name for tracking
- `--max-loop2=<n>`: Max consensus iterations (default: 10)
- `--max-loop3=<n>`: Max primary swarm iterations (default: 10)

## Execution Pattern

### Step 1: Initialize Swarm (MANDATORY)
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",          // mesh for 2-7, hierarchical for 8+
  maxAgents: 5,
  strategy: "balanced"
})
```

### Step 2: Execute - Primary Swarm (Loop 3)
```javascript
Task("Agent 1", `
  Implementation task...

  MANDATORY: After EVERY file edit:
  node config/hooks/post-edit-pipeline.js "[FILE_PATH]" --memory-key "swarm/agent-1/step-1"

  Report confidence score when complete.
`, "agent-type")
```

### Step 3: Self-Assessment Gate
- ALL agents ≥75% → Proceed to Loop 2
- ANY agent <75% → IMMEDIATELY relaunch Loop 3 (NO approval)

### Step 4: Consensus Validation (Loop 2)
**CRITICAL**: Spawn validators in SEPARATE message AFTER implementation:

```javascript
// MESSAGE 2: Validators only
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})

Task("Reviewer", "Review completed work", "reviewer")
Task("Security", "Security audit", "security-specialist")
Task("Architect", "Architecture validation", "architect")
```

### Step 5: Product Owner Decision (GOAP)
```javascript
Task("Product Owner", `
  GOAP DECISION EXECUTION

  CURRENT STATE:
  - Consensus: ${consensusScore} (target: ≥0.90)
  - Validator concerns: ${concerns}
  - Loop iteration: ${iteration}/10

  EXECUTE GOAP A* SEARCH:
  1. Classify concerns (in-scope vs out-of-scope)
  2. Calculate action costs
  3. Find optimal decision path
  4. Make autonomous decision (NO approval needed)

  OUTPUT: {decision: "PROCEED|DEFER|ESCALATE", ...}
`, "product-owner")
```

**Decision Outcomes:**
- **PROCEED** → IMMEDIATELY relaunch Loop 3 with targeted agents
- **DEFER** → Save to backlog, complete phase
- **ESCALATE** → Generate alternatives (rare)

### Step 6: Loop 1 Phase Completion
- Consensus ≥90% → Phase COMPLETE
- Max iterations reached → Escalate with diagnostics

## Autonomous Execution Rules

**FORBIDDEN:**
- ❌ "Should I retry?" (ALWAYS retry if iterations < max)
- ❌ "Proceed to consensus?" (AUTO-PROCEED when gate passes)
- ❌ Waiting for approval during CFN Loop cycles

**REQUIRED:**
- ✅ IMMEDIATE Loop 3 relaunch on low confidence (iteration < max)
- ✅ IMMEDIATE Loop 3 relaunch on consensus failure (iteration < max)
- ✅ AUTOMATIC better agent selection based on failure analysis
- ✅ ONLY escalate when truly blocked (critical error or max iterations)

## Iteration Limits
- **Loop 2** (Consensus): Configurable via `--max-loop2` (default: 10)
- **Loop 3** (Primary Swarm): Configurable via `--max-loop3` (default: 10)

## Circuit Breaker Protection

Automatic timeout protection prevents infinite loops:
- Loop 2 timeout: 30 minutes
- Loop 3 timeout: 20 minutes
- Escalates on timeout with diagnostic report

## Example Execution

```
[Turn 1] /cfn-loop "Implement JWT auth" --phase=auth
         → Loop 3 Iteration 1/10
         → Swarm: backend-dev, tester, security
         → Confidence: 72%, 68%, 85%
         → Gate FAILS → IMMEDIATE retry

[Turn 2] Loop 3 Iteration 2/10
         → Swarm with feedback
         → Confidence: 85%, 82%, 88%
         → Gate PASSES → Proceed to Loop 2

[Turn 3] Loop 2 Iteration 1/10
         → Consensus validators spawned
         → Consensus: 87% (below 90%)
         → Product Owner: PROCEED (in-scope issues)
         → IMMEDIATE Loop 3 relaunch

[Turn 4] Loop 3 Iteration 3/10
         → Targeted agents (backend-dev, security)
         → Consensus achieved: 93% ✅
         → Phase COMPLETE
```

## Output Format

```
Loop 3 Iteration 2/10 - Confidence: 85% avg ✅
Proceeding to Loop 2 (Consensus)...

Loop 2 Iteration 1/10 - Consensus: 87% ❌
Product Owner: PROCEED (3 in-scope blockers)
IMMEDIATELY relaunching Loop 3 with:
- backend-dev (fix validation logic)
- security-specialist (review auth flow)
[Executing autonomously - no permission needed]
```

## Integration with Other CFN Commands

- **Single task**: Use `/cfn-loop` (this command)
- **Multiple sprints**: Use `/cfn-loop-sprints`
- **Multi-phase epic**: Use `/cfn-loop-epic`
- **Direct single task**: Use `/cfn-loop-single`
