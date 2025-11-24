---
description: "Execute CFN Loop in simplified CLI mode (Main Chat coordination, provider routing)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--provider=zai|kimi|anthropic|openrouter] [--model=<model>]"
allowed-tools: ["Task", "TodoWrite", "Read", "Bash", "SlashCommand"]
---

# CFN Loop CLI Mode - Simplified Main Chat Coordination

🚨 **NEW ARCHITECTURE:** Main Chat directly coordinates CLI agents via Redis BLPOP signaling

---

## Execution Instructions (AUTO-EXECUTE)

**Step 1: Parse Arguments**
```
TASK_DESCRIPTION: $ARGUMENTS (extract task, remove flags)
MODE: Parse from --mode flag or default to "standard"
PROVIDER: Parse from --provider flag or use Main Chat setting
MODEL: Parse from --model flag or use provider default
```

**Step 2: Set Environment Variables**
```bash
# Generate task ID
TASK_ID="cfn-cli-$(date +%s%N | tail -c 7)-${RANDOM}"
echo "📋 Task ID: $TASK_ID"
echo "🎯 Mode: $MODE"
echo "🤖 Provider: $PROVIDER (from --provider or Main Chat setting)"
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

**Step 4: Spawn Initial CLI Agent (Main Chat Coordination Pattern)**
```bash
# Determine first agent type based on task
# This is a simplified selection - could be enhanced with task classification
AGENT_TYPE="backend-developer"

# Spawn first CLI agent with provider routing
echo "🚀 Spawning CLI agent: $AGENT_TYPE"

npx tsx src/cli/spawn-agent-cli.ts "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --mode "$MODE" \
  ${PROVIDER:+--provider "$PROVIDER"} \
  ${MODEL:+--model "$MODEL"} \
  --background

echo "✅ CLI agent spawned with Task ID: $TASK_ID"
```

**Step 5: Wait for Agent Completion (Main Chat BLPOP Pattern)**
```bash
# Main Chat waits for completion signal via Redis BLPOP
echo "⏳ Waiting for CLI agent completion..."

SIGNAL_KEY="cfn-completion:$TASK_ID"
TIMEOUT_SECONDS=120

# Wait for completion signal with timeout
COMPLETION_SIGNAL=$(timeout $TIMEOUT_SECONDS redis-cli BLPOP "$SIGNAL_KEY" $((TIMEOUT_SECONDS + 10)))

if [ $? -eq 0 ] && [ -n "$COMPLETION_SIGNAL" ]; then
  echo "✅ CLI agent completed successfully"
  echo "📊 Completion signal received via Redis"

  # Parse completion signal (second line contains JSON)
  SIGNAL_DATA=$(echo "$COMPLETION_SIGNAL" | tail -n 1)
  echo "🔍 Agent signal: $SIGNAL_DATA"

  # Could spawn additional agents here based on signal content
  # For now, we'll consider the task complete
  echo "🎉 CFN Loop CLI task completed"
else
  echo "⚠️  CLI agent did not complete within timeout ($TIMEOUT_SECONDS seconds)"
  echo "💡 Check agent logs or increase timeout if needed"
fi
```

**Step 6: Inform User**
Report completion status and any additional information.

---

## Background Information (DO NOT show this to user unless they ask)

**Task**: $ARGUMENTS

## What is CLI Mode?

**NEW CLI Mode Architecture (Simplified):**
- **Main Chat** directly spawns CLI agents with provider routing
- **CLI agents** execute tasks and send Redis completion signals
- **Main Chat** waits via Redis BLPOP for agent completion
- **2-layer coordination** (Main Chat → CLI agents)
- **Provider routing** via `--provider` and `--model` flags
- **Fallback behavior** to Z.ai glm-4.6 if no provider specified

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