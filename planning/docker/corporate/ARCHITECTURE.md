# Corporate AI Organization Architecture

**Version:** 1.0.0
**Date:** 2025-11-12
**Status:** Draft

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Container Architecture](#2-container-architecture)
3. [Network Topology](#3-network-topology)
4. [Storage Architecture](#4-storage-architecture)
5. [MCP Configuration System](#5-mcp-configuration-system)
6. [Security Architecture](#6-security-architecture)
7. [Deployment Architecture](#7-deployment-architecture)
8. [Data Flow Diagrams](#8-data-flow-diagrams)

---

## 1. System Overview

### 1.1 High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          Docker Host (Linux)                               │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                     Main Coordinator Container                        │ │
│  │  - Strategic oversight                                                │ │
│  │  - Cross-team resource allocation                                    │ │
│  │  - Performance monitoring                                            │ │
│  │  - Budget management                                                 │ │
│  │  Network: cfn-coordination (172.18.0.10)                            │ │
│  └──────────────┬───────────────────────────────────────────────────────┘ │
│                 │                                                          │
│    ┌────────────┼────────────┬────────────┬────────────┐                 │
│    │            │            │            │            │                  │
│  ┌─▼──────┐  ┌─▼──────┐  ┌─▼──────┐  ┌─▼──────┐  ┌──▼──────┐           │
│  │Frontend│  │Backend │  │DevOps  │  │   QA   │  │  Shared │           │
│  │  Team  │  │  Team  │  │  Team  │  │  Team  │  │Services │           │
│  │ Coord. │  │ Coord. │  │ Coord. │  │ Coord. │  │         │           │
│  └───┬────┘  └────┬───┘  └────┬───┘  └────┬───┘  └─────────┘           │
│      │            │            │            │                             │
│  ┌───┴─────┐  ┌───┴─────┐  ┌───┴─────┐  ┌───┴─────┐                    │
│  │Agents   │  │Agents   │  │Agents   │  │Agents   │                    │
│  │(3-10)   │  │(3-10)   │  │(3-10)   │  │(3-10)   │                    │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘                    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                      Shared Infrastructure                            │ │
│  │  ┌───────────┐  ┌────────────┐  ┌──────────────┐                   │ │
│  │  │   Redis   │  │ PostgreSQL │  │ Object Store │                   │ │
│  │  │  (Hot)    │  │  (Warm)    │  │   (Cold)     │                   │ │
│  │  └───────────┘  └────────────┘  └──────────────┘                   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Role | Instances | Memory | CPU |
|-----------|------|-----------|--------|-----|
| Main Coordinator | Strategic oversight, cross-team coordination | 1 (+ standby) | 4GB | 2 cores |
| Team Coordinator | Team management, agent spawning | 4 (one per team) | 4GB each | 2 cores each |
| Agent | Task execution, knowledge building | 10-50 per team | 2-8GB each | 0.5-2 cores each |
| Redis (Shared) | Hot storage, pub/sub | 1 (+ replicas) | 8GB | 2 cores |
| Redis (Team) | Team-specific coordination | 4 (one per team) | 2GB each | 1 core each |
| PostgreSQL | Warm storage, persistence | 1 (+ replicas) | 16GB | 4 cores |

---

## 2. Container Architecture

### 2.1 Container Hierarchy

```
cfn-main-coordinator
  ├── Dockerfile: docker/coordinator/Dockerfile.main
  ├── Entry: node /app/dist/main-coordinator.js
  ├── Networks: [cfn-coordination]
  ├── Volumes:
  │   └── /var/run/docker.sock (RW) - spawn team coordinators
  └── Environment:
      ├── REDIS_HOST=cfn-redis-shared
      ├── POSTGRES_HOST=cfn-postgres
      ├── ORG_BUDGET=15500
      └── TEAMS=[frontend,backend,devops,qa]

cfn-team-coordinator-{team}
  ├── Dockerfile: docker/coordinator/Dockerfile.team
  ├── Entry: node /app/dist/team-coordinator.js
  ├── Networks: [cfn-coordination, team-{team}]
  ├── Volumes:
  │   ├── /var/run/docker.sock (RW) - spawn agents
  │   └── ./config/teams/{team}:/config:ro
  └── Environment:
      ├── TEAM_ID={team}
      ├── REDIS_HOST=cfn-redis-{team}
      ├── POSTGRES_HOST=cfn-postgres
      ├── BUDGET_ALLOCATED={team_budget}
      └── MAX_AGENTS={team_max_agents}

cfn-agent-{team}-{role}-{id}
  ├── Dockerfile: docker/agents/Dockerfile.{team}
  ├── Entry: npx claude-flow-novice agent {role} "$TASK_PROMPT"
  ├── Networks: [team-{team}]
  ├── Volumes:
  │   ├── /workspace/{team_path}:/workspace:{access_mode}
  │   ├── ./mcp-configs/{team}/{role}.json:/home/claude/.config/...
  │   └── ./claude/skills:/skills:ro
  └── Environment:
      ├── TEAM_ID={team}
      ├── AGENT_ID={id}
      ├── AGENT_ROLE={role}
      ├── TASK_PROMPT={task}
      ├── REDIS_NAMESPACE=team:{team}:agent:{role}:{id}
      └── ANTHROPIC_API_KEY / ZAI_API_KEY / etc.
```

### 2.2 Dockerfile Structure

**Main Coordinator (`docker/coordinator/Dockerfile.main`):**
```dockerfile
FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache docker-cli redis postgresql-client

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy compiled TypeScript
COPY dist/ ./dist/

# Copy configuration
COPY config/main-coordinator.yaml ./config/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node /app/dist/healthcheck.js || exit 1

# Run as non-root user
USER node

# Entry point
CMD ["node", "/app/dist/main-coordinator.js"]
```

**Team Coordinator (`docker/coordinator/Dockerfile.team`):**
```dockerfile
FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache docker-cli redis postgresql-client

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD redis-cli -h $REDIS_HOST PING | grep -q PONG || exit 1

USER node

CMD ["node", "/app/dist/team-coordinator.js"]
```

**Frontend Team Agent (`docker/agents/Dockerfile.frontend`):**
```dockerfile
FROM node:20

# Install Claude Code CLI
RUN npm install -g @anthropic/claude-code

# Install frontend-specific tools
RUN npm install -g \
  typescript \
  @typescript-eslint/parser \
  prettier \
  eslint

# Install MCP servers
RUN npm install -g \
  @modelcontextprotocol/server-playwright \
  @modelcontextprotocol/server-redis \
  @modelcontextprotocol/server-filesystem

# Create workspace directory
WORKDIR /workspace

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD redis-cli -h $REDIS_HOST GET team:$TEAM_ID:agent:$AGENT_ID:heartbeat || exit 1

# Run as claude user
RUN useradd -m -s /bin/bash claude
USER claude

# Entry point
CMD ["npx", "claude-flow-novice", "agent", "$AGENT_ROLE", "$TASK_PROMPT"]
```

**Backend Team Agent (`docker/agents/Dockerfile.backend`):**
```dockerfile
FROM node:20

RUN npm install -g @anthropic/claude-code

# Install backend-specific tools
RUN npm install -g \
  typescript \
  prisma \
  @nestjs/cli \
  jest

# Install MCP servers
RUN npm install -g \
  @modelcontextprotocol/server-postgres \
  @modelcontextprotocol/server-redis \
  @modelcontextprotocol/server-filesystem \
  @modelcontextprotocol/server-docker

WORKDIR /workspace

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD redis-cli -h $REDIS_HOST GET team:$TEAM_ID:agent:$AGENT_ID:heartbeat || exit 1

RUN useradd -m -s /bin/bash claude
USER claude

CMD ["npx", "claude-flow-novice", "agent", "$AGENT_ROLE", "$TASK_PROMPT"]
```

### 2.3 Image Tagging Strategy

```bash
# Main coordinator
cfn-main-coordinator:latest
cfn-main-coordinator:v1.0.0
cfn-main-coordinator:v1.0.0-sha-abc123

# Team coordinators (shared image)
cfn-team-coordinator:latest
cfn-team-coordinator:v1.0.0

# Team-specific agent images
cfn-agent-frontend:latest
cfn-agent-frontend:v1.0.0

cfn-agent-backend:latest
cfn-agent-backend:v1.0.0

cfn-agent-devops:latest
cfn-agent-devops:v1.0.0

cfn-agent-qa:latest
cfn-agent-qa:v1.0.0
```

---

## 3. Network Topology

### 3.1 Network Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Docker Bridge Networks                                              │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ cfn-coordination (172.18.0.0/24)                            │   │
│ │ Purpose: Main coordinator ↔ Team coordinators               │   │
│ │                                                             │   │
│ │ Containers:                                                 │   │
│ │   172.18.0.10   - cfn-main-coordinator                     │   │
│ │   172.18.0.11   - cfn-team-coordinator-frontend            │   │
│ │   172.18.0.12   - cfn-team-coordinator-backend             │   │
│ │   172.18.0.13   - cfn-team-coordinator-devops              │   │
│ │   172.18.0.14   - cfn-team-coordinator-qa                  │   │
│ │   172.18.0.20   - cfn-redis-shared                         │   │
│ │   172.18.0.30   - cfn-postgres                             │   │
│ │                                                             │   │
│ │ Firewall: Team coordinators can ONLY talk to main coord.   │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ team-frontend (172.18.1.0/24)                              │   │
│ │ Purpose: Frontend team coordinator ↔ Frontend agents        │   │
│ │                                                             │   │
│ │ Containers:                                                 │   │
│ │   172.18.1.10   - cfn-team-coordinator-frontend (bridged)  │   │
│ │   172.18.1.11   - cfn-agent-frontend-react-001             │   │
│ │   172.18.1.12   - cfn-agent-frontend-ui-002                │   │
│ │   172.18.1.13   - cfn-agent-frontend-typescript-003        │   │
│ │   172.18.1.20   - cfn-redis-frontend                       │   │
│ │   ...                                                       │   │
│ │                                                             │   │
│ │ Firewall: Agents can ONLY talk to team coordinator + Redis │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ team-backend (172.18.2.0/24)                               │   │
│ │ Purpose: Backend team coordinator ↔ Backend agents          │   │
│ │                                                             │   │
│ │ Containers:                                                 │   │
│ │   172.18.2.10   - cfn-team-coordinator-backend (bridged)   │   │
│ │   172.18.2.11   - cfn-agent-backend-api-001                │   │
│ │   172.18.2.12   - cfn-agent-backend-db-002                 │   │
│ │   172.18.2.13   - cfn-agent-backend-graphql-003            │   │
│ │   172.18.2.20   - cfn-redis-backend                        │   │
│ │   ...                                                       │   │
│ │                                                             │   │
│ │ Firewall: Agents can ONLY talk to team coordinator + Redis │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ team-devops (172.18.3.0/24)                                │   │
│ │ Purpose: DevOps team coordinator ↔ DevOps agents            │   │
│ │                                                             │   │
│ │ Containers:                                                 │   │
│ │   172.18.3.10   - cfn-team-coordinator-devops (bridged)    │   │
│ │   172.18.3.11   - cfn-agent-devops-docker-001              │   │
│ │   172.18.3.12   - cfn-agent-devops-k8s-002                 │   │
│ │   172.18.3.13   - cfn-agent-devops-cicd-003                │   │
│ │   172.18.3.20   - cfn-redis-devops                         │   │
│ │   ...                                                       │   │
│ │                                                             │   │
│ │ Firewall: Agents can ONLY talk to team coordinator + Redis │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ team-qa (172.18.4.0/24)                                    │   │
│ │ Purpose: QA team coordinator ↔ QA agents                    │   │
│ │                                                             │   │
│ │ Containers:                                                 │   │
│ │   172.18.4.10   - cfn-team-coordinator-qa (bridged)        │   │
│ │   172.18.4.11   - cfn-agent-qa-playwright-001              │   │
│ │   172.18.4.12   - cfn-agent-qa-security-002                │   │
│ │   172.18.4.13   - cfn-agent-qa-load-003                    │   │
│ │   172.18.4.20   - cfn-redis-qa                             │   │
│ │   ...                                                       │   │
│ │                                                             │   │
│ │ Firewall: Agents can ONLY talk to team coordinator + Redis │   │
│ └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Network Creation Script

```bash
#!/bin/bash
# File: scripts/create-networks.sh

# Create coordination network
docker network create \
  --driver bridge \
  --subnet 172.18.0.0/24 \
  --gateway 172.18.0.1 \
  --label cfn.network=coordination \
  cfn-coordination

# Create team networks
TEAMS=("frontend:1" "backend:2" "devops:3" "qa:4")

for team_subnet in "${TEAMS[@]}"; do
  IFS=':' read -r team subnet_id <<< "$team_subnet"

  docker network create \
    --driver bridge \
    --subnet "172.18.${subnet_id}.0/24" \
    --gateway "172.18.${subnet_id}.1" \
    --label cfn.network=team \
    --label cfn.team="${team}" \
    "team-${team}"

  echo "Created network: team-${team}"
done

echo "All networks created successfully"
```

### 3.3 Firewall Rules (iptables)

```bash
#!/bin/bash
# File: scripts/configure-firewall.sh

# Allow agents to communicate with team coordinator
for team in frontend backend devops qa; do
  # Get team subnet ID
  case $team in
    frontend) subnet_id=1 ;;
    backend)  subnet_id=2 ;;
    devops)   subnet_id=3 ;;
    qa)       subnet_id=4 ;;
  esac

  # Allow agents (172.18.X.11-50) → coordinator (172.18.X.10)
  iptables -A DOCKER-USER \
    -s "172.18.${subnet_id}.11/28" \
    -d "172.18.${subnet_id}.10" \
    -j ACCEPT

  # Allow agents → team Redis (172.18.X.20)
  iptables -A DOCKER-USER \
    -s "172.18.${subnet_id}.11/28" \
    -d "172.18.${subnet_id}.20" \
    -j ACCEPT

  # Block agents from talking to other teams
  for other_subnet in 1 2 3 4; do
    if [ $other_subnet -ne $subnet_id ]; then
      iptables -A DOCKER-USER \
        -s "172.18.${subnet_id}.11/28" \
        -d "172.18.${other_subnet}.0/24" \
        -j DROP
    fi
  done

  # Block agents from reaching coordination network
  iptables -A DOCKER-USER \
    -s "172.18.${subnet_id}.11/28" \
    -d "172.18.0.0/24" \
    -j DROP
done

# Allow team coordinators to communicate with main coordinator
iptables -A DOCKER-USER \
  -s "172.18.0.11/30" \
  -d "172.18.0.10" \
  -j ACCEPT

# Allow team coordinators to access shared Redis
iptables -A DOCKER-USER \
  -s "172.18.0.11/30" \
  -d "172.18.0.20" \
  -j ACCEPT

# Allow team coordinators to access shared PostgreSQL
iptables -A DOCKER-USER \
  -s "172.18.0.11/30" \
  -d "172.18.0.30" \
  -j ACCEPT

echo "Firewall rules configured"
```

---

## 4. Storage Architecture

### 4.1 Storage Hierarchy

```
┌────────────────────────────────────────────────────────────────┐
│                    Storage Layer Hierarchy                     │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Layer 1: Hot Storage (Redis)                              │ │
│ │ - Real-time agent state                                   │ │
│ │ - Recent knowledge (7 days)                               │ │
│ │ - Pub/sub messaging                                       │ │
│ │ - Heartbeat tracking                                      │ │
│ │                                                           │ │
│ │ Instances:                                                │ │
│ │   • cfn-redis-shared (coordination layer)                │ │
│ │   • cfn-redis-frontend (team namespace)                  │ │
│ │   • cfn-redis-backend (team namespace)                   │ │
│ │   • cfn-redis-devops (team namespace)                    │ │
│ │   • cfn-redis-qa (team namespace)                        │ │
│ │                                                           │ │
│ │ Persistence: RDB snapshots (5min) + AOF (everysec)       │ │
│ │ Retention: TTL-based (1h - 30 days)                      │ │
│ └────────────────────────────────────────────────────────────┘ │
│                              ↓                                 │
│                    (Automatic migration)                       │
│                              ↓                                 │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Layer 2: Warm Storage (PostgreSQL)                        │ │
│ │ - Agent profiles                                          │ │
│ │ - Playbook library (versioned)                            │ │
│ │ - Knowledge base (permanent)                              │ │
│ │ - Task history (7 years)                                  │ │
│ │ - Audit logs (7 years)                                    │ │
│ │                                                           │ │
│ │ Instance: cfn-postgres (172.18.0.30)                      │ │
│ │ Replication: Primary + 2 replicas                         │ │
│ │ Backup: WAL archiving + daily snapshots                   │ │
│ └────────────────────────────────────────────────────────────┘ │
│                              ↓                                 │
│                    (Manual archival)                           │
│                              ↓                                 │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Layer 3: Cold Storage (S3/MinIO)                          │ │
│ │ - Historical playbooks (>180 days)                        │ │
│ │ - Old task logs (>90 days)                                │ │
│ │ - Compliance archives (7 years)                           │ │
│ │ - Large artifacts (videos, datasets)                      │ │
│ │                                                           │ │
│ │ Lifecycle: 180d → Glacier, 7y → Delete                   │ │
│ │ Encryption: AES-256 server-side                           │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Redis Configuration

**Shared Redis (`config/redis/shared.conf`):**
```conf
# Network
bind 172.18.0.20
port 6379
protected-mode yes
requirepass ${REDIS_PASSWORD}

# Memory
maxmemory 8gb
maxmemory-policy allkeys-lru

# Persistence
save 300 10      # Save if 10 keys changed in 5 minutes
save 60 10000    # Save if 10k keys changed in 1 minute
appendonly yes
appendfsync everysec

# Replication
replicaof ${REDIS_REPLICA_HOST} 6379
masterauth ${REDIS_PASSWORD}

# Namespaces (logical, enforced by clients)
# - main:*               (main coordinator)
# - coordination:*       (cross-team coordination)
# - team:{team}:budget   (team budgets)
```

**Team Redis (`config/redis/team-frontend.conf`):**
```conf
bind 172.18.1.20
port 6379
protected-mode yes
requirepass ${REDIS_FRONTEND_PASSWORD}

maxmemory 2gb
maxmemory-policy volatile-lru

save 300 10
appendonly yes
appendfsync everysec

# Namespaces (logical)
# - team:frontend:agent:{role}:{id}:*  (agent state/knowledge)
# - team:frontend:coordinator:*        (coordinator state)
# - agent:frontend:inbox:{id}          (pub/sub)
# - coordinator:frontend:inbox         (pub/sub)
```

### 4.3 PostgreSQL Schema

**Database:** `cfn_corporate`

**Tables:**

```sql
-- Agents table
CREATE TABLE agents (
    id UUID PRIMARY KEY,
    team_id VARCHAR(50) NOT NULL,
    role VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'idle', 'failed', 'terminated')),
    spawned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_heartbeat TIMESTAMP,
    total_tasks_completed INTEGER DEFAULT 0,
    avg_confidence DECIMAL(3, 2),
    total_cost DECIMAL(10, 2) DEFAULT 0,
    metadata JSONB,

    INDEX idx_team_status (team_id, status),
    INDEX idx_heartbeat (last_heartbeat)
);

-- Playbooks table
CREATE TABLE playbooks (
    id UUID PRIMARY KEY,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    team_id VARCHAR(50) NOT NULL,
    playbook_name VARCHAR(200) NOT NULL,
    playbook_content JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    success_rate DECIMAL(5, 2),
    times_used INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE (agent_id, playbook_name, version),
    INDEX idx_team_playbook (team_id, playbook_name)
);

-- Knowledge entries table
CREATE TABLE knowledge_entries (
    id UUID PRIMARY KEY,
    owner_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    team_id VARCHAR(50) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('agent', 'team', 'org')),
    category VARCHAR(100) NOT NULL,
    content JSONB NOT NULL,
    confidence DECIMAL(3, 2),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    INDEX idx_team_scope (team_id, scope),
    INDEX idx_category (category),
    INDEX idx_confidence (confidence DESC)
);

-- Task history table (partitioned by month)
CREATE TABLE task_history (
    id UUID,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    team_id VARCHAR(50) NOT NULL,
    task_description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'timeout')),
    confidence_reported DECIMAL(3, 2),
    input_tokens INTEGER,
    output_tokens INTEGER,
    cost DECIMAL(8, 4),
    error_log TEXT,
    metadata JSONB,

    PRIMARY KEY (id, start_time)
) PARTITION BY RANGE (start_time);

-- Create monthly partitions
CREATE TABLE task_history_2025_11 PARTITION OF task_history
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Team coordinators table
CREATE TABLE team_coordinators (
    id UUID PRIMARY KEY,
    team_id VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'standby', 'failed')),
    spawned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_heartbeat TIMESTAMP,
    agent_count INTEGER DEFAULT 0,
    budget_allocated DECIMAL(10, 2),
    budget_spent DECIMAL(10, 2),
    metadata JSONB,

    INDEX idx_status (status),
    INDEX idx_heartbeat (last_heartbeat)
);

-- Resource transactions table
CREATE TABLE resource_transactions (
    id UUID PRIMARY KEY,
    from_team VARCHAR(50) NOT NULL,
    to_team VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    quantity VARCHAR(50) NOT NULL,
    duration_seconds INTEGER,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'completed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,

    INDEX idx_teams (from_team, to_team),
    INDEX idx_status (status)
);

-- Audit logs table (partitioned by month)
CREATE TABLE audit_logs (
    id UUID,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    event_type VARCHAR(50) NOT NULL,
    actor_type VARCHAR(20) NOT NULL,
    actor_id VARCHAR(100),
    team_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(200),
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'denied', 'error')),
    metadata JSONB,

    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE audit_logs_2025_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
```

---

## 5. MCP Configuration System

### 5.1 MCP Config Structure

```
.docker/mcp-configs/
├── base.json                          # Shared by ALL agents
├── teams/
│   ├── frontend/
│   │   ├── team-base.json            # Shared by all frontend agents
│   │   └── agents/
│   │       ├── react-specialist.json
│   │       ├── ui-designer.json
│   │       └── typescript-specialist.json
│   ├── backend/
│   │   ├── team-base.json
│   │   └── agents/
│   │       ├── api-developer.json
│   │       ├── database-architect.json
│   │       └── graphql-specialist.json
│   ├── devops/
│   │   ├── team-base.json
│   │   └── agents/
│   │       ├── docker-specialist.json
│   │       ├── kubernetes-operator.json
│   │       └── cicd-engineer.json
│   └── qa/
│       ├── team-base.json
│       └── agents/
│           ├── playwright-tester.json
│           ├── security-tester.json
│           └── load-tester.json
└── scripts/
    ├── generate-config.js             # MCP config generator
    └── merge-configs.js               # Config inheritance system
```

### 5.2 Config Inheritance

**Base Config (`base.json`):**
```json
{
  "mcpServers": {
    "redis": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-redis"],
      "env": {
        "REDIS_HOST": "${REDIS_HOST}",
        "REDIS_PORT": "6379",
        "REDIS_PASSWORD": "${REDIS_PASSWORD}",
        "REDIS_NAMESPACE": "${REDIS_NAMESPACE}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {
        "ALLOWED_PATHS": "/workspace"
      }
    }
  }
}
```

**Team Base Config (`teams/frontend/team-base.json`):**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-playwright"],
      "env": {
        "BROWSER": "chromium",
        "HEADLESS": "true"
      }
    },
    "browser-devtools": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-chrome-devtools"]
    }
  }
}
```

**Agent-Specific Config (`teams/frontend/agents/react-specialist.json`):**
```json
{
  "mcpServers": {
    "filesystem": {
      "env": {
        "ALLOWED_PATHS": "/workspace/src/components,/workspace/src/hooks"
      }
    }
  }
}
```

**Merged Result** (for `react-specialist` agent):
```json
{
  "mcpServers": {
    "redis": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-redis"],
      "env": {
        "REDIS_HOST": "cfn-redis-frontend",
        "REDIS_PORT": "6379",
        "REDIS_PASSWORD": "***",
        "REDIS_NAMESPACE": "team:frontend:agent:react-specialist:001"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "env": {
        "ALLOWED_PATHS": "/workspace/src/components,/workspace/src/hooks"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-playwright"],
      "env": {
        "BROWSER": "chromium",
        "HEADLESS": "true"
      }
    },
    "browser-devtools": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-chrome-devtools"]
    }
  }
}
```

### 5.3 Config Generation Script

```javascript
// File: .docker/mcp-configs/scripts/generate-config.js

const fs = require('fs');
const path = require('path');

function mergeConfigs(base, team, agent) {
  const merged = JSON.parse(JSON.stringify(base));

  // Merge team config
  for (const [key, value] of Object.entries(team.mcpServers || {})) {
    if (merged.mcpServers[key]) {
      // Deep merge
      merged.mcpServers[key] = deepMerge(merged.mcpServers[key], value);
    } else {
      merged.mcpServers[key] = value;
    }
  }

  // Merge agent config
  for (const [key, value] of Object.entries(agent.mcpServers || {})) {
    if (merged.mcpServers[key]) {
      merged.mcpServers[key] = deepMerge(merged.mcpServers[key], value);
    } else {
      merged.mcpServers[key] = value;
    }
  }

  return merged;
}

function generateAgentConfig(team, role, agentId) {
  const base = JSON.parse(fs.readFileSync('base.json', 'utf8'));
  const teamBase = JSON.parse(fs.readFileSync(`teams/${team}/team-base.json`, 'utf8'));
  const agentConfig = JSON.parse(fs.readFileSync(`teams/${team}/agents/${role}.json`, 'utf8'));

  const merged = mergeConfigs(base, teamBase, agentConfig);

  // Substitute environment variables
  const configStr = JSON.stringify(merged, null, 2)
    .replace(/\${REDIS_HOST}/g, `cfn-redis-${team}`)
    .replace(/\${REDIS_NAMESPACE}/g, `team:${team}:agent:${role}:${agentId}`);

  return JSON.parse(configStr);
}

// CLI usage
if (require.main === module) {
  const [team, role, agentId] = process.argv.slice(2);

  if (!team || !role || !agentId) {
    console.error('Usage: node generate-config.js <team> <role> <agent-id>');
    process.exit(1);
  }

  const config = generateAgentConfig(team, role, agentId);
  console.log(JSON.stringify(config, null, 2));
}

module.exports = { generateAgentConfig };
```

---

## 6. Security Architecture

### 6.1 Defense in Depth

```
┌────────────────────────────────────────────────────────────────┐
│ Layer 1: Host Security                                        │
│ - OS hardening (minimal packages)                             │
│ - Kernel security modules (AppArmor, SELinux)                 │
│ - Host firewall (iptables)                                    │
│ - Regular security updates                                    │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ Layer 2: Network Security                                     │
│ - Network segmentation (team-based)                           │
│ - Firewall rules (inter-container)                            │
│ - TLS encryption (Redis, PostgreSQL)                          │
│ - No internet access from agents                              │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ Layer 3: Container Security                                   │
│ - Read-only root filesystem                                   │
│ - No new privileges                                           │
│ - Dropped capabilities                                        │
│ - Resource limits (CPU, memory, PIDs)                         │
│ - Non-root user execution                                     │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ Layer 4: Application Security                                 │
│ - MCP permission model (allowlist)                            │
│ - API key rotation                                            │
│ - Input validation                                            │
│ - Rate limiting                                               │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ Layer 5: Data Security                                        │
│ - Encryption at rest (PostgreSQL, S3)                         │
│ - Encryption in transit (TLS)                                 │
│ - Namespace isolation (Redis)                                 │
│ - Access audit logging                                        │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Secrets Management

**Vault Integration:**
```bash
# Store team secrets in HashiCorp Vault
vault kv put secret/cfn/teams/frontend \
  redis_password="..." \
  anthropic_api_key="..." \
  zai_api_key="..."

# Retrieve at container spawn time
REDIS_PASSWORD=$(vault kv get -field=redis_password secret/cfn/teams/frontend)

# Inject via environment variable
docker run -e REDIS_PASSWORD="$REDIS_PASSWORD" ...
```

**Alternative: Docker Secrets:**
```bash
# Create Docker secrets
echo "redis-password-value" | docker secret create redis_frontend_password -

# Use in container
docker service create \
  --name cfn-agent-frontend \
  --secret redis_frontend_password \
  ...

# Access in container at /run/secrets/redis_frontend_password
```

---

## 7. Deployment Architecture

### 7.1 Docker Compose (Development)

```yaml
# File: docker-compose.yml

version: '3.8'

services:
  # Shared infrastructure
  redis-shared:
    image: redis:7-alpine
    container_name: cfn-redis-shared
    networks:
      cfn-coordination:
        ipv4_address: 172.18.0.20
    volumes:
      - redis-shared-data:/data
      - ./config/redis/shared.conf:/usr/local/etc/redis/redis.conf:ro
    command: redis-server /usr/local/etc/redis/redis.conf

  postgres:
    image: postgres:16-alpine
    container_name: cfn-postgres
    networks:
      cfn-coordination:
        ipv4_address: 172.18.0.30
    environment:
      POSTGRES_DB: cfn_corporate
      POSTGRES_USER: cfn_admin
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./config/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro

  # Main coordinator
  main-coordinator:
    build:
      context: .
      dockerfile: docker/coordinator/Dockerfile.main
    container_name: cfn-main-coordinator
    networks:
      cfn-coordination:
        ipv4_address: 172.18.0.10
    environment:
      REDIS_HOST: cfn-redis-shared
      POSTGRES_HOST: cfn-postgres
      ORG_BUDGET: 15500
      TEAMS: frontend,backend,devops,qa
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config/teams:/config/teams:ro
    depends_on:
      - redis-shared
      - postgres

  # Team coordinators
  team-coordinator-frontend:
    build:
      context: .
      dockerfile: docker/coordinator/Dockerfile.team
    container_name: cfn-team-coordinator-frontend
    networks:
      cfn-coordination:
        ipv4_address: 172.18.0.11
      team-frontend:
        ipv4_address: 172.18.1.10
    environment:
      TEAM_ID: frontend
      REDIS_HOST: cfn-redis-frontend
      POSTGRES_HOST: cfn-postgres
      BUDGET_ALLOCATED: 4000
      MAX_AGENTS: 10
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./config/teams/frontend:/config:ro
    depends_on:
      - main-coordinator
      - redis-frontend

  redis-frontend:
    image: redis:7-alpine
    container_name: cfn-redis-frontend
    networks:
      team-frontend:
        ipv4_address: 172.18.1.20
    volumes:
      - redis-frontend-data:/data
      - ./config/redis/team-frontend.conf:/usr/local/etc/redis/redis.conf:ro
    command: redis-server /usr/local/etc/redis/redis.conf

networks:
  cfn-coordination:
    driver: bridge
    ipam:
      config:
        - subnet: 172.18.0.0/24
          gateway: 172.18.0.1

  team-frontend:
    driver: bridge
    ipam:
      config:
        - subnet: 172.18.1.0/24
          gateway: 172.18.1.1

  team-backend:
    driver: bridge
    ipam:
      config:
        - subnet: 172.18.2.0/24
          gateway: 172.18.2.1

  team-devops:
    driver: bridge
    ipam:
      config:
        - subnet: 172.18.3.0/24
          gateway: 172.18.3.1

  team-qa:
    driver: bridge
    ipam:
      config:
        - subnet: 172.18.4.0/24
          gateway: 172.18.4.1

volumes:
  redis-shared-data:
  redis-frontend-data:
  redis-backend-data:
  redis-devops-data:
  redis-qa-data:
  postgres-data:
```

### 7.2 Production Deployment (Kubernetes)

```yaml
# File: k8s/main-coordinator.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-main-coordinator
  namespace: cfn-corporate
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cfn-main-coordinator
  template:
    metadata:
      labels:
        app: cfn-main-coordinator
    spec:
      serviceAccountName: cfn-coordinator
      containers:
      - name: main-coordinator
        image: cfn-main-coordinator:v1.0.0
        env:
        - name: REDIS_HOST
          value: "cfn-redis-shared"
        - name: POSTGRES_HOST
          value: "cfn-postgres"
        - name: ORG_BUDGET
          value: "15500"
        - name: TEAMS
          value: "frontend,backend,devops,qa"
        resources:
          requests:
            memory: "4Gi"
            cpu: "2"
          limits:
            memory: "4Gi"
            cpu: "2"
        volumeMounts:
        - name: docker-sock
          mountPath: /var/run/docker.sock
      volumes:
      - name: docker-sock
        hostPath:
          path: /var/run/docker.sock
          type: Socket
```

---

## 8. Data Flow Diagrams

### 8.1 Task Assignment Flow

```
┌─────────────────┐
│ Main Coordinator│
└────────┬────────┘
         │ 1. Analyze task requirements
         │ 2. Determine owning team
         ↓
┌────────────────────────┐
│ Team Coordinator       │
│ (e.g., Frontend)       │
└─────────┬──────────────┘
          │ 3. Check budget
          │ 4. Estimate cost
          │ 5. Select agent role
          ↓
┌─────────────────────────┐
│ Spawn Agent             │
│ (React Specialist)      │
└─────────┬───────────────┘
          │ 6. Load knowledge from Redis
          │ 7. Load playbooks from PostgreSQL
          ↓
┌──────────────────────────┐
│ Execute Task             │
│ - Read files             │
│ - Use MCP tools          │
│ - Apply knowledge        │
└─────────┬────────────────┘
          │ 8. Update knowledge (Redis)
          │ 9. Save playbook (PostgreSQL)
          │ 10. Report completion
          ↓
┌──────────────────────────┐
│ Team Coordinator         │
│ - Update budget          │
│ - Log metrics            │
└─────────┬────────────────┘
          │ 11. Aggregate status
          ↓
┌─────────────────┐
│ Main Coordinator│
│ - Track progress│
└─────────────────┘
```

### 8.2 Knowledge Persistence Flow

```
┌──────────────────┐
│ Agent completes  │
│ task with new    │
│ learnings        │
└────────┬─────────┘
         │
         ↓
┌──────────────────────────────┐
│ Redis (Hot Storage)          │
│ Namespace:                   │
│ team:frontend:agent:react:001│
│                              │
│ Keys:                        │
│ - knowledge:patterns:*       │
│ - knowledge:best-practices:* │
│                              │
│ TTL: 7 days                  │
└────────┬─────────────────────┘
         │ Automated migration (every 24h)
         ↓
┌──────────────────────────────┐
│ PostgreSQL (Warm Storage)    │
│ Table: knowledge_entries     │
│                              │
│ Columns:                     │
│ - owner_id                   │
│ - team_id                    │
│ - category                   │
│ - content (JSONB)            │
│ - confidence                 │
│                              │
│ Retention: Permanent         │
└────────┬─────────────────────┘
         │ Manual archival (after 180 days)
         ↓
┌──────────────────────────────┐
│ S3/MinIO (Cold Storage)      │
│ Path:                        │
│ s3://cfn-corporate/          │
│   knowledge/                 │
│   team=frontend/             │
│   year=2025/                 │
│   month=11/                  │
│   knowledge.parquet          │
│                              │
│ Lifecycle: 7 years           │
└──────────────────────────────┘
```

### 8.3 Agent Failure Recovery Flow

```
┌─────────────────────┐
│ Agent heartbeat     │
│ timeout (90s)       │
└─────────┬───────────┘
          │
          ↓
┌─────────────────────────────┐
│ Team Coordinator detects    │
│ failure                     │
└─────────┬───────────────────┘
          │ 1. Query Redis for agent state
          ↓
┌─────────────────────────────┐
│ Redis: team:frontend:agent: │
│   react:001:state           │
│                             │
│ Returns:                    │
│ - current_task              │
│ - execution_progress        │
│ - last_checkpoint           │
└─────────┬───────────────────┘
          │ 2. Query PostgreSQL for knowledge
          ↓
┌─────────────────────────────┐
│ PostgreSQL:                 │
│ SELECT * FROM playbooks     │
│ WHERE agent_id = '001'      │
│                             │
│ Returns: Agent's playbooks  │
└─────────┬───────────────────┘
          │ 3. Spawn new container (same ID)
          ↓
┌─────────────────────────────┐
│ New Agent Container         │
│ ID: react:001 (preserved)   │
│                             │
│ - Restore knowledge         │
│ - Restore playbooks         │
│ - Restore MCP config        │
└─────────┬───────────────────┘
          │ 4. Resume task from checkpoint
          ↓
┌─────────────────────────────┐
│ Task execution continues    │
│ (knowledge preserved)       │
└─────────────────────────────┘
```

---

**End of Architecture v1.0.0**
