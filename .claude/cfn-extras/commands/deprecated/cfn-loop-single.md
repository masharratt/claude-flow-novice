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

**MANDATORY: Spawn single coordinator agent that manages all orchestration internally.**

The coordinator uses CLI spawning (95-98% cost savings) and provides full visibility via web portal.

### Step 1: Spawn Coordinator Agent (SINGLE AGENT PATTERN)

```javascript
Task("cfn-v3-coordinator", `
  CFN LOOP SINGLE TASK EXECUTION

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  COST OPTIMIZATION - CUSTOM ROUTING (CRITICAL)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ⚠️  IMPORTANT: Enable custom routing for maximum cost savings!

  1. Enable routing (one-time setup):
     /custom-routing-activate

  2. Verify status:
     /switch-api status

  Cost Breakdown (per iteration):
  ┌─────────────────────┬──────────────┬────────────┐
  │ Component           │ Provider     │ Cost/Call  │
  ├─────────────────────┼──────────────┼────────────┤
  │ Main Chat           │ Anthropic    │ $0.015     │
  │ Coordinator (Task)  │ Anthropic    │ $0.015     │
  │ Loop 3 Agents (CLI) │ Z.ai         │ $0.003 ea  │
  │ Loop 2 Agents (CLI) │ Z.ai         │ $0.003 ea  │
  │ Product Owner (CLI) │ Z.ai         │ $0.003     │
  └─────────────────────┴──────────────┴────────────┘

  Expected Savings:
  • WITH custom routing:    ~64% cost reduction
  • WITHOUT custom routing: Full Anthropic pricing
  • Combined with CLI:      95-98% vs all-Task-tool

  Key Concept:
  - Task() agents use Main Chat provider (Anthropic)
  - CLI-spawned agents use custom routing (Z.ai when enabled)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK SPECIFICATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Task Description: $ARGUMENTS
  Task ID: cfn-single-$(date +%s)
  Mode: STANDARD (gate: 0.75, consensus: 0.90)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SUCCESS CRITERIA (REQUIRED - CUSTOMIZE FOR TASK)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Acceptance Criteria:
  - [ ] Core functionality implemented
  - [ ] Tests pass with >80% coverage
  - [ ] Code reviewed for security
  - [ ] Documentation complete
  - [ ] No breaking changes

  Quality Gates:
  - Loop 3 Gate Threshold: 0.75 (standard mode)
  - Loop 2 Consensus Threshold: 0.90 (standard mode)
  - Max Loop 3 Iterations: 10
  - Max Loop 2 Iterations: 10

  Definition of Done:
  - All acceptance criteria checked
  - Consensus ≥0.90 achieved
  - Product Owner approval

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AGENT CONFIGURATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Loop 3 Agents (Implementation):
  - researcher (requirement analysis)
  - backend-dev (implementation)
  - devops (deployment/infrastructure)

  Loop 2 Agents (Validation):
  - reviewer (code review)
  - architect (design validation)
  - tester (quality assurance)
  - security-specialist (security audit)

  Product Owner: product-owner (GOAP decision-making)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EXECUTION INSTRUCTIONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. INVOKE ORCHESTRATOR:
     ./.claude/skills/cfn-cfn-orchestration/orchestrate.sh \\
       --task-id "cfn-single-$(date +%s)" \\
       --mode standard \\
       --loop3-agents "researcher,backend-dev,devops" \\
       --loop2-agents "reviewer,architect,tester,security-specialist" \\
       --product-owner "product-owner" \\
       --max-iterations 10

  2. MONITOR PROGRESS:
     - Web portal: http://localhost:3000
     - CLI metrics: ./.claude/skills/cfn-web-portal/invoke-portal-agents.sh
     - Event stream: ./.claude/skills/cfn-web-portal/invoke-portal-events.sh

  3. REPORT STRUCTURED RESULT:
     {
       "taskId": "cfn-single-XXXXX",
       "status": "complete|failed",
       "iterations": {"loop3": N, "loop2": M},
       "finalConsensus": 0.XX,
       "acceptanceCriteria": {
         "met": ["Core functionality", "Tests passing", ...],
         "pending": ["Documentation"]
       },
       "recommendations": [...]
     }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRITICAL RULES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - DO NOT spawn agents with Task()
  - LET orchestrator handle CLI spawning
  - USE Redis BLPOP for dependencies
  - PUBLISH events to web-portal channel
  - RETURN structured result to Main Chat
`, "cfn-v3-coordinator")
```

### Step 2: Coordinator Autonomous Execution

The coordinator runs orchestrator script internally:

**Loop 3: Implementation**
- Spawns agents via CLI: `npx cfn-spawn agent <type>`
- Collects confidence scores
- Gate check (≥0.75): PASS → Wake Loop 2 | FAIL → Iterate

**Loop 2: Validation**
- **WAITS** for Loop 3 gate pass (Redis BLPOP)
- Spawns validators via CLI
- Collects consensus scores
- Consensus check (≥0.90): PASS → Complete | FAIL → Iterate

**Loop 1: Product Owner**
- GOAP decision-making
- Returns structured result to Main Chat

### Step 3: Visibility via Web Portal

**Monitor execution:**
```bash
# Start web portal (if not running)
./.claude/skills/cfn-web-portal/invoke-portal-start.sh

# View agents
./.claude/skills/cfn-web-portal/invoke-portal-agents.sh --status active

# Track events
./.claude/skills/cfn-web-portal/invoke-portal-events.sh --limit 50

# Get metrics
./.claude/skills/cfn-web-portal/invoke-portal-metrics.sh
```

**Web UI:** http://localhost:3000 (real-time updates)

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
