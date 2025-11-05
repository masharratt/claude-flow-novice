---
description: "Execute CFN Loop in CLI mode (production, cost-optimized, 95-98% savings)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--max-iterations=n]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash"]
---

# CFN Loop CLI Mode - Production Execution

Execute CFN Loop using CLI spawning for maximum cost savings (95-98% vs Task tool).

🚨 **CLI MODE: Production, Cost-Optimized, Background Execution**

**Task**: $ARGUMENTS

## What is CLI Mode?

**CLI Mode Architecture v3.0 (Enhanced):**
- Main Chat spawns **single coordinator agent** via Task()
- Enhanced coordinator spawns **all workers via CLI** with protocol compliance
- CLI agents use **Z.ai custom routing** (when enabled)
- **Real-time monitoring** with automatic recovery from stuck agents
- Background execution with **Redis monitoring** and progress visibility
- **95-98% cost savings** vs Task tool spawning
- **Enhanced features**: Process health checking, context validation, broadcast protocol

**Cost Breakdown:**
```
┌─────────────────────┬──────────────┬────────────┐
│ Component           │ Provider     │ Cost/Call  │
├─────────────────────┼──────────────┼────────────┤
│ Main Chat           │ Anthropic    │ $0.015     │
│ Coordinator (Task)  │ Anthropic    │ $0.015     │
│ Loop 3 Agents (CLI) │ Z.ai         │ $0.003 ea  │
│ Loop 2 Agents (CLI) │ Z.ai         │ $0.003 ea  │
│ Product Owner (CLI) │ Z.ai         │ $0.003     │
└─────────────────────┴──────────────┴────────────┘

Total per iteration: ~$0.054 (vs $0.150 Task mode)
Savings: 64% with custom routing, 95-98% vs all-Task
```

## Prerequisites

**Enable Z.ai Custom Routing (One-Time Setup):**
```bash
/switch-api zai
```

**Verify Status:**
```bash
/switch-api status
# Expected: Main Chat=Anthropic, Task=Anthropic, CLI=Z.ai
```

## Command Options

```bash
# Standard mode (recommended)
/cfn-loop-cli "Implement JWT authentication"

# MVP mode (fast, lower quality gates)
/cfn-loop-cli "Build prototype feature" --mode=mvp

# Enterprise mode (high quality, more validators)
/cfn-loop-cli "Production security feature" --mode=enterprise --max-iterations=15
```

**Options:**
- `--mode=<mvp|standard|enterprise>`: Quality mode (default: standard)
- `--max-iterations=<n>`: Max iterations per loop (default: 10)

## Mode Comparison

| Mode | Gate | Consensus | Iterations | Validators | Use Case |
|------|------|-----------|------------|------------|----------|
| MVP | ≥0.70 | ≥0.80 | 5 | 2 | Prototypes, proof-of-concept |
| Standard | ≥0.75 | ≥0.90 | 10 | 3-4 | Production features |
| Enterprise | ≥0.85 | ≥0.95 | 15 | 5 | Security, compliance, critical systems |

## 🚨 CRITICAL EXECUTION INSTRUCTIONS

**YOU ARE MAIN CHAT. YOU SPAWN ONLY ONE AGENT: cfn-v3-coordinator**

**DO NOT spawn Loop 3 agents (backend-dev, researcher, etc.)**
**DO NOT spawn Loop 2 agents (reviewer, tester, etc.)**
**DO NOT spawn product-owner**
**DO NOT ask user which agents to use**

The coordinator handles ALL agent spawning internally via CLI.

---

### Execute This Task() Call:

```javascript
Task("cfn-v3-coordinator", `
  CFN LOOP CLI MODE - PRODUCTION EXECUTION

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK SPECIFICATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Task Description: $ARGUMENTS
  Task ID: cfn-cli-$(date +%s)
  Mode: ${mode.toUpperCase()}

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SUCCESS CRITERIA
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Acceptance Criteria:
  - [ ] Core functionality implemented
  - [ ] All tests pass with >80% coverage
  - [ ] Security review completed
  - [ ] Documentation updated
  - [ ] No regression in existing features

  Quality Gates (${mode.toUpperCase()} MODE):
  - Loop 3 Gate Threshold: ${mode === 'enterprise' ? 0.85 : mode === 'standard' ? 0.75 : 0.70}
  - Loop 2 Consensus Threshold: ${mode === 'enterprise' ? 0.95 : mode === 'standard' ? 0.90 : 0.80}
  - Max Iterations: ${maxIterations}

  Definition of Done:
  - Consensus ≥ threshold achieved
  - All acceptance criteria met
  - Product Owner approval received

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ORCHESTRATION CONFIGURATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mode: ${mode.toUpperCase()}

  Loop 3 Agents (Implementation) - SELECT BASED ON TASK:
  Examples:
  - Backend API: backend-dev, researcher, devops
  - Full-Stack: backend-dev, react-frontend-engineer, devops
  - Infrastructure: devops, rust-developer, researcher
  - Security: security-specialist, backend-dev, researcher

  Loop 2 Agents (Validation) - SCALE BY COMPLEXITY:
  Simple (1-2 files): reviewer, tester
  Standard (3-5 files): reviewer, tester, architect, security-specialist
  Complex (>5 files): +code-analyzer, +performance-benchmarker

  Product Owner: product-owner

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  EXECUTION INSTRUCTIONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. INVOKE ORCHESTRATOR (CLI spawning):

     TASK_ID="cfn-cli-$(date +%s)"
     MODE="${mode}"
     LOOP3_AGENTS="backend-dev,researcher,devops"  # Customize for task
     LOOP2_AGENTS="reviewer,tester,architect,security-specialist"  # Scale by complexity

     ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \\
       --task-id "$TASK_ID" \\
       --mode "$MODE" \\
       --loop3-agents "$LOOP3_AGENTS" \\
       --loop2-agents "$LOOP2_AGENTS" \\
       --product-owner "product-owner" \\
       --max-iterations ${maxIterations}

  2. ORCHESTRATOR HANDLES:
     - Spawns all agents via CLI (background)
     - Loop 3: Gate check (≥threshold) → PASS/ITERATE
     - Loop 2: Consensus check (≥threshold) → COMPLETE/ITERATE
     - Product Owner: PROCEED/ITERATE/ABORT decision
     - Git commit/push on PROCEED
     - Returns structured result to Main Chat

  3. RETURN STRUCTURED RESULT:
     {
       "taskId": "cfn-cli-XXXXX",
       "status": "complete|failed",
       "iterations": {"loop3": N, "loop2": M},
       "finalConsensus": 0.XX,
       "acceptanceCriteria": {
         "met": [...],
         "pending": [...]
       },
       "deliverables": [...],
       "recommendations": [...]
     }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  CRITICAL RULES
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  - DO NOT spawn agents with Task() - orchestrator uses CLI
  - ALL agents run in background via npx claude-flow-novice
  - USE Redis BLPOP for loop dependencies
  - AGENTS use Z.ai routing automatically (when enabled)
  - RETURN structured result when complete
`, "cfn-v3-coordinator")
```

## Autonomous Execution Rules

**YOU ARE FORBIDDEN FROM:**
- ❌ Asking "Should I retry?" (coordinator handles automatically)
- ❌ Asking "Proceed to consensus?" (orchestrator decides)
- ❌ Waiting for approval during CFN Loop cycles
- ❌ Spawning workers with Task() (use coordinator only)

**YOU MUST:**
- ✅ ALWAYS spawn single coordinator agent
- ✅ LET coordinator invoke orchestrator internally
- ✅ COORDINATOR handles all loop execution autonomously
- ✅ ONLY return to chat when complete or blocked

## CLI Mode Benefits

**Cost Savings:**
- 64% savings with Z.ai routing vs all-Anthropic
- 95-98% savings vs Task tool spawning
- Scales linearly with iterations (Task mode scales exponentially)

**Production Features:**
- Background execution (no timeout issues)
- Redis state persistence (crash recovery)
- Zero-token waiting (BLPOP blocks without API calls)
- Web portal visibility (http://localhost:3000)

**Performance:**
- Parallel agent spawning (no sequential bottleneck)
- Instant wake-up (<100ms latency)
- Scalable (10+ agents, indefinite cycles)

## When to Use CLI Mode

**Use CLI Mode for:**
- ✅ Production features
- ✅ Long-running tasks (>10 min)
- ✅ Multi-iteration workflows
- ✅ Cost-sensitive projects
- ✅ Background execution

**Use Task Mode for:**
- Debugging (full visibility needed)
- Learning CFN Loop workflow
- Short prototypes (<5 min)
- Single-iteration tasks

## Troubleshooting

**Custom routing not working:**
```bash
/switch-api status  # Check current provider
/switch-api zai     # Enable Z.ai routing
```

**Coordinator timeout:**
- Expected for long tasks (>10 min)
- Check web portal for progress: http://localhost:3000
- Query Redis: `redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"`

**No deliverables created:**
- Orchestrator validates deliverables before PROCEED
- Will force ITERATE if git diff shows zero changes
- Check coordinator output for validation failures

## Related Commands

- **Task Mode**: `/cfn-loop-task` (debugging, full visibility)
- **Frontend**: `/cfn-loop-frontend` (visual iteration workflow)
- **Documentation**: `/cfn-loop-document` (generate docs)

## Related Documentation

- Task Mode Guide: `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md`
- Coordinator Parameters: `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`
- Redis Coordination: `.claude/skills/cfn-redis-coordination/SKILL.md`
- Orchestration: `.claude/skills/cfn-loop-orchestration/SKILL.md`

---

**Version:** 1.0.0 (2025-10-31) - CLI mode: production execution, cost-optimized, background processing
