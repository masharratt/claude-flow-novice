================================================================================
    TRIGGER.DEV CONTAINER MODES - COMPREHENSIVE ARCHITECTURE GUIDE
================================================================================
VERSION: 1.0.0 (Planned)
STATUS: DESIGN DOCUMENTATION - Architecture Planning Phase
REFERENCE: readme/CLI_MODE_ARCHITECTURE.md (mirrored format, 14 parts)

EXECUTIVE SUMMARY:
  Trigger.dev represents a container-first orchestration model that extends CFN
  Loop coordination patterns beyond CLI-based agent spawning. This architecture
  supports multiple container deployment modes, persistent worker pools, and
  event-driven job coordination. Trigger.dev complements CLI mode for larger-scale
  deployments requiring background job processing, webhooks, and real-time status.

KEY DIFFERENTIATORS FROM CLI MODE:
  - Background worker pool (persistent vs CLI agent spawning)
  - Event-driven job queueing (vs direct BLPOP coordination)
  - Self-hosted infrastructure (PostgreSQL, Redis, MinIO, ClickHouse)
  - Webhook event triggers (vs slash command invocation)
  - Real-time job status dashboard (vs Redis signal polling)
  - Multi-environment support (dev/staging/prod orchestration)
  - Cost model: Persistent infrastructure vs on-demand CLI agents

DESIGN PHASES:
  - Phase 1: Single Container Agent Spawning (current investigation)
  - Phase 1.2a: Multi-Container Orchestration (Wave-based spawning)
  - Phase 1.3b: Infrastructure Validation (Health checks, diagnostics)
  - Phase 2: Enterprise Scaling (Multi-worker coordination)
  - Phase 3: Production Hardening (Security, compliance, HA)

================================================================================
PART 1: ARCHITECTURE COMPARISON
================================================================================

[CLI MODE ARCHITECTURE (v3.2.0+)]
Main Chat
  ↓
CLI agents (direct Redis BLPOP coordination)
  ↓
Agent completes work, exits
  ↓
Main Chat processes completion signal

CHARACTERISTICS:
  - On-demand agent spawning (ephemeral containers)
  - Direct Redis signaling between Main Chat and agents
  - Cost: $0.050/iteration (provider routing optimized)
  - Setup: Minimal (only Redis + CLI tools required)
  - Scaling: Per-iteration agent pools
  - Debugging: Full visibility in Main Chat session
  - Best For: Interactive development, cost-sensitive tasks, fast iteration

[TRIGGER.DEV ARCHITECTURE (Phase 1)]
User/Webhook
  ↓
Trigger.dev Event Queue
  ↓
Background Worker (persistent)
  ↓
Spawns Agent Container (on-demand)
  ↓
Agent executes work
  ↓
Reports to Worker via Redis
  ↓
Worker updates Trigger.dev Database
  ↓
User views status in Dashboard

CHARACTERISTICS:
  - Persistent background workers (always-on pool)
  - Event-driven job coordination (webhook/event triggered)
  - Cost: Infrastructure overhead (persistent services) + agent costs
  - Setup: Docker Compose with 8+ services (detailed below)
  - Scaling: Multiple workers in parallel
  - Debugging: Logs accessible via dashboard + container inspection
  - Best For: Scheduled jobs, webhook integrations, multi-team workflows

[HYBRID MODEL - CLI MODE + TRIGGER.DEV]
Scenario 1 - Interactive Development:
  → Use CLI mode (fast iteration, low cost)

Scenario 2 - Scheduled Background Tasks:
  → Use Trigger.dev (persistent worker, event-driven)

Scenario 3 - Mixed Workload:
  → CLI mode for on-demand tasks
  → Trigger.dev for background coordination

ADVANTAGES OF TRIGGER.DEV OVER CLI MODE:
  ✅ Persistent job history and audit trail
  ✅ Webhook event triggers (external integrations)
  ✅ Scheduled job execution (cron-based)
  ✅ Real-time dashboard (job status visibility)
  ✅ Multi-worker parallelization
  ✅ Database-backed coordination (vs ephemeral Redis)
  ✅ Retryable jobs with exponential backoff
  ✅ Multi-team isolation via organizations

ADVANTAGES OF CLI MODE OVER TRIGGER.DEV:
  ✅ Minimal setup (only Redis required)
  ✅ Lower infrastructure costs (no persistent services)
  ✅ Faster startup time (no container initialization)
  ✅ Direct debugging visibility
  ✅ Simplified recovery procedures
  ✅ Single-session focus (Main Chat coordination)

[COST ANALYSIS]
CLI Mode:
  - Agent spawning: $0.050 per iteration
  - Infrastructure: Redis only (~$10/month)
  - Scaling: Per-iteration basis
  - Total: ~$0.050-0.150/task

Trigger.dev Persistent Infrastructure:
  - PostgreSQL: ~$30-50/month
  - Redis: ~$10-20/month
  - MinIO (S3-compatible): ~$20-30/month
  - ClickHouse (analytics): ~$50-100/month
  - Subtotal Infrastructure: ~$110-200/month
  - Plus: Agent spawning costs ($0.050/iteration)
  - Total: ~$0.150-0.300/task + infrastructure overhead

Trigger.dev Conclusion:
  - Single-team, light workload: CLI mode is more cost-effective
  - Multi-team, scheduled jobs: Trigger.dev justified
  - Hybrid approach: Use both selectively

[DEPLOYMENT COMPARISON]
                    CLI Mode          Trigger.dev       Hybrid
===============================================================================
Setup Complexity    Minimal            High              Medium
Infrastructure      Redis only         8+ services       Selective
Initial Cost        Low                High              Medium
Per-Task Cost       Low                Medium            Variable
Scaling             Per-iteration      Multi-worker      On-demand
Persistence         Redis (ephemeral)  PostgreSQL        Both
Webhook Support     No                 Yes               Yes
Dashboard           No                 Yes               Yes
Cron/Scheduled      No                 Yes               Yes
HA/Redundancy       No                 Yes (configurable) Yes
Multi-Team          No                 Yes               Yes
Audit Trail         Limited            Comprehensive     Comprehensive

================================================================================
PART 2: TRIGGER.DEV EXECUTION FLOW
================================================================================

[USER INVOCATION PATTERNS]

Pattern 1: Webhook Event Trigger
  External Service (GitHub, Slack, etc.)
    ↓ (HTTP POST)
  Trigger.dev Webhook Endpoint
    ↓
  Event added to job queue
    ↓
  Background workers process job
    ↓
  Agent containers spawned as needed
    ↓
  Results stored in PostgreSQL
    ↓
  User views via dashboard

Pattern 2: Slash Command Integration (CLI Bridge Mode)
  /cfn-loop-trigger "task" --mode=standard --env=trigger
    ↓
  Main Chat invokes Trigger.dev API
    ↓
  Trigger.dev queues job
    ↓
  [same as Pattern 1 from queue onward]

Pattern 3: Scheduled Job (Cron-Based)
  Cron schedule (e.g., daily at 9:00 AM)
    ↓
  Trigger.dev scheduler fires event
    ↓
  Job added to queue
    ↓
  [same as Pattern 1 from queue onward]

[TRIGGER.DEV SYSTEM ARCHITECTURE]

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Docker Network: trigger-cfn-network                                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐   │
│ │ DATA PERSISTENCE LAYER                                          │   │
│ │                                                                 │   │
│ │  ┌──────────────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│ │  │ PostgreSQL           │  │ Redis        │  │ MinIO        │ │   │
│ │  │ (job metadata,       │  │ (job queue,  │  │ (artifacts,  │ │   │
│ │  │  org, projects)      │  │  cache)      │  │  logs)       │ │   │
│ │  └──────────────────────┘  └──────────────┘  └──────────────┘ │   │
│ │                                                                 │   │
│ │  ┌──────────────────────────────────────────────────────────┐ │   │
│ │  │ ClickHouse (optional - real-time analytics)              │ │   │
│ │  └──────────────────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐   │
│ │ COORDINATION LAYER                                              │   │
│ │                                                                 │   │
│ │  ┌──────────────────────────────────────────────────────────┐ │   │
│ │  │ Trigger.dev Webapp (trigger-webapp)                      │ │   │
│ │  │ - Dashboard (job status, execution history)              │ │   │
│ │  │ - API (job creation, status queries)                     │ │   │
│ │  │ - Webhook endpoints (external event intake)              │ │   │
│ │  └──────────────────────────────────────────────────────────┘ │   │
│ │                                                                 │   │
│ │  ┌──────────────────────────────────────────────────────────┐ │   │
│ │  │ Socket.io Proxy (socket-proxy)                           │ │   │
│ │  │ - Real-time updates to dashboard                         │ │   │
│ │  │ - Container runtime isolation                            │ │   │
│ │  └──────────────────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐   │
│ │ ORCHESTRATION LAYER                                             │   │
│ │                                                                 │   │
│ │  ┌──────────────────────────────────────────────────────────┐ │   │
│ │  │ Trigger Worker Pool (trigger-worker)                     │ │   │
│ │  │ - Claims jobs from queue                                 │ │   │
│ │  │ - Manages agent spawning                                 │ │   │
│ │  │ - Coordinates CFN Loop execution                         │ │   │
│ │  │ - Reports results to PostgreSQL                          │ │   │
│ │  │                                                           │ │   │
│ │  │ (Can scale to multiple worker containers)               │ │   │
│ │  └──────────────────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐   │
│ │ AGENT EXECUTION LAYER (Dynamic)                                │   │
│ │                                                                 │   │
│ │  ┌──────────────────────────────────────────────────────────┐ │   │
│ │  │ Agent Containers (spawned on-demand by workers)          │ │   │
│ │  │ - cfn-agent-loop3-1 (Loop 3 implementation)              │ │   │
│ │  │ - cfn-agent-loop3-2 (Loop 3 implementation)              │ │   │
│ │  │ - cfn-agent-loop2-1 (Loop 2 validation)                 │ │   │
│ │  │ - (More containers added as needed)                      │ │   │
│ │  │                                                           │ │   │
│ │  │ Network: cfn-network (internal Docker network)           │ │   │
│ │  │ Communication: Redis coordination within same network    │ │   │
│ │  └──────────────────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

[DOCKER SERVICE DISCOVERY]

Service Names (internal Docker DNS):
  ├─ postgres: Database service (port 5432 internal)
  ├─ redis: Job queue and coordination (port 6379 internal)
  ├─ minio: S3-compatible artifact storage (port 9000)
  ├─ clickhouse: Analytics (port 8123)
  ├─ trigger-webapp: Web dashboard (port 3040)
  ├─ trigger-worker: Background job executor (no external port)
  └─ socket-proxy: Docker API access (internal)

Port Mapping (external access):
  Mapping      Port    Service              Accessible Via
  ──────────────────────────────────────────────────────────────────
  3040:3040   3040    trigger-webapp       http://localhost:3040
  5432:5432   5432    postgres             localhost:5432
  6379:6379   6379    redis                localhost:6379
  9000:9000   9000    minio                localhost:9000 (MinIO UI)
  9001:9001   9001    minio                localhost:9001 (API)
  8123:8123   8123    clickhouse           localhost:8123

[ENVIRONMENT VARIABLE INJECTION]

Trigger Worker receives:
  ├─ TRIGGER_API_KEY=tr_dev_... (authentication)
  ├─ TRIGGER_API_URL=http://trigger-webapp:3000 (internal)
  ├─ DATABASE_URL=postgresql://postgres:password@postgres:5432/trigger
  ├─ REDIS_URL=redis://redis:6379
  ├─ CFN_TASK_ID=<job-id> (from queue)
  ├─ CFN_ITERATION=<iteration-number>
  ├─ CFN_MODE=standard (quality gate)
  ├─ COMPOSE_PROJECT_NAME=trigger-cfn (Docker network isolation)
  ├─ DOCKER_HOST=unix:///var/run/docker.sock (agent spawning)
  └─ WORKSPACE_PATH=/workspace (mounted volume)

Agent Container receives (spawned by worker):
  ├─ CFN_TASK_ID=<job-id>
  ├─ CFN_AGENT_TYPE=<type> (e.g., backend-developer)
  ├─ CFN_ITERATION=<number>
  ├─ CFN_MODE=standard
  ├─ REDIS_HOST=redis (service discovery)
  ├─ REDIS_PORT=6379
  ├─ WORKSPACE_PATH=/workspace
  ├─ TASK_DESCRIPTION=<text>
  └─ PROVIDER=kimi (AI provider)

[TRIGGER.DEV EXECUTION FLOW - DETAILED]

Step 1: Event Entry
  Source: Webhook POST / Cron trigger / API call
  Action: Event serialized to job structure
  Storage: Added to PostgreSQL jobs table
  Queue: Redis job queue receives job reference

Step 2: Worker Claims Job
  Worker: Background worker container
  Action: Atomic RPOP from Redis job queue
  Storage: Updates PostgreSQL job status → "processing"
  Dashboard: Real-time update via socket.io

Step 3: Worker Analyzes Task
  Input: Job payload (task description, files, parameters)
  Action: Parse requirements, determine agent types needed
  Decision: Single agent vs CFN Loop multi-agent workflow

Step 4: Worker Spawns Agents
  Method: Docker API to socket-proxy
  Parameters: Memory limits, network, environment variables
  Orchestration: Wave-based spawning (similar to CLI mode)
  Tracking: Job state updates after each agent spawn

Step 5: Agent Execution
  Agent: Spawned container with CFN task
  Communication: Redis coordination with worker
  Work: Implementation, testing, review per CFN Loop
  Reporting: Completion signal to worker via Redis

Step 6: Worker Processes Results
  Input: Agent completion signal
  Action: Collect results from agent containers
  Storage: Update PostgreSQL with results and artifacts
  Cleanup: Remove completed agent containers

Step 7: Job Completion
  Update: PostgreSQL job status → "completed" / "failed"
  Artifacts: Stored in MinIO for dashboard access
  Webhook: POST result to external webhook if configured
  Dashboard: Final status visible in job execution view

[COMPARISON: CLI MODE VS TRIGGER.DEV EXECUTION]

Aspect                CLI Mode              Trigger.dev
──────────────────────────────────────────────────────────────────────────
Entry Point           /cfn-loop-cli         Webhook / Cron / API
Invocation Model      Synchronous           Asynchronous
User Wait Time        During execution      Optional (dashboard)
Status Visibility     Main Chat logs        Dashboard + real-time
Persistence           Redis (ephemeral)     PostgreSQL (permanent)
Audit Trail           Limited               Comprehensive
Retry Mechanism       Manual                Automatic (configurable)
Webhook Output        No                    Yes
Scheduled Tasks       No                    Yes
Max Parallel Agents   Resource-limited      Worker pool size
Cost Model            Per-iteration         Infrastructure + iteration

================================================================================
PART 3: PROVIDER ROUTING SYSTEM
================================================================================

[PROVIDER SELECTION IN TRIGGER.DEV CONTEXT]

Same providers as CLI mode, configured at multiple levels:

Level 1: Global Configuration (all workers, all jobs)
  Location: .env file (TRIGGER_DEFAULT_PROVIDER)
  Scope: All spawned agents
  Example: TRIGGER_DEFAULT_PROVIDER=kimi

Level 2: Job Configuration (specific job)
  Location: Job definition in trigger.dev API
  Scope: Single job invocation
  Example: spawn job with provider override

Level 3: Worker Configuration (specific worker container)
  Location: Worker environment variables
  Scope: All jobs processed by that worker
  Example: Multiple workers with different providers

Level 4: Agent Configuration (inherits from job/worker)
  Location: Agent container environment
  Scope: Single agent execution
  Example: Agent receives PROVIDER env var

[PROVIDER CONFIGURATION PATTERNS]

1. GLOBAL PROVIDER (ALL JOBS):
   ```.env
   TRIGGER_DEFAULT_PROVIDER=kimi
   CFN_CUSTOM_ROUTING=true
   ```

2. JOB-SPECIFIC PROVIDER (OVERRIDE):
   ```javascript
   // When creating job via API
   const job = await client.jobs.create({
     type: "cfn-loop",
     payload: { taskId: "task-123" },
     provider: "max",  // Override global setting
   });
   ```

3. WORKER-SPECIFIC PROVIDER (MULTIPLE WORKERS):
   ```yaml
   # docker-compose.yml - Worker 1 (cost-optimized)
   trigger-worker-zai:
     environment:
       TRIGGER_DEFAULT_PROVIDER: zai

   # docker-compose.yml - Worker 2 (premium)
   trigger-worker-premium:
     environment:
       TRIGGER_DEFAULT_PROVIDER: max
   ```

4. AGENT-SPECIFIC PROVIDER (PROFILE):
   ```xml
   <!-- In agent profile -->
   <!-- PROVIDER_PARAMETERS
   provider: xai
   model: grok-beta
   -->
   ```

[PROVIDER CONFIGURATION TABLE]

Provider    | Cost/1M | Quality    | Use Case              | Trigger.dev Config
────────────┼─────────┼────────────┼───────────────────────┼──────────────────────────────
zai         | $0.50   | Standard   | Cost optimization     | TRIGGER_DEFAULT_PROVIDER=zai
kimi        | $2.00   | Mid-range  | Balanced              | TRIGGER_DEFAULT_PROVIDER=kimi
anthropic   | $15.00  | Premium    | Security/compliance   | TRIGGER_DEFAULT_PROVIDER=max
openrouter  | var.    | Variable   | Model flexibility     | TRIGGER_DEFAULT_PROVIDER=openrouter
max         | high    | Anthropic  | Highest quality       | TRIGGER_DEFAULT_PROVIDER=max
gemini      | $0.30-  | Google     | Google integrations   | TRIGGER_DEFAULT_PROVIDER=gemini
            | $1.20   |            |                       |

[ENVIRONMENT VARIABLE INJECTION - PROVIDER ROUTING]

When worker spawns agent:
  ├─ PROVIDER={value from job, worker, or global default}
  ├─ MODEL={provider-specific model}
  ├─ CFN_CUSTOM_ROUTING=true
  ├─ FALLBACK_PROVIDER=zai (automatic fallback)
  └─ AI_ENDPOINT={provider-specific API endpoint}

Fallback Behavior:
  IF provider unavailable or error rate > threshold:
    → Fallback to Z.ai + glm-4.6
    → Log provider switch event
    → Update job metadata with fallback indicator
    → Continue job execution

[PROVIDER COST TRACKING]

Trigger.dev tracks provider usage:
  ```sql
  -- Hypothetical job_executions table
  SELECT
    job_id,
    provider,
    tokens_input,
    tokens_output,
    cost,
    execution_date
  FROM job_executions
  WHERE execution_date >= DATE_TRUNC('month', NOW());
  ```

Cost Reporting:
  ├─ Per-job costs (via dashboard)
  ├─ Per-worker costs (aggregate all jobs processed)
  ├─ Per-provider costs (cost breakdown by provider)
  └─ Trend analysis (cost over time)

================================================================================
PART 4: REDIS COORDINATION PROTOCOLS
================================================================================

[TRIGGER.DEV REDIS USAGE]

Unlike CLI mode (where Redis is primary coordination):
  Trigger.dev uses Redis for:
    ✓ Job queue (background task list)
    ✓ Cache (temporary results)
    ✓ Agent coordination (worker → agent signaling)
    ✗ Persistence (PostgreSQL handles this)
    ✗ Audit trail (ClickHouse analytics)

Redis schema in Trigger.dev context:
  Key Pattern              Type    Purpose
  ──────────────────────────────────────────────────────────────
  job:queue               LIST    Pending jobs
  job:{job-id}:status     STRING  Current job status
  job:{job-id}:progress   HASH    Iteration progress
  cfn:agent:{agent-id}    HASH    Agent metadata
  cfn:worker:{worker-id}  HASH    Worker heartbeat
  task:queue              LIST    Agent task queue
  task:completed          STRING  Completed task count

[REDIS COORDINATION - MULTI-LAYER]

Layer 1: Job Queue Management (Trigger.dev ↔ Redis)
  ├─ Webapp enqueues job: LPUSH job:queue <job-id>
  ├─ Worker claims job: RPOP job:queue
  ├─ Status tracking: SET job:{job-id}:status "processing"
  └─ Completion: SET job:{job-id}:status "completed"

Layer 2: Agent Coordination (Worker ↔ Redis ↔ Agent)
  ├─ Worker queues tasks: LPUSH task:queue <task-data>
  ├─ Agent claims task: RPOP task:queue
  ├─ Progress update: HINCRBY task:completed 1
  └─ Completion signal: LPUSH cfn:worker:{id}:signals <result>

Layer 3: Real-time Updates (Worker ↔ WebSocket ↔ Dashboard)
  ├─ Worker updates progress: HSET job:{id}:progress iteration 2
  ├─ Socket.io proxy publishes update
  ├─ Dashboard receives real-time notification
  └─ User sees live progress without polling

[COMPARISON: CLI MODE VS TRIGGER.DEV REDIS USAGE]

Aspect                  CLI Mode                  Trigger.dev
──────────────────────────────────────────────────────────────────
Redis Role              Primary coordination      Secondary (caching)
Persistence             Ephemeral (session)       Persistent (PostgreSQL)
Job Queue               Transient                 Durable (PostgreSQL backup)
Agent Signaling         BLPOP blocking            RPOP + database check
Polling Interval        120 seconds               5-10 seconds (configurable)
Retry Mechanism         Manual (Main Chat)        Automatic (Trigger.dev)
Audit Trail             Limited logs              Complete history
Scaling                 Per-session               Across workers

================================================================================
PART 5: TRIGGER.DEV PROTOCOL REFERENCE
================================================================================

[JOB PAYLOAD STRUCTURE]

Trigger.dev job created for CFN Loop:
  ```json
  {
    "id": "job-123-abc-xyz",
    "type": "cfn-loop",
    "status": "queued",
    "payload": {
      "taskId": "task-123-abc",
      "description": "Implement authentication feature",
      "agentType": "backend-developer",
      "mode": "standard",
      "provider": "kimi",
      "iteration": 1,
      "maxIterations": 10
    },
    "metadata": {
      "source": "webhook",
      "triggeringEvent": "github.push",
      "organizationId": "cmi8xpmpv0002r25mzsrdbu3j",
      "projectId": "cmi8xpmpz0005r25m7no4zpht"
    },
    "createdAt": "2025-11-24T10:30:00Z",
    "startedAt": null,
    "completedAt": null,
    "results": null
  }
  ```

[WORKER STATUS UPDATES]

Worker updates job status via Trigger.dev API:
  ```json
  PUT /api/jobs/{job-id}
  {
    "status": "processing",
    "progress": {
      "iteration": 1,
      "agentsSpawned": 3,
      "agentsCompleted": 1,
      "passRate": 0.95
    },
    "lastUpdate": "2025-11-24T10:35:30Z"
  }
  ```

[AGENT COMPLETION PROTOCOL - TRIGGER.DEV MODE]

Different from CLI mode because agent signals to WORKER (not Main Chat):

Agent Completion Signal (to worker via Redis):
  ```json
  {
    "agentId": "cfn-agent-loop3-1",
    "jobId": "job-123-abc-xyz",
    "status": "completed",
    "confidence": 0.95,
    "provider": "kimi",
    "model": "claude-3.5-sonnet",
    "executionTime": 145.2,
    "tokenCount": 15420,
    "results": {
      "filesModified": ["src/auth.ts", "src/routes/login.ts"],
      "testsPassed": 34,
      "testsFailed": 0,
      "issues": []
    },
    "timestamp": "2025-11-24T10:35:30Z"
  }
  ```

Worker Processing:
  1. Receives signal via Redis: LPOP cfn:worker:{id}:signals
  2. Validates result structure
  3. Updates job progress in PostgreSQL
  4. Cleans up agent container
  5. Publishes update to dashboard via socket.io
  6. Decides next action (spawn more agents, iterate, complete)

[SIGNAL FORMAT DIFFERENCES]

CLI Mode Signal:
  ```json
  {
    "agentId": "backend-developer-1",
    "taskId": "task-123-abc",
    "status": "completed",
    "confidence": 0.95
  }
  ```
  Destination: Main Chat (redis-cli BLPOP)
  Handler: Main Chat processes and decides next step

Trigger.dev Signal:
  ```json
  {
    "agentId": "cfn-agent-loop3-1",
    "jobId": "job-123-abc-xyz",
    "status": "completed",
    "confidence": 0.95,
    "executionTime": 145.2,
    "tokenCount": 15420,
    "results": { ... }
  }
  ```
  Destination: Worker (redis LPOP cfn:worker:{id}:signals)
  Handler: Worker processes and updates database

[WEBHOOK RESPONSE PROTOCOL]

If job has webhook configured:
  ```bash
  POST {webhook_url}
  Content-Type: application/json

  {
    "jobId": "job-123-abc-xyz",
    "status": "completed",
    "payload": {
      "taskId": "task-123-abc",
      "results": {
        "filesModified": ["src/auth.ts"],
        "testsPassed": 34,
        "testsFailed": 0
      }
    },
    "completedAt": "2025-11-24T10:45:00Z",
    "duration": "15 minutes"
  }
  ```

Retry Policy:
  ├─ Attempt 1: Immediate
  ├─ Attempt 2: After 1 minute (exponential backoff)
  ├─ Attempt 3: After 4 minutes
  ├─ Attempt 4: After 16 minutes
  └─ Max: 4 retries (configurable)

================================================================================
PART 6: QUALITY GATES AND MODES
================================================================================

[MODE CONFIGURATION IN TRIGGER.DEV]

Same modes as CLI, configured via job payload:

MVP Mode:
  ├─ Loop 3 Gate: 0.70 (70% test pass rate)
  ├─ Loop 2 Consensus: 0.80 (80% validator agreement)
  ├─ Max Iterations: 5
  ├─ Use Case: Rapid prototyping, learning, cost-sensitive
  └─ Cost: Minimal (fewer validators, less testing)

Standard Mode (DEFAULT):
  ├─ Loop 3 Gate: 0.95 (95% test pass rate)
  ├─ Loop 2 Consensus: 0.90 (90% validator agreement)
  ├─ Max Iterations: 10
  ├─ Use Case: General features, balanced quality/speed
  └─ Cost: Moderate (thorough testing, multiple validators)

Enterprise Mode:
  ├─ Loop 3 Gate: 0.98 (98% test pass rate)
  ├─ Loop 2 Consensus: 0.95 (95% validator agreement)
  ├─ Max Iterations: 15
  ├─ Use Case: Security-critical, compliance-required
  └─ Cost: High (extensive testing, senior validators)

[MODE CONFIGURATION PATTERNS]

1. Global Mode (all jobs):
   ```yaml
   # .env
   CFN_DEFAULT_MODE=standard
   ```

2. Job-Specific Mode:
   ```javascript
   const job = await client.jobs.create({
     mode: "enterprise",
     payload: { ... }
   });
   ```

3. Scheduled Job with Mode:
   ```javascript
   const schedule = await client.schedules.create({
     cron: "0 9 * * 1",  // Every Monday at 9 AM
     payload: { taskDescription: "Weekly audit" },
     mode: "enterprise"
   });
   ```

[TEST EXECUTION IN TRIGGER.DEV]

Similar to CLI mode, but managed by worker:

Test Execution Flow:
  1. Agent completes task (implements feature)
  2. Agent runs tests (npm test)
  3. Agent reports results to worker via Redis
  4. Worker validates test results
  5. Worker checks against gate threshold
  6. IF gate passes: Proceed to Loop 2 (validators)
  7. IF gate fails: Queue for next iteration

Gate Check Logic:
  ```javascript
  const passRate = testsPassed / totalTests;
  const gateThreshold = modeConfig[mode].loop3Gate;

  if (passRate >= gateThreshold) {
    // Proceed to Loop 2
    await spawnValidators();
  } else {
    // Iterate
    await queueForNextIteration();
  }
  ```

[ITERATION TRACKING]

Trigger.dev tracks iterations in database:
  ```sql
  CREATE TABLE job_iterations (
    id UUID PRIMARY KEY,
    job_id UUID,
    iteration_number INTEGER,
    test_pass_rate DECIMAL(5,4),
    gate_passed BOOLEAN,
    agents_count INTEGER,
    duration_seconds INTEGER,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
  );
  ```

Iteration Metrics Available:
  ├─ Test pass rate per iteration
  ├─ Agent count per iteration
  ├─ Execution time per iteration
  ├─ Gate pass/fail status
  ├─ Provider and model used
  └─ Cost per iteration

[COMPARISON: CLI MODE VS TRIGGER.DEV QUALITY GATES]

Aspect              CLI Mode              Trigger.dev
─────────────────────────────────────────────────────────────
Gate Tracking       Main Chat logs        PostgreSQL (searchable)
Iteration History   Session-only          Permanent audit trail
Gate Thresholds     Fixed per mode        Per-job configurable
Automatic Retry     No                    Yes (configurable)
Visual Progress     Terminal output       Dashboard (real-time)
Export Metrics      Manual                Automatic (API)
Aggregated Stats    Not available         Yes (cross-job analysis)

================================================================================
PART 7: MULTI-WORKTREE DOCKER ISOLATION
================================================================================

[MULTI-WORKER ORCHESTRATION]

Trigger.dev supports multiple persistent workers:

Architecture:
  ```
  Job Queue (PostgreSQL)
    ├─ trigger-worker-1 (Worker Container 1)
    │   ├─ Claims job-123
    │   ├─ Spawns agents via socket-proxy-1
    │   └─ Reports results
    │
    ├─ trigger-worker-2 (Worker Container 2)
    │   ├─ Claims job-456
    │   ├─ Spawns agents via socket-proxy-2
    │   └─ Reports results
    │
    └─ trigger-worker-N (Worker Container N)
        ├─ Claims job-XYZ
        ├─ Spawns agents via socket-proxy-N
        └─ Reports results
  ```

Benefits:
  ✅ Parallel job processing (3+ jobs simultaneously)
  ✅ Fault isolation (one worker crash doesn't affect others)
  ✅ Resource allocation (different workers for different job types)
  ✅ Provider diversity (Worker 1 uses kimi, Worker 2 uses max)
  ✅ Scaling (add workers for increased throughput)

[DOCKER NETWORK ISOLATION]

Each worker gets isolated Docker socket:
  ```yaml
  # docker-compose.yml
  services:
    socket-proxy-1:
      image: tecnativa/docker-socket-proxy
      environment:
        NETWORKS: 1        # Allow network creation
        CONTAINERS: 1
        SERVICES: 1
      volumes:
        - /var/run/docker.sock:/var/run/docker.sock:ro

    socket-proxy-2:
      image: tecnativa/docker-socket-proxy
      environment:
        NETWORKS: 1
        CONTAINERS: 1
        SERVICES: 1
      volumes:
        - /var/run/docker.sock:/var/run/docker.sock:ro
  ```

Docker Network Isolation:
  ├─ Network 1: trigger-cfn-network (shared infrastructure)
  ├─ Network 2: cfn-network-worker-1 (Worker 1 agents)
  ├─ Network 3: cfn-network-worker-2 (Worker 2 agents)
  └─ Network N: cfn-network-worker-N (Worker N agents)

Agent Network Assignment:
  ```bash
  # Worker 1 spawns agents in cfn-network-worker-1
  docker network create cfn-network-worker-1
  docker run --network cfn-network-worker-1 cfn-agent:latest

  # Worker 2 spawns agents in cfn-network-worker-2
  docker network create cfn-network-worker-2
  docker run --network cfn-network-worker-2 cfn-agent:latest
  ```

Service Discovery Within Each Network:
  ```bash
  # Worker 1 agents can reach Redis via network name
  # (Redis is on trigger-cfn-network, agents must bridge)

  # Options:
  # 1. Redis accessible from both networks (expose port)
  # 2. Worker has Redis sidecar
  # 3. Redis exposed as external service
  ```

[ENVIRONMENT INJECTION FOR WORKERS]

Each worker receives environment isolation:
  ```yaml
  trigger-worker-1:
    environment:
      WORKER_ID: worker-1
      TRIGGER_API_KEY: ${TRIGGER_API_KEY}
      CFN_DEFAULT_PROVIDER: kimi
      DOCKER_HOST: unix:///var/run/docker.sock-1
      WORKER_NETWORK: cfn-network-worker-1
      AGENT_IMAGE: cfn-agent:latest-kimi

  trigger-worker-2:
    environment:
      WORKER_ID: worker-2
      TRIGGER_API_KEY: ${TRIGGER_API_KEY}
      CFN_DEFAULT_PROVIDER: max
      DOCKER_HOST: unix:///var/run/docker.sock-2
      WORKER_NETWORK: cfn-network-worker-2
      AGENT_IMAGE: cfn-agent:latest-premium
  ```

[PORT ALLOCATION STRATEGY]

Unlike CLI mode (worktrees with offsets), Trigger.dev uses persistent infrastructure:

External Port Mapping:
  Service            Port    Purpose
  ───────────────────────────────────────────────────
  trigger-webapp     3040    Dashboard (single instance)
  postgres           5432    Database (single instance)
  redis              6379    Queue (single instance)
  minio              9000    S3 API (single instance)
  minio-ui           9001    MinIO UI (single instance)
  clickhouse         8123    Analytics (single instance)

Internal Networks (isolated):
  Network Name                Purpose
  ──────────────────────────────────────────────────
  trigger-cfn-network         Shared infrastructure
  cfn-network-worker-1        Worker 1 agents
  cfn-network-worker-2        Worker 2 agents
  cfn-network-worker-N        Worker N agents

[MULTI-TEAM ISOLATION]

Trigger.dev natively supports multi-team via organizations:

Organization Isolation:
  ```
  Organization 1 (Team A)
    ├─ Projects: 3
    ├─ Jobs: 150+
    ├─ Users: 5
    └─ Data: Isolated via org_id in PostgreSQL

  Organization 2 (Team B)
    ├─ Projects: 2
    ├─ Jobs: 80+
    ├─ Users: 3
    └─ Data: Isolated via org_id in PostgreSQL
  ```

Database-Level Isolation:
  ```sql
  -- Org 1 can only see their jobs
  SELECT * FROM jobs WHERE organization_id = 'org-123';

  -- Org 2 can only see their jobs
  SELECT * FROM jobs WHERE organization_id = 'org-456';
  ```

Dashboard Isolation:
  ├─ Each org has separate login
  ├─ Each org sees only their jobs/projects
  ├─ Each org has own webhook endpoints
  └─ Cost tracking per organization

================================================================================
PART 8: PERFORMANCE OPTIMIZATION
================================================================================

[EXECUTION SPEED COMPARISON]

CLI Mode:
  Startup: 5-10 seconds (agent container spawn)
  Execution: Per-task (typically 2-10 minutes)
  Total: 5-10 + execution time
  Parallel: Resource-limited (per Main Chat session)

Trigger.dev:
  Startup: Already running (worker pool exists)
  Execution: Per-task (typically 2-10 minutes)
  Total: 1-2 seconds (instant job queue)
  Parallel: Multi-worker (10+ simultaneous jobs)

Speed Advantage: Trigger.dev 10-20x faster for first job (no startup)

[RESOURCE UTILIZATION]

CLI Mode Resource Usage:
  Main Chat: Variable (coordinating agents)
  Redis: 50-100MB
  Per Agent: 512MB-1GB (variable)
  Total: ~1-2GB for typical task

Trigger.dev Resource Usage:
  PostgreSQL: 200-500MB (persistent)
  Redis: 100-200MB (larger queue)
  MinIO: 100-500MB (artifacts)
  ClickHouse: 200-400MB (optional analytics)
  Per Worker: 512MB-1GB
  Per Agent: 512MB-1GB (same as CLI)
  Total: ~2-3GB baseline + worker/agent scaling

Optimization Strategies:
  ├─ Worker connection pooling (PostgreSQL)
  ├─ Redis key expiration (TTL cleanup)
  ├─ MinIO artifact compression
  ├─ ClickHouse data partitioning
  └─ Agent image layer caching

[COST OPTIMIZATION]

CLI Mode Cost:
  ├─ Agent execution: $0.050/iteration
  ├─ Infrastructure: ~$10/month (Redis)
  └─ Total: ~$0.050-0.200/task + $10/month fixed

Trigger.dev Cost (for comparison):
  ├─ Agent execution: $0.050/iteration
  ├─ Infrastructure: ~$150-200/month
  ├─ Cost per job: Infrastructure / job count
  └─ Breakeven: ~3,000-4,000 jobs/month

Cost Optimization Recommendations:
  - CLI Mode: Best for <500 jobs/month
  - Trigger.dev: Best for >2,000 jobs/month
  - Hybrid: Use both selectively

[SCALING PATTERNS]

CLI Mode Scaling:
  Per-Session Limit: 50-100 concurrent tasks (resource-limited)
  Scaling Strategy: Sequential sessions (one at a time)
  Maximum Throughput: ~5 tasks/minute (task startup overhead)

Trigger.dev Scaling:
  Per-Worker Limit: 5-10 concurrent jobs
  Multi-Worker: 2-10 workers (configurable)
  Maximum Throughput: 50+ jobs/minute (persistent worker pool)
  Horizontal Scaling: Add more workers/resources as needed

================================================================================
PART 9: COMMON USE CASES AND PATTERNS
================================================================================

[USE CASE 1: INTERACTIVE DEVELOPMENT]

Scenario: Developer building a feature, needs fast feedback

CLI Mode (Recommended):
  ```bash
  /cfn-loop-cli "Implement JWT auth with tests" --mode=standard
  # Completes in ~5 minutes, cost < $0.10
  ```

Trigger.dev: Not recommended (infrastructure overhead)

Key Points:
  - CLI mode fast startup (seconds)
  - Direct Main Chat feedback
  - No infrastructure overhead
  - Cost-efficient for single developer

[USE CASE 2: SCHEDULED BATCH PROCESSING]

Scenario: Daily TypeScript error fix, cron-triggered

Trigger.dev (Recommended):
  ```javascript
  // Define scheduled job
  const schedule = await client.schedules.create({
    name: "Daily TypeScript Fixes",
    cron: "0 2 * * *",  // 2 AM daily
    payload: {
      taskDescription: "Fix all TypeScript errors",
      mode: "standard"
    },
    organization: "team-a"
  });
  ```

CLI Mode: Not suitable (requires manual invocation)

Key Points:
  - Trigger.dev handles cron scheduling
  - Persistent job history
  - No manual intervention required
  - Dashboard shows all historical executions

[USE CASE 3: WEBHOOK-DRIVEN AUTOMATION]

Scenario: GitHub push → Auto-review code

Trigger.dev (Recommended):
  ```javascript
  // GitHub webhook triggers Trigger.dev endpoint
  POST /webhooks/github
  {
    "action": "opened",
    "pull_request": { "number": 123 }
  }

  // Trigger.dev queues job
  {
    "type": "code-review",
    "payload": {
      "prNumber": 123,
      "taskDescription": "Review PR #123"
    }
  }
  ```

CLI Mode: Would require intermediate service

Key Points:
  - Trigger.dev provides webhook endpoint
  - Automatic job queuing
  - No intermediate orchestration needed
  - Multi-team support via org routing

[USE CASE 4: COST-OPTIMIZED BATCH PROCESSING]

Scenario: Process 1,000 files, optimize cost

Trigger.dev + CLI Mode (Hybrid):
  - Use Trigger.dev for job coordination
  - Spawn agents via CLI mode within job
  - Combines persistence + efficiency

Configuration:
  ```javascript
  // Trigger.dev job
  const job = await client.jobs.create({
    type: "batch-processing",
    payload: {
      files: [...1000 files...],
      batchSize: 50
    }
  });

  // Within job, use CLI mode for agents
  for (const batch of batches) {
    await exec("/cfn-loop-cli 'process batch' --provider=zai");
  }
  ```

Key Points:
  - Job history via Trigger.dev
  - Cost optimization via CLI mode providers
  - Flexibility of hybrid approach

[USE CASE 5: PRODUCTION COMPLIANCE AUDIT]

Scenario: Security audit, comprehensive logging, compliance

Trigger.dev (Recommended):
  ```javascript
  const job = await client.jobs.create({
    type: "security-audit",
    mode: "enterprise",  // Highest quality gate
    payload: {
      taskDescription: "Security audit of production code",
      organization: "team-a"
    },
    webhooks: [{
      url: "https://compliance-service/audit-results"
    }]
  });
  ```

Advantages:
  ✅ Enterprise mode (0.98 gate, 0.95 consensus)
  ✅ Comprehensive audit trail (PostgreSQL)
  ✅ Webhook to compliance system
  ✅ Dashboard shows all historical audits
  ✅ ClickHouse analytics for compliance reporting
  ✅ Multi-team isolation

[USE CASE 6: MULTI-TEAM FEATURE DELIVERY]

Scenario: 5 teams working on different features

Trigger.dev (Recommended):
  ```yaml
  Organizations:
    - Team A (Frontend): auth, UI components
    - Team B (Backend): API, database
    - Team C (Mobile): iOS/Android
    - Team D (DevOps): Infrastructure
    - Team E (QA): Testing automation

  Trigger.dev Configuration:
    - Single deployment (all teams use same infrastructure)
    - Org-level isolation (each team sees only their jobs)
    - Shared resource pool (workers process all team jobs)
    - Cost visibility (breakdown per team/project)
  ```

Key Points:
  - Single infrastructure for all teams
  - Database-level team isolation
  - Shared worker pool (cost-efficient)
  - Dashboard per team

================================================================================
PART 10: MIGRATION AND COMPATIBILITY
================================================================================

[MIGRATION PATHS]

Path 1: CLI Mode Only (Current State)
  Setup: Redis + CLI tools
  Migration: None needed
  Best For: Single developer, light workload

Path 2: CLI Mode → Trigger.dev (Growth Path)
  Step 1: Deploy Trigger.dev infrastructure
  Step 2: Migrate jobs to Trigger.dev
  Step 3: Decommission CLI mode (optional, can coexist)
  Timeline: 2-4 weeks
  Effort: Medium (infrastructure + migration)

Path 3: CLI Mode + Trigger.dev (Hybrid)
  Setup: Both running simultaneously
  Usage: CLI for interactive, Trigger.dev for batch/scheduled
  Best For: Mixed workloads, cost optimization
  Timeline: Immediate (no migration needed)
  Effort: Low (just deploy Trigger.dev)

[COMPATIBILITY MATRIX]

Component                CLI Mode    Trigger.dev    Hybrid
─────────────────────────────────────────────────────────────
Agent Containers         ✅          ✅             ✅
CFN Loop (Loops 0-4)     ✅          ✅             ✅
Redis Coordination       ✅          ✅             ✅
Quality Gates            ✅          ✅             ✅
Provider Routing         ✅          ✅             ✅
Main Chat Integration    ✅          ✅             ✅
Webhook Triggers         ✗           ✅             ✅
Scheduled Jobs           ✗           ✅             ✅
Persistent History       Limited     ✅             ✅
Dashboard Visibility     ✗           ✅             ✅
Multi-Team Support       ✗           ✅             ✅

[AGENT COMPATIBILITY]

Agents work identically in CLI mode and Trigger.dev:
  ├─ Agent code: No changes required
  ├─ Environment variables: Same (with Trigger.dev additions)
  ├─ Task execution: Identical
  ├─ Results reporting: Same Redis protocol
  └─ Exit codes: Unchanged

Trigger.dev-specific additions (optional):
  ├─ Job metadata (job ID, iteration count)
  ├─ Extended metrics (execution time, token count)
  └─ Webhook results (external service integration)

[REDIS PROTOCOL COMPATIBILITY]

CLI Mode Signal:
  ```json
  {
    "agentId": "backend-developer-1",
    "taskId": "task-123-abc",
    "status": "completed",
    "confidence": 0.95
  }
  ```

Trigger.dev Signal (backward-compatible superset):
  ```json
  {
    "agentId": "backend-developer-1",
    "taskId": "task-123-abc",
    "status": "completed",
    "confidence": 0.95,
    "jobId": "job-123-xyz",        // NEW
    "executionTime": 145.2,         // NEW
    "tokenCount": 15420             // NEW
  }
  ```

Compatibility Note: CLI agents can send either format

================================================================================
PART 11: TROUBLESHOOTING AND DEBUGGING
================================================================================

[COMMON ISSUES AND RESOLUTIONS]

Issue 1: Agent Container Network Connectivity
  Symptom: Agent cannot reach Redis ("Connection refused")
  Cause: Agent on cfn-network, Redis on trigger-cfn-network
  Solution:
    - Verify agent network: docker inspect <agent-id> | grep NetworkMode
    - Check Redis network: docker inspect trigger-dev-redis | grep Networks
    - Reconnect agent to redis service (via docker-compose network)

Issue 2: Worker Not Processing Jobs
  Symptom: Jobs remain in "queued" status
  Cause: Worker crashed, not running, or queue permission issue
  Solution:
    - Check worker status: docker-compose ps trigger-worker
    - Check worker logs: docker-compose logs trigger-worker
    - Verify queue connection: docker-compose exec trigger-worker redis-cli ping
    - Restart worker: docker-compose restart trigger-worker

Issue 3: Agent Container Spawn Fails
  Symptom: Worker log shows "Failed to spawn agent"
  Cause: Docker socket permission, image not found, or resource limit
  Solution:
    - Verify docker socket access: ls -la /var/run/docker.sock
    - Check image exists: docker images | grep cfn-agent
    - Monitor resource usage: docker stats
    - Increase memory limit if needed

Issue 4: PostgreSQL Connection Errors
  Symptom: "FATAL: password authentication failed"
  Cause: Wrong credentials, container not running, or port conflict
  Solution:
    - Check Postgres running: docker-compose ps postgres
    - Verify credentials in .env match postgres config
    - Test connection: psql -h localhost -U postgres -d trigger
    - Clear database if needed: docker-compose down -v postgres

Issue 5: Job Webhook Delivery Fails
  Symptom: Webhook status "failed", retrying indefinitely
  Cause: Invalid webhook URL, endpoint returning error, or timeout
  Solution:
    - Verify webhook URL is accessible: curl <webhook-url>
    - Check webhook response: Check Trigger.dev webhook logs
    - Increase timeout if needed (job config)
    - Update webhook URL if moved

[DEBUG MODE PROCEDURES]

Enable Debug Logging:
  ```bash
  # Environment variables for verbose logging
  DEBUG=trigger:*
  LOG_LEVEL=debug
  REDIS_DEBUG=true
  ```

Trace Workflow Execution:
  ```bash
  # Monitor Redis activity
  redis-cli MONITOR | tee workflow-trace.log

  # Monitor Docker container lifecycle
  docker events --filter "type=container" | grep cfn-agent

  # Monitor worker job processing
  docker-compose logs -f trigger-worker | grep -E "(claimed|started|completed)"
  ```

Inspect Job State:
  ```bash
  # Check job in PostgreSQL
  docker-compose exec postgres psql -U postgres -d trigger -c \
    "SELECT id, status, created_at FROM jobs WHERE id = 'job-123';"

  # Check Redis job queue
  redis-cli LRANGE job:queue 0 -1

  # Check job progress
  redis-cli HGETALL job:job-123:progress
  ```

[RECOVERY PROCEDURES]

Stuck Job Recovery:
  ```bash
  # 1. Identify stuck job
  docker-compose exec postgres psql -U postgres -d trigger -c \
    "SELECT id, status FROM jobs WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '30 minutes';"

  # 2. Cancel job
  docker-compose exec postgres psql -U postgres -d trigger -c \
    "UPDATE jobs SET status = 'cancelled' WHERE id = 'job-123';"

  # 3. Clean up associated agents
  docker ps -a --filter "label=job-id=job-123" -q | xargs docker rm -f

  # 4. Retry job (if configured)
  curl -X POST http://localhost:3000/api/jobs/job-123/retry
  ```

Worker Crash Recovery:
  ```bash
  # 1. Check worker status
  docker-compose ps trigger-worker

  # 2. View crash logs
  docker-compose logs trigger-worker --tail=100

  # 3. Restart worker
  docker-compose restart trigger-worker

  # 4. Requeue failed jobs
  docker-compose exec postgres psql -U postgres -d trigger -c \
    "UPDATE jobs SET status = 'queued' WHERE status = 'failed' AND worker_id = 'worker-crashed';"
  ```

Mass Failure Recovery:
  ```bash
  # 1. Stop all components
  docker-compose down

  # 2. Check data integrity
  docker-compose up -d postgres
  docker-compose exec postgres pg_dump -U postgres trigger > backup.sql

  # 3. Restart infrastructure
  docker-compose up -d

  # 4. Requeue all failed jobs
  docker-compose exec postgres psql -U postgres -d trigger -c \
    "UPDATE jobs SET status = 'queued', worker_id = NULL WHERE status IN ('processing', 'failed');"
  ```

================================================================================
PART 12: SECURITY AND COMPLIANCE
================================================================================

[ENVIRONMENT ISOLATION]

Network Isolation:
  ```bash
  # Shared infrastructure network (trigger services)
  docker network create trigger-cfn-network

  # Worker-specific agent networks (isolation)
  docker network create cfn-network-worker-1
  docker network create cfn-network-worker-2
  ```

Container Isolation:
  ```bash
  # Agent containers run with constraints
  docker run \
    --memory=4g \
    --memory-swap=4g \
    --cpus=2 \
    --read-only \
    --tmpfs /tmp \
    cfn-agent:latest
  ```

Database Access Control:
  ```sql
  -- Create restricted user for workers
  CREATE USER cfn_worker WITH PASSWORD 'secure-password';
  GRANT SELECT, INSERT, UPDATE ON jobs TO cfn_worker;
  GRANT SELECT ON organizations, projects TO cfn_worker;

  -- Prevent org-crossing queries
  CREATE POLICY org_isolation ON jobs
    USING (organization_id = current_setting('app.current_org'));
  ```

[PROVIDER SECURITY COMPLIANCE]

Z.ai Security:
  ├─ Enterprise-grade encryption
  ├─ SOC 2 Type II compliant
  ├─ GDPR compliant
  ├─ No data retention beyond processing
  └─ Cost-optimized without security compromise

Anthropic/Max Security:
  ├─ Industry-leading security standards
  ├─ Advanced threat detection
  ├─ Enterprise data protection
  ├─ Regulatory compliance support (HIPAA, FedRAMP)
  └─ Highest quality but premium cost

Kimi Security:
  ├─ Standard API authentication
  ├─ Request/response logging
  ├─ Privacy-focused
  └─ Suitable for non-sensitive development

[PROTOCOL SECURITY]

Redis Communication (Internal):
  ```bash
  # Disable external access
  # Only accessible within Docker network
  # No authentication needed (network-isolated)
  ```

Agent-to-Worker Communication:
  ```bash
  # Agents in isolated networks
  # Worker accesses Redis via internal Docker DNS
  # Results encrypted (optional, via TLS)
  ```

Webhook Communication (External):
  ```bash
  # HTTPS only (enforced in production)
  # Signature verification (SHA256 HMAC)
  # Retry with exponential backoff
  # Webhook delivery logs in PostgreSQL
  ```

[AUDIT AND COMPLIANCE]

Comprehensive Audit Trail:
  ```sql
  -- Job execution history
  SELECT id, organization_id, status, started_at, completed_at
  FROM jobs
  WHERE organization_id = 'org-123'
  ORDER BY created_at DESC;

  -- Agent execution tracking
  SELECT job_id, agent_id, provider, tokens_used, cost
  FROM job_executions
  WHERE created_at >= DATE_TRUNC('month', NOW());

  -- Webhook delivery log
  SELECT job_id, webhook_url, status, response_code, attempts
  FROM webhook_deliveries
  WHERE delivery_time >= NOW() - INTERVAL '7 days';
  ```

Compliance Reporting:
  ├─ Cost breakdown per team/org
  ├─ Provider usage statistics
  ├─ Test pass rates (quality metrics)
  ├─ Execution time analysis
  └─ Security event logs (auth failures, access denials)

================================================================================
PART 13: API REFERENCE
================================================================================

[WEBHOOK INTERFACE]

Register Webhook:
  ```bash
  POST /api/webhooks
  Content-Type: application/json

  {
    "organizationId": "org-123",
    "url": "https://external-service/callback",
    "events": ["job.completed", "job.failed"],
    "retryPolicy": {
      "maxRetries": 4,
      "backoff": "exponential"
    }
  }
  ```

Webhook Payload (on event):
  ```json
  {
    "event": "job.completed",
    "jobId": "job-123-abc",
    "status": "completed",
    "payload": {
      "taskId": "task-123",
      "results": {...}
    },
    "timestamp": "2025-11-24T10:45:00Z"
  }
  ```

[ENVIRONMENT VARIABLES TABLE]

Category              Variable Name                  Type      Default
──────────────────────────────────────────────────────────────────────────
TRIGGER.DEV CONFIG
                     TRIGGER_API_KEY               string    (required)
                     TRIGGER_API_URL               string    http://localhost:3000
                     TRIGGER_SELF_HOSTED           bool      true
                     TRIGGER_ORG_SLUG              string    (required)
                     TRIGGER_PROJECT_SLUG          string    (required)

DATABASE
                     DATABASE_URL                  string    (required)
                     DATABASE_POOL_SIZE            number    20
                     DATABASE_SSL                  bool      false

REDIS
                     REDIS_URL                     string    redis://redis:6379
                     REDIS_PASSWORD                string    (optional)
                     REDIS_TTL_SECONDS             number    86400

CFN LOOP
                     CFN_DEFAULT_MODE              string    standard
                     CFN_DEFAULT_PROVIDER          string    kimi
                     CFN_CUSTOM_ROUTING            bool      true
                     CFN_MAX_ITERATIONS            number    10

WORKER CONFIG
                     WORKER_ID                     string    auto-generated
                     CFN_WORKER_CONCURRENCY        number    5
                     AGENT_IMAGE                   string    cfn-agent:latest

STORAGE (MinIO)
                     MINIO_ROOT_USER               string    minioadmin
                     MINIO_ROOT_PASSWORD           string    (required)
                     MINIO_ENDPOINT                string    minio:9000

LOGGING
                     LOG_LEVEL                     string    info
                     LOG_FORMAT                    string    json
                     DEBUG                         string    (optional)

[REDIS PROTOCOL COMMANDS]

Job Queue Management:
  ```bash
  # Enqueue job
  LPUSH job:queue <job-id>

  # Claim job (worker)
  RPOP job:queue

  # Check queue length
  LLEN job:queue

  # Get job IDs in queue
  LRANGE job:queue 0 -1
  ```

Job Status Tracking:
  ```bash
  # Set job status
  SET job:{job-id}:status "processing"

  # Get job status
  GET job:{job-id}:status

  # Track iteration
  HSET job:{job-id}:progress iteration 1
  HINCRBY job:{job-id}:progress agents_spawned 1
  ```

Agent Completion Signaling:
  ```bash
  # Agent signals completion to worker
  LPUSH cfn:worker:{worker-id}:signals <completion-json>

  # Worker retrieves signals
  RPOP cfn:worker:{worker-id}:signals
  ```

[AGENT LIFECYCLE MANAGEMENT]

Agent Container Naming:
  ```bash
  cfn-agent-{job-id}-{agent-type}-{index}

  Examples:
  cfn-agent-job-123-loop3-1
  cfn-agent-job-123-loop3-2
  cfn-agent-job-123-loop2-1
  ```

Environment Variables Passed to Agent:
  ```bash
  CFN_JOB_ID=job-123
  CFN_TASK_ID=task-123
  CFN_AGENT_TYPE=backend-developer
  CFN_ITERATION=1
  CFN_MODE=standard
  REDIS_HOST=redis
  REDIS_PORT=6379
  WORKSPACE_PATH=/workspace
  PROVIDER=kimi
  ```

Agent Exit Codes:
  ```
  0 = Success (completed work)
  1 = Generic error
  2 = Task failure (work couldn't complete)
  127 = Agent crashed (unexpected termination)
  130 = Terminated by signal (SIGINT)
  137 = Out of memory
  ```

================================================================================
PART 14: RELATED DOCUMENTATION
================================================================================

[PRIMARY REFERENCES]

CLI Mode Architecture:
  - readme/CLI_MODE_ARCHITECTURE.md (reference document, 14 parts)
  - .claude/commands/cfn-loop-cli.md (slash command implementation)
  - .claude/skills/cfn-coordination/SKILL.md (Redis protocols)

CFN Loop Core:
  - docs/guides/CFN_LOOP_ARCHITECTURE.md (overall system design)
  - docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md (test-driven validation)
  - CLAUDE.md (system architecture and critical rules)

Docker Infrastructure:
  - docker/CLAUDE.md (Docker agent orchestration)
  - docker/trigger-dev/CLAUDE.md (Trigger.dev development guide)
  - docker/trigger-dev/DEPLOYMENT.md (deployment procedures)

[TRIGGER.DEV SPECIFIC DOCUMENTATION]

Investigation Reports:
  - docker/trigger-dev/CFN_ARCHITECTURE_ANALYSIS.md
  - docker/trigger-dev/PHASE_1.3b_INFRASTRUCTURE_VALIDATION.md
  - docker/trigger-dev/CLI_AGENT_SPAWNING_ROOT_CAUSE_ANALYSIS.md

Configuration & Deployment:
  - docker/trigger-dev/DEPLOYMENT.md (deployment workflow)
  - docker/trigger-dev/.env.template (environment configuration)
  - docker/trigger-dev/docker-compose.yml (service definitions)

Validation Reports:
  - docker/trigger-dev/LOOP_2_VALIDATION_CHECKLIST.md
  - docker/trigger-dev/LOOP_2_TESTING_VALIDATION.md
  - docker/trigger-dev/ITERATION_2_VALIDATION_REPORT.md

[TESTING DOCUMENTATION]

CLI Mode Tests:
  - tests/cli-mode/README.md (CLI test documentation)
  - tests/cli-mode/run-all-tests.sh (test execution)
  - tests/cli-mode/test-*.sh (individual test suites)

Docker Mode Tests:
  - tests/docker-mode/README.md (Docker test documentation)
  - tests/docker-mode/run-all-implementations.sh
  - tests/docker-mode/implementations/ (45+ production tests)

Trigger.dev Tests:
  - docker/trigger-dev/test-*.sh (integration tests)
  - docker/trigger-dev/monitoring/ (health checks)

[OPERATIONS DOCUMENTATION]

Monitoring:
  - monitoring/README.md (monitoring setup)
  - monitoring/prometheus.yml (metrics configuration)
  - monitoring/prometheus-rules.yml (alert rules)
  - docs/MONITORING_GUIDE.md (monitoring procedures)

Runbooks:
  - docs/runbooks/ (operational procedures)
  - docs/runbooks/agent-spawn-failure.md (troubleshooting)

Alerting:
  - docker/trigger-dev/monitoring/ (Prometheus integration)
  - scripts/alerting/ (PagerDuty integration)

[ARCHITECTURE DECISION RECORDS (ADRs)]

Related ADRs:
  - architecture/ (if directory exists)
  - ADR-001: CLI Mode Architecture (v3.2.0)
  - ADR-002: Trigger.dev Integration (proposed)
  - ADR-003: Multi-Provider Routing (v2.15+)
  - ADR-004: Docker-Based Orchestration (v3.0+)

[COMPARATIVE ANALYSIS]

CLI Mode vs Trigger.dev:
  - Part 1: Architecture Comparison (in this document)
  - Cost analysis (Part 1)
  - Deployment models (Part 2)
  - Scaling strategies (Part 8)
  - Use case recommendations (Part 9)

Hybrid Approach Guidance:
  - Part 1: Cost analysis for hybrid model
  - Part 9: Use cases for each mode
  - Part 10: Migration paths (CLI → Trigger.dev)
  - Part 11: Troubleshooting (when to use each)

[CONFIGURATION TEMPLATES]

CLI Mode Configuration:
  - readme/CLI_MODE_ARCHITECTURE.md Part 3 (provider routing)
  - .claude/commands/cfn-loop-cli.md (slash command)
  - Example: /cfn-loop-cli "task" --mode=standard --provider=kimi

Trigger.dev Configuration:
  - docker/trigger-dev/.env.template (environment setup)
  - docker/trigger-dev/docker-compose.yml (service config)
  - Example: Define scheduled job via TypeScript API

[SKILL REFERENCES]

Coordination:
  - .claude/skills/cfn-coordination/SKILL.md (Redis protocols)
  - .claude/skills/cfn-coordination/invoke-*.sh (coordination scripts)

Agent Spawning:
  - .claude/skills/cfn-agent-spawning/SKILL.md (agent spawn patterns)
  - src/cli/spawn-agent-cli.ts (CLI spawning implementation)
  - docker/agents/ (Docker agent implementation)

Testing:
  - .claude/skills/cfn-loop-validation/SKILL.md (test validation)
  - tests/test-utils.sh (test utility functions)

[QUICK NAVIGATION BY ROLE]

For Developers:
  1. Start: readme/CLI_MODE_ARCHITECTURE.md (understand CLI mode)
  2. If interactive: Use /cfn-loop-cli (slash command)
  3. If need persistence: Deploy Trigger.dev (Part 2-3 this document)
  4. Debug: Part 11 (troubleshooting procedures)

For DevOps/Infrastructure:
  1. Deploy: docker/trigger-dev/DEPLOYMENT.md
  2. Configure: docker/trigger-dev/.env.template
  3. Monitor: monitoring/README.md
  4. Troubleshoot: Part 11 (this document)

For Architects/Leads:
  1. Overview: Part 1 (architecture comparison)
  2. Cost analysis: Part 1, 8 (performance optimization)
  3. Scaling: Part 7, 8 (multi-worktree, performance)
  4. Use cases: Part 9 (common patterns)

For Security/Compliance:
  1. Review: Part 12 (security and compliance)
  2. Audit: Part 12 (audit and compliance)
  3. Provider selection: Part 3 (provider security)
  4. Network isolation: Part 7 (Docker isolation)

================================================================================
CONCLUSION
================================================================================

Trigger.dev represents an evolution of CFN Loop coordination from CLI-based,
session-oriented agent spawning to persistent, event-driven infrastructure.

Key Decision Framework:
  - CLI Mode: Fast, cost-efficient, single-session workflows
  - Trigger.dev: Persistent, scheduled, multi-team orchestration
  - Hybrid: Selective use of both for optimal cost/benefit

Implementation Status:
  - Phase 1: Single container agent spawning (under investigation)
  - Phase 1.2a: Multi-container orchestration (wave-based spawning planned)
  - Phase 1.3b: Infrastructure validation (scheduled)
  - Phase 2: Enterprise scaling (future)
  - Phase 3: Production hardening (future)

Next Steps:
  1. Complete Phase 1 validation (network configuration, Redis coordination)
  2. Document service discovery patterns (internal Docker DNS)
  3. Implement wave-based agent spawning
  4. Validate multi-worker parallelization
  5. Finalize production deployment procedures

================================================================================
Document Version: 1.0.0
Created: 2025-11-24
Reference: readme/CLI_MODE_ARCHITECTURE.md (14 parts, 1,171 lines)
Status: Design Documentation (Architecture Planning Phase)
================================================================================
