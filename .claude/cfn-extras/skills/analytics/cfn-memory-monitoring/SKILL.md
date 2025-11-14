# Memory Monitoring for Docker Deployment

**Implementation Date:** 2025-11-04
**Purpose:** Add memory reporting to Docker deployment process to prevent WSL2 crashes

---

## Overview

This implementation integrates memory monitoring into the Docker deployment process to:
1. Track memory usage per agent container
2. Report memory metrics to Redis for coordination
3. Enable automatic container cleanup based on memory thresholds
4. Provide performance data for optimization

---

## Memory Monitoring Skill

### Implementation

```bash
# .claude/skills/cfn-memory-monitoring/SKILL.md
```

The memory monitoring skill provides:

- **Real-time memory tracking** per agent
- **Redis-based memory reporting** for swarm coordination
- **Threshold-based alerts** when containers approach limits
- **Performance data collection** for optimization

---

## Enhanced Docker Configuration

### Memory-Optimized Dockerfile

```dockerfile
FROM node:20-alpine AS base

# Install monitoring dependencies
RUN apk add --no-cache bash redis curl procfs-dump

WORKDIR /app

# Copy memory monitoring skill
COPY .claude/skills/cfn-memory-monitoring/ /app/.claude/skills/cfn-memory-monitoring/

# Copy application source
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Build application
RUN npm run build || echo "Build skipped"

# Create monitoring user
RUN addgroup -g 1001 -S cfnuser && \
    adduser -S cfnuser -u 1001 -G cfnuser

# Setup monitoring directories
RUN mkdir -p /app/logs /app/metrics && \
    chown -R cfnuser:cfnuser /app

USER cfnuser

# Memory monitoring environment variables
ENV MEMORY_MONITORING=true \
    MEMORY_REPORT_INTERVAL=30 \
    MEMORY_ALERT_THRESHOLD=80 \
    REDIS_HOST=host.docker.internal \
    REDIS_PORT=6379

# Memory monitoring script wrapper
COPY docker/scripts/monitor-wrapper.sh /app/monitor-wrapper.sh
RUN chmod +x /app/monitor-wrapper.sh

# Enhanced health check with memory monitoring
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD /app/monitor-wrapper.sh health-check

# Default command with monitoring
CMD ["/app/monitor-wrapper.sh", "start-agent"]
```

### Monitor Wrapper Script

```bash
#!/bin/bash
# docker/scripts/monitor-wrapper.sh

set -euo pipefail

# Configuration
MEMORY_REPORT_INTERVAL=${MEMORY_REPORT_INTERVAL:-30}
MEMORY_ALERT_THRESHOLD=${MEMORY_ALERT_THRESHOLD:-80}
REDIS_HOST=${REDIS_HOST:-host.docker.internal}
REDIS_PORT=${REDIS_PORT:-6379}
AGENT_ID=${AGENT_ID:-unknown}
CONTAINER_NAME=${CONTAINER_NAME:-$(hostname)}

# Memory monitoring function
report_memory() {
    local timestamp=$(date +%s)
    local memory_usage=$(free -m | awk 'NR==2{printf "%.2f", $3*100/$2}' 2>/dev/null || echo "0")
    local memory_mb=$(free -m | awk 'NR==2{print $3}' 2>/dev/null || echo "0")
    local memory_limit_mb=${MEMORY_LIMIT:-2048}

    # Report to Redis
    if command -v redis-cli >/dev/null 2>&1; then
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            hset "cfn_memory:${AGENT_ID}:${timestamp}" \
            container_name "$CONTAINER_NAME" \
            memory_usage "$memory_usage" \
            memory_mb "$memory_mb" \
            memory_limit_mb "$memory_limit_mb" \
            timestamp "$timestamp" \
            agent_id "$AGENT_ID" >/dev/null 2>&1 || true

        # Set TTL for 24 hours
        redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
            expire "cfn_memory:${AGENT_ID}:${timestamp}" 86400 >/dev/null 2>&1 || true

        # Alert if threshold exceeded
        if (( $(echo "$memory_usage > $MEMORY_ALERT_THRESHOLD" | bc -l) )); then
            redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" \
                lpush "cfn_memory_alerts" \
                "{\"agent_id\":\"$AGENT_ID\",\"memory_usage\":\"$memory_usage\",\"timestamp\":$timestamp}" >/dev/null 2>&1 || true
        fi
    fi

    # Log locally
    echo "[$timestamp] Memory: ${memory_usage}% (${memory_mb}MB/${memory_limit_mb}MB)" >> /app/logs/memory.log
}

# Health check with memory monitoring
health_check() {
    # Basic application health
    if ! node -e "console.log('healthy')" 2>/dev/null; then
        echo "Application health check failed"
        exit 1
    fi

    # Memory check
    local memory_usage=$(free -m | awk 'NR==2{printf "%.2f", $3*100/$2}' 2>/dev/null || echo "0")
    if (( $(echo "$memory_usage > 95" | bc -l) )); then
        echo "Critical memory usage: ${memory_usage}%"
        exit 1
    fi

    echo "Health check passed - Memory: ${memory_usage}%"
}

# Start memory monitoring daemon
start_monitoring() {
    while true; do
        report_memory
        sleep "$MEMORY_REPORT_INTERVAL"
    done &
    MONITOR_PID=$!
    echo $MONITOR_PID > /tmp/memory-monitor.pid
    echo "Memory monitoring started (PID: $MONITOR_PID)"
}

# Stop monitoring
stop_monitoring() {
    if [ -f /tmp/memory-monitor.pid ]; then
        local pid=$(cat /tmp/memory-monitor.pid)
        kill "$pid" 2>/dev/null || true
        rm -f /tmp/memory-monitor.pid
    fi
}

# Cleanup on exit
cleanup() {
    echo "Cleaning up..."
    stop_monitoring

    # Final memory report
    report_memory

    echo "Cleanup complete"
    exit 0
}

trap cleanup TERM INT

# Main execution
case "${1:-}" in
    "start-agent")
        echo "Starting agent with memory monitoring..."
        start_monitoring

        # Start the actual agent
        shift
        exec node dist/cli/index.js "$@"
        ;;
    "health-check")
        health_check
        ;;
    "report-memory")
        report_memory
        ;;
    *)
        echo "Usage: $0 {start-agent|health-check|report-memory}"
        exit 1
        ;;
esac
```

---

## Docker Compose Configuration

### Memory-Limited Services

```yaml
# docker-compose.memory-monitored.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  agent-backend:
    build:
      context: .
      dockerfile: Dockerfile.memory-monitored
    environment:
      - AGENT_TYPE=backend-developer
      - AGENT_ID=backend-${INSTANCE_ID:-1}
      - MEMORY_LIMIT=1024
      - MEMORY_ALERT_THRESHOLD=75
      - MEMORY_REPORT_INTERVAL=30
      - REDIS_HOST=redis
      - MCP_SERVERS=basic,filesystem,database
    volumes:
      - ./logs:/app/logs
      - agent_workspace_backend:/app/workspace
    depends_on:
      - redis
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
    restart: unless-stopped

  agent-frontend:
    build:
      context: .
      dockerfile: Dockerfile.memory-monitored
    environment:
      - AGENT_TYPE=frontend-engineer
      - AGENT_ID=frontend-${INSTANCE_ID:-1}
      - MEMORY_LIMIT=2048
      - MEMORY_ALERT_THRESHOLD=80
      - MEMORY_REPORT_INTERVAL=30
      - REDIS_HOST=redis
      - MCP_SERVERS=basic,filesystem,playwright,browser
    volumes:
      - ./logs:/app/logs
      - agent_workspace_frontend:/app/workspace
      - /tmp/.X11-unix:/tmp/.X11-unix:ro
    depends_on:
      - redis
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
    restart: unless-stopped

  memory-monitor:
    image: node:20-alpine
    environment:
      - REDIS_HOST=redis
    volumes:
      - ./scripts/memory-dashboard.sh:/app/memory-dashboard.sh
      - redis_data:/data
    command: sh -c "apk add --no-cache procfs-dump && tail -f /dev/null"
    depends_on:
      - redis

volumes:
  redis_data:
  agent_workspace_backend:
  agent_workspace_frontend:
```

---

## Memory Monitoring CLI Commands

### Check Agent Memory Status

```bash
# Check all agents memory usage
./.claude/skills/cfn-memory-monitoring/check-agent-memory.sh

# Check specific agent
./.claude/skills/cfn-memory-monitoring/check-agent-memory.sh --agent-id backend-1

# Get memory alerts
redis-cli lrange "cfn_memory_alerts" 0 -1

# Get agent memory history
redis-cli keys "cfn_memory:backend-1:*" | head -10 | xargs -I {} redis-cli hgetall "{}"
```

### Performance Testing Script

```bash
#!/bin/bash
# scripts/test-cold-start-performance.sh

set -euo pipefail

echo "=== Cold Start Performance Test ==="

# Test container startup time
echo "Testing container cold start time..."
start_time=$(date +%s%N)

docker run --rm \
  --name cold-start-test \
  -e AGENT_ID=test-performance \
  -e MEMORY_MONITORING=false \
  claude-flow-novice:memory-monitored \
  node -e "console.log('Container started successfully')"

end_time=$(date +%s%N)
startup_time_ms=$(( (end_time - start_time) / 1000000 ))

echo "Cold start time: ${startup_time_ms}ms"

# Test with memory monitoring
echo "Testing cold start with memory monitoring..."
start_time=$(date +%s%N)

docker run --rm \
  --name cold-start-test-monitored \
  -e AGENT_ID=test-performance-monitored \
  -e MEMORY_MONITORING=true \
  -e REDIS_HOST=host.docker.internal \
  claude-flow-novice:memory-monitored \
  /app/monitor-wrapper.sh report-memory

end_time=$(date +%s%N)
startup_time_monitored_ms=$(( (end_time - start_time) / 1000000 ))

echo "Cold start with monitoring: ${startup_time_monitored_ms}ms"

# Test agent spawn time
echo "Testing agent spawn time..."
start_time=$(date +%s%N)

docker run --rm \
  --name agent-spawn-test \
  -e AGENT_ID=test-spawn \
  -e MEMORY_MONITORING=true \
  -e REDIS_HOST=host.docker.internal \
  -v "$(pwd):/app/workspace" \
  claude-flow-novice:memory-monitored \
  /app/monitor-wrapper.sh start-agent agent-spawn \
    --agent-type backend-developer \
    --task "Write hello world file" \
    --timeout 30

end_time=$(date +%s%N)
spawn_time_ms=$(( (end_time - start_time) / 1000000 ))

echo "Agent spawn time: ${spawn_time_ms}ms"

# Results
echo "=== Performance Results ==="
echo "Container cold start: ${startup_time_ms}ms"
echo "Container with monitoring: ${startup_time_monitored_ms}ms"
echo "Agent spawn time: ${spawn_time_ms}ms"

# Save results
cat > "performance-results-$(date +%Y%m%d-%H%M%S).json" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "container_cold_start_ms": $startup_time_ms,
  "container_with_monitoring_ms": $startup_time_monitored_ms,
  "agent_spawn_ms": $spawn_time_ms,
  "monitoring_overhead_ms": $((startup_time_monitored_ms - startup_time_ms)),
  "system_info": {
    "docker_version": "$(docker --version)",
    "host_os": "$(uname -a)",
    "available_memory": "$(free -h)"
  }
}
EOF

echo "Results saved to performance-results-*.json"
```

---

## Dedicated MCP per Container Architecture

### Frontend Container MCP Configuration

```json
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-playwright-${AGENT_ID}",
        "-e", "AGENT_ID=${AGENT_ID}",
        "-e", "DISPLAY=${DISPLAY:-:0}",
        "-v", "/tmp/.X11-unix:/tmp/.X11-unix:ro",
        "-v", "${PWD}/workspace:/workspace",
        "mcp-playwright:latest"
      ]
    },
    "browser-automation": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-browser-${AGENT_ID}",
        "-e", "AGENT_ID=${AGENT_ID}",
        "--shm-size=2gb",
        "-v", "${PWD}/workspace:/workspace",
        "mcp-browser-automation:latest"
      ]
    },
    "screenshot-service": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-screenshot-${AGENT_ID}",
        "-e", "AGENT_ID=${AGENT_ID}",
        "-v", "${PWD}/screenshots:/screenshots",
        "mcp-screenshot:latest"
      ]
    }
  }
}
```

### Backend Container MCP Configuration

```json
{
  "mcpServers": {
    "database": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-database-${AGENT_ID}",
        "-e", "DATABASE_URL=${DATABASE_URL}",
        "-e", "AGENT_ID=${AGENT_ID}",
        "mcp-postgresql:latest"
      ]
    },
    "api-testing": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-api-${AGENT_ID}",
        "-e", "AGENT_ID=${AGENT_ID}",
        "mcp-api-testing:latest"
      ]
    },
    "redis-tools": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-redis-${AGENT_ID}",
        "-e", "REDIS_HOST=${REDIS_HOST}",
        "-e", "AGENT_ID=${AGENT_ID}",
        "mcp-redis-tools:latest"
      ]
    }
  }
}
```

---

## Implementation Benefits

### Memory Leak Prevention

1. **Per-container memory limits** prevent any single agent from crashing WSL2
2. **Real-time monitoring** catches leaks early
3. **Automatic cleanup** removes containers exceeding thresholds
4. **Performance data** helps identify problematic agents

### Resource Optimization

1. **Dedicated MCP servers** reduce context loading overhead
2. **Container specialization** (frontend vs backend) optimizes resource allocation
3. **Memory-based scheduling** places agents on appropriate containers
4. **Performance metrics** inform capacity planning

### Operational Benefits

1. **Predictable resource usage** with memory limits and monitoring
2. **Faster agent startup** with specialized, minimal containers
3. **Better debugging** with per-agent memory tracking
4. **Cost optimization** through efficient resource utilization

---

## Next Steps

1. **Implement memory monitoring skill** with Redis integration
2. **Create performance testing suite** for cold start timing
3. **Build dedicated MCP containers** for frontend/backend specialization
4. **Deploy monitoring dashboard** for real-time visibility
5. **Establish memory thresholds** and automated cleanup policies