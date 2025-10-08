# File-Based Coordination Protocol for 50-Agent Swarm Testing in WSL2

## Overview

This protocol defines a robust file-based coordination system for 50-agent swarm testing in WSL2 environments. It uses shared memory (`/dev/shm`) for high-performance inter-process communication with built-in reliability, conflict resolution, and error recovery mechanisms.

## Architecture

### Core Components

1. **Coordinator Process**: Main orchestrator that distributes tasks and aggregates results
2. **Agent Processes**: 50 independent processes that execute tasks and report results
3. **File System Layer**: Uses `/dev/shm` for low-latency file operations
4. **Locking System**: Prevents race conditions during concurrent file access
5. **Monitoring Layer**: Tracks system health and performance metrics

### Communication Flow

```
Coordinator → File System → Agents
    ↑                           ↓
    └──── Results ←───────────┘
```

## Directory Structure

```
/dev/shm/stability-test-{session}/
├── session.json                    # Session metadata and configuration
├── coordinator/
│   ├── cycle-{cycle}/
│   │   ├── tasks-distributed.json  # Task distribution manifest
│   │   ├── tasks.json              # Task definitions (one per agent)
│   │   ├── results-summary.json    # Aggregated results
│   │   └── status.json             # Coordinator status
│   └── global-lock.json            # Coordinator-level lock
├── agents/
│   ├── agent-{id}/
│   │   ├── task-{cycle}.json       # Current task for this agent
│   │   ├── result-{cycle}.json     # Result from this agent
│   │   ├── heartbeat-{timestamp}.json  # Heartbeat status
│   │   ├── status.json             # Agent status
│   │   └── lock.json               # Agent-specific lock
│   └── registry.json               # Agent registry and health status
├── monitoring/
│   ├── system-metrics.jsonl        # Continuous system metrics
│   ├── agent-status.jsonl          # Agent health tracking
│   ├── coordination-times.jsonl    # Performance metrics
│   └── errors.jsonl                # Error log
└── cleanup/
    ├── mark-complete-{cycle}.json  # Cycle completion markers
    └── session-cleanup.json        # Cleanup trigger
```

## Message Schemas

### 1. Session Metadata (`session.json`)

```json
{
  "sessionId": "stability-test-20251007-142345",
  "startTime": "2025-10-07T14:23:45.123Z",
  "coordinatorPid": 12345,
  "config": {
    "agentCount": 50,
    "totalCycles": 96,
    "cycleInterval": 300000,
    "taskTimeout": 10000,
    "heartbeatInterval": 5000,
    "maxRetries": 3
  },
  "status": "running",
  "currentCycle": 0
}
```

### 2. Task Message Schema

```json
{
  "messageType": "task",
  "cycle": 42,
  "agentId": "agent-23",
  "taskId": "task-42-23",
  "timestamp": "2025-10-07T14:23:45.123Z",
  "payload": {
    "type": "coordination",
    "data": {
      "operation": "health_check",
      "parameters": {
        "memoryReport": true,
        "fdReport": true,
        "latencyTest": true
      }
    }
  },
  "timeout": "2025-10-07T14:23:55.123Z",
  "retryCount": 0
}
```

### 3. Result Message Schema

```json
{
  "messageType": "result",
  "cycle": 42,
  "agentId": "agent-23",
  "taskId": "task-42-23",
  "timestamp": "2025-10-07T14:23:47.456Z",
  "executionTime": 2133,
  "status": "success",
  "payload": {
    "type": "coordination_response",
    "data": {
      "healthStatus": "healthy",
      "memoryUsage": {
        "rss": 52428800,
        "heapUsed": 31457280,
        "heapTotal": 67108864
      },
      "fdCount": 45,
      "latency": {
        "taskReceive": 0,
        "taskStart": 12,
        "taskComplete": 2115
      }
    }
  },
  "metrics": {
    "cpuUsage": 2.5,
    "memoryDelta": 1048576,
    "fdDelta": 0
  }
}
```

### 4. Heartbeat Message Schema

```json
{
  "messageType": "heartbeat",
  "agentId": "agent-23",
  "timestamp": "2025-10-07T14:23:50.000Z",
  "uptime": 3600,
  "status": "healthy",
  "pid": 12467,
  "metrics": {
    "memory": {
      "rss": 52428800,
      "heapUsed": 31457280,
      "heapTotal": 67108864
    },
    "performance": {
      "tasksCompleted": 42,
      "averageResponseTime": 2150,
      "errorCount": 0
    },
    "resources": {
      "fileDescriptors": 45,
      "cpuUsage": 2.5
    }
  }
}
```

### 5. Error Message Schema

```json
{
  "messageType": "error",
  "agentId": "agent-23",
  "timestamp": "2025-10-07T14:23:45.789Z",
  "error": {
    "code": "TASK_TIMEOUT",
    "message": "Task execution exceeded 10 second timeout",
    "details": {
      "taskId": "task-42-23",
      "timeout": 10000,
      "actualDuration": 12345
    }
  },
  "context": {
    "cycle": 42,
    "lastSuccessfulTask": "task-41-23",
    "retryCount": 2
  },
  "recoveryAction": "retry_task"
}
```

## File Locking Strategy

### 1. Advisory Locking with Retry Mechanism

```javascript
class FileLock {
  constructor(filePath, maxRetries = 10, retryDelay = 100) {
    this.filePath = filePath;
    this.lockFile = `${filePath}.lock`;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.acquired = false;
  }

  async acquire() {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Try to create lock file with exclusive flag
        const lockData = {
          pid: process.pid,
          timestamp: Date.now(),
          sessionId: this.getSessionId()
        };

        await fs.writeFile(this.lockFile, JSON.stringify(lockData), { flag: 'wx' });
        this.acquired = true;
        return true;
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock exists, check if it's stale
          const stale = await this.isLockStale();
          if (stale) {
            await this.forceRelease();
            continue;
          }

          // Wait and retry
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error(`Failed to acquire lock after ${this.maxRetries} attempts`);
  }

  async release() {
    if (this.acquired) {
      try {
        await fs.unlink(this.lockFile);
        this.acquired = false;
      } catch (error) {
        // Lock file might have been removed by another process
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  async isLockStale() {
    try {
      const lockData = JSON.parse(await fs.readFile(this.lockFile, 'utf8'));
      const age = Date.now() - lockData.timestamp;
      // Consider lock stale after 30 seconds
      return age > 30000;
    } catch (error) {
      // If we can't read the lock, consider it stale
      return true;
    }
  }

  async forceRelease() {
    try {
      const lockData = JSON.parse(await fs.readFile(this.lockFile, 'utf8'));
      console.warn(`Force releasing stale lock from PID ${lockData.pid}`);
      await fs.unlink(this.lockFile);
    } catch (error) {
      // If we can't read or remove, try unlink anyway
      try {
        await fs.unlink(this.lockFile);
      } catch (unlinkError) {
        // Give up
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getSessionId() {
    // Extract from environment or process args
    return process.env.STABILITY_SESSION_ID || 'default';
  }
}
```

### 2. Lock Usage Pattern

```javascript
// Usage example
const lock = new FileLock('/dev/shm/stability-test-session/agents/agent-23/status.json');

try {
  await lock.acquire();

  // Critical section - safe file operations
  const status = JSON.parse(await fs.readFile('/dev/shm/stability-test-session/agents/agent-23/status.json', 'utf8'));
  status.lastUpdate = new Date().toISOString();
  status.taskCount++;

  await fs.writeFile('/dev/shm/stability-test-session/agents/agent-23/status.json', JSON.stringify(status, null, 2));

} finally {
  await lock.release();
}
```

## Protocol Implementation

### 1. Coordinator Implementation

```javascript
class FileBasedCoordinator {
  constructor(config) {
    this.config = config;
    this.sessionId = this.generateSessionId();
    this.basePath = `/dev/shm/stability-test-${this.sessionId}`;
    this.currentCycle = 0;
    this.agents = new Map();
    this.metrics = new Map();
  }

  async initialize() {
    // Create directory structure
    await this.createDirectoryStructure();

    // Initialize session metadata
    await this.initializeSession();

    // Register agents
    await this.registerAgents();

    // Start monitoring
    this.startMonitoring();
  }

  async distributeTasks(cycle) {
    const cyclePath = `${this.basePath}/coordinator/cycle-${cycle}`;
    await fs.mkdir(cyclePath, { recursive: true });

    const tasks = [];
    const taskDistributed = {
      cycle,
      timestamp: new Date().toISOString(),
      agentCount: this.config.agentCount,
      tasks: []
    };

    // Create individual task files for each agent
    for (let agentId = 0; agentId < this.config.agentCount; agentId++) {
      const task = {
        messageType: "task",
        cycle,
        agentId: `agent-${agentId}`,
        taskId: `task-${cycle}-${agentId}`,
        timestamp: new Date().toISOString(),
        payload: this.generateTaskPayload(cycle, agentId),
        timeout: new Date(Date.now() + this.config.taskTimeout).toISOString(),
        retryCount: 0
      };

      const taskPath = `${this.basePath}/agents/agent-${agentId}/task-${cycle}.json`;
      const taskLock = new FileLock(taskPath);

      try {
        await taskLock.acquire();
        await fs.writeFile(taskPath, JSON.stringify(task, null, 2));
        tasks.push(task);
        taskDistributed.tasks.push({
          agentId: task.agentId,
          taskId: task.taskId,
          taskPath
        });
      } finally {
        await taskLock.release();
      }
    }

    // Write distribution manifest
    await fs.writeFile(
      `${cyclePath}/tasks-distributed.json`,
      JSON.stringify(taskDistributed, null, 2)
    );

    return tasks;
  }

  async collectResults(cycle) {
    const cyclePath = `${this.basePath}/coordinator/cycle-${cycle}`;
    const results = [];
    const startTime = Date.now();

    // Wait for results with timeout
    const deadline = Date.now() + this.config.collectionTimeout;

    while (Date.now() < deadline && results.length < this.config.agentCount) {
      for (let agentId = 0; agentId < this.config.agentCount; agentId++) {
        const resultPath = `${this.basePath}/agents/agent-${agentId}/result-${cycle}.json`;

        try {
          const resultLock = new FileLock(resultPath);
          await resultLock.acquire();

          const resultData = JSON.parse(await fs.readFile(resultPath, 'utf8'));
          if (!results.find(r => r.agentId === resultData.agentId)) {
            results.push(resultData);
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.error(`Error reading result for agent-${agentId}:`, error);
          }
        }
      }

      await this.sleep(100); // Brief pause between checks
    }

    const collectionTime = Date.now() - startTime;
    const summary = {
      cycle,
      collectionTime,
      agentCount: this.config.agentCount,
      resultsCollected: results.length,
      results,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile(
      `${cyclePath}/results-summary.json`,
      JSON.stringify(summary, null, 2)
    );

    return summary;
  }

  async monitorAgentHealth() {
    const registryPath = `${this.basePath}/agents/registry.json`;
    const registryLock = new FileLock(registryPath);

    try {
      await registryLock.acquire();
      const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));

      const now = Date.now();
      const healthyAgents = [];
      const unhealthyAgents = [];

      for (const agentId of Object.keys.registry) {
        const heartbeatPath = `${this.basePath}/agents/${agentId}/heartbeat-${now}.json`;

        try {
          const heartbeat = JSON.parse(await fs.readFile(heartbeatPath, 'utf8'));
          const age = now - new Date(heartbeat.timestamp).getTime();

          if (age < this.config.heartbeatInterval * 2) {
            healthyAgents.push(agentId);
            registry[agentId].status = 'healthy';
            registry[agentId].lastSeen = heartbeat.timestamp;
          } else {
            unhealthyAgents.push(agentId);
            registry[agentId].status = 'unhealthy';
            registry[agentId].lastSeen = heartbeat.timestamp;
          }
        } catch (error) {
          unhealthyAgents.push(agentId);
          registry[agentId].status = 'missing';
          registry[agentId].lastSeen = null;
        }
      }

      await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));

      return { healthyAgents, unhealthyAgents };
    } finally {
      await registryLock.release();
    }
  }

  async cleanup() {
    // Mark session as complete
    const sessionPath = `${this.basePath}/session.json`;
    const sessionLock = new FileLock(sessionPath);

    try {
      await sessionLock.acquire();
      const session = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
      session.status = 'completed';
      session.endTime = new Date().toISOString();
      await fs.writeFile(sessionPath, JSON.stringify(session, null, 2));
    } finally {
      await sessionLock.release();
    }

    // Schedule cleanup for later (don't block shutdown)
    setTimeout(() => {
      this.performCleanup();
    }, 60000); // Cleanup after 1 minute
  }

  async performCleanup() {
    try {
      // Remove entire session directory
      await fs.rm(this.basePath, { recursive: true, force: true });
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }

  // Helper methods
  generateSessionId() {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  async createDirectoryStructure() {
    const dirs = [
      `${this.basePath}/coordinator`,
      `${this.basePath}/agents`,
      `${this.basePath}/monitoring`,
      `${this.basePath}/cleanup`
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // Create agent directories
    for (let i = 0; i < this.config.agentCount; i++) {
      await fs.mkdir(`${this.basePath}/agents/agent-${i}`, { recursive: true });
    }
  }

  generateTaskPayload(cycle, agentId) {
    return {
      type: "coordination",
      data: {
        operation: "health_check",
        parameters: {
          memoryReport: true,
          fdReport: true,
          latencyTest: cycle % 10 === 0 // Every 10th cycle
        }
      }
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2. Agent Implementation

```javascript
class FileBasedAgent {
  constructor(agentId, basePath) {
    this.agentId = agentId;
    this.basePath = basePath;
    this.agentPath = `${basePath}/agents/${agentId}`;
    this.running = false;
    this.heartbeatInterval = null;
    this.metrics = {
      tasksCompleted: 0,
      totalResponseTime: 0,
      errorCount: 0
    };
  }

  async start() {
    this.running = true;

    // Initialize agent status
    await this.updateStatus('starting');

    // Start heartbeat
    this.startHeartbeat();

    // Start task processing loop
    this.processTasks();
  }

  async processTasks() {
    while (this.running) {
      try {
        const task = await this.waitForTask();

        if (task) {
          const result = await this.executeTask(task);
          await this.reportResult(task, result);
        }

      } catch (error) {
        console.error(`Agent ${this.agentId} task processing error:`, error);
        await this.reportError(error);
        await this.sleep(1000); // Brief pause on error
      }
    }
  }

  async waitForTask() {
    const cyclePattern = /^task-(\d+)\.json$/;
    const files = await fs.readdir(this.agentPath);

    for (const file of files) {
      const match = file.match(cyclePattern);
      if (match) {
        const cycle = parseInt(match[1], 10);
        const taskPath = `${this.agentPath}/${file}`;

        try {
          const lock = new FileLock(taskPath);
          await lock.acquire();

          const task = JSON.parse(await fs.readFile(taskPath, 'utf8'));

          // Check if task has expired
          if (new Date(task.timeout) < new Date()) {
            await lock.release();
            continue; // Skip expired tasks
          }

          return task;
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.error(`Error reading task ${file}:`, error);
          }
        }
      }
    }

    return null;
  }

  async executeTask(task) {
    const startTime = Date.now();

    try {
      let result;

      switch (task.payload.type) {
        case 'coordination':
          result = await this.handleCoordinationTask(task.payload.data);
          break;
        default:
          throw new Error(`Unknown task type: ${task.payload.type}`);
      }

      const executionTime = Date.now() - startTime;

      // Update metrics
      this.metrics.tasksCompleted++;
      this.metrics.totalResponseTime += executionTime;

      return {
        status: 'success',
        executionTime,
        payload: result,
        metrics: {
          cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
          memoryDelta: 0, // Would be calculated based on previous measurement
          fdDelta: 0 // Would be calculated based on previous measurement
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.metrics.errorCount++;

      return {
        status: 'error',
        executionTime,
        error: {
          code: error.code || 'TASK_ERROR',
          message: error.message
        }
      };
    }
  }

  async handleCoordinationTask(data) {
    const operations = [];

    if (data.parameters.memoryReport) {
      const memory = process.memoryUsage();
      operations.push({
        operation: 'memory_report',
        data: memory
      });
    }

    if (data.parameters.fdReport) {
      const fdCount = await this.getFileDescriptorCount();
      operations.push({
        operation: 'fd_report',
        data: { count: fdCount }
      });
    }

    if (data.parameters.latencyTest) {
      const latencyStart = process.hrtime.bigint();
      await this.sleep(100); // 100ms delay
      const latencyEnd = process.hrtime.bigint();
      const latency = Number(latencyEnd - latencyStart) / 1000000; // Convert to milliseconds

      operations.push({
        operation: 'latency_test',
        data: { latency }
      });
    }

    return {
      type: 'coordination_response',
      data: {
        healthStatus: 'healthy',
        operations,
        timestamp: new Date().toISOString()
      }
    };
  }

  async reportResult(task, result) {
    const resultPath = `${this.agentPath}/result-${task.cycle}.json`;
    const lock = new FileLock(resultPath);

    try {
      await lock.acquire();

      const resultMessage = {
        messageType: "result",
        cycle: task.cycle,
        agentId: this.agentId,
        taskId: task.taskId,
        timestamp: new Date().toISOString(),
        ...result
      };

      await fs.writeFile(resultPath, JSON.stringify(resultMessage, null, 2));

      // Clean up task file
      const taskPath = `${this.agentPath}/task-${task.cycle}.json`;
      await fs.unlink(taskPath).catch(() => {}); // Ignore errors

    } finally {
      await lock.release();
    }
  }

  async reportError(error) {
    const errorPath = `${this.basePath}/monitoring/errors.jsonl`;
    const errorLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
      error: {
        code: error.code || 'AGENT_ERROR',
        message: error.message,
        stack: error.stack
      }
    }) + '\n';

    await fs.appendFile(errorPath, errorLine, 'utf8');
  }

  startHeartbeat() {
    const sendHeartbeat = async () => {
      if (!this.running) return;

      try {
        const timestamp = Date.now();
        const heartbeatPath = `${this.agentPath}/heartbeat-${timestamp}.json`;

        const heartbeat = {
          messageType: "heartbeat",
          agentId: this.agentId,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          status: 'healthy',
          pid: process.pid,
          metrics: {
            memory: process.memoryUsage(),
            performance: {
              ...this.metrics,
              averageResponseTime: this.metrics.tasksCompleted > 0
                ? this.metrics.totalResponseTime / this.metrics.tasksCompleted
                : 0
            },
            resources: {
              fileDescriptors: await this.getFileDescriptorCount(),
              cpuUsage: process.cpuUsage().user / 1000000
            }
          }
        };

        await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat, null, 2));

        // Clean up old heartbeat files (keep only last 5)
        await this.cleanupOldHeartbeats();

      } catch (error) {
        console.error(`Heartbeat error for ${this.agentId}:`, error);
      }

      // Schedule next heartbeat
      this.heartbeatInterval = setTimeout(sendHeartbeat, 5000);
    };

    sendHeartbeat();
  }

  async cleanupOldHeartbeats() {
    try {
      const files = await fs.readdir(this.agentPath);
      const heartbeatFiles = files
        .filter(f => f.startsWith('heartbeat-'))
        .map(f => ({
          name: f,
          timestamp: parseInt(f.split('-')[1].split('.')[0], 10)
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      // Remove all but the 5 most recent
      for (let i = 5; i < heartbeatFiles.length; i++) {
        await fs.unlink(`${this.agentPath}/${heartbeatFiles[i].name}`).catch(() => {});
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  async updateStatus(status) {
    const statusPath = `${this.agentPath}/status.json`;
    const lock = new FileLock(statusPath);

    try {
      await lock.acquire();

      const statusData = {
        agentId: this.agentId,
        status,
        lastUpdate: new Date().toISOString(),
        pid: process.pid
      };

      await fs.writeFile(statusPath, JSON.stringify(statusData, null, 2));
    } finally {
      await lock.release();
    }
  }

  async getFileDescriptorCount() {
    try {
      const files = await fs.readdir(`/proc/${process.pid}/fd`);
      return files.length;
    } catch (error) {
      return 0;
    }
  }

  async stop() {
    this.running = false;

    if (this.heartbeatInterval) {
      clearTimeout(this.heartbeatInterval);
    }

    await this.updateStatus('stopped');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Performance Considerations

### 1. File I/O Optimization

```javascript
class FileIOTimer {
  static async withTiming(operation, label) {
    const start = process.hrtime.bigint();
    try {
      const result = await operation();
      const duration = Number(process.hrtime.bigint() - start) / 1000000;
      console.log(`${label}: ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - start) / 1000000;
      console.log(`${label} (FAILED): ${duration.toFixed(2)}ms`);
      throw error;
    }
  }
}

// Batch file operations
class BatchFileOperations {
  constructor(maxConcurrent = 10) {
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.running = 0;
  }

  async add(operation) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { operation, resolve, reject } = this.queue.shift();

    try {
      const result = await operation();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}
```

### 2. Memory-Efficient JSON Handling

```javascript
class EfficientJSON {
  static async readStream(filePath) {
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    let data = '';

    for await (const chunk of stream) {
      data += chunk;
    }

    return JSON.parse(data);
  }

  static async writeStream(filePath, data) {
    const stream = fs.createWriteStream(filePath);
    const jsonString = JSON.stringify(data, null, 2);

    return new Promise((resolve, reject) => {
      stream.write(jsonString, 'utf8', (error) => {
        if (error) {
          reject(error);
        } else {
          stream.end(resolve);
        }
      });
    });
  }

  static async appendJSONL(filePath, data) {
    const jsonLine = JSON.stringify(data) + '\n';
    return fs.appendFile(filePath, jsonLine, 'utf8');
  }
}
```

### 3. Resource Monitoring

```javascript
class ResourceMonitor {
  constructor() {
    this.baseline = null;
    this.alerts = [];
  }

  async captureBaseline() {
    this.baseline = {
      memory: process.memoryUsage(),
      fdCount: await this.getFDCount(),
      timestamp: Date.now()
    };
  }

  async checkResources() {
    if (!this.baseline) {
      throw new Error('Baseline not captured');
    }

    const current = {
      memory: process.memoryUsage(),
      fdCount: await this.getFDCount(),
      timestamp: Date.now()
    };

    const memoryGrowth = (current.memory.rss - this.baseline.memory.rss) / this.baseline.memory.rss;
    const fdGrowth = (current.fdCount - this.baseline.fdCount) / this.baseline.fdCount;

    if (memoryGrowth > 0.5) { // 50% growth
      this.alerts.push({
        type: 'memory_growth',
        severity: 'warning',
        value: memoryGrowth,
        threshold: 0.5
      });
    }

    if (fdGrowth > 0.2) { // 20% growth
      this.alerts.push({
        type: 'fd_growth',
        severity: 'warning',
        value: fdGrowth,
        threshold: 0.2
      });
    }

    return { current, alerts: this.alerts };
  }

  async getFDCount() {
    try {
      const files = await fs.readdir(`/proc/${process.pid}/fd`);
      return files.length;
    } catch (error) {
      return 0;
    }
  }
}
```

## Error Recovery Strategy

### 1. Automatic Retry Mechanism

```javascript
class RetryManager {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async executeWithRetry(operation, context = {}) {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === this.maxRetries) {
          throw new Error(`Operation failed after ${this.maxRetries} attempts: ${error.message}`);
        }

        // Exponential backoff with jitter
        const delay = this.baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await this.sleep(delay);

        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2. Stale File Cleanup

```javascript
class CleanupManager {
  constructor(sessionPath, maxAge = 3600000) { // 1 hour default
    this.sessionPath = sessionPath;
    this.maxAge = maxAge;
  }

  async cleanupStaleFiles() {
    const now = Date.now();
    const patterns = [
      'heartbeat-*.json',
      'task-*.json',
      'result-*.json',
      'lock.json'
    ];

    for (const pattern of patterns) {
      await this.cleanupPattern(pattern, now);
    }
  }

  async cleanupPattern(pattern, now) {
    const glob = new Minimatch(pattern);

    try {
      const files = await fs.readdir(this.sessionPath);

      for (const file of files) {
        if (glob.match(file)) {
          const filePath = `${this.sessionPath}/${file}`;
          const stats = await fs.stat(filePath);

          if (now - stats.mtime.getTime() > this.maxAge) {
            await fs.unlink(filePath).catch(() => {});
          }
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}
```

## Usage Example

```javascript
// Coordinator usage
async function runFileBasedStabilityTest() {
  const config = {
    agentCount: 50,
    totalCycles: 96,
    cycleInterval: 300000, // 5 minutes
    taskTimeout: 10000,
    collectionTimeout: 30000,
    heartbeatInterval: 5000
  };

  const coordinator = new FileBasedCoordinator(config);

  try {
    await coordinator.initialize();

    for (let cycle = 1; cycle <= config.totalCycles; cycle++) {
      console.log(`Starting cycle ${cycle}/${config.totalCycles}`);

      // Distribute tasks
      await coordinator.distributeTasks(cycle);

      // Collect results
      const results = await coordinator.collectResults(cycle);

      console.log(`Cycle ${cycle} complete: ${results.resultsCollected}/${results.agentCount} agents responded`);

      // Wait for next cycle
      if (cycle < config.totalCycles) {
        await coordinator.sleep(config.cycleInterval);
      }
    }

  } finally {
    await coordinator.cleanup();
  }
}

// Agent usage
async function startAgent(agentId, sessionPath) {
  const agent = new FileBasedAgent(agentId, sessionPath);

  process.on('SIGINT', async () => {
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
  });

  await agent.start();
}
```

## Monitoring and Observability

### 1. Real-time Metrics Collection

```javascript
class MetricsCollector {
  constructor(sessionPath) {
    this.sessionPath = sessionPath;
    this.metricsPath = `${sessionPath}/monitoring`;
  }

  async collectSystemMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      system: {
        memory: await this.getMemoryInfo(),
        cpu: await this.getCpuInfo(),
        disk: await this.getDiskInfo()
      },
      processes: await this.getProcessInfo()
    };

    await EfficientJSON.appendJSONL(`${this.metricsPath}/system-metrics.jsonl`, metrics);
    return metrics;
  }

  async getMemoryInfo() {
    const { stdout } = await execAsync('free -b');
    const lines = stdout.trim().split('\n');
    const memLine = lines.find(l => l.startsWith('Mem:'));
    const values = memLine.split(/\s+/);

    return {
      total: parseInt(values[1], 10),
      used: parseInt(values[2], 10),
      free: parseInt(values[3], 10),
      available: parseInt(values[6], 10)
    };
  }

  async getCpuInfo() {
    const { stdout } = await execAsync("top -bn1 | grep 'Cpu(s)'");
    const cpuMatch = stdout.match(/(\d+\.?\d*)\s*%us/);

    return {
      userUsage: cpuMatch ? parseFloat(cpuMatch[1]) : 0
    };
  }

  async getDiskInfo() {
    const { stdout } = await execAsync(`df -B1 ${this.sessionPath}`);
    const lines = stdout.trim().split('\n');
    const dataLine = lines[1];
    const values = dataLine.split(/\s+/);

    return {
      total: parseInt(values[1], 10),
      used: parseInt(values[2], 10),
      available: parseInt(values[3], 10)
    };
  }

  async getProcessInfo() {
    const { stdout } = await execAsync(`ps -o pid,ppid,rss,vsz,comm --ppid ${process.pid} --no-headers`);
    const lines = stdout.trim().split('\n');

    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[0], 10),
        ppid: parseInt(parts[1], 10),
        rss: parseInt(parts[2], 10) * 1024, // Convert KB to bytes
        vsz: parseInt(parts[3], 10) * 1024,
        comm: parts.slice(4).join(' ')
      };
    });
  }
}
```

This file-based coordination protocol provides a robust foundation for 50-agent swarm testing in WSL2 environments. It handles concurrent access, provides reliable message delivery, includes comprehensive error recovery, and offers detailed monitoring capabilities.