#!/usr/bin/env node

/**
 * Redis Swarm State Performance Testing Script
 *
 * This script tests Redis performance for swarm state operations,
 * ensuring <50ms write operations and support for 1000+ concurrent agents.
 */

import redis from 'redis';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import { createGzip, createGunzip } from 'zlib';
import { promisify } from 'util';

const gzip = promisify(createGzip);
const gunzip = promisify(createGunzip);

// Test configuration
const CONFIG = {
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  test: {
    numSwarms: 10,
    agentsPerSwarm: 100, // Scale up to 1000
    tasksPerSwarm: 50,
    checkpointsPerSwarm: 5,
    memoryEntriesPerAgent: 10,
    concurrentOperations: 50
  },
  thresholds: {
    writeLatency: 50, // ms
    readLatency: 25, // ms
    maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
    targetThroughput: 1000 // ops/second
  }
};

// Performance metrics collector
class PerformanceMetrics {
  constructor() {
    this.metrics = {
      writeOperations: [],
      readOperations: [],
      batchOperations: [],
      compressionOperations: [],
      memoryUsage: [],
      throughput: [],
      errors: []
    };
    this.startTime = performance.now();
  }

  recordWrite(latency, operation) {
    this.metrics.writeOperations.push({
      latency,
      operation,
      timestamp: performance.now() - this.startTime
    });
  }

  recordRead(latency, operation) {
    this.metrics.readOperations.push({
      latency,
      operation,
      timestamp: performance.now() - this.startTime
    });
  }

  recordBatch(latency, operation, count) {
    this.metrics.batchOperations.push({
      latency,
      operation,
      count,
      timestamp: performance.now() - this.startTime
    });
  }

  recordCompression(sizeBefore, sizeAfter, operation) {
    this.metrics.compressionOperations.push({
      sizeBefore,
      sizeAfter,
      compressionRatio: sizeAfter / sizeBefore,
      operation,
      timestamp: performance.now() - this.startTime
    });
  }

  recordMemoryUsage(usage, operation) {
    this.metrics.memoryUsage.push({
      usage,
      operation,
      timestamp: performance.now() - this.startTime
    });
  }

  recordError(error, operation) {
    this.metrics.errors.push({
      error: error.message,
      operation,
      timestamp: performance.now() - this.startTime
    });
  }

  calculateThroughput() {
    const totalTime = (performance.now() - this.startTime) / 1000; // seconds
    const totalOps = this.metrics.writeOperations.length +
                   this.metrics.readOperations.length +
                   this.metrics.batchOperations.reduce((sum, batch) => sum + batch.count, 0);
    return totalOps / totalTime;
  }

  generateReport() {
    const writeLatencies = this.metrics.writeOperations.map(op => op.latency);
    const readLatencies = this.metrics.readOperations.map(op => op.latency);
    const batchLatencies = this.metrics.batchOperations.map(op => op.latency);
    const compressionRatios = this.metrics.compressionOperations.map(op => op.compressionRatio);

    return {
      summary: {
        totalOperations: writeLatencies.length + readLatencies.length,
        totalErrors: this.metrics.errors.length,
        throughput: this.calculateThroughput(),
        duration: (performance.now() - this.startTime) / 1000
      },
      writePerformance: {
        count: writeLatencies.length,
        avgLatency: writeLatencies.reduce((a, b) => a + b, 0) / writeLatencies.length || 0,
        maxLatency: Math.max(...writeLatencies, 0),
        p95Latency: this.percentile(writeLatencies, 95),
        p99Latency: this.percentile(writeLatencies, 99)
      },
      readPerformance: {
        count: readLatencies.length,
        avgLatency: readLatencies.reduce((a, b) => a + b, 0) / readLatencies.length || 0,
        maxLatency: Math.max(...readLatencies, 0),
        p95Latency: this.percentile(readLatencies, 95),
        p99Latency: this.percentile(readLatencies, 99)
      },
      batchPerformance: {
        count: batchLatencies.length,
        avgLatency: batchLatencies.reduce((a, b) => a + b, 0) / batchLatencies.length || 0,
        maxLatency: Math.max(...batchLatencies, 0),
        totalOperations: this.metrics.batchOperations.reduce((sum, batch) => sum + batch.count, 0)
      },
      compression: {
        count: compressionRatios.length,
        avgRatio: compressionRatios.reduce((a, b) => a + b, 0) / compressionRatios.length || 0,
        maxRatio: Math.max(...compressionRatios, 0),
        minRatio: Math.min(...compressionRatios, 1)
      },
      errors: this.metrics.errors
    };
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Data generator for testing
class TestDataGenerator {
  static generateSwarmId() {
    return `swarm_${crypto.randomBytes(8).toString('hex')}`;
  }

  static generateAgentId() {
    return `agent_${crypto.randomBytes(8).toString('hex')}`;
  }

  static generateTaskId() {
    return `task_${crypto.randomBytes(8).toString('hex')}`;
  }

  static generateSwarmState(swarmId, numAgents, numTasks) {
    const agents = {};
    const tasks = {};

    // Generate agents
    for (let i = 0; i < numAgents; i++) {
      const agentId = this.generateAgentId();
      agents[agentId] = {
        id: agentId,
        role: ['coder', 'tester', 'reviewer', 'architect', 'researcher'][Math.floor(Math.random() * 5)],
        type: ['implementer', 'validator', 'coordinator'][Math.floor(Math.random() * 3)],
        status: ['idle', 'active', 'busy', 'completed'][Math.floor(Math.random() * 4)],
        confidence: Math.random(),
        assignedTasks: [],
        completedTasks: [],
        currentTask: null,
        metadata: {
          specialization: 'testing',
          experience: ['junior', 'mid', 'senior', 'expert'][Math.floor(Math.random() * 4)],
          capabilities: ['javascript', 'testing', 'documentation'],
          lastActive: new Date().toISOString(),
          responseTime: Math.floor(Math.random() * 1000)
        }
      };
    }

    // Generate tasks
    for (let i = 0; i < numTasks; i++) {
      const taskId = this.generateTaskId();
      tasks[taskId] = {
        id: taskId,
        title: `Test Task ${i}`,
        description: `Test task description for performance testing`,
        type: ['implementation', 'validation', 'coordination'][Math.floor(Math.random() * 3)],
        status: ['pending', 'in_progress', 'completed'][Math.floor(Math.random() * 3)],
        priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        assignedAgent: null,
        dependencies: [],
        subtasks: [],
        parentTask: null,
        confidence: Math.random(),
        progress: Math.floor(Math.random() * 100),
        estimatedDuration: 3600,
        actualDuration: 0,
        createdAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        result: {},
        artifacts: []
      };
    }

    return {
      swarmId,
      metadata: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        status: 'running',
        strategy: 'development',
        mode: 'mesh',
        confidence: 0.85
      },
      objective: {
        description: 'Performance testing swarm state',
        type: 'testing',
        priority: 'high',
        complexity: 'moderate',
        estimatedDuration: 3600,
        requirements: ['Test Redis performance', 'Validate <50ms writes'],
        constraints: []
      },
      agents,
      tasks,
      phases: {},
      memory: { entries: [], knowledgeBases: {} },
      consensus: {
        currentRound: 0,
        requiredConfidence: 0.90,
        currentConfidence: 0.85,
        status: 'achieving',
        votes: [],
        decision: null
      },
      performance: {
        metrics: {
          totalDuration: 0,
          taskCompletionRate: 0.5,
          agentUtilization: {},
          communicationLatency: 25,
          errorRate: 0.01,
          throughput: 100
        },
        benchmarks: {
          writeLatency: 45,
          readLatency: 20,
          memoryUsage: 1024000,
          stateSize: 512000
        }
      },
      recovery: {
        enabled: true,
        lastCheckpoint: new Date().toISOString(),
        checkpoints: [],
        recoveryAttempts: 0,
        lastRecovery: null
      }
    };
  }

  static generateMemoryEntry(agentId) {
    return {
      id: `mem_${crypto.randomBytes(8).toString('hex')}`,
      agentId,
      type: ['knowledge', 'result', 'state', 'communication'][Math.floor(Math.random() * 4)],
      content: {
        message: 'Test memory entry for performance testing',
        data: new Array(100).fill('test data').join(' ')
      },
      timestamp: new Date().toISOString(),
      metadata: {
        taskId: this.generateTaskId(),
        tags: ['test', 'performance'],
        priority: Math.floor(Math.random() * 10) + 1,
        shareLevel: ['private', 'team', 'public'][Math.floor(Math.random() * 3)]
      }
    };
  }
}

// Compression utilities
class CompressionUtils {
  static async compress(data) {
    const jsonString = JSON.stringify(data);
    const buffer = Buffer.from(jsonString, 'utf-8');
    return await gzip(buffer);
  }

  static async decompress(compressedData) {
    const decompressed = await gunzip(compressedData);
    return JSON.parse(decompressed.toString('utf-8'));
  }
}

// Redis operations wrapper
class RedisSwarmOperations {
  constructor(client, metrics) {
    this.client = client;
    this.metrics = metrics;
  }

  async writeSwarmState(swarmState) {
    const startTime = performance.now();
    try {
      const key = `swarm:${swarmState.swarmId}`;

      // Compress the state
      const uncompressed = JSON.stringify(swarmState);
      const compressed = await CompressionUtils.compress(swarmState);

      // Record compression metrics
      this.metrics.recordCompression(
        uncompressed.length,
        compressed.length,
        'swarm-state-write'
      );

      // Write to Redis with TTL
      await this.client.setEx(key, 3600, compressed);

      const latency = performance.now() - startTime;
      this.metrics.recordWrite(latency, 'swarm-state-write');

      return { success: true, latency };
    } catch (error) {
      this.metrics.recordError(error, 'swarm-state-write');
      throw error;
    }
  }

  async readSwarmState(swarmId) {
    const startTime = performance.now();
    try {
      const key = `swarm:${swarmId}`;
      const compressed = await this.client.get(key);

      if (!compressed) {
        throw new Error(`Swarm state not found: ${swarmId}`);
      }

      // Decompress the state
      const swarmState = await CompressionUtils.decompress(compressed);

      const latency = performance.now() - startTime;
      this.metrics.recordRead(latency, 'swarm-state-read');

      return { swarmState, latency };
    } catch (error) {
      this.metrics.recordError(error, 'swarm-state-read');
      throw error;
    }
  }

  async writeAgentState(swarmId, agentState) {
    const startTime = performance.now();
    try {
      const key = `swarm:${swarmId}:agents:${agentState.id}`;
      await this.client.hSet(key, agentState);
      await this.client.expire(key, 3600);

      const latency = performance.now() - startTime;
      this.metrics.recordWrite(latency, 'agent-state-write');

      return { success: true, latency };
    } catch (error) {
      this.metrics.recordError(error, 'agent-state-write');
      throw error;
    }
  }

  async batchWriteAgentStates(swarmId, agentStates) {
    const startTime = performance.now();
    try {
      const pipeline = this.client.multi();

      for (const agentState of agentStates) {
        const key = `swarm:${swarmId}:agents:${agentState.id}`;
        pipeline.hSet(key, agentState);
        pipeline.expire(key, 3600);
      }

      await pipeline.exec();

      const latency = performance.now() - startTime;
      this.metrics.recordBatch(latency, 'agent-states-batch-write', agentStates.length);

      return { success: true, latency };
    } catch (error) {
      this.metrics.recordError(error, 'agent-states-batch-write');
      throw error;
    }
  }

  async writeMemoryEntry(swarmId, memoryEntry) {
    const startTime = performance.now();
    try {
      const key = `swarm:${swarmId}:memory:${memoryEntry.type}:${memoryEntry.id}`;
      await this.client.hSet(key, memoryEntry);
      await this.client.expire(key, 7200);

      const latency = performance.now() - startTime;
      this.metrics.recordWrite(latency, 'memory-entry-write');

      return { success: true, latency };
    } catch (error) {
      this.metrics.recordError(error, 'memory-entry-write');
      throw error;
    }
  }

  async createRecoveryCheckpoint(swarmId, checkpoint) {
    const startTime = performance.now();
    try {
      const key = `swarm:${swarmId}:recovery:${checkpoint.id}`;

      // Calculate state hash
      const stateHash = crypto.createHash('sha256')
        .update(JSON.stringify(checkpoint))
        .digest('hex');

      checkpoint.stateHash = stateHash;

      await this.client.hSet(key, checkpoint);
      await this.client.expire(key, 604800); // 7 days

      const latency = performance.now() - startTime;
      this.metrics.recordWrite(latency, 'recovery-checkpoint-write');

      return { success: true, latency, stateHash };
    } catch (error) {
      this.metrics.recordError(error, 'recovery-checkpoint-write');
      throw error;
    }
  }

  async getMemoryUsage() {
    try {
      const info = await this.client.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      return memoryMatch ? parseInt(memoryMatch[1]) : 0;
    } catch (error) {
      this.metrics.recordError(error, 'memory-usage-check');
      return 0;
    }
  }
}

// Test suite
class PerformanceTestSuite {
  constructor() {
    this.metrics = new PerformanceMetrics();
    this.client = null;
    this.operations = null;
  }

  async initialize() {
    console.log('🔧 Initializing Redis connection...');
    this.client = redis.createClient(CONFIG.redis);
    await this.client.connect();
    this.operations = new RedisSwarmOperations(this.client, this.metrics);
    console.log('✅ Redis connected');
  }

  async cleanup() {
    console.log('🧹 Cleaning up test data...');
    try {
      // Get all swarm keys and delete them
      const swarmKeys = await this.client.keys('swarm:*');
      if (swarmKeys.length > 0) {
        await this.client.del(swarmKeys);
        console.log(`🗑️  Deleted ${swarmKeys.length} test keys`);
      }
    } catch (error) {
      console.warn('⚠️  Cleanup warning:', error.message);
    }
  }

  async shutdown() {
    if (this.client) {
      await this.client.quit();
      console.log('🔌 Redis connection closed');
    }
  }

  async testSingleSwarmWriteRead() {
    console.log('📝 Testing single swarm write/read operations...');

    const swarmState = TestDataGenerator.generateSwarmState(
      TestDataGenerator.generateSwarmId(),
      CONFIG.test.agentsPerSwarm,
      CONFIG.test.tasksPerSwarm
    );

    // Test write
    const writeResult = await this.operations.writeSwarmState(swarmState);
    console.log(`   ✅ Write: ${writeResult.latency.toFixed(2)}ms`);

    // Test read
    const readResult = await this.operations.readSwarmState(swarmState.swarmId);
    console.log(`   ✅ Read: ${readResult.latency.toFixed(2)}ms`);

    // Verify data integrity
    const integrityCheck = JSON.stringify(swarmState) === JSON.stringify(readResult.swarmState);
    console.log(`   ${integrityCheck ? '✅' : '❌'} Data integrity: ${integrityCheck ? 'PASS' : 'FAIL'}`);

    return writeResult.latency < CONFIG.thresholds.writeLatency &&
           readResult.latency < CONFIG.thresholds.readLatency;
  }

  async testConcurrentSwarmOperations() {
    console.log('⚡ Testing concurrent swarm operations...');

    const promises = [];
    const numSwarms = CONFIG.test.numSwarms;

    for (let i = 0; i < numSwarms; i++) {
      const swarmState = TestDataGenerator.generateSwarmState(
        TestDataGenerator.generateSwarmId(),
        CONFIG.test.agentsPerSwarm,
        CONFIG.test.tasksPerSwarm
      );

      promises.push(this.operations.writeSwarmState(swarmState));
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`   ✅ Successful writes: ${successful}/${numSwarms}`);
    if (failed > 0) {
      console.log(`   ❌ Failed writes: ${failed}/${numSwarms}`);
    }

    // Test concurrent reads
    const readPromises = results
      .filter(r => r.status === 'fulfilled')
      .slice(0, Math.min(5, successful)) // Read up to 5 swarms
      .map(async (result) => {
        const swarmId = result.value.swarmId || TestDataGenerator.generateSwarmId();
        return this.operations.readSwarmState(swarmId);
      });

    const readResults = await Promise.allSettled(readPromises);
    const successfulReads = readResults.filter(r => r.status === 'fulfilled').length;

    console.log(`   ✅ Successful reads: ${successfulReads}/${readPromises.length}`);

    return successful >= numSwarms * 0.9 && successfulReads >= readPromises.length * 0.9;
  }

  async testBatchAgentOperations() {
    console.log('👥 Testing batch agent operations...');

    const swarmId = TestDataGenerator.generateSwarmId();
    const agents = [];

    for (let i = 0; i < CONFIG.test.agentsPerSwarm; i++) {
      agents.push(TestDataGenerator.generateAgentId());
    }

    const agentStates = agents.map(agentId => ({
      id: agentId,
      role: 'tester',
      type: 'implementer',
      status: 'active',
      confidence: 0.9,
      assignedTasks: [],
      completedTasks: [],
      currentTask: null
    }));

    // Test batch write
    const batchResult = await this.operations.batchWriteAgentStates(swarmId, agentStates);
    console.log(`   ✅ Batch write (${agentStates.length} agents): ${batchResult.latency.toFixed(2)}ms`);
    console.log(`   📊 Avg per agent: ${(batchResult.latency / agentStates.length).toFixed(2)}ms`);

    // Test individual reads
    const readPromises = agents.slice(0, 10).map(agentId =>
      this.client.hGetAll(`swarm:${swarmId}:agents:${agentId}`)
    );

    const readResults = await Promise.allSettled(readPromises);
    const successfulReads = readResults.filter(r => r.status === 'fulfilled').length;

    console.log(`   ✅ Individual reads: ${successfulReads}/10`);

    return batchResult.latency < 1000; // 1 second max for batch operations
  }

  async testMemoryOperations() {
    console.log('🧠 Testing memory operations...');

    const swarmId = TestDataGenerator.generateSwarmId();
    const agentId = TestDataGenerator.generateAgentId();
    const memoryEntries = [];

    // Generate memory entries
    for (let i = 0; i < CONFIG.test.memoryEntriesPerAgent; i++) {
      memoryEntries.push(TestDataGenerator.generateMemoryEntry(agentId));
    }

    // Test memory writes
    const writePromises = memoryEntries.map(entry =>
      this.operations.writeMemoryEntry(swarmId, entry)
    );

    const writeResults = await Promise.allSettled(writePromises);
    const successfulWrites = writeResults.filter(r => r.status === 'fulfilled').length;

    console.log(`   ✅ Memory writes: ${successfulWrites}/${memoryEntries.length}`);

    // Calculate memory usage
    const memoryUsage = await this.operations.getMemoryUsage();
    this.metrics.recordMemoryUsage(memoryUsage, 'memory-operations-test');
    console.log(`   💾 Memory usage: ${(memoryUsage / 1024 / 1024).toFixed(2)} MB`);

    return successfulWrites >= memoryEntries.length * 0.9;
  }

  async testRecoveryCheckpoints() {
    console.log('💾 Testing recovery checkpoints...');

    const swarmId = TestDataGenerator.generateSwarmId();
    const checkpoints = [];

    // Generate checkpoints
    for (let i = 0; i < CONFIG.test.checkpointsPerSwarm; i++) {
      checkpoints.push({
        id: `checkpoint_${crypto.randomBytes(8).toString('hex')}`,
        timestamp: new Date().toISOString(),
        phase: `phase_${i}`,
        confidence: 0.85 + (i * 0.02),
        stateHash: ''
      });
    }

    // Test checkpoint writes
    const writePromises = checkpoints.map(checkpoint =>
      this.operations.createRecoveryCheckpoint(swarmId, checkpoint)
    );

    const writeResults = await Promise.allSettled(writePromises);
    const successfulWrites = writeResults.filter(r => r.status === 'fulfilled').length;

    console.log(`   ✅ Checkpoint writes: ${successfulWrites}/${checkpoints.length}`);

    // Verify state hashes
    const validHashes = writeResults
      .filter(r => r.status === 'fulfilled')
      .filter(r => r.value.stateHash && r.value.stateHash.length === 64)
      .length;

    console.log(`   🔐 Valid state hashes: ${validHashes}/${successfulWrites}`);

    return successfulWrites >= checkpoints.length * 0.9;
  }

  async testCompressionEfficiency() {
    console.log('🗜️  Testing compression efficiency...');

    const swarmState = TestDataGenerator.generateSwarmState(
      TestDataGenerator.generateSwarmId(),
      CONFIG.test.agentsPerSwarm,
      CONFIG.test.tasksPerSwarm
    );

    const uncompressed = JSON.stringify(swarmState);
    const compressed = await CompressionUtils.compress(swarmState);

    const compressionRatio = compressed.length / uncompressed.length;
    const spaceSaved = ((1 - compressionRatio) * 100).toFixed(1);

    console.log(`   📊 Uncompressed: ${(uncompressed.length / 1024).toFixed(1)} KB`);
    console.log(`   📊 Compressed: ${(compressed.length / 1024).toFixed(1)} KB`);
    console.log(`   💾 Space saved: ${spaceSaved}%`);

    this.metrics.recordCompression(
      uncompressed.length,
      compressed.length,
      'compression-efficiency-test'
    );

    return compressionRatio < 0.7; // Target: <70% of original size
  }

  async runAllTests() {
    console.log('🚀 Starting Redis Swarm State Performance Tests\n');

    const testResults = {
      singleSwarmWriteRead: false,
      concurrentOperations: false,
      batchAgentOperations: false,
      memoryOperations: false,
      recoveryCheckpoints: false,
      compressionEfficiency: false
    };

    try {
      await this.initialize();

      // Run individual tests
      testResults.singleSwarmWriteRead = await this.testSingleSwarmWriteRead();
      console.log('');

      testResults.concurrentOperations = await this.testConcurrentSwarmOperations();
      console.log('');

      testResults.batchAgentOperations = await this.testBatchAgentOperations();
      console.log('');

      testResults.memoryOperations = await this.testMemoryOperations();
      console.log('');

      testResults.recoveryCheckpoints = await this.testRecoveryCheckpoints();
      console.log('');

      testResults.compressionEfficiency = await this.testCompressionEfficiency();
      console.log('');

      // Generate final report
      const report = this.metrics.generateReport();
      this.printReport(report, testResults);

      return { success: this.evaluateResults(testResults, report), report, testResults };

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    } finally {
      await this.cleanup();
      await this.shutdown();
    }
  }

  printReport(report, testResults) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PERFORMANCE TEST REPORT');
    console.log('='.repeat(60));

    console.log('\n🎯 TEST RESULTS:');
    Object.entries(testResults).forEach(([test, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${test.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    });

    console.log('\n📈 PERFORMANCE METRICS:');
    console.log(`   Total operations: ${report.summary.totalOperations}`);
    console.log(`   Total errors: ${report.summary.totalErrors}`);
    console.log(`   Duration: ${report.summary.duration.toFixed(2)}s`);
    console.log(`   Throughput: ${report.summary.throughput.toFixed(2)} ops/sec`);

    console.log('\n✍️  WRITE PERFORMANCE:');
    console.log(`   Count: ${report.writePerformance.count}`);
    console.log(`   Avg latency: ${report.writePerformance.avgLatency.toFixed(2)}ms`);
    console.log(`   P95 latency: ${report.writePerformance.p95Latency.toFixed(2)}ms`);
    console.log(`   P99 latency: ${report.writePerformance.p99Latency.toFixed(2)}ms`);

    console.log('\n📖 READ PERFORMANCE:');
    console.log(`   Count: ${report.readPerformance.count}`);
    console.log(`   Avg latency: ${report.readPerformance.avgLatency.toFixed(2)}ms`);
    console.log(`   P95 latency: ${report.readPerformance.p95Latency.toFixed(2)}ms`);
    console.log(`   P99 latency: ${report.readPerformance.p99Latency.toFixed(2)}ms`);

    console.log('\n🔄 BATCH PERFORMANCE:');
    console.log(`   Count: ${report.batchPerformance.count}`);
    console.log(`   Avg latency: ${report.batchPerformance.avgLatency.toFixed(2)}ms`);
    console.log(`   Total batch operations: ${report.batchPerformance.totalOperations}`);

    console.log('\n🗜️  COMPRESSION:');
    console.log(`   Count: ${report.compression.count}`);
    console.log(`   Avg compression ratio: ${(report.compression.avgRatio * 100).toFixed(1)}%`);
    console.log(`   Best compression: ${(report.compression.minRatio * 100).toFixed(1)}%`);

    if (report.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      report.errors.slice(0, 5).forEach(error => {
        console.log(`   ${error.operation}: ${error.error}`);
      });
      if (report.errors.length > 5) {
        console.log(`   ... and ${report.errors.length - 5} more errors`);
      }
    }

    console.log('\n' + '='.repeat(60));
  }

  evaluateResults(testResults, report) {
    // Performance thresholds
    const writeLatencyOk = report.writePerformance.avgLatency < CONFIG.thresholds.writeLatency;
    const readLatencyOk = report.readPerformance.avgLatency < CONFIG.thresholds.readLatency;
    const throughputOk = report.summary.throughput > CONFIG.thresholds.targetThroughput;
    const errorRateOk = report.summary.totalErrors === 0;

    const allTestsPassed = Object.values(testResults).every(result => result === true);
    const performanceOk = writeLatencyOk && readLatencyOk && throughputOk && errorRateOk;

    console.log('\n🎯 THRESHOLD EVALUATION:');
    console.log(`   Write latency <${CONFIG.thresholds.writeLatency}ms: ${writeLatencyOk ? '✅' : '❌'} (${report.writePerformance.avgLatency.toFixed(2)}ms)`);
    console.log(`   Read latency <${CONFIG.thresholds.readLatency}ms: ${readLatencyOk ? '✅' : '❌'} (${report.readPerformance.avgLatency.toFixed(2)}ms)`);
    console.log(`   Throughput >${CONFIG.thresholds.targetThroughput} ops/sec: ${throughputOk ? '✅' : '❌'} (${report.summary.throughput.toFixed(2)})`);
    console.log(`   Zero errors: ${errorRateOk ? '✅' : '❌'} (${report.summary.totalErrors} errors)`);
    console.log(`   All tests passed: ${allTestsPassed ? '✅' : '❌'}`);

    return allTestsPassed && performanceOk;
  }
}

// Main execution
async function main() {
  const testSuite = new PerformanceTestSuite();

  try {
    const result = await testSuite.runAllTests();

    if (result.success) {
      console.log('\n🎉 ALL TESTS PASSED! Redis swarm state performance meets requirements.');
      process.exit(0);
    } else {
      console.log('\n❌ SOME TESTS FAILED! Review the report above for details.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Test execution failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PerformanceTestSuite, TestDataGenerator, CompressionUtils, RedisSwarmOperations };