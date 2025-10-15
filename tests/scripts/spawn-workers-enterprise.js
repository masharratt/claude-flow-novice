#!/usr/bin/env node

/**
 * Enterprise Worker Spawning CLI
 * Enhanced version for enterprise-grade worker coordination
 * Supports 6 workers, extended monitoring, and comprehensive logging
 */

const { spawn } = require('child_process');
const Redis = require('ioredis');
const fs = require('fs').promises;
const path = require('path');

class EnterpriseWorkerSpawner {
  constructor(options = {}) {
    this.taskDescription = options.taskDescription || '';
    this.maxAgents = options.maxAgents || 6;
    this.provider = options.provider || 'zai';
    this.redisChannel = options.redisChannel || 'swarm:enterprise';
    this.timeout = options.timeout || 45 * 60 * 1000; // 45 minutes for enterprise
    this.workers = [];
    this.redis = null;
    this.startTime = Date.now();
    this.telemetry = {
      spawned: 0,
      completed: 0,
      failed: 0,
      tokensUsed: 0,
      cost: 0
    };
  }

  async initialize() {
    try {
      // Initialize Redis connection
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
      });

      // Create enterprise log directory
      await fs.mkdir('logs/enterprise', { recursive: true });
      
      console.log(`🏢 Enterprise Worker Spawner initialized`);
      console.log(`📋 Task: ${this.taskDescription}`);
      console.log(`👥 Max Agents: ${this.maxAgents}`);
      console.log(`🔌 Provider: ${this.provider}`);
      console.log(`📡 Redis Channel: ${this.redisChannel}`);
      console.log(`⏱️ Timeout: ${this.timeout / 60000} minutes`);
    } catch (error) {
      console.error('❌ Failed to initialize enterprise spawner:', error);
      throw error;
    }
  }

  async spawnWorkers() {
    console.log(`🚀 Spawning ${this.maxAgents} enterprise workers...`);
    
    // Parse task description for worker assignments
    const workerAssignments = this.parseTaskDescription(this.taskDescription);
    
    // Spawn workers with enterprise configuration
    for (let i = 0; i < this.maxAgents; i++) {
      const workerId = `enterprise-worker-${i + 1}`;
      const assignment = workerAssignments[i] || { task: `Enterprise task ${i + 1}`, files: [] };
      
      const worker = await this.spawnSingleWorker(workerId, assignment);
      this.workers.push(worker);
      
      // Enterprise delay between spawns (2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`✅ All ${this.maxAgents} enterprise workers spawned`);
    return this.workers;
  }

  parseTaskDescription(taskDescription) {
    // Parse enterprise task assignments
    // Format: "Enterprise: task1 (worker-1), task2 (worker-2), ..."
    const assignments = [];
    const pattern = /\(([^)]+)\)/g;
    let match;
    
    while ((match = pattern.exec(taskDescription)) !== null) {
      const workerInfo = match[1];
      const [taskId, workerId] = workerInfo.split('-').map(s => s.trim());
      assignments.push({
        taskId,
        workerId: workerId || `enterprise-worker-${assignments.length + 1}`,
        task: `Enterprise ${taskId} implementation`
      });
    }
    
    return assignments;
  }

  async spawnSingleWorker(workerId, assignment) {
    const worker = {
      id: workerId,
      assignment,
      process: null,
      startTime: Date.now(),
      status: 'spawning',
      result: null,
      telemetry: {
        tokensUsed: 0,
        toolCalls: 0,
        filesModified: 0
      }
    };

    try {
      // Enhanced enterprise worker command
      const workerCommand = `node src/cli/hybrid-routing/spawn-workers.js "${assignment.task}" --agent-id ${workerId} --provider ${this.provider} --enterprise-mode --redis-channel ${this.redisChannel}`;
      
      console.log(`🔧 Spawning enterprise worker: ${workerId} for task: ${assignment.task}`);
      
      worker.process = spawn(workerCommand, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          WORKER_ID: workerId,
          ENTERPRISE_MODE: 'true',
          REDIS_CHANNEL: this.redisChannel
        }
      });

      // Set up enterprise monitoring
      this.setupWorkerMonitoring(worker);
      
      worker.status = 'running';
      this.telemetry.spawned++;
      
      return worker;
    } catch (error) {
      console.error(`❌ Failed to spawn enterprise worker ${workerId}:`, error);
      worker.status = 'failed';
      worker.error = error.message;
      this.telemetry.failed++;
      throw error;
    }
  }

  setupWorkerMonitoring(worker) {
    let output = '';
    let errorOutput = '';
    
    // Capture stdout
    worker.process.stdout.on('data', (data) => {
      output += data.toString();
      
      // Parse enterprise telemetry from output
      this.parseWorkerTelemetry(worker, data.toString());
      
      // Log to enterprise log file
      this.logWorkerOutput(worker.id, 'stdout', data.toString());
    });
    
    // Capture stderr
    worker.process.stderr.on('data', (data) => {
      errorOutput += data.toString();
      this.logWorkerOutput(worker.id, 'stderr', data.toString());
    });
    
    // Handle worker completion
    worker.process.on('close', (code) => {
      worker.endTime = Date.now();
      worker.duration = worker.endTime - worker.startTime;
      
      if (code === 0) {
        worker.status = 'completed';
        worker.result = { output, success: true };
        this.telemetry.completed++;
        
        // Publish enterprise completion event
        this.publishWorkerCompletion(worker);
        
        console.log(`✅ Enterprise worker ${worker.id} completed in ${worker.duration / 1000}s`);
      } else {
        worker.status = 'failed';
        worker.result = { output, errorOutput, success: false, exitCode: code };
        this.telemetry.failed++;
        
        console.error(`❌ Enterprise worker ${worker.id} failed with code ${code}`);
      }
      
      // Check if all workers are complete
      this.checkAllWorkersComplete();
    });
    
    // Handle worker errors
    worker.process.on('error', (error) => {
      worker.status = 'failed';
      worker.error = error.message;
      this.telemetry.failed++;
      console.error(`❌ Enterprise worker ${worker.id} error:`, error);
    });
  }

  parseWorkerTelemetry(worker, output) {
    // Parse enterprise telemetry patterns
    const tokenPattern = /Tokens used: (\d+)/;
    const toolCallPattern = /Tool calls: (\d+)/;
    const filePattern = /Files modified: (\d+)/;
    
    const tokenMatch = output.match(tokenPattern);
    if (tokenMatch) {
      worker.telemetry.tokensUsed = parseInt(tokenMatch[1]);
      this.telemetry.tokensUsed += worker.telemetry.tokensUsed;
    }
    
    const toolCallMatch = output.match(toolCallPattern);
    if (toolCallMatch) {
      worker.telemetry.toolCalls = parseInt(toolCallMatch[1]);
    }
    
    const fileMatch = output.match(filePattern);
    if (fileMatch) {
      worker.telemetry.filesModified = parseInt(fileMatch[1]);
    }
  }

  async logWorkerOutput(workerId, stream, data) {
    const timestamp = new Date().toISOString();
    const logFile = path.join('logs/enterprise', `${workerId}-${timestamp.split('T')[0]}.log`);
    
    const logEntry = `[${timestamp}] [${stream.toUpperCase()}] ${data}`;
    await fs.appendFile(logFile, logEntry);
  }

  async publishWorkerCompletion(worker) {
    if (!this.redis) return;
    
    const completionEvent = {
      workerId: worker.id,
      status: worker.status,
      duration: worker.duration,
      telemetry: worker.telemetry,
      assignment: worker.assignment,
      timestamp: Date.now(),
      enterprise: true
    };
    
    await this.redis.publish(`${this.redisChannel}:complete`, JSON.stringify(completionEvent));
    await this.redis.publish(`${this.redisChannel}:${worker.id}:status`, JSON.stringify(completionEvent));
  }

  checkAllWorkersComplete() {
    const completed = this.workers.filter(w => w.status === 'completed' || w.status === 'failed').length;
    
    if (completed === this.workers.length) {
      this.allWorkersComplete();
    }
  }

  async allWorkersComplete() {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;
    
    // Calculate enterprise cost (z.ai rate: $0.50/1M tokens)
    this.telemetry.cost = (this.telemetry.tokensUsed / 1000000) * 0.50;
    
    // Generate enterprise summary
    const summary = {
      mode: 'enterprise',
      workers: this.workers.length,
      completed: this.telemetry.completed,
      failed: this.telemetry.failed,
      totalDuration,
      tokensUsed: this.telemetry.tokensUsed,
      cost: this.telemetry.cost,
      savings: this.calculateSavings(),
      timestamp: endTime
    };
    
    console.log('\n🏢 Enterprise Worker Spawning Complete');
    console.log('=' .repeat(60));
    console.log(`✅ Completed: ${this.telemetry.completed}/${this.workers.length}`);
    console.log(`❌ Failed: ${this.telemetry.failed}/${this.workers.length}`);
    console.log(`⏱️ Total Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);
    console.log(`🔤 Total Tokens: ${this.telemetry.tokensUsed.toLocaleString()}`);
    console.log(`💰 Total Cost: $${this.telemetry.cost.toFixed(4)}`);
    console.log(`💸 Savings vs Claude: ${this.calculateSavings()}%`);
    console.log('=' .repeat(60));
    
    // Publish enterprise swarm completion
    await this.publishSwarmCompletion(summary);
    
    // Write enterprise telemetry file
    await this.writeEnterpriseTelemetry(summary);
    
    // Cleanup
    await this.cleanup();
  }

  calculateSavings() {
    // Claude rate: $15/1M tokens, z.ai rate: $0.50/1M tokens
    const claudeCost = (this.telemetry.tokensUsed / 1000000) * 15;
    const savings = ((claudeCost - this.telemetry.cost) / claudeCost) * 100;
    return savings.toFixed(1);
  }

  async publishSwarmCompletion(summary) {
    if (!this.redis) return;
    
    await this.redis.publish(`${this.redisChannel}:swarm-complete`, JSON.stringify(summary));
  }

  async writeEnterpriseTelemetry(summary) {
    const telemetryFile = `telemetry/enterprise-${Date.now()}.json`;
    await fs.mkdir('telemetry', { recursive: true });
    await fs.writeFile(telemetryFile, JSON.stringify(summary, null, 2));
    console.log(`📊 Enterprise telemetry written to: ${telemetryFile}`);
  }

  async cleanup() {
    if (this.redis) {
      await this.redis.quit();
    }
    
    // Kill any remaining worker processes
    this.workers.forEach(worker => {
      if (worker.process && !worker.process.killed) {
        worker.process.kill();
      }
    });
  }

  async run() {
    try {
      await this.initialize();
      await this.spawnWorkers();
      
      // Set timeout for enterprise operations
      setTimeout(async () => {
        const running = this.workers.filter(w => w.status === 'running').length;
        if (running > 0) {
          console.log(`⏰ Enterprise timeout reached, ${running} workers still running`);
          await this.cleanup();
          process.exit(1);
        }
      }, this.timeout);
      
    } catch (error) {
      console.error('❌ Enterprise worker spawning failed:', error);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const taskDescription = args[0] || '';
  
  const options = {
    taskDescription,
    maxAgents: parseInt(args.find(arg => arg.startsWith('--max-agents='))?.split('=')[1]) || 6,
    provider: args.find(arg => arg.startsWith('--provider='))?.split('=')[1] || 'zai',
    redisChannel: args.find(arg => arg.startsWith('--redis-channel='))?.split('=')[1] || 'swarm:enterprise'
  };
  
  const spawner = new EnterpriseWorkerSpawner(options);
  await spawner.run();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = EnterpriseWorkerSpawner;