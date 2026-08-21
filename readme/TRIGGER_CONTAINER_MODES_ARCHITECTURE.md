================================================================================
     TRIGGER.DEV CONTAINER MODES ARCHITECTURE
================================================================================
VERSION: 1.0.0 (Created: 2025-11-24)
STATUS: SUPERSEDED. Trigger.dev was removed from the CFN Loop architecture
(trigger-dev-consolidation epic, completed; local Promise.all orchestration
via lib/mdap/ is the live replacement) and Trigger.dev usage moved to the
separate SEO platform repo. None of the docker/trigger-dev/* and
trigger-dev/* paths below exist in this repo anymore. Kept as historical
design record only.

EXECUTIVE SUMMARY:
  Trigger.dev represents persistent container-first orchestration extending CFN
  Loop beyond CLI agent spawning. This architecture supports event-driven job
  coordination, multi-worker pools, and webhook-triggered workflows. Trigger.dev
  complements CLI mode for background jobs, scheduled tasks, and multi-team
  orchestration while maintaining CFN Loop structure (Loop 3 → Loop 2 → PO).

KEY DIFFERENTIATORS FROM CLI MODE:
  - Persistent background worker pool (vs ephemeral CLI agents)
  - Event-driven job queueing with database persistence
  - Self-hosted infrastructure (PostgreSQL, Redis, MinIO, ClickHouse)
  - Webhook event triggers (vs slash command invocation)
  - Real-time job status dashboard
  - Multi-environment support (dev/staging/prod)
  - Scheduled job execution (cron-based)
  - Audit trail with compliance retention

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
  - State: Ephemeral (no persistent history)
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
Reports to Worker via Redis/Webhook
  ↓
Worker updates PostgreSQL
  ↓
Workflow continues or User views Dashboard

CHARACTERISTICS:
  - Persistent background workers (always-on pool)
  - Event-driven job coordination (webhook/event triggered)
  - Cost: Infrastructure ($110-200/month) + execution ($0.050/iteration)
  - Setup: Docker Compose with 8+ services (detailed in Part 2)
  - Scaling: Multiple workers in parallel, request-based provisioning
  - Debugging: Logs accessible via dashboard + container inspection
  - State: PostgreSQL-persistent (full audit trail)
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
  ✅ Persistent job history and audit trail (compliance)
  ✅ Webhook event triggers (external integrations: GitHub, Slack)
  ✅ Scheduled job execution (cron-based, 24/7 background)
  ✅ Real-time dashboard (job status visibility, metrics)
  ✅ Multi-worker parallelization (horizontal scaling)
  ✅ Database-backed coordination (vs ephemeral Redis)
  ✅ Retryable jobs with exponential backoff
  ✅ Multi-team isolation via organizations
  ✅ Event-driven workflow progression (no polling)

ADVANTAGES OF CLI MODE OVER TRIGGER.DEV:
  ✅ Minimal setup (only Redis required)
  ✅ Lower infrastructure costs (~$10/month vs $110-200/month)
  ✅ Faster startup time (no container initialization overhead)
  ✅ Direct debugging visibility in Main Chat
  ✅ Simplified recovery procedures (no database state)
  ✅ Single-session focus (Main Chat coordination)
  ✅ No schema maintenance requirements

[COST ANALYSIS]
CLI Mode:
  Infrastructure: Redis only (~$10/month)
  Per-task cost: $0.050-0.150
  Total: Low infrastructure + low execution
  Use Case: Single developer, interactive iteration

Trigger.dev Self-Hosted:
  PostgreSQL: ~$30-50/month
  Redis: ~$10-20/month
  MinIO (S3-compatible): ~$20-30/month
  ClickHouse (analytics): ~$50-100/month
  Subtotal Infrastructure: ~$110-200/month
  Per-task cost: $0.050/iteration + infrastructure
  Total: High infrastructure + moderate execution
  Use Case: Teams, scheduled jobs, compliance requirements

Trigger.dev Cloud (SaaS):
  Runs entirely on trigger.dev infrastructure
  Usage-based pricing (~$99+ monthly for production)
  No self-hosted infrastructure required
  Use Case: Managed service, no DevOps overhead

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
Max Concurrent Jobs 20/iteration       100+ (configurable) Variable

[WHEN TO USE EACH]
Use CLI Mode when:
  - Single developer or small team
  - Interactive workflow (Main Chat driven)
  - Cost sensitivity (<$1K/month infrastructure budget)
  - Fast iteration cycles (development mode)
  - No audit trail requirements
  - Execution time <30 minutes

Use Trigger.dev when:
  - Multi-team environment (3+ teams)
  - Background scheduled jobs (cron, webhooks)
  - Execution time >30 minutes (overnight batch)
  - Audit trail required (compliance, SOC 2)
  - High concurrency (10+ jobs simultaneously)
  - Webhook integrations (GitHub, Slack, APIs)
  - Cost justification (infrastructure < execution savings)

================================================================================
PART 2: TRIGGER.DEV EXECUTION FLOW
================================================================================

[USER INVOCATION PATTERNS]

Pattern 1: Webhook Event Trigger (External System)
  External Service (GitHub, Slack, Zapier, etc.)
    ↓ (HTTP POST to webhook endpoint)
  Trigger.dev Webhook Handler
    ↓
  Event parsed and validated
    ↓
  Job added to PostgreSQL job queue
    ↓
  Background worker claims job
    ↓
  Agent container spawned
    ↓
  Results stored in PostgreSQL
    ↓
  User views status in dashboard
    ↓
  Optional: Webhook sent to external system

Pattern 2: Slash Command Integration (CLI Bridge Mode)
  /cfn-loop-trigger "task" --mode=standard --provider=kimi
    ↓
  Main Chat invokes Trigger.dev API (programmatic)
    ↓
  Job created via REST API endpoint
    ↓
  [Same as Pattern 1 from queue onward]

Pattern 3: Scheduled Job (Cron-Based)
  Cron schedule (e.g., daily at 9:00 AM UTC)
    ↓
  Trigger.dev scheduler fire event
    ↓
  Job added to PostgreSQL queue
    ↓
  [Same as Pattern 1 from queue onward]

Pattern 4: Manual Trigger (Dashboard)
  User clicks "Run" on dashboard
    ↓
  Webhook endpoint triggered with context
    ↓
  [Same as Pattern 1 from queue onward]

[TRIGGER.DEV SYSTEM ARCHITECTURE]

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Docker Network: trigger-cfn-network                                     │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐   │
│ │ DATA PERSISTENCE LAYER (Databases)                              │   │
│ │                                                                 │   │
│ │  ┌──────────────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│ │  │ PostgreSQL           │  │ Redis        │  │ MinIO        │ │   │
│ │  │ - Job metadata       │  │ - Job queue  │  │ - Artifacts  │ │   │
│ │  │ - Org/Projects       │  │ - Cache      │  │ - Logs       │ │   │
│ │  │ - Runs               │  │ - Locks      │  │ - Assets     │ │   │
│ │  │ - Audit trail        │  │              │  │              │ │   │
│ │  └──────────────────────┘  └──────────────┘  └──────────────┘ │   │
│ │                                                                 │   │
│ │  ┌──────────────────────────────────────────────────────────┐ │   │
│ │  │ ClickHouse (optional - real-time analytics)              │ │   │
│ │  │ - Job execution metrics                                  │ │   │
│ │  │ - Performance timelines                                  │ │   │
│ │  │ - Cost attribution                                       │ │   │
│ │  └──────────────────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐   │
│ │ ORCHESTRATION LAYER (Trigger.dev Platform)                      │   │
│ │                                                                 │   │
│ │  ┌──────────────────────────────────────────────────────────┐ │   │
│ │  │ Trigger.dev Webapp (Port 3040)                           │ │   │
│ │  │ - Dashboard UI (Remix framework)                         │ │   │
│ │  │ - Job status visualization                              │ │   │
│ │  │ - Team/org management                                   │ │   │
│ │  │ - Job execution history                                 │ │   │
│ │  └──────────────────────────────────────────────────────────┘ │   │
│ │                                                                 │   │
│ │  ┌──────────────────────────────────────────────────────────┐ │   │
│ │  │ Trigger.dev API (Port 3000)                              │ │   │
│ │  │ - Job creation/management                               │ │   │
│ │  │ - Webhook endpoints                                     │ │   │
│ │  │ - Scheduled job coordination                            │ │   │
│ │  │ - Event distribution                                    │ │   │
│ │  └──────────────────────────────────────────────────────────┘ │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐   │
│ │ WORKER LAYER (Persistent Background Workers)                    │   │
│ │                                                                 │   │
│ │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │   │
│ │  │ Worker 1         │  │ Worker 2         │  │ Worker N     │ │   │
│ │  │ - Claims jobs    │  │ - Claims jobs    │  │ - Claims jobs│ │   │
│ │  │ - Spawns agents  │  │ - Spawns agents  │  │ - Spawns     │ │   │
│ │  │ - Updates DB     │  │ - Updates DB     │  │ - Updates DB │ │   │
│ │  └──────────────────┘  └──────────────────┘  └──────────────┘ │   │
│ │                                                                 │   │
│ │  Each worker:                                                   │   │
│ │  - Monitors Redis job queue                                    │   │
│ │  - Spawns agent containers on-demand                           │   │
│ │  - Updates PostgreSQL with job status                          │   │
│ │  - Stores results in MinIO                                     │   │
│ │  - Reports metrics to ClickHouse                               │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐   │
│ │ AGENT LAYER (On-Demand Agent Containers)                        │   │
│ │                                                                 │   │
│ │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│ │  │ Agent 1      │  │ Agent 2      │  │ Agent N      │          │   │
│ │  │ - Exec work  │  │ - Exec work  │  │ - Exec work  │          │   │
│ │  │ - Report via │  │ - Report via │  │ - Report via │          │   │
│ │  │   webhook    │  │   webhook    │  │   webhook    │          │   │
│ │  │ - Exit       │  │ - Exit       │  │ - Exit       │          │   │
│ │  └──────────────┘  └──────────────┘  └──────────────┘          │   │
│ │                                                                 │   │
│ │  Spawned on-demand by workers, exit after completion           │   │
│ │  Ephemeral (same pattern as CLI mode agents)                   │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

[EXECUTION FLOW - WEBHOOK TRIGGERED]

1. External Service sends webhook to Trigger.dev
   POST /api/v1/webhooks/trigger-cfn/agent-request
   Body: { taskId: "task-001", description: "Fix bugs", mode: "standard" }

2. Trigger.dev API handler validates and creates job
   INSERT INTO jobs (id, trigger_id, status, payload)
   VALUES ('job-001', 'webhook-handler', 'QUEUED', '...')

3. Database triggers event publication
   Redis LPUSH job:queue job-001

4. Worker process claims job
   RPOP job:queue → job-001
   SELECT * FROM jobs WHERE id='job-001'

5. Worker spawns agent container
   docker run -e JOB_ID=job-001 -e TASK_ID=task-001 cfn-agent:latest

6. Agent executes work
   Runs CFN Loop or task execution
   Writes results to workspace

7. Agent reports completion via webhook
   POST http://trigger:3000/api/v1/webhooks/job-001/complete
   Body: { status: "success", testsPassed: 95, artifacts: [...] }

8. Trigger.dev processes completion webhook
   UPDATE jobs SET status='COMPLETED', output='...'
   INCR completed_count

9. Workflow continues (if configured)
   Next stage in CFN Loop triggered automatically

10. Dashboard and user are updated
    User can view results in dashboard
    Optional: External webhook sent to original caller

================================================================================
PART 3: PROVIDER ROUTING SYSTEM
================================================================================

[PROVIDER SELECTION MATRIX]
Provider routing in Trigger.dev allows job-level, worker-level, and
global configuration of AI providers (Z.ai, Kimi, Anthropic, OpenRouter, etc).

AVAILABLE PROVIDERS:
  zai          Z.ai (cost-optimized, glm-4.6 model)
  kimi         Kimi (mid-range quality)
  anthropic    Anthropic Claude (premium quality)
  openrouter   OpenRouter (400+ models)
  max          Anthropic (highest quality)
  gemini       Google Gemini (via OpenRouter)
  xai          XAi Grok (Anthropic-compatible API)

[JOB-LEVEL CONFIGURATION]

Method 1: Environment Variable (Worker Injects)
  export PROVIDER=kimi
  export MODEL=claude-3.5-sonnet
  docker run cfn-agent:latest

Method 2: Job Payload Specification
  Webhook payload includes provider preference:
  {
    "taskId": "task-001",
    "description": "Fix auth bugs",
    "provider": "kimi",
    "model": "claude-3.5-sonnet"
  }

Method 3: PostgreSQL Job Configuration
  INSERT INTO jobs (provider, model, mode)
  VALUES ('kimi', 'claude-3.5-sonnet', 'standard')

[WORKER-LEVEL CONFIGURATION]

Trigger.dev workers can be configured with preferred providers:
```yaml
worker:
  id: "worker-1"
  provider: "zai"        # Default for all jobs this worker claims
  model: "glm-4.6"
  max_parallel: 4
```

Multiple worker pools with different providers:
- Worker Pool 1 (Z.ai): Cost-optimized, handles volume work
- Worker Pool 2 (Kimi): Mid-range quality
- Worker Pool 3 (Anthropic): Premium quality, critical tasks

Job routing based on required quality:
```javascript
function selectWorkerPool(job) {
  if (job.mode === 'enterprise') return workerPool.anthropic;
  if (job.mode === 'standard') return workerPool.kimi;
  if (job.mode === 'mvp') return workerPool.zai;
}
```

[GLOBAL CONFIGURATION]

Default provider in environment:
```bash
export CFN_DEFAULT_PROVIDER=zai
export CFN_DEFAULT_MODEL=glm-4.6
```

Fallback behavior:
1. Check job-specific provider (if set)
2. Check worker-level provider (if set)
3. Check global default (CFN_DEFAULT_PROVIDER)
4. Fall back to Z.ai glm-4.6 (hardcoded default)

[COST OPTIMIZATION STRATEGIES]

Strategy 1: Tier-Based Routing
  Layer 1 (45%): Z.ai (glm-4.6) for simple fixes
  Layer 2 (35%): Kimi for moderate complexity
  Layer 3 (15%): Anthropic for complex analysis
  Layer 4 (5%): OpenRouter for specialized tasks

Strategy 2: Mode-Based Routing
  MVP mode: Z.ai (lowest cost, acceptable quality)
  Standard mode: Kimi (balanced cost/quality)
  Enterprise mode: Anthropic (premium quality)

Strategy 3: Time-Based Routing
  Off-peak hours: Z.ai (cost optimization)
  Peak hours: Anthropic (quality for urgent tasks)

Strategy 4: Provider-Specific Fallback
  Primary: Kimi (mid-range cost/quality)
  Fallback 1: Z.ai (if Kimi unavailable, lower cost)
  Fallback 2: Anthropic (if Z.ai unavailable, higher quality)
  Fallback 3: OpenRouter (access alternative models)

[DOCKER ENVIRONMENT INJECTION]

Worker spawns agent with provider context:
```bash
docker run \
  -e PROVIDER=kimi \
  -e MODEL=claude-3.5-sonnet \
  -e TASK_ID=task-001 \
  -e JOB_ID=job-001 \
  -e ANTHROPIC_API_KEY="..." \
  -e KIMI_API_KEY="..." \
  -e ZAI_API_KEY="..." \
  cfn-agent:latest
```

Agent selects provider at runtime:
```bash
#!/bin/bash
# In agent container
if [ "$PROVIDER" = "kimi" ]; then
  export API_KEY="$KIMI_API_KEY"
  MODEL="${MODEL:-claude-3.5-sonnet}"
elif [ "$PROVIDER" = "anthropic" ]; then
  export API_KEY="$ANTHROPIC_API_KEY"
  MODEL="${MODEL:-claude-opus}"
else
  # Default to Z.ai
  export API_KEY="$ZAI_API_KEY"
  MODEL="${MODEL:-glm-4.6}"
fi

claude-code-cli --provider="$PROVIDER" --model="$MODEL" ...
```

================================================================================
PART 4: REDIS COORDINATION PROTOCOLS
================================================================================

[JOB QUEUE PATTERNS]

Trigger.dev uses Redis as a fast job queue layer, with PostgreSQL
as persistent storage. Both are synchronized.

Queue Operations:
```
job:queue            LIST    [job_ids in FIFO order]
job:claimed          SET     {job_ids currently assigned}
job:results:{id}     HASH    {job_id: result_data}
```

Worker Claims Job (Atomic):
```bash
# Pop next job from queue
RPOP job:queue → "job-001"

# Add to claimed set (timeout: 30 minutes)
SADD job:claimed "job-001"

# Store claim info
HSET job:claims:{worker-id} job-001 "{timestamp: ..., status: ...}"
```

Worker Reports Completion:
```bash
# Remove from claimed
SREM job:claimed "job-001"

# Store result
HSET job:results:job-001 {
  status: "completed",
  output: "...",
  duration_seconds: 145,
  completed_at: "2025-11-24T10:30:45Z"
}

# Set result expiry (24 hours)
EXPIRE job:results:job-001 86400
```

[WORKER-TO-AGENT SIGNALING]

Agent containers report completion via webhooks, not direct Redis.
Worker polls Redis for agent results and updates database.

Signal Format (Redis key):
```
cfn:worker:{worker-id}:signals
  - Agent execution signal
  - Test completion signal
  - Error signal
```

Signal Payload:
```json
{
  "agentId": "agent-001",
  "jobId": "job-001",
  "taskId": "task-001",
  "status": "completed",
  "timestamp": "2025-11-24T10:30:45Z",
  "metrics": {
    "duration_seconds": 145,
    "tests_passed": 95,
    "tests_total": 100
  },
  "artifacts": {
    "logs": "s3://...",
    "results": "s3://..."
  }
}
```

Worker Processing:
```bash
# Listen for signals (blocking)
BRPOP cfn:worker:{worker-id}:signals 30s

# Process signal and update PostgreSQL
UPDATE jobs SET status='COMPLETED', output='{signal}'
```

[TASK ID PREFIXING]

Trigger.dev uses different task ID prefixes than CLI mode:
- CLI mode: `cli:task-{id}` or just `{sanitized-id}`
- Trigger.dev: `trigger:job-{id}` or `trigger:workflow-{id}`

Prefixing Rules:
```
CLI task queues:     cfn:mainchat:signal:cli:{task-id}
Trigger job queues:  job:queue, cfn:worker:{id}:signals
CFN Loop Queue:      cfn:task-pool for both modes (unified)

Within Trigger.dev:
  Job ID: trigger:job-{uuid}
  Workflow ID: trigger:workflow-{uuid}
  Run ID: trigger:run-{uuid}
  Agent ID: cfn-agent-{job-id}-{iteration}
```

[TIMEOUT HANDLING AND POLLING INTERVALS]

Agent Timeout (timeout for agent to complete):
- Default: 30 minutes
- Configurable per job
- If exceeded: job marked as FAILED, worker moves to next

Worker Polling Interval:
- Check Redis job queue: Every 1 second
- Check signal Redis: Every 5 seconds (BRPOP timeout: 30s)
- Check PostgreSQL for state changes: Every 10 seconds

Claim Timeout (timeout before claim expires):
- Default: 30 minutes
- If exceeded and not completed: job returned to queue
- Prevents stuck workers from blocking jobs indefinitely

Health Check Interval:
- Worker health check: Every 2 minutes
- Database connectivity: Every 5 minutes
- Redis connectivity: Every 10 seconds

Retry Strategy:
- Transient failures: Exponential backoff (1s, 2s, 4s, 8s...)
- Max retries: 3 (configurable)
- Permanent failures: Move to failed queue

================================================================================
PART 5: TRIGGER.DEV PROTOCOL REFERENCE
================================================================================

[PROTOCOL STRUCTURE INJECTED TO WORKER CONTAINERS]

Workers receive protocol context when spawning agents:

```json
{
  "protocol_version": "1.0.0",
  "trigger_context": {
    "jobId": "job-001",
    "workflowId": "cfn-loop-001",
    "runId": "run-001",
    "workerId": "worker-1",
    "organizationId": "org-cfn",
    "projectId": "project-main"
  },
  "task_context": {
    "taskId": "task-001",
    "description": "Fix TypeScript errors in frontend",
    "mode": "standard",
    "iteration": 1,
    "maxIterations": 10
  },
  "cfn_loop_context": {
    "taskDescription": "Implement user authentication",
    "loopPhase": "loop3",
    "agentType": "backend-developer",
    "provider": "kimi",
    "model": "claude-3.5-sonnet",
    "gateThreshold": 0.95,
    "consensusThreshold": 0.90
  },
  "webhook_endpoints": {
    "completion": "http://trigger:3000/api/v1/webhooks/job-001/complete",
    "heartbeat": "http://trigger:3000/api/v1/webhooks/job-001/heartbeat",
    "error": "http://trigger:3000/api/v1/webhooks/job-001/error"
  },
  "timeouts": {
    "agentExecutionSeconds": 1800,
    "webhookRetrySeconds": 30,
    "maxRetries": 3
  }
}
```

[JOB PAYLOAD FORMAT AND VALIDATION]

Webhook payload schema (when user submits job):
```json
{
  "taskId": "string (required)",
  "taskDescription": "string (required)",
  "mode": "enum: mvp | standard | enterprise (required)",
  "provider": "enum: zai | kimi | anthropic | openrouter | max (optional)",
  "model": "string (optional, overrides default for provider)",
  "metadata": {
    "userId": "string",
    "teamId": "string",
    "source": "string (webhook | cli | dashboard | api)",
    "priority": "enum: low | normal | high (optional)"
  }
}
```

Payload validation in Trigger.dev API:
```typescript
function validateJobPayload(payload: unknown): JobPayload {
  // 1. Check required fields
  if (!payload.taskId || typeof payload.taskId !== 'string') {
    throw new ValidationError('taskId required and must be string');
  }
  if (!payload.taskDescription || typeof payload.taskDescription !== 'string') {
    throw new ValidationError('taskDescription required and must be string');
  }
  if (!['mvp', 'standard', 'enterprise'].includes(payload.mode)) {
    throw new ValidationError('mode must be one of: mvp, standard, enterprise');
  }

  // 2. Sanitize task ID
  payload.taskId = sanitizeTaskId(payload.taskId);

  // 3. Apply defaults
  if (!payload.provider) payload.provider = CFN_DEFAULT_PROVIDER;
  if (!payload.model) payload.model = getDefaultModel(payload.provider);

  return payload;
}
```

[AGENT SIGNAL FORMAT TO WORKERS]

Agent completion webhook (sent by agent to Trigger.dev):
```json
POST /api/v1/webhooks/job-{jobId}/complete
{
  "agentId": "cfn-agent-job-001-0",
  "jobId": "job-001",
  "taskId": "task-001",
  "status": "success",
  "duration_seconds": 145,
  "timestamp": "2025-11-24T10:30:45Z",
  "results": {
    "tests_passed": 95,
    "tests_total": 100,
    "pass_rate": 0.95,
    "artifacts": {
      "logs": "minio://cfn-bucket/job-001/logs.txt",
      "report": "minio://cfn-bucket/job-001/report.json"
    }
  },
  "confidence_score": 0.92,
  "deliverables": {
    "files_modified": ["src/api/auth.ts", "src/hooks/useAuth.ts"],
    "errors_fixed": 5,
    "new_errors": 0
  }
}
```

Worker processes signal and updates PostgreSQL:
```sql
UPDATE jobs
SET
  status = 'COMPLETED',
  completed_at = NOW(),
  output = '{...signal...}',
  test_results = '{"passed": 95, "total": 100, "rate": 0.95}'
WHERE id = 'job-001';

UPDATE runs
SET status = 'COMPLETED'
WHERE job_id = 'job-001';
```

[STATUS VALUES AND CONFIDENCE SCORING]

Job Status Transitions:
```
QUEUED
  ↓ (worker claims)
RUNNING
  ↓ (agent starts)
IN_PROGRESS
  ↓ (agent completes OR timeout)
COMPLETED | FAILED | TIMEOUT
  ↓ (if COMPLETED, check for next stage)
NEXT_STAGE_QUEUED (if Loop 2 or PO stage)
```

Run Status (for CFN Loop stages):
```
LOOP3_RUNNING      → Agents executing
LOOP3_COMPLETED    → Tests passed, awaiting validation
LOOP2_RUNNING      → Validators executing
LOOP2_COMPLETED    → Consensus reached
PO_RUNNING         → Product Owner decision
PO_COMPLETED       → PROCEED | ITERATE | ABORT
ITERATION_N        → Back to Loop 3 for iteration N
WORKFLOW_COMPLETED → Final PROCEED decision
WORKFLOW_FAILED    → ABORT decision
```

Confidence/Quality Scores:
```
Loop 3 Output: Test pass rate (0.0-1.0)
  - Calculated from: tests_passed / tests_total
  - Gated by mode threshold (MVP: 0.70, Standard: 0.95, Enterprise: 0.98)

Loop 2 Consensus: Validator agreement (0.0-1.0)
  - Calculated from: validators_agree / validators_total
  - Gated by mode threshold (MVP: 0.80, Standard: 0.90, Enterprise: 0.95)

Agent Confidence: Self-reported quality (0.0-1.0)
  - Optional: Agent asserts confidence in output
  - Used for decision weighting if present
```

================================================================================
PART 6: QUALITY GATES AND MODES
================================================================================

[MVP/STANDARD/ENTERPRISE MODE CONFIGURATION]

Each mode has specific gate thresholds and resource allocation:

MVP Mode:
  Loop 3 Gate: Test pass rate ≥ 0.70 (70%)
  Loop 2 Consensus: Validator agreement ≥ 0.80 (80%)
  Max Iterations: 5
  Time Budget: 15 minutes per iteration
  Validators: 2
  Provider: Z.ai (glm-4.6)
  Use Case: Fast prototyping, learning, quick validation

Standard Mode:
  Loop 3 Gate: Test pass rate ≥ 0.95 (95%)
  Loop 2 Consensus: Validator agreement ≥ 0.90 (90%)
  Max Iterations: 10
  Time Budget: 20 minutes per iteration
  Validators: 3-5
  Provider: Kimi (mid-range quality)
  Use Case: Production features, team development

Enterprise Mode:
  Loop 3 Gate: Test pass rate ≥ 0.98 (98%)
  Loop 2 Consensus: Validator agreement ≥ 0.95 (95%)
  Max Iterations: 15
  Time Budget: 30 minutes per iteration
  Validators: 5-7
  Provider: Anthropic (premium quality)
  Use Case: Security-critical, compliance-required, production systems

[TEST EXECUTION AND PASS RATE VALIDATION]

Test execution happens in Loop 3 (agent phase):

1. Agent downloads codebase
2. Agent runs test suite (npm test, pytest, etc.)
3. Agent captures output
4. Agent counts passing tests
5. Agent reports: { passed: N, total: M, rate: N/M }

Pass rate calculation:
```javascript
const passRate = testsPassed / testsTotal;

if (passRate >= modeGateThreshold) {
  result = 'PASS';  // Proceed to Loop 2
} else {
  result = 'FAIL';  // Wake Loop 3 for iteration
}
```

Failure handling:
```javascript
// If test pass rate < threshold
// AND iteration < maxIterations
// THEN: Emit 'ITERATE' decision
//       Wake Loop 3 agents for iteration N+1
//       Keep all context from previous iteration
//
// IF iteration >= maxIterations
// THEN: Emit 'ABORT' decision
//       Mark task as FAILED
//       Report to user/webhook
```

[POSTGRESQL STORAGE OF TEST RESULTS]

Test results stored in PostgreSQL for audit trail and analytics:

```sql
CREATE TABLE test_results (
  id UUID PRIMARY KEY,
  job_id VARCHAR NOT NULL REFERENCES jobs(id),
  run_id VARCHAR NOT NULL REFERENCES runs(id),
  iteration INTEGER NOT NULL,
  agent_id VARCHAR NOT NULL,
  tests_total INTEGER NOT NULL,
  tests_passed INTEGER NOT NULL,
  pass_rate NUMERIC(5,4) NOT NULL,
  failed_tests TEXT[],
  test_output TEXT,
  execution_duration_seconds INTEGER,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE loop_results (
  id UUID PRIMARY KEY,
  run_id VARCHAR NOT NULL REFERENCES runs(id),
  loop_phase VARCHAR NOT NULL, -- 'LOOP3', 'LOOP2', 'PO'
  iteration INTEGER NOT NULL,
  status VARCHAR NOT NULL,     -- 'PASS', 'FAIL', 'PENDING'
  metric_value NUMERIC(5,4),   -- test pass rate or consensus
  gate_threshold NUMERIC(5,4),
  decision VARCHAR,            -- 'PROCEED', 'ITERATE', 'ABORT'
  created_at TIMESTAMP DEFAULT NOW()
);
```

Query pattern for audit trail:
```sql
-- View all iterations for a task
SELECT iteration, tests_passed, tests_total, pass_rate, agent_id
FROM test_results
WHERE run_id = 'run-001'
ORDER BY iteration ASC;

-- Check if gate was passed
SELECT * FROM loop_results
WHERE run_id = 'run-001' AND loop_phase = 'LOOP3'
ORDER BY iteration DESC
LIMIT 1;
```

[MODE EXECUTION PATTERNS WITH EXAMPLES]

Example 1: MVP Mode Success (Single Iteration)

```
Iteration 1:
  Agents: 2 (Z.ai)
  Tests: 100 total
  Results: 75 passed (75% pass rate)
  Gate: 75% ≥ 70% threshold → PASS
  Decision: PROCEED to Loop 2

Loop 2:
  Validators: 2
  Consensus: 2/2 agree → 100% ≥ 80% → PASS

Product Owner:
  Decision: PROCEED

Status: COMPLETED (1 iteration, ~5 minutes)
```

Example 2: Standard Mode Iteration (2 Iterations)

```
Iteration 1:
  Agents: 4 (Kimi)
  Tests: 200 total
  Results: 180 passed (90% pass rate)
  Gate: 90% < 95% threshold → FAIL
  Decision: ITERATE

Iteration 2:
  Agents: 4 (Kimi)
  Tests: 200 total
  Results: 195 passed (97.5% pass rate)
  Gate: 97.5% ≥ 95% threshold → PASS
  Decision: PROCEED to Loop 2

Loop 2:
  Validators: 4
  Consensus: 3/4 agree → 75% < 90% → FAIL
  Decision: ITERATE Loop 2

Loop 2 (Retry):
  Validators: 5 (increased pool)
  Consensus: 5/5 agree → 100% ≥ 90% → PASS

Product Owner:
  Decision: PROCEED

Status: COMPLETED (2 iterations + Loop 2 retry, ~15 minutes)
```

Example 3: Enterprise Mode with Max Iterations

```
Iteration 1:
  Agents: 6 (Anthropic)
  Tests: 500 total
  Results: 475 passed (95% pass rate)
  Gate: 95% < 98% threshold → FAIL
  Decision: ITERATE

Iteration 2:
  Results: 485 passed (97% pass rate)
  Gate: 97% < 98% threshold → FAIL
  Decision: ITERATE

Iteration 3:
  Results: 490 passed (98% pass rate)
  Gate: 98% ≥ 98% threshold → PASS
  Decision: PROCEED to Loop 2

Loop 2:
  Validators: 6
  Consensus: 6/6 agree → 100% ≥ 95% → PASS

Product Owner:
  Decision: PROCEED

Status: COMPLETED (3 iterations, ~25 minutes)
```

================================================================================
PART 7: MULTI-WORKTREE DOCKER ISOLATION
================================================================================

[COMPOSE_PROJECT_NAME ISOLATION PER BRANCH]

When using git worktrees with Trigger.dev, each branch gets isolated
containers and services via COMPOSE_PROJECT_NAME environment variable.

Setup for Multi-Worktree Development:

```bash
# Branch 1: main
cd /project
export COMPOSE_PROJECT_NAME=cfn-main
docker-compose -f docker-compose.yml up -d trigger-api trigger-webapp

# Branch 2: feature-auth (different worktree)
cd /project/../feature-auth
export COMPOSE_PROJECT_NAME=cfn-feature-auth
docker-compose -f docker-compose.yml up -d trigger-api trigger-webapp
```

Results:
- Branch 1 services: cfn-main_trigger-api_1, cfn-main_trigger-webapp_1
- Branch 2 services: cfn-feature-auth_trigger-api_1, cfn-feature-auth_trigger-webapp_1
- No port conflicts (different service networks)
- Isolated PostgreSQL databases per branch
- Isolated Redis instances per branch

[PORT OFFSET CALCULATION FOR PARALLEL DEVELOPMENT]

Automatic port offset based on branch name hash:

```bash
function calculate_port_offset() {
  local branch=$1
  local hash=$(echo "$branch" | md5sum | cut -c1-8)
  local offset=$((0x$hash % 1000))  # 0-999 range
  echo $offset
}

# Example branch offsets:
# main → offset: 0
# feature-auth → offset: 42
# bugfix-validation → offset: 78
# hotfix-security → offset: 156
```

Port allocation per branch:

```
Main Branch (offset: 0):
  Trigger API: 3000 + 0 = 3000
  Trigger Webapp: 3040 + 0 = 3040
  PostgreSQL: 5432 + 0 = 5432
  Redis: 6379 + 0 = 6379

Feature Branch (offset: 42):
  Trigger API: 3000 + 42 = 3042
  Trigger Webapp: 3040 + 42 = 3082
  PostgreSQL: 5432 + 42 = 5474
  Redis: 6379 + 42 = 6421

Bugfix Branch (offset: 78):
  Trigger API: 3000 + 78 = 3078
  Trigger Webapp: 3040 + 78 = 3118
  PostgreSQL: 5432 + 78 = 5510
  Redis: 6379 + 78 = 6457
```

Configuration in docker-compose.yml:

```yaml
version: '3.8'
services:
  trigger-api:
    ports:
      - "${TRIGGER_API_PORT:-3000}:3000"

  trigger-webapp:
    ports:
      - "${TRIGGER_WEBAPP_PORT:-3040}:3040"

  postgres:
    ports:
      - "${POSTGRES_PORT:-5432}:5432"

  redis:
    ports:
      - "${REDIS_PORT:-6379}:6379"
```

Script to apply offset:

```bash
#!/bin/bash
# scripts/docker/run-in-worktree.sh

BRANCH=$(git rev-parse --abbrev-ref HEAD)
OFFSET=$(calculate_port_offset "$BRANCH")

export TRIGGER_API_PORT=$((3000 + OFFSET))
export TRIGGER_WEBAPP_PORT=$((3040 + OFFSET))
export POSTGRES_PORT=$((5432 + OFFSET))
export REDIS_PORT=$((6379 + OFFSET))
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"

docker-compose "$@"
```

[SERVICE DISCOVERY PATTERNS]

Within Docker networks, use **service names** not container names:

Correct Service Discovery:
```bash
# Within agent container, connect to Redis
redis-cli -h redis -p 6379  # Resolves via Docker DNS to internal IP

# Within agent, connect to PostgreSQL
psql -h postgres -U postgres -d cfn_db

# Within agent, call Trigger API
curl http://trigger-api:3000/api/v1/status
```

Service names automatically resolve to dynamic IPs:
- `redis` → Docker DNS resolves to cfn-main_redis_1 (10.0.0.2)
- `postgres` → Docker DNS resolves to cfn-main_postgres_1 (10.0.0.3)
- `trigger-api` → Docker DNS resolves to cfn-main_trigger-api_1 (10.0.0.4)

Container names (NOT recommended):
- ❌ cfn-main_redis_1 (not guaranteed to resolve)
- ❌ cfn-feature-auth_postgres_1 (cross-network won't work)

[NETWORK ISOLATION BETWEEN WORKTREES]

Each worktree has its own Docker network:

```bash
# Main branch network
docker network ls | grep cfn-main_default

# Feature branch network (isolated)
docker network ls | grep cfn-feature-auth_default

# Agents can ONLY communicate within their network
# cfn-main agents ❌ cannot reach cfn-feature-auth services
# This is by design (complete isolation)
```

Cross-Network Communication (if needed):

```bash
# Create shared network for multi-branch coordination
docker network create cfn-shared

# Connect specific containers to shared network
docker network connect cfn-shared cfn-main_trigger-api_1
docker network connect cfn-shared cfn-feature-auth_trigger-api_1

# Now both can communicate via service names on shared network
# Risk: Increased complexity, potential data leaks
# Recommendation: Use separate networks per branch (isolation over convenience)
```

================================================================================
PART 8: PERFORMANCE OPTIMIZATION
================================================================================

[COST ANALYSIS: INFRASTRUCTURE + EXECUTION COSTS]

Infrastructure Costs (Monthly):

Trigger.dev Self-Hosted:
  PostgreSQL (managed): $30-50/month
  Redis (managed): $10-20/month
  MinIO (S3-compatible, 1TB): $20-30/month
  ClickHouse (optional analytics): $50-100/month
  Network bandwidth: ~$5-10/month
  Subtotal: $115-210/month (baseline)

Scaling to Multiple Teams:
  2 teams: ~$200/month (shared infrastructure)
  5 teams: ~$300/month
  10 teams: ~$450/month
  (Economies of scale: shared database, Redis, storage)

CLI Mode Baseline:
  Redis (managed): $10-20/month
  Total: $10-20/month

Execution Costs:

Per-Agent Cost (based on provider):
  Z.ai (glm-4.6): $0.50 per 1M tokens (lowest)
  Kimi: $2 per 1M tokens
  Anthropic: $15 per 1M tokens (premium)

Typical CFN Loop Execution:
  Iteration 1 (4 agents): 400K tokens × $0.50-15/1M = $0.20-6.00
  Iteration 2 (2 agents): 200K tokens × $0.50-15/1M = $0.10-3.00
  Loop 2 validation (4 validators): 200K tokens × $0.50-15/1M = $0.10-3.00
  Product Owner: 100K tokens × $0.50-15/1M = $0.05-1.50
  Total execution: ~$0.45-13.50 per task

Cost Comparison:

                    Low Volume       Medium Volume      High Volume
                    (10 tasks/mo)    (100 tasks/mo)     (1000 tasks/mo)
===============================================================================
CLI Mode:
  Infrastructure:    $10/month        $10/month          $10/month
  Execution (Z.ai):  $5/month         $50/month          $500/month
  TOTAL:             $15/month        $60/month          $510/month

Trigger.dev (Z.ai):
  Infrastructure:    $150/month       $150/month         $150/month
  Execution (Z.ai):  $5/month         $50/month          $500/month
  TOTAL:             $155/month       $200/month         $650/month

Trigger.dev (Kimi):
  Infrastructure:    $150/month       $150/month         $150/month
  Execution (Kimi):  $20/month        $200/month         $2000/month
  TOTAL:             $170/month       $350/month         $2150/month

Trigger.dev (Anthropic):
  Infrastructure:    $150/month       $150/month         $150/month
  Execution (Ant):   $130/month       $1300/month        $13000/month
  TOTAL:             $280/month       $1450/month        $13150/month

Cost Decision Matrix:
  10 tasks/month: CLI mode ($15 vs $155+)
  100 tasks/month: Break-even around 50 tasks/month
  1000 tasks/month: Trigger.dev if multi-team (fixed infrastructure cost amortized)
```

[EXECUTION SPEED: WAVE-BASED PARALLEL SPAWNING VS CLI SEQUENTIAL]

CLI Mode (Sequential Spawning):
  Wave 1: 4 agents spawned sequentially (500ms delay between)
    ├─ Agent 1: 0ms start
    ├─ Agent 2: 500ms start
    ├─ Agent 3: 1000ms start
    └─ Agent 4: 1500ms start

  Total spawn time: 1500ms + 500ms for startup = 2000ms
  Agent execution (average): 180 seconds
  Total: ~2.5 minutes (limited by slowest agent)

Trigger.dev Wave-Based Spawning:
  Wave 1: All 4 agents spawned in parallel via jobs (no sequential delay)
    ├─ Agent 1: 0ms start (queued immediately)
    ├─ Agent 2: 0ms start (queued immediately)
    ├─ Agent 3: 0ms start (queued immediately)
    └─ Agent 4: 0ms start (queued immediately)

  Total spawn time: Minimal (job queue LPUSH is fast)
  Worker claims and spawns: Parallel (multiple workers)
  Agent execution (average): 180 seconds
  Total: ~3 minutes (same execution time, but better parallelism for multiple waves)

Wave Analysis:

For small tasks (single wave):
  CLI mode: 2.5 minutes
  Trigger.dev: 2.5 minutes (similar)

For large tasks (multiple waves):
  CLI mode (sequential waves): 2.5 + 2.5 + 2.5 + 2.5 = 10 minutes
  Trigger.dev (parallel waves): 2.5 + 2.5 + 2.5 (workers handle all) = ~5 minutes
  Advantage: Trigger.dev ~2x faster for multi-wave tasks

For continuous workloads (many jobs queued):
  CLI mode: Each main chat waits for full execution
  Trigger.dev: Workers continuously claim and execute jobs
  Advantage: Trigger.dev handles higher throughput

[RESOURCE UTILIZATION: MEMORY, NETWORK, STORAGE]

Memory Utilization:

CLI Mode:
  Main Chat: 512MB (during task execution)
  Redis: 100-500MB (job queue + results)
  Agent containers: 512MB-1GB each (configurable)
  Total: 600MB - 5GB (depending on agent count)

Trigger.dev:
  PostgreSQL: 500MB - 2GB (metadata + audit trail)
  Redis: 200-1GB (job queue, cache, locks)
  Trigger API: 300-500MB
  Trigger Webapp: 200-400MB
  MinIO: 100-500MB (artifact storage)
  ClickHouse: 200-500MB (optional analytics)
  Agent containers: 512MB-1GB each (same as CLI)
  Total: 2-5GB baseline + agents

Network Utilization:

CLI Mode:
  Main Chat ↔ Redis: Polling/blocking (low bandwidth)
  Redis ↔ Agents: Results storage (10-100MB per task)
  Total bandwidth: Low (~10-50MB per hour of operation)

Trigger.dev:
  API ↔ Workers: Job claims via Redis (low bandwidth)
  Workers ↔ Agents: Docker daemon communication (local)
  Agents ↔ Webhook callbacks: Result reporting (10-100MB per task)
  Dashboard ↔ API: WebSocket for real-time updates (low bandwidth)
  Analytics: Periodic ClickHouse submissions (optional)
  Total bandwidth: Medium (~20-100MB per hour)

Storage Utilization:

CLI Mode:
  Redis persistence (RDB): ~50-200MB
  Workspace files: Varies (project-dependent)
  No artifact archival

Trigger.dev:
  PostgreSQL data: 100MB - 5GB (depending on task volume and retention)
  PostgreSQL backups: Same size × retention days
  MinIO artifacts: 1-10MB per task (logs, results)
  ClickHouse analytics: 10-50MB per task (optional)
  Total storage: 500MB - 50GB (depending on retention policy)

Retention Policies (Configurable):

CLI Mode:
  Task history: Not persisted (24h Redis TTL)
  No cleanup needed

Trigger.dev:
  Job history: Configurable retention (default: 30 days)
  Test results: Configurable retention (default: 90 days)
  Artifacts: Configurable retention (default: 30 days)
  PostgreSQL: Automatic backups (daily, configurable)

[THROUGHPUT COMPARISON (JOBS/HOUR)]

Scenario: 4-hour workday with continuous CFN Loop task submissions

CLI Mode:
  Avg task duration: 3 iterations × 3 minutes = 9 minutes
  Main Chat must wait for full execution
  Throughput: 4 tasks/hour (sequential, one Main Chat)
  Max throughput: 4 tasks/hour

Trigger.dev:
  Avg job duration: 3 minutes (from queue to completion)
  Multiple workers claim jobs in parallel
  3 workers: 3 workers × (60 min / 3 min per task) = 60 tasks/hour
  5 workers: 100 tasks/hour
  10 workers: 200 tasks/hour
  Scalable based on worker pool size

Cost per task at scale:
  CLI mode: Fixed cost (no scaling)
  Trigger.dev: Linear scaling (add workers for more throughput)

================================================================================
PART 9: COMMON USE CASES AND PATTERNS
================================================================================

[SCHEDULED BACKGROUND JOBS (CRON TRIGGERS)]

Use Case: Daily TypeScript validation on main branch

```yaml
# docker-compose.yml snippet
triggers:
  daily-validation:
    type: schedule
    cron: "0 9 * * *"  # 9 AM UTC daily
    payload:
      taskId: "daily-validation"
      description: "Validate TypeScript compilation"
      mode: "standard"
      provider: "zai"
```

CFN Loop Configuration:
```typescript
trigger.on.schedule({
  cron: '0 9 * * *',
  async handler() {
    // Automatically triggered every day at 9 AM
    // Spawns Loop 3 agents
    // Runs tests
    // Reports results to Slack webhook
    // Updates dashboard with metrics
  }
});
```

Workflow:
```
9:00 AM (UTC):
  Job created in PostgreSQL
  Worker claims job
  Agents spawned (2-4 based on codebase size)
  Tests run (~5 minutes)
  Results stored in PostgreSQL
  Slack notification sent
  Dashboard updated
  Team alerted if failures

Next Day 9:00 AM:
  Process repeats
```

[WEBHOOK-DRIVEN WORKFLOWS (GITHUB, SLACK, EXTERNAL APIS)]

Use Case: GitHub PR validation

```typescript
// GitHub webhook handler
trigger.on.webhook({
  name: 'github.pr.opened',
  handler: async (payload) => {
    const pr = payload.pull_request;

    // Create CFN Loop job
    await io.createJob('cfn-loop', {
      taskId: `pr-${pr.number}`,
      description: `Validate PR ${pr.number}: ${pr.title}`,
      mode: 'standard',
      source: 'github',
      prNumber: pr.number
    });
  }
});
```

Workflow:
```
Developer opens PR on GitHub
  ↓
GitHub sends webhook to Trigger.dev
  ↓
Job created for CFN Loop
  ↓
Workers spawn agents
  ↓
Agents run tests on PR code
  ↓
Results posted back to GitHub (PR comment)
  ↓
Blocks merge if test rate < threshold
  ↓
Developer receives feedback in PR
```

[MULTI-TEAM COST ALLOCATION]

Use Case: 5 teams, shared Trigger.dev infrastructure

PostgreSQL schema for cost tracking:

```sql
CREATE TABLE team_jobs (
  id UUID PRIMARY KEY,
  team_id VARCHAR NOT NULL,
  job_id VARCHAR NOT NULL REFERENCES jobs(id),
  task_description TEXT,
  provider VARCHAR,
  estimated_cost NUMERIC(10,4),
  actual_cost NUMERIC(10,4),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE team_monthly_costs (
  month_year VARCHAR,
  team_id VARCHAR,
  infrastructure_share NUMERIC(10,4),  -- Fixed cost / team count
  execution_cost NUMERIC(10,4),        -- Sum of actual costs
  total_cost NUMERIC(10,4),
  PRIMARY KEY (month_year, team_id)
);
```

Cost Calculation:

```
Fixed Infrastructure Cost: $150/month
Number of Teams: 5
Cost Per Team (fixed): $150 / 5 = $30/month

Team A:
  Fixed share: $30
  Execution (40 tasks @ $0.45 avg): $18
  Total: $48/month

Team B:
  Fixed share: $30
  Execution (10 tasks @ $0.45 avg): $4.50
  Total: $34.50/month

...Total: $150 + execution costs
```

[COMPLIANCE AUDIT TRAILS]

Use Case: SOC 2 Type II compliance

PostgreSQL audit trail:

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  action VARCHAR NOT NULL,           -- 'JOB_CREATED', 'JOB_COMPLETED', etc
  user_id VARCHAR,
  team_id VARCHAR,
  job_id VARCHAR,
  old_state JSONB,
  new_state JSONB,
  change_reason VARCHAR,
  ip_address INET
);

-- Every job state change is logged
-- Example: JOB_CREATED by user-123 from team-456 at 2025-11-24 10:30:00
-- All test results stored with immutable timestamps
-- All agent outputs archived in MinIO with checksums
```

Compliance Queries:

```sql
-- Audit trail for specific task
SELECT * FROM audit_log
WHERE job_id = 'job-001'
ORDER BY timestamp ASC;

-- Who modified results
SELECT action, user_id, timestamp
FROM audit_log
WHERE job_id = 'job-001' AND action LIKE '%UPDATE%';

-- All executions by team in date range
SELECT COUNT(*) FROM jobs
WHERE team_id = 'team-456'
  AND created_at >= '2025-11-01'
  AND created_at < '2025-12-01';

-- Generate compliance report
SELECT
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as job_count,
  SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) as failed
FROM jobs
WHERE created_at >= '2025-11-01'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day ASC;
```

[HIGH-THROUGHPUT BATCH PROCESSING]

Use Case: Nightly batch fix 1000 TypeScript files across 50 codebases

Architecture:

```
Queue Setup:
  1000 tasks pushed to Redis job:queue
  5 worker containers running continuously
  Each processes ~3 tasks/hour = 15 tasks/hour total

Execution:
  Hour 1: 1000 tasks → 15 completed, 985 remaining
  Hour 2: 985 → 15 completed, 970 remaining
  ...
  Hour 67: 15 → 15 completed, 0 remaining

Duration: ~67 hours (3 days of continuous 24/7 processing)

Cost:
  Infrastructure: $5/day × 3 = $15
  Execution: 1000 tasks × $0.45 = $450
  Total: $465

Alternative (CLI mode - not viable):
  Would require 1000 separate Main Chat invocations
  Not practical for batch processing
```

Worker Pool Scaling:

```
Default (1 worker):
  Throughput: 20 tasks/hour
  Time for 1000 tasks: 50 hours

Scaled (5 workers):
  Throughput: 100 tasks/hour
  Time for 1000 tasks: 10 hours
  Cost: Same (workers are stateless)

Scaled (10 workers):
  Throughput: 200 tasks/hour
  Time for 1000 tasks: 5 hours
  Cost: Same
```

================================================================================
PART 10: MIGRATION AND COMPATIBILITY
================================================================================

[MIGRATION FROM CLI MODE TO TRIGGER.DEV]

Phase 1: Infrastructure Setup (2-3 days)

```bash
# 1. Create trigger-dev docker-compose.yml
# See: docker/trigger-dev/docker-compose.yml

# 2. Deploy services
docker-compose -f docker/trigger-dev/docker-compose.yml up -d

# 3. Initialize database
docker-compose exec postgres /
  /docker-entrypoint-initdb.d/trigger-init.sql

# 4. Create organization and project
docker-compose exec postgres psql -U postgres -d trigger <<EOF
  INSERT INTO Organization (slug, title) VALUES ('cfn', 'CFN Team');
  INSERT INTO Project (slug, name, organizationId)
    VALUES ('main', 'CFN Main', (SELECT id FROM Organization WHERE slug='cfn'));
EOF

# 5. Verify endpoints
curl http://localhost:3000/api/v1/webhooks
curl http://localhost:3040/login
```

Phase 2: Job Definition (1 day)

Convert CFN Loop tasks to Trigger.dev job definitions:

```typescript
// Before (CLI mode):
/cfn-loop-cli "Fix TypeScript errors" --mode=standard

// After (Trigger.dev):
POST http://localhost:3000/api/v1/webhooks/cfn/trigger
{
  "taskId": "task-001",
  "taskDescription": "Fix TypeScript errors",
  "mode": "standard"
}
```

Phase 3: Worker Setup (1 day)

```bash
# 1. Build agent image (same as CLI mode)
docker build -f Dockerfile.agent -t cfn-agent:latest .

# 2. Deploy workers
docker-compose -f docker/trigger-dev/docker-compose.yml up -d \
  trigger-worker-1 \
  trigger-worker-2 \
  trigger-worker-3

# 3. Verify workers are claiming jobs
docker logs trigger-worker-1 --tail=10
# Output: "Claimed job job-001"
```

Phase 4: Testing (2-3 days)

```bash
# 1. Submit test task
curl -X POST http://localhost:3000/api/v1/webhooks/cfn/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "migration-test-1",
    "taskDescription": "Test TypeScript validation",
    "mode": "mvp"
  }'

# 2. Monitor execution
# View: http://localhost:3040/jobs

# 3. Verify results match CLI mode
# Compare test pass rates, artifact outputs

# 4. Iterate on 5-10 test tasks
```

Phase 5: Cutover (1 day)

```bash
# 1. Keep CLI mode running (parallel operation)
/cfn-loop-cli "Prod task 1" --mode=standard  # Still works

# 2. Route new tasks to Trigger.dev
POST http://localhost:3000/api/v1/webhooks/cfn/trigger

# 3. Monitor both systems
# CLI mode dashboard vs Trigger.dev dashboard

# 4. After 1 week of successful operation → Decommission CLI mode
```

[DUAL-MODE OPERATION STRATEGY]

Running CLI mode and Trigger.dev simultaneously:

Routing Logic:

```javascript
function routeTask(taskDescription, taskOrigin) {
  // Route based on task characteristics

  if (taskDescription.includes('cron') || taskDescription.includes('scheduled')) {
    return 'trigger-dev';  // Only Trigger.dev supports scheduling
  }

  if (taskOrigin === 'webhook') {
    return 'trigger-dev';  // Use persistent infrastructure
  }

  if (taskDescription.includes('interactive')) {
    return 'cli-mode';  // CLI mode for interactive Main Chat tasks
  }

  // Default: Route to Trigger.dev for new workloads
  return 'trigger-dev';
}
```

Example Configuration:

```yaml
routing:
  interactive-dev:
    handler: cli-mode
    conditions:
      - source: 'main-chat'
      - task_duration: '< 30 minutes'

  background-scheduled:
    handler: trigger-dev
    conditions:
      - trigger_type: 'cron'
      - trigger_type: 'webhook'

  batch-processing:
    handler: trigger-dev
    conditions:
      - job_count: '> 50'
      - source: 'batch-api'

  fallback:
    handler: trigger-dev
```

[BACKWARD COMPATIBILITY CONSIDERATIONS]

Maintaining CLI Mode Compatibility:

1. Environment Variable Compatibility
   ```bash
   # Old CLI mode variables still work
   export TASK_ID="task-001"
   export REDIS_HOST="localhost"

   # New Trigger.dev variables coexist
   export TRIGGER_API_URL="http://localhost:3000"
   export TRIGGER_JOB_ID="job-001"
   ```

2. Command Compatibility
   ```bash
   # Old CLI commands still work
   /cfn-loop-cli "task" --mode=standard

   # New Trigger.dev commands
   /cfn-loop-trigger "task" --webhook="webhook-handler"
   ```

3. Redis Compatibility
   ```bash
   # Old CLI coordination keys
   cfn:mainchat:signal:task-001

   # New Trigger.dev keys coexist
   job:queue
   cfn:worker:worker-1:signals

   # Shared unified queue (both can use)
   cfn:task-pool
   ```

[DEPRECATED COMPONENTS]

CLI Mode Deprecation Timeline:

```
Phase 1 (Weeks 1-4): Parallel Operation
  - CLI mode: Fully functional
  - Trigger.dev: New tasks routed here
  - Migration: Ongoing

Phase 2 (Weeks 5-8): Feature Parity
  - CLI mode: Maintenance mode (bug fixes only)
  - Trigger.dev: New features added here
  - Existing tasks: Can continue on either

Phase 3 (Weeks 9+): Deprecation
  - CLI mode: Marked as deprecated
  - No new tasks created in CLI
  - Existing tasks: Migrated in batches

Phase 4 (Month 4+): Sunset
  - CLI mode: Support only for critical issues
  - Trigger.dev: Sole production system
  - Documentation: Updated to remove CLI references
```

================================================================================
PART 11: TROUBLESHOOTING AND DEBUGGING
================================================================================

[CROSS-NETWORK REDIS COMMUNICATION ISSUES]

Problem: Agents cannot connect to Redis

Symptoms:
- Agent logs: "ECONNREFUSED 127.0.0.1:6379"
- Worker logs: "Redis connection timeout"
- Jobs stuck in RUNNING state

Diagnosis:
```bash
# 1. Check Redis container is running
docker-compose ps redis

# 2. Check Redis is listening
docker exec trigger-redis redis-cli ping
# Expected: PONG

# 3. Check agent can reach Redis by hostname
docker exec cfn-agent-001 ping redis
# Expected: 64 bytes from 10.0.0.2

# 4. Check network connectivity
docker network inspect trigger-cfn-network
# Verify both agent and redis are in this network
```

Solution:

```bash
# 1. Use service name (not localhost)
# ❌ WRONG: redis-cli -h 127.0.0.1 -p 6379
# ✅ CORRECT: redis-cli -h redis -p 6379

# 2. Verify network configuration
docker-compose up -d redis cfn-agent

# 3. Add agent to correct network
docker network connect trigger-cfn-network cfn-agent-001

# 4. Restart containers
docker-compose restart
```

[WORKER PROCESS FAILURES AND RECOVERY]

Problem: Worker container crashes during job processing

Symptoms:
- Worker container exits with code 1
- Jobs marked as FAILED
- Error in docker logs: "Worker process crashed"

Diagnosis:
```bash
# 1. Check recent logs
docker logs trigger-worker-1 --tail=50

# 2. Inspect exit code
docker inspect trigger-worker-1 | grep ExitCode
# 0 = normal exit
# 1 = generic error
# 137 = OOM killed

# 3. Check resource limits
docker stats trigger-worker-1
# Look for high memory usage (approaching limit)

# 4. Check job that failed
docker logs trigger-worker-1 | grep "job-001"
```

Solution:

```bash
# 1. Increase worker memory
docker-compose.yml:
  trigger-worker:
    mem_limit: 2g  # Increase from 1g

# 2. Restart failed jobs
UPDATE jobs SET status='QUEUED' WHERE status='FAILED' AND created_at > NOW() - INTERVAL '1 hour';

# 3. Monitor recovery
docker logs trigger-worker-1 -f | grep "Claimed job"

# 4. Implement health checks
docker-compose.yml:
  trigger-worker:
    healthcheck:
      test: ["CMD", "pgrep", "-f", "worker"]
      interval: 10s
      timeout: 5s
      retries: 3
```

[POSTGRESQL CONNECTION ISSUES]

Problem: Database connection failures

Symptoms:
- "FATAL: too many connections"
- "Connection refused to PostgreSQL"
- Dashboard shows "Database error"

Diagnosis:
```bash
# 1. Check database connectivity
docker exec trigger-postgres psql -U postgres -c "SELECT 1"

# 2. Check connection count
docker exec trigger-postgres psql -U postgres -c \
  "SELECT count(*) as conn_count FROM pg_stat_activity"

# 3. Check max connections
docker exec trigger-postgres psql -U postgres -c \
  "SHOW max_connections"
# Default: 100

# 4. List active connections
docker exec trigger-postgres psql -U postgres -c \
  "SELECT usename, count(*) FROM pg_stat_activity GROUP BY usename"
```

Solution:

```bash
# 1. Increase max connections
docker-compose.yml:
  postgres:
    environment:
      POSTGRES_INIT_ARGS: "-c max_connections=200"

# 2. Restart database
docker-compose restart postgres

# 3. Terminate idle connections
docker exec trigger-postgres psql -U postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle' AND query_start < NOW() - INTERVAL '1 hour'"

# 4. Monitor connections
watch 'docker exec trigger-postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity"'
```

[CONTAINER SPAWN FAILURES]

Problem: Agent containers fail to start

Symptoms:
- "docker: Error response from daemon"
- Job status stuck in "RUNNING"
- Worker logs: "Failed to spawn container"

Diagnosis:
```bash
# 1. Check Docker daemon
docker ps  # Should return container list

# 2. Check image exists
docker images | grep cfn-agent

# 3. Try spawning manually
docker run -it cfn-agent:latest /bin/bash

# 4. Check resource limits
docker info | grep -A 5 "Storage Driver"
docker system df  # Check disk space
```

Solution:

```bash
# 1. Rebuild agent image
docker build -f Dockerfile.agent -t cfn-agent:latest .

# 2. Verify image integrity
docker run --rm cfn-agent:latest echo "test"

# 3. Check disk space
df -h /var/lib/docker/

# 4. Clean up dangling images
docker image prune -f

# 5. Restart Docker daemon
sudo systemctl restart docker

# 6. Retry job
UPDATE jobs SET status='QUEUED' WHERE id='job-001'
```

[DEBUG MODE PROCEDURES]

Enabling Verbose Logging:

```bash
# Worker debug mode
docker-compose.yml:
  trigger-worker:
    environment:
      DEBUG: "true"
      LOG_LEVEL: "debug"

# Agent debug mode
docker run \
  -e DEBUG=true \
  -e LOG_LEVEL=debug \
  cfn-agent:latest

# PostgreSQL debug
docker exec trigger-postgres psql -U postgres -c \
  "ALTER SYSTEM SET log_statement='all'; SELECT pg_reload_conf();"
```

Collecting Diagnostic Information:

```bash
#!/bin/bash
# scripts/collect-diagnostics.sh

echo "=== Docker Services ==="
docker-compose ps

echo "=== Resource Usage ==="
docker stats --no-stream

echo "=== PostgreSQL Status ==="
docker exec trigger-postgres pg_isready -U postgres

echo "=== Redis Status ==="
docker exec trigger-redis redis-cli ping

echo "=== Recent Worker Logs ==="
docker logs trigger-worker-1 --tail=50

echo "=== Recent Agent Logs ==="
docker logs cfn-agent-001 --tail=50 2>/dev/null || echo "No recent agents"

echo "=== Job Queue Status ==="
docker exec trigger-redis redis-cli LLEN job:queue
docker exec trigger-redis redis-cli HGETALL job:results:latest

echo "=== Active Jobs ==="
docker exec trigger-postgres psql -U postgres -d trigger -c \
  "SELECT id, status, created_at FROM jobs ORDER BY created_at DESC LIMIT 10;"
```

================================================================================
PART 12: SECURITY AND COMPLIANCE
================================================================================

[MULTI-TENANT ISOLATION PATTERNS]

Organization-Level Isolation:

```sql
-- All data keyed by organization
CREATE TABLE Organization (
  id UUID PRIMARY KEY,
  slug VARCHAR UNIQUE NOT NULL,  -- cfn, team-a, team-b
  title VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Projects belong to organizations
CREATE TABLE Project (
  id UUID PRIMARY KEY,
  organizationId UUID NOT NULL REFERENCES Organization(id),
  slug VARCHAR NOT NULL,
  name VARCHAR,
  UNIQUE(organizationId, slug)
);

-- Jobs belong to organizations
CREATE TABLE Job (
  id UUID PRIMARY KEY,
  organizationId UUID NOT NULL REFERENCES Organization(id),
  projectId UUID REFERENCES Project(id),
  -- ... other fields
);

-- Row-level security (PostgreSQL)
ALTER TABLE Job ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_isolation ON Job
  USING (organizationId = current_user_org_id());
```

API-Level Isolation:

```typescript
// All API endpoints verify organization context
async function jobDetail(req: Request, jobId: string) {
  const orgId = req.user.organizationId;

  // Query includes organization filter
  const job = await db.job.findUnique({
    where: { id: jobId },
  });

  // Verify access
  if (job.organizationId !== orgId) {
    return 403;  // Forbidden
  }

  return job;
}
```

Network Isolation:

```yaml
# Each organization can have separate network
docker network create cfn-team-a
docker network create cfn-team-b

# Services attached to respective networks
trigger-worker-a:
  networks:
    - cfn-team-a

trigger-worker-b:
  networks:
    - cfn-team-b

# No cross-team communication possible (network isolation)
```

[DATABASE SECURITY (POSTGRESQL CREDENTIALS)]

Credential Management:

```bash
# Never hardcode credentials
# ❌ WRONG: postgres://user:password@host

# Use environment variables
# ✅ CORRECT: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}

# .env file (add to .gitignore)
POSTGRES_USER=cfn_admin
POSTGRES_PASSWORD=$(openssl rand -base64 32)  # Generate random
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=trigger
```

Secure Configuration:

```yaml
docker-compose.yml:
  postgres:
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}

    # Restrict network access
    expose:
      - 5432  # Only expose to Docker network, not host

volumes:
  postgres_data:
    driver: local
```

Access Control:

```sql
-- Create limited user for application (not superuser)
CREATE ROLE trigger_app WITH LOGIN PASSWORD 'app_password';

-- Grant only necessary permissions
GRANT CONNECT ON DATABASE trigger TO trigger_app;
GRANT USAGE ON SCHEMA public TO trigger_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO trigger_app;

-- Audit all access
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
SELECT pg_reload_conf();
```

[SOCKET PROXY SECURITY (PHASE 1.2A HARDENING)]

Problem: Docker socket access grants full container control

Current Architecture (Risky):
```yaml
trigger-worker:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    # ⚠️ Worker can start/stop any container, access any volume
```

Solution: Docker Socket Proxy (Phase 1.2a)

```yaml
# Deploy socket proxy (restricts Docker API access)
docker-socket-proxy:
  image: tecnativa/docker-socket-proxy
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
  environment:
    CONTAINERS: 1          # Allow container operations
    IMAGES: 1              # Allow image operations
    SERVICES: 0            # Deny service operations
    NETWORKS: 0            # Deny network operations
    VOLUMES: 0             # Deny volume operations
    EXEC: 0                # Deny exec operations
    POST: 1                # Allow write operations
    GET: 1                 # Allow read operations
    PUT: 0                 # Deny update operations
    DELETE: 0              # Deny delete operations

# Worker connects to proxy (not socket directly)
trigger-worker:
  environment:
    DOCKER_HOST: unix:///var/run/docker-proxy.sock
  volumes:
    - /var/run/docker-proxy.sock:/var/run/docker-proxy.sock
```

Security Benefits:
- Workers can only create/stop containers (no full control)
- No access to volumes (data isolation)
- No access to networks (network isolation)
- Audit trail of all container operations

[AUDIT TRAIL RETENTION AND COMPLIANCE]

PostgreSQL Audit Log:

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  organization_id UUID NOT NULL REFERENCES Organization(id),
  action VARCHAR NOT NULL,
  -- Actions: JOB_CREATED, JOB_COMPLETED, JOB_FAILED, RESULT_VIEWED, etc
  user_id VARCHAR,
  resource_type VARCHAR,
  resource_id VARCHAR,
  old_state JSONB,
  new_state JSONB,
  ip_address INET,
  user_agent TEXT,
  change_reason VARCHAR
);

-- Immutable audit log (no UPDATE/DELETE allowed)
CREATE RULE audit_log_no_update AS
  ON UPDATE TO audit_log DO INSTEAD NOTHING;

CREATE RULE audit_log_no_delete AS
  ON DELETE TO audit_log DO INSTEAD NOTHING;
```

Retention Policy:

```sql
-- Archive old logs annually
CREATE TABLE audit_log_archive (
  year INTEGER,
  data JSONB
);

-- Trigger archival
CREATE FUNCTION archive_old_logs() RETURNS void AS $$
BEGIN
  INSERT INTO audit_log_archive (year, data)
  SELECT
    EXTRACT(YEAR FROM timestamp)::integer,
    json_agg(row_to_json(audit_log.*))
  FROM audit_log
  WHERE timestamp < NOW() - INTERVAL '1 year'
  GROUP BY EXTRACT(YEAR FROM timestamp);

  DELETE FROM audit_log
  WHERE timestamp < NOW() - INTERVAL '1 year';
END;
$$ LANGUAGE plpgsql;

-- Run monthly
SELECT cron.schedule('archive_logs', '0 0 1 * *', 'SELECT archive_old_logs()');
```

Compliance Queries:

```sql
-- SOC 2 Trail: Who accessed what when
SELECT timestamp, user_id, action, resource_id
FROM audit_log
WHERE organization_id = 'org-123'
  AND timestamp >= '2025-11-01'
  AND timestamp < '2025-12-01'
ORDER BY timestamp DESC;

-- Job execution audit trail
SELECT
  j.id as job_id,
  j.status,
  j.created_at,
  j.completed_at,
  a.user_id as created_by,
  a.ip_address
FROM jobs j
LEFT JOIN audit_log a ON j.id = a.resource_id AND a.action = 'JOB_CREATED'
WHERE j.organization_id = 'org-123'
ORDER BY j.created_at DESC;
```

[PROVIDER SECURITY PROFILES]

Provider-Specific Security Considerations:

Z.ai (glm-4.6):
- Cost: Lowest
- Security: Standard API authentication
- Data retention: Follow Z.ai privacy policy
- Use case: Non-sensitive tasks

Kimi:
- Cost: Medium
- Security: API key authentication
- Data retention: Follow Kimi privacy policy
- Use case: Standard business logic

Anthropic (Claude):
- Cost: High
- Security: SOC 2 Type II compliance
- Data retention: Optional data exclusion
- Use case: Security-critical, compliance-required

OpenRouter:
- Cost: Variable
- Security: Multi-provider routing
- Data retention: Varies by provider
- Use case: Model experimentation

Configuration for Sensitive Tasks:

```yaml
# Enterprise configuration (sensitive data)
sensitive-tasks:
  provider: anthropic
  model: claude-opus
  organization: "enterprise-customer"
  data_retention: "none"  # Don't retain input/output
  audit_required: true

# Cost-sensitive configuration (standard data)
standard-tasks:
  provider: kimi
  model: claude-3.5-sonnet
  organization: "default"
  data_retention: "30-days"
  audit_required: false

# Cost-optimized configuration (non-sensitive)
batch-tasks:
  provider: zai
  model: glm-4.6
  organization: "batch"
  data_retention: "7-days"
  audit_required: false
```

================================================================================
PART 13: API REFERENCE
================================================================================

[TRIGGER.DEV JOB CREATION API]

REST Endpoint:
```
POST /api/v1/webhooks/{organizationSlug}/{projectSlug}/trigger
Content-Type: application/json
Authorization: Bearer {apiKey}

{
  "taskId": "string (required, unique)",
  "taskDescription": "string (required)",
  "mode": "enum (required): mvp | standard | enterprise",
  "provider": "enum (optional): zai | kimi | anthropic | openrouter | max",
  "model": "string (optional)",
  "metadata": {
    "userId": "string (optional)",
    "teamId": "string (optional)",
    "priority": "enum (optional): low | normal | high",
    "source": "string (optional): webhook | cli | dashboard | api"
  }
}

Response:
{
  "status": "success",
  "jobId": "job-001",
  "jobUrl": "http://localhost:3040/jobs/job-001",
  "taskId": "task-001",
  "createdAt": "2025-11-24T10:30:45Z"
}
```

Example cURL:
```bash
curl -X POST http://localhost:3000/api/v1/webhooks/cfn/main/trigger \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_trigger_..." \
  -d '{
    "taskId": "auth-fix-20251124",
    "taskDescription": "Fix authentication module TypeScript errors",
    "mode": "standard",
    "provider": "kimi",
    "metadata": {
      "userId": "user-123",
      "teamId": "team-456"
    }
  }'
```

[ENVIRONMENT VARIABLES TABLE]

**Core Configuration:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TRIGGER_API_URL` | string | http://localhost:3000 | Trigger.dev API endpoint |
| `TRIGGER_WEBAPP_URL` | string | http://localhost:3040 | Dashboard URL |
| `TRIGGER_API_KEY` | string | - | API authentication key |
| `TRIGGER_ORG_SLUG` | string | cfn | Organization slug |
| `TRIGGER_PROJECT_SLUG` | string | main | Project slug |

**Database Configuration:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `POSTGRES_USER` | string | postgres | Database user |
| `POSTGRES_PASSWORD` | string | - | Database password |
| `POSTGRES_HOST` | string | postgres | Database hostname |
| `POSTGRES_PORT` | integer | 5432 | Database port |
| `POSTGRES_DB` | string | trigger | Database name |

**Worker Configuration:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WORKER_ID` | string | worker-1 | Worker identifier |
| `WORKER_MEMORY` | string | 1g | Memory allocation |
| `WORKER_MAX_PARALLEL` | integer | 4 | Concurrent jobs |
| `DOCKER_HOST` | string | /var/run/docker.sock | Docker daemon socket |

**Provider Configuration:**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CFN_DEFAULT_PROVIDER` | string | zai | Default AI provider |
| `CFN_DEFAULT_MODEL` | string | glm-4.6 | Default model |
| `ANTHROPIC_API_KEY` | string | - | Anthropic API key |
| `KIMI_API_KEY` | string | - | Kimi API key |
| `ZAI_API_KEY` | string | - | Z.ai API key |

[POSTGRESQL SCHEMA REFERENCE]

**Core Tables:**

```sql
-- Organizations
CREATE TABLE Organization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Projects
CREATE TABLE Project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizationId UUID NOT NULL REFERENCES Organization(id),
  slug VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organizationId, slug)
);

-- Jobs
CREATE TABLE Job (
  id VARCHAR(255) PRIMARY KEY,
  organizationId UUID NOT NULL REFERENCES Organization(id),
  projectId UUID REFERENCES Project(id),
  status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
  taskId VARCHAR(255),
  taskDescription TEXT,
  mode VARCHAR(20) NOT NULL,
  provider VARCHAR(50),
  output JSONB,
  test_results JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Runs (for multi-stage workflows)
CREATE TABLE Run (
  id VARCHAR(255) PRIMARY KEY,
  jobId VARCHAR(255) NOT NULL REFERENCES Job(id),
  organizationId UUID NOT NULL REFERENCES Organization(id),
  loop_phase VARCHAR(20),  -- LOOP3, LOOP2, PO
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Test Results
CREATE TABLE TestResult (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jobId VARCHAR(255) NOT NULL REFERENCES Job(id),
  tests_total INTEGER,
  tests_passed INTEGER,
  pass_rate NUMERIC(5,4),
  failed_tests TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Index Strategy:**

```sql
-- Fast queries by organization and status
CREATE INDEX jobs_org_status ON Job(organizationId, status);

-- Job history for audit trail
CREATE INDEX jobs_created_at ON Job(created_at DESC);

-- Test results lookup
CREATE INDEX test_results_job ON TestResult(jobId, created_at DESC);

-- Run progression
CREATE INDEX runs_job_phase ON Run(jobId, loop_phase);
```

[REDIS PROTOCOL COMMANDS]

Job Queue Operations:

```bash
# Push job to queue
LPUSH job:queue "job-001"

# Claim job (atomic RPOP)
RPOP job:queue → "job-001"

# Check queue length
LLEN job:queue → 5

# Get all jobs in queue
LRANGE job:queue 0 -1 → ["job-001", "job-002", ...]

# Mark job as claimed
SADD job:claimed "job-001"

# Check if claimed
SISMEMBER job:claimed "job-001" → 1
```

Results Storage:

```bash
# Store job result
HSET job:results:job-001 \
  status "completed" \
  output "..." \
  timestamp "2025-11-24T10:30:45Z"

# Retrieve result
HGETALL job:results:job-001 → {...}

# Set result expiry (24 hours)
EXPIRE job:results:job-001 86400
```

Worker Signals:

```bash
# Store agent completion signal
LPUSH cfn:worker:worker-1:signals '{"agentId": "...", "status": "completed"}'

# Pop signal (blocking, 30s timeout)
BRPOP cfn:worker:worker-1:signals 30 → [...signal...]
```

[WORKER LIFECYCLE MANAGEMENT]

Worker Startup:

```typescript
async function workerStartup() {
  // 1. Connect to databases
  const postgres = new PostgresClient(process.env.POSTGRES_HOST);
  const redis = new RedisClient(process.env.REDIS_HOST);

  // 2. Register worker
  await postgres.query(
    'INSERT INTO workers (id, status, started_at) VALUES ($1, $2, $3)',
    [workerId, 'RUNNING', new Date()]
  );

  // 3. Start claiming jobs
  while (true) {
    const jobId = await redis.rpop('job:queue');
    if (!jobId) {
      await sleep(1000);  // Wait if queue empty
      continue;
    }

    await processJob(jobId);
  }
}
```

Worker Shutdown:

```typescript
async function workerShutdown() {
  // 1. Stop claiming new jobs
  claimingEnabled = false;

  // 2. Finish current job (with timeout)
  await timeout(currentJob.promise(), 30000);

  // 3. Release claimed jobs back to queue
  const claimed = await redis.smembers(`job:claimed:${workerId}`);
  for (const jobId of claimed) {
    await redis.lpush('job:queue', jobId);
  }

  // 4. Update worker status
  await postgres.query(
    'UPDATE workers SET status=$1, stopped_at=$2 WHERE id=$3',
    ['STOPPED', new Date(), workerId]
  );

  // 5. Close connections
  await postgres.close();
  await redis.close();
}
```

Health Monitoring:

```typescript
// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    checks: {}
  };

  // Check PostgreSQL
  try {
    await postgres.query('SELECT 1');
    health.checks.postgres = 'ok';
  } catch (e) {
    health.status = 'unhealthy';
    health.checks.postgres = `error: ${e.message}`;
  }

  // Check Redis
  try {
    await redis.ping();
    health.checks.redis = 'ok';
  } catch (e) {
    health.status = 'unhealthy';
    health.checks.redis = `error: ${e.message}`;
  }

  // Check job queue
  const queueLength = await redis.llen('job:queue');
  health.checks.queue = `${queueLength} jobs`;

  res.json(health);
});
```

================================================================================
PART 14: RELATED DOCUMENTATION
================================================================================

[PRIMARY REFERENCES]

**Architecture & Design:**
- `docker/trigger-dev/TRIGGER_DEV_ARCHITECTURE.md` - Comprehensive technical design (1862 lines)
- `docs/TRIGGER_DEV_MIGRATION_PLAN.md` - Phase-based migration strategy
- `docs/TRIGGER_DEV_MIGRATION_CHECKLIST.md` - Implementation checklist
- `docs/TRIGGER_DEV_QUICK_REFERENCE.md` - Quick lookup guide
- `docs/ADR-001-DEDICATED-TRIGGER-PER-TEAM.md` - Architecture decision record

**Strategic Planning:**
- `docs/TRIGGER_DEV_MIGRATION_EXECUTIVE_SUMMARY.md` - Executive overview
- `docs/CTO_STRATEGIC_ASSESSMENT_TRIGGER_AGENTIC_INTEGRATION.md` - Strategic alignment
- `planning/trigger/TRIGGER_DEV_INTEGRATION.md` - Integration planning
- `planning/trigger/TRIGGER_DEV_BLOCKERS.md` - Known issues and resolutions

**Operational Guides:**
- `docker/trigger-dev/CLAUDE.md` - Development and troubleshooting
- `docker/trigger-dev/docker-compose.yml` - Service configuration
- `docs/TRIGGER_DEV_MULTI_ENVIRONMENT_DEPLOYMENT.md` - Multi-env setup

[CLI MODE ARCHITECTURE COMPARISON]

For understanding the differences and complementary patterns:
- `readme/CLI_MODE_ARCHITECTURE.md` - CLI mode complete reference
- `docs/CFN_LOOP_CLI_MODE_EXECUTION_ANALYSIS.md` - CLI execution details
- `docs/CTO_ASSESSMENT_CLI_MODE_ARCHITECTURE.md` - CLI vs alternatives analysis

[TRIGGER.DEV SPECIFIC DOCUMENTATION]

External Resources:
- [Trigger.dev Official Docs](https://trigger.dev/docs)
- [Trigger.dev Self-Hosted Guide](https://trigger.dev/docs/self-hosted)
- [Trigger.dev API Reference](https://trigger.dev/docs/api)
- [Trigger.dev Workflows](https://trigger.dev/docs/workflows)

Self-Hosted Configuration:
- Docker Compose stack: `docker/trigger-dev/docker-compose.yml`
- Environment template: `.env.trigger-dev.example`
- Initialization scripts: `docker/trigger-dev/scripts/`

[TESTING DOCUMENTATION]

Validation & Quality:
- `tests/trigger-dev/README.md` - Test suite overview
- `tests/trigger-dev/test-webhook-integration.sh` - Webhook testing
- `tests/trigger-dev/test-worker-coordination.sh` - Worker testing
- `tests/docker-mode/implementations/trigger-*.sh` - Production tests

[OPERATIONS DOCUMENTATION]

Monitoring & Maintenance:
- `docs/operations/TRIGGER_DEV_MONITORING.md` - Health checks and alerts
- `scripts/trigger-dev-diagnostics.sh` - Diagnostic collection
- `docker/trigger-dev/monitoring/` - Prometheus metrics and dashboards

Troubleshooting:
- `docs/SECURITY_AUDIT_TRIGGER_DEV_PHASE_1_1.md` - Security hardening
- `docs/security/TRIGGER_DEV_SECURITY_RE_AUDIT.md` - Security assessment
- `planning/trigger/TRIGGER_DEV_INTEGRATION_HANDOFF.md` - Common issues and solutions

[COST AND PERFORMANCE ANALYSIS]

Financial Planning:
- Historical cost data: `planning/trigger/cost-analysis-2025.md`
- Performance benchmarks: `docs/TRIGGER_DEV_PERFORMANCE_ANALYSIS.md`
- ROI calculators: Spreadsheets in `planning/trigger/`

[INTEGRATION PATTERNS]

Multi-System Coordination:
- CFN Loop integration: `docs/architecture/ARCHITECTURE_REVIEW_TRIGGER_CFN_LOOP.md`
- GitHub integration: `docs/GITHUB_WEBHOOK_INTEGRATION.md` (planned)
- Slack integration: `docs/SLACK_WEBHOOK_INTEGRATION.md` (planned)
- Multi-cloud strategy: `planning/MULTI_CLOUD_STRATEGY.md`

[COMPLIANCE AND AUDIT]

Regulatory Requirements:
- SOC 2 audit trail: `docs/security/SOC2_AUDIT_TRAIL.md`
- Data retention: `docs/security/DATA_RETENTION_POLICY.md`
- GDPR compliance: `docs/security/GDPR_COMPLIANCE.md`
- Enterprise hardening: `docs/ENTERPRISE_SECURITY_HARDENING.md`

================================================================================
SUMMARY AND KEY TAKEAWAYS
================================================================================

Trigger.dev extends CFN Loop beyond CLI-mode boundaries:

**When to Use Trigger.dev:**
- Scheduled background jobs (cron triggers)
- Multi-team environments requiring isolation
- Webhook integrations (GitHub, Slack, external APIs)
- High-throughput batch processing (100+ jobs)
- Compliance requirements (audit trails, data retention)
- Persistent job history and dashboards

**When to Use CLI Mode:**
- Interactive development (Main Chat driven)
- Single developer or small team
- Fast iteration cycles (<5 minutes)
- Cost optimization (infrastructure <$100/month)
- Simple one-off tasks

**Hybrid Approach:**
Use both simultaneously for maximum flexibility:
- CLI for interactive dev work
- Trigger.dev for background scheduling and webhooks

**Architecture Strengths:**
- Event-driven job progression (no polling required)
- Persistent PostgreSQL audit trail
- Multi-tenant isolation via organizations
- Horizontal scaling via worker pools
- Provider routing for cost optimization

**Common Pitfalls to Avoid:**
- Using `localhost` instead of service names (cross-network failures)
- Not isolating data per organization (multi-tenant security)
- Forgetting to persist state to PostgreSQL (loss of audit trail)
- Hardcoding API credentials in code or documentation

See related documentation for complete implementation details, testing
procedures, and operational runbooks.

================================================================================
FILE DEPENDENCIES
================================================================================

This section lists all files referenced in this architecture document,
categorized for dependency ingestion and context management.

[TRIGGER.DEV JOB DEFINITIONS]
- trigger-dev/src/jobs/cfn-loop-3.ts - Loop 3 agent orchestration
- trigger-dev/src/jobs/cfn-loop-2.ts - Loop 2 validator orchestration
- trigger-dev/src/jobs/product-owner.ts - Product owner decision logic
- trigger-dev/src/jobs/coordinator.ts - Coordinator job orchestration

[TRIGGER.DEV UTILITIES]
- trigger-dev/src/utils/docker-helper.ts - Docker container management
- trigger-dev/src/utils/redis-helper.ts - Redis coordination helpers
- trigger-dev/src/utils/task-generator.ts - Task generation utilities

[DOCKER CONFIGURATION]
- docker/trigger-dev/docker-compose.yml - Service definitions (trigger-cfn-network)
- docker/trigger-dev/Dockerfile.agent - Agent container image
- docker/trigger-dev/Dockerfile.coordinator - Coordinator container image
- docker/trigger-dev/.env.example - Environment variable templates

[DOCKER RUNTIME CONTRACT]
- docker/runtime/cfn-runtime.contract.yml - Environment contract (shared with CLI mode)

[TRIGGER.DEV CONFIGURATION]
- trigger-dev/package.json - Dependencies and scripts
- trigger-dev/tsconfig.json - TypeScript configuration
- trigger-dev/trigger.config.ts - Trigger.dev project configuration (removed, see STATUS note at top)

[ARCHITECTURE DOCUMENTATION]
- readme/TRIGGER_CONTAINER_MODES_ARCHITECTURE.md - This document
- docker/trigger-dev/TRIGGER_DEV_ARCHITECTURE.md - Comprehensive technical design (1862 lines)
- docker/trigger-dev/CLAUDE.md - Development and troubleshooting guide

[MIGRATION AND PLANNING]
- docs/TRIGGER_DEV_MIGRATION_PLAN.md - Phase-based migration strategy
- docs/TRIGGER_DEV_MIGRATION_CHECKLIST.md - Implementation checklist
- docs/TRIGGER_DEV_MIGRATION_EXECUTIVE_SUMMARY.md - Executive overview
- docs/TRIGGER_DEV_QUICK_REFERENCE.md - Quick lookup guide

[STRATEGIC ASSESSMENT]
- docs/CTO_STRATEGIC_ASSESSMENT_TRIGGER_AGENTIC_INTEGRATION.md - Strategic alignment
- docs/ADR-001-DEDICATED-TRIGGER-PER-TEAM.md - Architecture decision record

[INTEGRATION PLANNING]
- planning/trigger/TRIGGER_DEV_INTEGRATION.md - Integration planning document
- planning/trigger/TRIGGER_DEV_BLOCKERS.md - Known issues and resolutions
- planning/trigger/TRIGGER_DEV_INTEGRATION_HANDOFF.md - Common issues and solutions

[DEPLOYMENT AND OPERATIONS]
- docs/TRIGGER_DEV_MULTI_ENVIRONMENT_DEPLOYMENT.md - Multi-env setup (dev/staging/prod)
- docs/operations/TRIGGER_DEV_MONITORING.md - Health checks and alerts
- scripts/trigger-dev-diagnostics.sh - Diagnostic collection script
- scripts/collect-diagnostics.sh - System-wide diagnostics

[TESTING INFRASTRUCTURE]
**IMPORTANT: All Trigger.dev tests MUST be created in tests/trigger-dev/ or tests/docker-mode/ directories**
**Purpose: De-risk test sprawl, maintain consistent test locations, prevent fragmentation**

- tests/trigger-dev/README.md - Test suite overview
- tests/trigger-dev/test-webhook-integration.sh - Webhook integration tests
- tests/trigger-dev/test-worker-coordination.sh - Worker coordination tests
- tests/docker-mode/README.md - Docker mode test documentation (45 tests)
- tests/docker-mode/run-all-implementations.sh - Main test runner
- tests/docker-mode/implementations/trigger-coordinator-spawning.sh - Coordinator tests
- tests/docker-mode/implementations/trigger-orchestrator-workflow.sh - Orchestrator tests
- tests/docker-mode/implementations/trigger-tdd-compliance.sh - TDD compliance tests

**Test Creation Guidelines:**
- Trigger.dev integration tests → tests/trigger-dev/test-*.sh
- Docker container tests → tests/docker-mode/implementations/*.sh
- TypeScript unit tests → tests/trigger-dev/*.test.ts
- Never create tests outside these directories

[SECURITY AND COMPLIANCE]
- docs/SECURITY_AUDIT_TRIGGER_DEV_PHASE_1_1.md - Security hardening
- docs/security/TRIGGER_DEV_SECURITY_RE_AUDIT.md - Security assessment
- docs/ENTERPRISE_SECURITY_HARDENING.md - Enterprise security
- docs/security/SOC2_AUDIT_TRAIL.md - SOC 2 compliance
- docs/security/DATA_RETENTION_POLICY.md - Data retention policy
- docs/security/GDPR_COMPLIANCE.md - GDPR compliance

[PERFORMANCE AND COST ANALYSIS]
- docs/TRIGGER_DEV_PERFORMANCE_ANALYSIS.md - Performance benchmarks
- planning/trigger/cost-analysis-2025.md - Historical cost data and projections

[INTEGRATIONS (PLANNED)]
- docs/GITHUB_WEBHOOK_INTEGRATION.md - GitHub webhook integration
- docs/SLACK_WEBHOOK_INTEGRATION.md - Slack webhook integration

[ARCHITECTURE REVIEW]
- docs/architecture/ARCHITECTURE_REVIEW_TRIGGER_CFN_LOOP.md - CFN Loop integration

[MULTI-CLOUD STRATEGY]
- planning/MULTI_CLOUD_STRATEGY.md - Multi-cloud deployment strategy

[COLLISION PREVENTION - CRITICAL]
- planning/trigger/CLI_TRIGGER_COLLISION_ANALYSIS.md - Collision analysis and mitigation
- planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md - Socket proxy implementation

[DOCKER WORKTREE SUPPORT]
- scripts/docker/run-in-worktree.sh - Multi-worktree Docker coordination
- docs/TEAM_DEVELOPMENT_PATTERNS.md - Team development patterns (shared with CLI)

[CLI MODE REFERENCE (OVERLAP)]
- readme/CLI_MODE_ARCHITECTURE.md - CLI mode reference for comparison
- docs/CFN_LOOP_CLI_MODE_EXECUTION_ANALYSIS.md - CLI execution details
- docs/CTO_ASSESSMENT_CLI_MODE_ARCHITECTURE.md - CLI vs alternatives analysis

[SHARED COORDINATION (75% OVERLAP WITH CLI)]
- .claude/skills/cfn-coordination/coordination-wait.sh - Redis BLPOP blocking
- .claude/skills/cfn-coordination/coordination-signal.sh - Completion signaling
- .claude/skills/cfn-coordination/coordination-broadcast.sh - Broadcast messages
- .claude/skills/cfn-coordination/coordination-collect-consensus.sh - Consensus collection

[DEPENDENCY MANIFEST]
- .claude/skills/cfn-dependency-ingestion/manifests/trigger-mode-dependencies.txt - Complete manifest

See `.claude/skills/cfn-dependency-ingestion/manifests/trigger-mode-dependencies.txt`
for the complete parseable dependency manifest used by the cfn-dependency-ingestion
skill for context injection.

Cross-Reference: See CLI_MODE_ARCHITECTURE.md FILE DEPENDENCIES section for
CLI mode specific files and overlaps between execution modes.

================================================================================
