---
description: "Execute autonomous 3-loop self-correcting CFN workflow with automatic retry and consensus validation"
argument-hint: "<task description> [--phase=name] [--mode=mvp|standard|enterprise] [--spawn-mode=cli|task] [--max-loop2=10] [--max-loop3=10]"
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
# CLI Mode (default - cost-optimized)
/cfn-loop "Implement JWT authentication" --phase=implementation --mode=standard
/cfn-loop "Fix security vulnerabilities" --phase=security-audit --mode=enterprise --max-loop2=10

# Task Mode (debugging - full visibility)
/cfn-loop "Build MVP feature" --spawn-mode=task --mode=mvp
/cfn-loop "Refactor API layer" --spawn-mode=task --mode=standard --max-loop3=15
```

**Options:**
- `--phase=<name>`: Optional phase name for tracking
- `--mode=<mvp|standard|enterprise>`: Coordinator mode (default: standard)
- `--spawn-mode=<cli|task>`: Agent spawning method (default: cli)
  - **cli**: Cost-optimized (95-98% savings), background execution, Redis monitoring
  - **task**: Full visibility in Main Chat, direct spawning, debugging
- `--max-loop2=<n>`: Max consensus iterations (default: 10)
- `--max-loop3=<n>`: Max primary swarm iterations (default: 10)

## Coordinator Modes

### MVP Mode (Rapid Development)
- **Coordinator**: `cfn-coordinator-mvp`
- **Gate Threshold**: 70% confidence
- **Consensus Threshold**: 80% agreement
- **Validators**: 2 (minimal validation)
- **Max Iterations**: 5 (fast retry)
- **Timeout**: 15 minutes per phase
- **Cost Target**: <$1.00 per phase
- **Instructions**: `config/cfn-loop/instructions/mvp-instructions.md`

### Standard Mode (Balanced)
- **Coordinator**: `cfn-coordinator-standard`
- **Gate Threshold**: 75% confidence
- **Consensus Threshold**: 90% agreement
- **Validators**: 3 (standard validation)
- **Max Iterations**: 10 (balanced retry)
- **Timeout**: 30 minutes per phase
- **Instructions**: `config/cfn-loop/instructions/standard-instructions.md`

### Enterprise Mode (High Quality)
- **Coordinator**: `cfn-coordinator-enterprise`
- **Gate Threshold**: 85% confidence
- **Consensus Threshold**: 95% agreement
- **Validators**: 5 (comprehensive validation)
- **Max Iterations**: 15 (thorough retry)
- **Timeout**: 60 minutes per phase
- **Instructions**: `config/cfn-loop/instructions/enterprise-instructions.md`

## Execution Pattern

**MANDATORY: Spawn single coordinator agent that manages all orchestration internally.**

The coordinator uses CLI spawning (95-98% cost savings) and provides full visibility via web portal.

### Step 1: Parse Command Arguments

Extract parameters from command:
- `--spawn-mode=cli|task` (default: cli)
- `--mode=mvp|standard|enterprise` (default: standard)
- `--phase=<name>` (optional phase identifier)
- `--max-loop2=<n>` (max consensus iterations, default: 10)
- `--max-loop3=<n>` (max implementation iterations, default: 10)

### Step 1.5: Load Task Mode Guide (If Applicable)

**If `--spawn-mode=task` detected:**

```javascript
// Read Task Mode guide for agent specialization and workflow
const taskModeGuide = await Read('.claude/commands/cfn/CFN_LOOP_TASK_MODE.md');

// Guide provides:
// - Agent specialization (Loop 3: implementers, Loop 2: validators, Loop 4: PO)
// - Adaptive validator scaling (2-6 validators based on complexity)
// - Sprint completion workflow (consensus → deliverables → git → summary)
// - Product Owner spawning via Task() (NOT execute-decision.sh)
// - Backlog mechanism and background worker patterns

console.log('Task Mode: Using guide for agent selection and coordination');
```

**Key Task Mode Differences:**
- Coordinator spawns agents via Task() (NOT CLI)
- Product Owner spawned via Task() directly by coordinator
- Use helper scripts: `parse-decision.sh`, `validate-deliverables.sh`
- Do NOT use `execute-decision.sh` (it spawns PO via CLI → duplicate agents)
- Full agent output visible in Main Chat (debugging)

### Step 2: Execute CFN Loop

**CLI Mode (default) - Spawn Coordinator:**

```javascript
Task("cfn-v3-coordinator", `
  CFN LOOP EXECUTION - STRUCTURED PARAMETERS

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
  Phase Name: (extract from task description or use 'default')
  Task ID: cfn-phase-$(date +%s)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SUCCESS CRITERIA (REQUIRED)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Acceptance Criteria:
  - [ ] Feature implements core functionality
  - [ ] All tests pass with >80% coverage
  - [ ] Security review completed
  - [ ] Documentation updated
  - [ ] No regression in existing features

  Quality Gates (STANDARD MODE):
  - Loop 3 Gate Threshold: 0.75
  - Loop 2 Consensus Threshold: 0.90
  - Max Loop 3 Iterations: 10
  - Max Loop 2 Iterations: 10

  Definition of Done:
  - Consensus ≥0.90 achieved
  - All acceptance criteria met
  - Product Owner approval received

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ORCHESTRATION CONFIGURATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mode: STANDARD

  Loop 3 Agents (Implementation) - CUSTOMIZE FOR TASK:
  - researcher (requirement analysis)
  - backend-dev (implementation)
  - devops (deployment/infrastructure)

  Loop 2 Agents (Validation) - CUSTOMIZE FOR TASK:
  - reviewer (code review)
  - architect (design validation)
  - tester (quality assurance)
  - security-specialist (security audit)

  Product Owner: product-owner

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EXECUTION INSTRUCTIONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. INVOKE ORCHESTRATOR:
     # Generate task ID and construct bash command with actual values
     # DO NOT use template literals - construct real bash variables

     TASK_ID="cfn-phase-$(date +%s)"
     MODE="standard"
     LOOP3_AGENTS="researcher,backend-dev,devops"
     LOOP2_AGENTS="reviewer,architect,tester,security-specialist"

     ./.claude/skills/cfn-cfn-orchestration/orchestrate.sh \
       --task-id "$TASK_ID" \
       --mode "$MODE" \
       --loop3-agents "$LOOP3_AGENTS" \
       --loop2-agents "$LOOP2_AGENTS" \
       --product-owner "product-owner" \
       --max-iterations 10

     # Orchestrator handles complete workflow:
     # - Spawns Loop 3 agents → gate check → iteration if needed
     # - Spawns Loop 2 validators → consensus check
     # - Spawns Product Owner → PROCEED/ITERATE/ABORT decision
     # - On PROCEED: git add/commit/push + sprint summary
     # - Returns when complete or max iterations reached

  2. MONITOR PROGRESS:
     - Use web portal: http://localhost:3000
     - Query metrics: ./.claude/skills/cfn-web-portal/invoke-portal-metrics.sh
     - Track events: ./.claude/skills/cfn-web-portal/invoke-portal-events.sh --phase <phase-name>

  3. REPORT RESULTS:
     Return structured result to Main Chat:
     {
       "taskId": "<actual-task-id>",
       "phase": "<phase-name>",
       "status": "complete|failed",
       "iterations": {
         "loop3": N,
         "loop2": M
       },
       "finalConsensus": 0.XX,
       "acceptanceCriteria": {
         "met": [...],
         "pending": [...]
       },
       "nextActions": [...]
     }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRITICAL RULES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - DO NOT spawn agents manually with Task()
  - LET orchestrator script handle all agent spawning via CLI
  - USE Redis BLPOP for loop dependencies
  - REPORT confidence/consensus after each iteration
  - WAKE agents via invoke-waiting-mode.sh wake
  - PUBLISH events to web-portal:events channel
  - RETURN structured result when complete
`, "cfn-v3-coordinator")
```

**Task Mode (for debugging) - Main Chat Coordinates Directly:**

Main Chat does NOT spawn a coordinator. Instead, it coordinates directly following the guide:

```javascript
// Step 1: Read Task Mode Guide
const guide = await Read('.claude/commands/cfn/CFN_LOOP_TASK_MODE.md');

// Step 2: Analyze Task Complexity (from guide)
const complexity = analyzeComplexity({
  task: "$ARGUMENTS",
  files: estimateFileCount(),
  loc: estimateLOC()
});

// Step 3: Select Agents (from guide's adaptive scaling)
const agents = selectAgents(complexity);
// Simple: 2 validators (reviewer, tester)
// Standard: 4 validators (+architect, +security-specialist)
// Complex: 5+ validators (+code-analyzer, +perf/ada)

// Step 4: Loop 3 - Implementation
let iteration = 1;
let loop3Confidence = 0;

do {
  // Spawn Loop 3 agents in parallel
  const loop3Results = await Promise.all(
    agents.loop3.map(agent =>
      Task(agent, `Implement: $ARGUMENTS (iteration ${iteration})`)
    )
  );

  loop3Confidence = average(loop3Results.map(r => r.confidence));

  if (loop3Confidence >= 0.75) break;

  iteration++;
} while (iteration <= maxIterations);

// Step 5: Loop 2 - Validation
const loop2Results = await Promise.all(
  agents.loop2.map(validator =>
    Task(validator, "Review implementation")
  )
);

const consensus = average(loop2Results.map(r => r.confidence));

// Step 6: Product Owner Decision
const poContext = `
  Iteration ${iteration} complete.
  Consensus: ${consensus} (threshold: 0.90)

  Decision Framework:
  - PROCEED: Consensus >= 0.90 AND deliverables verified
  - ITERATE: Consensus < 0.90 AND iteration < max
  - ABORT: Max iterations reached

  Output format: Decision: [PROCEED|ITERATE|ABORT]
`;

const poOutput = Task("product-owner", poContext);

// Step 7: Parse Decision (using helper script)
const decision = Bash(`./.claude/skills/cfn-product-owner-decision/parse-decision.sh --output "${poOutput}"`);

// Step 8: Validate Deliverables
const deliverableStatus = Bash(`./.claude/skills/cfn-product-owner-decision/validate-deliverables.sh --task-id "${taskId}"`);

if (deliverableStatus === "FAILED" && taskRequiresImplementation) {
  decision = "ITERATE";
}

// Step 9: Execute Decision
if (decision === "PROCEED") {
  Bash("git add . && git commit -m 'feat: $ARGUMENTS' && git push");
  Write(`docs/SPRINT_${iteration}_COMPLETE.md`, generateSummary());
  console.log("✅ Sprint complete - changes committed and pushed");
} else if (decision === "ITERATE") {
  console.log("🔄 Iterating with feedback...");
  // Repeat from Step 4
} else {
  console.log("❌ Max iterations reached - aborting");
}
```

**Why No Coordinator in Task Mode:**
- Main Chat has full visibility already
- Guide provides all coordination logic
- Direct Task() spawning is simpler
- No abstraction layer needed
- Easier debugging (no coordinator to trace through)

### Step 3: Autonomous Execution (CLI Mode Only)

**This applies to CLI Mode only.** Task Mode follows the workflow above (Step 2).

The coordinator runs the orchestrator script internally, which:

**Loop 3: Implementation**
- Spawns workers via CLI: `npx cfn-spawn agent <agent-type>`
- Each agent completes work and reports confidence
- Orchestrator collects scores and checks gate threshold
- **PASS** (≥0.75) → Signal Loop 2 to start
- **FAIL** (<0.75) → Wake Loop 3 for iteration N+1

**Loop 2: Validation**
- **WAITS** for Loop 3 gate pass signal (Redis BLPOP)
- Spawns validators via CLI
- Each validator reviews and reports consensus score
- Orchestrator collects scores and checks consensus threshold
- **PASS** (≥0.90) → Task complete
- **FAIL** (<0.90) → Wake all agents for iteration N+1

**Loop 1: Product Owner**
- Reviews final consensus and acceptance criteria
- Makes autonomous go/no-go decision (PROCEED/ITERATE/ABORT)
- **If PROCEED:**
  - Validates deliverables exist (git status check)
  - Creates structured git commit:
    ```bash
    git add .
    git commit -m "$(cat <<'EOF'
    feat(cfn-loop): [task description]

    Deliverables:
    - [files created/modified]

    Validation:
    - Consensus: [0.XX]
    - Iterations: Loop 3: [N], Loop 2: [M]
    - Tests: [status]

    🤖 Generated with [Claude Code](https://claude.com/claude-code)
    Co-Authored-By: Claude <noreply@anthropic.com>
    EOF
    )"
    git push origin main
    ```
  - Generates sprint summary: `docs/SPRINT_${ITERATION}_COMPLETE.md`
- **If ITERATE:** Wake agents for iteration N+1
- **If ABORT:** Exit with error report
- Returns structured result to Main Chat

### Step 4: Visibility via Web Portal

**Real-time monitoring:**
```bash
# View all agents
./.claude/skills/cfn-web-portal/invoke-portal-agents.sh --swarm cfn-<phase-name>

# Track phase events
./.claude/skills/cfn-web-portal/invoke-portal-events.sh --phase <phase-name>

# Get consensus metrics
./.claude/skills/cfn-web-portal/invoke-portal-metrics.sh --view consensus

# Dashboard summary
./.claude/skills/cfn-web-portal/invoke-portal-dashboard.sh
```

**Web UI:**
- Navigate to http://localhost:3000
- View agent hierarchy, confidence scores, event timeline
- Real-time updates via WebSocket

## Return-to-Chat Triggers

Coordinators return to chat ONLY for:

### 1. Human Decision Required
- **Architectural Changes**: Major design decisions needing human input
- **Budget/Timeline Adjustments**: Resource allocation changes
- **Stakeholder Approval**: Business-level decisions required
- **Critical Technical Blockers**: Issues requiring expert intervention

### 2. Sprint Completion
- **All Phases Complete**: Entire task finished successfully
- **Final Deliverables Ready**: Package results for review
- **Next Sprint Planning**: Handoff for future work

### 3. Escalation Scenarios
- **Max Iterations Reached**: Unable to complete within limits
- **Critical Failures**: System-level issues blocking progress
- **Resource Exhaustion**: Time/budget limits exceeded

**All other scenarios** continue autonomously without human intervention.

## Autonomous Execution Rules

**FORBIDDEN:**
- ❌ "Should I retry?" (COORDINATOR handles automatically)
- ❌ "Proceed to consensus?" (COORDINATOR decides based on mode)
- ❌ Waiting for approval during CFN Loop cycles
- ❌ Direct worker spawning (use coordinator instead)

**REQUIRED:**
- ✅ ALWAYS spawn coordinator first based on mode
- ✅ PASS detailed instructions path to coordinator
- ✅ COORDINATOR handles all loop execution internally
- ✅ ONLY return to chat for defined triggers
- ✅ MAINTAIN autonomous execution for all other scenarios

## Mode-Specific Behaviors

### MVP Mode Characteristics
- **Rapid Iteration**: Fast development cycles
- **Cost Optimization**: Minimal resource usage
- **Core Functionality**: Essential features only
- **Quick Validation**: Simplified review process

### Standard Mode Characteristics
- **Balanced Approach**: Quality vs speed trade-off
- **Comprehensive Validation**: Standard review process
- **Iterative Development**: Thorough refinement cycles
- **Autonomous Decisions**: Most scenarios handled automatically

### Enterprise Mode Characteristics
- **High Quality**: Comprehensive validation and testing
- **Thorough Review**: Multiple stakeholder validation
- **Risk Mitigation**: Extensive error handling and recovery
- **Documentation**: Detailed process documentation

## Integration with Other CFN Commands

- **Single task**: Use `/cfn-loop` (this command)
- **Multiple sprints**: Use `/cfn-loop-sprints`
- **Multi-phase epic**: Use `/cfn-loop-epic`
- **Direct single task**: Use `/cfn-loop-single`

## Example Execution

```
[Turn 1] /cfn-loop "Implement JWT auth" --phase=auth --mode=mvp
         → Spawn cfn-coordinator-mvp
         → Load mvp-instructions.md
         → Execute 3-loop process autonomously
         → MVP workers: 2, validators: 2, thresholds: 70%/80%
         → Continue until return-to-chat triggers

[Turn 2] /cfn-loop "Enterprise security audit" --mode=enterprise
         → Spawn cfn-coordinator-enterprise
         → Load enterprise-instructions.md
         → Execute comprehensive validation
         → Enterprise workers: 5, validators: 5, thresholds: 85%/95%
         → Return only for critical decisions
```