# Performance Benchmarking Tools and Examples

## Overview
Comprehensive collection of performance benchmarking tools, automated test suites, and practical examples for measuring and validating claude-flow-novice performance across different scenarios and scales.

## Benchmarking Framework Architecture

### 1. Core Benchmark Engine

```typescript
// Core benchmarking framework
export class BenchmarkEngine {
  private suites = new Map<string, BenchmarkSuite>();
  private results = new Map<string, BenchmarkResult>();
  private baselines = new Map<string, Baseline>();
  private reporters: BenchmarkReporter[] = [];

  constructor(config: BenchmarkConfig) {
    this.loadBaselines(config.baselinesPath);
    this.initializeReporters(config.reporters);
  }

  // Register benchmark suite
  registerSuite(name: string, suite: BenchmarkSuite): void {
    this.suites.set(name, suite);
  }

  // Execute all benchmarks
  async runAllBenchmarks(): Promise<BenchmarkResults> {
    console.log('🏁 Starting comprehensive performance benchmarks');

    const results = new Map<string, BenchmarkResult>();

    for (const [name, suite] of this.suites) {
      console.log(`\n📊 Running benchmark suite: ${name}`);
      const result = await this.runSuite(name, suite);
      results.set(name, result);
    }

    // Generate final report
    const report = await this.generateReport(results);
    await this.publishResults(report);

    return report;
  }

  // Execute specific benchmark suite
  async runSuite(name: string, suite: BenchmarkSuite): Promise<BenchmarkResult> {
    const startTime = Date.now();

    try {
      // Setup benchmark environment
      await suite.setup();

      // Run individual benchmarks
      const benchmarkResults = [];
      for (const benchmark of suite.benchmarks) {
        console.log(`  ⏱️  Running: ${benchmark.name}`);
        const result = await this.runBenchmark(benchmark);
        benchmarkResults.push(result);
      }

      // Cleanup
      await suite.cleanup();

      const totalTime = Date.now() - startTime;

      return {
        suiteName: name,
        startTime,
        totalTime,
        benchmarks: benchmarkResults,
        summary: this.calculateSummary(benchmarkResults),
        baseline: this.baselines.get(name),
        comparison: this.compareWithBaseline(name, benchmarkResults)
      };
    } catch (error) {
      throw new BenchmarkError(`Suite ${name} failed: ${error.message}`);
    }
  }

  private async runBenchmark(benchmark: Benchmark): Promise<BenchmarkResult> {
    const iterations = benchmark.iterations || 10;
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const iterationStart = performance.now();

      try {
        const result = await benchmark.execute();
        const duration = performance.now() - iterationStart;

        results.push({
          iteration: i + 1,
          duration,
          result,
          success: true,
          timestamp: Date.now()
        });
      } catch (error) {
        results.push({
          iteration: i + 1,
          duration: performance.now() - iterationStart,
          error: error.message,
          success: false,
          timestamp: Date.now()
        });
      }
    }

    return {
      name: benchmark.name,
      iterations,
      results,
      statistics: this.calculateStatistics(results),
      metadata: benchmark.metadata
    };
  }
}
```

### 2. Built-in Benchmark Suites

#### System Performance Benchmarks
```typescript
export class SystemPerformanceBenchmarks extends BenchmarkSuite {
  name = 'System Performance';

  async setup(): Promise<void> {
    // Initialize clean test environment
    await this.cleanupPreviousTests();
    await this.initializeTestData();
  }

  getBenchmarks(): Benchmark[] {
    return [
      {
        name: 'System Initialization',
        description: 'Measure system startup time',
        iterations: 5,
        timeout: 30000,
        metadata: { category: 'startup', critical: true },
        execute: async () => {
          const system = new SystemIntegration();
          const startTime = performance.now();

          await system.initialize();
          const initTime = performance.now() - startTime;

          await system.shutdown();

          return {
            initializationTime: initTime,
            target: 5000, // 5 seconds
            passed: initTime < 5000
          };
        }
      },

      {
        name: 'Memory Usage Under Load',
        description: 'Monitor memory usage during high load',
        iterations: 3,
        timeout: 60000,
        metadata: { category: 'memory', critical: true },
        execute: async () => {
          const system = new SystemIntegration();
          await system.initialize();

          const initialMemory = process.memoryUsage();

          // Create load
          const agents = await this.createLoadAgents(100);
          const tasks = await this.createLoadTasks(500);

          const peakMemory = process.memoryUsage();

          // Cleanup
          await this.cleanupLoad(agents, tasks);
          await system.shutdown();

          const memoryIncrease = peakMemory.heapUsed - initialMemory.heapUsed;

          return {
            initialMemory: initialMemory.heapUsed,
            peakMemory: peakMemory.heapUsed,
            memoryIncrease,
            target: 200 * 1024 * 1024, // 200MB
            passed: memoryIncrease < 200 * 1024 * 1024
          };
        }
      },

      {
        name: 'CPU Utilization Efficiency',
        description: 'Measure CPU efficiency during operations',
        iterations: 5,
        timeout: 30000,
        metadata: { category: 'cpu', critical: false },
        execute: async () => {
          const cpuMonitor = new CPUMonitor();
          await cpuMonitor.start();

          // Execute CPU-intensive operations
          await this.executeCPUIntensiveWorkload();

          const cpuStats = await cpuMonitor.stop();

          return {
            averageCPU: cpuStats.average,
            peakCPU: cpuStats.peak,
            efficiency: cpuStats.efficiency,
            target: 80, // 80% max
            passed: cpuStats.peak < 80
          };
        }
      }
    ];
  }
}
```

#### Agent Performance Benchmarks
```typescript
export class AgentPerformanceBenchmarks extends BenchmarkSuite {
  name = 'Agent Performance';

  getBenchmarks(): Benchmark[] {
    return [
      {
        name: 'Agent Spawn Throughput',
        description: 'Measure agent spawning performance',
        iterations: 10,
        timeout: 60000,
        metadata: { category: 'agents', critical: true },
        execute: async () => {
          const agentManager = new AgentManager();
          const startTime = performance.now();

          // Spawn 100 agents in parallel
          const spawnPromises = Array.from({ length: 100 }, (_, i) =>
            agentManager.spawnAgent('coder', { name: `Benchmark-${i}` })
          );

          const agents = await Promise.all(spawnPromises);
          const spawnTime = performance.now() - startTime;

          const agentsPerSecond = (100 / spawnTime) * 1000;

          // Cleanup
          await Promise.all(agents.map(agent => agentManager.destroyAgent(agent)));

          return {
            agentCount: 100,
            spawnTime,
            agentsPerSecond,
            target: 10, // 10 agents/second
            passed: agentsPerSecond >= 10
          };
        }
      },

      {
        name: 'Agent Communication Latency',
        description: 'Measure inter-agent communication performance',
        iterations: 10,
        timeout: 30000,
        metadata: { category: 'communication', critical: true },
        execute: async () => {
          const agentManager = new AgentManager();

          // Create test agents
          const sender = await agentManager.spawnAgent('coordinator');
          const receiver = await agentManager.spawnAgent('worker');

          const messageCount = 1000;
          const startTime = performance.now();

          // Send messages
          const messagePromises = Array.from({ length: messageCount }, (_, i) =>
            agentManager.sendMessage({
              from: sender,
              to: receiver,
              type: 'test',
              data: { index: i }
            })
          );

          await Promise.all(messagePromises);
          const communicationTime = performance.now() - startTime;

          const messagesPerSecond = (messageCount / communicationTime) * 1000;

          // Cleanup
          await agentManager.destroyAgent(sender);
          await agentManager.destroyAgent(receiver);

          return {
            messageCount,
            communicationTime,
            messagesPerSecond,
            averageLatency: communicationTime / messageCount,
            target: 200, // 200 messages/second
            passed: messagesPerSecond >= 200
          };
        }
      },

      {
        name: 'Agent Load Balancing',
        description: 'Test load distribution efficiency',
        iterations: 5,
        timeout: 45000,
        metadata: { category: 'coordination', critical: false },
        execute: async () => {
          const swarmCoordinator = new SwarmCoordinator();
          const swarmId = await swarmCoordinator.createSwarm({
            objective: 'Load balancing test',
            strategy: 'development',
            maxAgents: 20
          });

          // Spawn agents
          const agents = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
              swarmCoordinator.spawnAgentInSwarm(swarmId, {
                type: 'worker',
                name: `Worker-${i}`
              })
            )
          );

          // Create many tasks
          const taskCount = 100;
          const tasks = await Promise.all(
            Array.from({ length: taskCount }, (_, i) =>
              this.createTestTask(`Task-${i}`)
            )
          );

          const startTime = performance.now();

          // Distribute tasks
          await this.distributeTasks(tasks, agents);

          const distributionTime = performance.now() - startTime;

          // Analyze load distribution
          const loadDistribution = this.analyzeLoadDistribution(agents);

          await swarmCoordinator.destroySwarm(swarmId);

          return {
            taskCount,
            agentCount: agents.length,
            distributionTime,
            loadBalance: loadDistribution.balance,
            variance: loadDistribution.variance,
            target: 0.1, // 10% variance
            passed: loadDistribution.variance < 0.1
          };
        }
      }
    ];
  }
}
```

#### Command Performance Benchmarks
```typescript
export class CommandPerformanceBenchmarks extends BenchmarkSuite {
  name = 'Command Performance';

  getBenchmarks(): Benchmark[] {
    return [
      {
        name: 'CLI Command Response Time',
        description: 'Measure CLI command execution time',
        iterations: 20,
        timeout: 10000,
        metadata: { category: 'cli', critical: true },
        execute: async () => {
          const cli = new ConsolidatedCLI();
          const commands = [
            'status',
            'agents list',
            'swarm status',
            'tasks list',
            'help'
          ];

          const results = [];

          for (const command of commands) {
            const startTime = performance.now();
            await cli.executeCommand(command.split(' '));
            const duration = performance.now() - startTime;

            results.push({
              command,
              duration,
              passed: duration < 2000 // 2 second target
            });
          }

          const averageTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
          const maxTime = Math.max(...results.map(r => r.duration));

          return {
            commands: results,
            averageTime,
            maxTime,
            target: 2000, // 2 seconds
            passed: maxTime < 2000
          };
        }
      },

      {
        name: 'Cache Performance',
        description: 'Measure caching efficiency',
        iterations: 5,
        timeout: 15000,
        metadata: { category: 'caching', critical: false },
        execute: async () => {
          const cache = new PerformanceOptimizer();
          const operations = 1000;

          // First run (cold cache)
          const coldStartTime = performance.now();
          for (let i = 0; i < operations; i++) {
            await cache.optimizeExecution(`key-${i % 100}`, async () => {
              return `value-${i}`;
            });
          }
          const coldTime = performance.now() - coldStartTime;

          // Second run (warm cache)
          const warmStartTime = performance.now();
          for (let i = 0; i < operations; i++) {
            await cache.optimizeExecution(`key-${i % 100}`, async () => {
              return `value-${i}`;
            });
          }
          const warmTime = performance.now() - warmStartTime;

          const speedup = coldTime / warmTime;
          const hitRate = cache.getMetrics().cacheHitRate;

          return {
            operations,
            coldTime,
            warmTime,
            speedup,
            hitRate,
            target: 2.0, // 2x speedup
            passed: speedup >= 2.0 && hitRate >= 0.8
          };
        }
      }
    ];
  }
}
```

### 3. Load Testing Framework

```typescript
export class LoadTestingFramework {
  private scenarios = new Map<string, LoadTestScenario>();
  private metrics = new MetricsCollector();

  registerScenario(name: string, scenario: LoadTestScenario): void {
    this.scenarios.set(name, scenario);
  }

  async runLoadTest(scenarioName: string, config: LoadTestConfig): Promise<LoadTestResult> {
    const scenario = this.scenarios.get(scenarioName);
    if (!scenario) {
      throw new Error(`Unknown scenario: ${scenarioName}`);
    }

    console.log(`🔥 Starting load test: ${scenarioName}`);
    console.log(`   Users: ${config.concurrentUsers}`);
    console.log(`   Duration: ${config.duration}ms`);
    console.log(`   Ramp-up: ${config.rampUpTime}ms`);

    const result = {
      scenario: scenarioName,
      config,
      startTime: Date.now(),
      endTime: 0,
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        throughput: 0,
        errorRate: 0
      },
      timeline: [],
      errors: []
    };

    // Start metrics collection
    this.metrics.startCollection();

    try {
      // Execute load test
      await this.executeLoadTest(scenario, config, result);
    } finally {
      result.endTime = Date.now();
      await this.metrics.stopCollection();
    }

    // Calculate final metrics
    result.metrics = this.calculateLoadTestMetrics(result);

    return result;
  }

  private async executeLoadTest(
    scenario: LoadTestScenario,
    config: LoadTestConfig,
    result: LoadTestResult
  ): Promise<void> {
    const users = [];
    const rampUpDelay = config.rampUpTime / config.concurrentUsers;

    // Ramp up users
    for (let i = 0; i < config.concurrentUsers; i++) {
      setTimeout(async () => {
        const user = new VirtualUser(i, scenario);
        users.push(user);
        await user.start(config.duration);
      }, i * rampUpDelay);
    }

    // Wait for test completion
    await new Promise(resolve => setTimeout(resolve, config.duration + config.rampUpTime));

    // Collect results from all users
    for (const user of users) {
      const userResults = await user.getResults();
      this.aggregateUserResults(result, userResults);
    }
  }
}

// Virtual user for load testing
class VirtualUser {
  private id: number;
  private scenario: LoadTestScenario;
  private results: UserResult[] = [];

  constructor(id: number, scenario: LoadTestScenario) {
    this.id = id;
    this.scenario = scenario;
  }

  async start(duration: number): Promise<void> {
    const endTime = Date.now() + duration;

    while (Date.now() < endTime) {
      try {
        const startTime = performance.now();
        await this.scenario.execute();
        const responseTime = performance.now() - startTime;

        this.results.push({
          timestamp: Date.now(),
          responseTime,
          success: true
        });
      } catch (error) {
        this.results.push({
          timestamp: Date.now(),
          responseTime: 0,
          success: false,
          error: error.message
        });
      }

      // Think time between requests
      await this.sleep(this.scenario.thinkTime || 1000);
    }
  }

  async getResults(): Promise<UserResult[]> {
    return this.results;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 4. Stress Testing Scenarios

```typescript
export class StressTestScenarios {
  // High agent count stress test
  static createHighAgentCountTest(): LoadTestScenario {
    return {
      name: 'High Agent Count Stress Test',
      description: 'Stress test with many concurrent agents',
      thinkTime: 500,
      execute: async () => {
        const agentManager = new AgentManager();

        // Spawn many agents
        const agents = await Promise.all(
          Array.from({ length: 50 }, (_, i) =>
            agentManager.spawnAgent('worker', { name: `Stress-${i}` })
          )
        );

        // Create tasks for agents
        const tasks = agents.map(agent => ({
          id: `task-${Date.now()}-${Math.random()}`,
          type: 'compute',
          agent
        }));

        // Execute tasks
        await Promise.all(tasks.map(task => this.executeTask(task)));

        // Cleanup
        await Promise.all(agents.map(agent => agentManager.destroyAgent(agent)));
      }
    };
  }

  // Memory pressure stress test
  static createMemoryPressureTest(): LoadTestScenario {
    return {
      name: 'Memory Pressure Stress Test',
      description: 'Test system behavior under memory pressure',
      thinkTime: 100,
      execute: async () => {
        const memoryManager = new MemoryManager();

        // Create large data structures
        const largeObjects = [];
        for (let i = 0; i < 1000; i++) {
          const largeObject = {
            id: i,
            data: new Array(10000).fill(`data-${i}`),
            timestamp: Date.now()
          };
          largeObjects.push(largeObject);

          // Store in memory
          await memoryManager.set(`stress-object-${i}`, largeObject);
        }

        // Perform operations on stored data
        for (let i = 0; i < 100; i++) {
          const randomId = Math.floor(Math.random() * 1000);
          const obj = await memoryManager.get(`stress-object-${randomId}`);

          if (obj) {
            // Simulate processing
            obj.processed = true;
            await memoryManager.set(`stress-object-${randomId}`, obj);
          }
        }

        // Cleanup
        for (let i = 0; i < 1000; i++) {
          await memoryManager.delete(`stress-object-${i}`);
        }
      }
    };
  }

  // Network communication stress test
  static createNetworkStressTest(): LoadTestScenario {
    return {
      name: 'Network Communication Stress Test',
      description: 'Stress test inter-agent communication',
      thinkTime: 50,
      execute: async () => {
        const agentManager = new AgentManager();

        // Create sender and receiver agents
        const senders = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            agentManager.spawnAgent('sender', { name: `Sender-${i}` })
          )
        );

        const receivers = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            agentManager.spawnAgent('receiver', { name: `Receiver-${i}` })
          )
        );

        // Generate communication load
        const messagePromises = [];
        for (const sender of senders) {
          for (const receiver of receivers) {
            // Send multiple messages between each pair
            for (let i = 0; i < 10; i++) {
              messagePromises.push(
                agentManager.sendMessage({
                  from: sender,
                  to: receiver,
                  type: 'stress-test',
                  data: { index: i, timestamp: Date.now() }
                })
              );
            }
          }
        }

        await Promise.all(messagePromises);

        // Cleanup
        await Promise.all([
          ...senders.map(agent => agentManager.destroyAgent(agent)),
          ...receivers.map(agent => agentManager.destroyAgent(agent))
        ]);
      }
    };
  }
}
```

### 5. Performance Regression Testing

```typescript
export class PerformanceRegressionTester {
  private baseline: PerformanceBaseline;
  private currentResults: PerformanceResults;
  private thresholds: RegressionThresholds;

  constructor(config: RegressionTestConfig) {
    this.baseline = this.loadBaseline(config.baselinePath);
    this.thresholds = config.thresholds;
  }

  async runRegressionTests(): Promise<RegressionTestReport> {
    console.log('🔍 Running performance regression tests');

    const benchmarkEngine = new BenchmarkEngine({});
    this.currentResults = await benchmarkEngine.runAllBenchmarks();

    const regressions = this.detectRegressions();
    const improvements = this.detectImprovements();

    return {
      timestamp: Date.now(),
      baseline: this.baseline,
      current: this.currentResults,
      regressions,
      improvements,
      summary: this.generateSummary(regressions, improvements),
      passed: regressions.length === 0
    };
  }

  private detectRegressions(): PerformanceRegression[] {
    const regressions = [];

    for (const [testName, currentResult] of this.currentResults.tests) {
      const baselineResult = this.baseline.tests.get(testName);
      if (!baselineResult) continue;

      const performanceChange = this.calculatePerformanceChange(
        baselineResult,
        currentResult
      );

      if (this.isRegression(performanceChange)) {
        regressions.push({
          testName,
          metric: performanceChange.metric,
          baselineValue: performanceChange.baseline,
          currentValue: performanceChange.current,
          changePercent: performanceChange.percent,
          severity: this.calculateSeverity(performanceChange.percent),
          threshold: this.thresholds[performanceChange.metric]
        });
      }
    }

    return regressions;
  }

  private isRegression(change: PerformanceChange): boolean {
    const threshold = this.thresholds[change.metric] || 10; // 10% default
    return change.percent > threshold;
  }

  private calculateSeverity(changePercent: number): 'low' | 'medium' | 'high' | 'critical' {
    if (changePercent > 50) return 'critical';
    if (changePercent > 30) return 'high';
    if (changePercent > 15) return 'medium';
    return 'low';
  }
}
```

### 6. Automated Performance CI/CD Integration

```typescript
// CI/CD integration for automated performance testing
export class PerformanceCIPipeline {
  private config: PipelineConfig;

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  async runPerformanceGate(): Promise<PipelineResult> {
    console.log('🚦 Running performance gate checks');

    const results = {
      passed: true,
      checks: [],
      summary: '',
      recommendations: []
    };

    // Run quick performance checks
    const quickChecks = await this.runQuickChecks();
    results.checks.push(...quickChecks);

    // Run regression tests if quick checks pass
    if (quickChecks.every(check => check.passed)) {
      const regressionResults = await this.runRegressionTests();
      results.checks.push(...regressionResults);
    }

    // Determine overall result
    results.passed = results.checks.every(check => check.passed);

    if (!results.passed) {
      results.summary = 'Performance gate failed - see individual check results';
      results.recommendations = this.generateRecommendations(results.checks);
    } else {
      results.summary = 'All performance checks passed';
    }

    return results;
  }

  private async runQuickChecks(): Promise<PerformanceCheck[]> {
    const checks = [];

    // Startup time check
    const startupCheck = await this.checkStartupTime();
    checks.push(startupCheck);

    // Memory leak check
    const memoryCheck = await this.checkMemoryLeaks();
    checks.push(memoryCheck);

    // Basic throughput check
    const throughputCheck = await this.checkBasicThroughput();
    checks.push(throughputCheck);

    return checks;
  }

  private async checkStartupTime(): Promise<PerformanceCheck> {
    const startTime = performance.now();
    const system = new SystemIntegration();
    await system.initialize();
    const initTime = performance.now() - startTime;
    await system.shutdown();

    return {
      name: 'Startup Time',
      target: 5000, // 5 seconds
      actual: initTime,
      passed: initTime < 5000,
      severity: 'high'
    };
  }

  private async checkMemoryLeaks(): Promise<PerformanceCheck> {
    const initialMemory = process.memoryUsage().heapUsed;

    // Perform operations that might leak
    for (let i = 0; i < 100; i++) {
      const agent = await this.createTempAgent();
      await this.performOperations(agent);
      await this.destroyAgent(agent);
    }

    // Force garbage collection
    if (global.gc) global.gc();

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    return {
      name: 'Memory Leak Check',
      target: 10 * 1024 * 1024, // 10MB acceptable increase
      actual: memoryIncrease,
      passed: memoryIncrease < 10 * 1024 * 1024,
      severity: 'medium'
    };
  }
}
```

### 7. Benchmark Report Generator

```typescript
export class BenchmarkReportGenerator {
  async generateReport(results: BenchmarkResults): Promise<BenchmarkReport> {
    return {
      metadata: this.generateMetadata(),
      executiveSummary: this.generateExecutiveSummary(results),
      detailedResults: this.generateDetailedResults(results),
      performanceTrends: this.generateTrendAnalysis(results),
      recommendations: this.generateRecommendations(results),
      charts: await this.generateCharts(results),
      rawData: results
    };
  }

  private generateExecutiveSummary(results: BenchmarkResults): ExecutiveSummary {
    const totalTests = results.suites.reduce((sum, suite) => sum + suite.benchmarks.length, 0);
    const passedTests = results.suites.reduce((sum, suite) =>
      sum + suite.benchmarks.filter(b => b.statistics.passed).length, 0
    );

    const overallHealth = passedTests / totalTests;

    return {
      overallHealth: overallHealth >= 0.9 ? 'excellent' : overallHealth >= 0.7 ? 'good' : 'needs-attention',
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      averagePerformance: this.calculateAveragePerformance(results),
      keyInsights: this.extractKeyInsights(results),
      criticalIssues: this.identifyCriticalIssues(results)
    };
  }

  private generateRecommendations(results: BenchmarkResults): Recommendation[] {
    const recommendations = [];

    // Performance recommendations
    for (const suite of results.suites) {
      for (const benchmark of suite.benchmarks) {
        if (!benchmark.statistics.passed) {
          recommendations.push({
            type: 'performance',
            priority: benchmark.metadata.critical ? 'high' : 'medium',
            title: `Optimize ${benchmark.name}`,
            description: `${benchmark.name} failed to meet performance targets`,
            actions: this.generateOptimizationActions(benchmark),
            estimatedImpact: 'high'
          });
        }
      }
    }

    return recommendations;
  }

  private async generateCharts(results: BenchmarkResults): Promise<ChartData[]> {
    const charts = [];

    // Performance trend chart
    charts.push({
      type: 'line',
      title: 'Performance Trends',
      data: this.generateTrendChartData(results)
    });

    // Performance distribution chart
    charts.push({
      type: 'histogram',
      title: 'Performance Distribution',
      data: this.generateDistributionChartData(results)
    });

    // Comparison chart
    charts.push({
      type: 'bar',
      title: 'Benchmark Comparison',
      data: this.generateComparisonChartData(results)
    });

    return charts;
  }
}
```

## Usage Examples

### Running Benchmarks
```bash
# Run all benchmarks
npm run benchmark

# Run specific benchmark suite
npm run benchmark -- --suite="Agent Performance"

# Run with custom configuration
npm run benchmark -- --config=benchmark.config.js

# Run and save baseline
npm run benchmark -- --save-baseline

# Compare with previous baseline
npm run benchmark -- --compare-baseline
```

### Custom Benchmark Example
```typescript
// Create custom benchmark
const customBenchmark = {
  name: 'Custom Operation',
  description: 'Test custom functionality',
  iterations: 10,
  execute: async () => {
    const startTime = performance.now();

    // Your custom operations here
    await performCustomOperation();

    const duration = performance.now() - startTime;

    return {
      duration,
      target: 1000, // 1 second
      passed: duration < 1000
    };
  }
};

// Register and run
const engine = new BenchmarkEngine({});
engine.registerSuite('Custom', { benchmarks: [customBenchmark] });
await engine.runAllBenchmarks();
```

This comprehensive benchmarking framework provides tools for measuring, validating, and optimizing claude-flow-novice performance across all scenarios and scales.