#!/usr/bin/env node

/**
 * Performance Validation Test for Dependency Resolution Engine
 *
 * Validates <10ms resolution overhead with up to 10,000 nodes
 * Tests Tarjan's algorithm performance and topological sorting efficiency
 */

import { performance } from 'perf_hooks';
import { DependencyResolver } from './dependency-resolver.js';
import { ConflictResolutionEngine } from './conflict-resolution-engine.js';
import { RedisCoordinationManager } from './redis-coordination.js';
import crypto from 'crypto';

/**
 * Performance Test Configuration
 */
const TEST_CONFIG = {
  nodeCounts: [100, 500, 1000, 5000, 10000],
  densityFactors: [0.1, 0.2, 0.3], // Average dependencies per node
  conflictRatios: [0.05, 0.1, 0.2], // Percentage of conflicting tasks
  maxResolutionTime: 10, // ms target
  testIterations: 5,
  enableRedisTests: false // Set to true if Redis is available
};

/**
 * Performance Metrics Collector
 */
class PerformanceTestMetrics {
  constructor() {
    this.testResults = [];
    this.startTime = performance.now();
  }

  recordTest(testName, nodeCount, duration, operations, conflicts = 0) {
    this.testResults.push({
      testName,
      nodeCount,
      duration,
      operations,
      conflicts,
      throughput: operations / duration * 1000, // ops per second
      perNodeTime: duration / nodeCount, // ms per node
      timestamp: performance.now() - this.startTime
    });
  }

  generateReport() {
    const report = {
      summary: this.generateSummary(),
      byNodeCount: this.groupByNodeCount(),
      byTestType: this.groupByTestType(),
      performanceAnalysis: this.analyzePerformance(),
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  generateSummary() {
    const totalTests = this.testResults.length;
    const avgResolutionTime = this.testResults.reduce((sum, test) => sum + test.duration, 0) / totalTests;
    const maxResolutionTime = Math.max(...this.testResults.map(test => test.duration));
    const avgThroughput = this.testResults.reduce((sum, test) => sum + test.throughput, 0) / totalTests;

    return {
      totalTests,
      avgResolutionTime: avgResolutionTime.toFixed(2),
      maxResolutionTime: maxResolutionTime.toFixed(2),
      avgThroughput: avgThroughput.toFixed(0),
      targetMet: maxResolutionTime <= TEST_CONFIG.maxResolutionTime
    };
  }

  groupByNodeCount() {
    const grouped = {};

    for (const test of this.testResults) {
      const count = test.nodeCount;
      if (!grouped[count]) {
        grouped[count] = [];
      }
      grouped[count].push(test);
    }

    // Calculate averages for each node count
    for (const count of Object.keys(grouped)) {
      const tests = grouped[count];
      const avgDuration = tests.reduce((sum, t) => sum + t.duration, 0) / tests.length;
      const maxDuration = Math.max(...tests.map(t => t.duration));
      const avgThroughput = tests.reduce((sum, t) => sum + t.throughput, 0) / tests.length;

      grouped[count] = {
        count: tests.length,
        avgDuration: avgDuration.toFixed(2),
        maxDuration: maxDuration.toFixed(2),
        avgThroughput: avgThroughput.toFixed(0),
        targetMet: maxDuration <= TEST_CONFIG.maxResolutionTime
      };
    }

    return grouped;
  }

  groupByTestType() {
    const grouped = {};

    for (const test of this.testResults) {
      const type = test.testName;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(test);
    }

    // Calculate averages for each test type
    for (const type of Object.keys(grouped)) {
      const tests = grouped[type];
      const avgDuration = tests.reduce((sum, t) => sum + t.duration, 0) / tests.length;
      const maxDuration = Math.max(...tests.map(t => t.duration));
      const avgThroughput = tests.reduce((sum, t) => sum + t.throughput, 0) / tests.length;

      grouped[type] = {
        count: tests.length,
        avgDuration: avgDuration.toFixed(2),
        maxDuration: maxDuration.toFixed(2),
        avgThroughput: avgThroughput.toFixed(0),
        targetMet: maxDuration <= TEST_CONFIG.maxResolutionTime
      };
    }

    return grouped;
  }

  analyzePerformance() {
    const slowTests = this.testResults.filter(test => test.duration > TEST_CONFIG.maxResolutionTime);
    const fastTests = this.testResults.filter(test => test.duration <= TEST_CONFIG.maxResolutionTime);

    return {
      slowTests: slowTests.length,
      fastTests: fastTests.length,
      successRate: ((fastTests.length / this.testResults.length) * 100).toFixed(1),
      averageSlowdown: slowTests.length > 0
        ? (slowTests.reduce((sum, test) => sum + test.duration, 0) / slowTests.length / TEST_CONFIG.maxResolutionTime).toFixed(1)
        : 'N/A'
    };
  }

  generateRecommendations() {
    const recommendations = [];
    const analysis = this.analyzePerformance();

    if (analysis.successRate < 90) {
      recommendations.push('Consider optimizing algorithms for better performance');
    }

    const slowByNodeCount = this.groupByNodeCount();
    for (const [count, stats] of Object.entries(slowByNodeCount)) {
      if (!stats.targetMet) {
        recommendations.push(`Performance degrades significantly at ${count} nodes - investigate scalability`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Performance targets are consistently met');
    }

    return recommendations;
  }
}

/**
 * Test Data Generator
 */
class TestDataGenerator {
  static generateNodeId() {
    return `task_${crypto.randomBytes(4).toString('hex')}`;
  }

  static generateDependencyGraph(nodeCount, densityFactor) {
    const resolver = new DependencyResolver();
    const nodes = [];

    // Generate nodes
    for (let i = 0; i < nodeCount; i++) {
      const nodeId = this.generateNodeId();
      const taskData = {
        priority: Math.floor(Math.random() * 10),
        estimatedDuration: Math.floor(Math.random() * 1000) + 100,
        requiredResources: this.generateResources(),
        deadline: Math.random() > 0.7 ? Date.now() + Math.floor(Math.random() * 10000) : null,
        critical: Math.random() > 0.9
      };

      resolver.addTask(nodeId, taskData);
      nodes.push(nodeId);
    }

    // Generate dependencies based on density factor
    const avgDependencies = Math.max(1, Math.floor(nodeCount * densityFactor));
    const totalDependencies = Math.min(nodeCount * (nodeCount - 1) / 2, nodeCount * avgDependencies);

    for (let i = 0; i < totalDependencies; i++) {
      const fromIndex = Math.floor(Math.random() * nodeCount);
      const toIndex = Math.floor(Math.random() * nodeCount);

      if (fromIndex !== toIndex) {
        try {
          resolver.addDependency(nodes[fromIndex], nodes[toIndex]);
        } catch (error) {
          // Cycle detected, ignore this dependency
        }
      }
    }

    return { resolver, nodes };
  }

  static generateResources() {
    const resources = [];
    const resourceCount = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < resourceCount; i++) {
      resources.push(`resource_${['cpu', 'memory', 'disk', 'network', 'gpu'][Math.floor(Math.random() * 5)]}_${i}`);
    }

    return resources;
  }

  static generateConflicts(resolver, conflictRatio) {
    const conflictEngine = new ConflictResolutionEngine(resolver);
    const nodeCount = resolver.graph.nodes.size;
    const conflictCount = Math.floor(nodeCount * conflictRatio);

    // Artificially create conflicts by setting conflicting requirements
    const nodes = Array.from(resolver.graph.nodes.values());
    const conflicts = [];

    for (let i = 0; i < conflictCount; i++) {
      const nodeIndex = Math.floor(Math.random() * nodes.length);
      const node = nodes[nodeIndex];

      // Create resource conflicts
      if (Math.random() > 0.5) {
        node.data.requiredResources = ['shared_resource'];
        conflicts.push({ type: 'resource', nodeId: node.id });
      }

      // Create deadline conflicts
      if (Math.random() > 0.5) {
        node.data.deadline = Date.now() + 1000; // Very tight deadline
        conflicts.push({ type: 'deadline', nodeId: node.id });
      }

      // Create priority inversions
      if (Math.random() > 0.5) {
        node.data.priority = Math.floor(Math.random() * 10);
        conflicts.push({ type: 'priority', nodeId: node.id });
      }
    }

    return { conflictEngine, conflicts };
  }
}

/**
 * Performance Test Suite
 */
class PerformanceTestSuite {
  constructor() {
    this.metrics = new PerformanceTestMetrics();
  }

  async runAllTests() {
    console.log('🚀 Starting Dependency Resolution Performance Validation Tests\n');

    try {
      // Basic dependency resolution tests
      await this.testBasicResolution();
      await this.testTopologicalSorting();
      await this.testCycleDetection();

      // Conflict resolution tests
      await this.testConflictResolution();

      // Scalability tests
      await this.testScalability();

      // Redis coordination tests (if enabled)
      if (TEST_CONFIG.enableRedisTests) {
        await this.testRedisCoordination();
      }

      // Generate final report
      const report = this.metrics.generateReport();
      this.printReport(report);

      return report;

    } catch (error) {
      console.error('❌ Performance test suite failed:', error);
      throw error;
    }
  }

  async testBasicResolution() {
    console.log('📊 Testing Basic Dependency Resolution...');

    for (const nodeCount of TEST_CONFIG.nodeCounts) {
      for (const iteration = 0; iteration < TEST_CONFIG.testIterations; iteration++) {
        const { resolver } = TestDataGenerator.generateDependencyGraph(nodeCount, 0.1);

        const startTime = performance.now();
        const resolution = resolver.resolve();
        const duration = performance.now() - startTime;

        this.metrics.recordTest('basic_resolution', nodeCount, duration, 1, 0);

        console.log(`   ✅ ${nodeCount} nodes: ${duration.toFixed(2)}ms (${(duration/nodeCount).toFixed(3)}ms/node)`);
      }
    }
  }

  async testTopologicalSorting() {
    console.log('\n📊 Testing Topological Sorting Performance...');

    for (const nodeCount of TEST_CONFIG.nodeCounts) {
      for (const density of TEST_CONFIG.densityFactors) {
        const { resolver } = TestDataGenerator.generateDependencyGraph(nodeCount, density);

        const startTime = performance.now();
        const resolution = resolver.resolve();
        const duration = performance.now() - startTime;

        this.metrics.recordTest('topological_sort', nodeCount, duration, nodeCount);

        console.log(`   ✅ ${nodeCount} nodes, density ${density}: ${duration.toFixed(2)}ms`);
      }
    }
  }

  async testCycleDetection() {
    console.log('\n📊 Testing Cycle Detection Performance...');

    for (const nodeCount of TEST_CONFIG.nodeCounts) {
      for (const iteration = 0; iteration < TEST_CONFIG.testIterations; iteration++) {
        const { resolver } = TestDataGenerator.generateDependencyGraph(nodeCount, 0.2);

        const startTime = performance.now();
        const hasCycles = resolver.hasCycles();
        const duration = performance.now() - startTime;

        this.metrics.recordTest('cycle_detection', nodeCount, duration, 1);

        console.log(`   ✅ ${nodeCount} nodes: ${duration.toFixed(2)}ms (cycles: ${hasCycles})`);
      }
    }
  }

  async testConflictResolution() {
    console.log('\n📊 Testing Conflict Resolution Performance...');

    for (const nodeCount of TEST_CONFIG.nodeCounts) {
      for (const conflictRatio of TEST_CONFIG.conflictRatios) {
        const { resolver } = TestDataGenerator.generateDependencyGraph(nodeCount, 0.15);
        const { conflictEngine } = TestDataGenerator.generateConflicts(resolver, conflictRatio);

        const startTime = performance.now();
        const conflicts = await conflictEngine.detectConflicts();
        const resolution = await conflictEngine.resolveAllConflicts();
        const duration = performance.now() - startTime;

        this.metrics.recordTest('conflict_resolution', nodeCount, duration, conflicts.length, conflicts.length);

        console.log(`   ✅ ${nodeCount} nodes, ${conflicts.length} conflicts: ${duration.toFixed(2)}ms`);
      }
    }
  }

  async testScalability() {
    console.log('\n📊 Testing Scalability Limits...');

    // Test with maximum node count
    const maxNodes = 10000;
    const { resolver } = TestDataGenerator.generateDependencyGraph(maxNodes, 0.1);

    const startTime = performance.now();
    const resolution = resolver.resolve();
    const duration = performance.now() - startTime;

    this.metrics.recordTest('scalability_test', maxNodes, duration, maxNodes);

    const targetMet = duration <= TEST_CONFIG.maxResolutionTime;
    console.log(`   ${targetMet ? '✅' : '❌'} ${maxNodes} nodes: ${duration.toFixed(2)}ms (target: ${TEST_CONFIG.maxResolutionTime}ms)`);

    if (!targetMet) {
      console.log(`   ⚠️  Performance target not met - exceeded by ${(duration - TEST_CONFIG.maxResolutionTime).toFixed(2)}ms`);
    }
  }

  async testRedisCoordination() {
    console.log('\n📊 Testing Redis Coordination Performance...');

    try {
      const coordinator = new RedisCoordinationManager({
        enablePersistence: false,
        syncInterval: 10000
      });

      await coordinator.initialize();

      for (const nodeCount of [100, 500, 1000]) {
        const { resolver } = TestDataGenerator.generateDependencyGraph(nodeCount, 0.1);

        const startTime = performance.now();
        const result = await coordinator.addTask(`test_task_${nodeCount}`, {
          priority: 5,
          estimatedDuration: 1000
        });
        const duration = performance.now() - startTime;

        this.metrics.recordTest('redis_coordination', nodeCount, duration, 1);

        console.log(`   ✅ ${nodeCount} nodes via Redis: ${duration.toFixed(2)}ms`);
      }

      await coordinator.shutdown();
    } catch (error) {
      console.log(`   ⚠️  Redis tests skipped: ${error.message}`);
    }
  }

  printReport(report) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 DEPENDENCY RESOLUTION PERFORMANCE REPORT');
    console.log('='.repeat(80));

    console.log('\n🎯 SUMMARY:');
    console.log(`   Total Tests: ${report.summary.totalTests}`);
    console.log(`   Average Resolution Time: ${report.summary.avgResolutionTime}ms`);
    console.log(`   Maximum Resolution Time: ${report.summary.maxResolutionTime}ms`);
    console.log(`   Average Throughput: ${report.summary.avgThroughput} ops/sec`);
    console.log(`   Target (<${TEST_CONFIG.maxResolutionTime}ms) Met: ${report.summary.targetMet ? '✅ YES' : '❌ NO'}`);

    console.log('\n📈 PERFORMANCE BY NODE COUNT:');
    for (const [count, stats] of Object.entries(report.byNodeCount)) {
      console.log(`   ${count} nodes: ${stats.avgDuration}ms avg, ${stats.maxDuration}ms max, ${stats.avgThroughput} ops/sec ${stats.targetMet ? '✅' : '❌'}`);
    }

    console.log('\n🔬 PERFORMANCE BY TEST TYPE:');
    for (const [type, stats] of Object.entries(report.byTestType)) {
      console.log(`   ${type}: ${stats.avgDuration}ms avg, ${stats.maxDuration}ms max, ${stats.avgThroughput} ops/sec ${stats.targetMet ? '✅' : '❌'}`);
    }

    console.log('\n📊 PERFORMANCE ANALYSIS:');
    console.log(`   Success Rate: ${report.performanceAnalysis.successRate}%`);
    console.log(`   Fast Tests: ${report.performanceAnalysis.fastTests}`);
    console.log(`   Slow Tests: ${report.performanceAnalysis.slowTests}`);
    if (report.performanceAnalysis.averageSlowdown !== 'N/A') {
      console.log(`   Average Slowdown: ${report.performanceAnalysis.averageSlowdown}x`);
    }

    console.log('\n💡 RECOMMENDATIONS:');
    report.recommendations.forEach(rec => {
      console.log(`   • ${rec}`);
    });

    console.log('\n' + '='.repeat(80));
  }
}

/**
 * Main execution
 */
async function main() {
  const testSuite = new PerformanceTestSuite();

  try {
    const report = await testSuite.runAllTests();

    const targetMet = report.summary.targetMet && report.performanceAnalysis.successRate >= 90;

    if (targetMet) {
      console.log('\n🎉 PERFORMANCE VALIDATION PASSED!');
      console.log('✅ Dependency resolution meets <10ms overhead requirement');
      process.exit(0);
    } else {
      console.log('\n❌ PERFORMANCE VALIDATION FAILED!');
      console.log('❌ Dependency resolution does not meet <10ms overhead requirement');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Performance validation failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PerformanceTestSuite, TestDataGenerator, PerformanceTestMetrics };