---
description: "Execute CFN Loop in CLI mode (production, cost-optimized, 95-98% savings)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--max-iterations=n]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash"]
---

# CFN Loop CLI Mode - Production Execution

🚨 **IMPORTANT: This slash command MUST auto-execute the coordinator spawn via Bash tool.**

**DO NOT just show instructions. EXECUTE the bash command immediately after reading this.**

---

## Execution Instructions (AUTO-EXECUTE)

**Step 1: Parse Arguments**
```
TASK_DESCRIPTION: $ARGUMENTS (extract task, remove flags)
MODE: Parse from --mode flag or default to "standard"
MAX_ITERATIONS: Parse from --max-iterations flag or default to 10
```

**Step 2: Set Redis Environment Variables (REQUIRED for non-Docker environments)**
```bash
# Set Redis connection parameters for CLI mode
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379

echo "✅ Redis environment: $CFN_REDIS_HOST:$CFN_REDIS_PORT"
```

**Step 3: Generate Task ID**
```bash
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"
```

**Step 4: Verify Redis Availability (REQUIRED for CLI mode coordination)**
```bash
# Verify Redis availability (REQUIRED for CLI mode coordination)
if ! redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" PING >/dev/null 2>&1; then
  echo "❌ ERROR: Redis not available at $CFN_REDIS_HOST:$CFN_REDIS_PORT"
  echo "   CLI mode requires Redis for coordination"
  echo "   Start Redis: redis-server"
  echo "   Or use Task mode: /cfn-loop-task"
  exit 1
fi

echo "✅ Redis available at $CFN_REDIS_HOST:$CFN_REDIS_PORT"
```

**Step 5: Spawn Coordinator (REQUIRED - Execute this command now via Bash tool)**
```bash
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "$TASK_ID" \
  --context "TASK_DESCRIPTION='$TASK_DESCRIPTION' MODE='$MODE' MAX_ITERATIONS=$MAX_ITERATIONS CFN_DOCKER_MODE='true'" \
  --timeout 300 \
  --background=true
```

**Step 6: Inform User**
After spawning coordinator, tell user:
- ✅ CFN Loop coordinator spawned with task ID: $TASK_ID
- 📊 Monitor progress: `redis-cli -h $CFN_REDIS_HOST -p $CFN_REDIS_PORT HGETALL "cfn_loop:task:$TASK_ID:context"`
- 🌐 Web dashboard: http://localhost:3000

---

## Background Information (DO NOT show this to user unless they ask)

**Task**: $ARGUMENTS

## What is CLI Mode?

**CLI Mode Architecture v3.0 (Enhanced):**
- Main Chat processes **slash command** then spawns coordinator agent via CLI with background=true
- Coordinator spawns **all workers via CLI** with background=true for cost optimization
- All CLI agents use **Z.ai custom routing** (when enabled)
- **Real-time monitoring** with automatic recovery from stuck agents
- Background execution with **Redis monitoring** and progress visibility
- **Enhanced features**: Process health checking, context validation, broadcast protocol


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

**Usage Examples:**
```
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
| Standard | ≥0.95 | ≥0.90 | 10 | 3-4 | Production features |
| Enterprise | ≥0.98 | ≥0.95 | 15 | 5 | Security, compliance, critical systems |

## How CLI Mode Works

1. **Main Chat** invokes `/cfn-loop-cli` slash command
2. **SlashCommand tool** processes command and returns execution instructions to Main Chat
3. **Main Chat** spawns `cfn-v3-coordinator` agent via bash with background=true
4. **Coordinator** orchestrates the entire CFN Loop workflow in the background
5. **Coordinator** spawns **Loop 3 workers via CLI** with background=true
6. **Loop 3** agents implement the solution and validate against quality gates
7. **Coordinator** spawns **Loop 2 workers via CLI** for validation
8. **Product Owner** makes the final decision on deliverables
9. **Background execution** with Redis coordination for scalability

**CLI Architecture Pattern:**
- Main Chat → SlashCommand (processing) → Main Chat spawns coordinator via bash
```bash
npx claude-flow-novice agent cfn-v3-coordinator \
    --task-id "cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}" \    
    --context "TASK_DESCRIPTION='Fix core infrastructure
  dependencies' MODE='standard' MAX_ITERATIONS=10" \
    --timeout 300 \
    --background=true
```
- All agents spawned via CLI by coordinator with Z.ai routing and background execution
- Background execution enables monitoring and recovery capabilities

## Main Chat Monitoring Instructions

**After spawning the coordinator, Main Chat should:**

### 1. Immediate Verification (First 30 seconds)
```bash
# Verify coordinator spawned successfully
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"
pgrep -f "cfn-v3-coordinator" && echo "✅ Coordinator running" || echo "❌ Coordinator failed"

# Check Redis context was created
redis-cli EXISTS "cfn_loop:task:$TASK_ID:context" && echo "✅ Context stored" || echo "❌ No context"
```

### 2. Progress Monitoring (Every 2-5 minutes for long tasks)
```bash
# Check iteration progress and confidence scores
redis-cli HGETALL "cfn_loop:task:$TASK_ID:context" | grep -E "(iteration|confidence|status)"

# Monitor agent completion status
redis-cli LRANGE "swarm:${TASK_ID}:agent:status" 0 -1

# Quick health check
redis-cli HGET "cfn_loop:task:$TASK_ID:health" "coordinator"
```

### 3. Web Portal Monitoring (Recommended for >10 minute tasks)
```bash
# Start monitoring dashboard
npm run portal:start

# Access real-time progress at http://localhost:3000
# - Live agent status dashboard
# - Iteration progress visualization
# - Confidence score trends
# - Error rate monitoring
```

### 4. Background Execution Monitoring Pattern
```bash
# For long-running tasks, use this monitoring pattern:
sleep 300  # Wait 5 minutes
redis-cli HGETALL "cfn_loop:task:$TASK_ID:context" | grep status

# If still running, continue monitoring
if [ $? -eq 0 ]; then
    echo "Task in progress, monitoring..."
    sleep 300  # Wait another 5 minutes
    redis-cli HGETALL "cfn_loop:task:$TASK_ID:context" | grep status
fi
```

### 5. Troubleshooting If Coordinator Fails
```bash
# Investigate missing coordinator
./.claude/skills/cfn-loop-orchestration/investigate-missing-coordinator.sh "$TASK_ID"

# Check for process issues
ps aux | grep "claude-flow-novice agent" | grep -v grep

# Verify Redis connectivity
redis-cli PING
```

## CLI Mode Benefits

**Performance:**
- Scales linearly with iterations (Task mode scales exponentially)
- Background execution without timeout limitations
- Parallel agent spawning for improved throughput

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

## Enhanced Monitoring v3.0

CLI mode includes comprehensive monitoring capabilities for production workflows:

### Real-Time Progress Tracking
- **Agent Status**: Monitor individual agent health and progress
- **Iteration Progress**: Track confidence scores and gate validation
- **Resource Usage**: CPU, memory, and Redis connection monitoring
- **Error Detection**: Automatic identification of stuck or failed agents

### Monitoring Commands

**Check Task Status:**
```bash
# View complete task context and progress
redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"

# Monitor agent completion status
redis-cli LRANGE "swarm:${TASK_ID}:agent:status" 0 -1
```

**Agent Health Monitoring:**
```bash
# Check if coordinator is running
pgrep -f "cfn-v3-coordinator" && echo "Coordinator alive" || echo "Coordinator missing"

# Monitor active agent processes
ps aux | grep "claude-flow-novice agent" | grep -v grep

# Check Redis connectivity
redis-cli PING
```

**Progress Monitoring:**
```bash
# Real-time agent completion monitoring
watch -n 5 'redis-cli HGETALL "cfn_loop:task:$TASK_ID:context" | grep -E "(iteration|confidence|status)"'

# Monitor agent signals
redis-cli PUBLISH "swarm:${TASK_ID}:monitor" "status_check"
```

### Automatic Recovery Features

**Dead Process Detection:**
- Automatically detects and reports stuck agents
- Process health checking with configurable timeouts
- Automatic cleanup of orphaned Redis connections

**Agent Restart Capability:**
- Coordinator can restart failed agents automatically
- Context preservation across agent restarts
- Iteration state recovery from Redis persistence

**Error Recovery Patterns:**
- Timeout detection and agent termination
- Context validation before spawning replacements
- Graceful degradation with partial agent sets

### Monitoring Dashboard Features

**Web Portal (http://localhost:3000):**
- Live agent status dashboard
- Iteration progress visualization
- Confidence score trends
- Error rate monitoring
- Resource usage graphs

**CLI Monitoring Tools:**
- `cfn-portal` - Start/stop monitoring dashboard
- `cfn-context` - Query task context and status
- `cfn-metrics` - View performance analytics
- `cfn-redis` - Direct Redis inspection tools

### Troubleshooting Monitoring Issues

**Missing Coordinator:**
```bash
# Investigate coordinator failure
./.claude/skills/cfn-loop-orchestration/investigate-missing-coordinator.sh "$TASK_ID"

# Check for namespace mismatches
redis-cli KEYS "cfn_loop:*" | head -10
```

**Stuck Agents:**
```bash
# Force cleanup of stuck agents
./.claude/skills/cfn-loop-orchestration/cleanup-stuck-agents.sh "$TASK_ID"

# Monitor agent timeouts
redis-cli HGET "cfn_loop:task:$TASK_ID:timeouts" "agent_timeouts"
```

**Redis Connection Issues:**
```bash
# Test Redis connectivity
redis-cli -n 0 PING

# Check Redis memory usage
redis-cli INFO memory | grep used_memory_human

# Monitor Redis keyspace
redis-cli DBSIZE
```

## Usage Examples

**Simple API Development:**
```
/cfn-loop-cli "Build REST API with user authentication"
```

**Complex Feature with High Quality Requirements:**
```
/cfn-loop-cli "Implement payment processing with PCI compliance" --mode=enterprise --max-iterations=15
```

**Quick Prototype:**
```
/cfn-loop-cli "Build MVP landing page" --mode=mvp
```

**Infrastructure Deployment:**
```
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

**Main Chat: Slash command processing followed by CLI coordinator spawning:**

The SlashCommand tool processes the command and returns execution instructions. Main Chat then spawns the coordinator agent using CLI with background=true for monitoring capabilities.

**Coordinator Spawning Pattern:**

```bash
# Generate unique task ID
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"

# Extract task description and mode from slash command
TASK_DESCRIPTION="$ARGUMENTS"
MODE="${mode:-standard}"
MAX_ITERATIONS="${maxIterations:-10}"

# Spawn coordinator via CLI (background execution)
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "$TASK_ID" \
  --context "TASK_DESCRIPTION='$TASK_DESCRIPTION' MODE='$MODE' MAX_ITERATIONS=$MAX_ITERATIONS" \
  --timeout 300 \
  --background=true
```

**Main Chat Execution Command:**

```bash
# Main Chat should execute this command after processing slash command
npx claude-flow-novice agent cfn-v3-coordinator \
  --task-id "cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}" \
  --context "TASK_DESCRIPTION='Fix core infrastructure dependencies - lucide-wrappers.tsx LucideIcon React 18 compatibility, resolve module export errors in types/, establish proper import path resolution' MODE='standard' MAX_ITERATIONS=10" \
  --timeout 300 \
  --background=true
```

**Internal Coordinator Pattern (what the coordinator does):**

```bash
# Generate unique task ID
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"

# Extract task description and mode from slash command arguments
TASK_DESCRIPTION="parsed from $ARGUMENTS"
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

# Coordinator spawns CLI workers (background execution)
npx claude-flow-novice agent "$LOOP3_AGENT" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "Complete deliverables and acceptance criteria" \
  --timeout 300 \
  --background=true

# Monitor progress (required for background tasks)
# redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"
```

**Critical Background Execution Instructions:**

1. **Always use `--background=true`** for CLI mode to enable:
   - Non-blocking coordinator execution
   - Real-time monitoring capabilities
   - Redis state persistence
   - Automatic recovery features

2. **Background execution means:**
   - Coordinator runs independently of Main Chat
   - Main Chat can monitor progress via Redis queries
   - Long-running tasks won't timeout due to Bash tool limitations
   - Web portal can track agent progress in real-time

3. **Without `--background=true`:**
   - Coordinator blocks Main Chat execution
   - No monitoring capabilities
   - Timeouts after 10 minutes (Bash tool limit)
   - No recovery or persistence features

**Why This Pattern:**
- ✅ Coordinator via CLI with background=true for monitoring capabilities
- ✅ All agents via CLI for maximum cost optimization (95-98% savings)
- ✅ Background execution with enhanced monitoring
- ✅ Z.ai routing automatically applied to all CLI agents
- ✅ Redis coordination for agent communication
- ✅ Enhanced monitoring and recovery capabilities
- ✅ Clean separation: Main Chat → SlashCommand (processing) → Main Chat spawns CLI(coordinator) → CLI Workers
- ✅ Production-ready with real-time progress tracking
- ✅ No timeout limitations with `--background=true`

**Enhanced Monitoring Benefits:**
- Real-time agent progress tracking via Redis
- Automatic recovery from stuck agents
- Web portal visibility (http://localhost:3000)
- Process health checking and cleanup
- Context validation and preservation
- Performance metrics and analytics

**Version:** 3.1.0 (2025-11-05) - Removed cost information, added Main Chat monitoring instructions, clarified background execution requirements