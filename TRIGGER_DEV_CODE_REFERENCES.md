# Trigger.dev Container Modes - Code References & Implementation Details

**Date**: 2025-11-24
**Companion Document**: TRIGGER_DEV_CONTAINER_MODES_RESEARCH.md
**Purpose**: Specific file paths, code snippets, and function signatures for implementation

---

## 1. CRITICAL CODE LOCATIONS

### 1.1 Worker Container Image

**File**: `/docker/trigger-dev/Dockerfile.worker`
**Lines**: 1-232 (complete)

**Key Sections**:
- Lines 38-65: Base image configuration (trigger.dev official image)
- Lines 70-84: Build arguments and environment variables
- Lines 85-100: System dependencies installation (jq, bash, docker.io, curl)
- Lines 103-119: Agent profiles baked into image
- Lines 121-129: Compiled job definitions copy
- Lines 138-172: Socket proxy configuration (Phase 1.2a security hardening)
- Lines 174-231: Health checks, entrypoint, volume mounts

**Critical Details**:
```dockerfile
# Phase 1.2a: Socket proxy prevents direct socket access
DOCKER_HOST=tcp://socket-proxy:2375  # NOT /var/run/docker.sock

# Agent profiles pre-baked at build time
COPY .claude/agents/cfn-dev-team /triggerdotdev/.claude/agents/cfn-dev-team

# Non-root execution for security
USER node

# Health check validates worker connectivity
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

### 1.2 CFN Loop 3 Job Implementation

**File**: `/trigger-dev/src/jobs/cfn-loop3.ts`
**Lines**: 1-500+ (primary orchestration)

**Key Sections**:

#### Task ID Prefixing (Phase 1 - Collision Prevention)
```typescript
// Lines 44-56
function generateTriggerTaskId(rawTaskId: string): string {
  return `trigger:${rawTaskId}`;
}

// Applied at line 188
const taskId = generateTriggerTaskId(rawTaskId);  // "trigger:raw-id"
```

**Rationale**: Both CLI and Trigger.dev modes use identical Redis coordination patterns. Without namespacing, Redis keys collide. Solution: Prefix all Trigger.dev task IDs with "trigger:" to maintain separate namespaces.

#### Payload Validation Schema
```typescript
// Lines 62-80: Complete Zod validation
const CFNLoop3PayloadSchema = z.object({
  taskId: z.string().min(1).max(256),
  taskDescription: z.string().min(1).max(4096),
  mode: z.enum(['mvp', 'standard', 'enterprise']).default('standard'),
  provider: z.enum(['zai', 'kimi', 'openrouter', 'max']).default('zai'),
  agents: z.array(/* agent types */),
  iteration: z.number().int().positive().default(1),
  previousFeedback: z.string().optional(),
  timeout: z.number().positive().default(1800000),  // 30 min
});
```

#### Quality Gate Thresholds
```typescript
// Lines 32-36
const QUALITY_GATES = {
  mvp: 0.70,
  standard: 0.95,
  enterprise: 0.98,
} as const;
```

**Interpretation**:
- MVP mode: Pass rate ≥70% (fast, lenient)
- Standard (default): Pass rate ≥95% (production quality)
- Enterprise: Pass rate ≥98% (highest assurance)

#### Result Type Definitions
```typescript
// Lines 88-136: Complete result structure
interface ConfidenceParseResult {
  found: boolean;
  score: number;
  rawMatch: string | null;
}

interface Loop3AgentResult {
  agentType: string;
  containerName: string;
  confidence: number;           // Parsed from stdout
  stdout: string;              // Full captured output
  stderr: string;              // Error stream
  exitCode: number;            // Container exit code
  executionTime: number;       // Elapsed milliseconds
  resourceLimits: {
    cpus: number;              // e.g., 2
    memory: string;            // e.g., "4g"
  };
  networkIsolation: {
    network: string;           // Docker network name
  };
  completedAt: string;         // ISO timestamp
}

interface CFNLoop3Result {
  taskId: string;
  iteration: number;
  mode: string;
  timestamp: string;
  totalExecutionTime: number;
  agentResults: Loop3AgentResult[];
  gateMetrics: {
    avgConfidence: number;     // Calculated average
    threshold: number;         // QUALITY_GATES[mode]
    passed: boolean;           // avgConfidence >= threshold
  };
  decision: 'PROCEED_TO_LOOP2' | 'ITERATE_LOOP3';
  metadata: {
    totalAgents: number;
    successfulAgents: number;
    failedAgents: number;
  };
}
```

#### Main Job Execution Flow
```typescript
// Lines 165-172: Job definition
export const cfnLoop3Job = defineJob({
  id: 'cfn-loop3-execution',
  name: 'CFN Loop 3: Sequential Agent Execution with Quality Gate',
  version: '1.0.0',
  trigger: eventTrigger({
    name: 'cfn.loop3.start',  // Event trigger name
  }),
  run: async (payload: unknown, io, ctx): Promise<CFNLoop3Result> => {
    // Implementation follows...
  }
});
```

### 1.3 Environment Configuration Contract

**File**: `/trigger-dev/src/lib/environment-contract.ts`
**Lines**: 1-200

**Key Functions**:

#### Mode-Specific Configuration
```typescript
// Lines 33-58: Three execution modes
const modeConfigs: Record<CFNMode, EnvironmentConfig> = {
  trigger: {
    redisHost: process.env.CFN_REDIS_HOST || 'redis',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || '6379', 10),
    postgresHost: process.env.CFN_POSTGRES_HOST || 'postgres',
    postgresPort: parseInt(process.env.CFN_POSTGRES_PORT || '5432', 10),
    networkName: process.env.CFN_NETWORK_NAME || 'trigger-dev_trigger-cfn-network',
    orchestratorPort: parseInt(process.env.CFN_ORCHESTRATOR_PORT || '3001', 10),
  },
  cli: {
    redisHost: process.env.CFN_REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || '6379', 10),
    postgresHost: process.env.CFN_POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.CFN_POSTGRES_PORT || '5432', 10),
    networkName: process.env.CFN_NETWORK_NAME || 'host',
    orchestratorPort: parseInt(process.env.CFN_ORCHESTRATOR_PORT || '3001', 10),
  },
  kubernetes: {
    redisHost: process.env.CFN_REDIS_HOST || 'redis.default.svc.cluster.local',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || '6379', 10),
    postgresHost: process.env.CFN_POSTGRES_HOST || 'postgres.default.svc.cluster.local',
    postgresPort: parseInt(process.env.CFN_POSTGRES_PORT || '5432', 10),
    networkName: process.env.CFN_NETWORK_NAME || 'default',
    orchestratorPort: parseInt(process.env.CFN_ORCHESTRATOR_PORT || '3001', 10),
  },
};
```

**Key Insight**: `redisHost` changes per mode:
- **trigger**: Uses Docker service name `redis` (resolved via Docker DNS within network)
- **cli**: Uses `localhost` (host-native resolution for CLI agents)
- **kubernetes**: Uses K8s service DNS

#### Docker Environment Variable Export
```typescript
// Lines 185-199: Returns array for `docker run --env` injection
export function getDockerEnvVars(mode: CFNMode): string[] {
  const config = modeConfigs[mode];
  if (!config) {
    throw new Error(`Unknown CFN mode: ${mode}`);
  }

  return [
    `CFN_REDIS_HOST=${config.redisHost}`,
    `CFN_REDIS_PORT=${config.redisPort}`,
    `CFN_POSTGRES_HOST=${config.postgresHost}`,
    `CFN_POSTGRES_PORT=${config.postgresPort}`,
    `CFN_NETWORK_NAME=${config.networkName}`,
    `CFN_ORCHESTRATOR_PORT=${config.orchestratorPort}`,
  ];
}
```

**Usage**: Called when constructing Docker spawn command to inject correct service discovery URLs.

---

## 2. AGENT SPAWNING IMPLEMENTATION

### 2.1 Docker Run Command Construction (Conceptual)

**Location**: `trigger-dev/src/jobs/cfn-loop3.ts` (lines 200-300, approx)

**Reconstructed Logic**:
```typescript
// Conceptual reconstruction from job specification
const getNetworkName = (mode: string) => {
  return getEnvValue('network_name', 'trigger');
  // Returns: 'trigger-dev_trigger-cfn-network'
};

const spawnAgentCommand = (
  agentType: string,
  taskId: string,
  iteration: number,
  taskDescription: string
): string => {
  const containerName = `cfn-agent-${agentType}-${Date.now()}`;
  const commands = [
    'docker', 'run',
    '--rm',                                    // Auto-cleanup
    '--name', containerName,
    '--network', getNetworkName('trigger'),   // cfn-network (NOT trigger-cfn-network)
    '--cpus=2',                               // Resource limits
    '--memory=4g',
    '--env', `CFN_TASK_ID=${taskId}`,
    '--env', `CFN_REDIS_HOST=redis`,          // Service name (will fail for cfn-network!)
    '--env', `CFN_REDIS_PORT=6379`,
    '--env', `AGENT_TYPE=${agentType}`,
    '--env', `ITERATION=${iteration}`,
    '--env', `TASK_DESCRIPTION=${taskDescription}`,
    'cfn-agent:latest',
    '/app/entrypoint.sh',
  ];

  return commands.join(' ');
};

// In job loop:
const result = execSync(spawnAgentCommand(agentType, taskId, iteration, taskDescription), {
  encoding: 'utf-8',
  timeout: 1800000,  // 30 minutes
  stdio: ['pipe', 'pipe', 'pipe'],  // Capture stdout/stderr
});
```

**CRITICAL ISSUE** (UNRESOLVED):
The command spawns on `cfn-network` but injects `CFN_REDIS_HOST=redis` which is only resolvable on `trigger-cfn-network`. Agent will fail to connect to Redis.

### 2.2 Confidence Score Parsing

**Location**: `trigger-dev/src/jobs/cfn-loop3.ts` (conceptual, based on cfn-agent.ts pattern)

**Pattern** (from cfn-agent.ts lines 121-143):
```typescript
function parseConfidenceScore(output: string): number {
  // Multiple patterns for flexibility
  const confidencePatterns = [
    /confidence[:\s]+(\d+(?:\.\d+)?)/i,
    /score[:\s]+(\d+(?:\.\d+)?)/i,
    /confidence[:\s]+(\d+)%/i,
    /(?:^|\n)\d+(?:\.\d+)?(?:\s|$)/  // Bare decimal on line
  ];

  for (const pattern of confidencePatterns) {
    const match = output.match(pattern);
    if (match) {
      const score = parseFloat(match[1]);
      return Math.min(1.0, Math.max(0.0, score / (score > 1 ? 100 : 1)));
    }
  }

  // Fallback: estimate from test results
  const passedMatch = output.match(/(\d+)\s+(?:passed|passing)/i);
  const totalMatch = output.match(/(\d+)\s+(?:tests?|assertions?)/i);
  if (passedMatch && totalMatch) {
    return parseInt(passedMatch[1], 10) / parseInt(totalMatch[1], 10);
  }

  return 0.5;  // Default fallback
}
```

**Invoked in Loop 3**:
```typescript
const confidenceResult = parseConfidenceScore(result.stdout);
agentResults.push({
  ...commonResult,
  confidence: confidenceResult,
});
```

### 2.3 Multi-Wave Spawning Logic

**Location**: `docker/trigger-dev/IMPLEMENTATION_ROADMAP.md` (lines 214-248)

**Implementation Pattern**:
```typescript
// Conceptual implementation (not yet in codebase)
async function spawnWaves(
  agents: AgentConfig[],
  memoryBudget: number = 8 * 1024  // 8GB default
): Promise<SpawnedAgent[]> {
  const agentMemory = 4 * 1024;  // 4GB per agent
  const agentsPerWave = Math.floor(memoryBudget / agentMemory);

  const allResults: SpawnedAgent[] = [];

  // Wave-based spawning
  for (let i = 0; i < agents.length; i += agentsPerWave) {
    const waveAgents = agents.slice(i, i + agentsPerWave);

    // Spawn wave concurrently (not sequentially)
    const wavePromises = waveAgents.map(config =>
      spawnAgent(config)
    );

    const waveResults = await Promise.all(wavePromises);
    allResults.push(...waveResults);

    // Wait for wave completion before next wave
    await waitForWaveCompletion(waveResults);

    // Check for memory/resource constraints
    const availableMemory = await checkAvailableMemory();
    if (availableMemory < memoryBudget) {
      // Backoff before spawning next wave
      await delay(5000);
    }
  }

  return allResults;
}
```

**Current Status**: CONCEPTUAL (not yet implemented in cfn-loop3.ts)

---

## 3. REDIS COORDINATION PATTERNS

### 3.1 Task ID Prefixing for Namespace Isolation

**Files Involved**:
- `trigger-dev/src/jobs/cfn-loop3.ts` (lines 44-56, 188)
- `planning/cli-changes-november/CLI_MODE_REDIS_COORDINATION_HANDOFF.md`

**Implementation**:
```typescript
// Trigger mode: Applies prefix
const generateTriggerTaskId = (rawTaskId: string): string => {
  return `trigger:${rawTaskId}`;
};

// CLI mode (for comparison): Different prefix
// function generateCliTaskId(rawTaskId: string): string {
//   return `cli:${rawTaskId}`;
// }

// Applied immediately upon job start
const taskId = generateTriggerTaskId(rawTaskId);  // "trigger:task-123"
```

**Redis Key Examples**:
```
# CLI Mode Keys
cfn:task:cli:task-123:status          # Task metadata
cfn:completion:cli:task-123            # Completion signal
cfn:agent:cli:agent-1:status

# Trigger Mode Keys
cfn:task:trigger:task-123:status       # No collision with CLI keys!
cfn:completion:trigger:task-123        # Separate queue
cfn:agent:trigger:agent-1:status
```

**Why This Matters**:
Both modes use identical coordination protocols. Without prefixing, a CLI agent and Trigger.dev agent working on the same base task ID would interfere with each other's Redis signals.

### 3.2 Agent-to-Worker Communication Pattern

**Broadcast Channel** (from IMPLEMENTATION_ROADMAP.md):
```bash
# Worker pushes tasks to agent
LPUSH cfn:queue:${taskId}:tasks <json_payload>

# Agent executes and reports status
HSET cfn:agent:${agentId}:${jobId} status completed
HSET cfn:agent:${agentId}:${jobId} confidence 0.85
HSET cfn:agent:${agentId}:${jobId} duration 245000

# Worker collects completion signal
BLPOP cfn:completion:${jobId} 300  # Block for 5 minutes max
```

### 3.3 Consensus Collection (Loop 2)

**From IMPLEMENTATION_ROADMAP.md (lines 301-322)**:
```bash
# Loop 2 validators report consensus
LPUSH cfn:consensus:${jobId}:loop2 <validator_result>

# PO decision collects all consensus scores
LRANGE cfn:consensus:${jobId}:loop2 0 -1

# Calculate consensus: mean(validator_scores) >= CONSENSUS_THRESHOLD
# If >= 0.90 (standard): Proceed to decision stage
# If < 0.90: Return to Loop 3 for iteration
```

---

## 4. NETWORK & SERVICE DISCOVERY

### 4.1 Docker Network Configuration

**File**: `docker-compose.yml` (not shown but referenced)

**Network Setup**:
```yaml
networks:
  trigger-cfn-network:
    driver: bridge
    # Services on this network: postgres, redis, minion, trigger-webapp, socket-proxy
    # Service discovery: redis:6379 resolves via Docker DNS

  cfn-network:
    driver: bridge
    # Services on this network: cfn-agent containers (spawned dynamically)
    # Service discovery: isolated from trigger-cfn-network
```

**Isolation Issue**:
- Worker container on `trigger-cfn-network` can reach `redis:6379`
- Agent container on `cfn-network` CANNOT reach `redis:6379` (service not available)
- Agent needs explicit network routing or external port binding

### 4.2 Service Discovery per Mode

**Trigger Mode** (from environment-contract.ts):
```typescript
getEnvValue('redis_host', 'trigger')  // Returns: 'redis'
// Works because: trigger-cfn-network contains Redis service
// Docker DNS resolves 'redis' to container IP within network
```

**CLI Mode** (from environment-contract.ts):
```typescript
getEnvValue('redis_host', 'cli')  // Returns: 'localhost'
// Works because: CLI agents run on host, localhost:6379 is exposed
// Host port mapping: 6379:6379 from container
```

**Kubernetes Mode** (for future):
```typescript
getEnvValue('redis_host', 'kubernetes')  // Returns: 'redis.default.svc.cluster.local'
// Works via: K8s DNS (service.namespace.svc.cluster.local)
```

---

## 5. DATABASE SCHEMA IMPLEMENTATION

### 5.1 Core Tables

**File**: `docker/trigger-dev/TECHNICAL_SPECIFICATION.md` (lines 72-200)

#### jobs Table
```sql
-- Lines 93-125
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  type VARCHAR(100) NOT NULL,                -- "cfn-loop"
  status VARCHAR(50) NOT NULL,               -- "queued" | "processing" | "completed" | "failed"
  payload JSONB NOT NULL,                    -- Full task description + params
  metadata JSONB,                            -- Trigger source, webhook info

  worker_id VARCHAR(100),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,

  mode VARCHAR(50) NOT NULL DEFAULT 'standard',  -- "mvp" | "standard" | "enterprise"
  iteration_count INTEGER DEFAULT 0,
  max_iterations INTEGER DEFAULT 10,
  final_test_pass_rate DECIMAL(5,4),

  results JSONB,

  webhook_url TEXT,
  webhook_status VARCHAR(50),
  webhook_attempts INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(organization_id, id)
);
```

#### job_iterations Table
```sql
-- Lines 127-150: Tracks each CFN Loop iteration
CREATE TABLE job_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  iteration_number INTEGER NOT NULL,

  agents_spawned INTEGER,
  agents_completed INTEGER,
  test_pass_rate DECIMAL(5,4),
  gate_passed BOOLEAN NOT NULL DEFAULT FALSE,
  gate_threshold DECIMAL(5,4),

  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,

  provider VARCHAR(100),
  model VARCHAR(255),
  tokens_used INTEGER,
  cost DECIMAL(10,6),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(job_id, iteration_number)
);
```

#### job_executions Table
```sql
-- Lines 152-185: Per-agent execution history
CREATE TABLE job_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  iteration_id UUID NOT NULL REFERENCES job_iterations(id) ON DELETE CASCADE,
  agent_id VARCHAR(255) NOT NULL,
  agent_type VARCHAR(100) NOT NULL,

  container_name VARCHAR(255),
  status VARCHAR(50),
  exit_code INTEGER,

  memory_mb INTEGER,
  cpu_cores DECIMAL(4,2),
  duration_seconds INTEGER,

  files_modified TEXT[],
  tests_passed INTEGER,
  tests_failed INTEGER,

  provider VARCHAR(100),
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost DECIMAL(10,6),

  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (job_id, iteration_id) REFERENCES job_iterations(job_id, iteration_number)
);
```

### 5.2 Query Patterns for Monitoring

**Retrieve iteration results**:
```sql
SELECT
  i.iteration_number,
  COUNT(e.id) as agents_spawned,
  COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as agents_completed,
  AVG(e.exit_code) as avg_exit_code,
  i.gate_passed,
  i.duration_seconds
FROM job_iterations i
LEFT JOIN job_executions e ON e.iteration_id = i.id
WHERE i.job_id = $1
GROUP BY i.id, i.iteration_number
ORDER BY i.iteration_number;
```

**Cost per agent**:
```sql
SELECT
  agent_type,
  COUNT(*) as executions,
  SUM(cost) as total_cost,
  AVG(cost) as avg_cost
FROM job_executions
WHERE job_id = $1
GROUP BY agent_type;
```

---

## 6. PACKAGE.JSON & BUILD CONFIGURATION

**File**: `/trigger-dev/package.json`

```json
{
  "name": "cfn-loop-trigger-dev",
  "version": "1.0.0",
  "description": "trigger.dev workflow for CFN Loop orchestration",
  "main": "src/v3/worker.ts",
  "type": "module",
  "trigger.dev": {
    "endpointId": "cfn-loop-workflow"
  },
  "scripts": {
    "dev": "npx trigger.dev dev",
    "deploy": "trigger.dev deploy",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "build": "tsc",
    "start": "node dist/worker.js"
  },
  "dependencies": {
    "@trigger.dev/sdk": "^3.0.0",
    "@trigger.dev/log": "^3.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.54.0"
  }
}
```

**Build Process**:
1. Typescript compilation: `npm run build` → `dist/`
2. Trigger.dev packaging: `trigger.dev deploy`
3. Docker build: Copies compiled `dist/` into Dockerfile.worker

---

## 7. PHASE GATING & ITERATION CONTROL

### 7.1 Quality Gate Check Logic

**Conceptual Implementation** (from cfn-loop3.ts specification):
```typescript
// After spawning agents and collecting results
const confidenceScores = agentResults.map(r => r.confidence);
const avgConfidence = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
const threshold = QUALITY_GATES[mode];  // 0.70, 0.95, or 0.98

const gatePassed = avgConfidence >= threshold;

if (gatePassed) {
  // PROCEED_TO_LOOP2
  return {
    decision: 'PROCEED_TO_LOOP2',
    gateMetrics: {
      avgConfidence,
      threshold,
      passed: true,
    },
    // ... other results
  };
} else {
  // ITERATE_LOOP3 (may return to Loop 3 for retry)
  return {
    decision: 'ITERATE_LOOP3',
    gateMetrics: {
      avgConfidence,
      threshold,
      passed: false,
    },
    // ... other results
  };
}
```

**Iteration Semantics**:
- **MVP mode** (0.70 threshold): Fails less often, may proceed to Loop 2 with lower quality
- **Standard mode** (0.95 threshold): Strict gate, likely triggers iterations
- **Enterprise mode** (0.98 threshold): Extremely strict, most likely to iterate

### 7.2 Consensus Threshold (Loop 2)

**Consensus Calculation** (from IMPLEMENTATION_ROADMAP.md):
```typescript
const CONSENSUS_THRESHOLDS = {
  mvp: 0.80,
  standard: 0.90,
  enterprise: 0.95,
} as const;

// Loop 2 validators provide consensus scores
const consensusScores = validatorResults.map(r => r.confidence);
const avgConsensus = consensusScores.reduce((a, b) => a + b, 0) / consensusScores.length;

const consensusPassed = avgConsensus >= CONSENSUS_THRESHOLDS[mode];
```

---

## 8. SOCKET PROXY SECURITY CONFIGURATION

### 8.1 Socket Proxy Allowlist

**File**: `docker-compose.yml` (socket-proxy service environment)

```yaml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy:latest
    environment:
      # Basic operations (required for agent spawning)
      CONTAINERS: 1                  # list/inspect containers
      POST: 1                        # create/start containers
      DELETE: 1                      # remove containers
      IMAGES: 1                      # pull/inspect images

      # Dangerous operations (DISABLED)
      PRIVILEGED: 0                  # NO --privileged containers
      HOST: 0                        # NO --net=host
      VOLUMES: 0                     # NO volume mounts
      SOCKETV2: 0                    # NO socket exposure to children

      # Other operations (disabled by default)
      NETWORKS: 0
      EXEC: 0
      SWARM: 0
```

**Verification Test** (from docker/trigger-dev/SECURITY.md lines 1413-1417):
```bash
# TEST 3: Socket proxy blocks privileged container spawning
docker run --rm \
  -e DOCKER_HOST=tcp://socket-proxy:2375 \
  --entrypoint sh \
  cfn-trigger-worker:latest \
  -c "docker run --privileged cfn-agent:latest"
# Expected: FAIL (socket proxy rejects --privileged)

# TEST 4: Socket proxy allows non-privileged container spawning
docker run --rm \
  -e DOCKER_HOST=tcp://socket-proxy:2375 \
  --entrypoint sh \
  cfn-trigger-worker:latest \
  -c "docker run cfn-agent:latest"
# Expected: SUCCESS (socket proxy allows basic spawning)
```

---

## 9. KNOWN IMPLEMENTATION GAPS

### 9.1 Unresolved: Cross-Network Redis Access

**Location**: `docker/trigger-dev/IMPLEMENTATION_ROADMAP.md` lines 110-111

**Problem**:
```
Agent container on cfn-network: CANNOT resolve 'redis'
  (redis service only on trigger-cfn-network)

Result: Redis connection fails silently
  Agent cannot report completion
  Worker timeout waiting for signal
```

**No Current Solution in Code**:
- No dual network attachment in spawn command
- No external port binding configured
- Network bridge not implemented

### 9.2 Unresolved: End-to-End Workflow Validation

**Status**: Job definitions exist but integration not tested

**Missing**:
1. Webhook trigger to job creation flow
2. Job completion → webhook callback
3. Multi-iteration retry logic
4. Complete Loop 3 → Loop 2 → PO decision sequence

### 9.3 Deprecated: CLI Mode Agent Spawner

**File**: `/trigger-dev/src/utils/agent-spawner.ts` (marked DEPRECATED)

```typescript
/**
 * Agent Spawning Utility - DEPRECATED
 *
 * ⚠️  THIS MODULE IS DEPRECATED FOR TRIGGER PROCESS
 *
 * CLI mode has been completely removed from trigger.dev process.
 * The trigger process now exclusively handles CFN Docker loops.
 */
```

**Reason**: trigger.dev shifted to pure Docker-based execution. CLI spawning via `npx spawn-agent-cli.ts` is now handled by separate CLI process.

---

## 10. TESTING & VALIDATION FILES

### 10.1 Multi-Agent Test Job

**File**: `/trigger-dev/src/jobs/test-multi-agent.ts`

**Purpose**: Validates concurrent agent spawning and Redis coordination

**Expected Coverage**:
- Spawn N agents concurrently (N = 2-6)
- Verify all agents reach Redis
- Collect results and validate completeness
- Check for resource constraints (memory, CPU)

### 10.2 Test Job Specifications

**From IMPLEMENTATION_ROADMAP.md (lines 349-374)**:
```bash
# Test 1: Single agent spawn
docker run cfn-agent:latest

# Test 3: Wave spawning
Spawn 2 agents (wave 1) → wait → spawn 2 more (wave 2)

# Test 8: Redis coordination
1. Worker pushes task to Redis queue
2. Agent pops and executes task
3. Agent pushes result back to Redis
4. Worker retrieves result

# Performance test
Measure spawn time for 1, 5, 10 concurrent agents
```

---

## 11. CLI MODE COORDINATION FOR REFERENCE

### 11.1 Redis Hostname Fix

**File**: `docker/runtime/cfn-runtime.contract.yml` (referenced in CLI_MODE_REDIS_COORDINATION_HANDOFF.md)

**Lines 19-23 (AFTER FIX)**:
```yaml
modes:
  cli:
    override: "localhost"      # Host-resolvable (FIXED)
  trigger:
    override: "redis"          # Docker service name
```

**Lines 19-23 (BEFORE FIX)**:
```yaml
modes:
  cli:
    override: "cfn-redis"      # ❌ NOT resolvable from host
```

**Reason**: Docker service names only resolve within container networks. CLI agents run on host and need localhost.

### 11.2 Task ID Validation (Both Modes)

**File**: `src/cli/agent-executor.ts` (line 96, UPDATED)

```typescript
// BEFORE (rejected "cli:" prefix):
if (!/^[a-zA-Z0-9_-]+$/.test(taskId)) {
  throw new Error(`Invalid task ID format: "${taskId}"`);
}

// AFTER (accepts namespace prefixes):
if (!/^([a-z]+:)?[a-zA-Z0-9_.-]+$/.test(taskId)) {
  throw new Error(`Invalid task ID format. Must contain only alphanumeric, hyphens, periods, and optional namespace.`);
}
```

**Validation Examples**:
- ✅ `task-123` (no prefix)
- ✅ `cli:task-123` (CLI prefix)
- ✅ `trigger:task-123` (Trigger prefix)
- ✅ `custom.task-2025` (period allowed)
- ❌ `task:123:extra` (double colons rejected)

---

## SUMMARY OF KEY FINDINGS

### Code Location Inventory

| Component | File Path | Lines | Status |
|-----------|-----------|-------|--------|
| Worker Image | `/docker/trigger-dev/Dockerfile.worker` | 1-232 | ✅ Complete |
| Loop 3 Job | `/trigger-dev/src/jobs/cfn-loop3.ts` | 1-500+ | ✅ Complete (spawn logic pending) |
| Environment Config | `/trigger-dev/src/lib/environment-contract.ts` | 1-200 | ✅ Complete |
| Schema Design | `/docker/trigger-dev/TECHNICAL_SPECIFICATION.md` | 72-200 | ✅ Documented (schema not deployed) |
| Roadmap | `/docker/trigger-dev/IMPLEMENTATION_ROADMAP.md` | 1-650 | ⚠️ Phase 1 complete, Phase 2 pending |
| Multi-Agent Test | `/trigger-dev/src/jobs/test-multi-agent.ts` | — | ❓ Partial implementation |
| Socket Proxy Config | `docker-compose.yml` | — | ⚠️ Config template only |

### Critical Code Patterns

1. **Task ID Prefixing**: `generateTriggerTaskId()` prevents Redis collisions
2. **Confidence Parsing**: Regex-based extraction from agent stdout
3. **Quality Gates**: Mode-specific thresholds (0.70 MVP, 0.95 Standard, 0.98 Enterprise)
4. **Docker Spawning**: `execSync(docker run ...)` with environment injection
5. **Network Isolation**: Service DNS (`redis`) for trigger-cfn-network, fails for cfn-network

### Blocking Issues

1. **Cross-Network Redis**: No solution implemented for agent-on-cfn-network to reach redis-on-trigger-cfn-network
2. **Docker Spawn Command**: Not shown in code (reconstructed from specification)
3. **Multi-Wave Logic**: Conceptual only (not yet implemented)
4. **End-to-End Testing**: Jobs exist but complete workflow not validated

---

**Research Confidence**: 0.88 (High for architecture, Medium for implementation completeness)

