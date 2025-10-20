---
description: "Execute autonomous 3-loop self-correcting CFN workflow with automatic retry and consensus validation"
argument-hint: "<task description> [--phase=name] [--mode=mvp|standard|enterprise] [--max-loop2=10] [--max-loop3=10]"
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
/cfn-loop "Implement JWT authentication" --phase=implementation --mode=standard
/cfn-loop "Fix security vulnerabilities" --phase=security-audit --mode=enterprise --max-loop2=10
/cfn-loop "Build MVP feature" --phase=mvp-dev --mode=mvp --max-loop3=5
/cfn-loop "Refactor API layer" --mode=standard --max-loop3=15
/cfn-loop "Add test coverage for auth module" --phase=testing --max-loop2=10
```

**Options:**
- `--phase=<name>`: Optional phase name for tracking
- `--mode=<mvp|standard|enterprise>`: Coordinator mode (default: standard)
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
- `--mode=mvp|standard|enterprise` (default: standard)
- `--phase=<name>` (optional phase identifier)
- `--max-loop2=<n>` (max consensus iterations, default: 10)
- `--max-loop3=<n>` (max implementation iterations, default: 10)

### Step 2: Spawn Coordinator Agent (SINGLE AGENT PATTERN)

```javascript
Task("cost-savings-cfn-loop-coordinator", `
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

     ./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
       --task-id "$TASK_ID" \
       --mode "$MODE" \
       --loop3-agents "$LOOP3_AGENTS" \
       --loop2-agents "$LOOP2_AGENTS" \
       --product-owner "product-owner" \
       --max-iterations 10

  2. MONITOR PROGRESS:
     - Use web portal: http://localhost:3000
     - Query metrics: ./.claude/skills/web-portal/invoke-portal-metrics.sh
     - Track events: ./.claude/skills/web-portal/invoke-portal-events.sh --phase <phase-name>

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
`, "cost-savings-cfn-loop-coordinator")
```

### Step 3: Coordinator Autonomous Execution

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
- Makes autonomous go/no-go decision
- Returns structured result to Main Chat

### Step 4: Visibility via Web Portal

**Real-time monitoring:**
```bash
# View all agents
./.claude/skills/web-portal/invoke-portal-agents.sh --swarm cfn-<phase-name>

# Track phase events
./.claude/skills/web-portal/invoke-portal-events.sh --phase <phase-name>

# Get consensus metrics
./.claude/skills/web-portal/invoke-portal-metrics.sh --view consensus

# Dashboard summary
./.claude/skills/web-portal/invoke-portal-dashboard.sh
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