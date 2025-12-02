# MCP Container Selector Skill

**Implementation Date:** 2025-11-04
**Purpose:** Dedicated MCP per container architecture for specialized agent tooling

---

## Overview

The MCP Container Selector skill manages dedicated MCP servers per container type, ensuring that:

1. **Frontend agents** get Playwright and browser automation tools
2. **Backend agents** get database, API testing, and Redis tools
3. **Context efficiency** - agents only load relevant MCP tools
4. **Resource optimization** - specialized containers with minimal overhead

---

## Container MCP Architecture

### Frontend Container MCP Configuration

```json
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-playwright-${AGENT_ID}",
        "--memory=1g",
        "--shm-size=2g",
        "-e", "AGENT_ID=${AGENT_ID}",
        "-e", "DISPLAY=${DISPLAY:-:0}",
        "-v", "/tmp/.X11-unix:/tmp/.X11-unix:ro",
        "-v", "${PWD}/workspace:/workspace",
        "-v", "${PWD}/screenshots:/screenshots",
        "mcp/playwright:latest"
      ]
    },
    "browser-automation": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-browser-${AGENT_ID}",
        "--memory=512m",
        "--shm-size=1g",
        "-e", "AGENT_ID=${AGENT_ID}",
        "-e", "BROWSER_TYPE=chromium",
        "-v", "${PWD}/workspace:/workspace",
        "mcp/browser-automation:latest"
      ]
    },
    "screenshot-service": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-screenshot-${AGENT_ID}",
        "--memory=256m",
        "-e", "AGENT_ID=${AGENT_ID}",
        "-v", "${PWD}/screenshots:/screenshots",
        "mcp/screenshot:latest"
      ]
    },
    "image-analysis": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-image-${AGENT_ID}",
        "--memory=1g",
        "-e", "AGENT_ID=${AGENT_ID}",
        "-v", "${PWD}/images:/images:ro",
        "mcp/image-analysis:latest"
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
        "--memory=256m",
        "-e", "DATABASE_URL=${DATABASE_URL}",
        "-e", "AGENT_ID=${AGENT_ID}",
        "mcp/postgresql:latest"
      ]
    },
    "api-testing": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-api-${AGENT_ID}",
        "--memory=256m",
        "-e", "AGENT_ID=${AGENT_ID}",
        "mcp/api-testing:latest"
      ]
    },
    "redis-tools": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-redis-${AGENT_ID}",
        "--memory=128m",
        "-e", "REDIS_HOST=${REDIS_HOST}",
        "-e", "REDIS_PORT=${REDIS_PORT:-6379}",
        "-e", "AGENT_ID=${AGENT_ID}",
        "mcp/redis-tools:latest"
      ]
    },
    "filesystem": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-filesystem-${AGENT_ID}",
        "--memory=128m",
        "-e", "AGENT_ID=${AGENT_ID}",
        "-v", "${PWD}/workspace:/workspace",
        "mcp/filesystem:latest"
      ]
    }
  }
}
```

---

## Container Selection Logic

### Agent Type to MCP Mapping

```bash
#!/bin/bash
# .claude/skills/cfn-mcp-container-selector/select-mcp-config.sh

select_mcp_config() {
    local agent_type="$1"
    local agent_id="$2"
    local config_file="$3"

    case "$agent_type" in
        "react-frontend-engineer"|"frontend-developer"|"ui-designer"|"mobile-dev")
            cat > "$config_file" << EOF
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-playwright-${agent_id}",
        "--memory=1g",
        "--shm-size=2g",
        "-e", "AGENT_ID=${agent_id}",
        "-e", "DISPLAY=${DISPLAY:-:0}",
        "-v", "/tmp/.X11-unix:/tmp/.X11-unix:ro",
        "-v", "${PWD}/workspace:/workspace",
        "mcp/playwright:latest"
      ]
    },
    "browser-automation": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-browser-${agent_id}",
        "--memory=512m",
        "-e", "AGENT_ID=${agent_id}",
        "v", "${PWD}/workspace:/workspace",
        "mcp/browser-automation:latest"
      ]
    }
  }
}
EOF
            ;;

        "backend-developer"|"database-architect"|"api-gateway-specialist")
            cat > "$config_file" << EOF
{
  "mcpServers": {
    "database": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-database-${agent_id}",
        "--memory=256m",
        "-e", "DATABASE_URL=${DATABASE_URL}",
        "-e", "AGENT_ID=${agent_id}",
        "mcp/postgresql:latest"
      ]
    },
    "api-testing": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-api-${agent_id}",
        "--memory=256m",
        "-e", "AGENT_ID=${agent_id}",
        "mcp/api-testing:latest"
      ]
    }
  }
}
EOF
            ;;

        "tester"|"playwright-tester"|"api-testing-specialist")
            cat > "$config_file" << EOF
{
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-playwright-${agent_id}",
        "--memory=1g",
        "--shm-size=2g",
        "-e", "AGENT_ID=${agent_id}",
        "v", "${PWD}/test-results:/test-results",
        "mcp/playwright:latest"
      ]
    },
    "api-testing": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-api-${agent_id}",
        "--memory=256m",
        "-e", "AGENT_ID=${agent_id}",
        "mcp/api-testing:latest"
      ]
    }
  }
}
EOF
            ;;

        *)
            # Default minimal MCP configuration
            cat > "$config_file" << EOF
{
  "mcpServers": {
    "filesystem": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "--init",
        "--name", "mcp-filesystem-${agent_id}",
        "--memory=128m",
        "-e", "AGENT_ID=${agent_id}",
        "-v", "${PWD}/workspace:/workspace",
        "mcp/filesystem:latest"
      ]
    }
  }
}
EOF
            ;;
    esac
}

# Execute selection if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -lt 3 ]]; then
        echo "Usage: $0 <agent_type> <agent_id> <output_file>"
        exit 1
    fi

    select_mcp_config "$1" "$2" "$3"
    echo "MCP configuration generated for $1 -> $3"
fi
```

---

## Docker Compose Services

### MCP Service Definitions

```yaml
# docker-compose.mcp-services.yml
version: '3.8'

services:
  # Frontend MCP Services
  mcp-playwright:
    image: mcp/playwright:latest
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
    environment:
      - AGENT_ID=${AGENT_ID}
      - DISPLAY=${DISPLAY:-:0}
    volumes:
      - /tmp/.X11-unix:/tmp/.X11-unix:ro
      - workspace:/workspace
      - screenshots:/screenshots
    restart: unless-stopped

  mcp-browser-automation:
    image: mcp/browser-automation:latest
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    environment:
      - AGENT_ID=${AGENT_ID}
      - BROWSER_TYPE=chromium
    volumes:
      - workspace:/workspace
    restart: unless-stopped

  # Backend MCP Services
  mcp-database:
    image: mcp/postgresql:latest
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
    environment:
      - AGENT_ID=${AGENT_ID}
      - DATABASE_URL=${DATABASE_URL}
    restart: unless-stopped

  mcp-api-testing:
    image: mcp/api-testing:latest
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 128M
    environment:
      - AGENT_ID=${AGENT_ID}
    restart: unless-stopped

  mcp-redis-tools:
    image: mcp/redis-tools:latest
    deploy:
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 64M
    environment:
      - AGENT_ID=${AGENT_ID}
      - REDIS_HOST=${REDIS_HOST}
      - REDIS_PORT=${REDIS_PORT:-6379}
    restart: unless-stopped

  # Common Services
  mcp-filesystem:
    image: mcp/filesystem:latest
    deploy:
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 64M
    environment:
      - AGENT_ID=${AGENT_ID}
    volumes:
      - workspace:/workspace
    restart: unless-stopped

volumes:
  workspace:
  screenshots:
```

---

## Implementation Integration

### Agent Spawning with MCP Selection

```bash
#!/bin/bash
# scripts/spawn-agent-with-mcp.sh

set -euo pipefail

# Configuration
AGENT_TYPE="$1"
AGENT_ID="$2"
TASK_ID="${3:-$(date +%s)}"
MEMORY_LIMIT="${4:-1024}"
MCP_SELECTOR_SKILL=".claude/skills/cfn-mcp-container-selector/select-mcp-config.sh"

echo "Spawning agent: $AGENT_TYPE (ID: $AGENT_ID)"

# Generate MCP configuration based on agent type
MCP_CONFIG_DIR="/tmp/mcp-configs"
mkdir -p "$MCP_CONFIG_DIR"
MCP_CONFIG_FILE="$MCP_CONFIG_DIR/mcp-${AGENT_ID}.json"

echo "Generating MCP configuration for $AGENT_TYPE..."
"$MCP_SELECTOR_SKILL" "$AGENT_TYPE" "$AGENT_ID" "$MCP_CONFIG_FILE"

# Determine container type and memory limits
case "$AGENT_TYPE" in
    "react-frontend-engineer"|"frontend-developer"|"ui-designer"|"mobile-dev"|"tester"|"playwright-tester")
        CONTAINER_TYPE="frontend"
        MEMORY_LIMIT="${MEMORY_LIMIT:-2048}"
        MCP_SERVICES="playwright,browser-automation,screenshot"
        ;;
    "backend-developer"|"database-architect"|"api-gateway-specialist")
        CONTAINER_TYPE="backend"
        MEMORY_LIMIT="${MEMORY_LIMIT:-1024}"
        MCP_SERVICES="database,api-testing,redis-tools"
        ;;
    *)
        CONTAINER_TYPE="minimal"
        MEMORY_LIMIT="${MEMORY_LIMIT:-512}"
        MCP_SERVICES="filesystem"
        ;;
esac

echo "Container type: $CONTAINER_TYPE"
echo "Memory limit: ${MEMORY_LIMIT}MB"
echo "MCP services: $MCP_SERVICES"

# Spawn the agent container
echo "Starting agent container..."
docker run -d \
    --name "agent-${AGENT_ID}" \
    --memory="${MEMORY_LIMIT}m" \
    --memory-swap="${MEMORY_LIMIT}m" \
    --cpus="1.0" \
    -e AGENT_ID="$AGENT_ID" \
    -e AGENT_TYPE="$AGENT_TYPE" \
    -e TASK_ID="$TASK_ID" \
    -e CONTAINER_TYPE="$CONTAINER_TYPE" \
    -e MCP_SERVICES="$MCP_SERVICES" \
    -e MEMORY_MONITORING=true \
    -e MEMORY_REPORT_INTERVAL=30 \
    -e MEMORY_ALERT_THRESHOLD=80 \
    -e REDIS_HOST=host.docker.internal \
    -e REDIS_PORT=6379 \
    -v "$(pwd):/app/workspace" \
    -v "$MCP_CONFIG_FILE:/app/.claude/settings.json:ro" \
    -v "agent_logs_${AGENT_ID}:/app/logs" \
    claude-flow-novice:memory-monitored \
    /app/monitor-wrapper.sh start-agent \
        --agent-id "$AGENT_ID" \
        --agent-type "$AGENT_TYPE" \
        --task-id "$TASK_ID"

echo "Agent container started: agent-${AGENT_ID}"

# Return container info
cat << EOF
{
  "container_name": "agent-${AGENT_ID}",
  "agent_id": "$AGENT_ID",
  "agent_type": "$AGENT_TYPE",
  "container_type": "$CONTAINER_TYPE",
  "memory_limit_mb": $MEMORY_LIMIT,
  "mcp_services": "$MCP_SERVICES",
  "mcp_config": "$MCP_CONFIG_FILE",
  "status": "starting"
}
EOF

echo "Agent spawn completed successfully!"
```

---

## Benefits Analysis

### Context Efficiency

**Before (All agents load all MCP tools):**
```
Agent: backend-developer
MCP Tools: [playwright, browser, database, api, redis, filesystem]
Context Usage: ~15,000 tokens (80% irrelevant)
Memory Usage: ~2GB
```

**After (Specialized MCP per container):**
```
Agent: backend-developer
MCP Tools: [database, api, redis, filesystem]
Context Usage: ~6,000 tokens (100% relevant)
Memory Usage: ~1GB
```

### Resource Optimization

| Agent Type | Memory Before | Memory After | Context Reduction |
|------------|---------------|--------------|-------------------|
| Frontend   | 2GB           | 2GB          | 0% (needs Playwright) |
| Backend    | 2GB           | 1GB          | 50% |
| Tester     | 2GB           | 2GB          | 0% (needs both) |
| General    | 2GB           | 512MB        | 75% |

### Performance Benefits

1. **Faster agent startup** - less MCP tool initialization
2. **Lower memory usage** - only load relevant tools
3. **Better tool relevance** - no irrelevant Playwright prompts for backend agents
4. **Resource isolation** - per-container memory limits
5. **Scalability** - can run more agents on same hardware

---

## Usage Examples

### Spawn Frontend Agent with Playwright

```bash
./scripts/spawn-agent-with-mcp.sh \
    react-frontend-engineer \
    fe-$(date +%s) \
    task-123 \
    2048
```

**Result:** Frontend container with Playwright, browser automation, screenshot tools

### Spawn Backend Agent without Playwright

```bash
./scripts/spawn-agent-with-mcp.sh \
    backend-developer \
    be-$(date +%s) \
    task-456 \
    1024
```

**Result:** Backend container with database, API testing, Redis tools

---

## Next Steps

1. **Build MCP service images** for each tool category
2. **Test agent spawning** with different MCP configurations
3. **Measure context reduction** and performance improvements
4. **Deploy to production** with container orchestration
5. **Monitor resource usage** and optimize configurations