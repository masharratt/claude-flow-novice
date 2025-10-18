#!/usr/bin/env node

/**
 * Agent Worker Process
 *
 * A minimal Node.js process that participates in agent coordination tests.
 * Responds to coordination messages via /dev/shm file-based messaging.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AgentWorker {
  constructor(agentId, coordinationDir = '/dev/shm/agent-coordination') {
    this.agentId = agentId;
    this.coordinationDir = coordinationDir;
    this.messageDir = path.join(coordinationDir, 'messages');
    this.responseDir = path.join(coordinationDir, 'responses');
    this.statusDir = path.join(coordinationDir, 'status');

    this.isRunning = false;
    this.startTime = Date.now();
    this.coordinationCount = 0;
    this.errorCount = 0;
    this.lastCoordinationTime = 0;

    // Memory tracking
    this.memorySnapshots = [];
    this.maxMemorySnapshots = 100; // Keep last 100 snapshots

    this.setupDirectories();
    this.setupSignalHandlers();
  }

  setupDirectories() {
    [this.coordinationDir, this.messageDir, this.responseDir, this.statusDir].forEach(dir => {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (error) {
        console.error(`[Agent ${this.agentId}] Failed to create directory ${dir}:`, error.message);
        process.exit(1);
      }
    });
  }

  setupSignalHandlers() {
    const gracefulShutdown = (signal) => {
      console.log(`[Agent ${this.agentId}] Received ${signal}, shutting down gracefully...`);
      this.writeStatus('shutdown');
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

    process.on('uncaughtException', (error) => {
      console.error(`[Agent ${this.agentId}] Uncaught exception:`, error);
      this.errorCount++;
      this.writeStatus('error', { error: error.message, stack: error.stack });
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error(`[Agent ${this.agentId}] Unhandled rejection at:`, promise, 'reason:', reason);
      this.errorCount++;
      this.writeStatus('error', { error: reason.toString() });
    });
  }

  takeMemorySnapshot() {
    const memUsage = process.memoryUsage();
    const snapshot = {
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    };

    this.memorySnapshots.push(snapshot);

    // Keep only the last N snapshots to prevent memory growth in the tracking
    if (this.memorySnapshots.length > this.maxMemorySnapshots) {
      this.memorySnapshots.shift();
    }

    return snapshot;
  }

  getMemoryGrowthRate() {
    if (this.memorySnapshots.length < 2) return 0;

    const recent = this.memorySnapshots.slice(-10); // Last 10 snapshots
    const oldest = recent[0];
    const newest = recent[recent.length - 1];

    const timeDiff = newest.timestamp - oldest.timestamp;
    if (timeDiff === 0) return 0;

    const memoryDiff = newest.heapUsed - oldest.heapUsed;
    return (memoryDiff / timeDiff) * 1000; // bytes per second
  }

  async waitForCoordinationMessage() {
    const messageFile = path.join(this.messageDir, `coordination-${this.agentId}.json`);

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        try {
          if (fs.existsSync(messageFile)) {
            clearInterval(checkInterval);
            const messageData = fs.readFileSync(messageFile, 'utf8');
            fs.unlinkSync(messageFile); // Remove message after reading

            const message = JSON.parse(messageData);
            resolve(message);
          }
        } catch (error) {
          clearInterval(checkInterval);
          reject(error);
        }
      }, 100); // Check every 100ms
    });
  }

  async processCoordinationMessage(message) {
    const startTime = Date.now();
    this.coordinationCount++;
    this.lastCoordinationTime = startTime;

    try {
      // Simulate some work based on message type
      let responsePayload = {};

      switch (message.type) {
        case 'ping':
          responsePayload = { pong: true, timestamp: Date.now() };
          break;

        case 'compute':
          // Simulate computational work
          const iterations = message.data?.iterations || 1000;
          let result = 0;
          for (let i = 0; i < iterations; i++) {
            result += Math.random();
          }
          responsePayload = { result, iterations };
          break;

        case 'memory_test':
          // Allocate some memory to test memory tracking
          const testArray = new Array(message.data?.size || 1000).fill(0).map(() => Math.random());
          responsePayload = {
            arrayLength: testArray.length,
            sampleValue: testArray[0]
          };
          // Let GC clean this up
          break;

        default:
          responsePayload = { status: 'unknown_command', command: message.type };
      }

      const processingTime = Date.now() - startTime;
      const memorySnapshot = this.takeMemorySnapshot();
      const memoryGrowthRate = this.getMemoryGrowthRate();

      const response = {
        agentId: this.agentId,
        messageId: message.messageId,
        timestamp: Date.now(),
        processingTime,
        coordinationCount: this.coordinationCount,
        errorCount: this.errorCount,
        uptime: Date.now() - this.startTime,
        memory: memorySnapshot,
        memoryGrowthRate: Math.round(memoryGrowthRate),
        response: responsePayload
      };

      await this.writeResponse(response);
      this.writeStatus('active', {
        lastCoordination: this.lastCoordinationTime,
        coordinationCount: this.coordinationCount,
        processingTime,
        memory: memorySnapshot
      });

      return response;

    } catch (error) {
      this.errorCount++;
      const errorResponse = {
        agentId: this.agentId,
        messageId: message.messageId,
        timestamp: Date.now(),
        error: error.message,
        coordinationCount: this.coordinationCount,
        errorCount: this.errorCount
      };

      await this.writeResponse(errorResponse);
      this.writeStatus('error', { error: error.message });

      throw error;
    }
  }

  async writeResponse(response) {
    const responseFile = path.join(this.responseDir, `response-${this.agentId}-${response.messageId}.json`);

    try {
      fs.writeFileSync(responseFile, JSON.stringify(response, null, 2));
    } catch (error) {
      console.error(`[Agent ${this.agentId}] Failed to write response:`, error.message);
      throw error;
    }
  }

  writeStatus(status, additionalData = {}) {
    const statusFile = path.join(this.statusDir, `agent-${this.agentId}-status.json`);

    const statusData = {
      agentId: this.agentId,
      status,
      timestamp: Date.now(),
      startTime: this.startTime,
      uptime: Date.now() - this.startTime,
      coordinationCount: this.coordinationCount,
      errorCount: this.errorCount,
      lastCoordinationTime: this.lastCoordinationTime,
      memory: process.memoryUsage(),
      pid: process.pid,
      ...additionalData
    };

    try {
      fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
    } catch (error) {
      console.error(`[Agent ${this.agentId}] Failed to write status:`, error.message);
    }
  }

  async start() {
    console.log(`[Agent ${this.agentId}] Starting worker process...`);
    this.isRunning = true;
    this.writeStatus('starting');

    // Initial memory snapshot
    this.takeMemorySnapshot();

    console.log(`[Agent ${this.agentId}] Worker started, waiting for coordination messages...`);
    this.writeStatus('ready');

    // Main coordination loop
    while (this.isRunning) {
      try {
        const message = await this.waitForCoordinationMessage();
        await this.processCoordinationMessage(message);
      } catch (error) {
        console.error(`[Agent ${this.agentId}] Error processing coordination:`, error.message);
        this.errorCount++;
        this.writeStatus('error', { error: error.message });

        // Continue running even after errors
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  stop() {
    console.log(`[Agent ${this.agentId}] Stopping worker...`);
    this.isRunning = false;
    this.writeStatus('stopped');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node agent-worker.js <agent-id> [coordination-dir]');
    process.exit(1);
  }

  const agentId = args[0];
  const coordinationDir = args[1] || '/dev/shm/agent-coordination';

  if (!/^\d+$/.test(agentId)) {
    console.error('Agent ID must be a number');
    process.exit(1);
  }

  const worker = new AgentWorker(parseInt(agentId), coordinationDir);

  worker.start().catch(error => {
    console.error(`[Agent ${agentId}] Fatal error:`, error);
    process.exit(1);
  });
}

export default AgentWorker;