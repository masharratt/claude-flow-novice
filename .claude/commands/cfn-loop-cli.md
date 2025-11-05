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
- Main Chat spawns **single coordinator agent**
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

## How CLI Mode Works

1. **Main Chat** spawns a single `cfn-v3-coordinator` agent
2. **Coordinator** orchestrates the entire CFN Loop workflow
3. **Loop 3** agents implement the solution and validate against quality gates
4. **Loop 2** agents review and provide validation feedback
5. **Product Owner** makes the final decision on deliverables
6. **Background execution** with Redis coordination for scalability

The coordinator handles all agent spawning internally using optimized CLI processes.

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

**Web Portal Access:**
- Monitor real-time agent progress at http://localhost:3000
- View detailed execution logs and health status
- Track iteration progress and confidence scores

## Usage Examples

**Simple API Development:**
```bash
/cfn-loop-cli "Build REST API with user authentication"
```

**Complex Feature with High Quality Requirements:**
```bash
/cfn-loop-cli "Implement payment processing with PCI compliance" --mode=enterprise --max-iterations=15
```

**Quick Prototype:**
```bash
/cfn-loop-cli "Build MVP landing page" --mode=mvp
```

**Infrastructure Deployment:**
```bash
/cfn-loop-cli "Set up CI/CD pipeline for microservices"
```

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

## 🚨 EXECUTION INSTRUCTIONS (Internal Use)

**Main Chat: Spawn coordinator via CLI after slash command processing:**

```bash
# Generate unique task ID
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"

# Extract task description and mode from slash command
TASK_DESCRIPTION="$ARGUMENTS"
MODE="${mode:-standard}"
MAX_ITERATIONS="${maxIterations:-10}"

# Determine appropriate agents based on task complexity
TASK_COMPLEXITY="standard"  # auto-detect or pass from command
case "$TASK_COMPLEXITY" in
  "simple")
    LOOP3_AGENTS="backend-dev,researcher"
    LOOP2_AGENTS="reviewer,tester"
    ;;
  "standard")
    LOOP3_AGENTS="backend-dev,researcher,devops"
    LOOP2_AGENTS="reviewer,tester,architect,security-specialist"
    ;;
  "complex")
    LOOP3_AGENTS="backend-dev,researcher,devops,rust-developer"
    LOOP2_AGENTS="reviewer,tester,architect,security-specialist,code-analyzer"
    ;;
esac

# Spawn coordinator via CLI (background execution)
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "$TASK_ID" \
  --context "TASK_DESCRIPTION='$TASK_DESCRIPTION' MODE='$MODE' MAX_ITERATIONS=$MAX_ITERATIONS LOOP3_AGENTS='$LOOP3_AGENTS' LOOP2_AGENTS='$LOOP2_AGENTS'" \
  --timeout 300

# Monitor progress (optional)
# redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"
```

**CLI Coordinator Spawning Pattern:**

```bash
# Direct CLI coordinator spawning (no Task() involved)
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "unique-task-id" \
  --context "task description; mode; max-iterations; agent-config" \
  --timeout 300
```

**Why This Pattern:**
- ✅ All execution via CLI (no Task() tool)
- ✅ Background execution with monitoring
- ✅ Z.ai routing automatically applied to CLI agents
- ✅ Redis coordination for agent communication
- ✅ 95-98% cost savings vs Task tool
- ✅ Enhanced monitoring and recovery capabilities
- ✅ Clean separation: Main Chat → CLI Coordinator → CLI Workers

**Version:** 3.0.1 (2025-11-05) - Fixed CLI architecture: Correct coordinator spawning pattern via CLI instead of Task()