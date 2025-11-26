---
description: "Execute CFN Loop in simplified CLI mode (Main Chat coordination, provider routing)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--provider=zai|kimi|anthropic|openrouter] [--model=<model>] [--agents=N] [--threshold=0.75]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "SlashCommand"]
---

# CFN Loop CLI Mode - Parallel Agent Coordination

🚨 **v2.0 ARCHITECTURE:** Main Chat spawns parallel CLI agents with threshold-based completion

---

## Execution Instructions (AUTO-EXECUTE)

**Step 1: Parse Arguments**
```
TASK_DESCRIPTION: $ARGUMENTS (extract task, remove flags)
MODE: Parse from --mode flag or default to "standard"
PROVIDER: Parse from --provider flag or use Main Chat setting
MODEL: Parse from --model flag or use provider default
AGENTS: Parse from --agents flag or default to 4
THRESHOLD: Parse from --threshold flag or default to 0.75 (3/4 agents)
```

**Step 2: Set Environment Variables**
```bash
# Generate task ID
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"
echo "📋 Task ID: $TASK_ID"
echo "🎯 Mode: $MODE"
echo "🤖 Provider: $PROVIDER (from --provider or Main Chat setting)"
echo "👥 Agents: $AGENTS (threshold: $THRESHOLD)"
if [ -n "$MODEL" ]; then
  echo "🧠 Model: $MODEL"
fi

# Set working directory
export PROJECT_ROOT="${PROJECT_ROOT:-$(pwd)}"
export TASK_ID="$TASK_ID"
export MODE="$MODE"
```

**Step 3: Verify Redis Availability (Required for coordination)**
```bash
# Check Redis connection
if ! redis-cli ping >/dev/null 2>&1; then
  echo "❌ ERROR: Redis not available for Main Chat coordination"
  echo ""
  echo "   CLI mode requires Redis for agent coordination."
  echo "   Options:"
  echo "   1. Start Redis: docker-compose up -d redis"
  echo "   2. Use Task mode instead: /cfn-loop-task \"<task>\""
  exit 1
fi

echo "✅ Redis available for Main Chat coordination"
```

**Step 4: Spawn Parallel CLI Agents**
```bash
# Define agent types based on task complexity
# For comprehensive tasks, spawn multiple specialized agents
AGENT_TYPES=("backend-developer" "tester" "code-reviewer" "security-specialist")

echo "🚀 Spawning $AGENTS parallel CLI agents..."

# Spawn agents in BACKGROUND (use & to allow Main Chat to continue)
for i in $(seq 1 $AGENTS); do
  AGENT_TYPE="${AGENT_TYPES[$((i-1)) % ${#AGENT_TYPES[@]}]}"
  AGENT_ID="${AGENT_TYPE}-${TASK_ID}-${i}"

  echo "  → Spawning agent $i: $AGENT_TYPE ($AGENT_ID)"

  npx claude-flow-novice agent "$AGENT_TYPE" \
    --task-id "$TASK_ID" \
    --mode "$MODE" \
    --provider "$PROVIDER" \
    --context "$TASK_DESCRIPTION" \
    </dev/null >/tmp/agent-${AGENT_ID}.log 2>&1 &
done

echo "✅ All $AGENTS CLI agents spawned with Task ID: $TASK_ID"
```

**Step 5: Wait for Threshold Completion (FOREGROUND - Required for Main Chat)**
```bash
# CRITICAL: Run monitor in FOREGROUND so Main Chat receives completion signal
# DO NOT use run_in_background for this monitoring loop

COMPLETION_QUEUE="cfn:cli:${TASK_ID}:completion"
REQUIRED=$(echo "$AGENTS * $THRESHOLD" | bc | cut -d. -f1)

echo "⏳ Monitoring for completion (${REQUIRED}/$AGENTS agents)..."
echo "📊 Queue: $COMPLETION_QUEUE"
echo ""

COMPLETED=0
END_TIME=$(($(date +%s) + 300))  # 5 minute timeout

while [ $(date +%s) -lt $END_TIME ] && [ $COMPLETED -lt $REQUIRED ]; do
  QUEUE_LEN=$(redis-cli LLEN "$COMPLETION_QUEUE" 2>/dev/null || echo "0")

  if [ "$QUEUE_LEN" -gt 0 ]; then
    SIGNAL=$(redis-cli LPOP "$COMPLETION_QUEUE")
    if [ -n "$SIGNAL" ] && [ "$SIGNAL" != "(nil)" ]; then
      COMPLETED=$((COMPLETED + 1))
      AGENT_ID=$(echo "$SIGNAL" | jq -r '.agentId' 2>/dev/null || echo "unknown")
      CONFIDENCE=$(echo "$SIGNAL" | jq -r '.confidence' 2>/dev/null || echo "N/A")
      PROVIDER=$(echo "$SIGNAL" | jq -r '.provider' 2>/dev/null || echo "N/A")

      echo "✅ Agent $COMPLETED completed: $AGENT_ID"
      echo "   Confidence: $CONFIDENCE, Provider: $PROVIDER"
      echo ""

      if [ $COMPLETED -ge $REQUIRED ]; then
        echo "🎉 THRESHOLD MET! ($COMPLETED/$AGENTS agents)"
        echo "✅ CFN Loop CLI task completed"
        exit 0
      fi
    fi
  fi

  sleep 3
done

echo "⏰ Timeout: Only $COMPLETED/$AGENTS agents completed"
exit 1
```

**Step 6: Query Agent Status (Optional - Interactive)**
```bash
# Main Chat can query individual agent status during execution
# Example: npx tsx src/cli/coordination/agent-messaging.ts status --task-id "$TASK_ID" --agent-id <agent-id>

# Or send commands to running agents:
# npx tsx src/cli/coordination/agent-messaging.ts send --task-id "$TASK_ID" --agent-id <agent-id> --command status
```

**Step 7: Inform User**
Report completion status, which agents completed, and any additional information.

---

## Background Information (DO NOT show this to user unless they ask)

**Task**: $ARGUMENTS

## What is CLI Mode?

**v2.0 CLI Mode Architecture (Parallel + Messaging):**
- **Main Chat** spawns multiple CLI agents in parallel
- **CLI agents** execute tasks and send Redis completion signals
- **Main Chat** waits for threshold completion (e.g., 3/4 agents)
- **Bidirectional messaging** - Main Chat can send commands to running agents
- **Provider routing** via `--provider` and `--model` flags
- **Graceful degradation** - continues when threshold met, doesn't wait for stragglers

## New Features (v2.0)

### Parallel Agent Spawning
- Spawn multiple agents simultaneously (default: 4)
- Each agent works independently on the task
- Different agent types for comprehensive coverage

### Threshold-Based Completion
- Exit when N/M agents complete (default: 75%)
- Don't wait for slow/stuck agents
- Configurable via `--threshold` flag

### Bidirectional Messaging
Main Chat can communicate with running agents:

**Query agent status:**
```bash
npx tsx src/cli/coordination/agent-messaging.ts status \
  --task-id "$TASK_ID" --agent-id <agent-id>
```

**Send commands to agents:**
```bash
# Request status update
npx tsx src/cli/coordination/agent-messaging.ts send \
  --task-id "$TASK_ID" --agent-id <agent-id> --command status

# Redirect agent to new task
npx tsx src/cli/coordination/agent-messaging.ts send \
  --task-id "$TASK_ID" --agent-id <agent-id> --command redirect \
  --payload '{"newTask": "Focus on security tests"}'

# Abort agent
npx tsx src/cli/coordination/agent-messaging.ts send \
  --task-id "$TASK_ID" --agent-id <agent-id> --command abort

# Pause agent
npx tsx src/cli/coordination/agent-messaging.ts send \
  --task-id "$TASK_ID" --agent-id <agent-id> --command pause \
  --payload '{"seconds": 30}'
```

## Prerequisites

**Redis Required:**
```bash
# Start Redis for coordination
docker-compose up -d redis

# Verify Redis is running
redis-cli ping
```

**Provider Routing Setup (Optional):**
```bash
# Configure Main Chat provider
/switch-api zai    # Cost-optimized
/switch-api kimi   # Mid-range quality
/switch-api max    # High quality (Anthropic)
```

## Command Options

**Usage Examples:**
```
# Standard mode with default provider
/cfn-loop-cli "Implement JWT authentication"

# With specific provider
/cfn-loop-cli "Build API service" --provider kimi

# With specific provider and model
/cfn-loop-cli "Create React component" --provider openrouter --model gpt-4

# MVP mode for fast prototyping
/cfn-loop-cli "Build feature prototype" --mode=mvp

# Enterprise mode for critical systems
/cfn-loop-cli "Security audit" --mode=enterprise --provider max
```

**Options:**
- `--mode=<mvp|standard|enterprise>`: Quality mode (default: standard)
- `--provider=<zai|kimi|anthropic|openrouter>`: AI provider (default: Main Chat setting)
- `--model=<model>`: Specific model (provider-specific)

## Provider Routing Behavior

**Main Chat + Task() tools:** Controlled by `/switch-api` command

**CLI agents:**
- Uses `--provider` flag if specified
- Falls back to Main Chat provider setting
- Default to Z.ai glm-4.6 if no provider configured

**Fallback Hierarchy:**
1. `--provider` flag (explicit)
2. Main Chat provider setting (from `/switch-api`)
3. Z.ai glm-4.6 (cost-effective default)

## Mode Comparison

| Mode | Quality | Use Case | Description |
|------|---------|----------|-------------|
| MVP | Fast (70% gates) | Prototypes, quick experiments | Lower quality gates, fewer iterations |
| Standard | Production (95% gates) | Most features | Balanced quality and speed |
| Enterprise | High (98% gates) | Security, compliance | Maximum quality, thorough validation |

## How New CLI Mode Works

1. **Main Chat** processes `/cfn-loop-cli` command
2. **Main Chat** spawns CLI agent directly with provider routing
3. **CLI Agent** executes task with specified AI provider
4. **CLI Agent** sends Redis completion signal when finished
5. **Main Chat** receives signal via Redis BLPOP and continues
6. **No complex orchestrator needed** - simple 2-layer coordination

## Agent Environment Variables

CLI agents automatically receive:
- `TASK_ID`: Unique task identifier
- `MODE`: Quality mode (mvp/standard/enterprise)
- `PROVIDER`: AI provider (zai/kimi/anthropic/openrouter)
- `MODEL`: Specific AI model
- `AGENT_ID`: Generated unique agent identifier

## Redis Signal Format

CLI agents send completion signals in this format:
```json
{
  "agentId": "agent-backend-dev-12345",
  "taskId": "cfn-cli-67890",
  "status": "completed",
  "timestamp": "2025-11-22T12:00:00.000Z",
  "provider": "kimi",
  "model": "moonshot-v1-8k",
  "confidence": 0.90,
  "metadata": {
    "iteration": 1,
    "mode": "standard"
  }
}
```

This simplified architecture provides:
- ✅ **Direct coordination** - Main Chat to CLI agents
- ✅ **Provider flexibility** - Different AI providers per agent
- ✅ **Cost optimization** - Use appropriate providers for each task
- ✅ **Reliable signaling** - Redis BLPOP for coordination
- ✅ **Simple architecture** - No complex orchestrator needed