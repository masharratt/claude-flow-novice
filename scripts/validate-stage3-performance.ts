#!/usr/bin/env tsx
/**
 * Stage 3 Performance Validation Script
 * CLI tool to validate unified system performance targets
 */

import { performance } from 'perf_hooks';
import { stage3Validator } from '../src/agents/stage3-integration-validator.js';

interface CliOptions {
  scenario?: string;
  verbose?: boolean;
  output?: 'console' | 'json' | 'csv';
  timeout?: number;
  help?: boolean;
}

class Stage3PerformanceCLI {
  private options: CliOptions = {};

  constructor() {
    this.parseArguments();
  }

  private parseArguments(): void {
    const args = process.argv.slice(2);
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--help':
        case '-h':
          this.options.help = true;
          break;
          
        case '--verbose':
        case '-v':
          this.options.verbose = true;
          break;
          
        case '--scenario':
        case '-s':
          this.options.scenario = args[++i];
          break;
          
        case '--output':
        case '-o':
          this.options.output = args[++i] as 'console' | 'json' | 'csv';
          break;
          
        case '--timeout':
        case '-t':
          this.options.timeout = parseInt(args[++i], 10);
          break;
          
        default:
          console.warn(`Unknown option: ${arg}`);
      }
    }
  }

  private showHelp(): void {
    console.log(`
🎯 Stage 3 Performance Validation Tool

Usage: tsx scripts/validate-stage3-performance.ts [options]

Options:
  -h, --help           Show this help message
  -v, --verbose        Enable verbose output
  -s, --scenario NAME  Run specific scenario only
  -o, --output FORMAT  Output format: console, json, csv (default: console)
  -t, --timeout MS     Set timeout in milliseconds (default: 300000)

Scenarios:
  - Baseline Performance       (100 agents, 500 messages, 200 tasks)
  - High Concurrency          (1000 agents, 5000 messages, 2000 tasks)
  - Peak Load                 (5000 agents, 25000 messages, 10000 tasks)
  - Ultra High Load           (10000 agents, 50000 messages, 20000 tasks)
  - Sustained Load            (2000 agents + 60s duration)
  - Communication Intensive    (500 agents, 50000 messages)
  - Task Execution Heavy      (1000 agents, 25000 tasks)

Performance Targets:
  ✅ Agent spawn time: <100ms P95
  ✅ Communication latency: <5ms P95
  ✅ Concurrent agents: Up to 10,000
  ✅ Memory usage: <2GB peak
  ✅ Success rate: >80%

Examples:
  tsx scripts/validate-stage3-performance.ts --verbose
  tsx scripts/validate-stage3-performance.ts --scenario "High Concurrency"
  tsx scripts/validate-stage3-performance.ts --output json > results.json
    `);
  }

  async run(): Promise<void> {
    if (this.options.help) {
      this.showHelp();
      return;
    }

    console.log('🚀 Starting Stage 3 Performance Validation');
    console.log('==========================================');
    
    if (this.options.verbose) {
      console.log('Configuration:');
      console.log(`  Scenario filter: ${this.options.scenario || 'all'}`);
      console.log(`  Output format: ${this.options.output || 'console'}`);
      console.log(`  Timeout: ${this.options.timeout || 300000}ms`);
      console.log('');
    }

    try {
      const startTime = performance.now();
      
      if (this.options.scenario) {
        await this.runSpecificScenario(this.options.scenario);
      } else {
        await this.runFullValidation();
      }
      
      const totalTime = performance.now() - startTime;
      
      if (this.options.verbose) {
        console.log(`\n⏱️  Total validation time: ${(totalTime / 1000).toFixed(2)}s`);
      }
      
    } catch (error) {
      console.error('❌ Validation failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async runFullValidation(): Promise<void> {
    const result = await stage3Validator.validateStage3();
    
    this.outputResults(result.results);
    
    if (result.passed) {
      console.log('\n🎉 STAGE 3 VALIDATION: PASSED');
      console.log('All performance targets met!');
      process.exit(0);
    } else {
      console.log('\n❌ STAGE 3 VALIDATION: FAILED');
      console.log('Some performance targets not met.');
      process.exit(1);
    }
  }

  private async runSpecificScenario(scenarioName: string): Promise<void> {
    // Create a test scenario based on the name
    const scenarios = {
      'Baseline Performance': {
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
      'High Concurrency': {
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
      'Peak Load': {
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
      'Ultra High Load': {
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
      }
    };

    const scenario = scenarios[scenarioName as keyof typeof scenarios];
    if (!scenario) {
      console.error(`❌ Unknown scenario: ${scenarioName}`);
      console.log('Available scenarios:', Object.keys(scenarios).join(', '));
      process.exit(1);
    }

    console.log(`🎯 Running scenario: ${scenario.name}`);
    console.log(`📝 ${scenario.description}`);
    console.log(`📊 ${scenario.agentCount} agents, ${scenario.messageCount} messages, ${scenario.taskCount} tasks\n`);

    // Initialize validator and run scenario
    const validator = stage3Validator;
    await (validator as any).agentManager.initialize();
    
    try {
      const result = await (validator as any).executeValidationScenario(scenario);
      this.outputResults([result]);
      
      if (result.passed) {
        console.log(`\n✅ Scenario "${scenarioName}": PASSED`);
        process.exit(0);
      } else {
        console.log(`\n❌ Scenario "${scenarioName}": FAILED`);
        process.exit(1);
      }
    } finally {
      await (validator as any).agentManager.shutdown();
    }
  }

  private outputResults(results: any[]): void {
    switch (this.options.output) {
      case 'json':
        this.outputJSON(results);
        break;
      case 'csv':
        this.outputCSV(results);
        break;
      default:
        this.outputConsole(results);
    }
  }

  private outputConsole(results: any[]): void {
    console.log('\n📊 Performance Validation Results');
    console.log('================================');
    
    results.forEach((result, index) => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const statusIcon = result.passed ? '🟢' : '🔴';
      
      console.log(`\n${statusIcon} ${index + 1}. ${result.scenario}: ${status}`);
      
      if (this.options.verbose) {
        console.log(`   Description: ${result.scenario}`);
        console.log(`   Duration: ${(result.details.totalTime / 1000).toFixed(2)}s`);
      }
      
      // Performance metrics
      console.log(`   📈 Performance Metrics:`);
      console.log(`      Spawn Time P95: ${result.metrics.spawnTimeP95.toFixed(2)}ms`);
      console.log(`      Communication P95: ${result.metrics.communicationP95.toFixed(2)}ms`);
      console.log(`      Concurrent Agents: ${result.metrics.concurrentAgents.toLocaleString()}`);
      console.log(`      Memory Usage: ${result.metrics.memoryUsage.toFixed(2)}MB`);
      console.log(`      Success Rate: ${(result.metrics.successRate * 100).toFixed(1)}%`);
      console.log(`      Throughput: ${result.metrics.throughput.toFixed(0)} ops/sec`);
      
      // Operation details
      if (this.options.verbose) {
        console.log(`   🔧 Operation Details:`);
        console.log(`      Agents Spawned: ${result.details.agentsSpawned.toLocaleString()}`);
        console.log(`      Messages Sent: ${result.details.messagesSent.toLocaleString()}`);
        console.log(`      Tasks Executed: ${result.details.tasksExecuted.toLocaleString()}`);
        console.log(`      Errors: ${result.details.errors}`);
      }
    });
    
    // Summary
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    const overallSuccessRate = (passedCount / totalCount) * 100;
    
    console.log('\n📋 Summary');
    console.log('==========');
    console.log(`Overall Result: ${passedCount}/${totalCount} scenarios passed`);
    console.log(`Success Rate: ${overallSuccessRate.toFixed(1)}%`);
    
    if (passedCount === totalCount) {
      console.log('🎉 All performance targets met!');
    } else {
      console.log('⚠️  Some performance targets not met.');
    }
  }

  private outputJSON(results: any[]): void {
    const output = {
      timestamp: new Date().toISOString(),
      validation: 'Stage 3 Performance',
      summary: {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        successRate: (results.filter(r => r.passed).length / results.length) * 100
      },
      results
    };
    
    console.log(JSON.stringify(output, null, 2));
  }

  private outputCSV(results: any[]): void {
    // CSV header
    const headers = [
      'Scenario',
      'Status',
      'Spawn Time P95 (ms)',
      'Communication P95 (ms)',
      'Concurrent Agents',
      'Memory Usage (MB)',
      'Success Rate (%)',
      'Throughput (ops/sec)',
      'Total Time (s)',
      'Agents Spawned',
      'Messages Sent',
      'Tasks Executed',
      'Errors'
    ];
    
    console.log(headers.join(','));
    
    // CSV data
    results.forEach(result => {
      const row = [
        `"${result.scenario}"`,
        result.passed ? 'PASS' : 'FAIL',
        result.metrics.spawnTimeP95.toFixed(2),
        result.metrics.communicationP95.toFixed(2),
        result.metrics.concurrentAgents,
        result.metrics.memoryUsage.toFixed(2),
        (result.metrics.successRate * 100).toFixed(1),
        result.metrics.throughput.toFixed(0),
        (result.details.totalTime / 1000).toFixed(2),
        result.details.agentsSpawned,
        result.details.messagesSent,
        result.details.tasksExecuted,
        result.details.errors
      ];
      
      console.log(row.join(','));
    });
  }
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new Stage3PerformanceCLI();
  cli.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { Stage3PerformanceCLI };