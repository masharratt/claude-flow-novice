# Docker Processes: Isolation → Provisioning → Workflows
## Comprehensive Visualization Guide

**Version:** 1.0.0
**Date:** 2025-11-19
**Status:** Production Ready
**Target Audience:** Visualization Tool Users (Graph DBs, Mind Maps, Flow Diagrams)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Component Catalog](#component-catalog)
3. [Relationship Mappings](#relationship-mappings)
4. [Process Flows](#process-flows)
5. [Data Flows](#data-flows)
6. [Integration Points](#integration-points)
7. [Configuration Reference](#configuration-reference)

---

## Executive Summary

### System Overview

Claude Flow Novice implements a **container-based multi-agent orchestration system** supporting:

- **62 specialized AI agents** in isolated containers
- **Wave-based execution** with 40GB memory budget
- **Multi-worktree development** with automatic port conflict resolution
- **Test-driven validation** with 95%+ accuracy gates
- **Three execution modes:** Task (debugging), CLI (production), Docker (high isolation)
- **Redis coordination** for agent synchronization
- **96% faster builds** via Linux native storage (755s → <20s)

### Key Capabilities

```yaml
Isolation:
  - Multi-worktree namespace isolation
  - Per-branch network segmentation
  - Volume isolation
  - MCP server isolation

Provisioning:
  - Fast Docker builds (96% improvement via Linux native)
  - Multi-stage images (81% size reduction)
  - Environment variable contracts
  - Runtime initialization

Workflows:
  - CFN Loop 3-phase orchestration
  - Wave-based spawning
  - Redis coordination
  - Test-driven gates
```

### System Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| Container Types | 6 core images | Agent, Coordinator, Orchestrator, Redis, Postgres, Playwright |
| Total Agent Types | 62 specialized | Frontend, Backend, DevOps, Security, Testing, etc. |
| Memory Budget | 40GB default | Wave-based allocation, configurable |
| Build Performance | 96% faster | Linux native storage vs Windows mounts |
| Concurrent Worktrees | 50-100 theoretical | Hash-based port allocation |
| Test-Driven Gate Accuracy | 95%+ | vs 55% confidence-based |

---

## Component Catalog

### 1. Container Components

#### 1.1 Core Infrastructure Containers

```yaml
INFRASTRUCTURE_CONTAINERS:

  Redis:
    TYPE: Message Broker & Coordination
    IMAGE: redis:7-alpine
    PURPOSE: Agent communication, task queue, consensus
    PORTS: 6379 (base), +offset in multi-worktree
    MEMORY: 256MB
    HEALTH_CHECK: redis-cli ping
    NETWORKS:
      - mcp-network (internal)
    VOLUMES:
      - redis-data (persistence)

  Postgres:
    TYPE: Relational Database
    IMAGE: postgres:15-alpine
    PURPOSE: Agent metadata, workflow state, audit logs
    PORTS: 5432 (base), +offset in multi-worktree
    MEMORY: 512MB
    HEALTH_CHECK: pg_isready -U postgres
    NETWORKS:
      - mcp-network (internal)
    VOLUMES:
      - postgres-data (persistence)
    ENVIRONMENT:
      - POSTGRES_DB=cfn_loop
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=[REDACTED]

  Playwright:
    TYPE: Browser Automation
    IMAGE: mcr.microsoft.com/playwright:v1.40.0
    PURPOSE: Browser-based testing, web automation
    PORTS: 8081 (MCP endpoint)
    MEMORY: 1GB
    NETWORKS:
      - mcp-network (internal)
    VOLUMES:
      - playwright-data (cache)
    CAPABILITIES: Screenshot, PDF, form filling

  Loki:
    TYPE: Log Aggregation
    IMAGE: grafana/loki:2.9.0
    PURPOSE: Centralized logging from all agents
    PORTS: 3100
    MEMORY: 256MB
    NETWORKS:
      - public-network (monitoring)
    VOLUMES:
      - loki-data (logs)
```

#### 1.2 Agent Containers (Loop 3 Workers)

```yaml
AGENT_WORKER_CONTAINERS:

  Loop3_Agents:
    TYPE: AI Agent (Implementation)
    IMAGE: cfn-agent:latest (multi-stage build)
    BASE_IMAGE: node:18-alpine
    COUNT: Dynamic (1-28+ per iteration)
    SPAWNING: CLI or Docker mode (orchestrate.sh)
    NAMING: agent-${AGENT_ID}
    MEMORY: 512MB - 1GB (tier-based)
    CPU: 0.5 - 1.0 cores (tier-based)
    NETWORKS:
      - mcp-network (coordination)
    VOLUMES:
      - /workspace (read-write, task isolation)
      - /app/src (read-only, codebase)
      - .env (read-only, secrets)
    ENVIRONMENT:
      - CFN_AGENT_TYPE (role-specific)
      - CFN_TASK_ID (task identifier)
      - CFN_AGENT_ID (instance identifier)
      - CFN_REDIS_HOST=redis
      - CFN_REDIS_PORT=6379
    EXECUTION:
      1. Read task from Redis
      2. Execute implementation/testing
      3. Report completion via signal
      4. Store results in Redis
      5. Exit

  Orchestrator:
    TYPE: Agent Container (Orchestration)
    IMAGE: cfn-orchestrator:latest
    EXTENDS: cfn-agent:latest
    PURPOSE: Manage Loop 3 → Loop 2 → PO workflow
    SPAWNING: docker run via coordinator
    MEMORY: 2GB
    NETWORKS:
      - mcp-network (coordination)
      - public-network (healthcheck)
    VOLUMES:
      - docker.sock (container spawning)
      - /workspace (task context)
    CAPABILITIES:
      - Spawn worker agents
      - Aggregate test results
      - Execute gate checks
      - Manage consensus collection

  Coordinator:
    TYPE: Agent Container (Orchestration)
    IMAGE: cfn-coordinator:latest
    EXTENDS: cfn-agent:latest
    PURPOSE: Top-level CFN Loop management
    SPAWNING: Main Chat (CLI or Task mode)
    MEMORY: 2GB
    NETWORKS:
      - mcp-network (coordination)
    VOLUMES:
      - docker.sock (container spawning)
      - /workspace (task context)
    CAPABILITIES:
      - Read task description
      - Spawn orchestrator
      - Report final status
      - Handle PROCEED/ITERATE/ABORT
```

#### 1.3 Validation Containers (Loop 2)

```yaml
VALIDATOR_CONTAINERS:

  Loop2_Validators:
    TYPE: AI Agent (Validation)
    IMAGE: cfn-agent:latest
    COUNT: 3-5 (configurable)
    ROLES:
      - Code Reviewer
      - Security Specialist
      - Test Validator
      - Performance Analyst
      - Accessibility Auditor
    MEMORY: 600MB each
    SPAWNING: After gate passes
    NETWORKS:
      - mcp-network
    PURPOSE:
      - Review Loop 3 deliverables
      - Verify implementation quality
      - Validate test coverage
      - Report consensus scores
```

#### 1.4 Decision Container (Product Owner)

```yaml
PRODUCT_OWNER_CONTAINER:

  PO_Agent:
    TYPE: AI Agent (Decision Making)
    IMAGE: cfn-agent:latest
    COUNT: 1 per iteration
    MEMORY: 800MB
    SPAWNING: After consensus collected
    NETWORKS:
      - mcp-network
    PURPOSE:
      - Review Loop 2 consensus
      - Decide: PROCEED / ITERATE / ABORT
      - Validate deliverables
      - Trigger next iteration or completion
```

---

### 2. Image Components

#### 2.1 Dockerfile Layering

```yaml
IMAGE_BUILD_HIERARCHY:

  cfn-agent:latest:
    Stage_1_Dependencies:
      BASE: node:18-alpine
      LAYERS:
        - apk add (system dependencies)
        - npm ci (production dependencies)
        - result: ~500MB

    Stage_2_Build:
      COPY: src/ (from previous stage)
      RUN: npm run build (TypeScript → JavaScript)
      OUTPUT: dist/ directory
      result: intermediate, discarded

    Stage_3_Production:
      FROM: node:18-alpine (fresh base)
      COPY: dist/ (from build stage)
      USER: node (non-root)
      ENTRYPOINT: node dist/agent.js
      FINAL_SIZE: 187MB (81% reduction from 980MB)

  cfn-orchestrator:latest:
    EXTENDS: cfn-agent:latest
    ADDITIONAL_LAYERS:
      - orchestrate.sh (5MB)
      - helper scripts (2MB)
      - additional_dependencies (3MB)
    FINAL_SIZE: 197MB

  cfn-coordinator:latest:
    EXTENDS: cfn-agent:latest
    ADDITIONAL_LAYERS:
      - orchestrate.sh (5MB)
      - Docker CLI (50MB)
      - helper scripts (2MB)
    FINAL_SIZE: 244MB
```

#### 2.2 Build Process

```yaml
BUILD_PROCESS:

  Linux_Native_Build (RECOMMENDED):
    TRIGGER: ./.claude/skills/docker-build/build.sh
    PROCESS:
      1. Copy Dockerfile to /tmp/cfn-build (Linux native storage)
      2. rsync source to /tmp (0.1s, vs 755s on Windows mount)
      3. docker build /tmp/cfn-build
      4. docker tag (result)
      5. cleanup /tmp/cfn-build
    PERFORMANCE: 96% faster (755s → <20s)
    RATIONALE: WSL2 Windows mount I/O penalty eliminated

  Standard_Build (SLOW):
    TRIGGER: docker build -f docker/Dockerfile.agent .
    PERFORMANCE: 755s on WSL2 (0.1s I/O + 755s transfer)
    ISSUE: Windows mount point penalty on WSL2
    RECOMMENDATION: Never use directly on WSL2

  Build_Cache:
    STRATEGY: Layer-based caching
    DEPENDENCIES_LAYER: Cached separately
    SOURCE_LAYER: Only invalidated on src/ changes
    CACHE_HIT: 20s rebuild with cache
    CACHE_MISS: 60s rebuild (cold start)
```

### 3. Volume Components

#### 3.1 Named Volumes (Persistence)

```yaml
NAMED_VOLUMES:

  redis-data:
    PURPOSE: Redis persistence (RDB snapshots)
    MOUNTPOINT: /data (in redis container)
    ISOLATION: Per-worktree (cfn-${BRANCH}_redis-data)
    PERSISTENCE: Yes (survives container restart)
    SHARING: Single-writer (redis only)
    BACKUP: Daily snapshots recommended

  postgres-data:
    PURPOSE: PostgreSQL data directory
    MOUNTPOINT: /var/lib/postgresql/data (in postgres container)
    ISOLATION: Per-worktree (cfn-${BRANCH}_postgres-data)
    PERSISTENCE: Yes
    SHARING: Single-writer (postgres only)
    BACKUP: pg_dump recommended

  playwright-data:
    PURPOSE: Browser cache, downloaded binaries
    MOUNTPOINT: /ms-playwright
    ISOLATION: Per-worktree
    PERSISTENCE: Yes (optimization)
    SIZE: ~1GB (browser binaries)

  loki-data:
    PURPOSE: Log storage
    MOUNTPOINT: /loki
    ISOLATION: Shared (central logging)
    PERSISTENCE: Yes
    ROTATION: 7-day default
```

#### 3.2 Bind Mounts (Development)

```yaml
BIND_MOUNTS:

  .claude (Config):
    HOST_PATH: /home/user/claude-flow-novice/.claude
    CONTAINER_PATH: /app/.claude
    MOUNT_MODE: ro (read-only)
    PURPOSE: Agent configuration, skills, hooks
    SECURITY: Prevents unauthorized modification

  src (Source Code):
    HOST_PATH: /home/user/claude-flow-novice/src
    CONTAINER_PATH: /app/src
    MOUNT_MODE: ro (read-only)
    PURPOSE: Application source code
    SECURITY: Prevents agents from modifying codebase

  workspace (Task Workspace):
    HOST_PATH: /home/user/claude-flow-novice/workspace
    CONTAINER_PATH: /app/workspace
    MOUNT_MODE: rw (read-write)
    PURPOSE: Agent work directory, task artifacts
    SECURITY: Isolated per-task

  .env (Secrets):
    HOST_PATH: /home/user/claude-flow-novice/.env
    CONTAINER_PATH: /workspace/.env
    MOUNT_MODE: ro (read-only)
    PURPOSE: Environment variables, API keys
    SECURITY: Read-only, in-container only

  docker.sock (Docker Daemon):
    HOST_PATH: /var/run/docker.sock
    CONTAINER_PATH: /var/run/docker.sock
    MOUNT_MODE: rw (read-write)
    PURPOSE: Container spawning from agents
    SECURITY: Limited to orchestrator/coordinator
    RESTRICTION: User must have docker group
```

### 4. Network Components

#### 4.1 Bridge Networks

```yaml
NETWORKS:

  mcp-network:
    TYPE: Bridge network
    DRIVER: bridge
    INTERNAL: true (no external internet)
    PURPOSE: Internal agent communication
    DNS_ENABLED: yes (service name resolution)
    CONNECTED_SERVICES:
      - redis
      - postgres
      - playwright
      - all agent containers
      - orchestrator
      - coordinator
    ISOLATION: Per-worktree (cfn-${BRANCH}_mcp-network)
    SERVICE_NAMES:
      - redis (resolves to dynamic IP)
      - postgres (resolves to dynamic IP)
      - orchestrator (resolves to dynamic IP)
    LATENCY: <1ms intra-network
    THROUGHPUT: ~10 Gbps

  public-network:
    TYPE: Bridge network
    DRIVER: bridge
    INTERNAL: false (external access allowed)
    PURPOSE: Monitoring, health checks
    EXPOSED_SERVICES:
      - Grafana (3002 or +offset)
      - Prometheus (9091 or +offset)
      - Orchestrator health endpoint (3001 or +offset)
    ISOLATION: Per-worktree
```

#### 4.2 Service Discovery

```yaml
SERVICE_DISCOVERY:

  Container_Naming:
    PATTERN: "${COMPOSE_PROJECT_NAME}_${SERVICE_NAME}_${REPLICA}"
    EXAMPLE: cfn-feature-auth_redis_1
    VISIBILITY: Hidden (not used in service discovery)
    REASON: Container names are Docker-specific, not portable

  Service_Names:
    PATTERN: ${SERVICE_NAME}
    EXAMPLES:
      - redis (resolves to 172.18.0.2, dynamic)
      - postgres (resolves to 172.18.0.3, dynamic)
      - orchestrator (resolves to 172.18.0.4, dynamic)
    DISCOVERY_MECHANISM: Docker DNS (127.0.0.11:53)
    RESOLUTION_TIME: <1ms
    BEHAVIOR: Automatic load balancing across replicas

  Port_Mapping:
    INTERNAL: redis:6379 (service + internal port)
    EXTERNAL: localhost:6421 (published port, when offset=42)
    AGENTS_USE: -h redis -p 6379 (service name + internal port)
    EXTERNAL_CLIENTS_USE: localhost:6421 (published port)

  Critical_Pattern:
    CORRECT: redis-cli -h redis -p 6379
    WRONG: redis-cli -h cfn-redis-1 -p 6379
    WRONG: redis-cli -h 172.18.0.2 -p 6379
    REASON: Container names don't resolve in DNS, IPs change on restart
```

---

## Relationship Mappings

### 1. Component Relationships

```yaml
COMPONENT_RELATIONSHIPS:

  # Container Dependencies
  cfn-agent --spawned-by--> orchestrate.sh
  orchestrate.sh --manages--> Loop3_Agents
  cfn-orchestrator --manages--> Loop3_Agents
  cfn-coordinator --manages--> cfn-orchestrator

  # Service Dependencies
  All_Agents --communicates-with--> redis
  All_Agents --authenticates-with--> .env secrets
  Orchestrator --connects-to--> redis (Redis BLPOP)
  Postgres --stores--> agent_metadata
  Playwright --used-by--> web-testing agents

  # Isolation Relationships
  cfn-agent --runs-in--> mcp-network
  redis --isolated-by--> per-worktree namespace
  postgres --isolated-by--> per-worktree namespace
  Volumes --isolated-by--> per-branch naming

  # Image Relationships
  cfn-agent:latest --extends--> node:18-alpine
  cfn-orchestrator:latest --extends--> cfn-agent:latest
  cfn-coordinator:latest --extends--> cfn-agent:latest
  Multi-stage build --reduces--> image size 81%
```

### 2. Data Flow Relationships

```yaml
DATA_FLOW_RELATIONSHIPS:

  Main_Chat --provides--> task description
  task description --queued-to--> redis
  redis --delivers-to--> cfn-coordinator
  cfn-coordinator --parses--> CFN environment
  CFN_TASK_ID --scopes--> all redis keys
  CFN_AGENT_TYPE --determines--> agent specialization
  CFN_MEMORY_BUDGET --limits--> wave spawning

  # Agent Execution Flow
  orchestrate.sh --spawns--> loop3 agents
  loop3 agents --read-from--> workspace
  loop3 agents --write-to--> workspace
  loop3 agents --report-to--> redis (completion signal)
  redis --notifies--> orchestrator (BLPOP unblock)

  # Test-Driven Gate
  loop3 agents --execute--> test suite
  test suite --generates--> pass_rate
  pass_rate --stored-in--> redis result hash
  orchestrator --aggregates--> all pass_rates
  aggregated rate --compared-to--> gate threshold (0.75)
  gate pass --triggers--> loop2 spawning

  # Consensus Collection
  loop2 validators --review--> loop3 deliverables
  validators --score--> consensus (0.0-1.0)
  consensus --stored-in--> redis keys
  orchestrator --collects--> consensus scores
  mean consensus --compared-to--> threshold (0.90)
```

### 3. Execution Mode Relationships

```yaml
EXECUTION_MODE_RELATIONSHIPS:

  Task_Mode:
    Main_Chat --spawns-via-Task()-->  All_Agents
    Agents --return-directly-to--> Main_Chat
    NO--redis--needed (optional)
    Visibility: Full (agents visible in conversation)
    Cost: $0.150 per iteration
    Use_Case: Debugging, <5 minute tasks

  CLI_Mode:
    Main_Chat --spawns-via-npx--> cfn-v3-coordinator
    cfn-v3-coordinator --spawns-via-orchestrate.sh--> Loop3_Agents
    Loop3_Agents --signal-via--> redis
    Coordinator --waits-via--> redis BLPOP
    Visibility: Progress reports only
    Cost: $0.054 per iteration (64% savings)
    Use_Case: Production, >5 minute tasks

  Docker_Mode:
    Main_Chat --spawns-via-docker-run--> cfn-v3-coordinator (container)
    Coordinator_Container --spawns-via-docker-run--> Loop3_Agents (containers)
    Agents --communicate-via--> mcp-network (docker bridge)
    Service_Discovery: redis service name (DNS resolution)
    Isolation: Full (process, filesystem, network)
    Use_Case: High isolation, multi-worktree development
```

---

## Process Flows

### 1. Container Lifecycle Flow

```yaml
CONTAINER_LIFECYCLE:

  Agent_Container_Lifecycle:
    Phase_1_Creation:
      Trigger: orchestrate.sh --spawns-agents
      Action: docker run --detach
      Metadata: Container ID assigned
      Mounts: workspace, src, .env
      Networks: mcp-network
      Memory_Limit: Tier-based (512MB-1GB)
      Duration: 2-3 seconds per container

    Phase_2_Initialization:
      Entrypoint: /app/src/agent/index.ts
      cfn-runtime.sh: Load environment
      Check: CFN_TASK_ID, CFN_AGENT_ID, CFN_AGENT_TYPE
      Validate: Redis connectivity
      Load: Workspace configuration
      Duration: <500ms

    Phase_3_Execution:
      Task_Claim: Read from workspace/task.json
      Implementation: Execute agent logic
      Testing: Run success criteria tests
      Reporting: Store results in Redis hash
      Duration: Variable (5s - 30min)

    Phase_4_Completion:
      Signal: LPUSH swarm:${TASK_ID}:${AGENT_ID}:done "complete"
      Report: HSET swarm:${TASK_ID}:${AGENT_ID}:result ...
      Status: Mark as completed in Redis
      Exit: Container stops (orchestrator cleanup)
      Duration: <100ms

    Phase_5_Cleanup:
      Trigger: orchestrate.sh --after-gate-decision
      Action: docker rm (dead containers)
      Volumes: Preserved for audit
      Networks: Disconnected
      Duration: 1-2 seconds

  Redis_Container_Lifecycle:
    Start: docker-compose up redis
    Load: redis-data volume (if exists)
    Health: redis-cli ping (response: PONG)
    Running: Persistent until docker-compose down
    Persistence: RDB snapshot on SHUTDOWN
    Recovery: Load from redis-data on restart

  Postgres_Container_Lifecycle:
    Start: docker-compose up postgres
    Initialize: Create cfn_loop database
    Health: pg_isready (connection check)
    Running: Accept connections
    Persistence: postgres-data volume
    Recovery: Automatic from stored state
```

### 2. Isolation Pattern Flow

```yaml
ISOLATION_PATTERN_FLOW:

  Multi_Worktree_Setup:
    Step_1_Branch_Detection:
      Action: git branch --show-current
      Input: Current branch (e.g., "feature/AUTH-123")
      Output: Branch name string

    Step_2_Sanitization:
      Input: "feature/AUTH-123"
      Rules:
        - Lowercase: "feature/auth-123"
        - Replace invalid chars: "feature-auth-123"
        - Add prefix: "cfn-feature-auth-123"
      Output: Docker-safe project name

    Step_3_Port_Offset_Calculation:
      Input: Branch name "feature-auth-123"
      Hash: md5sum | head -c 8 → "a1b2c3d4"
      Offset: (0xa1b2 % 1000 * 100 / 1000) → 42
      Output: Port offset (0-99 range)

    Step_4_Port_Allocation:
      Redis_Port: 6379 + 42 = 6421
      Postgres_Port: 5432 + 42 = 5474
      Orchestrator_Port: 3001 + 42 = 3043
      Prometheus_Port: 9091 + 42 = 9133

    Step_5_Environment_Setup:
      COMPOSE_PROJECT_NAME: cfn-feature-auth-123
      CFN_REDIS_PORT: 6421
      CFN_POSTGRES_PORT: 5474
      RESULT: Isolated namespace

    Step_6_Container_Startup:
      Script: ./scripts/docker/run-in-worktree.sh up -d
      Environment: Injected variables
      Networks: cfn-feature-auth-123_mcp-network
      Volumes: cfn-feature-auth-123_redis-data
      Result: Zero conflicts with other worktrees

  Network_Isolation_Flow:
    Create_Network: docker network create ${COMPOSE_PROJECT_NAME}_mcp-network
    Connect_Services: Connect redis, postgres to network
    Service_Names: Internal DNS (redis → dynamic IP)
    Barrier: No cross-network communication
    Result: Complete isolation per worktree
```

### 3. Provisioning Flow

```yaml
PROVISIONING_FLOW:

  Build_Optimization_Flow:
    Step_1_Trigger:
      Command: ./.claude/skills/docker-build/build.sh
      Input: Dockerfile path (default: docker/Dockerfile.agent)
      Option: --no-cache (force rebuild)

    Step_2_Context_Transfer:
      WSL2_Issue: Windows mount I/O penalty (755s)
      Solution: Use Linux native storage (/tmp/cfn-build)
      Action: rsync source to /tmp
      Performance: 0.1s (vs 755s on Windows mount)

    Step_3_Build_Execution:
      Location: /tmp/cfn-build (Linux native)
      Command: docker build -f Dockerfile.agent .
      Cache: Layer-based caching
      Output: cfn-agent:latest image

    Step_4_Tagging:
      Action: docker tag built-image cfn-agent:latest
      Versioning: Semantic versioning optional
      Registry: Local Docker daemon

    Step_5_Cleanup:
      Action: rm -rf /tmp/cfn-build
      Reason: Ephemeral build directory

    Result: 96% faster builds (755s → <20s)

  Multi_Stage_Build_Flow:
    Stage_1_Dependencies:
      Base: node:18-alpine (base layer)
      Install: apk add (system deps)
      Run: npm ci (production dependencies)
      Output: ~500MB intermediate image

    Stage_2_Build:
      Copy: src/ from build context
      Compile: npm run build (TypeScript → JavaScript)
      Output: dist/ directory (discarded, reused)
      Size: Discarded (not in final image)

    Stage_3_Production:
      Base: node:18-alpine (fresh, minimal)
      Copy: dist/ from stage 2 (only built artifacts)
      User: node (non-root, security)
      Entrypoint: node dist/agent.js
      Final_Size: 187MB (81% reduction)

    Result: Small, efficient, secure container

  Runtime_Initialization_Flow:
    Step_1_Container_Start:
      Entrypoint: /app/src/agent/index.ts
      Action: Execute agent entry point

    Step_2_cfn_runtime_Load:
      Script: cfn-runtime.sh (sourced)
      Action: Load all CFN environment variables
      Source: /workspace/.env, CFN_* env vars

    Step_3_Environment_Validation:
      Check_1: CFN_TASK_ID exists
      Check_2: CFN_AGENT_ID exists
      Check_3: CFN_AGENT_TYPE valid
      Check_4: CFN_REDIS_HOST reachable
      On_Failure: Exit with error code

    Step_4_Workspace_Setup:
      Create: /app/workspace if needed
      Mount: Already mounted from host
      Load: task.json, configuration

    Step_5_Ready:
      Signal: Agent ready to accept task
      Proceed: Read and execute task
```

### 4. Workflow Integration Flow

```yaml
CFN_LOOP_WORKFLOW_FLOW:

  Execution_Setup:
    User_Input: /cfn-loop-cli "task description" --mode=standard
    Action: Main Chat spawns cfn-v3-coordinator
    Mode: CLI mode (production recommended)
    Execution: Background process with monitoring

  Loop_3_Spawning:
    Trigger: Coordinator starts orchestrate.sh
    Wave_1_Spawning:
      Agents_Per_Wave: 5-28 (based on task complexity)
      Memory_Tier: 512MB (independent files)
      Parallelism: All agents spawn in parallel
      Spawning_Method: CLI (npx spawn) or Docker (docker run)
      Synchronization: No internal wait
      Monitoring: orchestrate.sh tracks all agent IDs

    Agent_Execution_in_Parallel:
      Agent_1: Implementation in thread 1
      Agent_2: Implementation in thread 2
      Agent_N: Implementation in thread N
      Communication: Via Redis, zero direct coordination
      Duration: Variable per agent (5s - 30min)

    Completion_Signaling:
      Each_Agent: LPUSH swarm:${TASK_ID}:${AGENT_ID}:done "complete"
      Result_Storage: HSET swarm:${TASK_ID}:${AGENT_ID}:result {...}
      Test_Reporting: pass_rate, test_count, deliverables
      Order: Completion order independent

  Loop_3_Waiting:
    Mechanism: orchestrate.sh BLPOP (blocking pop)
    Patience: Wait for ALL agents to signal completion
    Timeout: 300 seconds per agent (configurable)
    Stuck_Detection: orchestrator monitors process PID
    On_Timeout: Log warning, continue (or force exit)
    On_Completion: Aggregate all results

  Gate_Check_Execution:
    Aggregate_Pass_Rates: Collect all test_pass_rate values
    Calculate_Mean: (rate1 + rate2 + ... + rateN) / N
    Threshold: Standard mode = 0.75 (75% tests pass)
    Decision:
      IF mean_pass_rate >= 0.75:
        SIGNAL: swarm:${TASK_ID}:gate-passed (broadcast)
        PROCEED: To Loop 2
      ELSE:
        WAKE: Loop 3 agents for iteration N+1
        SKIP: Loop 2 (no consensus if gate fails)

  Loop_2_Spawning:
    Trigger: Receive gate-passed signal (BLPOP)
    Wait: coordination-wait "swarm:${TASK_ID}:gate-passed"
    Agents_Count: 3-5 validators (code review, security, test, perf, a11y)
    Memory: 600MB each
    Parallelism: All validators spawn together
    Task_Context: Review Loop 3 deliverables, test results

  Loop_2_Validation:
    Validator_1: Code review (style, patterns, maintainability)
    Validator_2: Security review (vulnerabilities, auth, data handling)
    Validator_3: Test validator (coverage, edge cases)
    Validator_N: Additional validators (performance, accessibility, etc.)
    Scoring: Each validator reports 0.0-1.0 confidence
    Consensus: Mean of all validator scores

  Consensus_Collection:
    Mechanism: Collect all validator confidence scores from Redis
    Wait_For: All validators to report results
    Timeout: 300 seconds per validator
    Aggregation: Calculate mean consensus
    Threshold: Standard mode = 0.90 (90% agreement)
    Result_Storage: swarm:${TASK_ID}:consensus score in Redis

  Product_Owner_Decision:
    Trigger: After consensus collected
    Review_Data: Loop 2 consensus scores, Loop 3 test results
    Decision_Options:
      1. PROCEED: Deliverables are acceptable, task complete
      2. ITERATE: More work needed, wake agents for iteration N+1
      3. ABORT: Task failure, exit without deliverables
    Signal_Method: Parse agent output, extract decision keyword
    Broadcast: Store decision in coordination layer

  Iteration_Management:
    IF_PROCEED:
      Task_Status: Mark as COMPLETE
      Deliverables: Finalize and version
      Artifacts: Store in workspace (versioned)
      Exit_Status: Success

    IF_ITERATE:
      Iteration_Count: Increment N
      Check_Limit: N <= max_iterations (default: 10)?
      IF_YES: Wake Loop 3 agents for iteration N+1 (repeat from Loop 3)
      IF_NO: Mark task as FAILED (too many iterations)

    IF_ABORT:
      Task_Status: Mark as ABORTED
      Reason: Product Owner decision or gate failures
      Cleanup: Clean up partial work
      Exit_Status: Failure

  Final_Status_Reporting:
    Status: COMPLETE | FAILED | ABORTED
    Iterations: N (how many iterations executed)
    Test_Pass_Rate: Final mean rate from Loop 3
    Consensus_Score: Final mean consensus from Loop 2
    Deliverables: List of created/modified files
    Artifacts: Task execution trace, logs
    Execution_Time: Total time from start to finish
```

### 5. Wave-Based Spawning Flow

```yaml
WAVE_SPAWNING_FLOW:

  Strategic_Batching:
    Input: 85 files with errors across codebase
    Analysis: Identify file clusters (shared dependencies)
    Result: 58 strategic batches (vs naive 85 per-file)
    Allocation:
      Batch_Set_1: 42 batches × 512MB (Tier 1) = 21.5GB
      Batch_Set_2: 12 batches × 600MB (Tier 2) = 7.2GB
      Batch_Set_3: 3 batches × 800MB (Tier 3) = 2.4GB
      Batch_Set_4: 1 batch × 1GB (Tier 4) = 1GB
      Total: 32.1GB (66% reduction vs 85GB naive)

  Tier_Allocation:
    Tier_1_512MB:
      File_Count: 1 per batch
      Use_Case: Independent files (no dependencies)
      CPU: 0.5 cores
      Memory: 512MB
      Batches: Scaled based on budget

    Tier_2_600MB:
      File_Count: 2-3 per batch
      Use_Case: Small clusters (shared imports)
      CPU: 0.5 cores
      Memory: 600MB
      Batches: Fewer than Tier 1

    Tier_3_800MB:
      File_Count: 4-8 per batch
      Use_Case: Medium modules (complex state)
      CPU: 0.75 cores
      Memory: 800MB
      Batches: Few per task

    Tier_4_1GB:
      File_Count: 9+ per batch
      Use_Case: Large interconnected (all-in-one batch)
      CPU: 1.0 core
      Memory: 1GB
      Batches: 1 maximum

  Wave_Execution:
    Wave_1: Spawn Tier 1 batches in parallel
    Monitor: Wait for all to complete
    Wave_2: Spawn Tier 2 batches in parallel
    Wave_3: Spawn Tier 3 batches in parallel
    Wave_4: Spawn Tier 4 batch(es)
    Parallelism: Max within memory budget (40GB default)
    Duration: Total time = max(wave durations)

  Memory_Budget_Management:
    Budget: 40GB default
    Allocation_1: First wave uses 21.5GB
    Remaining: 40 - 21.5 = 18.5GB available
    Allocation_2: Next wave uses 7.2GB
    Remaining: 18.5 - 7.2 = 11.3GB
    Continue: Until all batches allocated
    Overflow_Protection: Stop if next wave would exceed budget
```

---

## Data Flows

### 1. Task Execution Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TASK EXECUTION DATA FLOW                     │
└─────────────────────────────────────────────────────────────────┘

Entry Point: User Input
└─ Task Description: "Implement JWT authentication"

↓ Main Chat Execution

Step 1: Parse Task
├─ Extract requirements
├─ Determine Loop 3 agents needed
└─ Set CFN_TASK_ID = "task-${timestamp}"

↓ Coordinator Spawning

Step 2: Create Task Context
├─ Write task.json to workspace/
├─ Format: { task_description, requirements, file_list }
└─ Set environment: CFN_TASK_ID, CFN_MEMORY_BUDGET, etc.

↓ Redis Queue

Step 3: Queue Task
├─ LPUSH CFN_TASK_QUEUE "task-${TASK_ID}"
├─ HSET cfn_task:${TASK_ID} description "..."
└─ HSET cfn_task:${TASK_ID} status "pending"

↓ Orchestrator Processing

Step 4: Spawn Loop 3 Agents
├─ FOR each agent in [coder, tester, ...]:
│  ├─ Calculate memory tier based on file count
│  ├─ SPAWN agent via orchestrate.sh
│  └─ Pass: CFN_AGENT_TYPE, CFN_AGENT_ID, CFN_TASK_ID
└─ SADD swarm:${TASK_ID}:agents ${AGENT_ID}

↓ Agent Container Execution (Parallel)

Step 5: Agent Reads Task
├─ Load /app/workspace/task.json
├─ Parse requirements
├─ Determine file scope
└─ Load dependencies

Step 6: Agent Implements
├─ Read source files (read-only mounts)
├─ Write changes to /app/workspace
├─ Execute implementation
└─ Generate intermediate results

Step 7: Agent Tests
├─ Run test suite from success_criteria.json
├─ Execute: npm test
├─ Capture: pass count, fail count
├─ Calculate: pass_rate = PASS / (PASS + FAIL)
└─ Store: pass_rate, test_count, failures in memory

Step 8: Agent Reports Results
├─ HSET swarm:${TASK_ID}:${AGENT_ID}:result:
│  ├─ pass_rate = 0.95
│  ├─ test_count = 20
│  ├─ test_pass_count = 19
│  ├─ deliverables = ["src/auth.ts", "src/jwt.ts"]
│  └─ duration = "45s"
├─ LPUSH swarm:${TASK_ID}:${AGENT_ID}:done "complete"
└─ Container exit

↓ Orchestrator Waiting (Redis BLPOP)

Step 9: Collect All Completions
├─ BLPOP swarm:${TASK_ID}:${AGENT_ID}:done (for each agent)
├─ Aggregation: Gather all result hashes
├─ Calculate: mean_pass_rate across all agents
└─ Timeout: 300s per agent (configurable)

↓ Gate Check

Step 10: Test-Driven Gate
├─ Mean Pass Rate: (0.95 + 0.92 + 0.98 + 0.90) / 4 = 0.9375
├─ Threshold: 0.75 (Standard mode)
├─ Decision: 0.9375 >= 0.75? YES
└─ Signal: LPUSH swarm:${TASK_ID}:gate-passed "pass"

↓ Loop 2 Spawning (if gate passes)

Step 11: Spawn Validators
├─ Count: 3-5 validators
├─ Types: Code reviewer, Security specialist, Test validator, etc.
├─ Memory: 600MB each
└─ Task: Review Loop 3 deliverables

Step 12: Validators Review
├─ Read Loop 3 deliverables from workspace
├─ Execute review criteria (design, security, tests)
├─ Generate consensus scores (0.0-1.0)
└─ Report: HSET swarm:${TASK_ID}:${VALIDATOR_ID}:consensus ${score}

↓ Consensus Collection

Step 13: Aggregate Consensus
├─ Collect all validator scores
├─ Mean Consensus: (0.85 + 0.90 + 0.88) / 3 = 0.8767
├─ Threshold: 0.90 (Standard mode)
├─ Decision: 0.8767 >= 0.90? NO
└─ Signal consensus collected

↓ Product Owner Decision

Step 14: Product Owner Review
├─ Review consensus score (0.8767)
├─ Review test pass rate (0.9375)
├─ Consider: Consensus just below threshold
├─ Decision: ITERATE (request improvements)
└─ Signal: LPUSH swarm:${TASK_ID}:po-decision "iterate"

↓ Iteration Management

Step 15: Iteration Trigger
├─ Increment iteration count
├─ Wake Loop 3 agents for iteration 2
├─ Provide feedback context
└─ Repeat from Step 4

OR (if consensus >= threshold)

Step 15: Finalization
├─ Decision: PROCEED
├─ Status: Task COMPLETE
├─ Artifacts: Versioned deliverables
├─ Report: Final metrics and time
└─ Exit

Output: Final Status + Deliverables
```

### 2. Environment Variable Propagation Flow

```yaml
ENV_PROPAGATION:

  Source_1_Host_Environment:
    .env_File: /home/user/claude-flow-novice/.env
    Variables:
      - ANTHROPIC_API_KEY=[REDACTED]
      - REDIS_PASSWORD=[REDACTED]
      - Database credentials
    Read_By: Docker Compose (env_file directive)

  Source_2_Docker_Compose:
    docker-compose.yml:
      env_file:
        - .env  # Load entire .env
      services:
        redis:
          environment:
            - REDIS_PASSWORD (from .env)
        postgres:
          environment:
            - POSTGRES_PASSWORD (from .env)

  Source_3_Agent_Container:
    Mounts:
      - .env → /workspace/.env (read-only)
    cfn-runtime.sh:
      - source /workspace/.env
      - export all variables
    Result: All env vars available in agent process

  Source_4_CFN_Environment:
    Variables_Set_By_Orchestrator:
      - CFN_TASK_ID = "task-${timestamp}"
      - CFN_AGENT_ID = "agent-${AGENT_TYPE}-${timestamp}"
      - CFN_AGENT_TYPE = "react-frontend-engineer"
      - CFN_MEMORY_BUDGET = "40g"
      - CFN_REDIS_HOST = "redis"
      - CFN_REDIS_PORT = "6379"
    Passed_Via: docker run --env or docker-compose environment section

  Propagation_Chain:
    .env file (host)
      ↓ docker-compose reads
      ↓ Container receives via env_file
      ↓ cfn-runtime.sh sources
      ↓ Agent process variables
      ↓ Used by agent code

  Variable_Access_Patterns:
    Bash: $CFN_TASK_ID or ${CFN_TASK_ID}
    Node.js: process.env.CFN_TASK_ID
    TypeScript: process.env.CFN_TASK_ID! (with ! for strict)
    Python: os.environ.get('CFN_TASK_ID')

  Security_Considerations:
    - .env mounted read-only (prevents modification)
    - Secrets not in logs (must be filtered)
    - tmpfs volumes for ephemeral secrets
    - No secrets in environment variable logging
```

### 3. File System Mount Data Flow

```yaml
FILE_SYSTEM_MOUNT_FLOW:

  Read_Only_Mounts:
    /app/.claude:
      Source: ~/.claude/
      Purpose: Agent configuration, skills, hooks
      Mounted_As: ro (read-only)
      Usage: Agents read but never modify config

    /app/src:
      Source: ~/src/
      Purpose: Application source code
      Mounted_As: ro (read-only)
      Usage: Agents read to understand structure, never modify directly

    /workspace/.env:
      Source: ~/.env
      Purpose: Secrets and environment variables
      Mounted_As: ro (read-only)
      Usage: Agents read to access API keys, never modify

  Read_Write_Mounts:
    /app/workspace:
      Source: ~/workspace/
      Purpose: Task workspace, agent work directory
      Mounted_As: rw (read-write)
      Isolation: Per-task (TASK_ID scoped)
      Usage:
        - Write: Implementation files
        - Write: Test results
        - Write: Artifacts
        - Read: Shared results from other agents
      Cleanup: After task completion or failure

  Volume_Mounts:
    redis-data:
      Driver: Local
      Mountpoint: /data (in redis container)
      Purpose: Redis persistence (RDB snapshots)
      Isolation: Per-worktree
      Cleanup: Preserved (survives restart)

    postgres-data:
      Driver: Local
      Mountpoint: /var/lib/postgresql/data
      Purpose: Database persistence
      Isolation: Per-worktree
      Cleanup: Preserved

  Docker_Socket_Mount:
    /var/run/docker.sock:
      Source: Host Docker daemon
      Mountpoint: /var/run/docker.sock (in orchestrator)
      Purpose: Container spawning from orchestrator
      Security: rw (read-write required)
      Restriction: Only orchestrator container gets this mount
      Risk: Allows container-in-container spawning

  Data_Flow_Diagram:
    User Workspace (Host)
      ├─ ~/.claude/ (config) → mount ro → Agent /app/.claude/
      ├─ ~/src/ (code) → mount ro → Agent /app/src/
      ├─ ~/.env (secrets) → mount ro → Agent /workspace/.env
      └─ ~/workspace/ (work) → mount rw → Agent /app/workspace/

    Agent Container (Runtime)
      ├─ Read ~/.claude/ (read-only)
      ├─ Read ~/src/ (read-only)
      ├─ Read ~/.env (read-only)
      ├─ Write /app/workspace/implementation/ (shared)
      └─ Write /app/workspace/results/ (shared)

    Orchestrator Container
      ├─ Mount /var/run/docker.sock
      └─ Spawn child agents via docker run

    Results Back to Host
      ~/workspace/
      ├─ agent-1-results.json (from Agent 1)
      ├─ agent-2-results.json (from Agent 2)
      └─ final-deliverables/
```

---

## Integration Points

### 1. CFN Loop × Docker Integration

```yaml
CFN_LOOP_DOCKER_INTEGRATION:

  Mode_1_Task_Mode:
    Execution: Main Chat spawns Task() agents
    Docker_Usage: Optional (agents can run in subprocess)
    Redis_Usage: Optional (coordination via return values)
    Isolation: Process-level (OS processes)
    Network: Localhost communication
    Best_For: Debugging, <5 minute tasks
    Cost: $0.150/iteration

  Mode_2_CLI_Mode:
    Execution: Main Chat spawns coordinator → orchestrator spawns agents
    Docker_Usage: Required (agents in docker run detach)
    Redis_Usage: Required (Redis BLPOP, completion signals)
    Isolation: Container-level (Docker images, networks)
    Network: Docker bridge network (mcp-network)
    Best_For: Production, >5 minute tasks
    Cost: $0.054/iteration (64% savings)
    Service_Discovery:
      - Agents connect to "redis" (service name, DNS)
      - Orchestrator connects to "postgres" (service name)
      - Zero IP-based addressing

  Mode_3_Docker_Mode:
    Execution: CFN_DOCKER_MODE=true /cfn-loop-cli
    Docker_Usage: Mandatory for all components
    Coordinator: docker run orchestrator container
    Agents: docker run agent containers
    Redis_Usage: Required (service name: redis)
    Network: Shared mcp-network (per-worktree)
    Isolation: Full (process, filesystem, network per agent)
    Service_Discovery: Automatic (Docker DNS)
    Best_For: Multi-worktree development, high isolation

  Integration_Points:
    Main_Chat --spawns--> cfn-v3-coordinator (agent or container)
    cfn-v3-coordinator --spawns--> orchestrate.sh
    orchestrate.sh --spawns--> loop3 agents (cli or docker)
    loop3 agents --coordinate-via--> redis
    redis --service-discovery--> mcp-network DNS
    orchestrator --aggregates--> test results (from Redis)
    orchestrator --gates--> loop2 agents (cli or docker)
    loop2 agents --report-via--> redis (consensus)
    product-owner --decides--> PROCEED/ITERATE/ABORT
```

### 2. Redis × Docker Integration

```yaml
REDIS_DOCKER_INTEGRATION:

  Redis_Container:
    Image: redis:7-alpine
    Network: mcp-network (internal)
    Service_Name: redis (DNS resolution)
    Port_Internal: 6379 (used by agents via service name)
    Port_Published: 6379 + offset (used by host/external)
    Volume: redis-data (persistence)
    Health_Check: redis-cli ping → PONG
    Isolation: Per-worktree (cfn-${BRANCH}_redis)

  Agent_Connection:
    Internal: redis-cli -h redis -p 6379 (service name)
    NOT: redis-cli -h cfn-redis-1 -p 6379 (container name)
    NOT: redis-cli -h 172.18.0.2 -p 6379 (IP, dynamic)
    Driver: Docker DNS (127.0.0.11:53) in container
    Resolution_Time: <1ms (cached)

  Coordination_Data:
    Task_Queue: List swarm:${TASK_ID}:agents
    Agent_Tracking: Set swarm:${TASK_ID}:loop3:agents
    Completion_Signals: List swarm:${TASK_ID}:${AGENT_ID}:done
    Test_Results: Hash swarm:${TASK_ID}:${AGENT_ID}:result
    Consensus_Scores: Hash swarm:${TASK_ID}:${VALIDATOR_ID}:consensus
    Gate_Signal: List swarm:${TASK_ID}:gate-passed
    PO_Decision: String swarm:${TASK_ID}:po-decision

  Blocking_Operations:
    Orchestrator: BLPOP swarm:${TASK_ID}:${AGENT_ID}:done (300s timeout)
    Purpose: Wait for agent completion without polling
    Efficiency: <1% CPU (blocked, no spinning)
    Unblock_Trigger: Agent LPUSH completion signal

  Data_Durability:
    In_Memory: Hash values (fast access)
    Persisted: RDB snapshots (redis-data volume)
    TTL: Optional (keys can have expiration)
    Backup: Daily snapshots recommended (production)
```

### 3. Orchestrator × Postgres Integration

```yaml
ORCHESTRATOR_POSTGRES_INTEGRATION:

  Postgres_Container:
    Image: postgres:15-alpine
    Network: mcp-network (internal)
    Service_Name: postgres (DNS resolution)
    Port_Internal: 5432
    Port_Published: 5432 + offset
    Database: cfn_loop
    User: postgres
    Isolation: Per-worktree

  Metadata_Storage:
    cfn_tasks table:
      - task_id (PK)
      - description
      - status (pending, running, complete, failed)
      - created_at
      - completed_at
      - metadata (JSON)

    cfn_agents table:
      - agent_id (PK)
      - task_id (FK)
      - agent_type
      - status (pending, running, complete)
      - created_at
      - completed_at
      - result_json (test pass rate, deliverables)

    cfn_results table:
      - result_id (PK)
      - agent_id (FK)
      - test_count
      - test_pass_count
      - pass_rate
      - deliverables (JSON array)
      - created_at

  Orchestrator_Usage:
    Query: SELECT * FROM cfn_tasks WHERE status = 'running'
    Insert: INSERT INTO cfn_agents VALUES (...)
    Update: UPDATE cfn_tasks SET status = 'complete'
    Report: Store final metrics in metadata
    Duration: <50ms per operation (typical)

  Backup_Integration:
    Daily_Backup: pg_dump cfn_loop > backup.sql
    Retention: 30 days rolling
    Recovery: psql cfn_loop < backup.sql
```

### 4. MCP Servers × Docker Integration

```yaml
MCP_DOCKER_INTEGRATION:

  MCP_Architecture:
    Clients: Agent containers
    Servers: Specialized Docker containers
    Protocol: stdio (piped communication)
    Discovery: Via client configuration

  MCP_Server_Types:
    Playwright_MCP:
      Image: mcr.microsoft.com/playwright:v1.40.0
      Port: 8081 (custom endpoint)
      Network: mcp-network
      Purpose: Browser automation, web testing
      Used_By: Web testing agents
      Capabilities: Screenshot, PDF, form filling, navigation

    Redis_Tools_MCP:
      Type: Custom (internal tool)
      Port: 8082
      Purpose: Redis operations abstraction
      Used_By: Orchestrator, coordination agents
      Commands: SET, GET, LPUSH, BLPOP, etc.

    N8N_MCP:
      Type: Workflow automation
      Port: 8083
      Purpose: Complex workflow coordination
      Used_By: Advanced orchestration scenarios

    Security_Scanner_MCP:
      Type: Security tool
      Port: 8084
      Purpose: Code security analysis
      Used_By: Security specialist agents

  Integration_Pattern:
    Agent Container (stdio):
      write: {"method": "screenshot", "url": "..."}
      ↓
    MCP_Server (Playwright):
      process: Take screenshot
      ↓
    write: {"result": "image.png", "timestamp": "..."}
      ↓
    Agent Container:
      read: {"result": "image.png"}
      ↓
    continue: Using screenshot data

  Service_Discovery:
    Internal: Agents find MCP servers via Docker DNS
    Service_Names:
      - playwright (service name for Playwright MCP)
      - redis-tools (service name)
      - n8n (service name)
    Network: All on mcp-network
```

### 5. Monitoring × Docker Integration

```yaml
MONITORING_DOCKER_INTEGRATION:

  Prometheus:
    Image: prom/prometheus:latest
    Network: public-network (monitoring accessible)
    Port: 9091 + offset
    Purpose: Metrics collection from services
    Scrape_Targets:
      - redis (via redis-exporter)
      - postgres (via postgres-exporter)
      - orchestrator (custom metrics endpoint)
    Scrape_Interval: 15 seconds (default)
    Storage: Time-series database

  Grafana:
    Image: grafana/grafana:latest
    Network: public-network (external access)
    Port: 3002 + offset
    Purpose: Visualization and dashboards
    Datasource: Prometheus
    Dashboards:
      - Agent execution timeline
      - Memory usage per tier
      - Pass rate trends
      - Consensus score distribution
    Refresh: 5-10 seconds

  Loki:
    Image: grafana/loki:2.9.0
    Network: public-network
    Port: 3100
    Purpose: Log aggregation from all containers
    Retention: 7 days (default, configurable)
    Labels:
      - agent_type
      - task_id
      - iteration
    Query: Via Grafana dashboard

  Exporter_Containers:
    Redis_Exporter:
      Purpose: Collect Redis metrics
      Metrics: connected_clients, used_memory, command_rate, etc.
      Port: 9121 + offset
      Network: internal (mcp-network)

    Postgres_Exporter:
      Purpose: Collect PostgreSQL metrics
      Metrics: connection_count, query_time, table_size
      Port: 9187 + offset
      Network: internal

  Metric_Flow:
    Services (Redis, Postgres, Orchestrator)
      ↓ exporters
    Prometheus (scrape every 15s)
      ↓ query
    Grafana (dashboard)
      ↓ visualize
    User (monitoring dashboard)
```

---

## Configuration Reference

### 1. Environment Variable Contract

```yaml
ENV_CONTRACT:

  # Task Identification
  CFN_TASK_ID:
    Format: "task-${timestamp}"
    Example: "task-1700416800"
    Scope: All Redis keys scoped by task ID
    Required: YES
    Used_By: Coordinator, Orchestrator, Agents

  # Agent Identification
  CFN_AGENT_ID:
    Format: "agent-${AGENT_TYPE}-${timestamp}-${PID}"
    Example: "agent-coder-1700416800-12345"
    Uniqueness: Per-container unique
    Required: YES
    Used_By: Agents for completion signals

  CFN_AGENT_TYPE:
    Format: Alphanumeric with hyphens
    Examples: "react-frontend-engineer", "backend-developer", "security-specialist"
    Scope: Determines specialization and tools available
    Required: YES
    Used_By: Agent initialization

  # Redis Configuration
  CFN_REDIS_HOST:
    Value: "redis" (service name)
    Alternative: "localhost" (for CLI mode outside Docker)
    Port: Separate CFN_REDIS_PORT
    Required: YES
    Used_By: All agents, Orchestrator

  CFN_REDIS_PORT:
    Default: 6379 (main branch)
    Multi-Worktree: 6379 + offset (calculated from branch)
    Range: 6379-6478 (100 ports per worktree)
    Required: YES
    Used_By: Redis connection

  # Memory and Resource Management
  CFN_MEMORY_BUDGET:
    Format: "${SIZE}g" (gigabytes)
    Default: "40g"
    Example: "50g", "32g", "100g"
    Usage: Wave-based allocation constraint
    Required: YES
    Used_By: Orchestrator (wave spawning)

  CFN_DOCKER_MODE:
    Values: "true" | "false" (or unset)
    Default: "false" (CLI mode spawning)
    When_True: Force docker run for agent spawning
    When_False: Use CLI (npx spawn)
    Required: NO
    Used_By: Orchestrator (spawn decision)

  # Image and Container Configuration
  CFN_DOCKER_IMAGE:
    Format: "image:tag"
    Default: "cfn-agent:latest"
    Examples: "cfn-agent:v1.2.0", "cfn-orchestrator:latest"
    Used_By: Docker run command
    Required: NO (defaults to cfn-agent:latest)

  CFN_DOCKER_NETWORK:
    Format: Docker network name
    Default: "${COMPOSE_PROJECT_NAME}_mcp-network"
    Example: "cfn-main_mcp-network"
    Used_By: docker run --network
    Required: NO

  # Multi-Worktree Support
  COMPOSE_PROJECT_NAME:
    Format: "cfn-${SANITIZED_BRANCH}"
    Example: "cfn-feature-auth-123"
    Isolation: All resources prefixed with this name
    Calculated: Via branch sanitization
    Required: YES (in Docker mode)
    Used_By: docker-compose, Docker services

  CFN_POSTGRES_PORT:
    Default: 5432 (main)
    Multi-Worktree: 5432 + offset
    Used_By: Agent connections to postgres service
    Required: NO (used by Postgres agents)

  # Iteration and Gate Configuration
  CFN_ITERATION_LIMIT:
    Default: 10
    Range: 1-50
    Meaning: Max iterations before failure
    Required: NO
    Used_By: Orchestrator (iteration loop)

  CFN_GATE_THRESHOLD:
    Default: 0.75 (75% tests must pass)
    Range: 0.0-1.0
    Meaning: Loop 3 gate check threshold
    Required: NO
    Used_By: Gate check script

  CFN_CONSENSUS_THRESHOLD:
    Default: 0.90 (90% validator agreement)
    Range: 0.0-1.0
    Meaning: Loop 2 consensus threshold
    Required: NO
    Used_By: Orchestrator (consensus check)

  # Secrets (from .env file)
  ANTHROPIC_API_KEY:
    Source: .env file
    Security: Read-only mount
    Mounted_As: /workspace/.env
    Used_By: Agent code (API calls)
    Required: YES

  POSTGRES_PASSWORD:
    Source: .env file
    Security: Read-only mount
    Used_By: Postgres container
    Required: YES

  # Build Configuration
  DOCKER_BUILDKIT:
    Value: "1" (recommended)
    Purpose: Enable BuildKit for faster builds
    Benefits: Better caching, smaller images
    Required: NO (optional optimization)
```

### 2. Docker Compose Configuration Structure

```yaml
DOCKER_COMPOSE_STRUCTURE:

  services:
    redis:
      image: redis:7-alpine
      ports:
        - "${CFN_REDIS_PORT}:6379"
      environment:
        - REDIS_PASSWORD=${REDIS_PASSWORD}
      volumes:
        - redis-data:/data
      networks:
        - mcp-network
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]

    postgres:
      image: postgres:15-alpine
      ports:
        - "${CFN_POSTGRES_PORT}:5432"
      environment:
        - POSTGRES_DB=cfn_loop
        - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      volumes:
        - postgres-data:/var/lib/postgresql/data
      networks:
        - mcp-network

    playwright:
      image: mcr.microsoft.com/playwright:v1.40.0
      ports:
        - "8081:8081"
      networks:
        - mcp-network

  volumes:
    redis-data: {}
    postgres-data: {}

  networks:
    mcp-network:
      driver: bridge
      internal: true
```

### 3. Dockerfile Optimization Checklist

```yaml
DOCKERFILE_OPTIMIZATION:

  Multi_Stage_Best_Practices:
    ✓ Stage 1: Dependencies (fixed, cacheable)
    ✓ Stage 2: Build (compile, artifacts)
    ✓ Stage 3: Production (minimal, only runtime)
    ✓ Final Size: <200MB for agent (vs 980MB naive)

  Layer_Ordering:
    ✓ FROM (stable base)
    ✓ apk add (rarely changes)
    ✓ npm ci (depends file, medium change rate)
    ✓ COPY src/ (source, high change rate)
    ✓ RUN build (depends on source)
    ✓ COPY dist/ to final stage (only if changed)

  Security_Hardening:
    ✓ Non-root user (RUN useradd -m node)
    ✓ Read-only file system (where possible)
    ✓ No secrets in image (use mount, not COPY)
    ✓ Minimal base image (alpine > debian)
    ✓ Update only critical packages

  Performance_Optimization:
    ✓ Layer caching (stable layers first)
    ✓ Minimal context (.dockerignore)
    ✓ Alpine base (50% smaller than debian)
    ✓ Multi-stage (discard intermediate layers)
    ✓ COPY not ADD (simpler, faster)

  Build_Performance:
    ✓ Linux native storage (/tmp/cfn-build)
    ✓ BuildKit enabled (DOCKER_BUILDKIT=1)
    ✓ Cache between builds (docker build --cache-from)
    ✓ Concurrent builds (BuildKit parallelizes)
```

### 4. Port Allocation Reference

```yaml
PORT_ALLOCATION:

  Base_Ports (Offset 0, Main Branch):
    Redis: 6379
    Postgres: 5432
    Orchestrator: 3001
    Redis_Coordinator: 6380
    Prometheus: 9091
    Grafana: 3002
    Redis_Exporter: 9121
    Postgres_Exporter: 9187
    Nginx_HTTP: 80
    Nginx_HTTPS: 443
    Loki: 3100
    Playwright_MCP: 8081
    Redis_Tools_MCP: 8082
    N8N_MCP: 8083
    Security_Scanner_MCP: 8084

  Multi_Worktree_Calculation:
    Branch: "feature-auth-123"
    Sanitized: "cfn-feature-auth-123"
    Hash: md5sum | head -c 8 → "a1b2c3d4"
    Offset: (0xa1b2 % 1000 * 100 / 1000) → 42
    Result:
      Redis: 6379 + 42 = 6421
      Postgres: 5432 + 42 = 5474
      Orchestrator: 3001 + 42 = 3043
      Prometheus: 9091 + 42 = 9133
      Grafana: 3002 + 42 = 3044

  Port_Range_Per_Worktree: 100 ports
  Maximum_Concurrent_Worktrees: ~500 (65535 - 6379) / 100
  Typical_Concurrent_Worktrees: 50-100 (practical limit)
```

---

## Summary: Visualization-Ready Structure

This document is optimized for visualization tools with:

### Component Catalog
- ✅ Container components with full metadata (image, ports, networks, volumes)
- ✅ Image components with build layering and size metrics
- ✅ Volume components with isolation and persistence
- ✅ Network components with service discovery details

### Relationship Mappings
- ✅ Component dependencies (spawned-by, manages, communicates-with)
- ✅ Data flow relationships (provides, queued-to, delivers-to)
- ✅ Execution mode relationships (spawns-via, signal-via)

### Process Flows
- ✅ Container lifecycle (5 phases)
- ✅ Isolation patterns (6 steps with port allocation)
- ✅ Provisioning (build optimization, multi-stage, runtime initialization)
- ✅ Workflow integration (5-phase CFN Loop, gates, consensus, iteration)
- ✅ Wave-based spawning (tier allocation, budget management)

### Data Flows
- ✅ Task execution (step-by-step with Redis interactions)
- ✅ Environment variable propagation (5 sources, chain to agent)
- ✅ File system mounts (read-only, read-write, volumes, docker.sock)

### Integration Points
- ✅ CFN Loop × Docker (3 modes)
- ✅ Redis × Docker (service discovery, coordination)
- ✅ Orchestrator × Postgres (metadata storage)
- ✅ MCP Servers × Docker (isolation, integration)
- ✅ Monitoring × Docker (Prometheus, Grafana, Loki)

### Configuration Reference
- ✅ Environment variable contract (16+ critical variables)
- ✅ Docker Compose structure (services, volumes, networks)
- ✅ Dockerfile optimization checklist
- ✅ Port allocation reference (50+ ports, calculation formulas)

**For visualization tools:** Use YAML sections as nodes, relationships as edges, flows as sequences, and data flows as pipelines.

---

**Document Complete**
**Comprehensive Coverage of Docker Isolation → Provisioning → Workflows**
**Optimized for Automated Visualization Tooling**
