/**
 * AST Performance Optimization Validation System
 *
 * Comprehensive validation of sub-millisecond AST operations with Redis coordination
 * and real-time performance monitoring to ensure all targets are met
 */

import { performance } from 'perf_hooks';
import { createHash } from 'crypto';
import OptimizedASTEngine from '../engine/optimized-ast-engine.js';
import SubMillisecondBenchmark from '../performance/sub-millisecond-benchmark.js';
import MemoryOptimizedPipeline from '../processing/memory-optimized-pipeline.js';

export interface ValidationTarget {
  name: string;
  description: string;
  targetValue: number;
  actualValue: number;
  unit: string;
  achieved: boolean;
  confidence: number;
  tolerance: number; // Acceptable deviation percentage
}

export interface ValidationReport {
  timestamp: number;
  agentId: string;
  swarmId: string;
  validationId: string;
  duration: number;
  overallScore: number;
  overallAchieved: boolean;
  targets: ValidationTarget[];
  performanceMetrics: {
    astOperations: number;
    averageParseTime: number;
    averageTransformTime: number;
    subMillisecondRate: number;
    cacheHitRate: number;
    memoryEfficiency: number;
    throughput: number;
  };
  redisCoordination: {
    connected: boolean;
    messagesPublished: number;
    messagesReceived: number;
    coordinationLatency: number;
  };
  confidenceScore: number;
  recommendations: string[];
  nextSteps: string[];
}

export interface RedisValidationMessage {
  type: 'VALIDATION_START' | 'VALIDATION_UPDATE' | 'VALIDATION_COMPLETE' | 'TARGET_ACHIEVED' | 'TARGET_MISSED';
  swarmId: string;
  timestamp: number;
  agent: string;
  confidence: number;
  data: {
    validationId?: string;
    target?: string;
    value?: number;
    achieved?: boolean;
    progress?: number;
    report?: Partial<ValidationReport>;
  };
}

export class ASTPerformanceValidator {
  private engine: OptimizedASTEngine;
  private benchmark: SubMillisecondBenchmark;
  private pipeline: MemoryOptimizedPipeline;
  private agentId: string;
  private swarmId: string;
  private redisClient: any;
  private validationTargets: ValidationTarget[];
  private redisMessages: RedisValidationMessage[] = [];
  private coordinationStartTime: number = 0;

  constructor(swarmId: string = 'ast-performance-optimization', redisClient?: any) {
    this.swarmId = swarmId;
    this.agentId = `validator-${process.pid}-${Date.now()}`;
    this.redisClient = redisClient;

    // Initialize components
    this.engine = new OptimizedASTEngine(swarmId, redisClient);
    this.benchmark = new SubMillisecondBenchmark(swarmId, redisClient);
    this.pipeline = new MemoryOptimizedPipeline(swarmId, 512, redisClient);

    // Initialize validation targets
    this.validationTargets = this.initializeValidationTargets();

    console.log('🔍 AST Performance Validator initialized');
    console.log(`🤖 Agent: ${this.agentId}`);
    console.log(`🐝 Swarm: ${this.swarmId}`);
    console.log(`🎯 Validation Targets: ${this.validationTargets.length}`);
  }

  /**
   * Initialize validation targets based on requirements
   */
  private initializeValidationTargets(): ValidationTarget[] {
    return [
      {
        name: 'sub_millisecond_parse_time',
        description: 'Average AST parse time < 1ms',
        targetValue: 1.0,
        actualValue: 0,
        unit: 'ms',
        achieved: false,
        confidence: 0,
        tolerance: 20 // 20% tolerance
      },
      {
        name: 'ast_operations_time',
        description: 'AST operations < 5ms for complex transformations',
        targetValue: 5.0,
        actualValue: 0,
        unit: 'ms',
        achieved: false,
        confidence: 0,
        tolerance: 20
      },
      {
        name: 'sub_millisecond_rate',
        description: 'Sub-millisecond operations > 80%',
        targetValue: 80,
        actualValue: 0,
        unit: '%',
        achieved: false,
        confidence: 0,
        tolerance: 10
      },
      {
        name: 'complex_code_success',
        description: 'Complex code success rate > 95%',
        targetValue: 95,
        actualValue: 0,
        unit: '%',
        achieved: false,
        confidence: 0,
        tolerance: 5
      },
      {
        name: 'memory_efficiency',
        description: 'Memory usage < 10MB per 1000 files',
        targetValue: 10,
        actualValue: 0,
        unit: 'MB',
        achieved: false,
        confidence: 0,
        tolerance: 25
      },
      {
        name: 'cache_hit_rate',
        description: 'Cache hit rate > 70%',
        targetValue: 70,
        actualValue: 0,
        unit: '%',
        achieved: false,
        confidence: 0,
        tolerance: 15
      },
      {
        name: 'throughput',
        description: 'Processing throughput > 1000 files/sec',
        targetValue: 1000,
        actualValue: 0,
        unit: 'files/sec',
        achieved: false,
        confidence: 0,
        tolerance: 20
      },
      {
        name: 'redis_coordination_latency',
        description: 'Redis coordination latency < 10ms',
        targetValue: 10,
        actualValue: 0,
        unit: 'ms',
        achieved: false,
        confidence: 0,
        tolerance: 50
      }
    ];
  }

  /**
   * Run comprehensive performance validation
   */
  async runValidation(): Promise<ValidationReport> {
    const validationId = `validation-${Date.now()}`;
    const startTime = performance.now();

    console.log('🚀 Starting AST Performance Validation...');
    console.log(`📋 Validation ID: ${validationId}`);

    // Publish validation start
    await this.publishValidationUpdate({
      type: 'VALIDATION_START',
      swarmId: this.swarmId,
      timestamp: Date.now(),
      agent: this.agentId,
      confidence: 0.95,
      data: { validationId }
    });

    try {
      // Phase 1: Basic AST operations validation
      console.log('📊 Phase 1: Basic AST Operations Validation...');
      await this.validateBasicOperations(validationId);

      // Phase 2: Sub-millisecond performance validation
      console.log('⚡ Phase 2: Sub-Millisecond Performance Validation...');
      await this.validateSubMillisecondPerformance(validationId);

      // Phase 3: Complex code processing validation
      console.log('🔧 Phase 3: Complex Code Processing Validation...');
      await this.validateComplexCodeProcessing(validationId);

      // Phase 4: Memory efficiency validation
      console.log('🧠 Phase 4: Memory Efficiency Validation...');
      await this.validateMemoryEfficiency(validationId);

      // Phase 5: Redis coordination validation
      console.log('🐝 Phase 5: Redis Coordination Validation...');
      await this.validateRedisCoordination(validationId);

      // Phase 6: Large-scale throughput validation
      console.log('📈 Phase 6: Large-Scale Throughput Validation...');
      await this.validateThroughput(validationId);

      const duration = performance.now() - startTime;

      // Generate final validation report
      const report = await this.generateValidationReport(validationId, duration);

      // Publish completion
      await this.publishValidationUpdate({
        type: 'VALIDATION_COMPLETE',
        swarmId: this.swarmId,
        timestamp: Date.now(),
        agent: this.agentId,
        confidence: report.confidenceScore,
        data: { validationId, report }
      });

      console.log('✅ AST Performance Validation Completed');
      console.log(`📊 Overall Score: ${report.overallScore.toFixed(2)}%`);
      console.log(`🎯 Overall Achieved: ${report.overallAchieved ? 'YES' : 'NO'}`);
      console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);

      return report;

    } catch (error) {
      console.error('❌ Validation failed:', error);
      throw error;
    }
  }

  /**
   * Validate basic AST operations
   */
  private async validateBasicOperations(validationId: string): Promise<void> {
    const testCode = `
      function testFunction(param) {
        if (param > 0) {
          return param * 2;
        } else {
          return 0;
        }
      }

      class TestClass {
        constructor(value) {
          this.value = value;
        }

        getValue() {
          return this.value;
        }
      }
    `;

    const iterations = 100;
    const parseTimes: number[] = [];
    const transformTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      // Test parsing
      const parseStart = performance.now();
      const ast = this.engine.parseASTUltraFast(testCode);
      const parseTime = performance.now() - parseStart;
      parseTimes.push(parseTime);

      // Test transformation
      const transformStart = performance.now();
      const transformed = this.engine.transformASTOptimized(ast, ['all']);
      const transformTime = performance.now() - transformStart;
      transformTimes.push(transformTime);
    }

    const avgParseTime = parseTimes.reduce((a, b) => a + b, 0) / parseTimes.length;
    const avgTransformTime = transformTimes.reduce((a, b) => a + b, 0) / transformTimes.length;

    // Update targets
    this.updateTarget('sub_millisecond_parse_time', avgParseTime);
    this.updateTarget('ast_operations_time', avgTransformTime);

    // Publish progress
    await this.publishValidationUpdate({
      type: 'VALIDATION_UPDATE',
      swarmId: this.swarmId,
      timestamp: Date.now(),
      agent: this.agentId,
      confidence: 0.85,
      data: {
        validationId,
        target: 'basic_operations',
        value: avgParseTime,
        achieved: avgParseTime <= 1.0,
        progress: 15
      }
    });
  }

  /**
   * Validate sub-millisecond performance
   */
  private async validateSubMillisecondPerformance(validationId: string): Promise<void> {
    const benchmarkReport = await this.benchmark.runBenchmarkSuite();
    const metrics = benchmarkReport.summary;

    // Update targets
    this.updateTarget('sub_millisecond_rate', metrics.overallSubMillisecondRate);
    this.updateTarget('cache_hit_rate', this.engine.getOptimizedMetrics().cacheHitRate);

    // Publish progress
    await this.publishValidationUpdate({
      type: 'VALIDATION_UPDATE',
      swarmId: this.swarmId,
      timestamp: Date.now(),
      agent: this.agentId,
      confidence: benchmarkReport.summary.confidenceScore,
      data: {
        validationId,
        target: 'sub_millisecond_performance',
        value: metrics.overallSubMillisecondRate,
        achieved: metrics.overallSubMillisecondRate >= 80,
        progress: 35
      }
    });
  }

  /**
   * Validate complex code processing
   */
  private async validateComplexCodeProcessing(validationId: string): Promise<void> {
    const complexTestCases = [
      `
        class ComplexCalculator {
          constructor() {
            this.history = [];
            this.cache = new Map();
          }

          calculate(operation, ...args) {
            const key = operation + args.join('-');

            if (this.cache.has(key)) {
              return this.cache.get(key);
            }

            let result;
            switch (operation) {
              case 'fibonacci':
                result = this.fibonacci(args[0]);
                break;
              case 'factorial':
                result = this.factorial(args[0]);
                break;
              case 'primes':
                result = this.primes(args[0]);
                break;
              default:
                throw new Error('Unknown operation');
            }

            this.cache.set(key, result);
            this.history.push({ operation, args, result, timestamp: Date.now() });

            return result;
          }

          fibonacci(n) {
            if (n <= 1) return n;
            return this.calculate('fibonacci', n - 1) + this.calculate('fibonacci', n - 2);
          }

          factorial(n) {
            if (n <= 1) return 1;
            return n * this.calculate('factorial', n - 1);
          }

          primes(n) {
            const primes = [];
            for (let i = 2; i <= n; i++) {
              if (this.isPrime(i)) primes.push(i);
            }
            return primes;
          }

          isPrime(num) {
            if (num <= 1) return false;
            if (num <= 3) return true;
            if (num % 2 === 0 || num % 3 === 0) return false;

            for (let i = 5; i * i <= num; i += 6) {
              if (num % i === 0 || num % (i + 2) === 0) return false;
            }

            return true;
          }
        }
      `,
      `
        function advancedDataProcessor(data) {
          if (!Array.isArray(data)) {
            throw new TypeError('Data must be an array');
          }

          const processed = data
            .filter(item => item && typeof item === 'object')
            .map(item => {
              const processed = { ...item };

              if (item.values && Array.isArray(item.values)) {
                processed.stats = {
                  count: item.values.length,
                  sum: item.values.reduce((a, b) => a + b, 0),
                  average: item.values.reduce((a, b) => a + b, 0) / item.values.length,
                  min: Math.min(...item.values),
                  max: Math.max(...item.values),
                  median: this.calculateMedian(item.values),
                  standardDeviation: this.calculateStandardDeviation(item.values)
                };
              }

              if (item.metadata && typeof item.metadata === 'object') {
                processed.enriched = {
                  ...item.metadata,
                  processedAt: Date.now(),
                  hash: this.generateHash(item)
                };
              }

              return processed;
            })
            .filter(item => item.stats && item.stats.count > 0);

          return {
            processed,
            summary: {
              totalItems: processed.length,
              averageValue: processed.reduce((sum, item) => sum + (item.stats?.average || 0), 0) / processed.length,
              totalSum: processed.reduce((sum, item) => sum + (item.stats?.sum || 0), 0)
            }
          };
        }

        function calculateMedian(values) {
          const sorted = [...values].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        }

        function calculateStandardDeviation(values) {
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
          const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
          return Math.sqrt(avgSquaredDiff);
        }

        function generateHash(item) {
          return require('crypto')
            .createHash('md5')
            .update(JSON.stringify(item))
            .digest('hex');
        }
      `
    ];

    let successCount = 0;
    const processingTimes: number[] = [];

    for (const testCase of complexTestCases) {
      try {
        const startTime = performance.now();
        const ast = this.engine.parseASTUltraFast(testCase);
        const transformed = this.engine.transformASTOptimized(ast, ['all']);
        const processingTime = performance.now() - startTime;

        processingTimes.push(processingTime);

        if (ast && transformed && ast.nodeCount > 0) {
          successCount++;
        }
      } catch (error) {
        console.warn('Complex code processing failed:', error.message);
      }
    }

    const successRate = (successCount / complexTestCases.length) * 100;
    const avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;

    // Update targets
    this.updateTarget('complex_code_success', successRate);

    // Publish progress
    await this.publishValidationUpdate({
      type: 'VALIDATION_UPDATE',
      swarmId: this.swarmId,
      timestamp: Date.now(),
      agent: this.agentId,
      confidence: 0.8,
      data: {
        validationId,
        target: 'complex_code_processing',
        value: successRate,
        achieved: successRate >= 95,
        progress: 50
      }
    });
  }

  /**
   * Validate memory efficiency
   */
  private async validateMemoryEfficiency(validationId: string): Promise<void> {
    const testFiles = [];
    const fileCount = 1000;

    // Generate test files
    for (let i = 0; i < fileCount; i++) {
      testFiles.push(`
        function test${i}() {
          const data = Array.from({length: ${10 + (i % 50)}}, (_, j) => j + i);
          return data.map(x => x * 2).filter(x => x > ${i % 20});
        }
      `);
    }

    const memBefore = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    // Process files
    for (const file of testFiles) {
      this.engine.parseASTUltraFast(file);
    }

    const memAfter = process.memoryUsage().heapUsed;
    const processingTime = performance.now() - startTime;
    const memoryUsed = (memAfter - memBefore) / (1024 * 1024); // MB
    const memoryEfficiency = memoryUsed / (fileCount / 1000); // MB per 1000 files

    // Update targets
    this.updateTarget('memory_efficiency', memoryEfficiency);

    // Publish progress
    await this.publishValidationUpdate({
      type: 'VALIDATION_UPDATE',
      swarmId: this.swarmId,
      timestamp: Date.now(),
      agent: this.agentId,
      confidence: 0.85,
      data: {
        validationId,
        target: 'memory_efficiency',
        value: memoryEfficiency,
        achieved: memoryEfficiency <= 10,
        progress: 65
      }
    });
  }

  /**
   * Validate Redis coordination
   */
  private async validateRedisCoordination(validationId: string): Promise<void> {
    if (!this.redisClient) {
      console.warn('⚠️  Redis client not available - skipping coordination validation');
      return;
    }

    const coordinationTests = [];
    const testCount = 10;

    for (let i = 0; i < testCount; i++) {
      const startTime = performance.now();

      try {
        // Publish test message
        await this.redisClient.publish(`swarm:${this.swarmId}`, JSON.stringify({
          type: 'COORDINATION_TEST',
          swarmId: this.swarmId,
          timestamp: Date.now(),
          agent: this.agentId,
          confidence: 0.9,
          data: { testId: i, timestamp: Date.now() }
        }));

        const latency = performance.now() - startTime;
        coordinationTests.push(latency);

      } catch (error) {
        console.warn(`Redis coordination test ${i} failed:`, error.message);
      }
    }

    const avgLatency = coordinationTests.length > 0
      ? coordinationTests.reduce((a, b) => a + b, 0) / coordinationTests.length
      : 0;

    // Update targets
    this.updateTarget('redis_coordination_latency', avgLatency);

    // Publish progress
    await this.publishValidationUpdate({
      type: 'VALIDATION_UPDATE',
      swarmId: this.swarmId,
      timestamp: Date.now(),
      agent: this.agentId,
      confidence: 0.8,
      data: {
        validationId,
        target: 'redis_coordination',
        value: avgLatency,
        achieved: avgLatency <= 10,
        progress: 80
      }
    });
  }

  /**
   * Validate throughput
   */
  private async validateThroughput(validationId: string): Promise<void> {
    const testFile = `
      function throughputTest() {
        return true;
      }
    `;

    const testCount = 1000;
    const startTime = performance.now();

    for (let i = 0; i < testCount; i++) {
      this.engine.parseASTUltraFast(testFile);
    }

    const processingTime = performance.now() - startTime;
    const throughput = testCount / (processingTime / 1000); // files per second

    // Update targets
    this.updateTarget('throughput', throughput);

    // Publish progress
    await this.publishValidationUpdate({
      type: 'VALIDATION_UPDATE',
      swarmId: this.swarmId,
      timestamp: Date.now(),
      agent: this.agentId,
      confidence: 0.9,
      data: {
        validationId,
        target: 'throughput',
        value: throughput,
        achieved: throughput >= 1000,
        progress: 95
      }
    });
  }

  /**
   * Update validation target
   */
  private updateTarget(targetName: string, actualValue: number): void {
    const target = this.validationTargets.find(t => t.name === targetName);
    if (target) {
      target.actualValue = actualValue;
      target.achieved = this.isTargetAchieved(target);
      target.confidence = this.calculateTargetConfidence(target, actualValue);
    }
  }

  /**
   * Check if target is achieved
   */
  private isTargetAchieved(target: ValidationTarget): boolean {
    const tolerance = target.tolerance / 100;
    const minAcceptable = target.targetValue * (1 - tolerance);
    const maxAcceptable = target.targetValue * (1 + tolerance);

    return target.actualValue >= minAcceptable && target.actualValue <= maxAcceptable;
  }

  /**
   * Calculate target confidence
   */
  private calculateTargetConfidence(target: ValidationTarget, actualValue: number): number {
    const deviation = Math.abs(actualValue - target.targetValue) / target.targetValue;
    const tolerance = target.tolerance / 100;

    if (deviation <= tolerance * 0.5) {
      return 0.95; // High confidence
    } else if (deviation <= tolerance) {
      return 0.85; // Medium confidence
    } else if (deviation <= tolerance * 2) {
      return 0.70; // Low confidence
    } else {
      return 0.50; // Very low confidence
    }
  }

  /**
   * Generate validation report
   */
  private async generateValidationReport(validationId: string, duration: number): Promise<ValidationReport> {
    const achievedTargets = this.validationTargets.filter(t => t.achieved);
    const overallScore = (achievedTargets.length / this.validationTargets.length) * 100;
    const overallAchieved = achievedTargets.length === this.validationTargets.length;

    // Calculate confidence score
    const confidenceScore = this.validationTargets.reduce((sum, t) => sum + t.confidence, 0) / this.validationTargets.length;

    // Get performance metrics
    const engineMetrics = this.engine.getOptimizedMetrics();
    const pipelineMetrics = this.pipeline.getMetrics();

    const performanceMetrics = {
      astOperations: engineMetrics.totalOperations,
      averageParseTime: engineMetrics.averageTime,
      averageTransformTime: 0, // Would need to track separately
      subMillisecondRate: engineMetrics.subMillisecondPercentage,
      cacheHitRate: engineMetrics.cacheHitRate,
      memoryEfficiency: pipelineMetrics.memoryEfficiency,
      throughput: engineMetrics.throughput
    };

    // Redis coordination metrics
    const redisCoordination = {
      connected: !!this.redisClient,
      messagesPublished: this.redisMessages.length,
      messagesReceived: this.redisMessages.length,
      coordinationLatency: this.coordinationStartTime > 0 ? (Date.now() - this.coordinationStartTime) : 0
    };

    // Generate recommendations
    const recommendations = this.generateRecommendations();
    const nextSteps = this.generateNextSteps(overallAchieved, overallScore);

    const report: ValidationReport = {
      timestamp: Date.now(),
      agentId: this.agentId,
      swarmId: this.swarmId,
      validationId,
      duration,
      overallScore,
      overallAchieved,
      targets: [...this.validationTargets],
      performanceMetrics,
      redisCoordination,
      confidenceScore,
      recommendations,
      nextSteps
    };

    return report;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const failedTargets = this.validationTargets.filter(t => !t.achieved);

    if (failedTargets.length > 0) {
      recommendations.push(`${failedTargets.length} targets not achieved: ${failedTargets.map(t => t.name).join(', ')}`);
    }

    const subMsTarget = this.validationTargets.find(t => t.name === 'sub_millisecond_rate');
    if (subMsTarget && !subMsTarget.achieved) {
      recommendations.push('Sub-millisecond performance below target - implement advanced caching strategies');
    }

    const memoryTarget = this.validationTargets.find(t => t.name === 'memory_efficiency');
    if (memoryTarget && !memoryTarget.achieved) {
      recommendations.push('Memory efficiency below target - optimize memory pool management');
    }

    const throughputTarget = this.validationTargets.find(t => t.name === 'throughput');
    if (throughputTarget && !throughputTarget.achieved) {
      recommendations.push('Throughput below target - implement parallel processing optimizations');
    }

    if (recommendations.length === 0) {
      recommendations.push('All performance targets achieved - consider increasing optimization targets');
    }

    return recommendations;
  }

  /**
   * Generate next steps
   */
  private generateNextSteps(overallAchieved: boolean, overallScore: number): string[] {
    const nextSteps: string[] = [];

    if (overallAchieved) {
      nextSteps.push('🎯 All targets achieved - ready for production deployment');
      nextSteps.push('📈 Implement continuous performance monitoring');
      nextSteps.push('🚀 Scale to production workload');
    } else {
      nextSteps.push('⚠️ Address failed performance targets');
      nextSteps.push('🔧 Implement recommended optimizations');
      nextSteps.push('📊 Re-run validation after improvements');
    }

    if (overallScore >= 90) {
      nextSteps.push('🏆 Excellent performance - document optimization strategies');
    } else if (overallScore >= 70) {
      nextSteps.push('✅ Good performance - focus on remaining optimization opportunities');
    } else {
      nextSteps.push('🚨 Performance needs significant improvement');
      nextSteps.push('📚 Review performance optimization best practices');
    }

    return nextSteps;
  }

  /**
   * Publish validation update
   */
  private async publishValidationUpdate(message: RedisValidationMessage): Promise<void> {
    if (!this.redisClient) {
      return;
    }

    try {
      await this.redisClient.publish(`swarm:${this.swarmId}`, JSON.stringify(message));
      this.redisMessages.push(message);
    } catch (error) {
      console.warn('Failed to publish validation update:', error);
    }
  }

  /**
   * Handle Redis messages
   */
  private async handleRedisMessage(message: RedisValidationMessage): Promise<void> {
    if (message.agent === this.agentId) {
      return; // Ignore own messages
    }

    this.redisMessages.push(message);

    if (message.type === 'TARGET_ACHIEVED') {
      console.log(`🎯 Target achieved by ${message.agent}: ${message.data.target}`);
    } else if (message.type === 'TARGET_MISSED') {
      console.log(`❌ Target missed by ${message.agent}: ${message.data.target}`);
    }
  }

  /**
   * Get validation status
   */
  getStatus(): any {
    return {
      agentId: this.agentId,
      swarmId: this.swarmId,
      targetsCount: this.validationTargets.length,
      achievedTargets: this.validationTargets.filter(t => t.achieved).length,
      redisConnected: !!this.redisClient,
      messagesExchanged: this.redisMessages.length,
      engineMetrics: this.engine.getOptimizedMetrics(),
      pipelineMetrics: this.pipeline.getMetrics()
    };
  }

  /**
   * Shutdown validator
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down AST Performance Validator...');

    await this.engine.shutdown();
    await this.benchmark.shutdown();
    await this.pipeline.shutdown();

    if (this.redisClient) {
      try {
        await this.publishValidationUpdate({
          type: 'VALIDATION_COMPLETE',
          swarmId: this.swarmId,
          timestamp: Date.now(),
          agent: this.agentId,
          confidence: 1.0,
          data: { shutdown: true }
        });
      } catch (error) {
        console.warn('Failed to publish shutdown message:', error);
      }
    }

    console.log(`✅ AST Performance Validator shutdown complete - Agent: ${this.agentId}`);
  }
}

export default ASTPerformanceValidator;