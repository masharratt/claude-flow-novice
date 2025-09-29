/**
 * Stage 3 Integration Validator
 * Comprehensive performance validation of unified system
 * Validates: <100ms P95 spawn time, <5ms P95 communication, >10k concurrent agents
 */

import { performance } from 'perf_hooks';
import { UltraFastAgentManager } from './unified-ultra-fast-agent-manager.js';
import { communicationBus } from '../communication/ultra-fast-communication-bus.js';
import { Logger } from '../core/logger.js';

export interface ValidationScenario {
  name: string;
  description: string;
  agentCount: number;
  messageCount: number;
  taskCount: number;
  duration?: number;
  targets: {
    spawnTimeP95Ms: number;
    communicationP95Ms: number;
    concurrentAgents: number;
    memoryLimitMB: number;
    successRate: number;
  };
}

export interface ValidationResult {
  scenario: string;
  passed: boolean;
  metrics: {
    spawnTimeP95: number;
    communicationP95: number;
    concurrentAgents: number;
    memoryUsage: number;
    successRate: number;
    throughput: number;
  };
  details: {
    totalTime: number;
    agentsSpawned: number;
    messagesSent: number;
    tasksExecuted: number;
    errors: number;
  };
}

export class Stage3IntegrationValidator {
  private logger: Logger;
  private agentManager: UltraFastAgentManager;
  private validationResults: ValidationResult[] = [];

  constructor() {
    this.logger = new Logger(
      { level: 'info', format: 'json', destination: 'console' },
      { component: 'Stage3Validator' }
    );

    this.agentManager = new UltraFastAgentManager({
      performanceTargets: {
        spawnTimeP95Ms: 100,
        communicationP95Ms: 5,
        maxConcurrentAgents: 10000
      }
    });
  }

  async validateStage3(): Promise<{ passed: boolean; results: ValidationResult[] }> {
    this.logger.info('Starting Stage 3 Integration Validation');

    try {
      await this.agentManager.initialize();

      // Define validation scenarios
      const scenarios: ValidationScenario[] = [
        {
          name: 'Baseline Performance',
          description: 'Basic system functionality validation',
          agentCount: 100,
          messageCount: 500,
          taskCount: 200,
          targets: {
            spawnTimeP95Ms: 80,
            communicationP95Ms: 3,
            concurrentAgents: 100,
            memoryLimitMB: 200,
            successRate: 0.95
          }
        },
        {
          name: 'High Concurrency',
          description: 'Test system with 1000+ concurrent agents',
          agentCount: 1000,
          messageCount: 5000,
          taskCount: 2000,
          targets: {
            spawnTimeP95Ms: 100,
            communicationP95Ms: 5,
            concurrentAgents: 1000,
            memoryLimitMB: 500,
            successRate: 0.90
          }
        },
        {
          name: 'Peak Load',
          description: 'Maximum system capacity test',
          agentCount: 5000,
          messageCount: 25000,
          taskCount: 10000,
          targets: {
            spawnTimeP95Ms: 150,
            communicationP95Ms: 8,
            concurrentAgents: 5000,
            memoryLimitMB: 1000,
            successRate: 0.85
          }
        },
        {
          name: 'Ultra High Load',
          description: 'Stress test with 10k+ agents',
          agentCount: 10000,
          messageCount: 50000,
          taskCount: 20000,
          targets: {
            spawnTimeP95Ms: 200,
            communicationP95Ms: 10,
            concurrentAgents: 10000,
            memoryLimitMB: 2000,
            successRate: 0.80
          }
        },
        {
          name: 'Sustained Load',
          description: 'Long-duration stability test',
          agentCount: 2000,
          messageCount: 10000,
          taskCount: 5000,
          duration: 60000, // 60 seconds
          targets: {
            spawnTimeP95Ms: 120,
            communicationP95Ms: 6,
            concurrentAgents: 2000,
            memoryLimitMB: 800,
            successRate: 0.88
          }
        },
        {
          name: 'Communication Intensive',
          description: 'High message throughput validation',
          agentCount: 500,
          messageCount: 50000,
          taskCount: 1000,
          targets: {
            spawnTimeP95Ms: 100,
            communicationP95Ms: 4,
            concurrentAgents: 500,
            memoryLimitMB: 400,
            successRate: 0.92
          }
        },
        {
          name: 'Task Execution Heavy',
          description: 'High task throughput validation',
          agentCount: 1000,
          messageCount: 2000,
          taskCount: 25000,
          targets: {
            spawnTimeP95Ms: 100,
            communicationP95Ms: 5,
            concurrentAgents: 1000,
            memoryLimitMB: 600,
            successRate: 0.90
          }
        }
      ];

      // Execute validation scenarios
      for (const scenario of scenarios) {
        this.logger.info(`Executing validation scenario: ${scenario.name}`);
        const result = await this.executeValidationScenario(scenario);
        this.validationResults.push(result);
        
        this.logger.info(`Scenario ${scenario.name}: ${result.passed ? 'PASSED' : 'FAILED'}`, {
          metrics: result.metrics
        });

        // Brief pause between scenarios
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.cleanupScenario();
      }

      const overallPassed = this.validationResults.every(r => r.passed);
      
      this.logger.info(`Stage 3 Integration Validation Complete: ${overallPassed ? 'PASSED' : 'FAILED'}`);
      this.logValidationSummary();

      return {
        passed: overallPassed,
        results: this.validationResults
      };

    } finally {
      await this.agentManager.shutdown();
    }
  }

  private async executeValidationScenario(scenario: ValidationScenario): Promise<ValidationResult> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    const results = {
      spawnTimes: [] as number[],
      messageTimes: [] as number[],
      taskTimes: [] as number[],
      agentsSpawned: 0,
      messagesSent: 0,
      tasksExecuted: 0,
      errors: 0,
      peakMemoryUsage: startMemory
    };

    try {
      // Phase 1: Agent Spawning
      await this.executeAgentSpawning(scenario, results);
      
      // Phase 2: Message Communication
      await this.executeMessageCommunication(scenario, results);
      
      // Phase 3: Task Execution
      await this.executeTaskExecution(scenario, results);
      
      // Phase 4: Sustained Load (if duration specified)
      if (scenario.duration) {
        await this.executeSustainedLoad(scenario, results);
      }

      // Calculate final metrics
      const totalTime = performance.now() - startTime;
      const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      results.peakMemoryUsage = Math.max(results.peakMemoryUsage, endMemory);

      // Calculate P95 metrics
      const sortedSpawnTimes = results.spawnTimes.sort((a, b) => a - b);
      const sortedMessageTimes = results.messageTimes.sort((a, b) => a - b);
      
      const spawnTimeP95 = sortedSpawnTimes[Math.floor(sortedSpawnTimes.length * 0.95)] || 0;
      const communicationP95 = sortedMessageTimes[Math.floor(sortedMessageTimes.length * 0.95)] || 0;
      
      const successfulOps = results.agentsSpawned + results.messagesSent + results.tasksExecuted;
      const totalOps = scenario.agentCount + scenario.messageCount + scenario.taskCount;
      const successRate = totalOps > 0 ? successfulOps / totalOps : 0;

      const metrics = {
        spawnTimeP95,
        communicationP95,
        concurrentAgents: this.agentManager.getSystemMetrics().totalAgents,
        memoryUsage: results.peakMemoryUsage,
        successRate,
        throughput: successfulOps / (totalTime / 1000) // ops per second
      };

      // Validate against targets
      const passed = this.validateMetricsAgainstTargets(metrics, scenario.targets);

      return {
        scenario: scenario.name,
        passed,
        metrics,
        details: {
          totalTime,
          agentsSpawned: results.agentsSpawned,
          messagesSent: results.messagesSent,
          tasksExecuted: results.tasksExecuted,
          errors: results.errors
        }
      };

    } catch (error) {
      this.logger.error(`Scenario ${scenario.name} failed with error`, {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        scenario: scenario.name,
        passed: false,
        metrics: {
          spawnTimeP95: 0,
          communicationP95: 0,
          concurrentAgents: 0,
          memoryUsage: 0,
          successRate: 0,
          throughput: 0
        },
        details: {
          totalTime: performance.now() - startTime,
          agentsSpawned: results.agentsSpawned,
          messagesSent: results.messagesSent,
          tasksExecuted: results.tasksExecuted,
          errors: results.errors + 1
        }
      };
    }
  }

  private async executeAgentSpawning(scenario: ValidationScenario, results: any): Promise<void> {
    const agentPromises = [];
    const batchSize = 50;
    
    for (let i = 0; i < scenario.agentCount; i += batchSize) {
      const batch = [];
      const currentBatchSize = Math.min(batchSize, scenario.agentCount - i);
      
      for (let j = 0; j < currentBatchSize; j++) {
        const agentId = `validation-agent-${i + j}`;
        const agentType = this.getRandomAgentType();
        
        const spawnStart = performance.now();
        const promise = this.agentManager.spawnAgent({
          id: agentId,
          type: agentType,
          config: { scenario: scenario.name }
        }).then(() => {
          const spawnTime = performance.now() - spawnStart;
          results.spawnTimes.push(spawnTime);
          results.agentsSpawned++;
        }).catch(() => {
          results.errors++;
        });
        
        batch.push(promise);
      }
      
      await Promise.allSettled(batch);
      
      // Update memory tracking
      const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      results.peakMemoryUsage = Math.max(results.peakMemoryUsage, currentMemory);
      
      // Small delay between batches
      if (i + batchSize < scenario.agentCount) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }

  private async executeMessageCommunication(scenario: ValidationScenario, results: any): Promise<void> {
    const systemMetrics = this.agentManager.getSystemMetrics();
    const availableAgents = systemMetrics.totalAgents;
    
    if (availableAgents < 2) {
      this.logger.warn('Not enough agents for message communication test');
      return;
    }

    const messagePromises = [];
    const batchSize = 100;
    
    for (let i = 0; i < scenario.messageCount; i += batchSize) {
      const batch = [];
      const currentBatchSize = Math.min(batchSize, scenario.messageCount - i);
      
      for (let j = 0; j < currentBatchSize; j++) {
        const messageStart = performance.now();
        const promise = this.agentManager.sendMessage({
          from: `validation-agent-${Math.floor(Math.random() * availableAgents)}`,
          to: `validation-agent-${Math.floor(Math.random() * availableAgents)}`,
          type: 'validation-message',
          data: { messageId: i + j, scenario: scenario.name }
        }).then((result) => {
          if (result.success) {
            const messageTime = performance.now() - messageStart;
            results.messageTimes.push(messageTime);
            results.messagesSent++;
          } else {
            results.errors++;
          }
        }).catch(() => {
          results.errors++;
        });
        
        batch.push(promise);
      }
      
      await Promise.allSettled(batch);
      
      // Small delay between batches
      if (i + batchSize < scenario.messageCount) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
  }

  private async executeTaskExecution(scenario: ValidationScenario, results: any): Promise<void> {
    const systemMetrics = this.agentManager.getSystemMetrics();
    const availableAgents = systemMetrics.totalAgents;
    
    if (availableAgents === 0) {
      this.logger.warn('No agents available for task execution test');
      return;
    }

    const taskPromises = [];
    const batchSize = 25;
    
    for (let i = 0; i < scenario.taskCount; i += batchSize) {
      const batch = [];
      const currentBatchSize = Math.min(batchSize, scenario.taskCount - i);
      
      for (let j = 0; j < currentBatchSize; j++) {
        const taskStart = performance.now();
        const promise = this.agentManager.executeTask({
          id: `validation-task-${i + j}`,
          type: 'validation-computation',
          agentId: `validation-agent-${Math.floor(Math.random() * availableAgents)}`,
          data: { taskId: i + j, scenario: scenario.name },
          timeout: 10000
        }).then((result) => {
          if (result.success) {
            const taskTime = performance.now() - taskStart;
            results.taskTimes.push(taskTime);
            results.tasksExecuted++;
          } else {
            results.errors++;
          }
        }).catch(() => {
          results.errors++;
        });
        
        batch.push(promise);
      }
      
      await Promise.allSettled(batch);
      
      // Small delay between batches
      if (i + batchSize < scenario.taskCount) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
  }

  private async executeSustainedLoad(scenario: ValidationScenario, results: any): Promise<void> {
    const startTime = Date.now();
    const endTime = startTime + (scenario.duration || 60000);
    
    let operationCount = 0;
    
    while (Date.now() < endTime) {
      const operations = [];
      
      // Mixed operations
      if (operationCount % 10 === 0) {
        // Spawn new agent
        const agentId = `sustained-agent-${operationCount}`;
        operations.push(
          this.agentManager.spawnAgent({
            id: agentId,
            type: this.getRandomAgentType(),
            config: { sustained: true }
          }).then(() => {
            results.agentsSpawned++;
          }).catch(() => {
            results.errors++;
          })
        );
      }
      
      if (operationCount % 3 === 0) {
        // Send message
        const systemMetrics = this.agentManager.getSystemMetrics();
        if (systemMetrics.totalAgents > 1) {
          operations.push(
            this.agentManager.sendMessage({
              from: `validation-agent-${Math.floor(Math.random() * systemMetrics.totalAgents)}`,
              to: `validation-agent-${Math.floor(Math.random() * systemMetrics.totalAgents)}`,
              type: 'sustained-message',
              data: { operationCount }
            }).then((result) => {
              if (result.success) {
                results.messagesSent++;
              } else {
                results.errors++;
              }
            }).catch(() => {
              results.errors++;
            })
          );
        }
      }
      
      if (operationCount % 5 === 0) {
        // Execute task
        const systemMetrics = this.agentManager.getSystemMetrics();
        if (systemMetrics.totalAgents > 0) {
          operations.push(
            this.agentManager.executeTask({
              id: `sustained-task-${operationCount}`,
              type: 'sustained-computation',
              agentId: `validation-agent-${Math.floor(Math.random() * systemMetrics.totalAgents)}`,
              data: { operationCount },
              timeout: 5000
            }).then((result) => {
              if (result.success) {
                results.tasksExecuted++;
              } else {
                results.errors++;
              }
            }).catch(() => {
              results.errors++;
            })
          );
        }
      }
      
      await Promise.allSettled(operations);
      operationCount++;
      
      // Control operation rate
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  private validateMetricsAgainstTargets(metrics: any, targets: any): boolean {
    return (
      metrics.spawnTimeP95 <= targets.spawnTimeP95Ms &&
      metrics.communicationP95 <= targets.communicationP95Ms &&
      metrics.concurrentAgents <= targets.concurrentAgents &&
      metrics.memoryUsage <= targets.memoryLimitMB &&
      metrics.successRate >= targets.successRate
    );
  }

  private async cleanupScenario(): Promise<void> {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Brief pause for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private getRandomAgentType(): 'coordinator' | 'researcher' | 'coder' | 'tester' | 'reviewer' | 'analyst' {
    const types = ['coordinator', 'researcher', 'coder', 'tester', 'reviewer', 'analyst'] as const;
    return types[Math.floor(Math.random() * types.length)];
  }

  private logValidationSummary(): void {
    const passedCount = this.validationResults.filter(r => r.passed).length;
    const totalCount = this.validationResults.length;
    
    console.log('\n🎯 Stage 3 Integration Validation Summary');
    console.log('==========================================');
    console.log(`Overall Result: ${passedCount}/${totalCount} scenarios passed`);
    console.log(`Success Rate: ${((passedCount / totalCount) * 100).toFixed(1)}%`);
    console.log('');
    
    this.validationResults.forEach((result, index) => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${index + 1}. ${result.scenario}: ${status}`);
      console.log(`   Spawn Time P95: ${result.metrics.spawnTimeP95.toFixed(2)}ms`);
      console.log(`   Communication P95: ${result.metrics.communicationP95.toFixed(2)}ms`);
      console.log(`   Concurrent Agents: ${result.metrics.concurrentAgents}`);
      console.log(`   Memory Usage: ${result.metrics.memoryUsage.toFixed(2)}MB`);
      console.log(`   Success Rate: ${(result.metrics.successRate * 100).toFixed(1)}%`);
      console.log(`   Throughput: ${result.metrics.throughput.toFixed(0)} ops/sec`);
      console.log('');
    });
  }

  getValidationResults(): ValidationResult[] {
    return [...this.validationResults];
  }
}

// Export singleton for easy access
export const stage3Validator = new Stage3IntegrationValidator();