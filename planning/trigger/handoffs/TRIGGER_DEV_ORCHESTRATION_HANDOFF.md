# Trigger.dev Orchestration Handoff

**Purpose:** Replace Redis-based CLI coordination with trigger.dev job orchestration for CFN Loop execution.

**Date:** 2025-11-23
**Status:** Planning Phase - Architecture Analysis Complete
**Priority:** High - Core infrastructure decision

---

## Executive Summary

### Current State
- ✅ CLI agents working individually in trigger.dev container
- ✅ Multi-provider AI routing (ZAI, Kimi, OpenRouter) integrated
- ✅ Basic Redis coordination for completion signals
- ❌ **Not using trigger.dev orchestration capabilities**
- ❌ Individual parallel execution instead of CFN Loop coordination

### Problem Statement
We chose trigger.dev to replace the orchestration layer but are only using it as an execution environment. This is like buying a Kubernetes cluster but only using it as a Linux VM.

### Target State
Replace Redis coordination with trigger.dev native job orchestration:
- trigger.dev jobs manage CFN Loop workflow
- Webhook triggers coordinate agent spawning
- Built-in retry, monitoring, and persistence
- Event-driven architecture instead of polling

---

## Architecture Decision

### Chosen Approach: **Trigger.dev Native Orchestration**

**Why:**
- ✅ Leverages existing investment in trigger.dev
- ✅ Built-in retry, persistence, and monitoring
- ✅ Event-driven vs polling-based coordination
- ✅ Professional dashboard for job monitoring
- ✅ Replaces Redis coordination layer entirely

**Rejected Alternatives:**
- ❌ Keep Redis coordination (underutilizes trigger.dev)
- ❌ Custom orchestration (reinventing trigger.dev features)

---

## Required Implementation

### Phase 1: Trigger.dev Job Definition

**File:** `trigger-dev/src/jobs/cfn-loop-coordination.ts`

```typescript
import { client } from "@trigger.dev/sdk";
import { z } from "zod";

export const cfnLoopJob = client.defineJob({
  id: "cfn-loop-execution",
  name: "CFN Loop Agent Execution",
  version: "0.1.0",
  trigger: {
    event: {
      name: "cfn.loop.start",
      schema: z.object({
        taskId: z.string(),
        taskDescription: z.string(),
        mode: z.enum(["mvp", "standard", "enterprise"]),
        provider: z.enum(["zai", "kimi", "openrouter", "max"]),
        agents: z.array(z.string()),
      }),
    },
  },
  run: async (payload, io, ctx) => {
    const { taskId, taskDescription, mode, provider, agents } = payload;

    io.logger.info("CFN Loop job started", { taskId, mode, provider });

    // Phase 1: Loop 3 Implementation
    const loop3Results = await executeLoop3(io, agents, {
      taskId,
      taskDescription,
      provider,
      iteration: 1,
    });

    // Phase 2: Gate Check
    const gatePassed = await checkQualityGates(io, loop3Results, mode);

    if (!gatePassed) {
      // Phase 3: Loop 2 Validation
      const loop2Results = await executeLoop2(io, agents, {
        taskId,
        loop3Results,
        provider,
      });

      // Phase 4: Product Owner Decision
      const decision = await executeProductOwner(io, loop2Results, mode);

      if (decision === "ITERATE") {
        // Recursive iteration
        return await executeIteration(io, {
          taskId,
          taskDescription,
          mode,
          provider,
          agents,
          iteration: 2,
        });
      }
    }

    return {
      status: "completed",
      taskId,
      finalResults: loop3Results,
      iterations: 1,
    };
  },
});

async function executeLoop3(io, agents, params) {
  const results = [];

  for (const agentType of agents) {
    io.logger.info(`Spawning ${agentType} agent`);

    const result = await io.runTask(
      `spawn-${agentType}`,
      async (task) => {
        // Execute CLI agent within trigger.dev worker
        const { spawn } = require('child_process');

        return new Promise((resolve, reject) => {
          const agent = spawn('npx', [
            'claude-flow-novice', 'agent', agentType,
            '--task', params.taskDescription,
            '--provider', params.provider,
            '--iterations', '1',
          ], {
            cwd: '/workspace',
            env: {
              ...process.env,
              TASK_ID: params.taskId,
              ITERATION: params.iteration.toString(),
              MODE: params.mode,
              PROVIDER: params.provider,
            },
          });

          let output = '';
          agent.stdout.on('data', (data) => {
            output += data.toString();
          });

          agent.on('close', (code) => {
            if (code === 0) {
              resolve({ output, exitCode: code });
            } else {
              reject(new Error(`Agent failed with code ${code}`));
            }
          });
        });
      }
    );

    results.push({ agent: agentType, result });
  }

  return results;
}

async function executeLoop2(io, agents, params) {
  // Similar pattern for validation agents
  // ...
}

async function executeProductOwner(io, results, mode) {
  // Product owner decision logic
  // ...
}

async function checkQualityGates(io, results, mode) {
  // Quality gate validation based on mode
  // MVP: 70% pass rate
  // Standard: 95% pass rate
  // Enterprise: 98% pass rate
}
```

### Phase 2: Event Integration

**File:** `trigger-dev/src/events/cfn-events.ts`

```typescript
import { client } from "@trigger.dev/sdk";

export const cfnEvents = {
  // Start CFN Loop execution
  async startExecution(params: {
    taskId: string;
    taskDescription: string;
    mode: "mvp" | "standard" | "enterprise";
    provider: "zai" | "kimi" | "openrouter" | "max";
    agents: string[];
  }) {
    return await client.sendEvent({
      name: "cfn.loop.start",
      payload: params,
    });
  },

  // Agent completion signals (if needed)
  async agentCompleted(params: {
    taskId: string;
    agentId: string;
    result: any;
    confidence: number;
  }) {
    return await client.sendEvent({
      name: "cfn.agent.completed",
      payload: params,
    });
  },
};
```

### Phase 3: Integration Layer

**File:** `src/cli/trigger-integration.ts`

```typescript
export class TriggerOrchestration {
  constructor(private client: typeof cfnEvents) {}

  async startCFNLoop(params: {
    taskDescription: string;
    mode: "mvp" | "standard" | "enterprise";
    provider: "zai" | "kimi" | "openrouter" | "max";
    agents: string[];
  }) {
    const taskId = `cfn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await this.client.startExecution({
      taskId,
      ...params,
    });

    return taskId;
  }

  async getJobStatus(taskId: string) {
    // Query trigger.dev job status
    // Replace Redis polling
  }
}
```

---

## What We've Tried

### ✅ Working Components
1. **CLI Agent Spawning**: Successfully spawning agents with provider routing
   ```bash
   npx claude-flow-novice agent backend-developer --provider=zai
   ```

2. **Multi-Provider Integration**: ZAI, Kimi, OpenRouter all working
   ```bash
   docker exec trigger-dev-worker npx claude-flow-novice agent backend-developer --provider=kimi
   ```

3. **Basic Container Environment**: Tools installed, workspace mounted correctly

4. **Redis Coordination**: Basic completion signals working
   ```bash
   redis-cli -h redis -p 6379 LLEN "cfn:mainchat:signal:task-id"
   ```

### ❌ Failed Approaches

1. **Individual Agent Execution**: Not CFN Loop coordination
   ```bash
   # This is what we're doing now - NOT CFN Loop
   agent1 & agent2 & agent3 &
   wait $PID1 $PID2 $PID3
   ```

2. **Missing CFN Loop Structure**: No Loop 3 → Loop 2 → Product Owner progression
   - Agents run in parallel instead of coordinated phases
   - No quality gates or consensus building
   - No iteration logic

3. **Unused Trigger.dev Features**:
   - Job scheduling and persistence
   - Built-in retry mechanisms
   - Event-driven coordination
   - Monitoring dashboard
   - Webhook triggers

---

## Assumptions to Test

### Technical Assumptions

1. **CLI Agents Can Run Inside trigger.dev Jobs**
   - **Test**: Spawn CLI agent from within trigger.dev job
   - **Risk**: Child process management in containerized environment
   - **Validation**: Agent executes and returns results successfully

2. **trigger.dev Events Can Replace Redis**
   - **Test**: Event-driven coordination vs Redis BLPOP
   - **Risk**: Event delivery latency and ordering
   - **Validation**: Events trigger jobs reliably without polling

3. **Job Persistence Survives Container Restarts**
   - **Test**: Kill and restart trigger-dev container mid-job
   - **Risk**: Job state lost on container failure
   - **Validation**: Job resumes from checkpoint after restart

4. **Webhook Integration Works for External Triggers**
   - **Test**: External system triggers CFN Loop via webhook
   - **Risk**: Webhook URL discovery and authentication
   - **Validation**: Webhook triggers job execution successfully

### Performance Assumptions

1. **Event-Driven Coordination is Faster Than Redis Polling**
   - **Test**: Measure end-to-end latency
   - **Risk**: Event processing overhead vs direct Redis
   - **Validation**: Event-driven shows ≤ Redis polling latency

2. **Job Concurrency Handles Multiple CFN Loops**
   - **Test**: Run 10 CFN Loops concurrently
   - **Risk**: Resource contention and database limits
   - **Validation**: All jobs complete without interference

### Integration Assumptions

1. **Existing CLI Commands Work Unmodified**
   - **Test**: Current CLI agent spawning within trigger.dev job
   - **Risk**: Environment variable differences
   - **Validation**: No changes needed to CLI agent code

2. **Provider Routing Preserved in trigger.dev Environment**
   - **Test**: ZAI, Kimi, OpenRouter work from within jobs
   - **Risk**: API key access and routing logic
   - **Validation**: All providers function identically

---

## Testing Strategy

### Phase 1: Basic Job Execution
```typescript
// Test: Simple job spawns single agent
const testJob = await client.sendEvent({
  name: "cfn.loop.start",
  payload: {
    taskId: "test-basic-execution",
    taskDescription: "Test basic trigger.dev job execution",
    mode: "mvp",
    provider: "zai",
    agents: ["backend-developer"],
  },
});
```

### Phase 2: Event Coordination
```typescript
// Test: Event-driven agent coordination
await client.sendEvent({
  name: "cfn.agent.spawn",
  payload: {
    agentType: "backend-developer",
    taskId: "test-event-coordination",
  },
});
```

### Phase 3: Full CFN Loop
```typescript
// Test: Complete Loop 3 → Loop 2 → Product Owner workflow
const fullLoop = await startCFNLoop({
  taskDescription: "Build comprehensive monitoring dashboard",
  mode: "standard",
  provider: "zai",
  agents: ["backend-developer", "frontend-engineer", "code-quality-validator"],
});
```

### Phase 4: Resilience Testing
```bash
# Test: Container restart resilience
docker-compose restart trigger-worker
# Verify job continues from checkpoint

# Test: Concurrent execution
for i in {1..10}; do
  startCFNLoop "Test $i" &
done
```

---

## Implementation Plan

### Sprint 1: Foundation (Week 1)
- [ ] Create trigger.dev job definitions
- [ ] Test basic CLI agent spawning within jobs
- [ ] Implement event-driven coordination
- [ ] Create integration layer

### Sprint 2: CFN Loop Integration (Week 2)
- [ ] Implement Loop 3 execution logic
- [ ] Add quality gate validation
- [ ] Implement Loop 2 validation
- [ ] Add Product Owner decision logic

### Sprint 3: Advanced Features (Week 3)
- [ ] Add iteration management
- [ ] Implement retry logic
- [ ] Create monitoring dashboard
- [ ] Add webhook integration

### Sprint 4: Migration (Week 4)
- [ ] Migrate existing CLI workflows
- [ ] Update documentation
- [ ] Performance optimization
- [ ] Production deployment

---

## Success Criteria

### Technical Success
- ✅ All CLI agents work within trigger.dev jobs
- ✅ Event-driven coordination replaces Redis
- ✅ Full CFN Loop execution (Loop 3 → Loop 2 → Product Owner)
- ✅ Job persistence and restart resilience
- ✅ Multi-provider routing preserved

### Business Success
- ✅ Reduced coordination complexity
- ✅ Improved monitoring and debugging
- ✅ Better resource utilization
- ✅ Professional orchestration layer
- ✅ Investment in trigger.dev justified

### Performance Success
- ✅ ≤ Current execution latency
- ✅ ≥ Current reliability
- ✅ Built-in retry reduces manual intervention
- ✅ Monitoring provides visibility into failures

---

## Risk Mitigation

### High Risk: CLI Agent Integration
- **Mitigation**: Container isolation with proper environment
- **Fallback**: Keep current CLI coordination as backup

### Medium Risk: Event Delivery
- **Mitigation**: Redundant event tracking and retry logic
- **Fallback**: Redis coordination for critical paths

### Low Risk: Performance
- **Mitigation**: Benchmark current vs trigger.dev performance
- **Fallback**: Optimize event processing or revert approach

---

## Next Steps

1. **Immediate**: Create basic trigger.dev job definition
2. **Week 1**: Test CLI agent spawning within jobs
3. **Week 2**: Implement full CFN Loop coordination
4. **Month 1**: Complete migration from Redis to trigger.dev

---

**Status:** Ready for implementation
**Next Review:** After basic job execution test
**Owner:** CFN Loop Development Team
**Stakeholders:** Architecture Team, DevOps Team