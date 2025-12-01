# Trigger.dev Container Modes - Technical Specification

**Reference**: docker/trigger-dev/TRIGGER_DEV_ARCHITECTURE.md
**Status**: Specification Phase
**Version**: 1.0.0
**Date**: 2025-11-24

---

## 1. System Overview

### 1.1 Architecture Layers

```
┌─────────────────────────────────────────┐
│ User/Integration Layer                  │
│ - Webhook triggers                      │
│ - Slash command (/cfn-loop-trigger)     │
│ - Direct API calls                      │
│ - Cron schedules                        │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│ Trigger.dev API & Dashboard             │
│ - Webapp (http://localhost:3040)        │
│ - Real-time updates (socket.io)         │
│ - Job status management                 │
│ - Authentication/Authorization          │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│ Data Persistence Layer                  │
│ - PostgreSQL (jobs, organizations)      │
│ - Redis (queue, cache)                  │
│ - MinIO (artifacts)                     │
│ - ClickHouse (optional - analytics)     │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│ Orchestration Layer                     │
│ - Worker (job claiming, coordination)   │
│ - Socket Proxy (Docker API isolation)   │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│ Execution Layer                         │
│ - Agent Containers (CFN agents)         │
│ - Task coordination                     │
│ - Results reporting                     │
└─────────────────────────────────────────┘
```

### 1.2 Service Definition

| Service | Purpose | Container | Port (Int/Ext) | Network |
|---------|---------|-----------|----------------|---------|
| PostgreSQL | Job storage | postgres:15 | 5432/5432 | trigger-cfn-network |
| Redis | Queue & cache | redis:7 | 6379/6379 | trigger-cfn-network |
| MinIO | S3-compatible | minio:latest | 9000/9000 | trigger-cfn-network |
| ClickHouse | Analytics | clickhouse:latest | 8123/8123 | trigger-cfn-network |
| Trigger Webapp | Dashboard & API | trigger-webapp | 3000(int)/3040(ext) | trigger-cfn-network |
| Socket Proxy | Docker API | docker-socket-proxy | 2375 | trigger-cfn-network |
| Trigger Worker | Job executor | trigger-worker | none | trigger-cfn-network |
| Agent (Dynamic) | Task executor | cfn-agent:latest | none | cfn-network |

---

## 2. Database Schema

### 2.1 Core Tables

```sql
-- Organizations (multi-tenancy)
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  slug VARCHAR(100) UNIQUE,
  title VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Projects (org subdivision)
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  slug VARCHAR(100),
  name VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(organization_id, slug)
);

-- Jobs (CFN Loop executions)
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  type VARCHAR(100),                    -- "cfn-loop", "batch-processing", etc.
  status VARCHAR(50),                   -- "queued", "processing", "completed", "failed"
  payload JSONB,                        -- Task description, parameters
  metadata JSONB,                       -- Source, triggering event

  -- Execution info
  worker_id VARCHAR(100),               -- Which worker is processing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,

  -- Quality metrics
  mode VARCHAR(50),                     -- "mvp", "standard", "enterprise"
  iteration_count INTEGER DEFAULT 0,
  max_iterations INTEGER DEFAULT 10,
  final_test_pass_rate DECIMAL(5,4),

  -- Results
  results JSONB,                        -- Execution results

  -- Webhooks
  webhook_url TEXT,
  webhook_status VARCHAR(50),
  webhook_attempts INTEGER DEFAULT 0,

  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Job iterations (track each CFN Loop iteration)
CREATE TABLE job_iterations (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  iteration_number INTEGER,

  -- Execution metrics
  agents_spawned INTEGER,
  agents_completed INTEGER,
  test_pass_rate DECIMAL(5,4),
  gate_passed BOOLEAN,
  gate_threshold DECIMAL(5,4),

  -- Timing
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,

  -- Provider info
  provider VARCHAR(100),
  model VARCHAR(255),
  tokens_used INTEGER,
  cost DECIMAL(10,6)
);

-- Agent execution history
CREATE TABLE job_executions (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  iteration_id UUID REFERENCES job_iterations(id),
  agent_id VARCHAR(255),
  agent_type VARCHAR(100),              -- "backend-developer", "loop2-validator"

  -- Execution info
  container_name VARCHAR(255),
  status VARCHAR(50),
  exit_code INTEGER,

  -- Resource usage
  memory_mb INTEGER,
  cpu_cores DECIMAL(4,2),
  duration_seconds INTEGER,

  -- Results
  files_modified TEXT[],                -- JSON array of file paths
  tests_passed INTEGER,
  tests_failed INTEGER,
  issues TEXT[],

  -- Provider metrics
  provider VARCHAR(100),
  model VARCHAR(255),
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost DECIMAL(10,6),

  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Webhook delivery log
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  webhook_url TEXT,

  -- Request/Response
  request_payload JSONB,
  response_code INTEGER,
  response_body TEXT,
  error_message TEXT,

  -- Retry info
  attempt_number INTEGER,
  max_retries INTEGER DEFAULT 4,
  next_retry_at TIMESTAMP,

  delivery_time TIMESTAMP
);
```

### 2.2 Indexes (Performance Optimization)

```sql
-- Query optimization
CREATE INDEX idx_jobs_org_created ON jobs(organization_id, created_at DESC);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_worker_id ON jobs(worker_id);
CREATE INDEX idx_iterations_job_id ON job_iterations(job_id);
CREATE INDEX idx_executions_job_id ON job_executions(job_id);
CREATE INDEX idx_webhook_deliveries_job_id ON webhook_deliveries(job_id);

-- Full-text search (optional)
CREATE INDEX idx_jobs_payload_gin ON jobs USING GIN(payload);
CREATE INDEX idx_results_gin ON jobs USING GIN(results);
```

---

## 3. Redis Schema

### 3.1 Key Structure

```
# Job Queue Management
job:queue                           LIST   Pending job IDs (FIFO)
job:{job-id}:status               STRING  Current status
job:{job-id}:progress             HASH    Iteration, agents, metrics

# Task Queue (within job execution)
task:queue                         LIST   Tasks to be claimed by agents
task:{task-id}                     HASH   Task metadata (files, errors)
task:{task-id}:result             HASH   Task execution result

# Agent Coordination
cfn:agent:{agent-id}              HASH   Agent state & metrics
cfn:agent:{agent-id}:heartbeat    STRING  Last heartbeat timestamp

# Worker Coordination
cfn:worker:{worker-id}:signals    LIST   Completion signals from agents
cfn:worker:{worker-id}:heartbeat  STRING  Worker health indicator

# Caching
cache:job:{job-id}                STRING  Cached job info (TTL: 5m)
cache:iteration:{iter-id}         HASH   Cached iteration data
```

### 3.2 TTL (Time-To-Live)

```
Key Pattern                        TTL     Purpose
────────────────────────────────────────────────────────
job:queue                         None    Persistent until processed
job:{job-id}:status              86400s  1 day retention
job:{job-id}:progress            3600s   1 hour (within execution window)
task:*                            3600s   Cleanup after execution
cache:*                           300s    5 minute cache
cfn:agent:*:heartbeat            60s     Staleness detection
```

---

## 4. Service Specifications

### 4.1 Trigger Worker

**Container**: `trigger-worker` (persistent, always running)

**Responsibilities**:
- Claim jobs from Redis queue
- Spawn agent containers via Docker API
- Coordinate task execution (wait for agents)
- Update job status in PostgreSQL
- Publish real-time updates to dashboard

**Configuration**:
```yaml
trigger-worker:
  image: trigger-dev/worker:latest
  environment:
    TRIGGER_API_KEY: ${TRIGGER_API_KEY}
    TRIGGER_API_URL: http://trigger-webapp:3000
    DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/trigger
    REDIS_URL: redis://redis:6379
    CFN_WORKER_CONCURRENCY: 5                # Max concurrent jobs
    DOCKER_HOST: unix:///var/run/docker.sock
    CFN_NETWORK: cfn-network
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:rw
    - /workspace:/workspace:rw
  networks:
    - trigger-cfn-network
  restart: always
```

**Lifecycle**:
```
START
  ↓
┌─────────────────────────────────────────────┐
│ CLAIM LOOP (while running)                  │
│                                             │
│ 1. RPOP job:queue (block until job)        │
│ 2. Fetch job from PostgreSQL               │
│ 3. Analyze task (determine agent types)    │
│ 4. Spawn agents                            │
│ 5. Wait for agent completion signals       │
│    BLPOP cfn:worker:{id}:signals           │
│ 6. Update job status → "completed"         │
│ 7. Publish socket.io update                │
│ 8. GOTO step 1                             │
└─────────────────────────────────────────────┘
  ↓
SHUTDOWN (graceful)
```

### 4.2 Agent Containers

**Image**: `cfn-agent:latest` (spawned on-demand)

**Responsibilities**:
- Receive task assignments from Redis
- Execute CFN Loop implementation (Loop 3)
- Run tests and validate results
- Report completion to worker

**Lifecycle**:
```
START
  ↓
┌─────────────────────────────────────────────┐
│ TASK EXECUTION LOOP                         │
│                                             │
│ 1. RPOP task:queue (claim task)            │
│ 2. Fetch task details                      │
│ 3. Execute work (implementation)           │
│ 4. Run tests                               │
│ 5. HSET task:{id}:result (results)        │
│ 6. LPUSH cfn:worker:signals (completion)  │
│ 7. GOTO step 1 (if tasks remain)          │
└─────────────────────────────────────────────┘
  ↓
EXIT (graceful exit code 0 when queue empty)
```

**Environment**:
```bash
CFN_JOB_ID=job-123
CFN_TASK_ID=task-456
CFN_AGENT_TYPE=backend-developer
CFN_ITERATION=1
CFN_MODE=standard
REDIS_HOST=redis
REDIS_PORT=6379
WORKSPACE_PATH=/workspace
PROVIDER=kimi
LOG_LEVEL=info
```

### 4.3 Socket Proxy

**Image**: `tecnativa/docker-socket-proxy:latest`

**Purpose**: Restricted Docker API access for workers

**Configuration**:
```yaml
socket-proxy:
  image: tecnativa/docker-socket-proxy:latest
  environment:
    # Restrictions (allow only what's needed)
    NETWORKS: 1        # Allow network operations
    CONTAINERS: 1      # Allow container operations
    SERVICES: 1        # Allow service operations
    IMAGES: 0          # Deny image operations
    VOLUMES: 0         # Deny volume operations
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
  networks:
    - trigger-cfn-network
```

**Allowed Operations**:
- Create/remove networks
- Create/remove/list containers
- Start/stop containers
- Inspect containers/networks

---

## 5. Network Architecture

### 5.1 Docker Networks

**Network 1: trigger-cfn-network** (shared infrastructure)
```
Services on this network:
├─ postgres          (database)
├─ redis             (queue/cache)
├─ minio             (artifact storage)
├─ clickhouse        (analytics)
├─ trigger-webapp    (dashboard)
├─ trigger-worker    (orchestrator)
└─ socket-proxy      (Docker API)

All services access each other via service names (Docker DNS)
```

**Network 2: cfn-network** (agent execution)
```
Containers on this network:
├─ cfn-agent-{job-id}-loop3-1
├─ cfn-agent-{job-id}-loop3-2
├─ cfn-agent-{job-id}-loop2-1
└─ [more agents as spawned]

Cannot directly reach trigger services
Must use Redis for worker coordination
```

### 5.2 Network Connectivity Requirements

```
Connection                   From        To              Via
──────────────────────────────────────────────────────────────
Worker → Database           trigger-worker → postgres    Internal DNS
Worker → Redis              trigger-worker → redis       Internal DNS
Worker → Docker API         trigger-worker → socket-proxy Internal DNS
Worker → Agent Containers   (indirect via Redis signals)
Agent → Redis               cfn-agent → redis           (ISSUE - cross-network)
Agent → Worker              cfn-agent → trigger-worker  (ISSUE - cross-network)
Webapp → Worker             trigger-webapp → trigger-worker Internal DNS
```

**Cross-Network Issue Resolution**:

Option 1: Expose Redis on both networks
```yaml
redis:
  ports:
    - "6379:6379"  # External + both networks
  networks:
    - trigger-cfn-network
    - cfn-network
```

Option 2: Use Redis external hostname
```
Agents connect to: redis:6379 (resolved via Docker's network bridge)
Requires special Docker DNS configuration
```

Option 3: Dedicated Redis for agents
```
redis-agents:
  networks:
    - cfn-network
Agents use: redis-agents:6379
Worker uses: redis:6379 (on trigger-cfn-network)
Sync mechanism between Redis instances
```

**Recommendation**: Option 1 (expose Redis on both networks) is simplest

---

## 6. Job Execution Flow

### 6.1 Event Entry

```
Event Source:
├─ HTTP POST /webhooks/cfn-loop (webhook)
├─ /cfn-loop-trigger "task" (slash command)
├─ POST /api/jobs (direct API)
└─ Cron schedule (scheduled)

Event Processing:
  1. Validate event structure
  2. Create job record in PostgreSQL
  3. Enqueue to Redis: LPUSH job:queue {job-id}
  4. Update job status → "queued"
  5. Publish socket.io update to dashboard
```

### 6.2 Worker Job Claiming

```
Worker Claims Job:
  1. Block until job available: RPOP job:queue (with timeout)
  2. Fetch job from PostgreSQL
  3. UPDATE jobs SET status = 'processing', worker_id = {worker-id}
  4. Analyze task requirements (determine agent types)
  5. Plan execution (single agent vs CFN Loop)
```

### 6.3 Agent Spawning

```
Worker Spawns Agents:
  For each agent in plan:
    1. Calculate memory/CPU requirements
    2. Create container via Docker API:
       docker run \
         --name cfn-agent-{job-id}-{type}-{index} \
         --network cfn-network \
         --memory=4g \
         -e CFN_JOB_ID={job-id} \
         -e REDIS_HOST=redis \
         cfn-agent:latest
    3. INSERT agent_containers record
    4. Publish progress update
```

### 6.4 Task Execution

```
Agent Task Execution:
  1. RPOP task:queue (claim task atomically)
  2. Fetch task details: HGETALL task:{task-id}
  3. Read files from /workspace
  4. Execute Claude Code CLI with task
  5. Run tests: npm test
  6. Collect results (files, test status)
  7. HSET task:{task-id}:result (save results)
  8. INCR task:completed (increment counter)
  9. LPUSH cfn:worker:{worker-id}:signals (notify completion)
  10. LOOP (claim next task)
```

### 6.5 Completion Handling

```
Worker Processes Agent Signal:
  1. RPOP cfn:worker:{worker-id}:signals (receive from Redis)
  2. Parse completion signal JSON
  3. Validate signal structure
  4. INSERT job_executions record (agent result)
  5. Clean up container: docker rm <agent-container>
  6. Check if more agents needed (CFN Loop iteration)
  7. IF no more agents:
       - Aggregate results from all agents
       - UPDATE jobs SET status = 'completed', results = {aggregated}
       - Publish socket.io final update
       - Trigger webhook if configured
  8. ELSE:
       - Continue to next agent type or iteration
```

### 6.6 Decision Point (CFN Loop)

```
After Loop 3 agents complete:
  Test Results:
    └─ Pass rate calculation
       IF pass_rate >= gate_threshold:
         → Proceed to Loop 2 (validators)
       ELSE:
         → Queue for next iteration

After Loop 2 validators complete:
  Consensus:
    └─ Agreement score calculation
       IF agreement >= consensus_threshold:
         → Proceed to Product Owner decision
       ELSE:
         → Queue for next iteration

Product Owner Decision:
  ├─ PROCEED: Job complete
  ├─ ITERATE: Queue for next iteration (increment counter)
  └─ ABORT: Job failed (stop execution)
```

---

## 7. Communication Protocols

### 7.1 Agent Completion Signal

**Format**: JSON pushed to Redis list

```json
{
  "agentId": "cfn-agent-job-123-loop3-1",
  "jobId": "job-123",
  "status": "completed",
  "confidence": 0.95,
  "executionTime": 145.2,
  "tokenCount": 15420,
  "provider": "kimi",
  "model": "claude-3.5-sonnet",
  "results": {
    "filesModified": ["src/auth.ts", "src/routes/login.ts"],
    "testsPassed": 34,
    "testsFailed": 0,
    "testPassRate": 1.0,
    "issues": []
  },
  "timestamp": "2025-11-24T10:35:30Z"
}
```

**Delivery Mechanism**:
```bash
# In agent container
redis-cli -h redis LPUSH cfn:worker:{worker-id}:signals '{"json"}'

# Worker retrieves
redis-cli RPOP cfn:worker:{worker-id}:signals
```

### 7.2 Webhook Payload

**Event**: job.completed

```json
{
  "event": "job.completed",
  "jobId": "job-123",
  "status": "completed",
  "organizationId": "org-123",
  "projectId": "project-456",
  "payload": {
    "taskId": "task-123",
    "mode": "standard",
    "iterationsFinal": 2,
    "testPassRate": 0.95
  },
  "results": {
    "filesModified": ["src/auth.ts"],
    "duration": "12 minutes",
    "agentsUsed": 5,
    "cost": 0.15
  },
  "completedAt": "2025-11-24T10:45:00Z"
}
```

**Delivery**:
```bash
POST {webhook_url}
Content-Type: application/json
X-Signature: sha256={hmac_signature}

{webhook_payload}

Response: HTTP 200 OK (success), anything else triggers retry
Retries: 4 attempts with exponential backoff (1m, 4m, 16m)
```

### 7.3 Socket.io Real-time Updates

**Events to Dashboard**:
```javascript
// When job starts
socket.emit('job:started', {
  jobId: 'job-123',
  status: 'processing',
  startedAt: '2025-11-24T10:30:00Z'
});

// When agent spawned
socket.emit('agent:spawned', {
  jobId: 'job-123',
  agentId: 'cfn-agent-job-123-loop3-1',
  agentType: 'backend-developer'
});

// When iteration completes
socket.emit('iteration:completed', {
  jobId: 'job-123',
  iteration: 1,
  testPassRate: 0.95,
  gateThreshold: 0.95,
  gatePassed: true
});

// When job completes
socket.emit('job:completed', {
  jobId: 'job-123',
  status: 'completed',
  results: {...}
});
```

---

## 8. Error Handling & Recovery

### 8.1 Agent Crash Recovery

```
Scenario: Agent container crashes (exit code 137 - OOM)

Detection:
  - Worker monitors container exit
  - Container status → "exited"
  - Timeout waiting for signal

Recovery:
  Option 1: Automatic Retry
    - Increase memory allocation
    - Respawn container with new memory
    - Max retries: 3

  Option 2: Manual Investigation
    - Log container exit code
    - Save container logs
    - Alert operator
    - Manual restart possible

Implementation:
  try {
    await spawnAgent(config);
    await waitForCompletion(agent);
  } catch (error) {
    if (error.code === 137) {
      // OOM error
      const newMemory = increaseMemory(config.memory);
      return retrySpawn({...config, memory: newMemory});
    }
    throw error;
  }
```

### 8.2 Network Connectivity Issues

```
Scenario: Agent cannot reach Redis

Detection:
  - Agent heartbeat timeout (no signal received)
  - Timeout waiting for task queue

Recovery:
  1. Retry Redis connection (3 attempts, 5s delay)
  2. Check network connectivity: ping redis
  3. Verify container network: docker inspect
  4. If persistent: mark container as failed
  5. Log network diagnostics
  6. Alert operator
```

### 8.3 Database Connection Issues

```
Scenario: Worker cannot connect to PostgreSQL

Detection:
  - Connection pool exhaustion
  - Connection timeout errors

Prevention:
  - PgBouncer connection pooling
  - Connection pool size: 20 (configurable)
  - Statement timeout: 30 seconds

Recovery:
  - Automatic connection retry
  - Kill long-running queries
  - Bounce PgBouncer if needed
  - Scale back new connections
```

### 8.4 Webhook Delivery Failures

```
Scenario: Webhook endpoint returns 500 error

Behavior:
  1. Attempt 1: Immediate (delay 0)
  2. Attempt 2: After 1 minute (exponential backoff)
  3. Attempt 3: After 4 minutes
  4. Attempt 4: After 16 minutes
  5. Max reached: Mark as "permanently_failed"

Recovery Options:
  - Manual retry via API
  - Update webhook URL and retry
  - Check webhook endpoint logs
  - Implement webhook validation
```

---

## 9. Configuration Specifications

### 9.1 Environment Variables

**Critical** (must be set):
```bash
TRIGGER_API_KEY=tr_dev_...
DATABASE_URL=postgresql://postgres:password@postgres:5432/trigger
REDIS_URL=redis://redis:6379
```

**Important** (should be set for security):
```bash
TRIGGER_API_SECRET=...        # Webhook signature verification
DATABASE_SSL=true              # In production
REDIS_PASSWORD=...             # In production
```

**Configuration** (defaults usually fine):
```bash
CFN_DEFAULT_MODE=standard          # mvp, standard, enterprise
CFN_DEFAULT_PROVIDER=kimi          # zai, kimi, max, etc.
CFN_WORKER_CONCURRENCY=5           # Max concurrent jobs per worker
CFN_MAX_ITERATIONS=10              # Max CFN Loop iterations per job
AGENT_MEMORY_DEFAULT=4g            # Default agent memory
AGENT_CPU_DEFAULT=2                # Default agent CPU
WEBHOOK_MAX_RETRIES=4              # Webhook retry attempts
WEBHOOK_TIMEOUT_SECONDS=30         # Webhook delivery timeout
```

### 9.2 Resource Limits

```
Agent Containers:
  Memory: 4GB (default, configurable 512MB-8GB)
  CPU: 2 cores (default, configurable 0.5-4 cores)
  Tmpfs: 1GB (temporary filesystem)

Worker Container:
  Memory: 2GB (minimum, configurable)
  CPU: 2 cores (minimum, configurable)

Total Worker Budget:
  Memory Budget: 40GB (configurable)
  Meaning: Total memory available for all agents spawned by worker
```

### 9.3 Quality Gate Configuration

```yaml
# mvp mode
MVP_LOOP3_GATE: 0.70              # 70% test pass rate
MVP_LOOP2_CONSENSUS: 0.80         # 80% validator agreement
MVP_MAX_ITERATIONS: 5

# standard mode (default)
STANDARD_LOOP3_GATE: 0.95         # 95% test pass rate
STANDARD_LOOP2_CONSENSUS: 0.90    # 90% validator agreement
STANDARD_MAX_ITERATIONS: 10

# enterprise mode
ENTERPRISE_LOOP3_GATE: 0.98       # 98% test pass rate
ENTERPRISE_LOOP2_CONSENSUS: 0.95  # 95% validator agreement
ENTERPRISE_MAX_ITERATIONS: 15
```

---

## 10. Monitoring & Observability

### 10.1 Key Metrics

```
Job Metrics:
  - Jobs queued (current queue depth)
  - Jobs in progress (currently processing)
  - Jobs completed (total)
  - Average job duration
  - Average cost per job
  - Success rate (%)

Agent Metrics:
  - Agents spawned (count)
  - Agents completed (count)
  - Average agent execution time
  - OOM errors (count)
  - Container crashes (count)
  - Memory utilization (%)
  - CPU utilization (%)

Queue Metrics:
  - Queue depth (jobs waiting)
  - Queue throughput (jobs/minute)
  - Worker utilization (%)
  - Average wait time
  - Max wait time

Database Metrics:
  - Connection pool usage
  - Query latency (p50, p95, p99)
  - Slow query count
  - Transaction count

Redis Metrics:
  - Memory used
  - Key count
  - Operation rate
  - Evictions (if any)
```

### 10.2 Logging

```
Log Levels:
  ERROR: Failures, crashes, exceptions
  WARN:  Retries, timeouts, degradation
  INFO:  Job start/complete, milestones
  DEBUG: Detailed execution flow

Log Fields:
  timestamp
  level
  component (worker, agent, webhook, etc.)
  jobId
  agentId
  message
  stack_trace (if error)
  duration
  resource_usage (memory, CPU)
```

### 10.3 Alerting Rules

```
Alert: Worker not processing jobs
  Condition: Queue depth > 5 AND no jobs processed in 5m
  Action: Page on-call engineer

Alert: Agent OOM errors
  Condition: OOM errors > 3 in 1 hour
  Action: Notify DevOps, increase agent memory

Alert: Webhook delivery failures
  Condition: Failure rate > 10%
  Action: Notify team, check webhook endpoint

Alert: Database connection pool
  Condition: Pool utilization > 90%
  Action: Page on-call engineer, may need PgBouncer

Alert: Redis memory high
  Condition: Used memory > 80% of limit
  Action: Review TTL policies, clean old data
```

---

## 11. Security Specifications

### 11.1 Authentication & Authorization

```
Worker Authentication:
  - TRIGGER_API_KEY (environment variable)
  - Used for all Trigger.dev API calls
  - Rotated every 90 days

Webhook Signature Verification:
  - Header: X-Signature
  - Format: sha256={hmac}
  - HMAC Key: TRIGGER_API_SECRET
  - Verification: Required for all webhooks

Agent Container Isolation:
  - Network isolation: cfn-network (separate from infrastructure)
  - Resource limits: Memory, CPU, tmpfs
  - No Docker daemon access (socket proxy blocks it)
  - No host filesystem access
```

### 11.2 Data Protection

```
At Rest:
  - PostgreSQL: Encryption enabled (TLS)
  - Redis: No encryption (internal network only)
  - MinIO: Encryption enabled
  - Logs: PII redacted

In Transit:
  - Redis: Internal Docker network (no encryption needed)
  - PostgreSQL: TLS connections (production)
  - Webhooks: HTTPS only
  - API: HTTPS only
```

### 11.3 Multi-Tenancy Isolation

```
Database Level:
  - Query filters on organization_id
  - Row-level security (optional)
  - Audit logging per organization

Application Level:
  - Dashboard: Login required, org-scoped
  - API: Token scoped to organization
  - Webhooks: Organization-specific URLs

Network Level:
  - Agent networks: Isolated per job
  - Workers: No cross-org job processing
  - Redis: No org-level isolation (internal use only)
```

---

## 12. Testing Specifications

### 12.1 Unit Tests

**Coverage**: ≥80% of business logic

```typescript
// examples/test-job-claiming.ts
describe('Worker Job Claiming', () => {
  it('claims job from queue atomically', async () => {
    // Setup
    await redis.lpush('job:queue', 'job-123');

    // Test
    const job = await worker.claimJob();

    // Verify
    expect(job.id).toBe('job-123');
    const remaining = await redis.llen('job:queue');
    expect(remaining).toBe(0);  // Atomicity verified
  });

  it('handles queue empty case', async () => {
    // Test
    const job = await worker.claimJob({ timeout: 1 });

    // Verify
    expect(job).toBeNull();
  });
});
```

### 12.2 Integration Tests

**Coverage**: ≥70% of workflows

```bash
# tests/trigger-dev/integration/job-execution.test.sh
# Test: Full job execution from entry to completion

# Setup
docker-compose up -d postgres redis trigger-webapp trigger-worker

# Test: Enqueue job
curl -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"type":"cfn-loop","payload":{"taskDescription":"test"}}'

# Verify: Job queued
redis-cli LLEN job:queue  # Should be 1

# Wait: Worker processes job
sleep 10

# Verify: Job completed
psql -c "SELECT status FROM jobs WHERE id='job-123'" # Should be 'completed'
```

### 12.3 Performance Tests

**Targets**:
- Job startup: <5 seconds
- Agent spawn: <3 seconds
- Task execution: 2-10 minutes (dependent on task)
- Completion signal latency: <1 second

### 12.4 Load Tests

**Scenarios**:
```
Scenario 1: 10 concurrent jobs
  - Expected queue depth: 10
  - Expected duration: 5x single job (sequential)

Scenario 2: Job spike (100 jobs in 1 minute)
  - Expected behavior: Queue builds up, gradually processes
  - Expected throughput: ~5 jobs/minute (with 1 worker)

Scenario 3: Agent OOM under load
  - Expected behavior: Retry with increased memory
  - Expected max memory: 40GB (worker budget)
```

---

## 13. Deployment Specifications

### 13.1 Deployment Checklist

```
Pre-Deployment:
  [ ] All 10 Docker secrets created
  [ ] .env file configured with production values
  [ ] Database backups created
  [ ] Health checks verified
  [ ] Monitoring set up

Deployment:
  [ ] Pull latest images: docker-compose pull
  [ ] Migrate database: npm run migrate (if schema changed)
  [ ] Start services: docker-compose up -d
  [ ] Verify health: docker-compose ps
  [ ] Check logs for errors: docker-compose logs

Post-Deployment:
  [ ] Run smoke tests (basic job execution)
  [ ] Monitor error rates (should be 0 for first job)
  [ ] Check CPU/memory usage (should be normal)
  [ ] Verify webhooks working
  [ ] Confirm dashboard accessible
```

### 13.2 Rollback Procedure

```
If deployment fails:
  1. Stop new services: docker-compose down
  2. Restore database: psql < backup.sql
  3. Start previous version: docker-compose -f docker-compose.v1.yml up -d
  4. Verify health
  5. Investigate failure
  6. Plan next deployment
```

---

## 14. Maintenance Procedures

### 14.1 Routine Maintenance

```
Daily:
  - Check error logs (should be minimal)
  - Monitor queue depth (should be < 10)
  - Verify worker is running (docker-compose ps)

Weekly:
  - Database integrity check: SELECT COUNT(*) FROM jobs
  - Disk space check: df -h
  - Log rotation: Ensure logs not exceeding disk

Monthly:
  - Review metrics and trends
  - Rotate secrets
  - Test backup/restore procedure
  - Performance optimization review
```

### 14.2 Cleanup Procedures

```
Cleanup stale data:
  # Old job records (keep 6 months)
  DELETE FROM jobs WHERE created_at < NOW() - INTERVAL '6 months';

  # Old Redis keys (should be automatic with TTL)
  redis-cli --scan --pattern "job:*" | head -10

  # Old log files
  find logs/ -name "*.log" -mtime +30 -delete

  # Docker cleanup
  docker system prune --all --force
```

---

## 15. API Specifications

### 15.1 Job Creation Endpoint

```
POST /api/jobs
Authorization: Bearer {api_key}
Content-Type: application/json

Request:
{
  "type": "cfn-loop",
  "payload": {
    "taskDescription": "Implement JWT auth",
    "files": ["src/auth.ts", "src/routes/login.ts"]
  },
  "mode": "standard",
  "provider": "kimi",
  "webhook": {
    "url": "https://webhook.example.com/results",
    "retryPolicy": "exponential"
  }
}

Response (201 Created):
{
  "id": "job-123-abc",
  "status": "queued",
  "createdAt": "2025-11-24T10:30:00Z",
  "url": "http://localhost:3040/jobs/job-123-abc"
}
```

### 15.2 Job Status Endpoint

```
GET /api/jobs/{job-id}
Authorization: Bearer {api_key}

Response (200 OK):
{
  "id": "job-123-abc",
  "status": "processing",
  "progress": {
    "iteration": 1,
    "agentsSpawned": 3,
    "agentsCompleted": 1
  },
  "results": null,
  "startedAt": "2025-11-24T10:31:00Z",
  "completedAt": null
}
```

---

**Document Status**: Specification Phase
**Next Steps**: Implement Phase 1 per IMPLEMENTATION_ROADMAP.md
**References**: TRIGGER_DEV_ARCHITECTURE.md (comprehensive architecture)

