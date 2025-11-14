# CFN Loop Docker Infrastructure Analysis
**Generated**: November 13, 2025
**System**: Docker-based CFN Loop Orchestration
**Analysis Scope**: Container architecture, resource requirements, deployment patterns

---

## Executive Summary

The CFN Loop system implements a distributed agent orchestration platform using Docker containers with Redis-based coordination. The architecture supports both Task Mode (direct agent execution) and CLI Mode (coordinator-driven orchestration) with multi-tier batching strategies for memory optimization.

**Key Infrastructure Characteristics:**
- Container-based microservices architecture
- Redis-based inter-service coordination
- Docker-in-Docker (DinD) for agent spawning
- Wave-based parallelism with memory budgeting
- Production-grade security hardening (non-root users, minimal attack surface)

---

## 1. CONTAINER INVENTORY

### 1.1 Core Production Containers

#### 1.1.1 CFN Coordinator (cfn-coordinator / Dockerfile.cfn-coordinator)
**Purpose**: Plans task decomposition and orchestrates agent spawning
**Base Image**: node:18-alpine
**Container Type**: Stateless, ephemeral (completes per iteration)
**Spawn Method**: Direct Docker run or docker-compose

**Resource Profile:**
| Metric | Min | Recommended | Max |
|--------|-----|-------------|-----|
| Memory | 512MB | 2GB | 8GB |
| CPU | 0.2 cores | 1.0 core | 2.0 cores |
| Disk | 100MB (ephemeral) | 100MB | 500MB |
| Init Time | ~2s | ~3-5s | ~10s |

**Dependencies:**
- Docker daemon (via socket mount /var/run/docker.sock)
- Redis (for task queue and coordination)
- Node.js 18+ runtime
- System packages: bash, git, jq, curl, docker-cli, redis, python3, py3-setuptools, make, g++

**Port Exposure:** None (internal only)
**Mounts:**
- /var/run/docker.sock:ro (Docker API)
- /workspace:rw (source code volume)
- .env:ro (credentials)

**Process Model:**
```
START (validate Docker/Redis access)
  ↓
ITERATE (until error count = 0 or max iterations):
  - Analyze errors (tsc --noEmit)
  - Build dependency graph
  - Cluster files into batches
  - Create strategic batches (Tier 1-4)
  - Push tasks to Redis queue
  - Spawn agents in waves (respecting 40GB budget)
  - Wait for completion (passive Redis polling)
  - Cleanup completed agents
EXIT
```

**Health Indicator**: Process completion (should exit when task complete)

---

#### 1.1.2 CFN Agent (Dockerfile.agent / Dockerfile.agent.stabilized)
**Purpose**: Claims tasks from queue and executes fixes
**Base Image**: node:18-alpine
**Container Type**: Stateless, ephemeral (auto-remove after completion)
**Spawn Method**: Dockerode (programmatic via coordinator)

**Resource Profile (by Tier):**
| Tier | Cluster Size | Memory | CPU | Typical Duration |
|------|-------------|--------|-----|------------------|
| 1 | 1 file | 512MB | 0.5 cores | 30-60s |
| 2 | 2-3 files | 600MB | 0.5 cores | 45-90s |
| 3 | 4-8 files | 800MB | 1.0 core | 60-120s |
| 4 | 9+ files | 1GB | 1.0 core | 90-180s |

**Key Reference**: B10 test achieved 376MB peak per agent (32 agents × 376MB = 12GB actual, 12.1GB budget-aware)

**Dependencies:**
- Node.js 18+ runtime
- Redis (for task coordination and completion reporting)
- Claude Flow Novice CLI distribution (prebuilt dist/)
- System packages: bash, git, curl, ca-certificates, redis

**Port Exposure:** None (internal only)
**Mounts:**
- /app/workspace:rw (source files from coordinator volume)
- .env:ro (ANTHROPIC_API_KEY, REDIS_HOST, etc.)

**Environment Variables:**
```bash
NODE_ENV=production
CFN_CONTAINER_MODE=true
REDIS_HOST=cfn-redis (or 172.20.0.3 for direct IP)
REDIS_PORT=6379
TASK_ID=<batch-id>
AGENT_ID=<wave-agent-n>
ITERATION=<number>
ANTHROPIC_API_KEY=<required>
```

**Process Model:**
```
START (source cfn-runtime.sh for env standardization)
  ↓
LOOP (until queue empty):
  - RPOP task:queue (atomic)
  - IF empty: EXIT 0
  - HGETALL task:N (fetch metadata)
  - Read files from /workspace
  - Execute Claude Code CLI (agent specialist)
  - Write fixed files to /workspace
  - INCR task:completed
  - HSET task:N:result (store metadata)
  - GOTO LOOP
EXIT
```

**Lifecycle:** Created by coordinator, auto-removes after exit
**Health Indicator:** Process exit code (0 = success)

---

#### 1.1.3 Redis Coordinator (redis:7-alpine / docker-compose.stabilization.yml)
**Purpose**: Task queue, metadata storage, completion counters
**Base Image**: redis:7-alpine (official Redis)
**Container Type**: Stateful, persistent (survives coordinator restarts)
**Spawn Method**: docker-compose or direct docker run

**Resource Profile:**
| Metric | Min | Recommended | Max |
|--------|-----|-------------|-----|
| Memory | 128MB | 256MB | 1GB |
| CPU | 0.1 cores | 0.3 cores | 0.5 cores |
| Disk (persistence) | 0 (no RDB/AOF) | 100MB | 500MB |
| Connections | 10 | 50 | 100 |

**Redis Configuration:**
```bash
maxmemory: 256MB (or CFN_REDIS_MAXMEMORY env var)
maxmemory-policy: allkeys-lru (evict oldest when full)
loglevel: notice
databases: 16
```

**Data Schema:**
```
KEY                     TYPE      TTL     Size Est.
task:queue              LIST      -       1KB per task
task:total              STRING    -       20 bytes
task:completed          STRING    -       20 bytes
task:N                  HASH      -       500B per task
task:N:result           HASH      -       2KB per task result
```

**Example Payload:**
```json
{
  "task:1": {
    "batch_id": "cluster-auth-2",
    "tier": "2",
    "files": "[\"LoginForm.tsx\",\"AuthContext.tsx\"]",
    "total_errors": "5",
    "memory": "600m",
    "coordination_note": "Shared AuthContext types"
  },
  "task:1:result": {
    "agent_id": "wave1-agent-5",
    "status": "completed",
    "files_modified": "[\"LoginForm.tsx\",\"AuthContext.tsx\"]",
    "fix_time_seconds": "145",
    "completed_at": "2025-01-12T10:30:45Z"
  }
}
```

**Port Exposure:** 6379/tcp (internal only, no external access recommended)
**Persistence:**
- RDB snapshots: Disabled by default (set via redis.conf)
- AOF: Can be enabled for durability
- Volume mount: redis-data:/data (named volume)

**Health Check:**
```bash
redis-cli ping  # Should return "PONG"
```

---

#### 1.1.4 CFN Orchestrator (Dockerfile.orchestrator)
**Purpose**: Entry point for CLI mode, spawns coordinator with monitoring
**Base Image**: node:18-alpine
**Container Type**: Stateless, transient
**Spawn Method**: docker-compose (stabilization profile)

**Resource Profile:**
| Metric | Min | Recommended | Max |
|--------|-----|-------------|-----|
| Memory | 1GB | 2GB | 8GB |
| CPU | 0.5 cores | 1.0 core | 2.0 cores |
| Disk | 200MB | 500MB | 2GB |

**Dependencies:**
- Node.js 18+ runtime
- Redis (via CFN_REDIS_URL)
- Docker socket (for agent spawning)
- System packages: bash, git, jq, curl

**Health Endpoint:** HTTP GET /health (port 3000)

---

#### 1.1.5 CFN Telemetry Collector (Dockerfile.telemetry)
**Purpose**: Collects metrics, monitors agent performance, tracks iterations
**Base Image**: node:18-alpine
**Container Type**: Stateless, long-running daemon
**Spawn Method**: docker-compose (stabilization profile)

**Resource Profile:**
| Metric | Min | Recommended | Max |
|--------|-----|-------------|-----|
| Memory | 128MB | 256MB | 512MB |
| CPU | 0.1 cores | 0.3 cores | 0.5 cores |
| Disk | 0 (ephemeral) | 100MB | 500MB |

**Metrics Collected:**
- Agent spawn rate, completion rate
- Memory utilization per agent
- Task queue length, completion progress
- Iteration count and timing
- Error reduction per iteration

**Output:** JSON telemetry to Redis or stdout

---

#### 1.1.6 Monitoring Dashboard (grafana:latest - Optional)
**Purpose**: Visualization of CFN Loop metrics
**Base Image**: grafana:latest
**Container Type**: Stateful, long-running
**Spawn Method**: docker-compose (stabilization profile)

**Resource Profile:**
| Metric | Min | Recommended | Max |
|--------|-----|-------------|-----|
| Memory | 256MB | 512MB | 1GB |
| CPU | 0.25 cores | 0.5 cores | 1.0 core |
| Disk (persistence) | 100MB | 500MB | 2GB |

**Port Exposure:** 3000/tcp (HTTP for Grafana UI)
**Default Credentials:** admin/admin (must change in production)
**Volume Mounts:** grafana-data (named volume)

---

### 1.2 Test and Development Containers

#### 1.2.1 Minimal Test Agent (Dockerfile.minimal / Dockerfile.minimal-test)
**Purpose**: Lightweight test container (18 lines)
**Base Image**: node:18-alpine
**Use Case**: Quick validation, CI/CD testing
**Resource Profile:**
| Metric | Value |
|--------|-------|
| Memory | 128-256MB |
| CPU | 0.25-0.5 cores |
| Build Time | <10s |
| Image Size | ~150MB |

---

#### 1.2.2 Playwright-based Agents (Multiple variants)
**Purpose**: Browser automation for frontend testing
**Base Image:** node:18-alpine + Playwright
**Variants:**
- Dockerfile.playwright-official (official Playwright image)
- Dockerfile.playwright-debug (with debug tools)
- Dockerfile.playwright-simple-fix (minimal working setup)
- Dockerfile.playwright-test (optimized for tests)

**Resource Profile:**
| Metric | Min | Recommended |
|--------|-----|-------------|
| Memory | 512MB | 1GB |
| CPU | 0.5 cores | 1.0 core |
| Disk | 500MB | 1-2GB |

---

### 1.3 Container Registry and Naming

**Image Naming Convention:**
```
claude-flow-novice-<role>:<version>
  Examples:
    claude-flow-novice-coordinator:3.0.0
    claude-flow-novice-agent:latest
    claude-flow-novice-agent:frontend
    claude-flow-novice-agent:python
    claude-flow-novice-orchestrator:latest
    claude-flow-novice-telemetry:1.0.0
```

**Version Tags:**
- `latest`: Always points to most recent production build
- `v3.0.0`: Semantic versioning for released versions
- `testing`: Nightly builds for testing
- `experimental`: Work-in-progress features

---

## 2. SERVICE DEPENDENCIES AND ORCHESTRATION

### 2.1 Service Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│ External (Host)                                             │
│  - Docker daemon (socket /var/run/docker.sock)              │
│  - ANTHROPIC_API_KEY (environment)                          │
│  - Project codebase (volume mount)                          │
└────────────────┬────────────────────────────────────────────┘
                 │
        ┌────────┴──────────┐
        ▼                   ▼
┌──────────────────┐  ┌─────────────────────┐
│ Redis Network    │  │ CFN Network         │
│ 172.20.0.0/16   │  │ (bridge driver)     │
└─────────┬────────┘  └──────────┬──────────┘
          │                      │
          │    ┌──────────────────┘
          │    │
          ▼    ▼
    ┌─────────────────────────────┐
    │ Redis:7-alpine              │
    │ 172.20.0.2:6379             │
    │ Status: Persistent (always up) │
    │ Memory: 256MB (8GB available) │
    └─────────┬───────────────────┘
              │
        ┌─────┴─────────────────────────────┐
        │                                   │
        ▼                                   ▼
    ┌─────────────────────┐         ┌──────────────────────┐
    │ CFN Coordinator     │         │ CFN Orchestrator     │
    │ 172.20.0.3          │         │ 172.20.0.4           │
    │ Memory: 2GB         │         │ Memory: 2GB          │
    │ CPU: 1 core         │         │ CPU: 1 core          │
    │ Ephemeral           │         │ Ephemeral            │
    │ (coordinates work)  │         │ (entry point)        │
    └──────────┬──────────┘         └──────────────────────┘
               │
    ┌──────────┴──────────────────────────────────┐
    │                                              │
    ▼                                              ▼
┌─────────────────────────────┐      ┌──────────────────────────┐
│ Wave 1 Agent Pool           │      │ Docker Socket            │
│ (Tier 1-4 batches)          │      │ /var/run/docker.sock     │
│ 512MB-1GB each              │      │ (for spawning agents)    │
│ 5-15 parallel agents        │      │                          │
│ Total: 5-15GB budget        │      │                          │
└─────────────────────────────┘      └──────────────────────────┘
    ▼                              ▼
┌──────────────────────────────────────────┐
│ Workspace Volume (shared mount)          │
│ /workspace (project codebase)            │
│ Source files + fixes (read/write)        │
└──────────────────────────────────────────┘
```

### 2.2 Container Startup Sequence

**Recommended Order (docker-compose):**

```yaml
depends_on:
  # Phase 1: Infrastructure
  redis:
    condition: service_healthy

  # Phase 2: Monitoring (optional)
  cfn-telemetry:
    condition: service_started

  # Phase 3: Main Services
  cfn-orchestrator:
    condition: service_started

  cfn-agent-task:
    condition: service_started

  cfn-agent-cli:
    condition: service_started

  # Phase 4: Dashboard (optional)
  cfn-dashboard:
    condition: service_started
```

### 2.3 Inter-Service Communication Protocol

**Service-to-Service:**
- Redis: TCP 6379 (internal only)
- HTTP: Port 3000 (health checks, dashboard)
- Docker socket: /var/run/docker.sock (agent spawning)

**Health Checks (Recommended Intervals):**
```yaml
healthcheck:
  redis:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 3s
    retries: 3

  coordinator:
    test: ["CMD", "pgrep", "-f", "coordinator-entrypoint"]
    interval: 30s
    timeout: 10s
    retries: 3

  agent:
    test: ["CMD", "node", "-e", "console.log('healthy')"]
    interval: 30s
    timeout: 10s
    start_period: 5s
    retries: 3
```

---

## 3. STORAGE REQUIREMENTS

### 3.1 Persistent Volumes

#### 3.1.1 Redis Data Volume (redis-data)
**Purpose**: Redis RDB snapshots and AOF logs
**Type**: Named volume (docker-managed)
**Size:** 100MB - 500MB (depending on configuration)
**Retention:** Permanent (until explicitly deleted)
**Backup Strategy:** Daily snapshots to object storage (S3/GCS)

**Configuration:**
```yaml
volumes:
  redis-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /var/lib/docker/volumes/redis-data/_data
```

---

#### 3.1.2 Grafana Data Volume (grafana-data)
**Purpose**: Grafana dashboards, datasources, provisioning
**Type**: Named volume
**Size:** 100MB - 2GB
**Retention:** Permanent
**Backup Strategy:** Included in container image snapshots

---

#### 3.1.3 Workspace Volume (project codebase)
**Purpose**: Source files accessed by agents
**Type**: Bind mount (host filesystem)
**Size:** Variable (typical 100MB - 2GB for small-medium projects)
**Retention:** Project-scoped
**Performance:** Critical path (shared between coordinator and agents)

**Binding Example:**
```bash
-v /path/to/project:/workspace:rw
# or docker-compose:
volumes:
  - /path/to/project:/workspace:rw
```

---

### 3.2 Ephemeral Storage

#### 3.2.1 Agent Temporary Storage
**Location**: /tmp (container-local ephemeral)
**Size**: 512MB - 2GB per agent
**Lifetime**: Agent container lifetime
**Use Case**: Intermediate files, build artifacts

**Mount Configuration:**
```yaml
tmpfs:
  - /tmp:size=2g
```

---

#### 3.2.2 Coordinator Working Directory
**Location**: /tmp (host machine)
**Use Case**: Task context files, temporary metadata
**Cleanup**: Automatic after container exit

---

### 3.3 Storage Summary Table

| Component | Type | Size | Retention | Criticality |
|-----------|------|------|-----------|-------------|
| Redis data | Volume | 100MB-500MB | Permanent | High |
| Grafana dashboards | Volume | 100MB-2GB | Permanent | Medium |
| Project codebase | Bind mount | 100MB-2GB | Project-scoped | Critical |
| Agent /tmp | Ephemeral | 512MB-2GB each | Agent lifetime | Low |
| Coordinator logs | Stdout/stderr | - | Short-lived | Medium |
| Agent artifacts | /artifacts volume | 100MB-1GB | Project-scoped | Medium |

---

## 4. NETWORK REQUIREMENTS

### 4.1 Network Architecture

**Network Types Defined:**
```yaml
networks:
  cfn-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1
    driver_opts:
      com.docker.network.bridge.name: br-cfn-net
```

**IP Allocation (example):**
```
172.20.0.1 - Gateway (host)
172.20.0.2 - Redis
172.20.0.3 - CFN Coordinator
172.20.0.4 - CFN Orchestrator
172.20.0.5-20 - Agent pool
```

### 4.2 Port Mapping

**Internal Ports (no host binding by default):**

| Service | Port | Protocol | Direction | Purpose |
|---------|------|----------|-----------|---------|
| Redis | 6379 | TCP | Bidirectional | Task queue, metadata |
| Coordinator | None | - | - | Ephemeral (exits when done) |
| Orchestrator | 3000 | HTTP | Inbound | Health checks |
| Agents | None | - | - | Ephemeral |
| Dashboard | 3000 | HTTP | Inbound | Grafana UI (optional) |

**External Port Mapping (production):**
```yaml
# For dashboard only (behind reverse proxy)
ports:
  - "3000:3000"  # Restrict to 127.0.0.1:3000 in production
```

### 4.3 Ingress Requirements

**For Cloud Deployment (AWS/Azure/GCP):**

```
Application Load Balancer
  ↓
Port 443 (HTTPS)
  ↓
Reverse Proxy (nginx/Envoy)
  ↓
  ├─ :3000 → cfn-dashboard (Grafana)
  ├─ :6379 → Redis (restricted: agents only)
  └─ Socket → /var/run/docker.sock (DinD, requires host network)
```

**Security Groups / Firewall Rules:**

```bash
# Ingress
Inbound HTTPS 443 from: Load Balancer / VPN
Inbound Docker (socket) from: Agent containers only
Inbound Redis 6379 from: cfn-network only

# Egress
Outbound HTTPS 443 to: api.anthropic.com
Outbound DNS 53 to: DNS resolver
Outbound NTP 123 to: Time sync (optional)
```

### 4.4 Egress Requirements

**Critical External Connections:**

| Destination | Protocol | Port | Purpose | Criticality |
|-------------|----------|------|---------|-------------|
| api.anthropic.com | HTTPS | 443 | Claude API (agent execution) | Critical |
| api.docker.com | HTTPS | 443 | Docker registry (image pulls) | High |
| container registry | HTTPS | 443 | Private registry | High |
| DNS server | UDP | 53 | Domain resolution | High |
| NTP server | UDP | 123 | Time synchronization | Medium |
| Syslog server | UDP | 514 | Remote logging (optional) | Low |
| Datadog/NewRelic | HTTPS | 443 | Monitoring (optional) | Low |

**Bandwidth Estimate:**
- Per agent: 5-50 MB (API requests + source code upload)
- 15 agents parallel: 75-750 MB per iteration
- Typical codebase sync: 100-500 MB (one-time)

---

## 5. ESTIMATED RESOURCE REQUIREMENTS

### 5.1 Development Tier

**Use Case**: Local development, single iteration

```yaml
Services:
  Redis: 256MB
  Coordinator: 2GB
  Agents (1 wave): 4GB (4 × 1GB)
  Telemetry: 256MB
  Total: ~6.5GB
  
Infrastructure:
  CPU cores: 4-8
  Memory: 8GB (+ 2GB buffer)
  Disk: 50GB (for images + projects)
  Network: 10 Mbps (sufficient)
  
Configuration:
  cfn_redis_maxmemory: 256MB
  coordinator_memory: 2GB
  agent_memory_per_tier: [512MB, 600MB, 800MB, 1GB]
  memory_budget: 10GB
```

### 5.2 Staging Tier

**Use Case**: Testing, multi-iteration workflows (3-5 iterations)

```yaml
Services:
  Redis: 512MB
  Coordinator: 4GB
  Agents (2-3 waves): 15GB (5-8 agents per wave)
  Telemetry: 512MB
  Dashboard: 512MB
  Total: ~20GB

Infrastructure:
  CPU cores: 8-16
  Memory: 32GB (+ 4GB buffer)
  Disk: 100GB SSD (performance critical)
  Network: 50 Mbps
  
Configuration:
  cfn_redis_maxmemory: 512MB
  coordinator_memory: 4GB
  agent_memory_per_tier: [512MB, 700MB, 900MB, 1.2GB]
  memory_budget: 40GB
  max_iterations: 10
```

### 5.3 Production Tier

**Use Case**: Enterprise scale, continuous orchestration

```yaml
Services:
  Redis (HA): 1GB × 3 nodes (cluster)
  Coordinator: 8GB
  Agents (multi-wave): 40GB (15-20 agents per wave)
  Telemetry: 1GB
  Dashboard: 1GB
  Logging: 2GB
  Total: ~52GB active

Infrastructure:
  CPU cores: 16-32
  Memory: 64-128GB (+ 16GB buffer)
  Disk: 500GB NVMe SSD (IOPS >10K)
  Network: 1 Gbps (dedicated network interface)
  
Configuration:
  cfn_redis_maxmemory: 2GB
  redis_maxmemory_policy: allkeys-lru
  coordinator_memory: 8GB
  agent_memory_per_tier: [512MB, 768MB, 1GB, 1.5GB]
  memory_budget: 64GB
  max_agents_per_wave: 20
  max_iterations: 15
  concurrent_orchestrators: 2-3
```

### 5.4 Resource Scaling Table

| Tier | Agents/Wave | Total Memory | Typical Duration | Cost/Hour (AWS) |
|------|-------------|--------------|------------------|-----------------|
| Dev | 1-2 | 6GB | 5-10 min | $0.15 |
| Staging | 5-8 | 20GB | 15-30 min | $0.50 |
| Production | 15-20 | 52GB | 30-60 min | $1.50 |
| Enterprise | 25-30 | 80GB+ | 60-120 min | $3.00 |

---

## 6. DATABASE AND PERSISTENT STATE REQUIREMENTS

### 6.1 Redis (Primary Data Store)

**Purpose**: Task queue, metadata, coordination state
**Schema:**
```
Data Type    Key Pattern           Est. Size    TTL
────────────────────────────────────────────────────
LIST         task:queue            10 items × 100B = 1KB      -
STRING       task:total            20B                          -
STRING       task:completed        20B                          -
HASH         task:N                500B × 100 tasks = 50KB      -
HASH         task:N:result         2KB × 100 results = 200KB    -
HASH         agent:N:status        200B × 20 agents = 4KB       -
```

**Total Redis Footprint:** ~256KB per iteration (grows to ~1MB with history)

**Configuration Tuning:**
```bash
# Memory management
maxmemory: 512MB              # Set explicit limit
maxmemory-policy: allkeys-lru # Evict oldest keys when full

# Performance
tcp-backlog: 511              # Connection queue depth
timeout: 300                  # Idle connection timeout (seconds)

# Persistence (optional)
save: ""                       # Disable RDB snapshots (or set daily)
appendonly: no                 # Disable AOF (or enable for durability)

# Replication (HA only)
replicaof <host> 6379         # For Redis cluster
```

### 6.2 SQLite (Audit Trail - Optional)

**Purpose**: Agent execution history, iteration logs (optional)
**Location**: `/app/claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db`
**Size**: ~1MB per 1000 agent executions
**Retention**: 30 days (or project lifetime)

**Schema:**
```sql
CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence REAL,
    spawned_at TEXT,
    completed_at TEXT,
    metadata TEXT
);

CREATE TABLE iterations (
    id INTEGER PRIMARY KEY,
    task_id TEXT,
    iteration_number INTEGER,
    start_time TEXT,
    end_time TEXT,
    error_count_initial INTEGER,
    error_count_final INTEGER,
    agents_spawned INTEGER
);
```

---

## 7. PRODUCTION PATTERNS FROM TESTS

### 7.1 Test Infrastructure Patterns

**B10 Test (Batch Processing):**
- 10 files with TypeScript errors
- 32 agents spawned
- 376MB peak per agent
- Wave-based parallelism (10-12 agents per wave)
- Total execution: 3-5 minutes

**Full Frontend Test (Intelligent Coordinator):**
- 85 files (376MB codebase)
- 400+ initial TypeScript errors
- 58 batches (42 Tier 1, 12 Tier 2, 3 Tier 3, 1 Tier 4)
- 5 iterations (max)
- Total execution: 15-25 minutes
- Memory budget: 40GB (peak: ~32GB actual)

**Docker Stabilization Tests:**
```bash
50-agent-parallel-test.sh        # Parallel spawn stress test
agent-lifecycle-tests.sh         # Container startup/exit patterns
docker-hello-world-parity-tests.sh  # Parity validation
redis-coordination-tests.sh      # Queue coordination validation
```

### 7.2 Production Validation Checkpoints

**Pre-Production Deployment Validation:**

```bash
# 1. Redis connectivity and performance
redis-benchmark -h cfn-redis -p 6379 -c 50 -n 100000
# Expected: >100K ops/sec

# 2. Agent image pull time
docker pull claude-flow-novice-agent:latest
# Expected: <30s for cached, <5min for full pull

# 3. Coordinator startup time
time docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  claude-flow-novice-coordinator:latest
# Expected: <5s startup

# 4. Memory budget test
docker run --rm \
  --memory=32g \
  -e MEMORY_BUDGET=32g \
  claude-flow-novice-coordinator:latest
# Verify no OOM kills

# 5. Network latency between agents
docker run --network cfn-network --rm \
  busybox ping redis
# Expected: <1ms latency
```

---

## 8. CLOUD DEPLOYMENT REQUIREMENTS

### 8.1 AWS ECS/Fargate

**Required Configuration:**

```yaml
Task Definition:
  CPU: 2048 (2 cores for coordinator) - 4096 (4 cores for orchestrator)
  Memory: 2GB (coordinator) - 8GB (orchestrator)
  Containers: Redis (512MB), Coordinator (2GB), Agent pool (variable)
  
Network:
  Security Group: Allow ingress 443 (HTTPS), 6379 (Redis, internal)
  Subnet: Private subnets (agents require NAT for API calls)
  IAM Role: ECR pull, CloudWatch logs, ECS task management
  
Storage:
  Task role: Volume mount for codebase
  EBS volume: 100GB for Redis persistence
  CloudWatch logs: Coordinator and agent stdout/stderr
  
Cost Estimate (t3.xlarge instances):
  Compute: $0.2208/hour × 2 instances = $0.44/hour
  Memory: ~64GB = $6.84/hour (reserved instances)
  EBS: 100GB = $10/month
  Total: ~$7.30/hour (production tier)
```

### 8.2 Kubernetes (GKE / EKS / AKS)

**Deployment Architecture:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-coordinator
spec:
  replicas: 1
  selector:
    matchLabels:
      component: coordinator
  template:
    metadata:
      labels:
        component: coordinator
    spec:
      containers:
      - name: coordinator
        image: claude-flow-novice-coordinator:3.0.0
        resources:
          requests:
            memory: "2Gi"
            cpu: "1"
          limits:
            memory: "8Gi"
            cpu: "2"
        env:
        - name: MEMORY_BUDGET
          value: "40Gi"
        - name: REDIS_HOST
          value: "redis-service"
        volumeMounts:
        - name: docker-socket
          mountPath: /var/run/docker.sock
        - name: workspace
          mountPath: /workspace
      volumes:
      - name: docker-socket
        hostPath:
          path: /var/run/docker.sock
      - name: workspace
        persistentVolumeClaim:
          claimName: project-workspace
```

**Storage Classes:**
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: cfn-workspace-sc
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
  iops: "10000"
  throughput: "500"
```

**Cost Estimate (GKE Standard):**
- Node pool: 3 × n1-standard-8 ($0.38/hour each) = $1.14/hour
- Storage: 100GB persistent volume = $0.10/hour
- Network: Egress to Anthropic API = $0.50/hour
- Total: ~$1.74/hour

---

## 9. MONITORING AND OBSERVABILITY

### 9.1 Key Metrics to Track

**Container Metrics:**
```yaml
Coordinator:
  cpu_percent: Target <50%, Peak <100%
  memory_mb: Target <2000MB, Max 8000MB
  task_spawn_rate: 5-10 tasks/minute
  iteration_duration_ms: 30-60s

Agent Pool:
  cpu_percent_per_agent: Target 50-80%
  memory_mb_per_agent: 376-1024MB (tier-dependent)
  completion_rate: >1 task/agent/minute
  error_rate: <1% (task failures)

Redis:
  connected_clients: 5-50 (based on agent count)
  used_memory_mb: <512MB
  commands_per_sec: 100-1000
  evicted_keys: 0 (optimal)
```

**Application Metrics:**
```yaml
Coordination:
  task_queue_length: 0-100 (decreasing over time)
  completed_tasks_count: Incrementing
  error_reduction_per_iteration: >80% (target)
  
Iterations:
  iteration_count: Track cumulative
  iteration_duration_seconds: 30-180s
  agents_per_iteration: 5-20
```

### 9.2 Alerting Thresholds

```yaml
Alerts:
  - Coordinator memory > 7GB: Potential memory leak
  - Agent memory > tier limit: OOM risk
  - Redis memory > 90% limit: Data loss risk
  - Task queue stuck > 5min: Deadlock detection
  - Error reduction < 50%: Fix quality issue
  - Iteration count > max: Infinite loop detection
  - API latency > 5s: Network issue or rate limiting
```

---

## 10. SECURITY CONSIDERATIONS

### 10.1 Container Security Hardening

**Applied in Dockerfile.production:**

```dockerfile
# Non-root user (critical)
RUN addgroup -g 1001 -S cfn-agent && \
    adduser -u 1001 -S cfn-agent -G cfn-agent
USER cfn-agent

# Read-only filesystem (where possible)
HEALTHCHECK --interval=30s --timeout=10s --retries=3

# Resource limits (via docker-compose)
deploy:
  resources:
    limits:
      memory: 2048M
      cpus: '1.0'
```

**Security Best Practices:**
- No ENTRYPOINT shell escapes (use dumb-init)
- Minimal base image (alpine: 5MB vs 1GB)
- No secrets in ENV (use .env file mount)
- Read-only volumes where applicable
- Dropped capabilities (no CAP_SYS_ADMIN)

### 10.2 Network Security

```bash
# Internal-only communication (no external exposure)
Redis: 172.20.0.2:6379 (cfn-network only)
Agents: Private IP within cfn-network (no host binding)

# Reverse proxy for external access (if needed)
nginx/Envoy → Port 3000 (dashboard) with authentication
TLS termination at load balancer

# API key management
ANTHROPIC_API_KEY: Mounted via .env file (not in image)
Docker registry credentials: Via docker login (not in image)
```

---

## 11. COST ANALYSIS

### 11.1 AWS Compute Cost Breakdown

**Development Environment (8-hour workday):**
```
t3.medium (2 vCPU, 4GB RAM): $0.0416/hour
Daily cost: $0.0416 × 8 = $0.33
Monthly: $6.50
```

**Production Environment (24/7):**
```
c5.2xlarge (8 vCPU, 16GB RAM): $0.34/hour
Daily cost: $0.34 × 24 = $8.16
Monthly: $244.80
```

**Multi-Region HA (3 regions):**
```
3 × c5.2xlarge: $0.34/hour × 3 = $1.02/hour
Monthly: $734.40
```

### 11.2 Cost Optimization Opportunities

1. **Spot Instances**: 70% savings for non-critical agents
2. **Reserved Instances**: 40% savings with 1-year commitment
3. **Auto-scaling**: Scale down when not in use (dev environments)
4. **Tiered storage**: Archive logs after 30 days
5. **Container image optimization**: Multi-stage builds, layer caching

### 11.3 Total Cost of Ownership (12 months)

| Tier | Monthly Compute | Storage | Network | Total |
|------|-----------------|---------|---------|-------|
| Development | $40 | $10 | $5 | $55 |
| Staging | $200 | $50 | $20 | $270 |
| Production | $500 | $100 | $100 | $700 |
| Enterprise (HA) | $1500 | $300 | $300 | $2100 |

---

## SUMMARY AND RECOMMENDATIONS

### Architecture Strengths
- Scalable agent orchestration via Docker
- Redis-backed task queue (fault-tolerant)
- Wave-based parallelism with memory budgeting
- Multi-tier batching optimizes resource utilization
- Non-root containers, minimal attack surface

### Deployment Recommendations

**For Development:**
- Use docker-compose locally
- 8GB RAM, 4 CPU cores minimum
- Single Redis instance (no HA needed)

**For Staging:**
- Deploy to single-node Kubernetes cluster
- 32GB RAM, 8 CPU cores
- Redis persistence enabled

**For Production:**
- Multi-node Kubernetes cluster (3+ nodes)
- Redis cluster (3 nodes, HA)
- Auto-scaling agent pool (min 5, max 20 agents)
- Monitoring + alerting (Prometheus + Grafana)
- Backup strategy: Daily snapshots, 30-day retention

**For Enterprise:**
- Multi-region Kubernetes (3+ regions)
- Global load balancing
- Redis cluster with cross-region replication
- Dedicated observability stack (Datadog/NewRelic)
- SLA: 99.9% availability, 15-minute RTO

---

**Document Version**: 1.0
**Last Updated**: November 13, 2025
**Maintained By**: DevOps Engineering Team
