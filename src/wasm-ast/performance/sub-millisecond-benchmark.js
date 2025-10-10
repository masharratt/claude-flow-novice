/**
 * Sub-Millisecond Performance Benchmark Suite
 *
 * Comprehensive benchmarking for AST operations with sub-millisecond targets
 * and Redis swarm coordination for distributed performance testing
 */

import { performance } from 'perf_hooks';
import { createHash } from 'crypto';
import OptimizedASTEngine from '../engine/optimized-ast-engine.js';

export interface BenchmarkTarget {
  operation: string;
  targetTime: number; // Target in milliseconds
  successRate: number; // Target success rate percentage
  sampleSize: number; // Number of samples to collect
}

export interface BenchmarkResult {
  operation: string;
  targetTime: number;
  samples: number;
  successCount: number;
  successRate: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p50Time: number;
  p95Time: number;
  p99Time: number;
  subMillisecondRate: number;
  throughput: number;
  targetAchieved: boolean;
  confidence: number;
  recommendations: string[];
}

export interface BenchmarkReport {
  timestamp: number;
  agentId: string;
  swarmId: string;
  duration: number;
  targets: BenchmarkTarget[];
  results: BenchmarkResult[];
  overallScore: number;
  overallTargetAchieved: boolean;
  summary: {
    totalOperations: number;
    overallSuccessRate: number;
    overallSubMillisecondRate: number;
    averageThroughput: number;
    confidenceScore: number;
  };
  performanceTrends: {
    parseTime: number[];
    transformTime: number[];
    cacheHitRate: number[];
    memoryUsage: number[];
  };
  recommendations: string[];
  nextSteps: string[];
}

export class SubMillisecondBenchmark {
  private engine: OptimizedASTEngine;
  private targets: BenchmarkTarget[];
  private agentId: string;
  private swarmId: string;
  private redisClient: any;

  constructor(swarmId: string = 'ast-performance-optimization', redisClient?: any) {
    this.engine = new OptimizedASTEngine(swarmId, redisClient);
    this.swarmId = swarmId;
    this.agentId = `benchmark-agent-${process.pid}-${Date.now()}`;
    this.redisClient = redisClient;
    this.targets = this.initializeTargets();
  }

  /**
   * Initialize benchmark targets for sub-millisecond performance
   */
  private initializeTargets(): BenchmarkTarget[] {
    return [
      {
        operation: 'parse_simple',
        targetTime: 0.5, // 0.5ms target
        successRate: 95, // 95% success rate
        sampleSize: 1000
      },
      {
        operation: 'parse_complex',
        targetTime: 1.0, // 1ms target
        successRate: 90, // 90% success rate
        sampleSize: 1000
      },
      {
        operation: 'transform_simple',
        targetTime: 0.8, // 0.8ms target
        successRate: 90, // 90% success rate
        sampleSize: 1000
      },
      {
        operation: 'transform_complex',
        targetTime: 2.0, // 2ms target
        successRate: 85, // 85% success rate
        sampleSize: 1000
      },
      {
        operation: 'batch_processing',
        targetTime: 5.0, // 5ms target for 10 files
        successRate: 80, // 80% success rate
        sampleSize: 100
      },
      {
        operation: 'cache_hit',
        targetTime: 0.1, // 0.1ms target for cache hits
        successRate: 99, // 99% success rate
        sampleSize: 1000
      },
      {
        operation: 'memory_efficiency',
        targetTime: 1.0, // 1ms target with <10MB memory
        successRate: 85, // 85% success rate
        sampleSize: 1000
      }
    ];
  }

  /**
   * Run comprehensive benchmark suite
   */
  async runBenchmarkSuite(): Promise<BenchmarkReport> {
    console.log('🚀 Starting Sub-Millisecond Benchmark Suite...');
    console.log(`📊 Agent: ${this.agentId}`);
    console.log(`🐝 Swarm: ${this.swarmId}`);
    console.log(`🎯 Total Targets: ${this.targets.length}`);

    const startTime = performance.now();
    const results: BenchmarkResult[] = [];
    const performanceTrends = {
      parseTime: [],
      transformTime: [],
      cacheHitRate: [],
      memoryUsage: []
    };

    // Warmup phase
    console.log('🔥 Warming up...');
    await this.performWarmup();

    // Execute benchmarks for each target
    for (const target of this.targets) {
      console.log(`⚡ Benchmarking ${target.operation}...`);

      const result = await this.benchmarkOperation(target);
      results.push(result);

      // Collect performance trends
      if (target.operation.includes('parse')) {
        performanceTrends.parseTime.push(result.averageTime);
      } else if (target.operation.includes('transform')) {
        performanceTrends.transformTime.push(result.averageTime);
      }

      if (target.operation === 'cache_hit') {
        performanceTrends.cacheHitRate.push(result.subMillisecondRate);
      }

      // Memory usage tracking
      const memUsage = process.memoryUsage().heapUsed / (1024 * 1024);
      performanceTrends.memoryUsage.push(memUsage);

      // Publish intermediate results
      await this.publishBenchmarkUpdate(target, result);
    }

    const duration = performance.now() - startTime;

    // Generate final report
    const report = this.generateBenchmarkReport(duration, results, performanceTrends);

    // Publish final report
    await this.publishBenchmarkReport(report);

    console.log('✅ Benchmark Suite Completed');
    console.log(`📊 Overall Score: ${report.overallScore.toFixed(2)}%`);
    console.log(`🎯 Target Achieved: ${report.overallTargetAchieved ? 'YES' : 'NO'}`);
    console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);

    return report;
  }

  /**
   * Perform warmup to ensure optimal performance
   */
  private async performWarmup(): Promise<void> {
    const warmupCode = `
      function warmupFunction() {
        const data = [1, 2, 3, 4, 5];
        return data.map(x => x * 2).filter(x => x > 5);
      }
      warmupFunction();
    `;

    // Warmup for 50 iterations
    for (let i = 0; i < 50; i++) {
      this.engine.parseASTUltraFast(warmupCode);
      this.engine.transformASTOptimized(this.engine.parseASTUltraFast(warmupCode));

      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
  }

  /**
   * Benchmark individual operation
   */
  private async benchmarkOperation(target: BenchmarkTarget): Promise<BenchmarkResult> {
    const samples: number[] = [];
    const successCount: number[] = [];
    let memorySnapshots: number[] = [];

    // Generate test cases based on operation type
    const testCases = this.generateTestCases(target.operation, target.sampleSize);

    console.log(`  📝 Running ${target.sampleSize} test cases...`);

    for (let i = 0; i < target.sampleSize; i++) {
      const testCase = testCases[i % testCases.length];
      const startTime = performance.now();

      try {
        // Execute operation based on type
        let success = false;
        let duration = 0;

        switch (target.operation) {
          case 'parse_simple':
          case 'parse_complex':
            const parseResult = this.engine.parseASTUltraFast(testCase.code);
            duration = performance.now() - startTime;
            success = parseResult && parseResult.nodeCount > 0;
            break;

          case 'transform_simple':
          case 'transform_complex':
            const ast = this.engine.parseASTUltraFast(testCase.code);
            const transformResult = this.engine.transformASTOptimized(ast, testCase.optimizations);
            duration = performance.now() - startTime;
            success = transformResult && transformResult.transformedCode !== testCase.code;
            break;

          case 'batch_processing':
            const batchResults = [];
            const batchStart = performance.now();
            for (const file of testCase.files) {
              const result = this.engine.parseASTUltraFast(file);
              batchResults.push(result);
            }
            duration = performance.now() - batchStart;
            success = batchResults.length === testCase.files.length && batchResults.every(r => r && r.nodeCount > 0);
            break;

          case 'cache_hit':
            // Parse twice - second should be cache hit
            this.engine.parseASTUltraFast(testCase.code);
            const cacheStart = performance.now();
            const cacheResult = this.engine.parseASTUltraFast(testCase.code);
            duration = performance.now() - cacheStart;
            success = cacheResult && cacheResult.nodeCount > 0;
            break;

          case 'memory_efficiency':
            const memBefore = process.memoryUsage().heapUsed;
            const memResult = this.engine.parseASTUltraFast(testCase.code);
            const memAfter = process.memoryUsage().heapUsed;
            duration = performance.now() - startTime;
            success = memResult && ((memAfter - memBefore) < 10 * 1024 * 1024); // Less than 10MB
            memorySnapshots.push((memAfter - memBefore) / (1024 * 1024)); // MB
            break;

          default:
            throw new Error(`Unknown operation: ${target.operation}`);
        }

        samples.push(duration);
        successCount.push(success ? 1 : 0);

      } catch (error) {
        samples.push(performance.now() - startTime);
        successCount.push(0);
      }

      // Prevent optimization from being too aggressive
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // Calculate statistics
    const sortedSamples = [...samples].sort((a, b) => a - b);
    const successRate = (successCount.reduce((a, b) => a + b, 0) / successCount.length) * 100;
    const subMillisecondRate = (samples.filter(s => s < 1.0).length / samples.length) * 100;

    const result: BenchmarkResult = {
      operation: target.operation,
      targetTime: target.targetTime,
      samples: target.sampleSize,
      successCount: successCount.reduce((a, b) => a + b, 0),
      successRate,
      averageTime: samples.reduce((a, b) => a + b, 0) / samples.length,
      minTime: sortedSamples[0],
      maxTime: sortedSamples[sortedSamples.length - 1],
      p50Time: sortedSamples[Math.floor(sortedSamples.length * 0.5)],
      p95Time: sortedSamples[Math.floor(sortedSamples.length * 0.95)],
      p99Time: sortedSamples[Math.floor(sortedSamples.length * 0.99)],
      subMillisecondRate,
      throughput: 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length),
      targetAchieved: successRate >= target.successRate &&
                   (samples.reduce((a, b) => a + b, 0) / samples.length) <= target.targetTime,
      confidence: this.calculateBenchmarkConfidence(target, successRate, samples),
      recommendations: this.generateBenchmarkRecommendations(target, successRate, samples, subMillisecondRate)
    };

    console.log(`  ✅ ${target.operation}: ${result.averageTime.toFixed(3)}ms avg, ${result.successRate.toFixed(1)}% success, ${result.subMillisecondRate.toFixed(1)}% sub-ms`);

    return result;
  }

  /**
   * Generate test cases for operations
   */
  private generateTestCases(operation: string, count: number): any[] {
    const testCases: any[] = [];

    if (operation.includes('simple')) {
      // Simple test cases
      testCases.push({
        code: `
          function test() {
            return 42;
          }
          test();
        `,
        optimizations: ['all']
      });

      testCases.push({
        code: `
          const arr = [1, 2, 3];
          const doubled = arr.map(x => x * 2);
        `,
        optimizations: ['array_optimization']
      });

    } else if (operation.includes('complex')) {
      // Complex test cases
      testCases.push({
        code: `
          class Calculator {
            constructor() {
              this.result = 0;
            }

            add(x) {
              if (typeof x === 'number') {
                for (let i = 0; i < 10; i++) {
                  this.result += x * i;
                }
              }
              return this.result;
            }

            multiply(y) {
              return this.result * y;
            }
          }

          const calc = new Calculator();
          calc.add(5);
          calc.multiply(2);
        `,
        optimizations: ['all']
      });

      testCases.push({
        code: `
          function processData(data) {
            if (data && Array.isArray(data)) {
              return data
                .filter(item => item && item.valid)
                .map(item => ({
                  ...item,
                  processed: true,
                  timestamp: Date.now()
                }))
                .reduce((acc, item) => {
                  acc[item.id] = item;
                  return acc;
                }, {});
            }
            return null;
          }

          processData([{id: 1, valid: true}, {id: 2, valid: false}]);
        `,
        optimizations: ['all']
      });

    } else if (operation === 'batch_processing') {
      // Batch processing test cases
      const files = [];
      for (let i = 0; i < 10; i++) {
        files.push(`
          function file${i}() {
            const data = [${Array.from({length: 5}, (_, j) => j + i).join(', ')}];
            return data.map(x => x * 2).filter(x => x > ${i});
          }
          file${i}();
        `);
      }
      testCases.push({ files, optimizations: ['all'] });

    } else {
      // Default test cases
      testCases.push({
        code: `
          function defaultTest() {
            return 'test';
          }
        `,
        optimizations: ['all']
      });
    }

    // Ensure we have enough test cases
    while (testCases.length < count) {
      testCases.push(testCases[testCases.length % testCases.length]);
    }

    return testCases.slice(0, count);
  }

  /**
   * Calculate benchmark confidence score
   */
  private calculateBenchmarkConfidence(target: BenchmarkTarget, successRate: number, samples: number[]): number {
    let confidence = 0.5;

    // Success rate confidence
    if (successRate >= target.successRate) {
      confidence += 0.3;
    } else if (successRate >= target.successRate * 0.9) {
      confidence += 0.2;
    } else if (successRate >= target.successRate * 0.8) {
      confidence += 0.1;
    }

    // Performance confidence
    const avgTime = samples.reduce((a, b) => a + b, 0) / samples.length;
    if (avgTime <= target.targetTime) {
      confidence += 0.3;
    } else if (avgTime <= target.targetTime * 1.2) {
      confidence += 0.2;
    } else if (avgTime <= target.targetTime * 1.5) {
      confidence += 0.1;
    }

    // Consistency confidence
    const sortedSamples = [...samples].sort((a, b) => a - b);
    const p95 = sortedSamples[Math.floor(sortedSamples.length * 0.95)];
    const consistency = (p95 / avgTime);

    if (consistency <= 2.0) {
      confidence += 0.2;
    } else if (consistency <= 3.0) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * Generate benchmark recommendations
   */
  private generateBenchmarkRecommendations(target: BenchmarkTarget, successRate: number, samples: number[], subMillisecondRate: number): string[] {
    const recommendations: string[] = [];
    const avgTime = samples.reduce((a, b) => a + b, 0) / samples.length;

    if (successRate < target.successRate) {
      recommendations.push(`Success rate ${(target.successRate - successRate).toFixed(1)}% below target - improve error handling`);
    }

    if (avgTime > target.targetTime) {
      recommendations.push(`Average time ${(avgTime - target.targetTime).toFixed(2)}ms above target - optimize performance`);
    }

    if (subMillisecondRate < 80) {
      recommendations.push(`Sub-millisecond rate ${(80 - subMillisecondRate).toFixed(1)}% below optimal - improve caching`);
    }

    const p95 = samples.sort((a, b) => a - b)[Math.floor(samples.length * 0.95)];
    if (p95 > target.targetTime * 3) {
      recommendations.push(`P95 latency ${p95.toFixed(2)}ms indicates outliers - investigate edge cases`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance meets all targets - consider optimizing for higher throughput');
    }

    return recommendations;
  }

  /**
   * Generate comprehensive benchmark report
   */
  private generateBenchmarkReport(duration: number, results: BenchmarkResult[], performanceTrends: any): BenchmarkReport {
    const totalOperations = results.reduce((sum, r) => sum + r.samples, 0);
    const overallSuccessRate = results.reduce((sum, r) => sum + r.successRate, 0) / results.length;
    const overallSubMillisecondRate = results.reduce((sum, r) => sum + r.subMillisecondRate, 0) / results.length;
    const averageThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;

    // Calculate overall score
    const targetAchievedCount = results.filter(r => r.targetAchieved).length;
    const overallScore = (targetAchievedCount / results.length) * 100;
    const overallTargetAchieved = targetAchievedCount === results.length;

    // Calculate confidence score
    const confidenceScore = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    // Generate recommendations
    const recommendations = this.generateOverallRecommendations(results);
    const nextSteps = this.generateNextSteps(overallTargetAchieved, overallScore);

    const report: BenchmarkReport = {
      timestamp: Date.now(),
      agentId: this.agentId,
      swarmId: this.swarmId,
      duration,
      targets: this.targets,
      results,
      overallScore,
      overallTargetAchieved,
      summary: {
        totalOperations,
        overallSuccessRate,
        overallSubMillisecondRate,
        averageThroughput,
        confidenceScore
      },
      performanceTrends,
      recommendations,
      nextSteps
    };

    return report;
  }

  /**
   * Generate overall recommendations
   */
  private generateOverallRecommendations(results: BenchmarkResult[]): string[] {
    const recommendations: string[] = [];
    const failedTargets = results.filter(r => !r.targetAchieved);

    if (failedTargets.length > 0) {
      recommendations.push(`${failedTargets.length} targets not achieved - prioritize fixing: ${failedTargets.map(t => t.operation).join(', ')}`);
    }

    const avgSubMsRate = results.reduce((sum, r) => sum + r.subMillisecondRate, 0) / results.length;
    if (avgSubMsRate < 80) {
      recommendations.push('Sub-millisecond performance below optimal - implement advanced caching strategies');
    }

    const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
    if (avgThroughput < 1000) {
      recommendations.push('Throughput below 1000 ops/sec - consider parallel processing optimizations');
    }

    const lowConfidenceResults = results.filter(r => r.confidence < 0.7);
    if (lowConfidenceResults.length > 0) {
      recommendations.push('Low confidence results detected - increase sample size or improve test stability');
    }

    if (recommendations.length === 0) {
      recommendations.push('All performance targets achieved - consider increasing optimization targets');
    }

    return recommendations;
  }

  /**
   * Generate next steps
   */
  private generateNextSteps(overallTargetAchieved: boolean, overallScore: number): string[] {
    const nextSteps: string[] = [];

    if (overallTargetAchieved) {
      nextSteps.push('🎯 All targets achieved - ready for production deployment');
      nextSteps.push('📈 Consider increasing performance targets for continuous improvement');
      nextSteps.push('🔍 Implement continuous performance monitoring');
    } else {
      nextSteps.push('⚠️ Address failed performance targets before production');
      nextSteps.push('🔧 Implement recommended optimizations');
      nextSteps.push('📊 Re-run benchmarks after optimizations');
    }

    if (overallScore >= 90) {
      nextSteps.push('🏆 Excellent performance - document optimization strategies');
    } else if (overallScore >= 70) {
      nextSteps.push('✅ Good performance - focus on remaining optimization opportunities');
    } else {
      nextSteps.push('🚨 Performance needs significant improvement');
      nextSteps.push('📚 Review optimization best practices and implement systematically');
    }

    return nextSteps;
  }

  /**
   * Publish benchmark update via Redis
   */
  private async publishBenchmarkUpdate(target: BenchmarkTarget, result: BenchmarkResult): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      const update = {
        type: 'BENCHMARK_UPDATE',
        swarmId: this.swarmId,
        timestamp: Date.now(),
        agent: this.agentId,
        confidence: result.confidence,
        data: {
          target: target.operation,
          result: {
            success: result.targetAchieved,
            averageTime: result.averageTime,
            successRate: result.successRate,
            subMillisecondRate: result.subMillisecondRate,
            throughput: result.throughput
          }
        }
      };

      await this.redisClient.publish(`swarm:${this.swarmId}`, JSON.stringify(update));
    } catch (error) {
      console.warn('Failed to publish benchmark update:', error);
    }
  }

  /**
   * Publish final benchmark report via Redis
   */
  private async publishBenchmarkReport(report: BenchmarkReport): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      const reportMessage = {
        type: 'BENCHMARK_REPORT',
        swarmId: this.swarmId,
        timestamp: Date.now(),
        agent: this.agentId,
        confidence: report.summary.confidenceScore,
        data: {
          overallScore: report.overallScore,
          targetAchieved: report.overallTargetAchieved,
          summary: report.summary,
          resultsCount: report.results.length,
          duration: report.duration,
          recommendations: report.recommendations,
          nextSteps: report.nextSteps
        }
      };

      await this.redisClient.publish(`swarm:${this.swarmId}`, JSON.stringify(reportMessage));
    } catch (error) {
      console.warn('Failed to publish benchmark report:', error);
    }
  }

  /**
   * Get current benchmark status
   */
  getStatus(): any {
    return {
      agentId: this.agentId,
      swarmId: this.swarmId,
      targetsCount: this.targets.length,
      engineMetrics: this.engine.getOptimizedMetrics(),
      redisConnected: !!this.redisClient
    };
  }

  /**
   * Shutdown benchmark suite
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down Sub-Millisecond Benchmark Suite...');

    await this.engine.shutdown();

    if (this.redisClient) {
      try {
        const shutdownMessage = {
          type: 'BENCHMARK_SHUTDOWN',
          swarmId: this.swarmId,
          timestamp: Date.now(),
          agent: this.agentId,
          confidence: 1.0,
          data: {
            shutdown: true
          }
        };

        await this.redisClient.publish(`swarm:${this.swarmId}`, JSON.stringify(shutdownMessage));
      } catch (error) {
        console.warn('Failed to publish shutdown message:', error);
      }
    }

    console.log(`✅ Benchmark Suite shutdown complete - Agent: ${this.agentId}`);
  }
}

export default SubMillisecondBenchmark;