# Phase 1 Test Specifications: Enhanced Agent Capabilities

**Version**: 1.0
**Created**: 2025-11-08
**Test Environment**: Docker containers with CFN Loop integration
**Success Threshold**: 100% of tests passing with performance benchmarks met

## 📋 Test Suite Overview

### Primary Objectives
- Validate CFN Loop execution within Docker containers
- Verify Redis coordination from containerized agents
- Test context passing and agent communication
- Ensure zero memory leaks under production load
- Validate performance benchmarks (agent spawn <5s, memory <1GB/agent)

### Test Environment Setup
```bash
# Test Infrastructure
docker network create cfn-test-network
docker run -d --name redis-test --network cfn-test-network redis:7-alpine
docker run -d --name cfn-coordinator --network cfn-test-network \
  -v $(pwd):/app -w /app claude-flow-novice:test
```

---

## 🧪 Test Suite 1: CFN Loop Integration

### Test 1.1: Container CFN Execution
**File**: `test/docker/phase1/cfn-container-execution.test.js`

**Objective**: Verify agents can execute full CFN Loop inside containers

**Test Scenarios**:
```javascript
describe('CFN Loop Container Execution', () => {
  test('Agent should complete full CFN Loop in container', async () => {
    const agentId = `test-agent-${Date.now()}`;
    const taskId = `task-${Date.now()}`;

    const result = await spawnContainerAgent({
      image: 'claude-flow-novice:test',
      agentType: 'backend-developer',
      taskId,
      agentId,
      command: `npx claude-flow-novice agent-spawn --type backend-developer --task-id ${taskId} --agent-id ${agentId}`
    });

    // Success Criteria
    expect(result.exitCode).toBe(0);
    expect(result.duration).toBeLessThan(30000); // 30s max
    expect(result.output).toContain('CFN Loop completed');
    expect(result.confidence).toBeGreaterThan(0.75);
  });

  test('Multiple agents should execute CFN Loop concurrently', async () => {
    const agentCount = 7;
    const agents = Array.from({length: agentCount}, (_, i) => ({
      id: `concurrent-agent-${i}-${Date.now()}`,
      type: ['backend-developer', 'frontend-engineer', 'tester'][i % 3]
    }));

    const results = await Promise.all(
      agents.map(agent => spawnContainerAgent({
        image: 'claude-flow-novice:test',
        agentType: agent.type,
        taskId: `concurrent-task-${Date.now()}`,
        agentId: agent.id
      }))
    );

    // Success Criteria
    expect(results.every(r => r.exitCode === 0)).toBe(true);
    expect(results.every(r => r.duration < 30000)).toBe(true);
    expect(results.every(r => r.confidence > 0.75)).toBe(true);
  });
});
```

**Validation Metrics**:
- ✅ Exit code = 0 for all agents
- ✅ Execution time < 30 seconds per agent
- ✅ Confidence score ≥ 0.75
- ✅ CFN Loop completion message present
- ✅ No error logs in container output

**Performance Benchmarks**:
- Agent spawn time: <5 seconds
- CFN Loop completion: <30 seconds
- Memory usage: <1GB per agent
- Concurrent execution: 7+ agents simultaneously

---

### Test 1.2: Redis Container Coordination

**File**: `test/docker/phase1/redis-container-coordination.test.js`

**Objective**: Validate Redis coordination from within Docker containers

**Test Scenarios**:
```javascript
describe('Redis Container Coordination', () => {
  test('Agent should connect to Redis from container', async () => {
    const agentId = `redis-test-${Date.now()}`;

    const result = await spawnContainerAgent({
      image: 'claude-flow-novice:test',
      environment: {
        REDIS_URL: 'redis://redis-test:6379',
        AGENT_ID: agentId
      },
      command: `node test/scripts/redis-connection-test.js ${agentId}`
    });

    // Success Criteria
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Redis connection successful');
    expect(result.output).toContain('Agent registered in coordination layer');
  });

  test('Agents should coordinate via Redis pub/sub', async () => {
    const coordinatorId = `coordinator-${Date.now()}`;
    const workerIds = Array.from({length: 3}, (_, i) => `worker-${i}-${Date.now()}`);

    // Spawn coordinator
    const coordinator = await spawnContainerAgent({
      image: 'claude-flow-novice:test',
      environment: { REDIS_URL: 'redis://redis-test:6379' },
      command: `node test/scripts/coordinator-broadcast.js ${coordinatorId}`
    });

    // Spawn workers
    const workers = await Promise.all(
      workerIds.map(id => spawnContainerAgent({
        image: 'claude-flow-novice:test',
        environment: { REDIS_URL: 'redis://redis-test:6379' },
        command: `node test/scripts/worker-listen.js ${id}`
      }))
    );

    // Success Criteria
    expect(coordinator.exitCode).toBe(0);
    expect(workers.every(w => w.exitCode === 0)).toBe(true);
    expect(workers.every(w => w.output.includes('Received broadcast'))).toBe(true);
  });
});
```

**Validation Metrics**:
- ✅ Redis connection established from container
- ✅ Agent registration in coordination layer
- ✅ Pub/sub messaging functional
- ✅ Agent-to-agent communication working
- ✅ Connection latency <100ms

---

### Test 1.3: Context Passing Validation

**File**: `test/docker/phase1/context-passing.test.js`

**Objective**: Test context injection and task mapping in containers

**Test Scenarios**:
```javascript
describe('Context Passing Validation', () => {
  test('Agent should receive and process context correctly', async () => {
    const context = {
      taskId: `context-task-${Date.now()}`,
      agentType: 'backend-developer',
      instructions: 'Implement JWT authentication endpoint',
      deliverables: ['auth-controller.js', 'jwt-middleware.js'],
      constraints: {
        framework: 'express',
        database: 'postgresql',
        timeout: 60000
      }
    };

    const result = await spawnContainerAgent({
      image: 'claude-flow-novice:test',
      volumes: [
        `${contextFile}:/app/context.json:ro`,
        `${workspaceDir}:/app/workspace`
      ],
      command: `node test/scripts/context-processor.js /app/context.json`
    });

    // Success Criteria
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Context parsed successfully');
    expect(result.output).toContain('Task initiated');
    expect(result.createdFiles).toContain('auth-controller.js');
    expect(result.createdFiles).toContain('jwt-middleware.js');
  });

  test('Complex context should maintain integrity', async () => {
    const complexContext = {
      taskId: `complex-task-${Date.now()}`,
      workflow: 'multi-agent-development',
      phases: [
        { name: 'design', agents: ['system-architect'] },
        { name: 'backend', agents: ['backend-developer'] },
        { name: 'frontend', agents: ['react-frontend-engineer'] },
        { name: 'testing', agents: ['tester'] }
      ],
      dependencies: {
        backend: ['database-schema', 'api-design'],
        frontend: ['backend-api']
      }
    };

    const result = await spawnContainerAgent({
      image: 'claude-flow-novice:test',
      volumes: [`${complexContextFile}:/app/complex-context.json:ro`],
      command: `node test/scripts/complex-context-validator.js /app/complex-context.json`
    });

    // Success Criteria
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Complex context validated');
    expect(result.output).toContain('Workflow phases parsed');
    expect(result.output).toContain('Dependencies resolved');
  });
});
```

**Validation Metrics**:
- ✅ Context parsing success rate = 100%
- ✅ Task execution with context = 100%
- ✅ Complex workflow processing = 100%
- ✅ File creation matching deliverables = 100%
- ✅ Context integrity maintained = 100%

---

## 🧪 Test Suite 2: Memory Management & Performance

### Test 2.1: Memory Leak Detection

**File**: `test/docker/phase1/memory-leak-detection.test.js`

**Objective**: Ensure zero memory leaks in containerized agent execution

**Test Scenarios**:
```javascript
describe('Memory Leak Detection', () => {
  test('Single agent should not leak memory over multiple executions', async () => {
    const agentId = `memory-test-${Date.now()}`;
    const iterations = 10;
    const memorySnapshots = [];

    for (let i = 0; i < iterations; i++) {
      const result = await spawnContainerAgent({
        image: 'claude-flow-novice:test',
        agentId: `${agentId}-${i}`,
        command: `node test/scripts/memory-intensive-task.js`,
        memoryLimit: '1g'
      });

      const memoryUsage = await getContainerMemoryUsage(result.containerId);
      memorySnapshots.push(memoryUsage);

      // Cleanup
      await docker.container.stop(result.containerId);
      await docker.container.remove(result.containerId);
    }

    // Analyze memory trends
    const memoryGrowth = calculateMemoryGrowth(memorySnapshots);

    // Success Criteria
    expect(memoryGrowth).toBeLessThan(0.1); // <10% growth over 10 iterations
    expect(Math.max(...memorySnapshots)).toBeLessThan(1024); // <1GB peak
  });

  test('Multiple concurrent agents should not leak memory', async () => {
    const agentCount = 7;
    const agents = Array.from({length: agentCount}, (_, i) => ({
      id: `concurrent-memory-${i}-${Date.now()}`,
      containerId: null
    }));

    // Spawn agents
    const spawnPromises = agents.map(async (agent) => {
      const result = await spawnContainerAgent({
        image: 'claude-flow-novice:test',
        agentId: agent.id,
        command: `node test/scripts/continuous-memory-monitor.js`,
        memoryLimit: '1g'
      });
      agent.containerId = result.containerId;
      return result;
    });

    const results = await Promise.all(spawnPromises);

    // Monitor memory for 60 seconds
    const memoryMonitoring = setInterval(async () => {
      for (const agent of agents) {
        const memory = await getContainerMemoryUsage(agent.containerId);
        agent.memoryHistory = agent.memoryHistory || [];
        agent.memoryHistory.push(memory);
      }
    }, 5000);

    await new Promise(resolve => setTimeout(resolve, 60000));
    clearInterval(memoryMonitoring);

    // Cleanup
    for (const agent of agents) {
      await docker.container.stop(agent.containerId);
      await docker.container.remove(agent.containerId);
    }

    // Analyze memory usage
    const maxMemoryUsage = Math.max(
      ...agents.flatMap(a => a.memoryHistory)
    );

    // Success Criteria
    expect(maxMemoryUsage).toBeLessThan(1024); // <1GB per agent
    expect(results.every(r => r.exitCode === 0)).toBe(true);
  });
});
```

**Validation Metrics**:
- ✅ Memory growth <10% over 10 iterations
- ✅ Peak memory usage <1GB per agent
- ✅ No memory leaks detected after cleanup
- ✅ Container cleanup efficiency = 100%
- ✅ Memory stability under concurrent load

---

### Test 2.2: Performance Benchmarking

**File**: `test/docker/phase1/performance-benchmarks.test.js`

**Objective**: Validate performance targets for containerized agents

**Test Scenarios**:
```javascript
describe('Performance Benchmarks', () => {
  test('Agent spawn time should be under 5 seconds', async () => {
    const iterations = 20;
    const spawnTimes = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();

      const result = await spawnContainerAgent({
        image: 'claude-flow-novice:test',
        agentId: `perf-test-${i}-${Date.now()}`,
        command: `echo "Agent spawned successfully"`
      });

      const spawnTime = Date.now() - startTime;
      spawnTimes.push(spawnTime);

      await docker.container.stop(result.containerId);
      await docker.container.remove(result.containerId);
    }

    const averageSpawnTime = spawnTimes.reduce((a, b) => a + b, 0) / spawnTimes.length;
    const maxSpawnTime = Math.max(...spawnTimes);

    // Success Criteria
    expect(averageSpawnTime).toBeLessThan(5000); // <5s average
    expect(maxSpawnTime).toBeLessThan(8000); // <8s max
  });

  test('Task completion should meet time targets', async () => {
    const tasks = [
      { type: 'simple', expectedTime: 10000, command: 'echo "Simple task"' },
      { type: 'medium', expectedTime: 30000, command: 'node test/scripts/medium-complexity-task.js' },
      { type: 'complex', expectedTime: 60000, command: 'node test/scripts/complex-development-task.js' }
    ];

    for (const task of tasks) {
      const startTime = Date.now();

      const result = await spawnContainerAgent({
        image: 'claude-flow-novice:test',
        agentId: `${task.type}-task-${Date.now()}`,
        command: task.command,
        timeout: task.expectedTime * 2
      });

      const completionTime = Date.now() - startTime;

      // Success Criteria
      expect(result.exitCode).toBe(0);
      expect(completionTime).toBeLessThan(task.expectedTime);

      await cleanupContainer(result.containerId);
    }
  });

  test('Resource usage should stay within limits', async () => {
    const agentId = `resource-test-${Date.now()}`;

    const result = await spawnContainerAgent({
      image: 'claude-flow-novice:test',
      agentId,
      command: 'node test/scripts/resource-monitoring-task.js',
      memoryLimit: '1g',
      cpuLimit: '1'
    });

    // Monitor resources for 30 seconds
    const resourceMetrics = await monitorContainerResources(
      result.containerId,
      30000
    );

    await cleanupContainer(result.containerId);

    // Success Criteria
    expect(resourceMetrics.maxMemoryMB).toBeLessThan(1024); // <1GB
    expect(resourceMetrics.maxCPUPercent).toBeLessThan(80); // <80% CPU
    expect(resourceMetrics.avgMemoryMB).toBeLessThan(512); // <512MB average
  });
});
```

**Validation Metrics**:
- ✅ Agent spawn time <5 seconds (average), <8 seconds (max)
- ✅ Simple task completion <10 seconds
- ✅ Medium complexity task <30 seconds
- ✅ Complex development task <60 seconds
- ✅ Memory usage <1GB peak, <512MB average
- ✅ CPU usage <80% peak

---

## 🧪 Test Suite 3: Integration & Reliability

### Test 3.1: End-to-End CFN Workflow

**File**: `test/docker/phase1/e2e-cfn-workflow.test.js`

**Objective**: Test complete CFN Loop workflow in containerized environment

**Test Scenarios**:
```javascript
describe('End-to-End CFN Workflow', () => {
  test('Complete CFN Loop should execute successfully in containers', async () => {
    const taskId = `e2e-task-${Date.now()}`;
    const workflow = {
      phases: [
        { name: 'specification', agent: 'specification-agent', expectedDuration: 10000 },
        { name: 'architecture', agent: 'system-architect', expectedDuration: 15000 },
        { name: 'implementation', agent: 'backend-developer', expectedDuration: 30000 },
        { name: 'validation', agent: 'tester', expectedDuration: 20000 }
      ]
    };

    const results = [];

    // Execute each phase in container
    for (const phase of workflow.phases) {
      const startTime = Date.now();

      const result = await spawnContainerAgent({
        image: 'claude-flow-novice:test',
        agentId: `${phase.name}-${taskId}`,
        command: `npx claude-flow-novice agent-spawn --type ${phase.agent} --task-id ${taskId} --phase ${phase.name}`,
        volumes: [`${workspaceDir}:/app/workspace`],
        environment: {
          REDIS_URL: 'redis://redis-test:6379',
          WORKFLOW_PHASE: phase.name
        }
      });

      const duration = Date.now() - startTime;

      results.push({
        phase: phase.name,
        result,
        duration,
        success: result.exitCode === 0 && duration < phase.expectedDuration * 2
      });

      await cleanupContainer(result.containerId);
    }

    // Success Criteria
    expect(results.every(r => r.success)).toBe(true);
    expect(results.length).toBe(workflow.phases.length);

    // Verify workflow outputs
    const workspaceContents = await getWorkspaceContents(workspaceDir);
    expect(workspaceContents).toContain('specification.md');
    expect(workspaceContents).toContain('architecture-diagram.json');
    expect(workspaceContents).toContain('implementation-code.js');
    expect(workspaceContents).toContain('test-results.json');
  });

  test('Error handling and recovery should work correctly', async () => {
    const taskId = `error-test-${Date.now()}`;

    // Intentionally trigger an error
    const faultyResult = await spawnContainerAgent({
      image: 'claude-flow-novice:test',
      agentId: `faulty-agent-${taskId}`,
      command: `node test/scripts/intentional-error-script.js`,
      environment: {
        REDIS_URL: 'redis://redis-test:6379',
        ERROR_MODE: 'true'
      }
    });

    // Verify error handling
    expect(faultyResult.exitCode).not.toBe(0);
    expect(faultyResult.output).toContain('Error detected');
    expect(faultyResult.output).toContain('Recovery initiated');

    // Spawn recovery agent
    const recoveryResult = await spawnContainerAgent({
      image: 'claude-flow-novice:test',
      agentId: `recovery-agent-${taskId}`,
      command: `npx claude-flow-novice agent-spawn --type recovery-specialist --task-id ${taskId} --recover-from ${faultyResult.containerId}`,
      environment: {
        REDIS_URL: 'redis://redis-test:6379'
      }
    });

    // Success Criteria
    expect(recoveryResult.exitCode).toBe(0);
    expect(recoveryResult.output).toContain('Recovery completed');
    expect(recoveryResult.output).toContain('Task resumed successfully');

    await cleanupContainer(faultyResult.containerId);
    await cleanupContainer(recoveryResult.containerId);
  });
});
```

**Validation Metrics**:
- ✅ Complete CFN Loop success rate = 100%
- ✅ Phase transition success rate = 100%
- ✅ Error detection and recovery = 100%
- ✅ Workflow completion time <2 minutes
- ✅ Deliverable creation rate = 100%

---

## 🚀 Test Execution Framework

### Test Runner Configuration
```json
{
  "testRunner": "jest",
  "testEnvironment": "node",
  "setupFilesAfterEnv": ["<rootDir>/test/docker/setup-docker-env.js"],
  "testTimeout": 120000,
  "collectCoverageFrom": [
    "src/**/*.js",
    "!src/**/*.test.js"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

### Automated Test Execution
```bash
# Run all Phase 1 tests
npm run test:phase1

# Run specific test suite
npm run test:phase1:cfn-integration
npm run test:phase1:memory-management
npm run test:phase1:performance
npm run test:phase1:e2e

# Run with performance profiling
npm run test:phase1 -- --profile

# Run with memory leak detection
npm run test:phase1 -- --memory-leak-detection
```

### Continuous Integration Integration
```yaml
# .github/workflows/phase1-testing.yml
name: Phase 1 Testing
on:
  push:
    paths: ['src/docker/**', 'test/docker/phase1/**']
  pull_request:
    paths: ['src/docker/**', 'test/docker/phase1/**']

jobs:
  phase1-tests:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Build test container
        run: docker build -t claude-flow-novice:test -f Dockerfile.test .

      - name: Run Phase 1 tests
        run: npm run test:phase1

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: phase1-test-results
          path: test-results/
```

---

## 📊 Success Criteria Summary

### Quantitative Pass/Fail Thresholds
- **CFN Loop Success Rate**: ≥95% (target 100%)
- **Agent Spawn Time**: ≤5 seconds average, ≤8 seconds max
- **Memory Usage**: ≤1GB peak, ≤512MB average per agent
- **Concurrent Agents**: ≥7 simultaneous successful executions
- **Memory Leak Detection**: 0% memory growth over 10 iterations
- **Task Completion**: Simple ≤10s, Medium ≤30s, Complex ≤60s
- **Redis Coordination**: 100% connection success, <100ms latency
- **Context Processing**: 100% successful parsing and execution
- **Error Recovery**: 100% successful error detection and recovery

### Automated Validation Requirements
- All tests must pass automatically without manual intervention
- Performance metrics must be automatically collected and validated
- Memory usage must be monitored throughout test execution
- Container cleanup must be verified after each test
- Redis connectivity must be validated before and after each test

### Test Coverage Requirements
- **Code Coverage**: ≥80% across all container-related code
- **Integration Coverage**: 100% of CFN Loop phases
- **Error Scenarios**: 100% of identified error conditions
- **Performance Scenarios**: 100% of defined performance benchmarks

---

## 🔧 Test Utilities and Helpers

### Container Management Utilities
```javascript
// test/docker/utils/container-manager.js
class ContainerManager {
  async spawnContainerAgent(config) {
    // Spawns container with CFN agent
    // Returns container ID and initial metrics
  }

  async getContainerMetrics(containerId) {
    // Returns CPU, memory, network metrics
  }

  async cleanupContainer(containerId) {
    // Ensures complete container cleanup
  }

  async monitorMemoryUsage(containerId, duration) {
    // Continuously monitors memory usage
  }
}
```

### Redis Testing Utilities
```javascript
// test/docker/utils/redis-test-helper.js
class RedisTestHelper {
  async setupTestRedis() {
    // Creates isolated Redis instance for testing
  }

  async validateRedisConnection(containerId) {
    // Validates Redis connectivity from container
  }

  async simulatePubSubTest(coordinatorId, workerIds) {
    // Tests Redis pub/sub coordination
  }
}
```

### Performance Monitoring Utilities
```javascript
// test/docker/utils/performance-monitor.js
class PerformanceMonitor {
  async measureSpawnTime(config) {
    // Measures agent container spawn time
  }

  async profileMemoryUsage(containerId) {
    // Profiles memory usage patterns
  }

  async generatePerformanceReport(testResults) {
    // Generates comprehensive performance report
  }
}
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-08
**Next Review**: After Phase 1 implementation completion