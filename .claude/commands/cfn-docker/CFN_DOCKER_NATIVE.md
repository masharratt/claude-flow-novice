---
description: "Execute CFN Loop with fully containerized coordinator using Docker-in-Docker (native container mode)"
argument-hint: "[task-description] --mode=mvp|standard|enterprise"
allowed-tools: ["Bash", "Read"]
---

# CFN Docker Loop - Native Container Mode

Execute CFN Loop with coordinator running as a Docker container (Docker-in-Docker).

**Task Description:** $ARGUMENTS

## Overview

This command runs the CFN Docker v3 coordinator in a container instead of via Task() tool.

**Benefits:**
- ✅ Consistent execution model (coordinator + workers all containerized)
- ✅ Resource isolation for coordinator
- ✅ Can use cheaper models via custom routing
- ✅ Portable across environments (CI/CD friendly)
- ✅ Planning phase fully integrated

**Architecture:**
```
Main Chat (docker run)
    ↓
cfn-coordinator:v3 (Docker container)
    ↓ orchestrate.sh
    ↓ spawn-agent.sh
Worker Agents (Docker containers)
```

## Execution Steps

### Step 1: Parse Arguments and Set Defaults

```bash
# Extract task description
TASK_DESCRIPTION="$ARGUMENTS"

# Generate unique task ID
TASK_ID="task-$(date +%s)-$$"

# Parse mode from arguments (default: standard)
if [[ "$ARGUMENTS" =~ --mode=([a-z]+) ]]; then
    MODE="${BASH_REMATCH[1]}"
else
    MODE="standard"
fi

echo "🚀 CFN Docker Loop - Native Container Mode"
echo "   Task ID: ${TASK_ID}"
echo "   Mode: ${MODE}"
echo "   Description: ${TASK_DESCRIPTION}"
```

### Step 2: Ensure Redis is Running

```bash
# Check if Redis container exists
if ! docker ps | grep -q cfn-redis; then
    echo "📦 Starting Redis service..."
    docker-compose up -d redis
    sleep 3

    # Verify Redis is responding
    if ! docker exec cfn-redis redis-cli ping > /dev/null 2>&1; then
        echo "❌ Redis failed to start"
        exit 1
    fi

    echo "✅ Redis started successfully"
else
    echo "✅ Redis already running"
fi
```

### Step 3: Build Coordinator Image (if needed)

```bash
# Check if coordinator image exists
if ! docker images | grep -q "cfn-coordinator.*v3"; then
    echo "🔨 Building CFN coordinator image..."
    docker build -f docker/Dockerfile.coordinator -t cfn-coordinator:v3 .

    if [[ $? -ne 0 ]]; then
        echo "❌ Failed to build coordinator image"
        exit 1
    fi

    echo "✅ Coordinator image built"
else
    echo "✅ Coordinator image exists"
fi
```

### Step 4: Spawn Coordinator Container

```bash
echo "🐳 Spawning coordinator container..."

docker run --rm \
  --name "cfn-coordinator-${TASK_ID}" \
  --network mcp-network \
  --volume /var/run/docker.sock:/var/run/docker.sock \
  --volume "$(pwd):/app/codebase:ro" \
  --volume /tmp:/tmp \
  --env ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  --env CFN_REDIS_HOST=cfn-redis \
  --env CFN_REDIS_PORT=6379 \
  --env TASK_ID="${TASK_ID}" \
  --env MODE="${MODE}" \
  --env TASK_DESCRIPTION="${TASK_DESCRIPTION}" \
  --env MEMORY_LIMIT="${MEMORY_LIMIT:-1g}" \
  --env MAX_ITERATIONS="${MAX_ITERATIONS:-10}" \
  --env GATE_THRESHOLD="${GATE_THRESHOLD:-0.75}" \
  --env CONSENSUS_THRESHOLD="${CONSENSUS_THRESHOLD:-0.90}" \
  --env NETWORK="mcp-network" \
  --env CFN_CUSTOM_ROUTING="${CFN_CUSTOM_ROUTING:-false}" \
  --env ZAI_API_KEY="${ZAI_API_KEY:-}" \
  cfn-coordinator:v3

COORDINATOR_EXIT_CODE=$?
```

### Step 5: Report Results

```bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ $COORDINATOR_EXIT_CODE -eq 0 ]]; then
    echo "✅ CFN Loop execution completed successfully"
    echo "   Task ID: ${TASK_ID}"
    echo "   Mode: ${MODE}"

    # Check for planning artifacts
    if [[ -f "/tmp/cfn-docker-plan-${TASK_ID}.json" ]]; then
        ATOMIC_TASKS=$(jq -r '.atomic_tasks | length' "/tmp/cfn-docker-plan-${TASK_ID}.json" 2>/dev/null || echo "unknown")
        echo "   Atomic Tasks: ${ATOMIC_TASKS}"
    fi

    # Check Redis for task state
    echo ""
    echo "📊 Task state stored in Redis:"
    echo "   redis-cli HGETALL cfn_docker:task:${TASK_ID}"

else
    echo "❌ CFN Loop execution failed"
    echo "   Exit code: ${COORDINATOR_EXIT_CODE}"
    echo "   Task ID: ${TASK_ID}"
    echo ""
    echo "🔍 Debug steps:"
    echo "   1. Check Redis: redis-cli HGETALL cfn_docker:task:${TASK_ID}"
    echo "   2. Check planning file: cat /tmp/cfn-docker-plan-${TASK_ID}.json"
    echo "   3. Check logs: docker logs cfn-coordinator-${TASK_ID} (if still running)"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

## Environment Variables

### Required
```bash
ANTHROPIC_API_KEY     # API key for LLM calls (coordinator planning)
```

### Optional Configuration
```bash
MODE=standard         # mvp|standard|enterprise
MEMORY_LIMIT=1g      # Worker agent memory limit
MAX_ITERATIONS=10    # Maximum CFN Loop iterations
GATE_THRESHOLD=0.75  # Loop 3 self-validation threshold
CONSENSUS_THRESHOLD=0.90  # Loop 2 validator consensus threshold
```

### Optional Custom Routing
```bash
CFN_CUSTOM_ROUTING=true    # Enable Z.ai routing
ZAI_API_KEY=xxx           # Z.ai API key
ZAI_MODEL=glm-4.6         # Model for workers
```

## Examples

### Basic Usage
```bash
/cfn-docker-native "Implement user authentication system"
```

### With Mode Selection
```bash
/cfn-docker-native "Build responsive dashboard UI" --mode=enterprise
```

### With Custom Routing (Cost Optimization)
```bash
export CFN_CUSTOM_ROUTING=true
export ZAI_API_KEY="your-zai-key"
/cfn-docker-native "Optimize database queries"
```

### For CI/CD
```bash
# In CI pipeline
export ANTHROPIC_API_KEY="${SECRETS_ANTHROPIC_KEY}"
/cfn-docker-native "Deploy to staging environment" --mode=standard
```

## Comparison: Native vs Task Mode

| Aspect | Task Mode | Native Mode |
|--------|-----------|-------------|
| **Coordinator** | Task() tool (Main Chat context) | Docker container |
| **Visibility** | Full (logs in Main Chat) | Reduced (docker logs) |
| **Resource Isolation** | None | Full (memory limits) |
| **Cost Optimization** | Standard | Can use cheaper models |
| **CI/CD Friendly** | No | Yes |
| **Debugging** | Easy | Moderate |
| **Portability** | Requires Claude Code | Any Docker environment |
| **Planning Phase** | ✅ Works | ✅ Works (via /tmp mount) |

## Troubleshooting

### Coordinator Container Won't Start
```bash
# Check if image exists
docker images | grep cfn-coordinator

# Rebuild if needed
docker build -f Dockerfile.cfn-coordinator -t cfn-coordinator:v3 .

# Check Docker socket permissions
ls -la /var/run/docker.sock
```

### Planning File Not Generated
```bash
# Check planning file
ls -la /tmp/cfn-docker-plan-*.json

# Check coordinator logs
docker logs cfn-coordinator-${TASK_ID}

# Verify coordinator can write to /tmp
docker run --rm -v /tmp:/tmp cfn-coordinator:v3 /bin/sh -c "touch /tmp/test && rm /tmp/test"
```

### Workers Not Spawning
```bash
# Check if coordinator can access Docker
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock cfn-coordinator:v3 /bin/sh -c "docker ps"

# Check network exists
docker network ls | grep mcp-network

# Create network if needed
docker network create mcp-network
```

### Redis Connection Issues
```bash
# Check Redis status
docker ps | grep cfn-redis

# Test connection from coordinator network
docker run --rm --network mcp-network redis:7-alpine redis-cli -h cfn-redis ping
```

## Notes

- **Docker-in-Docker:** Coordinator mounts `/var/run/docker.sock` to spawn workers
- **Codebase Access:** Mounted read-only at `/app/codebase` for orchestrate.sh
- **Planning Files:** Shared via `/tmp` volume mount
- **Network:** All containers (coordinator + workers + Redis) use `mcp-network`
- **Auto-cleanup:** Coordinator container removes itself on exit (--rm flag)

## When to Use This Command

**Use Native Mode When:**
- Running in CI/CD pipelines
- Want full resource isolation
- Testing Docker-in-Docker setup
- Cost optimization with custom routing
- Need portable execution environment

**Use Task Mode When:**
- Developing/debugging coordinator logic
- Want full visibility into execution
- Need immediate log access
- Rapid iteration on planning phase

Both modes use the same planning phase implementation and produce identical results.
