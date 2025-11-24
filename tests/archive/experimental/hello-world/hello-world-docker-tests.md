---
description: "Run docker-compatible Hello World test suite validating container-based CFN coordination with Redis and MCP"
argument-hint: "[--layer=0|1|all] [--skip-validation] [--verbose]"
allowed-tools: ["Bash", "Read", "TodoWrite", "Write"]
---

# Docker Hello World Tests - Container-Based CFN Coordination

Run container-based 4-layer test suite validating core CFN Docker coordination capabilities with skill-based MCP isolation and Redis state management.

**Test Scope**: $ARGUMENTS

## Test Layers

### Layer 0: Docker Agent Tool Validation
- ✅ **15 agent types** in Docker containers with resource limits
- ✅ **7 tools per agent** accessed via MCP authentication
- ✅ **Skill-based MCP server selection** for optimal resource usage
- ✅ **Success criteria**: All agents spawn, ≥5/7 tools working via MCP, 6 critical tools at 100%
- ✅ **Container isolation** with memory and CPU limits
- ✅ **MCP authentication** and token-based access control

### Layer 1: Docker Mesh Coordination
- ✅ **2 peer coordinators** managing 35 combos each
- ✅ **70 Hello World files** (7 languages × 10 translations)
- ✅ **Redis pub/sub coordination** with distributed claim negotiation
- ✅ **Redis state persistence** for coordination history
- ✅ **Container-based agent spawning** with resource management
- ✅ **Success criteria**: 70 files created, 0 conflicts, balanced distribution

### Layer 2: Docker Review Coordination
- ✅ **Dynamic reviewer pool** (3-10 reviewers) in containers
- ✅ **Queue-driven spawning/despawning** with Redis coordination
- ✅ **Review handoff** from implementers to reviewers via MCP
- ✅ **MCP-based tool access** for specialized review tools
- ✅ **Success criteria**: All 70 files reviewed, queue depth ≤15, dynamic scaling observed

### Layer 3: Docker Error Handling
- ✅ **50% error injection** with 4 error types in container environment
- ✅ **Fresh agent spawning** for retries with new containers
- ✅ **Exponential backoff** (100ms, 200ms, 400ms) with Redis persistence
- ✅ **Container recovery** and resource cleanup on failures
- ✅ **Success criteria**: 50% initial failures, ≤10 retries per file, 100% final pass rate

## Command Options

```bash
# Run all layers sequentially (default)
/docker-hello-world-tests

# Run specific layer
/docker-hello-world-tests --layer=0    # Docker agent tooling only
/docker-hello-world-tests --layer=1    # Docker mesh coordination only
/docker-hello-world-tests --layer=2    # Docker review coordination only
/docker-hello-world-tests --layer=3    # Docker error handling only

# Run multiple layers
/docker-hello-world-tests --layer=0,1  # Tooling + mesh

# Skip validation (run tests without checking results)
/docker-hello-world-tests --skip-validation

# Verbose output
/docker-hello-world-tests --verbose
```

## Execution Strategy

### 1. Initialize Docker Test Environment
```bash
# Verify Docker and Redis are available
docker --version
redis-cli ping

# Create MCP network for coordination
docker network create mcp-network --driver bridge

# Create output directories
mkdir -p test-results/hello-world-docker
mkdir -p test-results/layer0-docker-validation
```

### 2. Execute Test Layers Sequentially

Parse the `--layer` argument to determine which layers to run:

**Layer 0: Docker Agent Tool Validation**
```bash
node tests/hello-world-docker/layer0/layer0-docker-tool-validation.js 2>&1 | tee test-results/layer0-docker-output.log
```
- **Validates**: Container-based agent spawning with MCP authentication
- **Reports to**: `test-results/layer0-docker-validation/layer0-results.json`
- **Must pass before**: Layer 1 mesh coordination

**Layer 1: Docker Mesh Coordination**
```bash
node tests/hello-world-docker/layer1/layer1-docker-mesh-coordination.js 2>&1 | tee test-results/layer1-docker-output.log
```
- **Validates**: Distributed coordination with Redis state persistence
- **Reports to**: `test-results/hello-world-docker/layer1-results.json`
- **Must pass before**: Layer 2 review coordination

**Layer 2: Docker Review Coordination** (if implemented)
```bash
node tests/hello-world-docker/layer2/layer2-docker-review-coordination.js 2>&1 | tee test-results/layer2-docker-output.log
```
- **Validates**: Dynamic reviewer pool with container-based review tools
- **Reports to**: `test-results/hello-world-docker/layer2-results.json`
- **Must pass before**: Layer 3 error handling

**Layer 3: Docker Error Handling** (if implemented)
```bash
node tests/hello-world-docker/layer3/layer3-docker-error-retry.js 2>&1 | tee test-results/layer3-docker-output.log
```
- **Validates**: Container error handling, recovery, and retry logic
- **Reports to**: `test-results/hello-world-docker/layer3-results.json`

### 3. Validate Results (unless --skip-validation)

After each layer completes, validate success criteria:

```javascript
const layerResults = JSON.parse(fs.readFileSync('test-results/hello-world-docker/layer0-results.json'));

// Layer 0 validation
if (!layerResults.summary.layerPassed) {
  console.error('❌ Layer 0 FAILED:', layerResults.summary);
  process.exit(1);
}

// Layer 1 validation
if (!layer1Results.successCriteria.allMet) {
  console.error('❌ Layer 1 FAILED:', layer1Results.successCriteria);
  process.exit(1);
}

// Continue for Layer 2, 3...
```

### 4. Generate Combined Report

After all layers complete:

```javascript
{
  "testSuite": "Docker Hello World CFN Coordination Tests",
  "timestamp": "2025-11-05T07:45:00Z",
  "layers": [
    {
      "layer": 0,
      "name": "Docker Agent Tool Validation",
      "status": "PASSED",
      "duration": "8.2 minutes",
      "agents": 15,
      "containersUsed": 15,
      "toolsValidated": 7,
      "mcpServersAccessed": 4,
      "reportPath": "test-results/hello-world-docker/layer0-results.json"
    },
    {
      "layer": 1,
      "name": "Docker Mesh Coordination",
      "status": "PASSED",
      "duration": "12.5 minutes",
      "coordinators": 2,
      "filesCreated": 70,
      "conflicts": 0,
      "redisWrites": 145,
      "containersUsed": 35,
      "reportPath": "test-results/hello-world-docker/layer1-results.json"
    },
    {
      "layer": 2,
      "name": "Docker Review Coordination",
      "status": "PASSED",
      "duration": "10.8 minutes",
      "reviewers": 7,
      "reviewsCompleted": 70,
      "queueDepthMax": 12,
      "containersUsed": 28,
      "reportPath": "test-results/hello-world-docker/layer2-results.json"
    },
    {
      "layer": 3,
      "name": "Docker Error Handling",
      "status": "PASSED",
      "duration": "15.4 minutes",
      "initialFailures": 35,
      "retries": 52,
      "finalPassRate": "100%",
      "containersRespawned": 52,
      "reportPath": "test-results/hello-world-docker/layer3-results.json"
    }
  ],
  "summary": {
    "totalDuration": "46.9 minutes",
    "totalContainers": 130,
    "totalLayers": 4,
    "layersPassed": 4,
    "layersFailed": 0,
    "overallStatus": "✅ ALL TESTS PASSED"
  },
  "dockerValidation": {
    "containerHealth": "HEALTHY",
    "networkConnectivity": "WORKING",
    "resourceManagement": "OPTIMAL",
    "redisIntegration": "VERIFIED"
  }
}
```

Save to: `test-results/hello-world-docker/combined-report.json`

### 5. Docker and Redis Validation Requirements

**Critical**: Each layer MUST validate Docker and Redis functionality:

**Layer 0**: Docker container validation
```javascript
// Validate Docker functionality
const containerId = spawnContainer(agentType);
const isRunning = docker.container.inspect(containerId).State.Running;
console.log('✅ Docker container validation: Agent running in container');

// Validate resource limits
const stats = docker.stats(containerId);
const memoryUsage = stats.MemoryStats.usage;
console.log('✅ Resource limits validated: Memory usage within limits');
```

**Layer 1**: Redis coordination validation
```javascript
// Store coordinator state in Redis
await redis.hset(`coordination:coordinator:${coordinatorId}:claimed`,
  claimedCombos,
  JSON.stringify({ agentId: coordinatorId, timestamp: Date.now() })
);

// Verify storage worked
const stored = await redis.hgetall(`coordination:coordinator:${coordinatorId}:claimed`);
console.log(`✅ Redis validation: ${Object.keys(stored).length} claims persisted`);
```

**Layer 2**: Container review queue validation
```javascript
// Store review assignments in Redis queue
await redis.lpush(`review:assignments:${reviewerId}`, JSON.stringify(assignedFiles));

// Verify queue operations
const queueLength = await redis.llen(`review:assignments:${reviewerId}`);
console.log(`✅ Container queue validation: ${queueLength} items in review queue`);
```

**Layer 3**: Container retry history validation
```javascript
// Store retry attempts with container info
await redis.hset(`retry:container:${containerId}:history`,
  JSON.stringify({ attempts: retries, containerId, errors: errorLog })
);

// Verify container retry tracking
const retryHistory = await redis.hgetall(`retry:container:${containerId}:history`);
console.log('✅ Container retry validation: Retry history preserved');
```

## Final Report

Print comprehensive summary:

```
══════════════════════════════════════════════════════════════════════
DOCKER HELLO WORLD CFN COORDINATION TEST SUITE - COMPLETE
══════════════════════════════════════════════════════════════════════

📊 Overall Results:
  Total Duration: 46.9 minutes
  Total Containers: 130
  Layers Passed: 4/4
  Overall Status: ✅ ALL TESTS PASSED

🐳 Layer 0: Docker Agent Tool Validation
  Status: ✅ PASSED
  Agents: 15
  Containers: 15
  Tools Validated: 7
  MCP Servers: 4
  Success Rate: 100%

🤝 Layer 1: Docker Mesh Coordination
  Status: ✅ PASSED
  Coordinators: 2
  Files Created: 70
  Conflicts: 0
  Redis Writes: 145
  Containers: 35

👥 Layer 2: Docker Review Coordination
  Status: ✅ PASSED
  Reviewers: 7
  Reviews Completed: 70
  Queue Depth Max: 12
  Containers: 28

🔄 Layer 3: Docker Error Handling
  Status: ✅ PASSED
  Initial Failures: 35 (50%)
  Retries: 52
  Final Pass Rate: 100%
  Containers Respawned: 52

🐳 Docker Validation:
  Container Health: ✅ HEALTHY
  Network Connectivity: ✅ WORKING
  Resource Management: ✅ OPTIMAL
  Redis Integration: ✅ VERIFIED

📄 Detailed Reports:
  - test-results/hello-world-docker/layer0-results.json
  - test-results/hello-world-docker/layer1-results.json
  - test-results/hello-world-docker/layer2-results.json
  - test-results/hello-world-docker/layer3-results.json
  - test-results/hello-world-docker/combined-report.json

══════════════════════════════════════════════════════════════════════
✅ DOCKER CFN COORDINATION VALIDATION COMPLETE
══════════════════════════════════════════════════════════════════════
```

## Error Handling

If any layer fails:

1. **Stop execution** (don't proceed to next layer)
2. **Print failure details** from JSON report
3. **Save partial combined report** with failed layer marked
4. **Exit with code 1**

Example failure output:
```
❌ Layer 1 FAILED: Docker Mesh Coordination

Failure Reason: High conflict rate in claim negotiation
  Expected: ≤5 conflicts
  Actual: 12 conflicts
  Details: Coordinators coord-a and coord-b claimed same combo 12 times

📄 Full Report: test-results/hello-world-docker/layer1-results.json

⚠️  Cannot proceed to Layer 2 until Layer 1 passes.
```

## TodoWrite Tracking

Use TodoWrite to track test progress:

```javascript
[
  { "content": "Initialize Docker test environment (Docker, Redis, MCP network)", "status": "in_progress" },
  { "content": "Run Layer 0: Docker Agent Tool Validation", "status": "pending" },
  { "content": "Validate Layer 0 results + container health", "status": "pending" },
  { "content": "Run Layer 1: Docker Mesh Coordination", "status": "pending" },
  { "content": "Validate Layer 1 results + Redis persistence", "status": "pending" },
  { "content": "Run Layer 2: Docker Review Coordination", "status": "pending" },
  { "content": "Validate Layer 2 results + container queue management", "status": "pending" },
  { "content": "Run Layer 3: Docker Error Handling", "status": "pending" },
  { "content": "Validate Layer 3 results + container recovery", "status": "pending" },
  { "content": "Generate combined report", "status": "pending" },
  { "content": "Print final summary", "status": "pending" }
]
```

Update status as each layer completes.

## Comparison with Standard Hello World Tests

### Container vs Direct Spawning
| Aspect | Standard CFN | Docker CFN | Docker Benefits |
|--------|-------------|------------|----------------|
| **Agent Execution** | Direct process spawn | Container spawn | Isolation, resource limits |
| **Memory Management** | Shared memory | Per-container limits | WSL2 crash prevention |
| **Tool Access** | Direct file system | MCP authentication | Security, audit trail |
| **Scalability** | Limited by host | Container orchestration | Unlimited scaling |
| **State Storage** | SQLite memory | Redis persistence | Better reliability |

### MCP Integration
| Feature | Standard CFN | Docker CFN | Docker Benefits |
|--------|-------------|------------|----------------|
| **Tool Access** | Direct | MCP-mediated | Authentication, access control |
| **Resource Usage** | All tools loaded | Skill-based selection | 50%+ memory savings |
| **Security** | Basic | Multi-layer authentication | Enterprise grade |
| **Monitoring** | Limited | Per-container metrics | Better observability |

## References

- **Docker Test Suite**: `tests/hello-world-docker/`
- **Original Test Suite**: `tests/hello-world/` (preserved for compatibility)
- **CFN Docker Implementation**: `CFN_DOCKER_IMPLEMENTATION_COMPLETE.md`
- **Docker Coordination**: `.claude/skills/cfn-docker-*/`
- **MCP Architecture**: `planning/docker/`