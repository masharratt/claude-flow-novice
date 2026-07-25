# System Integration - Architecture Reference

Integration patterns, interfaces, and connectivity for CFN agent systems.

## Table of Contents
1. [MCP Integration](#mcp-integration)
2. [Docker Architecture](#docker-architecture)
3. [Redis Infrastructure](#redis-infrastructure)
4. [Database Integration](#database-integration)
5. [CLI Coordination](#cli-coordination)
6. [Provider Routing](#provider-routing)
7. [Multi-Worktree Support](#multi-worktree-support)
8. [Web Portal Integration](#web-portal-integration)

---

## MCP Integration

### Architecture Overview

```
CFN Network (172.30.0.0/16)                    MCP Network (172.31.0.0/16)
┌─────────────────────────┐                   ┌─────────────────────────┐
│  CFN Orchestrator       │                   │  MCP Playwright (8081) │
│  (Port 3000)            │◄──────────────────►│  MCP Redis Tools (8082) │
├─────────────────────────┤                   │  MCP N8N (8083)         │
│  Redis Coordinator      │                   │  MCP Security (8084)    │
│  (Port 6379)            │                   └─────────────────────────┘
└─────────────────────────┘
```

### MCP Server Specifications

| Server | Port | Memory Limit | CPU Limit | Purpose |
|--------|------|--------------|-----------|---------|
| Playwright | 8081 | 512MB / 256MB | 0.5 / 0.25 | Browser automation |
| Redis Tools | 8082 | 256MB / 128MB | 0.25 / 0.1 | Redis management |
| N8N | 8083 | 1GB / 512MB | 1.0 / 0.5 | Workflow automation |
| Security Scanner | 8084 | 512MB / 256MB | 0.5 / 0.25 | Security analysis |

### Authentication Flow

```bash
# Generate agent-specific token
MCP_TOKEN="agent-${AGENT_ID}-${TASK_ID}-${TIMESTAMP}"

# Access MCP server
curl -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tool":"browser","action":"navigate","url":"https://example.com"}' \
  http://mcp-playwright:8081/execute
```

### Skill-Based Routing

```json
{
  "skill_to_mcp_mapping": {
    "browser-automation": ["playwright"],
    "redis-management": ["redis-tools"],
    "workflow-automation": ["n8n"],
    "security-scanning": ["security-scanner"]
  }
}
```

### Docker Compose Integration

```yaml
services:
  mcp-playwright:
    build: ./mcp/playwright
    networks:
      - mcp-network
    environment:
      - MCP_SERVER_ID=playwright
      - AUTH_TOKEN=${MCP_AUTH_TOKEN}
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  mcp-network:
    driver: bridge
    internal: true
    ipam:
      config:
        - subnet: 172.31.0.0/16
```

---

## Docker Architecture

### Multi-Worktree Isolation

**Port Allocation Formula:**
```bash
REDIS_BASE=6379
POSTGRES_BASE=5432
ORCHESTRATOR_BASE=3001

# Calculate ports based on branch hash
BRANCH_HASH=$(echo "$BRANCH" | sha256sum | cut -c1-4)
REDIS_PORT=$((REDIS_BASE + BRANCH_HASH))
POSTGRES_PORT=$((POSTGRES_BASE + BRANCH_HASH))
ORCHESTRATOR_PORT=$((ORCHESTRATOR_BASE + BRANCH_HASH))
```

**Service Names (Internal):**
- Redis: `redis` (not container name)
- Postgres: `postgres`
- Orchestrator: `orchestrator`
- MCP servers: `mcp-playwright`, `mcp-redis-tools`, etc.

**Project Naming:**
```bash
COMPOSE_PROJECT_NAME="cfn-${BRANCH//[^a-zA-Z0-9]/-}"
```

### Build Requirements

**Linux Native Build:**
```bash
# REQUIRED: Build from Linux filesystem
DOCKERFILE="docker/Dockerfile.agent"
IMAGE_NAME="cfn-agent"
./scripts/docker/build-from-linux.sh

# Build times:
# Windows mount: ~755s
# Linux native: <20s
```

### Container Specifications

**Agent Container:**
```dockerfile
FROM node:18-alpine
WORKDIR /workspace
RUN apk add --no-cache bash curl jq sqlite3
COPY ./.claude /root/.claude
CMD ["/root/.claude/agents/entrypoint.sh"]
```

**Resource Limits:**
```yaml
deploy:
  resources:
    limits:
      memory: 1G
      cpus: '1.0'
    reservations:
      memory: 512M
      cpus: '0.5'
```

---

## Redis Infrastructure

### Configuration

```javascript
// config/redis.config.js
module.exports = {
  primary: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    username: process.env.REDIS_USERNAME || '',
    password: process.env.REDIS_PASSWORD || '',
    connectTimeout: 10000,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100
  },
  fallback: process.env.REDIS_FALLBACK_1 ? {
    url: process.env.REDIS_FALLBACK_1,
    // ... same options
  } : null
};
```

### Connection Management

```javascript
const Redis = require('ioredis');

class RedisManager {
  constructor() {
    this.client = new Redis(config.primary);
    if (config.fallback) {
      this.fallback = new Redis(config.fallback);
    }
  }

  async withFallback(operation) {
    try {
      return await operation(this.client);
    } catch (error) {
      if (this.fallback) {
        console.warn('Primary Redis failed, using fallback');
        return await operation(this.fallback);
      }
      throw error;
    }
  }
}
```

### Key Naming Conventions

```bash
# Coordination keys
coord:${TASK_ID}:loop3:complete
coord:${TASK_ID}:loop2:start
coord:${TASK_ID}:decision

# Agent communication
swarm:${TASK_ID}:signal:${AGENT_ID}
swarm:${TASK_ID}:result:${AGENT_ID}

# Context storage
context:${TASK_ID}:deliverables
context:${TASK_ID}:metadata

# Locks
lock:${RESOURCE_NAME}:${EXPIRY}
```

### Coordination Primitives (v3.0.0)

**Store Context:**
```bash
./.claude/skills/redis-coordination/store-context.sh \
  --task-id "$TASK_ID" \
  --key "deliverables" \
  --value "$DELIVERABLES_JSON" \
  --ttl 3600
```

**Signal:**
```bash
./.claude/skills/redis-coordination/signal.sh send \
  --task-id "$TASK_ID" \
  --channel "agent-complete" \
  --payload "$PAYLOAD"
```

**Wait for Signal:**
```bash
./.claude/skills/redis-coordination/signal.sh wait \
  --task-id "$TASK_ID" \
  --channel "start-loop2" \
  --timeout 300
```

**Collect Results:**
```bash
./.claude/skills/redis-coordination/collect-results.sh \
  --task-id "$TASK_ID" \
  --expected 5 \
  --threshold 0.9
```

---

## Database Integration

### Dual-Layer Architecture

**Layer 1: Redis (Transient)**
- Query cache: `cache:query:${hash}`
- Session data: `session:${task_id}`
- Coordination signals: `coord:${task_id}:*`
- Locks: `lock:${resource}:${expiry}`

**Layer 2: SQLite/PostgreSQL (Persistent)**
```sql
-- Skills Database
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR(255) UNIQUE NOT NULL,
  content_hash VARCHAR(64),
  content_path VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER REFERENCES skills(id),
  agent_id VARCHAR(255),
  decision VARCHAR(20),
  confidence REAL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Connection Management

```bash
# SQLite operations with error handling
execute_sql() {
  local query="$1"
  local db_path="${2:-$DB_PATH}"

  if ! sqlite3 "$db_path" "$query" 2>/dev/null; then
    echo "[ERROR] SQLite query failed: $query" >&2
    return 1
  fi
}

# Transaction wrapper
transaction() {
  local db="$1"
  {
    echo "BEGIN TRANSACTION;"
    cat
    echo "COMMIT;"
  } | sqlite3 "$db"
}
```

### Migration Pattern

```bash
# Migration with rollback
migrate() {
  local version="$1"
  local migration_file="migrations/${version}.sql"
  local rollback_file="migrations/rollback/${version}.sql"

  # Execute migration
  sqlite3 "$DB" < "$migration_file"

  # Store rollback SQL
  sqlite3 "$DB" "INSERT INTO migrations VALUES ('$version', '$(cat "$rollback_file")')"
}
```

---

## CLI Coordination

### Spawn-Agent Script

```bash
#!/bin/bash
# .claude/skills/cfn-agent-spawning/spawn-agent.sh

set -euo pipefail

AGENT_ID="${1:?Agent ID required}"
TASK_ID="${2:?Task ID required}"
MODE="${3:-cli}"
PROVIDER="${4:-zai}"

# Required environment variables
export AGENT_ID
export TASK_ID
export MODE
export PROVIDER
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-cfn-main}"

# Agent container configuration
CONTAINER_NAME="cfn-agent-${AGENT_ID}-${TASK_ID}"
MEMORY_LIMIT="${AGENT_MEMORY_LIMIT:-1g}"
CPU_LIMIT="${AGENT_CPU_LIMIT:-1.0}"

# Spawn command
docker run -d \
  --name "$CONTAINER_NAME" \
  --network "${COMPOSE_PROJECT_NAME}_cfn-network" \
  --memory "$MEMORY_LIMIT" \
  --cpus "$CPU_LIMIT" \
  -e AGENT_ID \
  -e TASK_ID \
  -e MODE \
  -e PROVIDER \
  -v "${PWD}:/workspace" \
  cfn-agent:latest

echo "$CONTAINER_NAME"
```

### Context Passing

```bash
# CLI Agent Context Format
generate_cli_context() {
  local task_id="$1"
  local agent_id="$2"

  cat <<EOF
{
  "task_id": "$task_id",
  "agent_id": "$agent_id",
  "mode": "cli",
  "workspace": "/workspace",
  "coordination": {
    "redis": {
      "host": "redis",
      "port": 6379
    },
    "channels": {
      "complete": "coord:${task_id}:complete",
      "error": "coord:${task_id}:error",
      "signal": "coord:${task_id}:signal:${agent_id}"
    }
  },
  "resources": {
    "memory_limit": "${AGENT_MEMORY_LIMIT:-1g}",
    "timeout": "${AGENT_TIMEOUT:-300}"
  }
}
EOF
}
```

### Signal Pattern Implementation

```bash
# Agent completion signal
signal_completion() {
  local task_id="$1"
  local agent_id="$2"
  local result="${3:-success}"
  local payload="$4"

  redis-cli LPUSH "coord:${task_id}:complete" "$agent_id:$result" >/dev/null

  if [ -n "$payload" ]; then
    redis-cli LPUSH "coord:${task_id}:payload:${agent_id}" "$payload" >/dev/null
  fi
}

# Wait for all agents in loop
wait_for_loop_completion() {
  local task_id="$1"
  local expected_agents="$2"
  local timeout="${3:-600}"

  local completed=0
  local start_time=$(date +%s)

  while [ $completed -lt $expected_agents ]; do
    local elapsed=$(($(date +%s) - start_time))
    if [ $elapsed -gt $timeout ]; then
      echo "[ERROR] Timeout waiting for agent completion" >&2
      return 1
    fi

    completed=$(redis-cli LLEN "coord:${task_id}:complete" || echo "0")
    sleep 2
  done
}
```

---

## Provider Routing

### Configuration

```bash
# Enable custom routing
export CFN_CUSTOM_ROUTING=true

# Provider mapping
PROVIDER_ROUTES=(
  "zai:glm-4.6"
  "kimi:kimi-latest"
  "openrouter:anthropic/claude-3-5-sonnet"
  "max:anthropic/claude-3-opus-20240229"
  "anthropic:claude-3-5-sonnet-20241022"
  "gemini:gemini-2.0-flash-exp"
  "xai:grok-beta"
)
```

### Agent-Specific Providers

```bash
# Agent profiles with provider hints
cat > .claude/agents/cfn-dev-team/system-architect.json <<EOF
{
  "id": "system-architect",
  "name": "System Architect",
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "temperature": 0.3,
  "max_tokens": 8192
}
EOF
```

### Dynamic Provider Selection

```javascript
// lib/provider-router.js
class ProviderRouter {
  static selectProvider(agentId, task) {
    const agent = AgentProfile.get(agentId);

    // Agent-specific provider
    if (agent.provider) {
      return agent.provider;
    }

    // Task-based routing
    if (task.complexity === 'high') {
      return process.env.HIGH_COMPLEXITY_PROVIDER || 'anthropic';
    }

    if (task.cost_sensitive) {
      return process.env.COST_PROVIDER || 'zai';
    }

    // Default provider
    return process.env.DEFAULT_PROVIDER || 'kimi';
  }
}
```

---

## Multi-Worktree Support

### Worktree Creation

```bash
# Create isolated worktree
git worktree add ../cfn-feature-auth feature-auth
cd ../cfn-feature-auth

# Export worktree environment
export WORKTREE_BRANCH="feature-auth"
export COMPOSE_PROJECT_NAME="cfn-feature-auth"
export CFN_REDIS_PORT="6421"
export CFN_POSTGRES_PORT="5474"
export CFN_ORCHESTRATOR_PORT="3043"
```

### Port Offset Calculation

```bash
calculate_ports() {
  local branch="$1"
  local hash=$(echo "$branch" | sha256sum | cut -c1-2)
  local offset=$((0x$hash % 1000))

  echo $((6379 + offset)) # Redis
  echo $((5432 + offset)) # Postgres
  echo $((3001 + offset)) # Orchestrator
}
```

### Docker Compose Override

```yaml
# docker-compose.worktree.yml
version: '3.8'
services:
  redis:
    ports:
      - "${CFN_REDIS_PORT:-6379}:6379"
  postgres:
    ports:
      - "${CFN_POSTGRES_PORT:-5432}:5432"
  orchestrator:
    ports:
      - "${CFN_ORCHESTRATOR_PORT:-3001}:3000"
```

### Volume Isolation

```bash
# Isolate volumes by branch
docker run -d \
  -v "${COMPOSE_PROJECT_NAME}_redis-data:/data" \
  -v "${COMPOSE_PROJECT_NAME}_postgres-data:/var/lib/postgresql/data" \
  cfn-redis:latest
```

---

## Web Portal Integration

### WebSocket Connection

```javascript
// Real-time updates
const socket = io('/cfn-loop', {
  auth: {
    taskId: currentTaskId,
    token: authToken
  }
});

socket.on('agent:update', (data) => {
  updateAgentStatus(data.agentId, data.status);
});

socket.on('loop:progress', (data) => {
  updateProgressBar(data.loop, data.progress);
});
```

### REST API Endpoints

```javascript
// Agent management
POST   /api/agents/spawn
GET    /api/agents/:taskId
DELETE /api/agents/:agentId

// Task coordination
POST   /api/tasks/create
GET    /api/tasks/:taskId/status
POST   /api/tasks/:taskId/decision

# Monitoring
GET    /api/metrics/agents
GET    /api/metrics/tasks
GET    /api/health/system
```

### Authentication Integration

```bash
# JWT token generation
generate_agent_token() {
  local agent_id="$1"
  local task_id="$2"
  local expires_at=$(($(date +%s) + 3600))

  jwt_encode \
    --sub "$agent_id" \
    --aud "cfn-agents" \
    --exp "$expires_at" \
    --claims "task_id:$task_id,role:agent"
}
```

---

## Integration Testing

### End-to-End Test Pattern

```bash
#!/bin/bash
# tests/integration/cfn-loop-e2e.sh

set -euo pipefail

# Setup isolated environment
export COMPOSE_PROJECT_NAME="test-$(date +%s)"
export REDIS_URL="redis://redis:6379"
export DB_PATH="/tmp/test-$(date +%s).db"

# Start services
docker-compose -f docker-compose.test.yml up -d

# Run test scenario
./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "test-$(date +%s)" \
  --mode standard \
  --epic "Test the entire CFN Loop"

# Verify results
check_test_results "$COMPOSE_PROJECT_NAME"

# Cleanup
docker-compose -f docker-compose.test.yml down -v
```

### Health Check Implementation

```bash
# Comprehensive health check
check_system_health() {
  local errors=0

  # Check Redis
  if ! redis-cli ping >/dev/null 2>&1; then
    echo "[ERROR] Redis not responding" >&2
    ((errors++))
  fi

  # Check database
  if ! sqlite3 "$DB_PATH" "SELECT 1" >/dev/null 2>&1; then
    echo "[ERROR] Database not accessible" >&2
    ((errors++))
  fi

  # Check required services
  for service in orchestrator redis postgres; do
    if ! docker ps | grep -q "$service"; then
      echo "[ERROR] Service $service not running" >&2
      ((errors++))
    fi
  done

  return $errors
}
```

---

## Troubleshooting Guide

### Common Issues

**Redis Connection Refused:**
```bash
# Check Redis is running
docker ps | grep redis

# Check network connectivity
docker network ls | grep cfn
docker network inspect cfn_cfn-network

# Test from agent container
docker exec -it $AGENT_CONTAINER redis-cli -h redis ping
```

**Agent Spawn Fails:**
```bash
# Check agent image exists
docker images | grep cfn-agent

# Check volume mounts
docker inspect $AGENT_CONTAINER | jq -r '.Mounts'

# Check environment variables
docker exec -it $AGENT_CONTAINER env | grep -E "(AGENT|TASK|MODE)"
```

**Port Conflicts:**
```bash
# Find process using port
lsof -i :6379
netstat -tulpn | grep :6379

# Clean up stuck containers
docker container prune -f
docker network prune -f
```

### Debug Commands

```bash
# Monitor Redis keys
redis-cli --scan --pattern "coord:*" | head -20

# View agent logs
docker logs -f $AGENT_CONTAINER

# Check system resources
docker stats --no-stream

# Validate configuration
./scripts/validate-config.sh --verbose
```