# CFN Loop Migration to trigger.dev: Comprehensive Implementation Plan

**Migration Status:** Planning Phase
**Target Completion:** 25 days
**Total LOC Impact:** ~10,854 lines
**Risk Level:** High (architectural pivot, no backward compatibility concerns)

---

## Executive Summary

This document defines the complete migration strategy from Redis-based CFN Loop coordination to trigger.dev (self-hosted). The migration is **full deprecation** with no incremental transition path, leveraging the advantage that no existing users require backward compatibility.

### Key Changes:
- **Coordination Layer**: Redis BLPOP/LPUSH → webhook-based job completion handlers
- **Agent Spawning**: CLI-based spawning → trigger.dev job creation
- **Blocking Operations**: `coordination-wait` (Redis blocking) → webhook event subscriptions
- **Orchestration**: Bash orchestrate.sh + shell skills → trigger.dev workflows
- **Task Mode**: RETAINED (decouple from Redis - was coupled due to memory leak workarounds)

### System Boundary Changes:
```
BEFORE (Redis-Based):
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ Coordinator │◄────BLPOP────│   Agent   │──LPUSH──────►│   Redis   │
│ (waiting)   │         │              │         │ (list queue)│
└─────────────┘         └──────────────┘         └─────────────┘

AFTER (trigger.dev):
┌─────────────────────────────────────────────────────────────────┐
│          trigger.dev Workflow Engine                           │
│  (Self-hosted: Postgres + ClickHouse + MinIO + Redis)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [TRIGGER] ──────► [Job1: Loop3-Agent] ──┐                    │
│     │                                       │                   │
│     ├─────► [Job2: Loop3-Agent] ───┐       ├──► [Webhook Handler]
│     │                                 │     │      (results)     │
│     └─────► [Job3: Loop3-Agent] ─────┴─┬──┘                    │
│                                         │                        │
│                         [Gate Check Job]├──► [Conditional]      │
│                                         │       ├─→ Loop3 Error  │
│                                         │       └─→ Loop2 Start  │
│                                         │                        │
│  [Webhook] ◄──── [Loop2-Validators] ◄──┴─────────             │
│     │                                                            │
│     └──► [Consensus Job] ──► [Product Owner Job] ◄──[Webhook]  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Infrastructure Setup (Days 1-2)

### 0.1 trigger.dev Self-Hosted Deployment

**Files to Create:**
- `/docker/trigger.dev/docker-compose.yml` - Full trigger.dev stack
- `/docker/trigger.dev/.env.template` - Environment configuration
- `/docker/trigger.dev/init-postgres.sql` - Database schema
- `/scripts/trigger-dev-setup.sh` - Deployment automation
- `/docs/TRIGGER_DEV_SETUP.md` - Installation & troubleshooting guide

**Docker Compose Architecture:**
```yaml
services:
  # Core trigger.dev services
  postgres:
    image: postgres:15-alpine
    ports: ["5432:5432"]
    volumes: ["trigger_postgres_data:/var/lib/postgresql/data"]
    environment:
      POSTGRES_DB: "triggerdotdev"
      POSTGRES_USER: "trigger"
      POSTGRES_PASSWORD: "${TRIGGER_POSTGRES_PASSWORD}"

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["trigger_redis_data:/data"]
    command: "redis-server --appendonly yes"

  minio:
    image: minio/minio:latest
    ports: ["9000:9000", "9001:9001"]
    volumes: ["trigger_minio_data:/data"]
    environment:
      MINIO_ROOT_USER: "${TRIGGER_MINIO_USER}"
      MINIO_ROOT_PASSWORD: "${TRIGGER_MINIO_PASSWORD}"
    command: "server /data --console-address :9001"

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    ports: ["8123:8123", "9000:9000"]
    volumes: ["trigger_clickhouse_data:/var/lib/clickhouse"]
    environment:
      CLICKHOUSE_DB: "triggerdotdev"

  # trigger.dev API server
  api:
    image: trigger.dev:latest
    depends_on: ["postgres", "redis", "minio", "clickhouse"]
    ports: ["3030:3030"]
    environment:
      DATABASE_URL: "postgresql://trigger:${TRIGGER_POSTGRES_PASSWORD}@postgres:5432/triggerdotdev"
      REDIS_URL: "redis://redis:6379"
      TRIGGER_SECRET_KEY: "${TRIGGER_SECRET_KEY}"
      MINIO_ENDPOINT: "minio:9000"
      CLICKHOUSE_URL: "clickhouse://clickhouse:8123/triggerdotdev"

  # Web dashboard
  web:
    image: trigger.dev:latest
    depends_on: ["api"]
    ports: ["3000:3000"]
    environment:
      API_URL: "http://api:3030"
      DASHBOARD_URL: "http://localhost:3000"

volumes:
  trigger_postgres_data:
  trigger_redis_data:
  trigger_minio_data:
  trigger_clickhouse_data:
```

**Success Criteria:**
- [ ] `curl http://localhost:3000` returns dashboard homepage
- [ ] Database migrations run without error
- [ ] MinIO bucket created for artifacts
- [ ] ClickHouse logging initialized

---

### 0.2 Network Configuration

**Files to Create:**
- `/scripts/trigger-dev-network.sh` - Docker network setup
- `/docs/TRIGGER_DEV_NETWORKING.md` - Service discovery guide

**Key Configuration:**
```bash
# Create isolated Docker network for CFN workflows
docker network create trigger-cfn-workflows

# Service DNS Resolution (within network):
# api.trigger.dev:3030
# postgres:5432
# redis:6379
# minio:9000

# Environment Variables (injected to agents):
export TRIGGER_API_URL="http://api:3030"
export TRIGGER_WEBHOOK_URL="http://triggerdotdev-api:3030/webhooks"
export TRIGGER_API_KEY="${TRIGGER_API_KEY}"
```

**Success Criteria:**
- [ ] All services can reach each other via DNS names
- [ ] Webhook endpoints are externally accessible
- [ ] Environment variables properly injected to agents

---

### 0.3 Integration Ports Mapping

**Current System → trigger.dev Mapping:**
```
Redis BLPOP/LPUSH          → trigger.dev Job Results API
coordination-wait          → Job subscription webhooks
coordination-signal        → Job creation + payload
Agent spawn CLI            → trigger.dev Client SDK
orchestrate.sh monitoring  → trigger.dev Web dashboard + API
```

**Files to Create:**
- `/src/integration/trigger-dev-adapter.ts` - Webhook -> coordination mapping
- `/src/integration/trigger-dev-client.ts` - API wrapper
- `/src/types/trigger-dev-events.d.ts` - Event type definitions

**Success Criteria:**
- [ ] All mapping patterns documented
- [ ] Type definitions complete
- [ ] Adapter code compiles without errors

---

## Phase 1: Core Workflow Implementation (Days 3-6)

### 1.1 trigger.dev Project Structure

**Files to Create:**
- `/trigger-dev/tsconfig.json` - TypeScript configuration
- `/trigger-dev/package.json` - Dependencies
- `/trigger-dev/.env.template` - API keys and secrets
- `/trigger-dev/workflows/cfn-loop.workflow.ts` - Main CFN Loop workflow

**Directory Structure:**
```
trigger-dev/
├── workflows/
│   ├── cfn-loop.workflow.ts          # Main orchestration workflow
│   ├── loop3-executor.workflow.ts    # Loop 3 implementer stage
│   ├── loop2-validator.workflow.ts   # Loop 2 validation stage
│   ├── po-decision.workflow.ts       # Product Owner decision
│   └── gate-checker.workflow.ts      # Quality gate evaluation
├── jobs/
│   ├── spawn-agents.job.ts           # Agent creation job
│   ├── gate-check.job.ts             # Gate evaluation
│   ├── consensus.job.ts              # Consensus aggregation
│   └── iteration-manager.job.ts      # Iteration control
├── webhooks/
│   ├── agent-completion.webhook.ts   # Agent result handler
│   ├── test-results.webhook.ts       # Test completion handler
│   └── gate-decision.webhook.ts      # Gate decision handler
├── types/
│   ├── cfn-loop-events.ts            # Event type definitions
│   ├── workflow-context.ts           # Shared context types
│   └── trigger-payloads.ts           # Job payload types
└── utils/
    ├── test-aggregator.ts            # Test result processing
    ├── consensus-calculator.ts       # Validator consensus logic
    └── context-merger.ts             # Context aggregation
```

**Implementation Pattern:**
```typescript
// trigger-dev/workflows/cfn-loop.workflow.ts
import { trigger } from "@trigger.dev/sdk";
import type { CFNLoopContext, TaskDescription } from "../types/workflow-context";
import { spawnLoop3Agents } from "../jobs/spawn-agents.job";
import { gateCheckJob } from "../jobs/gate-check.job";

// Main CFN Loop workflow triggered by webhook
trigger.on({
  name: "cfn.loop.start",
  schema: {
    taskId: "string",
    taskDescription: "string",
    mode: "enum" as const,
    enum: ["mvp", "standard", "enterprise"]
  }
}).onSuccess(async (payload, io) => {
  // Initialize workflow context
  const context: CFNLoopContext = {
    taskId: payload.taskId,
    taskDescription: payload.taskDescription,
    mode: payload.mode,
    iteration: 0,
    maxIterations: calculateMaxIterations(payload.mode),
    gateThreshold: getGateThreshold(payload.mode)
  };

  // Emit event to trigger orchestration
  await io.sendEvent({
    name: "cfn.loop.initialized",
    payload: context
  });
});
```

**Success Criteria:**
- [ ] Project compiles without TypeScript errors
- [ ] All workflow files created with proper exports
- [ ] Type system validates payloads
- [ ] Dependencies installed and locked

---

### 1.2 CFN Loop as trigger.dev Workflow

**Files to Create/Modify:**
- `/trigger-dev/workflows/cfn-loop.workflow.ts` - Main orchestrator (1,200 LOC)
- `/trigger-dev/workflows/loop3-executor.workflow.ts` - Agent execution (400 LOC)
- `/trigger-dev/workflows/loop2-validator.workflow.ts` - Validation (350 LOC)
- `/trigger-dev/workflows/po-decision.workflow.ts` - Product Owner (200 LOC)

**Key Workflow Pattern:**

The current orchestrate.sh has these sequential stages:
1. **Initialize**: Setup context and state
2. **Loop 3**: Spawn agents and wait for results (BLPOP → webhooks)
3. **Gate Check**: Evaluate pass rate (if fail → iterate Loop 3)
4. **Loop 2**: Spawn validators (if gate passes)
5. **Consensus**: Collect validator scores (Redis → webhook aggregation)
6. **Product Owner**: Render decision (if consensus ≥ threshold)
7. **Iteration/Completion**: Repeat or finish

**Migration Pattern:**
```typescript
// BEFORE: orchestrate.sh with Redis blocking
spawn_loop3() {
  # Spawn agents
  # Wait for each to complete (BLPOP)
  # Collect results from Redis
}

// AFTER: trigger.dev workflow with webhooks
export async function executeLoop3(
  context: CFNLoopContext,
  io: IO
): Promise<Loop3Results> {
  // Spawn agents as trigger.dev jobs
  const agentJobs = await io.batch(
    agents.map(agent =>
      createAgentJob(agent, context)
    )
  );

  // Wait for webhook results (automatic via trigger.dev event system)
  const results = await Promise.all(
    agentJobs.map(job =>
      io.on({
        name: `agent.${job.id}.completed`,
        timeoutInSeconds: AGENT_TIMEOUT
      })
    )
  );

  return aggregateResults(results);
}
```

**Success Criteria:**
- [ ] All orchestration stages implemented as workflow steps
- [ ] Event-based progression (no polling)
- [ ] Context passed correctly between stages
- [ ] Error handling for timeouts and failures
- [ ] Tests validate stage transitions

---

### 1.3 Loop 3 → Loop 2 → Product Owner as Workflow Steps

**Files to Implement:**
- `/trigger-dev/workflows/loop3-executor.workflow.ts`
- `/trigger-dev/workflows/loop2-validator.workflow.ts`
- `/trigger-dev/workflows/po-decision.workflow.ts`

**Loop 3 Workflow:**
```typescript
// trigger-dev/workflows/loop3-executor.workflow.ts
export const loop3Workflow = trigger.onSuccess({
  name: "cfn.loop3.execute",
  payload: CFNLoopContext
}).run(async (payload, io) => {
  // Select agents based on task classification
  const agents = selectAgents(payload.taskDescription, payload.mode);

  // Spawn all agents in parallel via jobs
  const spawnedAgents = await io.batch(
    agents.map(agentType =>
      trigger.createJob("spawn-agent", {
        agentType,
        taskId: payload.taskId,
        context: payload
      })
    )
  );

  // Wait for agent results (webhooks)
  const testResults = await Promise.all(
    spawnedAgents.map(job =>
      waitForWebhook(`agent.${job.id}.completed`, AGENT_TIMEOUT)
    )
  );

  // Aggregate test results
  const aggregated = aggregateTestResults(testResults);

  // Emit completion event
  await io.sendEvent({
    name: "cfn.loop3.completed",
    payload: {
      ...payload,
      testResults: aggregated,
      passRate: aggregated.passRate,
      iteration: payload.iteration + 1
    }
  });
});
```

**Loop 2 Workflow:**
```typescript
// trigger-dev/workflows/loop2-validator.workflow.ts
export const loop2Workflow = trigger.onSuccess({
  name: "cfn.loop2.execute",
  payload: { ...CFNLoopContext, testResults: TestResults }
}).run(async (payload, io) => {
  // Select validators (3-5 based on mode)
  const validators = selectValidators(payload.mode);

  // Spawn validators in parallel
  const validatorJobs = await io.batch(
    validators.map(validatorType =>
      trigger.createJob("spawn-validator", {
        validatorType,
        taskId: payload.taskId,
        loop3Results: payload.testResults
      })
    )
  );

  // Collect consensus scores
  const scores = await Promise.all(
    validatorJobs.map(job =>
      waitForWebhook(`validator.${job.id}.completed`, VALIDATOR_TIMEOUT)
    )
  );

  const consensus = calculateConsensus(scores);

  await io.sendEvent({
    name: "cfn.loop2.completed",
    payload: {
      ...payload,
      validatorScores: scores,
      consensusScore: consensus.score,
      validationPassed: consensus.score >= payload.consensusThreshold
    }
  });
});
```

**Product Owner Workflow:**
```typescript
// trigger-dev/workflows/po-decision.workflow.ts
export const poDecisionWorkflow = trigger.onSuccess({
  name: "cfn.po.decide",
  payload: { ...CFNLoopContext, consensusScore: number, validationPassed: boolean }
}).run(async (payload, io) => {
  // Spawn Product Owner decision job
  const poJob = await trigger.createJob("po-decision", {
    taskId: payload.taskId,
    consensus: payload.consensusScore,
    validationPassed: payload.validationPassed,
    deliverables: payload.deliverables
  });

  // Wait for decision
  const decision = await waitForWebhook(
    `po.${poJob.id}.decided`,
    PO_DECISION_TIMEOUT
  );

  if (decision.action === "PROCEED") {
    // Emit completion
    await io.sendEvent({ name: "cfn.loop.completed", payload });
  } else if (decision.action === "ITERATE") {
    // Emit iteration signal
    await io.sendEvent({
      name: "cfn.loop.iterate",
      payload: { ...payload, iteration: payload.iteration + 1 }
    });
  } else {
    // ABORT
    throw new Error(`Loop aborted by Product Owner: ${decision.reason}`);
  }
});
```

**Success Criteria:**
- [ ] All three workflows execute in sequence
- [ ] Context passes correctly between stages
- [ ] Each stage waits for webhooks (no polling)
- [ ] Iteration control works (max iterations respected)
- [ ] Product Owner decision parsed correctly

---

### 1.4 Gate Checking as Conditional Branching

**Files to Create:**
- `/trigger-dev/jobs/gate-check.job.ts`
- `/trigger-dev/utils/test-aggregator.ts`

**Gate Check Implementation:**
```typescript
// trigger-dev/jobs/gate-check.job.ts
export const gateCheckJob = trigger.job({
  id: "cfn-gate-check",
  run: async (payload: {
    testResults: TestResults[];
    gateThreshold: number;
    mode: "mvp" | "standard" | "enterprise";
  }, io) => {
    // Aggregate test results
    const aggregated = aggregateTestResults(payload.testResults);
    const passRate = aggregated.passed / aggregated.total;

    // Check gate
    const gatePass = passRate >= payload.gateThreshold;

    if (!gatePass) {
      // Emit event to iterate Loop 3
      await io.sendEvent({
        name: "cfn.gate.failed",
        payload: {
          passRate,
          required: payload.gateThreshold,
          failedTests: aggregated.failed
        }
      });
      return { gatePass: false, passRate };
    }

    // Gate passed - proceed to Loop 2
    await io.sendEvent({
      name: "cfn.gate.passed",
      payload: { passRate, tests: aggregated }
    });

    return { gatePass: true, passRate };
  }
});
```

**Conditional Branching Pattern:**
```typescript
// In main CFN loop workflow
const gateResult = await io.run("gate-check", gateCheckPayload);

if (!gateResult.gatePass) {
  // Max iterations exceeded?
  if (context.iteration < context.maxIterations) {
    // Re-trigger Loop 3 for iteration N+1
    await io.sendEvent({
      name: "cfn.loop3.execute",
      payload: { ...context, iteration: context.iteration + 1 }
    });
  } else {
    throw new Error("Max iterations exceeded before gate pass");
  }
} else {
  // Proceed to Loop 2
  await io.sendEvent({
    name: "cfn.loop2.execute",
    payload: context
  });
}
```

**Success Criteria:**
- [ ] Gate check evaluates pass rate correctly
- [ ] Conditional logic branches properly
- [ ] Iteration counter increments
- [ ] Max iterations enforced
- [ ] Failures logged with details

---

## Phase 2: Agent Spawning Migration (Days 7-10)

### 2.1 Replace spawn-agent CLI with trigger.dev Jobs

**Files to Create:**
- `/trigger-dev/jobs/spawn-agent.job.ts` - Agent creation (250 LOC)
- `/trigger-dev/jobs/agent-executor.job.ts` - Agent execution (300 LOC)
- `/src/integration/trigger-agent-bridge.ts` - Bridge to Claude agent system (200 LOC)

**Migration Pattern:**

**BEFORE (CLI-based):**
```bash
# orchestrate.sh
npx claude-flow-novice agent cfn-backend-developer \
  --task-id "$TASK_ID" \
  --context "TASK_DESCRIPTION='...' MODE='...'"
```

**AFTER (trigger.dev Jobs):**
```typescript
// trigger-dev/jobs/spawn-agent.job.ts
export const spawnAgentJob = trigger.job({
  id: "spawn-agent",
  run: async (payload: {
    agentType: string;
    taskId: string;
    context: CFNLoopContext;
    iteration: number;
  }, io) => {
    // Create agent context
    const agentContext = {
      agentId: `agent-${payload.taskId}-${Date.now()}`,
      taskId: payload.taskId,
      agentType: payload.agentType,
      taskDescription: payload.context.taskDescription,
      mode: payload.context.mode,
      iteration: payload.iteration,
      webhookUrl: `${TRIGGER_WEBHOOK_BASE}/agent-completion`
    };

    // Spawn agent in parallel container/process
    const agentProcess = await spawnAgentContainer({
      agentType: payload.agentType,
      context: agentContext,
      timeout: AGENT_TIMEOUT
    });

    // Wait for webhook completion
    const result = await io.wait({
      name: `agent.${agentContext.agentId}.completed`,
      timeoutInSeconds: AGENT_TIMEOUT + 60
    });

    return {
      agentId: agentContext.agentId,
      output: result.output,
      confidence: result.confidence,
      testsPassed: result.testsPassed,
      testsTotal: result.testsTotal
    };
  }
});

async function spawnAgentContainer(config: AgentSpawnConfig) {
  // Use existing agent spawning infrastructure
  const spawnCommand = `
    npx claude-flow-novice agent ${config.agentType} \
      --task-id "${config.context.taskId}" \
      --context '${JSON.stringify(config.context)}' \
      --webhook-url "${config.context.webhookUrl}" \
      --webhook-token "${TRIGGER_WEBHOOK_TOKEN}"
  `;

  // Execute in child process
  return execAsync(spawnCommand);
}
```

**Webhook Handler for Agent Completion:**
```typescript
// trigger-dev/webhooks/agent-completion.webhook.ts
export const handleAgentCompletion = trigger.webhook({
  id: "agent-completion",
  onRequest: async (request, io) => {
    // Verify webhook signature
    const payload = verifyWebhookSignature(request);

    const {
      agentId,
      taskId,
      output,
      confidence,
      testResults
    } = payload;

    // Validate output
    if (!output || !testResults) {
      return sendError("Missing required output fields");
    }

    // Emit completion event
    await io.sendEvent({
      name: `agent.${agentId}.completed`,
      payload: {
        agentId,
        output,
        confidence,
        testsPassed: testResults.passed,
        testsTotal: testResults.total,
        passRate: testResults.passed / testResults.total,
        timestamp: new Date().toISOString()
      }
    });

    return { received: true };
  }
});
```

**Success Criteria:**
- [ ] Agents spawn and execute via trigger.dev jobs
- [ ] Webhook handlers receive completion events
- [ ] Context injected to agents correctly
- [ ] Timeout handling works (agent + job timeout)
- [ ] Test results parsed from agent output
- [ ] Error handling for failed spawns

---

### 2.2 Agent Completion via Webhooks (Not Redis LPUSH)

**Files to Modify:**
- `/src/agent-prompt-builder.ts` - Inject webhook URL to agents
- `/src/cli/agent-executor.ts` - Send webhook on completion

**Agent Prompt Modification:**
```typescript
// src/agent-prompt-builder.ts - NEW: Webhook integration
export interface AgentExecutionContext {
  // ... existing fields ...
  webhookUrl?: string;        // NEW: trigger.dev webhook URL
  webhookToken?: string;      // NEW: Authentication token
  taskId: string;
  agentId: string;           // NEW: Unique agent instance ID
}

// Inject into agent prompt
const injectedContext = `
<!-- EXECUTION_CONTEXT
taskId: ${context.taskId}
agentId: ${context.agentId}
webhookUrl: ${context.webhookUrl}
webhookToken: ${context.webhookToken}
-->
`;
```

**Agent Completion Handler:**
```typescript
// src/cli/agent-executor.ts - MODIFIED: Webhook submission on complete
async function submitAgentCompletion(result: AgentResult, context: AgentExecutionContext) {
  if (context.webhookUrl) {
    // NEW: Send webhook to trigger.dev
    const payload = {
      agentId: context.agentId,
      taskId: context.taskId,
      output: result.summary,
      confidence: result.confidence,
      testResults: result.testResults || { passed: 0, total: 0 },
      timestamp: new Date().toISOString()
    };

    try {
      const response = await fetch(context.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.webhookToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error(`Webhook submission failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Webhook submission error: ${error}`);
    }
  }

  // DEPRECATED: Remove Redis LPUSH on completion
  // OLD CODE TO REMOVE:
  // await redis.lpush(`cfn_loop:${context.taskId}:results`, JSON.stringify(result));
}
```

**Success Criteria:**
- [ ] Webhook URL injected to agent context
- [ ] Agent sends webhook on completion
- [ ] Payload includes test results
- [ ] Webhook signature verification works
- [ ] Timeout prevents hanging webhooks
- [ ] All agents send completion (not just Redis)

---

### 2.3 Context Injection via Job Payloads

**Files to Create:**
- `/trigger-dev/utils/context-merger.ts`

**Context Flow:**
```typescript
// CFN Loop context → Job payload → Agent process

// 1. Main workflow builds context
const cfnContext: CFNLoopContext = {
  taskId: "cfn-auth-123",
  taskDescription: "Implement JWT authentication",
  mode: "standard",
  iteration: 0,
  agents: ["backend-developer", "security-specialist"],
  successCriteria: {
    testPassRate: 0.95,
    codeReviewScore: 0.90,
    securityAuditScore: 0.85
  }
};

// 2. Job receives context in payload
export const spawnAgentJob = trigger.job({
  id: "spawn-agent",
  run: async (payload: SpawnAgentPayload) => {
    // 3. Pass context to agent
    const agentContext = {
      ...payload.context,
      agentType: payload.agentType,
      webhookUrl: payload.webhookUrl,
      iteration: payload.iteration
    };

    // 4. Serialize to JSON for shell
    const contextJson = JSON.stringify(agentContext);

    // 5. Inject into environment variable
    const spawnCommand = `
      npx claude-flow-novice agent ${payload.agentType} \
        --context-json '${contextJson}' \
        --webhook-url '${payload.webhookUrl}'
    `;
  }
});
```

**Success Criteria:**
- [ ] Context serializes to JSON without loss
- [ ] All fields passed to agents
- [ ] Agents parse context correctly
- [ ] Size limits respected (shell arg limits)
- [ ] Sensitive data redacted from logs

---

### 2.4 Parallel Agent Spawning with Fan-Out

**Files to Create:**
- `/trigger-dev/utils/parallel-executor.ts`

**Fan-Out Implementation:**
```typescript
// trigger-dev/workflows/loop3-executor.workflow.ts
export async function executeLoop3(
  context: CFNLoopContext,
  io: IO
): Promise<Loop3Results> {
  // Select agents based on task
  const agents = selectAgents(context.taskDescription, context.mode);

  console.log(`Spawning ${agents.length} agents in parallel`);

  // FAN-OUT: Create all agent jobs simultaneously
  const agentJobs = await io.batch(
    agents.map((agentType, index) => ({
      id: `agent-${agentType}-${index}`,
      payload: {
        agentType,
        taskId: context.taskId,
        context,
        iteration: context.iteration,
        index
      }
    }))
  );

  console.log(`Spawned ${agentJobs.length} agent jobs`);

  // Wait for all to complete with timeout
  const results = await Promise.allSettled(
    agentJobs.map((job, idx) =>
      io.wait({
        name: `agent.${job.id}.completed`,
        timeoutInSeconds: AGENT_TIMEOUT
      }).then(result => ({
        agentType: agents[idx],
        ...result
      }))
    )
  );

  // Process results (some may fail/timeout)
  const completed = results
    .filter((r): r is PromiseFulfilledResult<AgentResult> => r.status === 'fulfilled')
    .map(r => r.value);

  const failed = results
    .filter(r => r.status === 'rejected')
    .map((r, idx) => ({
      agentType: agents[idx],
      error: (r as PromiseRejectedResult).reason
    }));

  if (failed.length > 0) {
    console.warn(`${failed.length} agents failed: ${JSON.stringify(failed)}`);
  }

  return {
    agentResults: completed,
    failedAgents: failed,
    totalAgents: agents.length,
    completedAgents: completed.length
  };
}
```

**Success Criteria:**
- [ ] All agents spawn immediately (parallel)
- [ ] No sequential delays between spawns
- [ ] All results collected with timeout
- [ ] Partial failures handled gracefully
- [ ] Performance improves over sequential spawning

---

## Phase 3: Coordination Replacement (Days 11-14)

### 3.1 BLPOP → Webhook-Based Handoffs

**Files to Delete:**
- `.claude/skills/cfn-coordination/` - ENTIRE DIRECTORY (Redis BLPOP-based)
- `.claude/skills/cfn-redis-coordination/` - ENTIRE DIRECTORY (Redis helpers)
- `.claude/skills/cfn-docker-redis-coordination/` - ENTIRE DIRECTORY
- `src/coordination/coordination-wrapper.ts` - Redis wrapper
- `src/cli/coordination-wait.ts` - BLPOP blocking CLI
- `src/cli/coordination-signal.ts` - Redis LPUSH CLI

**Files to Create:**
- `/trigger-dev/utils/event-aggregator.ts` - Webhook result aggregation
- `/src/integration/trigger-event-bus.ts` - Event routing
- `/docs/TRIGGER_DEV_WEBHOOK_PROTOCOL.md` - Webhook specification

**BLPOP Replacement Pattern:**

```typescript
// BEFORE: Redis BLPOP blocking in orchestrate.sh
coordination-wait --task-id "$TASK_ID" --channel "loop2:start" --timeout 300

// AFTER: trigger.dev webhook subscription in job
export const loop2ExecutorJob = trigger.job({
  id: "execute-loop2",
  run: async (payload: Loop2Payload, io) => {
    // Wait for gate-passed webhook event
    const gatePassedEvent = await io.wait({
      name: "cfn.gate.passed",
      timeoutInSeconds: 300
    });

    console.log(`Gate passed with ${gatePassedEvent.passRate} pass rate`);

    // Proceed with Loop 2 execution
    return executeLoop2Validators(gatePassedEvent);
  }
});
```

**Webhook Handler Patterns:**

```typescript
// trigger-dev/webhooks/orchestration-events.webhook.ts
export const orchestrationWebhook = trigger.webhook({
  id: "cfn-orchestration",
  onRequest: async (request, io) => {
    const event = parseWebhookPayload(request);

    // Route based on event type
    switch (event.type) {
      case "gate.passed":
        await io.sendEvent({
          name: "cfn.gate.passed",
          payload: event.data
        });
        break;

      case "loop2.consensus.collected":
        await io.sendEvent({
          name: "cfn.consensus.ready",
          payload: event.data
        });
        break;

      case "po.decision.made":
        await io.sendEvent({
          name: "cfn.po.decided",
          payload: event.data
        });
        break;

      default:
        console.warn(`Unknown event type: ${event.type}`);
    }

    return { received: true };
  }
});
```

**Success Criteria:**
- [ ] All BLPOP references removed
- [ ] Webhooks handle all coordination points
- [ ] Event ordering preserved (gates before Loop 2)
- [ ] Timeout handling matches original (300s)
- [ ] No Redis coordination calls remain

---

### 3.2 Consensus Collection via trigger.dev Result Aggregation

**Files to Create:**
- `/trigger-dev/jobs/consensus-aggregator.job.ts`
- `/trigger-dev/utils/consensus-calculator.ts`

**Consensus Pattern:**

```typescript
// BEFORE: orchestrate.sh collects via Redis HGETALL
collect_consensus() {
  local task_id="$1"
  redis-cli HGETALL "cfn_loop:${task_id}:validators" | ...
}

// AFTER: trigger.dev job aggregates job results
export const consensusAggregatorJob = trigger.job({
  id: "consensus-aggregator",
  run: async (payload: {
    taskId: string;
    validatorJobIds: string[];
    consensusThreshold: number;
  }, io) => {
    // Collect results from all validator jobs
    const validatorScores = await Promise.all(
      payload.validatorJobIds.map(jobId =>
        io.wait({
          name: `validator.${jobId}.completed`,
          timeoutInSeconds: VALIDATOR_TIMEOUT
        })
      )
    );

    // Calculate consensus
    const consensus = calculateConsensus(validatorScores);

    // Determine if consensus passed
    const passed = consensus.score >= payload.consensusThreshold;

    return {
      consensus: consensus.score,
      passed,
      validatorScores,
      distribution: consensus.distribution
    };
  }
});

function calculateConsensus(scores: ValidatorScore[]): ConsensusResult {
  const values = scores.map(s => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  );

  return {
    score: mean,
    stdDev,
    distribution: {
      min: Math.min(...values),
      max: Math.max(...values),
      quartiles: calculateQuartiles(values)
    }
  };
}
```

**Success Criteria:**
- [ ] All validator scores collected
- [ ] Consensus calculated correctly (mean/median)
- [ ] Threshold comparison works (>= threshold)
- [ ] Results persisted for audit
- [ ] No Redis HGETALL calls

---

### 3.3 Iteration Management via Workflow State

**Files to Create:**
- `/trigger-dev/utils/iteration-state-manager.ts`
- `/trigger-dev/workflows/iteration-control.workflow.ts`

**Iteration Pattern:**

```typescript
// trigger-dev/utils/iteration-state-manager.ts
export interface IterationState {
  taskId: string;
  currentIteration: number;
  maxIterations: number;
  iterationHistory: IterationRecord[];
  gateFailureCount: number;
  consensusFailureCount: number;
  lastFailureReason: string;
}

export async function canIterateLoop3(state: IterationState): Promise<boolean> {
  // Check max iterations
  if (state.currentIteration >= state.maxIterations) {
    console.warn(
      `Max iterations (${state.maxIterations}) exceeded after iteration ${state.currentIteration}`
    );
    return false;
  }

  // Check backoff strategy (don't iterate indefinitely)
  if (state.gateFailureCount >= 3) {
    console.warn(`Three consecutive gate failures, stopping iteration`);
    return false;
  }

  return true;
}

export function recordIterationFailure(
  state: IterationState,
  reason: "gate_failure" | "consensus_failure",
  details: any
): IterationState {
  return {
    ...state,
    currentIteration: state.currentIteration + 1,
    iterationHistory: [
      ...state.iterationHistory,
      {
        iteration: state.currentIteration,
        reason,
        details,
        timestamp: new Date().toISOString()
      }
    ],
    gateFailureCount: reason === "gate_failure"
      ? state.gateFailureCount + 1
      : 0,
    consensusFailureCount: reason === "consensus_failure"
      ? state.consensusFailureCount + 1
      : 0,
    lastFailureReason: reason
  };
}
```

**Iteration Workflow:**

```typescript
// In main CFN Loop workflow
export async function cfnLoopWorkflow(
  initialContext: CFNLoopContext,
  io: IO
): Promise<void> {
  let state: IterationState = {
    taskId: initialContext.taskId,
    currentIteration: 0,
    maxIterations: getMaxIterations(initialContext.mode),
    iterationHistory: [],
    gateFailureCount: 0,
    consensusFailureCount: 0,
    lastFailureReason: ""
  };

  // Main loop
  while (true) {
    console.log(`--- Iteration ${state.currentIteration} ---`);

    // Execute Loop 3
    const loop3Result = await executeLoop3(initialContext, io);

    // Check gate
    const gateResult = await gateCheck(loop3Result.testResults);

    if (!gateResult.passed) {
      // Record failure
      state = recordIterationFailure(state, "gate_failure", {
        passRate: gateResult.passRate,
        required: gateResult.threshold
      });

      // Check if can iterate
      if (!await canIterateLoop3(state)) {
        throw new Error(`Gate failures exceeded max retries: ${state.lastFailureReason}`);
      }

      console.log(`Gate failed, iterating Loop 3 (iteration ${state.currentIteration})`);
      continue; // Retry Loop 3
    }

    // Gate passed - move to Loop 2
    const loop2Result = await executeLoop2(initialContext, io);

    // Collect consensus
    const consensusResult = await aggregateConsensus(loop2Result.validatorScores);

    if (!consensusResult.passed) {
      state = recordIterationFailure(state, "consensus_failure", {
        consensusScore: consensusResult.score,
        required: consensusResult.threshold
      });

      if (state.consensusFailureCount >= 2) {
        throw new Error(`Consensus failures exceeded limit`);
      }

      // Iterate Loop 3 again
      continue;
    }

    // Both gates passed - PO decision
    const poResult = await executeProductOwnerDecision(initialContext, io);

    if (poResult.action === "PROCEED") {
      console.log(`✅ Loop completed successfully`);
      return; // Success
    } else if (poResult.action === "ITERATE") {
      // Re-run entire loop
      continue;
    } else {
      // ABORT
      throw new Error(`Loop aborted: ${poResult.reason}`);
    }
  }
}
```

**Success Criteria:**
- [ ] Iteration counter increments properly
- [ ] Max iterations enforced
- [ ] Backoff strategy prevents infinite loops
- [ ] Failure reasons recorded
- [ ] Iteration history persisted
- [ ] No Redis state storage

---

### 3.4 Product Owner Decision Parsing

**Files to Create:**
- `/trigger-dev/jobs/po-decision.job.ts`
- `/trigger-dev/utils/po-decision-parser.ts`

**Product Owner Job:**

```typescript
// trigger-dev/jobs/po-decision.job.ts
export const poDecisionJob = trigger.job({
  id: "po-decision",
  run: async (payload: {
    taskId: string;
    loop3Results: TestResults;
    loop2Results: ValidationResults;
    consensusScore: number;
    maxIterations: number;
    currentIteration: number;
  }, io) => {
    // Prepare summary for Product Owner
    const summary = {
      task: payload.taskId,
      iteration: payload.currentIteration,
      testPassRate: (payload.loop3Results.passed / payload.loop3Results.total),
      validationScore: payload.consensusScore,
      deliverables: payload.deliverables,
      recommendations: generateRecommendations(payload)
    };

    // Spawn Product Owner agent
    const poAgent = await spawnProductOwnerAgent({
      taskId: payload.taskId,
      summary,
      previousDecisions: payload.previousDecisions || []
    });

    // Wait for webhook completion
    const decision = await io.wait({
      name: `po.${poAgent.id}.decided`,
      timeoutInSeconds: PO_DECISION_TIMEOUT
    });

    // Parse decision
    const parsed = parsePoDecision(decision.output);

    if (!parsed) {
      throw new Error(`Invalid Product Owner decision format`);
    }

    return {
      action: parsed.action,           // PROCEED | ITERATE | ABORT
      reason: parsed.reason,
      feedback: parsed.feedback,
      deliverables: parsed.deliverables
    };
  }
});

function parsePoDecision(output: string): ProductOwnerDecision {
  // Extract decision from agent output
  // Pattern: "DECISION: <PROCEED|ITERATE|ABORT> because <reason>"

  const match = output.match(/DECISION:\s*(PROCEED|ITERATE|ABORT)\s+because\s+(.+)/i);
  if (!match) {
    console.error("Could not parse PO decision from:", output.substring(0, 200));
    return null;
  }

  const action = match[1].toUpperCase() as "PROCEED" | "ITERATE" | "ABORT";
  const reason = match[2].trim();

  return {
    action,
    reason,
    feedback: extractFeedback(output),
    deliverables: extractDeliverables(output)
  };
}
```

**Webhook for PO Completion:**

```typescript
// trigger-dev/webhooks/po-completion.webhook.ts
export const poCompletionWebhook = trigger.webhook({
  id: "po-completion",
  onRequest: async (request, io) => {
    const payload = verifyWebhookSignature(request);

    const {
      agentId,
      taskId,
      output,
      feedback
    } = payload;

    // Parse the decision
    const decision = parsePoDecision(output);

    if (!decision) {
      return sendError("Invalid decision format");
    }

    // Emit event
    await io.sendEvent({
      name: `po.${agentId}.decided`,
      payload: {
        agentId,
        taskId,
        action: decision.action,
        reason: decision.reason,
        feedback: decision.feedback,
        output
      }
    });

    return { received: true };
  }
});
```

**Success Criteria:**
- [ ] PO agent receives comprehensive summary
- [ ] Decision parsed from agent output
- [ ] PROCEED/ITERATE/ABORT logic works
- [ ] Feedback extracted for auditing
- [ ] No Redis parsing calls

---

## Phase 4: Deprecation & Archival (Days 15-18)

### 4.1 Archive Strategy (Not Deletion)

**Archive Location:** `.archive/cfn-redis-coordination-legacy/`

All deprecated code is MOVED (not deleted) to preserve history and enable rollback.

### 4.2 Directories to Archive

**ENTIRE DIRECTORIES TO ARCHIVE:**

```bash
# Execute these moves during Phase 4
mv .claude/skills/cfn-coordination/ .archive/cfn-redis-coordination-legacy/skills-cfn-coordination/
mv .claude/skills/cfn-redis-coordination/ .archive/cfn-redis-coordination-legacy/skills-cfn-redis-coordination/
mv .claude/skills/cfn-docker-redis-coordination/ .archive/cfn-redis-coordination-legacy/skills-cfn-docker-redis-coordination/
mv src/coordination/ .archive/cfn-redis-coordination-legacy/src-coordination/
```

1. `.claude/skills/cfn-coordination/` (58 files, 150+ LOC)
   - `agent-completion.sh`
   - `coordination-signal.sh`
   - `tests/coordination.test.ts`
   - All archive/legacy files

2. `.claude/skills/cfn-redis-coordination/` (40+ files, 800+ LOC)
   - `src/redis/` - All Redis helper modules
   - `bash-wrappers/` - Redis CLI wrappers
   - `tests/` - Redis-specific tests
   - `docs/` - Redis documentation

3. `.claude/skills/cfn-docker-redis-coordination/` (25+ files, 600+ LOC)
   - All Docker + Redis integration code
   - Tests for Docker Redis networking

4. `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh` (1,721 LOC)
   - Main shell-based orchestrator
   - All helper functions for Bash orchestration

**FILES TO ARCHIVE:**

```bash
mkdir -p .archive/cfn-redis-coordination-legacy/src-cli/
mv src/cli/coordination-wait.ts .archive/cfn-redis-coordination-legacy/src-cli/
mv src/cli/coordination-signal.ts .archive/cfn-redis-coordination-legacy/src-cli/
```

- `src/cli/coordination-wait.ts` (235 LOC)
- `src/cli/coordination-signal.ts` (179 LOC)
- `src/coordination/coordination-wrapper.ts` (300+ LOC)
- `src/types/coordination.d.ts` (50+ LOC)
- `src/coordination/` - ENTIRE DIRECTORY

### 4.3 Task Mode: RETAINED (Decouple from Redis)

**Note:** Task Mode is KEPT. It was only coupled to Redis coordination due to memory leak workarounds.

**Refactoring needed:**
- Remove Redis fallback from Task Mode agents
- Task Mode will use trigger.dev webhooks OR in-memory coordination
- See Phase 3 for Task Mode adapter implementation

**PATTERNS TO REMOVE FROM FILES:**

Files that need partial deletions (specific functions/patterns):

```typescript
// src/cli/agent-prompt-builder.ts - REMOVE:
- BLPOP injection code
- Redis coordination context
- coordination-wait command references
- Redis channel naming patterns

// src/cli/orchestrator-cli.ts - REMOVE:
- All redis import statements
- RedisCoordinator class instantiation
- BLPOP/LPUSH patterns
- Redis connection setup

// CLAUDE.md - REMOVE:
- All Redis configuration sections
- coordination-wait/coordination-signal documentation
- BLPOP/LPUSH examples
- Redis troubleshooting guide
- Task Mode references (incompatible with trigger.dev)

// .claude/commands/cfn-loop-cli.md - REMOVE:
- "Verify Redis Availability" section
- Redis environment variable setup
- Redis command examples
- CFN_REDIS_* variable documentation

// .claude/commands/cfn-loop-task.md - REFACTOR (keep file)
- Remove Redis coordination references
- Update to use trigger.dev webhooks or in-memory coordination
- Task Mode RETAINED for debugging/visibility use cases
```

**Specific Function Deletions (in large files):**

From `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`:
```bash
# DELETE ALL OF THESE FUNCTIONS:
- coordination_wait()
- coordination_signal()
- collect_loop3_results_from_redis()
- collect_validator_scores_from_redis()
- send_completion_signal()
- wait_for_gate_passed_signal()
- all redis-cli calls

# REPLACE WITH:
- webhook event handling stubs
- trigger.dev job references
```

### 4.2 File Deletion Checklist

Create file `/docs/DEPRECATION_CHECKLIST.md`:

```markdown
# CFN Loop Redis Deprecation Checklist

## Phase 4: File Deletion

### Directories (Delete Entirely)

- [ ] `.claude/skills/cfn-coordination/`
- [ ] `.claude/skills/cfn-redis-coordination/`
- [ ] `.claude/skills/cfn-docker-redis-coordination/`
- [ ] `.claude/skills/cfn-docker-loop-orchestration/` (entire shell orchestrator)
- [ ] `legacy/v1/src/cfn-loop/` (if keeping legacy)

### Key Files (Delete)

- [ ] `src/cli/coordination-wait.ts`
- [ ] `src/cli/coordination-signal.ts`
- [ ] `src/coordination/coordination-wrapper.ts`
- [ ] `src/types/coordination.d.ts`
- [ ] `.claude/commands/cfn-loop-task.md`
- [ ] `docs/COORDINATION_PROTOCOL.md` (old Redis-based)
- [ ] `docs/REDIS_DEPLOYMENT.md`
- [ ] `.env.redis.template`
- [ ] `docker-compose.redis.yml` (if separate)

### Partial Deletions (Remove Specific Code)

Source file modifications:

- [ ] `CLAUDE.md` - Remove Redis sections (lines X-Y)
- [ ] `.claude/commands/cfn-loop-cli.md` - Remove Redis checks
- [ ] `src/cli/agent-prompt-builder.ts` - Remove Redis context injection
- [ ] `src/cli/orchestrator-cli.ts` - Remove Redis initialization
- [ ] `package.json` - Remove redis, ioredis, redis-client dependencies
- [ ] `docker-compose.yml` - Remove redis service
- [ ] `.github/workflows/test.yml` - Remove Redis startup step
- [ ] `tests/cli-mode/` - Remove Redis-dependent tests
- [ ] `tests/docker-mode/` - Remove Redis coordination tests

### Tests to Delete

- [ ] `tests/integration/coordination-protocols.test.ts`
- [ ] `tests/coordination/redis-coordination.test.ts`
- [ ] `tests/coordination-wrapper.test.ts`
- [ ] `.claude/skills/cfn-redis-coordination/tests/`
- [ ] `.claude/skills/cfn-docker-redis-coordination/tests/`

### Documentation to Delete/Update

- [ ] `docs/COORDINATION_PROTOCOL.md` (Redis-based, replace with trigger.dev)
- [ ] `docs/REDIS_ARCHITECTURE.md`
- [ ] `docs/REDIS_TROUBLESHOOTING.md`
- [ ] All Redis-specific ADRs

### Commands to Update/Delete

- [ ] `.claude/commands/cfn-loop-cli.md` - Remove Redis requirement check
- [ ] `.claude/commands/cfn-loop-task.md` - DELETE ENTIRELY
- [ ] `.claude/commands/cfn/` - Remove coordination commands
- [ ] `/switch-api` command docs - Remove Redis provider routing

### Verification Steps

- [ ] grep -r "redis-cli" project root → 0 matches
- [ ] grep -r "BLPOP\|LPUSH\|LPOP" project root → 0 matches
- [ ] grep -r "CFN_REDIS_" project root → 0 matches
- [ ] grep -r "coordination-wait" project root → 0 matches
- [ ] grep -r "coordination-signal" project root → 0 matches
- [ ] grep -r "Task Mode" CLAUDE.md → 0 matches
- [ ] npm install → no redis/ioredis packages
- [ ] npm test → all tests pass
- [ ] ESLint → no orphaned imports
```

**Success Criteria:**
- [ ] All files deleted or modified
- [ ] Zero grep matches for redis/BLPOP/coordination-wait
- [ ] npm dependencies cleaned
- [ ] Build passes with no errors
- [ ] Tests pass (after updating)

---

### 4.3 Redis Dependency Elimination

**Files to Modify:**

1. **`package.json`** - Remove dependencies:
```json
{
  "dependencies": {
    // REMOVE:
    // "redis": "^4.6.0",
    // "ioredis": "^5.3.0",
    // "@redis/client": "^1.5.0",

    // ADD:
    "@trigger.dev/sdk": "^1.0.0",
    "node-fetch": "^3.3.0"
  }
}
```

2. **`docker-compose.yml`** - Remove Redis service:
```yaml
# DELETE:
# redis:
#   image: redis:7-alpine
#   ports: ["6379:6379"]

# REPLACE with trigger.dev networking
services:
  api:
    environment:
      TRIGGER_API_URL: "http://trigger-api:3030"
```

3. **`.github/workflows/test.yml`** - Remove Redis startup:
```yaml
# REMOVE:
# - name: Start Redis
#   run: docker run -d -p 6379:6379 redis:7-alpine

# REPLACE with:
# - name: Start trigger.dev
#   run: docker compose up -d
```

**Success Criteria:**
- [ ] npm list | grep redis → empty
- [ ] docker-compose.yml has no redis service
- [ ] GitHub Actions don't wait for Redis
- [ ] .env template has no Redis vars
- [ ] Configuration docs updated

---

### 4.4 Task Mode Deprecation

**Status:** ENTIRELY REMOVE (incompatible with trigger.dev async model)

**Files to Delete:**
- `.claude/commands/cfn-loop-task.md` - Entire file
- `.claude/commands/cfn-docker/CFN_DOCKER_TASK.md` - If exists
- `.claude/skills/cfn-task-mode/` - If separate directory

**Update in `.claude/commands/cfn-loop-cli.md`:**
```markdown
# ⚠️ DEPRECATION NOTICE (v4.0.0)

Task Mode has been deprecated and removed in favor of fully async trigger.dev-based workflows.

**Old Command (No Longer Supported):**
```bash
/cfn-loop-task "task description"  # ❌ REMOVED
```

**New Command:**
```bash
/cfn-loop-cli "task description"  # ✅ USE THIS
```

**Key Differences:**
| Feature | Task Mode | CLI Mode (trigger.dev) |
|---------|-----------|----------------------|
| Spawning | Synchronous Task() | Async job creation |
| Blocking | BLPOP (Redis) | Webhooks |
| Visibility | Real-time in chat | Via dashboard |
| Cost | Higher | 95% savings |
| Duration | Limited to session | Unlimited |

**Migration Guide:**
For workflows that used Task Mode:
1. Switch to `/cfn-loop-cli` (exact same syntax)
2. Monitor via trigger.dev dashboard
3. Results still returned to chat when complete
```

**Update in `CLAUDE.md`:**

Remove Task Mode section entirely:
```markdown
# DELETE THIS ENTIRE SECTION:
### Task Mode (Deprecated v4.0.0 - Use CLI Mode Instead)

Task Mode has been deprecated and completely removed.
All users must migrate to CLI Mode, which is more reliable and cost-effective.
```

**Success Criteria:**
- [ ] All Task Mode references removed
- [ ] Zero grep matches for "Task Mode"
- [ ] Deprecation notice in all relevant docs
- [ ] Migration guide provided
- [ ] Tests updated to use CLI mode only

---

## Phase 5: Testing & Validation (Days 19-22)

### 5.1 New Test Suite Structure

**Files to Create:**
- `/tests/trigger-dev/` - New test directory
- `/tests/trigger-dev/workflows.test.ts` - Workflow tests
- `/tests/trigger-dev/webhooks.test.ts` - Webhook handler tests
- `/tests/trigger-dev/jobs.test.ts` - Job execution tests
- `/tests/trigger-dev/e2e-cfn-loop.test.ts` - End-to-end tests
- `/tests/trigger-dev/integration.test.ts` - Integration tests

**Test Structure:**
```typescript
// tests/trigger-dev/workflows.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TriggerClient } from "@trigger.dev/sdk";
import { cfnLoopWorkflow } from "../../trigger-dev/workflows/cfn-loop.workflow";

describe("CFN Loop Workflow", () => {
  let client: TriggerClient;

  beforeEach(async () => {
    client = new TriggerClient({
      apiUrl: process.env.TRIGGER_API_URL || "http://localhost:3030",
      apiKey: process.env.TRIGGER_API_KEY
    });
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it("should initialize workflow with correct context", async () => {
    const trigger = await client.trigger("cfn.loop.start", {
      taskId: "test-task-123",
      taskDescription: "Test feature implementation",
      mode: "standard"
    });

    expect(trigger.id).toBeDefined();
    expect(trigger.status).toBe("pending");
  });

  it("should execute Loop 3 agents in parallel", async () => {
    const result = await client.invokeJob("spawn-agents", {
      taskId: "test-task-123",
      agentTypes: ["backend-developer", "frontend-engineer"],
      context: {
        /* ... */
      }
    });

    expect(result.agentJobs).toHaveLength(2);
    expect(result.agentJobs.every(j => j.id)).toBe(true);
  });

  it("should aggregate test results correctly", async () => {
    const testResults = [
      { passed: 8, total: 10 },
      { passed: 9, total: 10 },
      { passed: 7, total: 10 }
    ];

    const aggregated = aggregateTestResults(testResults);

    expect(aggregated.totalPassed).toBe(24);
    expect(aggregated.totalTests).toBe(30);
    expect(aggregated.passRate).toBeCloseTo(0.8);
  });

  it("should enforce gate threshold", async () => {
    const gateResult = await client.invokeJob("gate-check", {
      testResults: { passed: 8, total: 10 }, // 80% pass rate
      gateThreshold: 0.95,                     // 95% required
      mode: "standard"
    });

    expect(gateResult.passed).toBe(false);
    expect(gateResult.passRate).toBe(0.8);
  });

  it("should calculate consensus correctly", async () => {
    const validatorScores = [0.85, 0.90, 0.88, 0.92];
    const consensus = calculateConsensus(validatorScores);

    expect(consensus.score).toBeCloseTo(0.8875); // mean
    expect(consensus.distribution.min).toBe(0.85);
    expect(consensus.distribution.max).toBe(0.92);
  });

  it("should handle iteration correctly", async () => {
    let state: IterationState = {
      taskId: "test-task",
      currentIteration: 0,
      maxIterations: 5,
      iterationHistory: [],
      gateFailureCount: 0,
      consensusFailureCount: 0,
      lastFailureReason: ""
    };

    state = recordIterationFailure(state, "gate_failure", {
      passRate: 0.75
    });

    expect(state.currentIteration).toBe(1);
    expect(state.gateFailureCount).toBe(1);
    expect(state.iterationHistory).toHaveLength(1);
  });

  it("should parse Product Owner decision", () => {
    const output = `
      Analysis complete.
      DECISION: PROCEED because all tests pass and consensus score is 0.92.

      Feedback:
      - Code quality excellent
      - Security review passed
      - Performance meets requirements
    `;

    const decision = parsePoDecision(output);

    expect(decision.action).toBe("PROCEED");
    expect(decision.reason).toContain("all tests pass");
    expect(decision.feedback).toBeDefined();
  });
});
```

**Success Criteria:**
- [ ] All workflows have unit tests
- [ ] Test coverage ≥85%
- [ ] Tests mock trigger.dev client
- [ ] No external dependencies in tests
- [ ] Tests pass in CI

---

### 5.2 E2E Workflow Tests

**Files to Create:**
- `/tests/trigger-dev/e2e-cfn-loop.test.ts` (300+ LOC)

**E2E Test Pattern:**
```typescript
// tests/trigger-dev/e2e-cfn-loop.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTriggerDev, stopTriggerDev } from "../test-utils/trigger-docker";
import { CFNLoopClient } from "../../trigger-dev/client";

describe("CFN Loop E2E", () => {
  let triggerContainer: string;
  let client: CFNLoopClient;

  beforeAll(async () => {
    // Start trigger.dev stack
    triggerContainer = await startTriggerDev();
    client = new CFNLoopClient({
      apiUrl: "http://localhost:3030",
      webhookUrl: "http://localhost:3031"
    });
  });

  afterAll(async () => {
    await stopTriggerDev(triggerContainer);
  });

  it("should complete full CFN Loop for simple task", async () => {
    // Trigger CFN Loop
    const loopId = await client.triggerCFNLoop({
      taskId: "e2e-test-001",
      taskDescription: "Build a simple counter component",
      mode: "mvp"
    });

    expect(loopId).toBeDefined();

    // Wait for completion with timeout
    const result = await client.waitForCompletion(loopId, {
      timeoutSeconds: 600
    });

    expect(result.status).toBe("completed");
    expect(result.action).toBe("PROCEED");
    expect(result.iterations).toBeLessThanOrEqual(5); // MVP mode
    expect(result.finalPassRate).toBeGreaterThanOrEqual(0.70); // MVP threshold
  }, { timeout: 660000 }); // 11 minutes

  it("should handle gate failure and retry", async () => {
    const loopId = await client.triggerCFNLoop({
      taskId: "e2e-gate-fail-001",
      taskDescription: "Complex distributed system",
      mode: "standard"
    });

    const result = await client.waitForCompletion(loopId, {
      timeoutSeconds: 600
    });

    // Check iteration history
    expect(result.iterations).toBeGreaterThan(1); // Multiple iterations
    expect(result.iterationHistory.some(it => it.reason === "gate_failure")).toBe(true);
  }, { timeout: 660000 });

  it("should abort on max iterations exceeded", async () => {
    const loopId = await client.triggerCFNLoop({
      taskId: "e2e-abort-001",
      taskDescription: "Very complex task",
      mode: "mvp",
      maxIterations: 2 // Intentionally low
    });

    const result = await client.waitForCompletion(loopId, {
      timeoutSeconds: 600
    }).catch(e => e.result); // Expect completion with error

    expect(result.status).toBe("aborted");
    expect(result.reason).toContain("max iterations");
  }, { timeout: 660000 });
});
```

**Success Criteria:**
- [ ] Full workflow executes start-to-finish
- [ ] All stages complete in expected order
- [ ] Results persisted correctly
- [ ] Error handling works
- [ ] Tests don't flake (stable)

---

### 5.3 Webhook Handler Tests

**Files to Create:**
- `/tests/trigger-dev/webhooks.test.ts` (200+ LOC)

**Webhook Test Pattern:**
```typescript
// tests/trigger-dev/webhooks.test.ts
import { describe, it, expect } from "vitest";
import { handleAgentCompletion } from "../../trigger-dev/webhooks/agent-completion.webhook";
import { verifyWebhookSignature } from "../../trigger-dev/utils/webhook-signature";

describe("Webhook Handlers", () => {
  it("should handle valid agent completion webhook", async () => {
    const payload = {
      agentId: "agent-test-001",
      taskId: "task-123",
      output: "Implementation complete",
      confidence: 0.92,
      testResults: { passed: 10, total: 10 }
    };

    const signature = signWebhook(payload);
    const request = createMockRequest(payload, signature);

    const response = await handleAgentCompletion(request, createMockIO());

    expect(response.received).toBe(true);
  });

  it("should reject invalid webhook signature", async () => {
    const payload = { /* ... */ };
    const invalidSignature = "invalid-sig";
    const request = createMockRequest(payload, invalidSignature);

    const response = await handleAgentCompletion(request, createMockIO());

    expect(response.error).toBeDefined();
  });

  it("should reject missing required fields", async () => {
    const payload = {
      agentId: "agent-test-001",
      // Missing: taskId, output, testResults
    };

    const request = createMockRequest(payload, signWebhook(payload));
    const response = await handleAgentCompletion(request, createMockIO());

    expect(response.error).toContain("Missing required");
  });

  it("should emit correct event on completion", async () => {
    const io = createMockIO();
    const payload = {
      agentId: "agent-test-001",
      taskId: "task-123",
      output: "Done",
      confidence: 0.85,
      testResults: { passed: 8, total: 10 }
    };

    const request = createMockRequest(payload, signWebhook(payload));
    await handleAgentCompletion(request, io);

    expect(io.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "agent.agent-test-001.completed"
      })
    );
  });
});
```

**Success Criteria:**
- [ ] Valid payloads accepted
- [ ] Invalid signatures rejected
- [ ] Missing fields detected
- [ ] Events emitted correctly
- [ ] Webhook signature verification works

---

### 5.4 Performance Benchmarks

**Files to Create:**
- `/tests/trigger-dev/performance.bench.ts`

**Benchmark Suite:**
```typescript
// tests/trigger-dev/performance.bench.ts
import { bench, describe } from "vitest";
import { aggregateTestResults } from "../../trigger-dev/utils/test-aggregator";
import { calculateConsensus } from "../../trigger-dev/utils/consensus-calculator";

describe("Performance Benchmarks", () => {
  bench("aggregateTestResults - 100 agents", () => {
    const results = Array(100).fill(0).map((_, i) => ({
      agentId: `agent-${i}`,
      passed: Math.floor(Math.random() * 100),
      total: 100
    }));

    aggregateTestResults(results);
  });

  bench("calculateConsensus - 50 validators", () => {
    const scores = Array(50).fill(0).map(() => Math.random());
    calculateConsensus(scores);
  });

  bench("parsePoDecision - complex output", () => {
    const output = `
      [ANALYSIS]
      Task: Complex system implementation
      Status: Complete

      [TEST RESULTS]
      Passed: 95/100
      Coverage: 92%

      [DECISION]
      DECISION: PROCEED because all metrics exceed thresholds

      [FEEDBACK]
      - Excellent code quality
      - All tests passing
      - Ready for production
    `;

    parsePoDecision(output);
  });
});

// Expected results (baselines):
// - aggregateTestResults: < 10ms
// - calculateConsensus: < 5ms
// - parsePoDecision: < 20ms
```

**Success Criteria:**
- [ ] All operations complete within expected time
- [ ] Benchmarks run in CI
- [ ] Performance tracked across versions
- [ ] No regressions detected

---

## Phase 6: Documentation & Cleanup (Days 23-25)

### 6.1 Update CLAUDE.md

**Major Changes:**
```markdown
# Delete Entire Sections:
- Multi-worktree Docker Coordination (Redis-specific)
- Task Mode SQLite Lifecycle Execution
- Redis troubleshooting
- BLPOP/LPUSH examples

# Update Sections:
- CFN Loop Overview → Trigger.dev-based model
- Coordination Patterns → Webhook event model
- CLI Mode → Now default (no alternatives)

# Add Sections:
- trigger.dev Architecture (new)
- Webhook Protocol Specification (new)
- Iteration State Management (new)
- trigger.dev Deployment (new)
```

**Files to Create:**
- `/docs/TRIGGER_DEV_ARCHITECTURE.md` - System design
- `/docs/WEBHOOK_PROTOCOL.md` - Webhook specification
- `/docs/TRIGGER_DEV_DEPLOYMENT.md` - Setup instructions

### 6.2 New Slash Commands

**Files to Create/Modify:**
- `.claude/commands/cfn-loop-cli.md` - Update for trigger.dev
- `.claude/commands/cfn-loop-webhook.md` - NEW: Webhook management
- `.claude/commands/cfn-dashboard.md` - NEW: Access trigger.dev dashboard

**Updated cfn-loop-cli.md:**
```markdown
---
description: "Execute CFN Loop via trigger.dev (async, cost-optimized, 95-98% savings)"
argument-hint: "<task description> [--mode=mvp|standard|enterprise]"
---

# CFN Loop CLI - trigger.dev Execution

**Now powered by trigger.dev instead of Redis!**

## Quick Start

```bash
/cfn-loop-cli "Implement JWT authentication" --mode=standard
```

## What Changed

- **Coordination**: Webhooks (not Redis BLPOP)
- **Async**: Returns immediately, results via dashboard
- **Reliable**: No Redis dependency
- **Observable**: Full audit trail in trigger.dev

## Results

Results appear in trigger.dev dashboard at:
```
http://localhost:3000/workflows/cfn-loop-start/${TASK_ID}
```
```

**New Webhook Management Command:**
```markdown
---
description: "Manage trigger.dev webhook configuration"
---

# CFN Webhook Management

## Register Webhook Endpoint

```bash
/cfn-webhook-register --endpoint https://your-domain.com/webhooks
```

## View Active Webhooks

```bash
/cfn-webhook-list
```

## Test Webhook

```bash
/cfn-webhook-test --webhook-id <id>
```
```

### 6.3 Deprecation Notices

**Files to Create:**
- `/DEPRECATION_NOTICE.md` - User-facing notice
- `/MIGRATION_GUIDE.md` - Step-by-step migration

**Deprecation Notice:**
```markdown
# CFN Loop v4.0.0 - Architecture Migration Complete

## What Changed

The CFN Loop coordination layer has been completely rewritten from **Redis-based** to **trigger.dev-based** architecture.

### Why
- **Reliability**: Eliminated Redis dependency and BLPOP blocking issues
- **Cost**: 95-98% cheaper with async job model
- **Observability**: Full audit trail and dashboard visibility
- **Scalability**: No single-point-of-failure in Redis
- **Maintainability**: Event-driven architecture (webhook-based)

### What You Need to Do

**If using `/cfn-loop-cli`:**
- No changes needed! Same command, same syntax
- Results now appear in trigger.dev dashboard
- Everything else works the same

**If using `/cfn-loop-task` (Task Mode):**
- ⚠️ **DEPRECATED AND REMOVED**
- Switch to `/cfn-loop-cli` (same syntax)
- Task Mode was incompatible with async architecture

### Timeline
- **v4.0.0** (TODAY): Redis support removed
- **v4.1.0**: All redis packages purged from dependencies
- **v4.2.0**: Legacy documentation archived

### Questions?
See: `/docs/TRIGGER_DEV_MIGRATION_GUIDE.md`
```

### 6.4 Runbooks

**Files to Create:**
- `/docs/runbooks/TRIGGER_DEV_SETUP.md` - Installation
- `/docs/runbooks/CFN_LOOP_TROUBLESHOOTING.md` - Debugging
- `/docs/runbooks/WEBHOOK_DEBUGGING.md` - Webhook issues

**Example Runbook:**
```markdown
# CFN Loop Troubleshooting

## Issue: Workflow stuck in pending state

### Diagnosis
```bash
curl http://localhost:3030/api/workflows/{taskId}
```

### Solutions
1. Check trigger.dev logs: `docker logs trigger-api`
2. Verify Redis cache working: `redis-cli PING`
3. Check webhook endpoint reachable: `curl -X POST {webhookUrl}`

## Issue: Agent completion webhook not received

### Check webhook delivery
```bash
# View webhook attempts in trigger.dev dashboard
http://localhost:3000/webhooks

# Check agent logs
docker logs cfn-agent-{agentId}

# Verify webhook signature
curl -X POST {webhookUrl} -H "X-Trigger-Signature: ..." -d '{...}'
```

## Issue: Gate threshold not met

### Debug pass rate
```
View test results in: Dashboard → Task → Test Results Tab

Check individual test failures:
- Navigate to failing test
- View agent output
- Check success criteria
```
```

**Success Criteria:**
- [ ] All documentation updated
- [ ] Deprecation notices visible
- [ ] Runbooks cover common issues
- [ ] Migration guide tested
- [ ] Links verified

---

## Rollback Checkpoints

Each phase includes a rollback point to revert to the previous state.

### Phase 0 Rollback
**If trigger.dev deployment fails:**
```bash
docker-compose -f docker/trigger.dev/docker-compose.yml down -v
# System remains on Redis-based version
```

### Phase 1 Rollback
**If workflow implementation incomplete:**
```bash
git checkout main -- trigger-dev/workflows/
# Revert to Redis-based orchestrate.sh
```

### Phase 2 Rollback
**If agent spawning migration fails:**
```bash
# Revert to CLI-based spawning
git checkout main -- trigger-dev/jobs/spawn-agent.job.ts
```

### Phase 3 Rollback
**If coordination replacement incomplete:**
```bash
# Files not yet deleted, full Redis stack still available
# Switch to CLI mode with Redis backend
export COORDINATION_MODE=redis
```

### Phase 4 Rollback
**Cannot rollback Phase 4** (file deletion phase)
- **Ensure Phase 1-3 are fully complete and tested**
- **Create backup branch before Phase 4:**
  ```bash
  git checkout -b backup/pre-deprecation-v4.0.0
  git push origin backup/pre-deprecation-v4.0.0
  ```
- **Create tag:**
  ```bash
  git tag -a v3.9.9-redis-final -m "Last Redis-based CFN Loop version"
  git push origin v3.9.9-redis-final
  ```

---

## Success Metrics & Verification

### Phase Completion Criteria

**Phase 0:** Infrastructure
- [ ] trigger.dev stack online (docker ps shows 6+ services)
- [ ] Dashboard accessible: http://localhost:3000
- [ ] API responding: `curl http://localhost:3030/health`

**Phase 1:** Workflows
- [ ] All 4 workflows compile
- [ ] Workflow tests pass (≥85% coverage)
- [ ] Event progression validated

**Phase 2:** Agent Spawning
- [ ] Agent spawning tests pass
- [ ] Webhook handlers receive results
- [ ] Test results parsed correctly

**Phase 3:** Coordination
- [ ] Zero Redis references in new code
- [ ] Event aggregation works
- [ ] Iteration logic correct

**Phase 4:** Deprecation
- [ ] `grep -r "redis-cli" . → 0 matches`
- [ ] `grep -r "BLPOP\|LPUSH" . → 0 matches`
- [ ] `npm list redis → empty`
- [ ] All tests pass

**Phase 5:** Testing
- [ ] E2E tests pass (real trigger.dev)
- [ ] Webhook tests pass (with mocks)
- [ ] Performance benchmarks acceptable

**Phase 6:** Documentation
- [ ] No broken links in docs
- [ ] Deprecation notices in place
- [ ] Runbooks tested
- [ ] Migration guide followed successfully

### Final Verification Checklist

```bash
# 1. No Redis references remain
grep -r "redis\|BLPOP\|LPUSH\|coordination-wait" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=.artifacts \
  --exclude="*.lock"
# Expected: 0 matches (except in comments/docs)

# 2. All dependencies clean
npm list | grep redis
# Expected: (empty)

# 3. Services running
docker ps
# Expected: trigger-api, trigger-web, postgres, minio, clickhouse, redis

# 4. Tests passing
npm test
# Expected: All tests pass

# 5. Build succeeds
npm run build
# Expected: Build completes without errors

# 6. Linter clean
npm run lint
# Expected: No errors

# 7. Workflow executes end-to-end
/cfn-loop-cli "Test workflow" --mode=mvp
# Expected: Task ID returned, dashboard updates

# 8. Documentation validates
./scripts/validate-docs.sh
# Expected: No broken links
```

---

## Effort Estimation & Timeline

### Days 1-2: Infrastructure (Days 1-2)
- trigger.dev deployment: 6h
- Database setup: 4h
- Network configuration: 3h
- Testing infrastructure: 7h
- **Total: 20h**

### Days 3-6: Workflow Implementation (Days 3-6)
- Core CFN Loop workflow: 16h
- Loop 3 workflow: 12h
- Loop 2 workflow: 10h
- PO decision workflow: 8h
- Gate checking: 8h
- **Total: 54h**

### Days 7-10: Agent Spawning (Days 7-10)
- Job-based spawning: 12h
- Webhook completion handlers: 10h
- Context injection: 8h
- Parallel execution: 10h
- Testing/debugging: 15h
- **Total: 55h**

### Days 11-14: Coordination Replacement (Days 11-14)
- Event aggregation: 15h
- Consensus collection: 12h
- Iteration management: 10h
- PO decision parsing: 8h
- Testing: 20h
- **Total: 65h**

### Days 15-18: Deprecation & Removal (Days 15-18)
- File deletion: 5h
- Code cleanup: 10h
- Dependency updates: 5h
- Integration testing: 15h
- Documentation updates: 10h
- **Total: 45h**

### Days 19-22: Testing (Days 19-22)
- Unit tests: 20h
- E2E tests: 20h
- Integration tests: 15h
- Performance testing: 10h
- **Total: 65h**

### Days 23-25: Documentation (Days 23-25)
- CLAUDE.md update: 8h
- Trigger.dev docs: 12h
- Runbooks: 10h
- Migration guide: 8h
- Verification: 12h
- **Total: 50h**

**TOTAL EFFORT: 354 hours (44 days at 8h/day)**
**Compressed Timeline: 25 days with 2-3 person team (parallel work)**

---

## Risk Assessment

### High Risk Items

1. **Webhook Delivery Guarantees**
   - Risk: Webhooks lost in network failures
   - Mitigation: Implement webhook retry logic with exponential backoff
   - Fallback: Polling for job completion as backup

2. **Agent Completion Timing**
   - Risk: Agents complete before webhook URL injected
   - Mitigation: Agent waits for webhook URL before starting work
   - Fallback: Manual completion submission by agent

3. **Event Ordering**
   - Risk: Webhooks arrive out of order
   - Mitigation: Event system handles concurrent webhooks
   - Fallback: Sequence numbers in payloads

4. **Backward Compatibility**
   - Risk: Breaking existing integrations
   - Mitigation: No existing users (greenfield)
   - Fallback: Maintain Redis endpoint alongside (if needed)

### Medium Risk Items

1. **Performance Regression**
   - Mitigation: Benchmark before/after each phase
   - Success Criteria: < 5% performance degradation

2. **Data Loss During Migration**
   - Mitigation: Redis data exported and archived
   - Fallback: Restore from backup

3. **Complexity of Webhook Coordination**
   - Mitigation: Extensive testing of event sequences
   - Fallback: Synchronous REST polling as backup

### Low Risk Items

1. **Dependency Availability**
   - trigger.dev well-maintained, active community

2. **Docker Orchestration**
   - Proven technology, well-documented

3. **Documentation Gaps**
   - Will be comprehensive (60+ hours allocated)

---

## Conclusion

This migration represents a fundamental shift from **pull-based coordination** (Redis BLPOP) to **push-based events** (webhooks). The benefits are significant:

| Aspect | Redis-Based | trigger.dev |
|--------|-------------|------------|
| Complexity | High (bash + Redis) | Medium (TypeScript + webhooks) |
| Reliability | Medium (single point of failure) | High (distributed event system) |
| Cost | Higher (Redis infrastructure) | 95-98% savings |
| Observability | Poor (manual logging) | Excellent (dashboard + trails) |
| Scalability | Limited (Redis bottleneck) | Unlimited (serverless jobs) |
| Maintenance | High (Redis ops) | Low (managed service) |

**The migration is justified and achievable within 25 days with proper parallelization.**

