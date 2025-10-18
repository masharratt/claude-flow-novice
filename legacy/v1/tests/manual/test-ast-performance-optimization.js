#!/usr/bin/env node

/**
 * AST Performance Optimization Test Suite
 *
 * Demonstrates sub-millisecond AST operations with Redis coordination
 * and validates all performance targets are met
 */

import { performance } from 'perf_hooks';
import { createHash } from 'crypto';

// Import optimized components
import OptimizedASTEngine from '../../src/wasm-ast/engine/optimized-ast-engine.js';
import SubMillisecondBenchmark from '../../src/wasm-ast/performance/sub-millisecond-benchmark.js';
import MemoryOptimizedPipeline from '../../src/wasm-ast/processing/memory-optimized-pipeline.js';
import ASTPerformanceValidator from '../../src/wasm-ast/validation/performance-validation.js';

// Mock Redis client for demonstration
const mockRedisClient = {
  messages: [],

  async publish(channel, message) {
    this.messages.push({ channel, message, timestamp: Date.now() });
    console.log(`📡 [REDIS] Published to ${channel}: ${message.substring(0, 100)}...`);
    return Promise.resolve();
  },

  async subscribe(channel, callback) {
    console.log(`📡 [REDIS] Subscribed to ${channel}`);
    // Simulate receiving messages
    setTimeout(() => {
      callback(JSON.stringify({
        type: 'SWARM_INIT',
        swarmId: 'ast-performance-optimization',
        timestamp: Date.now(),
        agent: 'mock-agent',
        confidence: 0.9,
        data: { test: true }
      }));
    }, 100);
    return Promise.resolve();
  }
};

/**
 * Main test execution function
 */
async function runASTPerformanceOptimizationTest() {
  console.log('🚀 AST Performance Optimization Test Suite');
  console.log('=' .repeat(60));
  console.log('Testing sub-millisecond AST operations with Redis coordination...');
  console.log('');

  const swarmId = 'ast-performance-optimization';
  const testResults = {
    engineOptimizations: {},
    benchmarkResults: {},
    pipelineResults: {},
    validationResults: {},
    overallSuccess: false,
    confidence: 0
  };

  try {
    // Test 1: Optimized AST Engine
    console.log('📊 Test 1: Optimized AST Engine Performance');
    console.log('-'.repeat(40));
    testResults.engineOptimizations = await testOptimizedASTEngine(swarmId, mockRedisClient);
    console.log('');

    // Test 2: Sub-Millisecond Benchmark
    console.log('⚡ Test 2: Sub-Millisecond Performance Benchmark');
    console.log('-'.repeat(40));
    testResults.benchmarkResults = await testSubMillisecondBenchmark(swarmId, mockRedisClient);
    console.log('');

    // Test 3: Memory-Optimized Pipeline
    console.log('🧠 Test 3: Memory-Optimized Processing Pipeline');
    console.log('-'.repeat(40));
    testResults.pipelineResults = await testMemoryOptimizedPipeline(swarmId, mockRedisClient);
    console.log('');

    // Test 4: Performance Validation
    console.log('🔍 Test 4: Comprehensive Performance Validation');
    console.log('-'.repeat(40));
    testResults.validationResults = await testPerformanceValidation(swarmId, mockRedisClient);
    console.log('');

    // Calculate overall results
    testResults.overallSuccess = calculateOverallSuccess(testResults);
    testResults.confidence = calculateOverallConfidence(testResults);

    // Display final results
    displayFinalResults(testResults);

  } catch (error) {
    console.error('❌ Test suite failed:', error);
    testResults.overallSuccess = false;
    testResults.confidence = 0;
  }

  return testResults;
}

/**
 * Test optimized AST engine
 */
async function testOptimizedASTEngine(swarmId, redisClient) {
  const engine = new OptimizedASTEngine(swarmId, redisClient);

  const testCode = `
    function optimizedFunction(param) {
      if (param > 0) {
        const result = param * 2;
        return result > 100 ? result : result + 50;
      }
      return 0;
    }

    class OptimizedClass {
      constructor(value) {
        this.value = value;
        this.cache = new Map();
      }

      getValue() {
        return this.value;
      }

      setValue(newValue) {
        if (newValue !== this.value) {
          this.cache.clear();
          this.value = newValue;
        }
      }
    }
  `;

  console.log('🔄 Testing AST parsing performance...');

  // Test multiple parses
  const iterations = 100;
  const parseTimes = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();
    const ast = engine.parseASTUltraFast(testCode);
    const parseTime = performance.now() - startTime;
    parseTimes.push(parseTime);
  }

  const averageParseTime = parseTimes.reduce((a, b) => a + b, 0) / parseTimes.length;
  const subMsCount = parseTimes.filter(t => t < 1.0).length;
  const subMsPercentage = (subMsCount / parseTimes.length) * 100;

  console.log(`  📈 Average parse time: ${averageParseTime.toFixed(3)}ms`);
  console.log(`  ⚡ Sub-millisecond operations: ${subMsPercentage.toFixed(1)}%`);

  // Test transformations
  console.log('🔄 Testing AST transformations...');

  const transformTimes = [];
  for (let i = 0; i < 50; i++) {
    const ast = engine.parseASTUltraFast(testCode);
    const startTime = performance.now();
    const transformed = engine.transformASTOptimized(ast, ['all']);
    const transformTime = performance.now() - startTime;
    transformTimes.push(transformTime);
  }

  const averageTransformTime = transformTimes.reduce((a, b) => a + b, 0) / transformTimes.length;

  console.log(`  📈 Average transform time: ${averageTransformTime.toFixed(3)}ms`);

  // Get engine metrics
  const metrics = engine.getOptimizedMetrics();
  console.log(`  🧠 Memory usage: ${metrics.memoryUsage.toFixed(2)}MB`);
  console.log(`  💾 Cache hit rate: ${metrics.cacheHitRate.toFixed(1)}%`);
  console.log(`  📊 Throughput: ${metrics.throughput.toFixed(0)} ops/sec`);

  await engine.shutdown();

  return {
    averageParseTime,
    averageTransformTime,
    subMsPercentage,
    memoryUsage: metrics.memoryUsage,
    cacheHitRate: metrics.cacheHitRate,
    throughput: metrics.throughput,
    success: averageParseTime < 1.0 && subMsPercentage > 80
  };
}

/**
 * Test sub-millisecond benchmark
 */
async function testSubMillisecondBenchmark(swarmId, redisClient) {
  const benchmark = new SubMillisecondBenchmark(swarmId, redisClient);

  console.log('🔄 Running sub-millisecond benchmark suite...');

  const startTime = performance.now();
  const report = await benchmark.runBenchmarkSuite();
  const duration = performance.now() - startTime;

  console.log(`  ⏱️  Benchmark duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`  📊 Overall score: ${report.overallScore.toFixed(2)}%`);
  console.log(`  🎯 Target achieved: ${report.overallTargetAchieved ? 'YES' : 'NO'}`);
  console.log(`  📈 Total operations: ${report.summary.totalOperations}`);
  console.log(`  ⚡ Sub-millisecond rate: ${report.summary.overallSubMillisecondRate.toFixed(1)}%`);
  console.log(`  💾 Cache hit rate: ${report.summary.cacheHitRate.toFixed(1)}%`);
  console.log(`  📊 Average throughput: ${report.summary.averageThroughput.toFixed(0)} ops/sec`);

  await benchmark.shutdown();

  return {
    overallScore: report.overallScore,
    targetAchieved: report.overallTargetAchieved,
    totalOperations: report.summary.totalOperations,
    subMsRate: report.summary.overallSubMillisecondRate,
    cacheHitRate: report.summary.cacheHitRate,
    throughput: report.summary.averageThroughput,
    success: report.overallTargetAchieved && report.overallScore >= 80
  };
}

/**
 * Test memory-optimized pipeline
 */
async function testMemoryOptimizedPipeline(swarmId, redisClient) {
  const pipeline = new MemoryOptimizedPipeline(swarmId, 512, redisClient);

  console.log('🔄 Testing memory-optimized processing...');

  // Create test batch
  const testFiles = [];
  for (let i = 0; i < 100; i++) {
    testFiles.push(`
      function memoryTest${i}() {
        const data = Array.from({length: ${10 + (i % 20)}}, (_, j) => j + i);
        return data
          .map(x => x * 2)
          .filter(x => x > ${i % 10})
          .reduce((a, b) => a + b, 0);
      }
    `);
  }

  const batch = {
    id: `test-batch-${Date.now()}`,
    files: testFiles,
    operations: ['parse', 'transform', 'optimize'],
    priority: 1,
    timestamp: Date.now(),
    status: 'pending',
    memoryBudget: 100 // 100MB budget
  };

  console.log(`  📁 Processing batch of ${testFiles.length} files...`);

  const startTime = performance.now();
  const results = await pipeline.processBatchOptimized(batch);
  const processingTime = performance.now() - startTime;

  console.log(`  ⏱️  Processing time: ${processingTime.toFixed(2)}ms`);
  console.log(`  📊 Files processed: ${results.length}`);
  console.log(`  📈 Throughput: ${(results.length / (processingTime / 1000)).toFixed(0)} files/sec`);

  // Get memory status
  const memoryStatus = pipeline.getMemoryStatus();
  console.log(`  🧠 Memory usage: ${memoryStatus.currentMemoryUsage.toFixed(2)}MB`);
  console.log(`  💾 Memory efficiency: ${memoryStatus.metrics.memoryEfficiency.toFixed(2)}MB/1000 files`);
  console.log(`  🔄 GC frequency: ${memoryStatus.metrics.gcFrequency}`);

  await pipeline.shutdown();

  return {
    processingTime,
    filesProcessed: results.length,
    throughput: results.length / (processingTime / 1000),
    memoryUsage: memoryStatus.currentMemoryUsage,
    memoryEfficiency: memoryStatus.metrics.memoryEfficiency,
    success: processingTime < 5000 && memoryStatus.currentMemoryUsage < 200
  };
}

/**
 * Test performance validation
 */
async function testPerformanceValidation(swarmId, redisClient) {
  const validator = new ASTPerformanceValidator(swarmId, redisClient);

  console.log('🔄 Running comprehensive performance validation...');

  const startTime = performance.now();
  const report = await validator.runValidation();
  const duration = performance.now() - startTime;

  console.log(`  ⏱️  Validation duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`  📊 Overall score: ${report.overallScore.toFixed(2)}%`);
  console.log(`  🎯 Overall achieved: ${report.overallAchieved ? 'YES' : 'NO'}`);
  console.log(`  🔍 Confidence score: ${report.confidenceScore.toFixed(2)}`);
  console.log(`  📈 Targets achieved: ${report.targets.filter(t => t.achieved).length}/${report.targets.length}`);

  // Display key targets
  const keyTargets = [
    'sub_millisecond_parse_time',
    'sub_millisecond_rate',
    'complex_code_success',
    'memory_efficiency',
    'throughput'
  ];

  console.log('  🎯 Key target results:');
  for (const targetName of keyTargets) {
    const target = report.targets.find(t => t.name === targetName);
    if (target) {
      const status = target.achieved ? '✅' : '❌';
      console.log(`    ${status} ${target.name}: ${target.actualValue.toFixed(3)}${target.unit} (target: ${target.targetValue}${target.unit})`);
    }
  }

  await validator.shutdown();

  return {
    overallScore: report.overallScore,
    overallAchieved: report.overallAchieved,
    confidenceScore: report.confidenceScore,
    targetsAchieved: report.targets.filter(t => t.achieved).length,
    totalTargets: report.targets.length,
    keyTargetResults: keyTargets.map(name => {
      const target = report.targets.find(t => t.name === name);
      return {
        name,
        achieved: target?.achieved || false,
        actual: target?.actualValue || 0,
        target: target?.targetValue || 0,
        unit: target?.unit || ''
      };
    }),
    success: report.overallAchieved && report.confidenceScore >= 0.85
  };
}

/**
 * Calculate overall success
 */
function calculateOverallSuccess(results) {
  const components = [
    results.engineOptimizations,
    results.benchmarkResults,
    results.pipelineResults,
    results.validationResults
  ];

  const successCount = components.filter(r => r.success).length;
  return successCount === components.length;
}

/**
 * Calculate overall confidence
 */
function calculateOverallConfidence(results) {
  const confidences = [
    results.engineOptimizations.subMsPercentage / 100,
    results.benchmarkResults.overallScore / 100,
    results.validationResults.confidenceScore
  ];

  return confidences.reduce((a, b) => a + b, 0) / confidences.length;
}

/**
 * Display final results
 */
function displayFinalResults(results) {
  console.log('🏁 FINAL RESULTS');
  console.log('='.repeat(60));

  const overallStatus = results.overallSuccess ? '✅ PASSED' : '❌ FAILED';
  const confidenceStatus = results.confidence >= 0.85 ? 'HIGH' : results.confidence >= 0.70 ? 'MEDIUM' : 'LOW';

  console.log(`🎯 Overall Status: ${overallStatus}`);
  console.log(`📊 Confidence: ${confidenceStatus} (${(results.confidence * 100).toFixed(1)}%)`);
  console.log('');

  console.log('📈 Component Results:');
  console.log(`  🔧 AST Engine: ${results.engineOptimizations.success ? '✅' : '❌'} (${results.engineOptimizations.subMsPercentage.toFixed(1)}% sub-ms)`);
  console.log(`  ⚡ Benchmark: ${results.benchmarkResults.success ? '✅' : '❌'} (${results.benchmarkResults.overallScore.toFixed(1)}% score)`);
  console.log(`  🧠 Pipeline: ${results.pipelineResults.success ? '✅' : '❌'} (${results.pipelineResults.throughput.toFixed(0)} files/sec)`);
  console.log(`  🔍 Validation: ${results.validationResults.success ? '✅' : '❌'} (${results.validationResults.overallScore.toFixed(1)}% score)`);
  console.log('');

  // Performance targets achieved
  console.log('🎯 Performance Targets Achieved:');
  const targets = [
    { name: 'Sub-millisecond parse time', achieved: results.engineOptimizations.averageParseTime < 1.0, value: `${results.engineOptimizations.averageParseTime.toFixed(3)}ms` },
    { name: 'Sub-millisecond operations rate', achieved: results.engineOptimizations.subMsPercentage > 80, value: `${results.engineOptimizations.subMsPercentage.toFixed(1)}%` },
    { name: 'Memory efficiency', achieved: results.pipelineResults.memoryEfficiency < 10, value: `${results.pipelineResults.memoryEfficiency.toFixed(2)}MB/1000 files` },
    { name: 'Processing throughput', achieved: results.pipelineResults.throughput > 1000, value: `${results.pipelineResults.throughput.toFixed(0)} files/sec` },
    { name: 'Benchmark score', achieved: results.benchmarkResults.overallScore > 80, value: `${results.benchmarkResults.overallScore.toFixed(1)}%` },
    { name: 'Validation confidence', achieved: results.validationResults.confidenceScore > 0.85, value: `${(results.validationResults.confidenceScore * 100).toFixed(1)}%` }
  ];

  targets.forEach(target => {
    const status = target.achieved ? '✅' : '❌';
    console.log(`  ${status} ${target.name}: ${target.value}`);
  });
  console.log('');

  // Redis coordination summary
  console.log('🐝 Redis Coordination:');
  console.log(`  📡 Messages published: ${mockRedisClient.messages.length}`);
  console.log(`  🔗 Swarm coordination: ${mockRedisClient.messages.length > 0 ? '✅ Active' : '❌ Inactive'}`);
  console.log('');

  // Recommendations
  console.log('💡 Recommendations:');
  if (results.overallSuccess) {
    console.log('  🎉 All targets achieved! Ready for production deployment.');
    console.log('  📈 Consider implementing continuous performance monitoring.');
    console.log('  🚀 Scale to production workload with confidence monitoring.');
  } else {
    console.log('  ⚠️  Some targets not achieved - review failed components.');
    console.log('  🔧 Implement recommended optimizations before production.');
    console.log('  📊 Re-run validation after improvements.');
  }
  console.log('');

  console.log('📊 Test completed successfully!');
}

/**
 * Main execution
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  runASTPerformanceOptimizationTest()
    .then(results => {
      process.exit(results.overallSuccess ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { runASTPerformanceOptimizationTest };