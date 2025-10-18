# Metrics Placement Strategy - Comprehensive Analysis

## Current State

**Database Stats:**
- `provider.request`: 6 records (3 Anthropic, 3 Z.ai)
- `user.actions`: 6 records (demo data)
- `demo.run.count`: 3 records

**Existing Instrumentation:**
- ✅ Provider routing (`src/providers/tiered-router.ts`) - ALREADY INSTRUMENTED

---

## Complete Metrics Taxonomy

### 1. API Request Lifecycle
**What to track:** Full request/response cycle from client to provider

| Metric | Type | Location | Tags | Purpose |
|--------|------|----------|------|---------|
| `api.request.received` | Counter | MCP Server handler | endpoint, method, clientId | Track incoming requests |
| `api.request.duration` | Timer | MCP Server handler | endpoint, method, status | Measure latency |
| `api.request.bytes_sent` | Counter | MCP Server handler | endpoint | Track payload sizes |
| `api.request.bytes_received` | Counter | MCP Server handler | endpoint | Track response sizes |
| `api.error.count` | Counter | MCP Server error handler | errorType, endpoint | Track error rates |

**Placement:** `src/mcp/server.ts` - lines 200-300 (request handler functions)

**Why here:** Single entry point for all API requests, no double counting

**Implementation:**
```typescript
// src/mcp/server.ts - handleRequest method
async handleRequest(request: MCPRequest): Promise<MCPResponse> {
  const startTime = Date.now();

  incrementMetric('api.request.received', 1, {
    endpoint: request.method,
    clientId: this.currentSession?.id || 'unknown'
  });

  try {
    const response = await this.router.route(request);

    recordTiming('api.request.duration', Date.now() - startTime, {
      endpoint: request.method,
      status: 'success'
    });

    return response;
  } catch (error) {
    recordTiming('api.request.duration', Date.now() - startTime, {
      endpoint: request.method,
      status: 'error'
    });

    incrementMetric('api.error.count', 1, {
      errorType: error.name,
      endpoint: request.method
    });

    throw error;
  }
}
```

---

### 2. Provider Selection & Routing
**What to track:** Provider tier selection, fallback decisions, subscription usage

| Metric | Type | Location | Tags | Purpose |
|--------|------|----------|------|---------|
| `provider.request` | Counter | ✅ DONE - tiered-router.ts | provider, tier, agentType, source | Track routing decisions |
| `provider.fallback` | Counter | tiered-router.ts | fromTier, toTier, reason | Track fallback events |
| `subscription.consumed` | Counter | tiered-router.ts | tier | Track quota usage |
| `subscription.remaining` | Gauge | tiered-router.ts | limit, used | Monitor quota |

**Placement:** `src/providers/tiered-router.ts` - ALREADY DONE ✅

**Double-count risk:** None - single selectProvider() method

---

### 3. Agent Lifecycle
**What to track:** Agent creation, execution, completion, failures

| Metric | Type | Location | Tags | Purpose |
|--------|------|----------|------|---------|
| `agent.created` | Counter | AgentManager.createAgent | agentType, swarmId | Track agent spawns |
| `agent.started` | Counter | AgentManager.runAgent | agentType, agentId | Track execution starts |
| `agent.completed` | Counter | AgentManager.runAgent | agentType, status | Track completions |
| `agent.duration` | Timer | AgentManager.runAgent | agentType, status | Measure execution time |
| `agent.error` | Counter | AgentManager catch block | agentType, errorType | Track failures |

**Placement:** `src/core/agent-manager.ts` - lines 14-78

**Double-count risk:** LOW - single createAgent/runAgent entry points

**Implementation:**
```typescript
// src/core/agent-manager.ts
createAgent(type: AgentType, task: string): string {
  const id = this.generateId();
  const agent: AgentConfig = {
    id, type, task,
    status: 'pending',
    created: new Date(),
  };

  this.agents.set(id, agent);

  incrementMetric('agent.created', 1, {
    agentType: type,
    swarmId: 'standalone' // or extract from context
  });

  return id;
}

async runAgent(id: string): Promise<void> {
  const config = this.agents.get(id);
  const startTime = Date.now();

  incrementMetric('agent.started', 1, {
    agentType: config.type,
    agentId: id
  });

  config.status = 'running';

  try {
    const agent = new SimpleAgent(config);
    const result = await agent.execute();

    config.result = result;
    config.status = 'completed';

    recordTiming('agent.duration', Date.now() - startTime, {
      agentType: config.type,
      status: 'success'
    });

    incrementMetric('agent.completed', 1, {
      agentType: config.type,
      status: 'success'
    });
  } catch (error) {
    config.status = 'failed';

    recordTiming('agent.duration', Date.now() - startTime, {
      agentType: config.type,
      status: 'error'
    });

    incrementMetric('agent.completed', 1, {
      agentType: config.type,
      status: 'error'
    });

    incrementMetric('agent.error', 1, {
      agentType: config.type,
      errorType: error.name
    });

    throw error;
  }
}
```

---

### 4. Swarm Coordination
**What to track:** Swarm initialization, task orchestration, agent collaboration

| Metric | Type | Location | Tags | Purpose |
|--------|------|----------|------|---------|
| `swarm.initialized` | Counter | SwarmCoordinator.constructor | topology, maxAgents | Track swarm creation |
| `swarm.task.created` | Counter | SwarmCoordinator.createTask | taskType, priority | Track task creation |
| `swarm.task.assigned` | Counter | SwarmCoordinator.assignTask | taskType, agentType | Track assignments |
| `swarm.task.completed` | Counter | SwarmCoordinator.completeTask | taskType, status | Track completions |
| `swarm.task.duration` | Timer | SwarmCoordinator.completeTask | taskType, status | Measure task time |
| `swarm.agents.active` | Gauge | SwarmCoordinator periodic | topology | Monitor active agents |

**Placement:** `src/coordination/swarm-coordinator.ts` - lines 83-300

**Double-count risk:** MEDIUM - multiple task lifecycle methods

**Risk mitigation:** Instrument ONLY in completeTask, not in intermediate steps

**Implementation:**
```typescript
// src/coordination/swarm-coordinator.ts

constructor(config: Partial<SwarmConfig> = {}) {
  super();
  // ... existing code

  incrementMetric('swarm.initialized', 1, {
    topology: this.config.coordinationStrategy,
    maxAgents: this.config.maxAgents.toString()
  });
}

createTask(taskData: Partial<SwarmTask>): SwarmTask {
  const task: SwarmTask = {
    id: generateId('task'),
    ...taskData,
    status: 'pending',
    createdAt: new Date(),
    retryCount: 0,
    maxRetries: this.config.maxRetries
  };

  this.tasks.set(task.id, task);

  incrementMetric('swarm.task.created', 1, {
    taskType: task.type,
    priority: task.priority.toString()
  });

  return task;
}

async completeTask(taskId: string, result: any): Promise<void> {
  const task = this.tasks.get(taskId);
  const duration = Date.now() - task.startedAt.getTime();

  task.status = 'completed';
  task.result = result;
  task.completedAt = new Date();

  recordTiming('swarm.task.duration', duration, {
    taskType: task.type,
    status: 'success'
  });

  incrementMetric('swarm.task.completed', 1, {
    taskType: task.type,
    status: 'success'
  });
}

// Periodic health check
private checkHealth(): void {
  const activeAgents = Array.from(this.agents.values())
    .filter(a => a.status === 'busy').length;

  recordGauge('swarm.agents.active', activeAgents, {
    topology: this.config.coordinationStrategy
  });
}
```

---

### 5. Claude API Client
**What to track:** API calls to Claude (Anthropic), token usage, errors

| Metric | Type | Location | Tags | Purpose |
|--------|------|----------|------|---------|
| `claude.api.request` | Counter | ClaudeClient.sendMessage | model, provider | Track API calls |
| `claude.api.duration` | Timer | ClaudeClient.sendMessage | model, status | Measure latency |
| `claude.tokens.input` | Counter | ClaudeClient.sendMessage | model | Track input tokens |
| `claude.tokens.output` | Counter | ClaudeClient.sendMessage | model | Track output tokens |
| `claude.api.error` | Counter | ClaudeClient error handler | model, errorType | Track API errors |

**Placement:** `src/api/claude-client.ts` - sendMessage method

**Double-count risk:** NONE - single API entry point

**Implementation:**
```typescript
// src/api/claude-client.ts

async sendMessage(messages: ClaudeMessage[]): Promise<ClaudeResponse> {
  const startTime = Date.now();

  incrementMetric('claude.api.request', 1, {
    model: this.config.model,
    provider: 'anthropic'
  });

  try {
    const response = await this.makeRequest({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    recordTiming('claude.api.duration', Date.now() - startTime, {
      model: this.config.model,
      status: 'success'
    });

    incrementMetric('claude.tokens.input', response.usage.input_tokens, {
      model: this.config.model
    });

    incrementMetric('claude.tokens.output', response.usage.output_tokens, {
      model: this.config.model
    });

    return response;
  } catch (error) {
    recordTiming('claude.api.duration', Date.now() - startTime, {
      model: this.config.model,
      status: 'error'
    });

    incrementMetric('claude.api.error', 1, {
      model: this.config.model,
      errorType: error.name
    });

    throw error;
  }
}
```

---

### 6. MCP Tools (swarm_init, agent_spawn, task_orchestrate)
**What to track:** MCP tool invocations via server

| Metric | Type | Location | Tags | Purpose |
|--------|------|----------|------|---------|
| `mcp.tool.invoked` | Counter | ToolRegistry.executeTool | toolName, clientId | Track tool usage |
| `mcp.tool.duration` | Timer | ToolRegistry.executeTool | toolName, status | Measure execution time |
| `mcp.tool.error` | Counter | ToolRegistry error handler | toolName, errorType | Track tool errors |

**Placement:** `src/mcp/tools.ts` - executeTool method

**Double-count risk:** NONE - single tool execution entry point

---

### 7. Memory Operations
**What to track:** Memory storage, retrieval, search operations

| Metric | Type | Location | Tags | Purpose |
|--------|------|----------|------|---------|
| `memory.store` | Counter | MemoryManager.store | namespace, ttl | Track writes |
| `memory.retrieve` | Counter | MemoryManager.retrieve | namespace, hit/miss | Track reads |
| `memory.search` | Counter | MemoryManager.search | namespace, resultCount | Track searches |
| `memory.size` | Gauge | MemoryManager periodic | namespace | Monitor size |

**Placement:** `src/memory/manager.ts` or SwarmMemory operations

**Double-count risk:** LOW - centralized memory interface

---

## Recommended Implementation Priority

### Phase 1: High-Value, Low-Risk (Complete by Sprint 1)
1. ✅ **Provider Routing** - ALREADY DONE
2. **Agent Lifecycle** - Core agent manager (single entry point)
3. **MCP API Requests** - Server handler (single entry point)

### Phase 2: Medium-Value, Medium-Risk (Complete by Sprint 2)
4. **Swarm Coordination** - Task lifecycle tracking
5. **Claude API Client** - Token usage and latency

### Phase 3: Optional Enhancement (Future)
6. **MCP Tool Invocations** - Granular tool tracking
7. **Memory Operations** - Storage patterns

---

## Double-Count Prevention Rules

### Rule 1: Single Source of Truth
**Instrument at the LOWEST common entry point**
- ✅ Good: `tiered-router.selectProvider()` (single method)
- ❌ Bad: Both in router AND in provider implementations

### Rule 2: Avoid Nested Instrumentation
**Don't track at multiple layers of the same call stack**
- ✅ Good: `AgentManager.runAgent()` (top-level)
- ❌ Bad: Both in runAgent AND in SimpleAgent.execute()

### Rule 3: Use Status Tags Instead of Multiple Metrics
**One metric with tags > multiple metrics**
- ✅ Good: `agent.completed` with `status: 'success'|'error'`
- ❌ Bad: `agent.success` AND `agent.failure` (separate counters)

### Rule 4: Test with Known Counts
**Verify metrics with controlled scenarios**
```bash
# Example: Spawn 5 agents, expect exactly 5 agent.created metrics
npx claude-flow-novice agent spawn coder "task" --count 5

# Query database
sqlite3 .claude-flow/metrics.db "
  SELECT COUNT(*) FROM metrics
  WHERE name = 'agent.created'
  AND timestamp > datetime('now', '-1 minute')
"
# Expected: 5
```

---

## Service vs Agent Metrics Breakdown

### Service Metrics (Infrastructure)
**Services = background systems that enable agent work**

| Service | Metrics | Purpose |
|---------|---------|---------|
| **MCP Server** | `api.request.received`, `api.request.duration`, `api.error.count` | Track incoming requests from Claude Code |
| **Provider Router** | `provider.request`, `provider.fallback`, `subscription.consumed` | Monitor routing decisions and quota |
| **Claude API Client** | `claude.api.request`, `claude.tokens.input`, `claude.api.error` | Track external API usage |
| **Memory Manager** | `memory.store`, `memory.retrieve`, `memory.size` | Monitor memory operations |
| **Swarm Coordinator** | `swarm.initialized`, `swarm.agents.active` | Track swarm infrastructure |

**Insight:** Services run continuously, handling ALL agent traffic.

---

### Agent Metrics (Work Execution)
**Agents = ephemeral workers that perform tasks**

| Agent Component | Metrics | Purpose |
|----------------|---------|---------|
| **Agent Manager** | `agent.created`, `agent.started`, `agent.completed`, `agent.duration` | Track agent lifecycle |
| **Agent Tasks** | `swarm.task.created`, `swarm.task.completed`, `swarm.task.duration` | Track work units |
| **MCP Tools** | `mcp.tool.invoked` (swarm_init, agent_spawn) | Track agent creation requests |

**Insight:** Agents are spawned per-task, execute, then terminate.

---

### Example: 10 Coder Agents Request Flow

**Service metrics (infrastructure):**
```
api.request.received = 1       # MCP server receives swarm_init request
provider.request = 10          # Router selects provider for 10 agents
claude.api.request = 10        # 10 API calls to Anthropic/Z.ai
swarm.initialized = 1          # One swarm created
```

**Agent metrics (work execution):**
```
agent.created = 10             # 10 agents spawned
agent.started = 10             # 10 agents begin execution
agent.completed = 10           # 10 agents finish
swarm.task.created = 10        # 10 tasks created
swarm.task.completed = 10      # 10 tasks finished
```

**Key insight:**
- **Services** = 1 swarm, 10 provider routings, 10 API calls
- **Agents** = 10 lifecycles, 10 task executions

---

## Query Examples for Service vs Agent Stats

### Service Performance
```sql
-- Provider routing breakdown (service)
SELECT
  json_extract(tags, '$.provider') as provider,
  json_extract(tags, '$.tier') as tier,
  COUNT(*) as requests
FROM metrics
WHERE name = 'provider.request'
GROUP BY provider, tier;

-- API latency by provider (service)
SELECT
  json_extract(tags, '$.model') as model,
  AVG(value) as avg_latency_ms,
  MIN(value) as min_latency_ms,
  MAX(value) as max_latency_ms
FROM metrics
WHERE name = 'claude.api.duration'
GROUP BY model;
```

### Agent Work Patterns
```sql
-- Agent execution stats (agent work)
SELECT
  json_extract(tags, '$.agentType') as agent_type,
  COUNT(*) as total_executions,
  AVG(value) as avg_duration_ms
FROM metrics
WHERE name = 'agent.duration'
GROUP BY agent_type;

-- Task completion rates (agent work)
SELECT
  json_extract(tags, '$.taskType') as task_type,
  json_extract(tags, '$.status') as status,
  COUNT(*) as count
FROM metrics
WHERE name = 'swarm.task.completed'
GROUP BY task_type, status;
```

### Combined Service + Agent Analysis
```sql
-- Total system throughput
SELECT
  'Service: MCP Requests' as metric, COUNT(*) as count
FROM metrics WHERE name = 'api.request.received'
UNION ALL
SELECT
  'Service: Provider Routings', COUNT(*)
FROM metrics WHERE name = 'provider.request'
UNION ALL
SELECT
  'Agent: Executions', COUNT(*)
FROM metrics WHERE name = 'agent.completed'
UNION ALL
SELECT
  'Agent: Tasks', COUNT(*)
FROM metrics WHERE name = 'swarm.task.completed';
```

---

## Next Steps

1. **Implement Phase 1** (Agent Lifecycle + MCP API)
2. **Create test script** to verify no double counting
3. **Build dashboard query** to visualize service vs agent stats
4. **Document tagging conventions** for consistency
