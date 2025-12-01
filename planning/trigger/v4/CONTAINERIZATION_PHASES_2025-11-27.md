# CFN Agent Containerization - Phased Implementation Plan

**Date:** 2025-11-27
**Author:** Claude (via research subagents)
**Status:** Planning Complete - Ready for Implementation
**Estimated Effort:** 5 sprints (10-15 hours each)

---

## Executive Summary

This document outlines a phased approach to containerize CFN Loop agent execution within Trigger.dev. The infrastructure is largely in place; the primary work is connecting Trigger.dev tasks to Docker container spawning with proper isolation.

### Current State
- MDAP micro-task decomposition: **WORKING** (100% success rate)
- Trigger.dev v4 self-hosted: **OPERATIONAL** (100 agent stress test passed)
- Docker infrastructure: **READY** (coordinator, redis, socket-proxy configured)
- CLI execution: **WORKING** (with `--dangerously-skip-permissions` fix)

### Gap Analysis

| Component | Status | Gap |
|-----------|--------|-----|
| Trigger.dev tasks | ✅ Working | Uses host CLI, not containers |
| Docker Compose | ✅ Ready | Not integrated with Trigger.dev |
| Agent images | ⚠️ Partial | Generic image, no agent-specific builds |
| Workspace isolation | ❌ Missing | Agents share host filesystem |
| Container health | ❌ Missing | No lifecycle monitoring |
| MDAP + containers | ❌ Missing | Tier doesn't affect container resources |

---

## Phase 1: Container Spawning Foundation

**Duration:** 1 sprint (10-15 hours)
**Goal:** Trigger.dev tasks can spawn and manage Docker containers

### Deliverables

1. **docker-spawner.ts** - Dockerode wrapper for container lifecycle
   ```typescript
   interface ContainerSpawnOptions {
     image: string;
     name: string;
     memory: string; // e.g., "512m"
     env: Record<string, string>;
     mounts: Mount[];
     networkMode: string;
     timeout: number;
   }

   export async function spawnAgentContainer(options: ContainerSpawnOptions): Promise<Container>;
   export async function waitForContainer(container: Container): Promise<ContainerResult>;
   export async function cleanupContainer(container: Container): Promise<void>;
   ```

2. **cfn-agent-container.ts** - New Trigger.dev task
   ```typescript
   export const cfnAgentContainerTask = task({
     id: "cfn-agent-container",
     run: async (payload: {
       taskId: string;
       agentId: string;
       agentType: string;
       prompt: string;
       workDir: string;
       provider: string;
       modelTier: number;
     }) => {
       // 1. Select image based on agentType
       // 2. Spawn container with Dockerode
       // 3. Wait for completion
       // 4. Extract results
       // 5. Cleanup container
     }
   });
   ```

3. **Socket proxy integration**
   - Mount via `DOCKER_HOST=tcp://socket-proxy:2375`
   - No direct docker.sock access (security)

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/docker-spawner.ts` | CREATE | Dockerode wrapper |
| `src/trigger/cfn-agent-container.ts` | CREATE | Container spawning task |
| `src/lib/container-registry.ts` | CREATE | Image selection logic |
| `docker-compose.yml` | MODIFY | Add Trigger.dev network access |

### Success Criteria
- [ ] Single container spawns from Trigger.dev task
- [ ] Container executes Claude CLI and returns output
- [ ] Container cleanup after completion
- [ ] 10 parallel containers stable

### Testing
```bash
# Test single container spawn
npx tsx test-container-spawn.ts

# Test 10 parallel spawns
npx tsx test-container-parallel.ts --count=10
```

---

## Phase 2: Agent-Specific Images

**Duration:** 1 sprint (10-15 hours)
**Goal:** Specialized Docker images per agent type with correct tooling

### Agent Image Matrix

| Agent Type | Base Image | Memory | Special Tools |
|------------|------------|--------|---------------|
| typescript-specialist | node:20-slim | 256-512MB | tsc, ts-node |
| backend-developer | node:20-slim | 512MB-1GB | prisma, postgres-client |
| react-frontend-engineer | node:20-slim | 512-800MB | playwright, chrome |
| rust-developer | rust:1.74-slim | 1GB | cargo, rustfmt |
| docker-specialist | docker:24-dind | 2GB | docker, buildx |
| python-developer | python:3.12-slim | 512MB | pip, venv |

### Deliverables

1. **Dockerfiles per agent type**
   ```
   docker/agents/
   ├── Dockerfile.typescript
   ├── Dockerfile.backend
   ├── Dockerfile.frontend
   ├── Dockerfile.rust
   ├── Dockerfile.docker
   └── Dockerfile.python
   ```

2. **Build script**
   ```bash
   #!/bin/bash
   # build-agent-images.sh
   for agent in typescript backend frontend rust docker python; do
     docker build -f docker/agents/Dockerfile.${agent} \
       -t cfn-agent:${agent} .
   done
   ```

3. **Registry push to Trigger.dev registry**
   ```bash
   # Tag and push to localhost:5000
   docker tag cfn-agent:typescript localhost:5000/cfn-agent:typescript
   docker push localhost:5000/cfn-agent:typescript
   ```

4. **Image selector in container-registry.ts**
   ```typescript
   export function getImageForAgentType(agentType: string): string {
     const imageMap: Record<string, string> = {
       'typescript-specialist': 'cfn-agent:typescript',
       'backend-developer': 'cfn-agent:backend',
       'react-frontend-engineer': 'cfn-agent:frontend',
       'rust-developer': 'cfn-agent:rust',
       'docker-specialist': 'cfn-agent:docker',
     };
     return imageMap[agentType] || 'cfn-agent:typescript'; // fallback
   }
   ```

### Success Criteria
- [ ] 6 agent images built and pushed to registry
- [ ] Image selection based on agent type works
- [ ] Frontend agent can run Playwright tests
- [ ] Docker agent can build images (DinD)

---

## Phase 3: Workspace Isolation

**Duration:** 1 sprint (10-15 hours)
**Goal:** Per-agent workspace with file conflict prevention

### Architecture

```
/workspace (main)
├── src/
├── package.json
└── ...

/agent-workspaces/
├── agent-123/  (copy-on-write clone)
│   ├── src/
│   └── package.json
├── agent-456/
└── agent-789/
```

### Deliverables

1. **workspace-manager.ts**
   ```typescript
   interface WorkspaceOptions {
     sourceDir: string;
     agentId: string;
     includePatterns?: string[];  // e.g., ["src/**", "package.json"]
     excludePatterns?: string[];  // e.g., ["node_modules", ".git"]
   }

   export async function createAgentWorkspace(options: WorkspaceOptions): Promise<string>;
   export async function mergeAgentChanges(agentWorkspace: string, mainWorkspace: string): Promise<MergeResult>;
   export async function cleanupAgentWorkspace(agentWorkspace: string): Promise<void>;
   ```

2. **Copy-on-write implementation**
   - Use rsync for initial sync (fast, selective)
   - Bind mount agent workspace to container
   - Diff-based merge back to main workspace

3. **Conflict detection**
   ```typescript
   interface MergeResult {
     merged: string[];       // Successfully merged files
     conflicts: string[];    // Files modified by multiple agents
     unchanged: string[];    // Files not modified
   }
   ```

### Success Criteria
- [ ] Agent workspace created in <5 seconds
- [ ] Changes isolated to agent workspace
- [ ] Merge back detects conflicts
- [ ] Cleanup removes workspace completely

---

## Phase 4: MDAP Container Integration

**Duration:** 1 sprint (10-15 hours)
**Goal:** MDAP tier controls container resources

### Tier to Resource Mapping

| MDAP Tier | Model | Memory | CPU | Timeout |
|-----------|-------|--------|-----|---------|
| T1 (Haiku) | glm-4.5-air | 256MB | 0.5 | 2 min |
| T2 (Mini) | glm-4.6 | 512MB | 1.0 | 5 min |
| T3 (GPT-4) | gpt-4o | 1GB | 2.0 | 10 min |
| T4 (Sonnet) | claude-3-5-sonnet | 2GB | 4.0 | 15 min |
| T5 (Opus) | claude-3-opus | 4GB | 8.0 | 30 min |

### Deliverables

1. **mdap-container-config.ts**
   ```typescript
   export function getContainerResourcesForTier(tier: ModelTier): ContainerResources {
     const resourceMap: Record<number, ContainerResources> = {
       1: { memory: '256m', cpus: 0.5, timeout: 120000 },
       2: { memory: '512m', cpus: 1.0, timeout: 300000 },
       3: { memory: '1g', cpus: 2.0, timeout: 600000 },
       4: { memory: '2g', cpus: 4.0, timeout: 900000 },
       5: { memory: '4g', cpus: 8.0, timeout: 1800000 },
     };
     return resourceMap[tier.tier];
   }
   ```

2. **Container metrics recording**
   ```sql
   ALTER TABLE mdap_executions ADD COLUMN container_id VARCHAR(64);
   ALTER TABLE mdap_executions ADD COLUMN memory_peak_mb INTEGER;
   ALTER TABLE mdap_executions ADD COLUMN cpu_time_ms INTEGER;
   ```

3. **Resource-based escalation**
   - Track OOM kills -> trigger tier escalation
   - Track CPU throttling -> adjust limits

### Success Criteria
- [ ] T1 tasks use 256MB containers
- [ ] T5 tasks use 4GB containers
- [ ] OOM triggers automatic tier escalation
- [ ] Metrics recorded for all container executions

---

## Phase 5: Production Hardening

**Duration:** 1 sprint (10-15 hours)
**Goal:** Security, monitoring, fault tolerance for production

### Deliverables

1. **Health checks**
   ```typescript
   // Container health monitoring
   export async function monitorContainerHealth(container: Container): Promise<void> {
     const healthCheck = setInterval(async () => {
       const stats = await container.stats({ stream: false });
       if (stats.memory_stats.usage > stats.memory_stats.limit * 0.9) {
         logger.warn('Container near memory limit', { containerId: container.id });
       }
     }, 5000);
   }
   ```

2. **Auto-restart on failure**
   ```typescript
   HostConfig: {
     RestartPolicy: {
       Name: 'on-failure',
       MaximumRetryCount: 2
     }
   }
   ```

3. **Audit logging**
   ```sql
   CREATE TABLE container_audit_log (
     id SERIAL PRIMARY KEY,
     timestamp TIMESTAMP DEFAULT NOW(),
     action VARCHAR(50),  -- 'create', 'start', 'stop', 'remove'
     container_id VARCHAR(64),
     task_id VARCHAR(255),
     agent_id VARCHAR(255),
     result VARCHAR(50),  -- 'success', 'failed', 'timeout'
     metadata JSONB
   );
   ```

4. **Resource quotas**
   ```typescript
   // Enforce total memory budget across all containers
   const MAX_TOTAL_MEMORY = 40 * 1024 * 1024 * 1024; // 40GB

   export async function canSpawnContainer(memory: number): Promise<boolean> {
     const currentUsage = await getTotalContainerMemory();
     return currentUsage + memory <= MAX_TOTAL_MEMORY;
   }
   ```

5. **Seccomp profile enforcement**
   - Use existing `docker/seccomp/agent-lifecycle.json`
   - Block dangerous syscalls

### Success Criteria
- [ ] Health checks running for all containers
- [ ] Failed containers auto-restart (max 2 retries)
- [ ] All container operations logged
- [ ] Memory budget enforced (40GB limit)
- [ ] Security profiles applied

---

## Integration Points

### With MDAP System
```typescript
// In cfn-implementer-v2.ts
const tier = selectModelTier(complexityLevel, currentTier, failureCount);
const resources = getContainerResourcesForTier(tier);
const container = await spawnAgentContainer({
  image: getImageForAgentType(agentType),
  memory: resources.memory,
  cpus: resources.cpus,
  timeout: resources.timeout,
  // ...
});
```

### With Existing Trigger.dev Tasks
```typescript
// Modify cfn-implementer-v2.ts to use containers
// Option 1: Replace executeClaudeCli with container spawn
// Option 2: Feature flag to toggle between modes
const useContainers = process.env.CFN_USE_CONTAINERS === 'true';
if (useContainers) {
  result = await spawnAgentContainer(/* ... */);
} else {
  result = await executeClaudeCli(/* ... */);
}
```

### With Redis Coordination
```typescript
// Containers signal completion via Redis (same pattern as CLI)
// Inside container entrypoint:
redis-cli -h $CFN_REDIS_HOST LPUSH "cfn-completion:${CFN_TASK_ID}" "${AGENT_ID}:completed"
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Container spawn latency | Pre-warm pool of containers |
| Image pull slowness | Use local registry (already at :5000) |
| Workspace clone overhead | Use rsync with selective patterns |
| Memory budget exceeded | Strict enforcement via canSpawnContainer() |
| Docker socket security | Socket-proxy (already configured) |
| Container orphans | Cleanup cron job or TTL labels |

---

## Testing Strategy

### Unit Tests
- docker-spawner.ts: Mock Dockerode
- workspace-manager.ts: Temp directories
- mdap-container-config.ts: Pure functions

### Integration Tests
```bash
# Phase 1: Single container
npx tsx tests/integration/test-container-spawn.ts

# Phase 2: Agent images
npx tsx tests/integration/test-agent-images.ts

# Phase 3: Workspace isolation
npx tsx tests/integration/test-workspace-isolation.ts

# Phase 4: MDAP integration
npx tsx tests/integration/test-mdap-containers.ts

# Phase 5: Production readiness
npx tsx tests/integration/test-production-hardening.ts
```

### Stress Tests
```bash
# 100 container stress test (reuse existing pattern)
npx tsx tests/stress/test-100-containers.ts
```

---

## File Structure After Implementation

```
docker/trigger-dev/
├── src/
│   ├── lib/
│   │   ├── cli-executor.ts          # Existing
│   │   ├── mdap-config.ts           # Existing
│   │   ├── mdap-db.ts               # Existing
│   │   ├── docker-spawner.ts        # NEW (Phase 1)
│   │   ├── container-registry.ts    # NEW (Phase 2)
│   │   ├── workspace-manager.ts     # NEW (Phase 3)
│   │   └── mdap-container-config.ts # NEW (Phase 4)
│   └── trigger/
│       ├── cfn-implementer-v2.ts    # MODIFY
│       ├── cfn-validator-v2.ts      # MODIFY
│       └── cfn-agent-container.ts   # NEW (Phase 1)
└── tests/
    ├── integration/
    │   ├── test-container-spawn.ts
    │   ├── test-agent-images.ts
    │   ├── test-workspace-isolation.ts
    │   └── test-mdap-containers.ts
    └── stress/
        └── test-100-containers.ts

docker/agents/
├── Dockerfile.typescript           # NEW (Phase 2)
├── Dockerfile.backend              # NEW (Phase 2)
├── Dockerfile.frontend             # NEW (Phase 2)
├── Dockerfile.rust                 # NEW (Phase 2)
├── Dockerfile.docker               # NEW (Phase 2)
├── Dockerfile.python               # NEW (Phase 2)
└── build-agent-images.sh           # NEW (Phase 2)
```

---

## Dependencies

### Phase 1
- Dockerode npm package (already in project)
- Socket-proxy running (already configured)
- Trigger.dev dev server

### Phase 2
- Docker BuildKit
- Trigger.dev registry (port 5000)

### Phase 3
- rsync (install in container images)

### Phase 4
- Existing MDAP tables in Postgres

### Phase 5
- seccomp profile (already exists)

---

## Rollback Plan

Each phase is additive and can be disabled via feature flag:

```bash
# .env
CFN_USE_CONTAINERS=false  # Fall back to CLI execution
CFN_AGENT_IMAGES=generic  # Use generic image instead of specialized
CFN_WORKSPACE_ISOLATION=false  # Use shared workspace
CFN_MDAP_CONTAINERS=false  # Ignore tier for container resources
```

---

## Timeline Summary

| Phase | Duration | Dependencies | Deliverables |
|-------|----------|--------------|--------------|
| 1 | 1 sprint | None | Container spawning works |
| 2 | 1 sprint | Phase 1 | 6 agent images |
| 3 | 1 sprint | Phase 1 | Isolated workspaces |
| 4 | 1 sprint | Phase 1, 3 | MDAP + containers |
| 5 | 1 sprint | All above | Production ready |

**Total:** 5 sprints (50-75 hours)

---

## Coordinator Session Continuation

**Key Architectural Decision:** Coordinator uses session continuation, agents use context rebuilding.

### Coordinator Pattern (Persistent Session)

```typescript
// Coordinator maintains session across decomposition iterations
interface CoordinatorSession {
  sessionId: string;      // Claude CLI session ID (from --output-format json)
  taskId: string;         // CFN task ID
  iteration: number;      // Current iteration
  decisions: Decision[];  // History of decomposition decisions
}

// Store in Redis
await redis.set(`cfn:${taskId}:coordinator:session`, sessionId);

// Resume coordinator for next decision
const result = await executeClaudeCli([
  '--resume', sessionId,
  '-p', `Current state: ${JSON.stringify(state)}. Decompose next steps.`,
  '--output-format', 'json'
], { cwd: workDir });
```

### Why Session Continuation for Coordinator?

| Aspect | Context Rebuild | Session Continuation |
|--------|----------------|---------------------|
| Memory | Reconstruct from Redis | Full history preserved |
| Decisions | Must re-explain | Already in context |
| Latency | Higher (prompt injection) | Lower (resume) |
| Use Case | Stateless agents | Stateful coordinator |

### Implementation in cfn-orchestrator.ts

```typescript
export const cfnOrchestratorTask = task({
  id: "cfn-orchestrator",
  run: async (payload) => {
    // 1. Create or resume coordinator session
    let sessionId = await redis.get(`cfn:${payload.taskId}:coordinator:session`);

    if (!sessionId) {
      // Initial session - analyze and decompose
      const result = await executeClaudeCli([
        '-p', `Analyze task: ${payload.description}. Decompose into agents.`,
        '--output-format', 'json'
      ], { cwd: payload.workDir });

      sessionId = JSON.parse(result.stdout).session_id;
      await redis.set(`cfn:${payload.taskId}:coordinator:session`, sessionId);
    }

    // 2. Iteration loop
    while (iteration < maxIterations) {
      // Resume coordinator to evaluate and decide
      const decision = await executeClaudeCli([
        '--resume', sessionId,
        '-p', `Iteration ${iteration} complete. Results: ${JSON.stringify(results)}. Decide: PROCEED/ITERATE/ABORT`,
        '--output-format', 'json'
      ], { cwd: payload.workDir });

      // ... spawn agents, wait, validate ...
    }
  }
});
```

### Agent Pattern (Stateless, Context Rebuilt)

```typescript
// Agents are disposable - context injected each time
const agentPrompt = buildAgentPrompt({
  definition: agentDefinition,
  context: {
    taskDescription,
    iterationHistory,      // From Redis
    validatorFeedback,     // From previous iteration
    successCriteria,       // From Redis
  }
});

// No session resumption - fresh each time
await executeClaudeCli([
  '-p', agentPrompt,
  '--dangerously-skip-permissions'
], { cwd: workDir });
```

---

## Next Steps

1. Review and approve this plan
2. Create GitHub issues for each phase
3. Start Phase 1 implementation
4. Set up integration test infrastructure

---

## References

- `docker/CLAUDE.md` - Existing Docker architecture
- `docker/trigger-dev/CLAUDE.md` - Trigger.dev integration guide
- `docker/runtime/cfn-runtime.contract.yml` - Environment variable contract
- `planning/cli-changes-november/CLI_MODE_REDIS_COORDINATION_HANDOFF.md` - CLI coordination patterns
- `planning/trigger/v4/HANDOFF_MDAP_INTEGRATION_2025-11-26.md` - MDAP integration status
