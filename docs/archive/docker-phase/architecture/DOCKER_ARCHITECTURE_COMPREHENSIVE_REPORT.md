# Docker Architecture Comprehensive Report

**Claude Flow Novice - Container-Based Multi-Agent Orchestration**

**Version:** 1.0.0
**Date:** 2025-11-19
**Status:** Production Ready

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Isolation Patterns](#isolation-patterns)
3. [Provisioning Patterns](#provisioning-patterns)
4. [Workflow Integration](#workflow-integration)
5. [Data Flow Architecture](#data-flow-architecture)
6. [Service Dependencies](#service-dependencies)
7. [Security Architecture](#security-architecture)
8. [Performance Optimization](#performance-optimization)
9. [Appendices](#appendices)

---

## Executive Summary

### System Overview

Claude Flow Novice implements a **container-based multi-agent orchestration system** using Docker for isolation, Redis for coordination, and a hierarchical control plane for workflow management. The system supports:

- **62 specialized AI agents** running in isolated containers
- **Wave-based execution** with memory budget management (40GB default)
- **Multi-worktree development** with automatic port conflict resolution
- **Production-grade monitoring** with Prometheus, Grafana, and Loki
- **CFN Loop methodology** for iterative task completion

### Key Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| **Container Types** | 6 core images | Agent, Coordinator, Orchestrator, Redis, Postgres, Playwright |
| **Supported Agents** | 62 specialized | Frontend, Backend, DevOps, Security, Testing, etc. |
| **Memory Budget** | 40GB default | Configurable, wave-based allocation |
| **Build Performance** | 96% faster | Linux native storage vs Windows mounts (755s → <20s) |
| **Concurrent Worktrees** | 50-100 theoretical | Hash-based port allocation prevents conflicts |
| **Network Isolation** | Per-worktree | Automatic namespace separation |

### Architecture Highlights

```
┌─────────────────────────────────────────────────────────────────┐
│                     Host Docker Environment                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Worktree 1 (main): cfn-main_mcp-network                    │ │
│  │   Redis:6379, Postgres:5432, Orchestrator:3001             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Worktree 2 (feature-auth): cfn-feature-auth_mcp-network    │ │
│  │   Redis:6421, Postgres:5474, Orchestrator:3043             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Worktree 3 (bugfix-X): cfn-bugfix-x_mcp-network            │ │
│  │   Redis:6457, Postgres:5510, Orchestrator:3079             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Isolation Patterns

### 1. Multi-Worktree Isolation

#### Overview

The system enables **simultaneous development across multiple git worktrees** without resource conflicts through deterministic namespace generation and port allocation.

#### Components

**1.1 Branch Detection and Sanitization**

```bash
# Detection
BRANCH=$(git branch --show-current)  # e.g., "feature/AUTH-123"

# Sanitization (lowercase, replace invalid chars)
SANITIZED="cfn-feature-auth-123"  # Docker-compatible project name
```

**Rules:**
- Prefix: Always `cfn-` for Claude Flow Novice
- Lowercase conversion: `Feature` → `feature`
- Invalid characters: `/`, `_`, uppercase → `-`
- Collapse multiple dashes: `--` → `-`
- Trim leading/trailing dashes

**1.2 Port Offset Calculation**

```bash
# Hash branch name (MD5 for determinism)
HASH=$(echo -n "feature-auth" | md5sum | head -c 8)  # e.g., "1a2b3c4d"

# Calculate offset (0-99 range)
OFFSET=$((0x${HASH} % 1000 * 100 / 1000))  # e.g., 42

# Special case: main/master always get offset 0
if [[ "$BRANCH" =~ ^(main|master)$ ]]; then
    OFFSET=0
fi
```

**Port Allocation Table:**

| Branch | Hash | Offset | Redis | Postgres | Orchestrator | Prometheus |
|--------|------|--------|-------|----------|--------------|------------|
| `main` | N/A | 0 | 6379 | 5432 | 3001 | 9091 |
| `feature-auth` | 0x1a2b | 42 | 6421 | 5474 | 3043 | 9133 |
| `bugfix-validate` | 0x3c4d | 78 | 6457 | 5510 | 3079 | 9169 |
| `develop` | 0x5e6f | 15 | 6394 | 5447 | 3016 | 9106 |

**Port Block Size:** 100 ports per worktree

**1.3 Container Namespace Isolation**

Docker Compose uses `COMPOSE_PROJECT_NAME` to prefix all resources:

```bash
export COMPOSE_PROJECT_NAME="cfn-feature-auth"

# Results in:
# Containers: cfn-feature-auth_redis_1, cfn-feature-auth_postgres_1
# Networks: cfn-feature-auth_mcp-network, cfn-feature-auth_cfn-network
# Volumes: cfn-feature-auth_redis-data, cfn-feature-auth_postgres-data
```

**Benefits:**
- Zero naming conflicts between worktrees
- Isolated network communication
- Independent data storage
- Parallel execution without interference

#### Service Discovery Pattern

**Within Same Worktree (Works):**

Containers within the same network use **service names** (NOT container names):

```bash
# Agent container connecting to Redis (correct)
redis-cli -h redis -p 6379  # Service name resolves via Docker DNS

# Backend connecting to Postgres (correct)
psql -h postgres -U postgres -d cfn_loop  # Service name

# Orchestrator health check (correct)
curl http://orchestrator:3001/health  # Service name
```

**Why Service Names, Not Container Names?**

1. **Docker DNS Resolution:** Service names automatically resolve to container IPs within the network
2. **Abstraction:** Hides container naming conventions (`cfn-feature-auth_redis_1`)
3. **High Availability:** Supports multiple replicas under the same service name
4. **Portability:** Works across all worktrees without modification

**Cross-Worktree (Intentionally Blocked):**

```bash
# From cfn-main orchestrator trying to reach cfn-feature-auth Redis (fails)
redis-cli -h cfn-feature-auth_redis_1 -p 6421  # Network isolation prevents this
```

**Why Block Cross-Worktree Communication?**
- Prevents accidental data contamination
- Enforces test environment isolation
- Supports true parallel development

#### Implementation

**File:** `scripts/docker/run-in-worktree.sh`

**Usage:**

```bash
# Start services in current worktree
./scripts/docker/run-in-worktree.sh up -d

# Check configuration (dry run)
./scripts/docker/run-in-worktree.sh --dry-run --verbose up

# Use production compose file
./scripts/docker/run-in-worktree.sh -f docker-compose.production.yml up -d

# Override project name
./scripts/docker/run-in-worktree.sh --project-name integration-test up -d

# Override port offset
./scripts/docker/run-in-worktree.sh --port-offset 50 up -d
```

**Environment Variables Exported:**

```bash
COMPOSE_PROJECT_NAME="cfn-feature-auth"
CFN_WORKTREE_BRANCH="feature-auth"
CFN_WORKTREE_PORT_OFFSET=42

# All 14+ service ports
CFN_REDIS_PORT=6421
CFN_POSTGRES_PORT=5474
CFN_ORCHESTRATOR_PORT=3043
CFN_REDIS_COORDINATOR_PORT=6422
CFN_PROMETHEUS_PORT=9133
CFN_GRAFANA_PORT=3044
CFN_REDIS_EXPORTER_PORT=9163
CFN_NGINX_HTTP_PORT=122
CFN_NGINX_HTTPS_PORT=485
CFN_LOKI_PORT=3142
CFN_MCP_PLAYWRIGHT_PORT=8123
CFN_MCP_REDIS_TOOLS_PORT=8124
CFN_MCP_N8N_PORT=8125
CFN_MCP_SECURITY_SCANNER_PORT=8126
```

### 2. Network Isolation

#### Network Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Docker Host                                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ cfn-main_mcp-network (172.28.0.0/16)                      │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │  │
│  │  │ Redis    │  │ Postgres │  │ Playwright│               │  │
│  │  │ :6379    │  │ :5432    │  │ :3000     │               │  │
│  │  └──────────┘  └──────────┘  └──────────┘               │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Agent Pool (dynamic)                                │  │  │
│  │  │ agent-1, agent-2, agent-3, ...                      │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ cfn-feature-auth_mcp-network (172.29.0.0/16)             │  │
│  │                                                            │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │  │
│  │  │ Redis    │  │ Postgres │  │ Playwright│               │  │
│  │  │ :6379    │  │ :5432    │  │ :3000     │               │  │
│  │  └──────────┘  └──────────┘  └──────────┘               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Characteristics:**

1. **Bridge Networks:** Each worktree uses `docker network create --driver bridge`
2. **Subnet Allocation:** Docker automatically assigns non-overlapping subnets
3. **DNS Resolution:** Automatic service name → IP resolution within network
4. **Isolation:** No communication between networks without explicit linking

#### Network Configuration (docker-compose.yml)

```yaml
networks:
  mcp-network:
    driver: bridge
    # Network name auto-prefixed with COMPOSE_PROJECT_NAME
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

**Auto-Prefixing Example:**
- Worktree 1: `cfn-main_mcp-network`
- Worktree 2: `cfn-feature-auth_mcp-network`
- Worktree 3: `cfn-bugfix-x_mcp-network`

### 3. Volume Isolation

#### Volume Naming Convention

```bash
# Format: ${COMPOSE_PROJECT_NAME}_${volume_name}

# Worktree 1 (main)
cfn-main_redis-data
cfn-main_postgres-data
cfn-main_prometheus-data
cfn-main_grafana-data

# Worktree 2 (feature-auth)
cfn-feature-auth_redis-data
cfn-feature-auth_postgres-data
cfn-feature-auth_prometheus-data
cfn-feature-auth_grafana-data
```

#### Volume Configuration (docker-compose.yml)

```yaml
services:
  redis:
    volumes:
      - redis-data:/data  # Auto-prefixed to cfn-${branch}_redis-data

volumes:
  redis-data:
    driver: local
  postgres-data:
    driver: local
```

**Benefits:**
- Independent data persistence per worktree
- No data contamination between branches
- Easy cleanup when deleting worktree

**Data Sharing Between Worktrees (If Needed):**

```bash
# Export from worktree 1
docker run --rm \
  -v cfn-main_postgres-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-backup.tar.gz /data

# Import to worktree 2
docker run --rm \
  -v cfn-feature-auth_postgres-data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/postgres-backup.tar.gz -C /
```

### 4. MCP Server Isolation

#### MCP Architecture

Model Context Protocol (MCP) servers provide specialized capabilities to agents:

**MCP Server Types:**
1. **Playwright MCP:** Browser automation
2. **Redis Tools MCP:** Redis operations
3. **N8N MCP:** Workflow automation
4. **Security Scanner MCP:** Vulnerability scanning

#### MCP Isolation Pattern

**Per-Worktree MCP Deployment:**

```yaml
# docker-compose.yml
services:
  playwright:
    image: mcr.microsoft.com/playwright:v1.40.0-focal
    # container_name removed for multi-worktree support
    networks:
      - mcp-network  # Scoped to worktree
    shm_size: '2gb'
    ports:
      - "${CFN_MCP_PLAYWRIGHT_PORT:-8081}:3000"
```

**Agent Access Pattern:**

```javascript
// Agent discovers MCP via service name
const mcpUrl = process.env.MCP_PLAYWRIGHT_URL || 'http://playwright:3000';

// Authentication tokens stored in worktree-scoped Redis
const token = await redis.get(`mcp:tokens:${agentId}`);
```

**Skill-Based MCP Selection:**

**File:** `.claude/skills/cfn-docker-skill-mcp-selection/SKILL.md`

Agents automatically select required MCPs based on their type:

```bash
# Frontend engineer needs Playwright for browser testing
AGENT_TYPE=react-frontend-engineer
MCP_SERVERS="playwright"

# Security specialist needs scanner + Redis
AGENT_TYPE=security-specialist
MCP_SERVERS="security-scanner,redis-tools"

# Backend developer needs Redis + N8N
AGENT_TYPE=backend-developer
MCP_SERVERS="redis-tools,n8n"
```

---

## Provisioning Patterns

### 1. Build Performance Optimization (WSL2)

#### Problem

Docker builds on WSL2 suffer from **96% slower performance** when using Windows mounts:

- **Context Transfer:** 755 seconds on Windows mount vs 0.1 seconds on Linux native
- **Root Cause:** WSL2 file I/O crossing mount boundaries
- **Impact:** Every `docker build` command becomes unusably slow

#### Solution: Linux Native Storage Build

**Implementation:** `.claude/skills/docker-build/SKILL.md`

**Pattern:**

```
┌─────────────────────────────────────────────────────────────┐
│ Windows Mount (Source of Truth)                             │
│ /mnt/c/Users/user/claude-flow-novice                        │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ rsync (2-3 seconds)
                  │
                  ↓
┌─────────────────────────────────────────────────────────────┐
│ Linux Native Storage (Fast I/O)                             │
│ /tmp/cfn-build                                              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ docker build (15-20 seconds)
                  │
                  ↓
┌─────────────────────────────────────────────────────────────┐
│ Docker Image (Available to Host)                            │
│ cfn-agent:latest                                            │
└─────────────────────────────────────────────────────────────┘
```

**Build Script:** `scripts/docker/build-from-linux.sh`

**Usage:**

```bash
# Via docker-build skill (recommended)
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.agent \
  --tag cfn-agent:latest

# Via direct script
DOCKERFILE="docker/Dockerfile.agent" \
IMAGE_NAME="cfn-agent" \
./scripts/docker/build-from-linux.sh

# Force rebuild without cache
./.claude/skills/docker-build/build.sh --no-cache
```

**Performance Comparison:**

| Method | Context Transfer | Build Time | Total Time | Notes |
|--------|-----------------|------------|------------|-------|
| **Windows Mount** | 755s | 45s | **800s** | Unusable in CI/CD |
| **Linux Native** | 2s | 18s | **20s** | 96% faster |

**Configuration:** `scripts/docker/linux-build.config`

```bash
# Build configuration
WINDOWS_PATH="/home/user/claude-flow-novice"
LINUX_PATH="/tmp/cfn-build"
DOCKERFILE="docker/Dockerfile.agent"
IMAGE_NAME="cfn-agent"
IMAGE_TAG="latest"

# BuildKit optimization
DOCKER_BUILDKIT=1
BUILD_PROGRESS="auto"
BUILD_NO_CACHE=false
BUILD_QUIET=false

# Rsync exclusions (critical for performance)
RSYNC_EXCLUDES=(
  ".git/"
  "node_modules/"
  "dist/"
  ".next/"
  ".turbo/"
  "coverage/"
  "*.log"
  ".env.local"
)
```

**Critical .dockerignore Pattern:**

```dockerignore
# Prevent recursive copy issues
.claude/agents/**/*.md
!.claude/agents/cfn-dev-team/**/*.md

# Build artifacts (500MB+ if included)
node_modules/
dist/
.next/
.turbo/

# Development files
.git/
.env.local
*.log
coverage/

# Docker
.dockerignore
Dockerfile*
docker-compose*.yml
```

**Why Critical:** Without this, Docker copies ALL agent files including examples, causing 10x slower builds and layer cache invalidation.

### 2. Multi-Stage Docker Builds

#### Agent Image (Dockerfile.agent)

```dockerfile
# ============================================================================
# Stage 1: Dependencies
# ============================================================================
FROM node:20-slim AS deps

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (skip postinstall in Docker)
RUN npm ci --ignore-scripts

# ============================================================================
# Stage 2: Build
# ============================================================================
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools
RUN apt-get update && apt-get install -y bash dos2unix && rm -rf /var/lib/apt/lists/*

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy source code
COPY src ./src
COPY tsconfig.json ./
COPY .swcrc ./

# Build TypeScript to JavaScript
RUN npm run build

# Verify spawn.js was built
RUN test -f dist/cli/spawn.js || (echo "ERROR: spawn.js not found!" && exit 1)

# ============================================================================
# Stage 3: Production Runtime
# ============================================================================
FROM node:20-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    bash curl jq git \
    && rm -rf /var/lib/apt/lists/*

# Install global tools
RUN npm install -g typescript ts-node

# Copy artifacts
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy CFN configuration
COPY .claude ./.claude

# Create workspace
RUN mkdir -p /app/workspace

# Security: Non-root user
RUN groupadd -g 1001 cfnagent && \
    useradd -r -u 1001 -g cfnagent cfnagent && \
    chown -R cfnagent:cfnagent /app

USER cfnagent

# Environment
ENV NODE_ENV=production
ENV PROJECT_ROOT=/app
ENV WORKSPACE_PATH=/app/workspace

# Default command
CMD ["node", "dist/cli/spawn.js"]
```

**Benefits:**
- **81% smaller images:** No build tools in production
- **Layer caching:** Dependencies cached separately from source
- **Security:** Non-root user, minimal attack surface
- **Performance:** Optimized for container startup

#### Orchestrator Image (Dockerfile.orchestrator)

**Pattern:** Extends `cfn-agent:latest` as base

```dockerfile
# Use cfn-agent as base
FROM cfn-agent:latest AS base

# Switch to root for additional installations
USER root

# Install orchestration tools
RUN apt-get update && apt-get install -y \
    docker.io \
    redis-tools \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Skills already in base image
RUN find ./.claude/skills -name "*.sh" -type f -exec chmod +x {} \;

# Switch back to cfnagent user
USER cfnagent

# Orchestration environment
ENV CFN_MODE=standard
ENV CFN_ITERATION_LIMIT=10
ENV CFN_REDIS_HOST=cfn-redis
ENV CFN_REDIS_PORT=6379
ENV CFN_NETWORK_NAME=mcp-network
ENV CFN_AGENT_IMAGE=cfn-agent:latest

# Entrypoint
ENTRYPOINT ["./.claude/skills/cfn-loop-orchestration/orchestrate.sh"]
CMD ["--help"]
```

**Key Pattern:** Reuse agent base image to avoid duplication

#### Coordinator Image (Dockerfile.coordinator)

**Pattern:** Extends agent, adds Docker socket access

```dockerfile
FROM cfn-agent:latest AS base

USER root

# Install coordination tools
RUN apt-get update && apt-get install -y \
    docker.io \
    redis-tools \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy coordinator entrypoint
COPY docker/coordinator-entrypoint.sh /app/coordinator-entrypoint.sh
RUN chmod +x /app/coordinator-entrypoint.sh

USER cfnagent

# Coordinator environment
ENV CFN_MEMORY_BUDGET=40g
ENV CFN_ITERATION_LIMIT=10
ENV CFN_MAX_PARALLEL_AGENTS=4
ENV CFN_SPAWN_INTERVAL_MS=500

ENTRYPOINT ["/app/coordinator-entrypoint.sh"]
CMD ["--help"]
```

### 3. Environment Variable Contract

**File:** `docker/runtime/cfn-runtime.contract.yml`

**Purpose:** Single source of truth for all environment variables

**Structure:**

```yaml
variables:
  # Redis Coordination
  CFN_REDIS_HOST:
    description: "Redis hostname for coordination"
    type: "string"
    default: "cfn-redis"
    scope: ["agent", "coordinator", "orchestrator"]
    legacy_aliases: ["REDIS_HOST"]
    required: false
    validation: "^[a-zA-Z0-9.-]+$"

  CFN_REDIS_PORT:
    description: "Redis port number"
    type: "integer"
    default: 6379
    scope: ["agent", "coordinator", "orchestrator"]
    legacy_aliases: ["REDIS_PORT"]
    required: false
    validation: "^[0-9]{4,5}$"

  CFN_REDIS_URL:
    description: "Complete Redis connection URL (overrides host:port)"
    type: "string"
    default: null
    scope: ["agent", "coordinator", "orchestrator"]
    legacy_aliases: ["REDIS_URL"]
    required: false
    validation: "^redis://.*$"

  # Task Configuration
  CFN_TASK_ID:
    description: "Unique task identifier"
    type: "string"
    default: "task-{timestamp}"
    scope: ["agent", "coordinator", "orchestrator"]
    legacy_aliases: ["TASK_ID"]
    required: true
    validation: "^task-[a-zA-Z0-9-]+$"

  # Agent Configuration
  CFN_AGENT_ID:
    description: "Unique agent identifier"
    type: "string"
    default: "agent-{timestamp}-{pid}"
    scope: ["agent"]
    legacy_aliases: ["AGENT_ID"]
    required: true

  CFN_AGENT_TYPE:
    description: "Agent specialization type"
    type: "string"
    default: null
    scope: ["agent"]
    legacy_aliases: ["AGENT_TYPE"]
    required: true
    validation: "^[a-z-]+$"

  # Memory Management
  CFN_MEMORY_BUDGET:
    description: "Total memory budget for agent spawning"
    type: "string"
    default: "40g"
    scope: ["coordinator"]
    legacy_aliases: ["MEMORY_BUDGET"]
    required: false
    validation: "^[0-9]+(m|g|M|G)$"

  # Iteration Control
  CFN_ITERATION_LIMIT:
    description: "Maximum CFN Loop iterations"
    type: "integer"
    default: 10
    scope: ["coordinator", "orchestrator"]
    legacy_aliases: []
    required: false
```

**Variable Resolution Precedence:**

```bash
# 1. Explicitly passed environment variables (highest priority)
docker run -e CFN_REDIS_HOST=custom-redis ...

# 2. CFN_ prefixed variables
export CFN_REDIS_HOST="cfn-redis"

# 3. Legacy variables (with deprecation warning)
export REDIS_HOST="cfn-redis"  # WARN: Use CFN_REDIS_HOST instead

# 4. Defaults from contract
# (Used if none of the above are set)

# 5. Hard-coded defaults in code (lowest priority)
```

### 4. Runtime Environment Setup

**File:** `docker/runtime/cfn-runtime.sh`

**Purpose:** Centralized environment initialization and validation

**Functions:**

```bash
# Export all CFN variables with defaults
export_cfn_variables() {
    # Redis coordination
    export CFN_REDIS_HOST="${CFN_REDIS_HOST:-${REDIS_HOST:-cfn-redis}}"
    export CFN_REDIS_PORT="${CFN_REDIS_PORT:-${REDIS_PORT:-6379}}"
    export CFN_REDIS_URL="${CFN_REDIS_URL:-redis://${CFN_REDIS_HOST}:${CFN_REDIS_PORT}}"

    # Task configuration
    export CFN_TASK_ID="${CFN_TASK_ID:-${TASK_ID:-task-$(date +%s)}}"
    export CFN_TASK_TIMEOUT="${CFN_TASK_TIMEOUT:-3600}"
    export CFN_ITERATION_LIMIT="${CFN_ITERATION_LIMIT:-10}"

    # Agent configuration
    export CFN_AGENT_ID="${CFN_AGENT_ID:-${AGENT_ID:-agent-$(date +%s)-$$}}"
    export CFN_AGENT_TYPE="${CFN_AGENT_TYPE:-${AGENT_TYPE}}"
    export CFN_AGENT_IMAGE="${CFN_AGENT_IMAGE:-cfn-agent:latest}"

    # Memory management
    export CFN_MEMORY_BUDGET="${CFN_MEMORY_BUDGET:-${MEMORY_BUDGET:-40g}}"
    export CFN_CPU_LIMIT="${CFN_CPU_LIMIT:-4}"
    export CFN_MAX_PARALLEL_AGENTS="${CFN_MAX_PARALLEL_AGENTS:-4}"

    # Docker configuration
    export CFN_DOCKER_SOCKET="${CFN_DOCKER_SOCKET:-/var/run/docker.sock}"
    export CFN_NETWORK_NAME="${CFN_NETWORK_NAME:-${COMPOSE_PROJECT_NAME:-cfn}-cfn-network}"
    export CFN_CONTAINER_MODE="${CFN_CONTAINER_MODE:-false}"

    # Feature flags
    export CFN_ENABLE_PROGRESS_TRACKING="${CFN_ENABLE_PROGRESS_TRACKING:-true}"
    export CFN_ENABLE_HEALTH_CHECKS="${CFN_ENABLE_HEALTH_CHECKS:-true}"
    export CFN_ENABLE_METRICS="${CFN_ENABLE_METRICS:-true}"
}

# Log configuration (debug mode)
log_environment_variables() {
    if [[ "${CFN_DEBUG:-false}" == "true" ]]; then
        log "CFN Environment Configuration:"
        log "  Redis: ${CFN_REDIS_HOST}:${CFN_REDIS_PORT}"
        log "  Task ID: ${CFN_TASK_ID}"
        log "  Agent ID: ${CFN_AGENT_ID}"
        log "  Agent Type: ${CFN_AGENT_TYPE}"
        log "  Memory Budget: ${CFN_MEMORY_BUDGET}"
        log "  Network: ${CFN_NETWORK_NAME}"
    fi
}

# Validate Redis connectivity
validate_redis_connectivity() {
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "${CFN_REDIS_HOST}" -p "${CFN_REDIS_PORT}" ping &> /dev/null; then
            log "Redis connection validated: ${CFN_REDIS_HOST}:${CFN_REDIS_PORT}"
            return 0
        else
            log "WARNING: Redis not reachable at ${CFN_REDIS_HOST}:${CFN_REDIS_PORT}"
            return 1
        fi
    fi
}

# Main initialization
main() {
    export_cfn_variables
    log_environment_variables
    validate_redis_connectivity
}

main
```

**Integration in Dockerfiles:**

```dockerfile
# Copy runtime script
COPY docker/runtime/cfn-runtime.sh ./docker/runtime/cfn-runtime.sh
RUN chmod +x ./docker/runtime/cfn-runtime.sh

# Source in entrypoint
ENTRYPOINT ["/bin/bash", "-c", "source ./docker/runtime/cfn-runtime.sh && exec \"$@\"", "--"]
```

### 5. Agent Spawning Patterns

#### CFN Docker Agent Spawning Skill

**File:** `.claude/skills/cfn-docker-agent-spawning/SKILL.md`

**Purpose:** Spawn agents in isolated containers with skill-based MCP selection

**Container Specification:**

```yaml
agent-container:
  image: cfn-agent:latest
  hostname: agent-{{AGENT_ID}}
  networks:
    - ${COMPOSE_PROJECT_NAME}_mcp-network
  volumes:
    - ./.claude:/app/.claude:ro
    - ./src:/app/src:ro
    - agent-workspace-{{AGENT_ID}}:/app/workspace
  environment:
    - AGENT_ID={{AGENT_ID}}
    - AGENT_TYPE={{AGENT_TYPE}}
    - TASK_ID={{TASK_ID}}
    - REDIS_URL=redis://redis:6379
    - MCP_TOKENS_FILE=/tmp/mcp-tokens.json
  resources:
    memory: {{MEMORY_LIMIT}}
    cpu: {{CPU_LIMIT}}
  restart_policy: unless-stopped
```

**Memory Tier Mapping:**

| Agent Type | Default Limit | Maximum Recommended | Use Case |
|------------|---------------|---------------------|----------|
| Frontend Engineer | 1GB | 2GB | React, Vue, Angular development |
| Backend Developer | 768MB | 1.5GB | API, database, service development |
| Security Specialist | 1.5GB | 3GB | Vulnerability scanning, code analysis |
| DevOps Engineer | 1GB | 2GB | Infrastructure, CI/CD, deployment |
| Tester | 512MB | 1GB | Unit tests, integration tests |
| Reviewer | 512MB | 1GB | Code review, documentation |

**Spawning via Dockerode:**

```javascript
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const container = await docker.createContainer({
    Image: 'cfn-agent:latest',
    name: `agent-${batchId}-${Date.now()}`,
    HostConfig: {
        Memory: parseMemory(batch.memory), // e.g., 512MB, 1GB
        Binds: [
            '/workspace:/workspace:rw',
            `${PWD}/.env:/workspace/.env:ro`
        ],
        NetworkMode: `${process.env.COMPOSE_PROJECT_NAME}_mcp-network`,
        AutoRemove: false
    },
    Env: [
        `REDIS_HOST=${process.env.CFN_REDIS_HOST}`,
        `REDIS_PORT=${process.env.CFN_REDIS_PORT}`,
        `TASK_ID=${batchId}`,
        `AGENT_ID=agent-${batchId}`,
        `ITERATION=${currentIteration}`,
        `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`,
        `COMPOSE_PROJECT_NAME=${process.env.COMPOSE_PROJECT_NAME}`,
        `CFN_REDIS_PORT=${process.env.CFN_REDIS_PORT}`,
        `CFN_POSTGRES_PORT=${process.env.CFN_POSTGRES_PORT}`
    ],
    Cmd: ['node', '/app/agent-worker.js']
});

await container.start();
```

**Coordinator Spawning Requirements:**

```javascript
// REQUIRED: Inject multi-worktree environment variables
const containerEnv = [
    `COMPOSE_PROJECT_NAME=${process.env.COMPOSE_PROJECT_NAME}`,
    `CFN_REDIS_PORT=${process.env.CFN_REDIS_PORT}`,
    `CFN_POSTGRES_PORT=${process.env.CFN_POSTGRES_PORT}`,
    `WORKTREE_BRANCH=${process.env.CFN_WORKTREE_BRANCH}`,
    // ... other CFN variables
];
```

**Why Critical:** Spawned agents must inherit worktree-specific configuration to connect to correct services.

---

## Workflow Integration

### 1. CFN Loop Docker Orchestration

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Main Chat / CLI Entry Point                                     │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ CFN Docker V3 Coordinator (Container)                           │
│ - Task analysis and context storage                             │
│ - Memory budget calculation                                     │
│ - Strategic batching (4-tier memory allocation)                 │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Redis Coordination Layer                                        │
│ - Task queue (task:queue)                                       │
│ - Completion counters (task:completed, task:total)              │
│ - Task metadata (task:N HASH)                                   │
│ - Agent registration (agent:ID)                                 │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ CFN Docker Loop Orchestration (Skill)                           │
│ - Loop 3 agent spawning                                         │
│ - Loop 2 validator spawning                                     │
│ - Consensus collection                                          │
│ - Product Owner decision flow                                   │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ CFN Docker Agent Spawning (Skill)                               │
│ - Container configuration                                       │
│ - MCP integration                                               │
│ - Resource management                                           │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Agent Container Pool (Docker)                                   │
│ - Wave 1: [agent-1] [agent-2] [agent-3] ...                     │
│ - Wave 2: [agent-N+1] [agent-N+2] ...                           │
│ - Claim tasks from Redis (atomic RPOP)                          │
│ - Execute work (fix TypeScript errors, implement features)      │
│ - Report completion (INCR task:completed)                       │
└─────────────────────────────────────────────────────────────────┘
```

#### Loop Execution Flow

**Loop 3: Primary Implementation**

```bash
# 1. Coordinator analyzes errors
npx tsc --noEmit  # Output: 400 TypeScript errors in 85 files

# 2. Build dependency graph (directory or AST-based)
# Result: 58 file clusters with dependency relationships

# 3. Create strategic batches (4-tier memory allocation)
# Tier 1 (1 file): 42 batches × 512MB = 21.5GB
# Tier 2 (2-3 files): 12 batches × 600MB = 7.2GB
# Tier 3 (4-8 files): 3 batches × 800MB = 2.4GB
# Tier 4 (9+ files): 1 batch × 1GB = 1GB
# Total: 58 batches, 32.1GB (fits in 40GB budget)

# 4. Push tasks to Redis
redis-cli SET task:total 58
redis-cli SET task:completed 0
redis-cli LPUSH task:queue task:1 task:2 ... task:58

# 5. Spawn agents in waves (memory budget management)
# Wave 1: Spawn all 58 batches (32.1GB < 40GB)
# (If budget exceeded, would spawn Wave 2 with remaining)

# 6. Wait for completion (passive polling)
while true; do
    COMPLETED=$(redis-cli GET task:completed)
    TOTAL=$(redis-cli GET task:total)
    echo "Progress: $COMPLETED/$TOTAL"
    [[ $COMPLETED -ge $TOTAL ]] && break
    sleep 5
done

# 7. Cleanup agents
docker ps -a --filter "name=agent-" -q | xargs docker rm -f
```

**Loop 2: Consensus Validation**

```bash
# 1. Validate Loop 3 work
npx tsc --noEmit  # Output: 42 errors remaining

# 2. Decision logic
if [[ $FINAL_ERRORS -lt $INITIAL_ERRORS ]]; then
    # Progress made, continue iteration
    DECISION="ITERATE"
elif [[ $FINAL_ERRORS -eq 0 ]]; then
    # All errors fixed
    DECISION="PROCEED"
elif [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
    # Max iterations reached
    DECISION="ABORT"
fi
```

**Product Owner Decision:**

```bash
# Spawn Product Owner agent
docker run --rm \
    -e AGENT_TYPE=product-owner \
    -e TASK_ID=$TASK_ID \
    -e LOOP3_WORK="${WORK_SUMMARY}" \
    -e LOOP2_CONSENSUS="${CONSENSUS_RESULTS}" \
    cfn-agent:latest

# Product Owner analyzes:
# - Errors fixed per iteration
# - Code quality metrics
# - Test pass rates
# - Remaining error types

# Outputs: PROCEED, ITERATE, or ABORT
```

#### Four-Tier Memory Allocation

**Optimization Strategy:**

```javascript
function assignMemoryTier(cluster) {
    const fileCount = cluster.files.length;

    if (fileCount === 1) {
        return { tier: 1, memory: '512m', use_case: 'Independent file' };
    } else if (fileCount <= 3) {
        return { tier: 2, memory: '600m', use_case: 'Small feature cluster' };
    } else if (fileCount <= 8) {
        return { tier: 3, memory: '800m', use_case: 'Medium feature module' };
    } else {
        return { tier: 4, memory: '1g', use_case: 'Large interconnected module' };
    }
}
```

**Real-World Example (B10 Test - 32 agents, 85 files):**

| Tier | Batches | Memory/Batch | Total Memory | Parallelism |
|------|---------|--------------|--------------|-------------|
| 1 | 42 | 512MB | 21.5GB | 42 agents |
| 2 | 12 | 600MB | 7.2GB | 12 agents |
| 3 | 3 | 800MB | 2.4GB | 3 agents |
| 4 | 1 | 1GB | 1GB | 1 agent |
| **Total** | **58** | **Avg 565MB** | **32.1GB** | **58 parallel** |

**Memory Optimization:**
- Naive approach: 85 files × 1GB = **85GB** ❌ (exceeds budget)
- Strategic batching: **32.1GB** ✅ (66% reduction, fits budget)

### 2. Wave-Based Spawning

**File:** `.claude/skills/cfn-docker-wave-execution/SKILL.md`

**Purpose:** Spawn Docker containers across parallel waves with memory budget enforcement

#### Wave Execution Algorithm

```javascript
const MEMORY_BUDGET = 40 * 1024 * 1024 * 1024; // 40GB in bytes
let currentWave = 1;
let batchQueue = [...batches];

while (batchQueue.length > 0) {
    const wave = [];
    let waveMemory = 0;

    // Fill wave up to budget
    while (batchQueue.length > 0) {
        const batch = batchQueue[0];
        const batchMemory = parseMemory(batch.memory);

        if (waveMemory + batchMemory <= MEMORY_BUDGET) {
            wave.push(batchQueue.shift());
            waveMemory += batchMemory;
        } else {
            break; // Budget full, spawn next wave
        }
    }

    console.log(`Wave ${currentWave}: ${wave.length} agents, ${formatBytes(waveMemory)} / ${formatBytes(MEMORY_BUDGET)}`);

    // Spawn all agents in wave (parallel)
    await Promise.all(wave.map(batch => spawnAgent(batch)));

    // Wait for wave completion (Docker API polling)
    await waitForWaveCompletion(wave);

    currentWave++;
}
```

#### Wave Spawning Script

**File:** `.claude/skills/cfn-docker-wave-execution/spawn-wave.sh`

**Usage:**

```bash
./.claude/skills/cfn-docker-wave-execution/spawn-wave.sh \
  --wave-plan ./waves.json \
  --wave-number 1 \
  --base-image cfn-agent:latest \
  --workspace /workspace \
  --network ${COMPOSE_PROJECT_NAME}_mcp-network \
  --output spawned.json
```

**Input Format (waves.json):**

```json
{
  "waves": [
    {
      "wave_number": 1,
      "batch_count": 28,
      "memory_needed": "14.5GB",
      "parallelism": 28,
      "batches": [
        {
          "batch_id": "iter1-batch-1",
          "tier": 1,
          "memory": "512m",
          "files": ["src/Button.tsx"],
          "task_prompt": "Fix TypeScript errors in Button.tsx"
        }
      ]
    }
  ]
}
```

**Output Format (spawned.json):**

```json
{
  "wave_number": 1,
  "spawned_at": "2025-11-14T10:30:45Z",
  "containers": [
    {
      "container_id": "abc123def456",
      "container_name": "cfn-wave1-batch1",
      "batch_id": "iter1-batch-1",
      "tier": 1,
      "memory_limit": "512m",
      "status": "running",
      "started_at": "2025-11-14T10:30:46Z"
    }
  ],
  "total_spawned": 28,
  "total_memory": "14.5GB"
}
```

#### Wave Monitoring

**File:** `.claude/skills/cfn-docker-wave-execution/monitor-wave.sh`

**Purpose:** Poll Docker containers until completion or timeout

**Usage:**

```bash
./.claude/skills/cfn-docker-wave-execution/monitor-wave.sh \
  --containers ./spawned.json \
  --wave-number 1 \
  --timeout 1800 \
  --poll-interval 5 \
  --output results.json
```

**Monitoring Loop:**

```bash
while true; do
    # Get container statuses via Docker API
    RUNNING=$(docker ps --filter "name=cfn-wave1-*" --format "{{.ID}}" | wc -l)
    EXITED=$(docker ps -a --filter "name=cfn-wave1-*" --filter "status=exited" --format "{{.ID}}" | wc -l)

    echo "Running: $RUNNING, Completed: $EXITED"

    # Check if all completed
    if [[ $RUNNING -eq 0 ]]; then
        # Extract exit codes
        docker ps -a --filter "name=cfn-wave1-*" --format "{{.ID}}" | while read -r CID; do
            EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' $CID)
            if [[ $EXIT_CODE -ne 0 ]]; then
                echo "Container $CID failed with exit code $EXIT_CODE"
            fi
        done
        break
    fi

    sleep 5
done
```

**Output Format (results.json):**

```json
{
  "wave_number": 1,
  "monitoring_duration": 287,
  "completion_status": "complete",
  "containers": [
    {
      "container_id": "abc123",
      "batch_id": "batch-1",
      "status": "exited",
      "exit_code": 0,
      "exit_status": "success",
      "started_at": "2025-11-14T10:30:46Z",
      "completed_at": "2025-11-14T10:35:33Z"
    }
  ],
  "metrics": {
    "total": 28,
    "running": 0,
    "exited": 28,
    "success": 27,
    "failed": 1,
    "timeout": 0
  }
}
```

#### Wave Cleanup

**File:** `.claude/skills/cfn-docker-wave-execution/cleanup-wave.sh`

**Purpose:** Remove containers and preserve logs from failures

**Usage:**

```bash
./.claude/skills/cfn-docker-wave-execution/cleanup-wave.sh \
  --wave-number 1 \
  --pattern "cfn-wave1-*" \
  --preserve-failed-logs \
  --output cleanup-report.json
```

**Cleanup Process:**

```bash
# 1. Find all containers from wave
CONTAINERS=$(docker ps -a --filter "name=cfn-wave1-*" --format "{{.ID}}")

# 2. Preserve logs from failed containers
for CID in $CONTAINERS; do
    EXIT_CODE=$(docker inspect -f '{{.State.ExitCode}}' $CID)
    if [[ $EXIT_CODE -ne 0 ]]; then
        docker logs $CID > .artifacts/logs/container-$CID.log 2>&1
    fi
done

# 3. Remove containers
echo "$CONTAINERS" | xargs docker rm -f

# 4. Clean dangling volumes
docker volume prune -f
```

### 3. Redis Coordination Layer

**File:** `.claude/skills/cfn-docker-redis-coordination/SKILL.md`

**Purpose:** State management, pub/sub messaging, and swarm recovery

#### Redis Schema

**Task Queue:**

```redis
# Task queue (FIFO via LPUSH/RPOP)
task:queue          LIST    [task_ids]

# Counters
task:total          STRING  "58"
task:completed      STRING  "42"

# Task metadata
task:1              HASH
  batch_id          "cluster-auth-2"
  tier              "2"
  files             '["LoginForm.tsx","AuthContext.tsx"]'
  total_errors      "5"
  memory            "600m"
  iteration         "1"

# Task results
task:1:result       HASH
  agent_id          "wave1-agent-5"
  status            "completed"
  files_modified    '["LoginForm.tsx","AuthContext.tsx"]'
  fix_time_seconds  "145"
  completed_at      "2025-01-12T10:30:45Z"
```

**Agent State:**

```redis
# Agent registration
agent:agent-123     HASH
  agent_type        "react-frontend-engineer"
  container_id      "abc123"
  task_id           "task-auth"
  status            "running"
  iteration         "1"
  created_at        "2025-01-15T10:05:00Z"

# Status history
agent:agent-123:status_history  LIST
  '{"status":"spawning","timestamp":"2025-01-15T10:05:00Z"}'
  '{"status":"running","timestamp":"2025-01-15T10:06:00Z"}'
```

#### Coordinator: Task Creation

```javascript
const taskIds = [];

for (let i = 0; i < batches.length; i++) {
    const taskId = `task:${iteration}-${i}`;
    taskIds.push(taskId);

    // Store task metadata
    await redis.hset(taskId, {
        batch_id: batches[i].batch_id,
        tier: batches[i].tier,
        files: JSON.stringify(batches[i].files),
        total_errors: batches[i].total_errors,
        memory: batches[i].memory,
        iteration: iteration
    });
}

// Initialize counters
await redis.set('task:total', taskIds.length);
await redis.set('task:completed', 0);

// Push to queue (LPUSH for FIFO via RPOP)
await redis.lpush('task:queue', ...taskIds);
```

#### Agent: Task Claim and Completion

```javascript
// Atomic task claim (RPOP is atomic)
const taskId = await redis.rpop('task:queue');

if (!taskId) {
    console.log('Queue empty, exiting');
    process.exit(0);
}

// Fetch task details
const task = await redis.hgetall(taskId);
const files = JSON.parse(task.files);

// Execute work
const result = await fixTypeScriptErrors(files, task);

// Report completion (atomic increment)
await redis.incr('task:completed');

// Store results
await redis.hset(`${taskId}:result`, {
    agent_id: process.env.AGENT_ID,
    status: 'completed',
    files_modified: JSON.stringify(result.filesModified),
    fix_time_seconds: result.duration,
    completed_at: new Date().toISOString()
});
```

#### Coordinator: Wait for Completion (Passive Polling)

```javascript
async function waitForCompletion() {
    const total = parseInt(await redis.get('task:total'));

    while (true) {
        const completed = parseInt(await redis.get('task:completed'));

        console.log(`Progress: ${completed}/${total} (${Math.round(completed/total*100)}%)`);

        if (completed >= total) {
            console.log('All tasks completed');
            break;
        }

        await sleep(5000); // Poll every 5 seconds (passive)
    }
}
```

**Why Passive Polling?**
- ✅ Simpler coordinator logic (no agent lifecycle tracking)
- ✅ Fault-tolerant (coordinator can restart mid-execution)
- ✅ Scales to any number of agents
- ✅ Natural checkpoint for iterations

### 4. Container-Based CFN Execution Modes

#### CLI Mode (Production)

```
Main Chat
  ↓ (spawns via CLI)
CFN Docker V3 Coordinator (Container)
  ↓ (spawns via Docker socket)
Agent Containers (Background)
  ↓ (coordination via Redis)
Results → Coordinator → Main Chat
```

**Command:**

```bash
/cfn-loop-cli "Implement user authentication" --mode=standard
```

**Execution:**

```bash
docker run --rm \
    --name cfn-coordinator \
    --memory=2g \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /workspace:/workspace:rw \
    -e CFN_TASK_ID="task-$(date +%s)" \
    -e CFN_MEMORY_BUDGET="40g" \
    -e CFN_ITERATION_LIMIT="10" \
    -e CFN_REDIS_HOST="redis" \
    -e COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" \
    --network ${COMPOSE_PROJECT_NAME}_mcp-network \
    --env-file .env \
    cfn-coordinator:latest
```

**Benefits:**
- 64% cost savings (coordinator orchestrates, agents execute)
- Background execution (non-blocking)
- Full Docker isolation
- Production-ready monitoring

#### Task Mode (Debugging)

```
Main Chat
  ↓ (spawns via Task() tool)
All Agents (Task Mode - No Docker)
  ↓ (output to Main Chat)
Results → Main Chat
```

**Command:**

```bash
/cfn-loop-task "Fix security bug in auth module" --mode=standard
```

**Execution:**

```javascript
// Main Chat spawns directly
Task("backend-developer", "Fix SQL injection in login endpoint");
Task("security-specialist", "Audit authentication flow");
Task("tester", "Test auth fixes");
```

**Benefits:**
- Full visibility in Main Chat
- Easier debugging
- No Docker overhead
- Faster for small tasks (<5 min)

---

## Data Flow Architecture

### 1. Task Execution Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Task Submission                                              │
│    User → /cfn-loop-cli "Fix TypeScript errors"                 │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Coordinator Initialization                                   │
│    - Parse task description                                     │
│    - Generate task ID: task-1763145142                          │
│    - Initialize Redis keys: task:total, task:completed          │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Error Analysis                                               │
│    npx tsc --noEmit → 400 errors in 85 files                    │
│    Parse error output:                                          │
│    - File paths                                                 │
│    - Error types (TS2345, TS2322, etc.)                         │
│    - Line numbers                                               │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Dependency Clustering                                        │
│    - Build file dependency graph (directory or AST-based)       │
│    - Run Union-Find algorithm                                   │
│    - Result: 58 file clusters                                   │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Strategic Batching                                           │
│    - Tier 1 (1 file): 42 batches × 512MB = 21.5GB              │
│    - Tier 2 (2-3 files): 12 batches × 600MB = 7.2GB            │
│    - Tier 3 (4-8 files): 3 batches × 800MB = 2.4GB             │
│    - Tier 4 (9+ files): 1 batch × 1GB = 1GB                    │
│    Total: 58 batches, 32.1GB                                    │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Redis Queue Initialization                                   │
│    SET task:total 58                                            │
│    SET task:completed 0                                         │
│    LPUSH task:queue task:1-1 task:1-2 ... task:1-58            │
│    FOR each task: HSET task:1-N {metadata}                      │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. Wave Spawning                                                │
│    Wave 1: 58 batches (32.1GB < 40GB budget)                    │
│    docker run [agent-1], [agent-2], ..., [agent-58]             │
│    Each agent: -e TASK_ID, AGENT_ID, REDIS_HOST, etc.           │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. Agent Task Claiming (Parallel, Atomic)                       │
│    Agent 1: RPOP task:queue → task:1-15                         │
│    Agent 2: RPOP task:queue → task:1-8                          │
│    ...                                                           │
│    Agent 58: RPOP task:queue → task:1-42                        │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. Agent Execution                                              │
│    - HGETALL task:1-15 → {files, tier, memory, ...}             │
│    - Read files from /workspace mount                           │
│    - Execute Claude Code CLI with specialist                    │
│    - Write fixed files to /workspace                            │
│    - INCR task:completed                                        │
│    - HSET task:1-15:result {status, files_modified, ...}        │
│    - GOTO step 8 (claim next task until queue empty)            │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. Coordinator Polling                                         │
│     WHILE task:completed < task:total:                          │
│       SLEEP 5s                                                  │
│       GET task:completed → 42                                   │
│       GET task:total → 58                                       │
│       LOG "Progress: 42/58 (72%)"                               │
│     END WHILE                                                   │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 11. Validation                                                  │
│     npx tsc --noEmit → 42 errors remaining                      │
│     IF errors > 0 AND iteration < max: GOTO step 3 (iterate)    │
│     IF errors == 0: PROCEED (success)                           │
│     IF iteration >= max: ABORT (max iterations)                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Environment Variable Propagation

```
┌─────────────────────────────────────────────────────────────────┐
│ Host Environment (.env)                                         │
│ - ANTHROPIC_API_KEY                                             │
│ - REDIS_PASSWORD                                                │
│ - POSTGRES_PASSWORD                                             │
│ - CFN_MEMORY_BUDGET                                             │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓ (docker run --env-file .env)
┌─────────────────────────────────────────────────────────────────┐
│ Coordinator Container                                           │
│ - CFN_TASK_ID (generated)                                       │
│ - CFN_ITERATION=1                                               │
│ - CFN_REDIS_HOST=redis                                          │
│ - CFN_NETWORK_NAME=${COMPOSE_PROJECT_NAME}_mcp-network         │
│ - COMPOSE_PROJECT_NAME (from run-in-worktree.sh)               │
│ - CFN_REDIS_PORT (from port offset)                            │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓ (docker run -e VAR=value)
┌─────────────────────────────────────────────────────────────────┐
│ Agent Containers                                                │
│ - All CFN_* variables from coordinator                          │
│ - AGENT_ID (unique per container)                               │
│ - AGENT_TYPE (specialized role)                                 │
│ - TASK_ID (batch identifier)                                    │
│ - WORKSPACE_PATH=/workspace                                     │
└─────────────────────────────────────────────────────────────────┘
```

### 3. File System Mounts

```
┌─────────────────────────────────────────────────────────────────┐
│ Host File System                                                │
│ /home/user/claude-flow-novice/                                  │
│   ├── src/ (source code)                                        │
│   ├── .claude/ (agent configurations)                           │
│   ├── .env (secrets)                                            │
│   └── workspace/ (task workspace)                               │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓ (volume mounts)
┌─────────────────────────────────────────────────────────────────┐
│ Coordinator Container                                           │
│ /app/                                                           │
│   ├── .claude/:ro (read-only)                                   │
│   ├── workspace/:rw (read-write)                                │
│   └── /var/run/docker.sock (Docker API)                         │
└─────────────┬───────────────────────────────────────────────────┘
              │
              ↓ (inherited mounts + agent-specific)
┌─────────────────────────────────────────────────────────────────┐
│ Agent Containers                                                │
│ /app/                                                           │
│   ├── .claude/:ro (agent configs)                               │
│   ├── src/:ro (source code - read-only)                         │
│   ├── workspace/:rw (task workspace - read-write)               │
│   └── /tmp/mcp-tokens.json (MCP authentication)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Service Dependencies

### 1. Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│ Production Stack Dependencies                                   │
└─────────────────────────────────────────────────────────────────┘

Redis (cfn-redis)
  ↑
  │ (coordination)
  │
  ├─── Coordinator
  │      ↑
  │      │ (task management)
  │      │
  │      └─── Agent Pool
  │
  ├─── Orchestrator
  │      ↑
  │      │ (loop management)
  │      │
  │      └─── Agent Pool
  │
  └─── Prometheus
         ↑
         │ (metrics collection)
         │
         └─── Grafana

PostgreSQL (postgres)
  ↑
  │ (data persistence)
  │
  └─── Orchestrator

Playwright (playwright)
  ↑
  │ (MCP service)
  │
  └─── Agent Pool (frontend agents)

Loki (loki)
  ↑
  │ (log aggregation)
  │
  └─── Grafana
```

### 2. Service Health Dependencies

**File:** `docker-compose.production.yml`

```yaml
services:
  orchestrator:
    depends_on:
      redis-coordinator:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "...redis ping..."]
      interval: 30s
      timeout: 10s
      retries: 3

  agent-pool:
    depends_on:
      redis-coordinator:
        condition: service_healthy
      orchestrator:
        condition: service_healthy
```

**Startup Order:**

1. **Redis** (healthcheck: `redis-cli ping`)
2. **Postgres** (healthcheck: `pg_isready`)
3. **Playwright** (healthcheck: `node --version`)
4. **Orchestrator** (waits for Redis healthy)
5. **Agent Pool** (waits for Orchestrator + Redis healthy)
6. **Prometheus** (healthcheck: `wget http://localhost:9090/-/healthy`)
7. **Grafana** (waits for Prometheus data source)

### 3. Network Communication Matrix

| From Service | To Service | Protocol | Port | Purpose |
|--------------|------------|----------|------|---------|
| Agent | Redis | TCP | 6379 | Task queue operations |
| Agent | Postgres | TCP | 5432 | Data persistence |
| Agent | Playwright | HTTP | 3000 | Browser automation |
| Coordinator | Redis | TCP | 6379 | Task creation, monitoring |
| Coordinator | Docker Socket | Unix | N/A | Agent spawning |
| Orchestrator | Redis | TCP | 6379 | Loop coordination |
| Orchestrator | Postgres | TCP | 5432 | State storage |
| Prometheus | Redis | HTTP | 9121 | Metrics scraping |
| Prometheus | Orchestrator | HTTP | 3001 | Health metrics |
| Grafana | Prometheus | HTTP | 9090 | Data source |
| Grafana | Loki | HTTP | 3100 | Log queries |

**Service Discovery:** All services resolve by **service name** (e.g., `redis`, `postgres`, `orchestrator`) via Docker DNS within the network.

### 4. Resource Allocation

**File:** `docker-compose.production.yml`

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

**Default Resource Allocation:**

| Service | Memory Limit | Memory Reservation | CPU Limit | CPU Reservation |
|---------|--------------|-------------------|-----------|-----------------|
| Redis | 512M | 256M | 0.5 | 0.25 |
| Postgres | 1G | 512M | 1.0 | 0.5 |
| Orchestrator | 1G | 512M | 1.0 | 0.5 |
| Agent Pool (per replica) | 1G | 512M | 0.5 | 0.25 |
| Prometheus | 512M | 256M | 0.5 | 0.25 |
| Grafana | 256M | 128M | 0.25 | 0.1 |
| Loki | 512M | 256M | 0.5 | 0.25 |

**Total Resources (3 agent replicas):**
- Memory: 5.25GB limit, 2.88GB reservation
- CPU: 4.75 cores limit, 2.35 cores reservation

---

## Security Architecture

### 1. Container Isolation

**Non-Root User Pattern:**

```dockerfile
# Create non-root user
RUN groupadd -g 1001 cfnagent && \
    useradd -r -u 1001 -g cfnagent cfnagent && \
    chown -R cfnagent:cfnagent /app

# Switch to non-root
USER cfnagent
```

**Benefits:**
- Prevents privilege escalation attacks
- Limits file system access
- Reduces attack surface

### 2. Secrets Management

**Environment Variable Patterns:**

```bash
# .env (NEVER commit to git)
ANTHROPIC_API_KEY=sk-ant-v1-...
REDIS_PASSWORD=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
```

**Docker Secret Injection:**

```yaml
services:
  orchestrator:
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}  # From .env
    env_file:
      - .env  # Entire file loaded
```

**MCP Token Security:**

```bash
# Tokens stored in tmpfs (ephemeral, in-memory)
volumes:
  - type: tmpfs
    target: /tmp
    tmpfs:
      size: 100M
      mode: 0700
```

### 3. Network Security

**Network Segmentation:**

```yaml
networks:
  mcp-network:
    driver: bridge
    internal: true  # No external internet access
  public-network:
    driver: bridge
    internal: false  # External access for monitoring
```

**Service Exposure:**

- **Internal Only:** Redis, Postgres, Playwright (mcp-network)
- **Host Exposed:** Orchestrator health endpoint, Grafana dashboard (public-network)
- **No Direct Internet:** Agent containers (isolated in mcp-network)

### 4. Volume Permissions

**Read-Only Mounts:**

```yaml
volumes:
  - ./.claude:/app/.claude:ro  # Agent configs (read-only)
  - ./src:/app/src:ro          # Source code (read-only)
  - .env:/workspace/.env:ro    # Secrets (read-only)
```

**Read-Write Mounts:**

```yaml
volumes:
  - ./workspace:/app/workspace:rw  # Task workspace (read-write)
  - redis-data:/data               # Redis persistence (read-write)
```

**Why Read-Only for Source?**
- Prevents agents from modifying codebase outside workspace
- Enforces workspace-based task execution
- Reduces security risk

---

## Performance Optimization

### 1. Build Performance

**Linux Native Storage Build:**
- Build Time: **96% faster** (755s → <20s)
- Context Transfer: 0.1s vs 755s
- Method: rsync to `/tmp/cfn-build` (Linux native)

**Multi-Stage Builds:**
- Image Size Reduction: **81%** (980MB → 187MB)
- Layer Caching: Dependencies cached separately
- Build Time: ~20s (with cache), ~60s (cold)

### 2. Runtime Performance

**Agent Spawning:**
- Parallel Spawning: 5 agents/second (configurable)
- Spawn Time: 2-3 seconds per wave
- Wave Orchestration: <5s for 28+ containers

**Memory Optimization:**
- Strategic Batching: **66% reduction** (85GB → 32GB)
- Four-Tier Allocation: Optimized based on file cluster size
- Wave-Based Spawning: Maximizes parallelism within budget

### 3. Network Performance

**Docker Bridge Network:**
- Throughput: ~10 Gbps (native Docker bridge)
- Latency: <1ms (intra-container communication)
- Overhead: Minimal (kernel-level routing)

**Service Discovery:**
- DNS Resolution: <1ms (Docker DNS cache)
- Connection Pooling: Redis clients reuse connections
- Keep-Alive: Persistent connections to Redis/Postgres

### 4. Monitoring Overhead

**Prometheus Metrics Collection:**
- Scrape Interval: 15 seconds (default)
- CPU Overhead: <5% on monitored services
- Storage: ~10MB per day per service

**Grafana Dashboards:**
- Query Performance: <100ms (typical)
- Visualization Refresh: 5-10 seconds
- Memory Usage: ~256MB (base + dashboards)

---

## Appendices

### A. Key Files Reference

**Docker Configuration:**
- `docker-compose.yml` - Development stack
- `docker-compose.production.yml` - Production stack with monitoring
- `scripts/docker/run-in-worktree.sh` - Multi-worktree wrapper
- `scripts/docker/build-from-linux.sh` - Linux native build script
- `docker/runtime/cfn-runtime.contract.yml` - Environment variable contract
- `docker/runtime/cfn-runtime.sh` - Runtime initialization

**Dockerfiles:**
- `docker/Dockerfile.agent` - Base agent image (multi-stage)
- `docker/Dockerfile.orchestrator` - Orchestrator image (extends agent)
- `docker/Dockerfile.coordinator` - Coordinator image (extends agent)

**Skills:**
- `.claude/skills/docker-build/SKILL.md` - Fast build skill
- `.claude/skills/cfn-docker-agent-spawning/SKILL.md` - Agent spawning
- `.claude/skills/cfn-docker-loop-orchestration/SKILL.md` - Loop orchestration
- `.claude/skills/cfn-docker-redis-coordination/SKILL.md` - Redis coordination
- `.claude/skills/cfn-docker-wave-execution/SKILL.md` - Wave execution
- `.claude/skills/cfn-docker-skill-mcp-selection/SKILL.md` - MCP selection

**Documentation:**
- `docs/docker/reference/DOCKER_MULTI_WORKTREE.md` - Multi-worktree guide
- `docs/docker/reference/DOCKER_ENV_STANDARDIZATION.md` - Environment standardization
- `docker/CLAUDE.md` - Docker agent reference

### B. Port Allocation Reference

**Base Ports (Main Branch - Offset 0):**

| Service | Port | Purpose |
|---------|------|---------|
| Redis | 6379 | Coordination |
| Postgres | 5432 | Data persistence |
| Orchestrator | 3001 | Health endpoint |
| Redis Coordinator | 6380 | Production Redis |
| Prometheus | 9091 | Metrics |
| Grafana | 3002 | Visualization |
| Redis Exporter | 9121 | Redis metrics |
| Nginx HTTP | 80 | Web server |
| Nginx HTTPS | 443 | Secure web |
| Loki | 3100 | Log aggregation |
| MCP Playwright | 8081 | Browser automation |
| MCP Redis Tools | 8082 | Redis operations |
| MCP N8N | 8083 | Workflow automation |
| MCP Security Scanner | 8084 | Security scanning |

**Offset Calculation:**
- Hash branch name: `echo -n "feature-auth" | md5sum | head -c 8`
- Calculate offset: `(0x${hash} % 1000 * 100 / 1000)`
- Add to base port: `BASE_PORT + OFFSET`

### C. Memory Tier Reference

| Tier | File Count | Memory Allocation | CPU Allocation | Use Case |
|------|-----------|------------------|---------------|----------|
| 1 | 1 | 512MB | 0.5 | Independent files (no dependencies) |
| 2 | 2-3 | 600MB | 0.5 | Small feature clusters (shared types) |
| 3 | 4-8 | 800MB | 0.75 | Medium modules (multiple dependencies) |
| 4 | 9+ | 1GB | 1.0 | Large interconnected modules (complex state) |

### D. Environment Variable Quick Reference

**Critical Variables:**

```bash
# Redis
CFN_REDIS_HOST=redis
CFN_REDIS_PORT=6379
CFN_REDIS_URL=redis://redis:6379

# Task
CFN_TASK_ID=task-{timestamp}
CFN_ITERATION_LIMIT=10

# Agent
CFN_AGENT_ID=agent-{timestamp}-{pid}
CFN_AGENT_TYPE=react-frontend-engineer
CFN_AGENT_IMAGE=cfn-agent:latest

# Memory
CFN_MEMORY_BUDGET=40g
CFN_CPU_LIMIT=4
CFN_MAX_PARALLEL_AGENTS=4

# Multi-Worktree
COMPOSE_PROJECT_NAME=cfn-{branch}
CFN_WORKTREE_PORT_OFFSET={calculated}
CFN_REDIS_PORT={6379 + offset}
CFN_POSTGRES_PORT={5432 + offset}
```

### E. Service Name Resolution

**Within Same Network (Works):**

```bash
# Service names resolve automatically
redis-cli -h redis -p 6379
psql -h postgres -U postgres
curl http://orchestrator:3001/health
curl http://playwright:3000
```

**Container Names (Don't Use):**

```bash
# ❌ WRONG - Container names don't resolve
redis-cli -h cfn-main_redis_1
psql -h cfn-feature-auth_postgres_1
```

**Why Service Names?**
- Docker DNS automatically resolves service name → container IP
- Works across all worktrees (service name stays the same)
- Supports high availability (multiple replicas under same service name)
- Portable across environments

---

## Visualization Diagrams

### Container Hierarchy

```
claude-flow-novice/
├── cfn-agent:latest (Base Image)
│   ├── Node.js 20 runtime
│   ├── TypeScript + ts-node
│   ├── .claude/ (agent configs)
│   ├── dist/ (compiled code)
│   └── workspace/ (mount point)
│
├── cfn-orchestrator:latest (Extends Agent)
│   ├── Base: cfn-agent:latest
│   ├── Additional: docker.io, redis-tools, procps
│   ├── Entrypoint: orchestrate.sh
│   └── Purpose: CFN Loop orchestration
│
├── cfn-coordinator:latest (Extends Agent)
│   ├── Base: cfn-agent:latest
│   ├── Additional: docker.io, redis-tools, procps
│   ├── Entrypoint: coordinator-entrypoint.sh
│   └── Purpose: Wave coordination, batching
│
├── redis:7-alpine
│   └── Purpose: Task queue, coordination
│
├── postgres:15-alpine
│   └── Purpose: Data persistence
│
└── playwright:v1.40.0-focal
    └── Purpose: MCP browser automation
```

### Data Flow Summary

```
User Request
    ↓
Coordinator (analyze, batch, spawn)
    ↓
Redis (task queue, counters, metadata)
    ↓
Agent Pool (claim, execute, report)
    ↓
Workspace (file modifications)
    ↓
Coordinator (validate, iterate/proceed)
    ↓
Result (success/partial/abort)
```

---

**End of Report**

**Version:** 1.0.0
**Last Updated:** 2025-11-19
**Status:** Production Ready
**Maintainer:** docker-specialist agent
