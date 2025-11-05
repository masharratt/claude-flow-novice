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

**THIS IS A SLASH COMMAND - MAIN CHAT EXECUTES THIS DIRECTLY**

**DO NOT manually spawn Task() agents for CFN Loop workflows**
**DO NOT spawn cfn-v3-coordinator manually**
**DO NOT spawn Loop 3 agents (backend-dev, researcher, etc.)**
**DO NOT spawn Loop 2 agents (reviewer, tester, etc.)**
**DO NOT spawn product-owner**

**Main Chat simply executes the slash command - everything else is automatic**

---

## How This Command Works:

When Main Chat executes `/cfn-loop-cli "task description"`, this slash command:

1. **Automatically spawns cfn-v3-coordinator** with proper parameters
2. **Coordinator invokes enhanced orchestrator** with monitoring v3.0
3. **Orchestrator spawns all agents via CLI** (background execution)
4. **Handles complete CFN Loop workflow** with real-time monitoring
5. **Returns structured result** to Main Chat when complete

## Enhanced Features v3.0:

- ✅ **Real-time monitoring** with automatic stuck agent recovery
- ✅ **Process health checking** and dead process cleanup
- ✅ **Protocol compliance** preventing "consensus on vapor" anti-patterns
- ✅ **Progress visibility** with detailed timestamped reports
- ✅ **95-98% cost savings** with Z.ai routing optimization
- ✅ **Background execution** with Redis persistence

## Main Chat Execution Rules

**THIS SLASH COMMAND HANDLES EVERYTHING AUTOMATICALLY**

**Main Chat simply executes:**
```bash
/cfn-loop-cli "Task description" --mode=standard
```

**The slash command automatically:**
- ✅ Spawns coordinator with proper parameters
- ✅ Handles all agent spawning via CLI
- ✅ Manages complete CFN Loop workflow
- ✅ Returns structured result when complete

**Main Chat should NOT:**
- ❌ Manually spawn any Task() agents for CFN Loop
- ❌ Ask about retry/iteration decisions (handled automatically)
- ❌ Monitor agent progress (slash command handles this)
- ❌ Coordinate between agents (built-in coordination)

## CLI Mode Benefits

**Cost Savings:**
- 64% savings with Z.ai routing vs all-Anthropic
- 95-98% savings vs Task tool spawning
- Scales linearly with iterations (Task mode scales exponentially)

**Production Features v3.0:**
- Background execution (no timeout issues)
- Redis state persistence (crash recovery)
- Zero-token waiting (BLPOP blocks without API calls)
- Web portal visibility (http://localhost:3000)
- **Enhanced monitoring**: Real-time agent progress tracking
- **Automatic recovery**: Dead process cleanup and agent restart
- **Protocol compliance**: Prevents "consensus on vapor" anti-patterns
- **Progress visibility**: Detailed reports with timestamps and health status

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
