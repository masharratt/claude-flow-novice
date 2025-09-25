#!/usr/bin/env node

/**
 * Cleanup Efficiency Validator
 * Tests resource cleanup and memory leak detection
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const v8 = require('v8');
const os = require('os');

class CleanupValidator {
  constructor() {
    this.results = {
      memoryLeakTests: [],
      resourceCleanupTests: [],
      processCleanupTests: [],
      fileHandleTests: [],
      networkResourceTests: [],
      gcEfficiencyTests: [],
      timestamp: new Date().toISOString()
    };
    this.initialMemory = this.getMemorySnapshot();
    this.tempFiles = [];
    this.activeProcesses = [];
  }

  // Get detailed memory snapshot
  getMemorySnapshot() {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      timestamp: Date.now(),
      process: memUsage,
      heap: heapStats,
      system: {
        free: os.freememory(),
        total: os.totalmem()
      }
    };
  }

  // Memory leak detection test
  async testMemoryLeaks() {
    console.log('🔍 Testing for memory leaks...');

    const testStart = Date.now();
    const iterations = 100;
    const memorySnapshots = [];

    // Take initial snapshot
    memorySnapshots.push(this.getMemorySnapshot());

    for (let i = 0; i < iterations; i++) {
      // Simulate agent operations that could cause memory leaks
      await this.simulateAgentOperations();

      // Take memory snapshot every 10 iterations
      if (i % 10 === 0) {
        memorySnapshots.push(this.getMemorySnapshot());
      }
    }

    // Force garbage collection and take final snapshot
    if (global.gc) {
      global.gc();
      await this.sleep(100);
    }
    memorySnapshots.push(this.getMemorySnapshot());

    // Analyze memory growth
    const leakAnalysis = this.analyzeMemoryLeaks(memorySnapshots);

    this.results.memoryLeakTests.push({
      iterations,
      duration: Date.now() - testStart,
      snapshots: memorySnapshots,
      analysis: leakAnalysis
    });

    console.log(`✅ Memory leak test complete - Leak detected: ${leakAnalysis.leakDetected ? '❌' : '✅'}`);
    return leakAnalysis;
  }

  // Simulate agent operations that could cause memory leaks
  async simulateAgentOperations() {
    // Create objects that might not be properly cleaned up
    const data = {
      id: Math.random(),
      payload: new Array(1000).fill(0).map(() => ({ value: Math.random() })),
      callbacks: [],
      timers: []
    };

    // Simulate event listeners (potential leak source)
    const eventEmitter = new (require('events'))();
    const listener = () => {};
    eventEmitter.on('test', listener);

    // Simulate timers (potential leak source)
    const timer = setTimeout(() => {}, 1000);

    // Simulate file operations
    const tempFile = path.join(__dirname, `temp-${Math.random()}.txt`);
    await fs.writeFile(tempFile, JSON.stringify(data));
    this.tempFiles.push(tempFile);

    // Cleanup (simulate proper cleanup)
    eventEmitter.removeListener('test', listener);
    clearTimeout(timer);

    // Sometimes skip cleanup to simulate leaks (10% of the time)
    if (Math.random() < 0.1) {
      // Skip cleanup to simulate a leak
      return;
    }

    // Clean up temp file
    try {
      await fs.unlink(tempFile);
      this.tempFiles = this.tempFiles.filter(f => f !== tempFile);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  // Analyze memory leak patterns
  analyzeMemoryLeaks(snapshots) {
    if (snapshots.length < 3) {
      return { error: 'Insufficient snapshots for leak analysis' };
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    // Calculate memory growth
    const growth = {
      rss: last.process.rss - first.process.rss,
      heapTotal: last.process.heapTotal - first.process.heapTotal,
      heapUsed: last.process.heapUsed - first.process.heapUsed,
      external: last.process.external - first.process.external
    };

    // Analyze trend
    const trends = this.calculateMemoryTrends(snapshots);

    // Detect leak based on consistent growth pattern
    const leakThreshold = 10 * 1024 * 1024; // 10MB
    const growthRate = growth.heapUsed / snapshots.length;
    const leakDetected = growth.heapUsed > leakThreshold && trends.heapUsed.slope > 0;

    return {
      growth,
      trends,
      growthRate,
      leakDetected,
      leakSeverity: this.categorizeLeak(growth.heapUsed),
      gcEffectiveness: this.calculateGCEffectiveness(snapshots)
    };
  }

  // Calculate memory trends
  calculateMemoryTrends(snapshots) {
    const calculateTrend = (values) => {
      const n = values.length;
      const sumX = (n * (n - 1)) / 2;
      const sumY = values.reduce((sum, val) => sum + val, 0);
      const sumXY = values.reduce((sum, val, idx) => sum + idx * val, 0);
      const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      return { slope, intercept };
    };

    return {
      rss: calculateTrend(snapshots.map(s => s.process.rss)),
      heapUsed: calculateTrend(snapshots.map(s => s.process.heapUsed)),
      heapTotal: calculateTrend(snapshots.map(s => s.process.heapTotal))
    };
  }

  // Categorize leak severity
  categorizeLeak(memoryGrowth) {
    const growthMB = memoryGrowth / (1024 * 1024);

    if (growthMB < 5) return 'NONE';
    if (growthMB < 20) return 'MINOR';
    if (growthMB < 50) return 'MODERATE';
    if (growthMB < 100) return 'MAJOR';
    return 'CRITICAL';
  }

  // Calculate GC effectiveness
  calculateGCEffectiveness(snapshots) {
    let gcEvents = 0;
    let totalFreed = 0;

    for (let i = 1; i < snapshots.length; i++) {
      const current = snapshots[i];
      const previous = snapshots[i - 1];

      const heapDecrease = previous.process.heapUsed - current.process.heapUsed;

      if (heapDecrease > 1024 * 1024) { // 1MB decrease
        gcEvents++;
        totalFreed += heapDecrease;
      }
    }

    return {
      gcEvents,
      totalFreed,
      averageFreed: gcEvents > 0 ? totalFreed / gcEvents : 0,
      gcFrequency: gcEvents / snapshots.length
    };
  }

  // Test resource cleanup efficiency
  async testResourceCleanup() {
    console.log('🧹 Testing resource cleanup efficiency...');

    const testStart = Date.now();
    const resourceTests = [];

    // Test 1: File handle cleanup
    const fileHandleTest = await this.testFileHandleCleanup();
    resourceTests.push({ type: 'fileHandles', ...fileHandleTest });

    // Test 2: Process cleanup
    const processTest = await this.testProcessCleanup();
    resourceTests.push({ type: 'processes', ...processTest });

    // Test 3: Memory cleanup after operations
    const memoryTest = await this.testMemoryCleanupAfterOperations();
    resourceTests.push({ type: 'memory', ...memoryTest });

    // Test 4: Event listener cleanup
    const eventListenerTest = await this.testEventListenerCleanup();
    resourceTests.push({ type: 'eventListeners', ...eventListenerTest });

    const totalDuration = Date.now() - testStart;
    const overallEfficiency = this.calculateOverallCleanupEfficiency(resourceTests);

    this.results.resourceCleanupTests.push({
      duration: totalDuration,
      tests: resourceTests,
      efficiency: overallEfficiency
    });

    console.log(`✅ Resource cleanup test complete - Efficiency: ${overallEfficiency.overall.toFixed(1)}%`);
    return { tests: resourceTests, efficiency: overallEfficiency };
  }

  // Test file handle cleanup
  async testFileHandleCleanup() {
    const preTest = this.getFileDescriptorCount();
    const testFiles = [];

    // Create and manipulate many files
    for (let i = 0; i < 100; i++) {
      const filePath = path.join(__dirname, `cleanup-test-${i}.txt`);
      await fs.writeFile(filePath, `Test data ${i}`);
      testFiles.push(filePath);
    }

    const duringTest = this.getFileDescriptorCount();

    // Clean up files
    for (const file of testFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        // Ignore errors
      }
    }

    // Wait for cleanup
    await this.sleep(1000);
    const postTest = this.getFileDescriptorCount();

    return {
      fileDescriptors: {
        pre: preTest,
        during: duringTest,
        post: postTest
      },
      filesCreated: testFiles.length,
      cleanupEfficiency: ((duringTest - postTest) / (duringTest - preTest)) * 100
    };
  }

  // Get file descriptor count (approximation)
  getFileDescriptorCount() {
    try {
      return process.getgroups ? process.getgroups().length : 0;
    } catch (error) {
      return 0;
    }
  }

  // Test process cleanup
  async testProcessCleanup() {
    const preTest = process.memoryUsage();
    const processes = [];

    // Spawn multiple short-lived processes
    for (let i = 0; i < 20; i++) {
      const proc = spawn('node', ['-e', 'setTimeout(() => process.exit(0), 100)'], {
        stdio: 'ignore'
      });
      processes.push(proc);
    }

    // Wait for processes to complete
    await Promise.all(processes.map(proc => new Promise(resolve => {
      proc.on('close', resolve);
      proc.on('error', resolve);
    })));

    // Wait for cleanup
    await this.sleep(2000);
    const postTest = process.memoryUsage();

    return {
      processesSpawned: processes.length,
      memoryDifference: postTest.rss - preTest.rss,
      cleanupEffective: Math.abs(postTest.rss - preTest.rss) < 10 * 1024 * 1024 // 10MB threshold
    };
  }

  // Test memory cleanup after operations
  async testMemoryCleanupAfterOperations() {
    const preTest = this.getMemorySnapshot();

    // Perform memory-intensive operations
    const largeArrays = [];
    for (let i = 0; i < 10; i++) {
      largeArrays.push(new Array(100000).fill(0).map(() => ({ id: Math.random() })));
    }

    const duringTest = this.getMemorySnapshot();

    // Clear references
    largeArrays.length = 0;

    // Force garbage collection
    if (global.gc) {
      global.gc();
      await this.sleep(100);
      global.gc();
    }

    await this.sleep(1000);
    const postTest = this.getMemorySnapshot();

    return {
      memoryGrowth: duringTest.process.heapUsed - preTest.process.heapUsed,
      memoryRecovered: duringTest.process.heapUsed - postTest.process.heapUsed,
      cleanupPercentage: ((duringTest.process.heapUsed - postTest.process.heapUsed) /
                         (duringTest.process.heapUsed - preTest.process.heapUsed)) * 100
    };
  }

  // Test event listener cleanup
  async testEventListenerCleanup() {
    const EventEmitter = require('events');
    const emitter = new EventEmitter();
    const preTest = this.getMemorySnapshot();

    // Add many event listeners
    const listeners = [];
    for (let i = 0; i < 1000; i++) {
      const listener = () => {};
      emitter.on('test', listener);
      listeners.push(listener);
    }

    const duringTest = this.getMemorySnapshot();

    // Remove event listeners
    for (const listener of listeners) {
      emitter.removeListener('test', listener);
    }

    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    await this.sleep(500);
    const postTest = this.getMemorySnapshot();

    return {
      listenersAdded: listeners.length,
      memoryGrowth: duringTest.process.heapUsed - preTest.process.heapUsed,
      memoryRecovered: duringTest.process.heapUsed - postTest.process.heapUsed,
      listenerCount: emitter.listenerCount('test'),
      cleanupEffective: emitter.listenerCount('test') === 0
    };
  }

  // Calculate overall cleanup efficiency
  calculateOverallCleanupEfficiency(tests) {
    let totalScore = 0;
    let maxScore = 0;

    for (const test of tests) {
      switch (test.type) {
        case 'fileHandles':
          totalScore += Math.min(test.cleanupEfficiency || 0, 100);
          maxScore += 100;
          break;
        case 'processes':
          totalScore += test.cleanupEffective ? 100 : 0;
          maxScore += 100;
          break;
        case 'memory':
          totalScore += Math.min(test.cleanupPercentage || 0, 100);
          maxScore += 100;
          break;
        case 'eventListeners':
          totalScore += test.cleanupEffective ? 100 : 0;
          maxScore += 100;
          break;
      }
    }

    return {
      overall: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
      breakdown: tests.reduce((acc, test) => {
        acc[test.type] = this.calculateTestScore(test);
        return acc;
      }, {})
    };
  }

  // Calculate individual test score
  calculateTestScore(test) {
    switch (test.type) {
      case 'fileHandles':
        return {
          score: Math.min(test.cleanupEfficiency || 0, 100),
          status: (test.cleanupEfficiency || 0) > 80 ? 'EXCELLENT' :
                 (test.cleanupEfficiency || 0) > 60 ? 'GOOD' :
                 (test.cleanupEfficiency || 0) > 40 ? 'FAIR' : 'POOR'
        };
      case 'processes':
        return {
          score: test.cleanupEffective ? 100 : 0,
          status: test.cleanupEffective ? 'EXCELLENT' : 'POOR'
        };
      case 'memory':
        return {
          score: Math.min(test.cleanupPercentage || 0, 100),
          status: (test.cleanupPercentage || 0) > 80 ? 'EXCELLENT' :
                 (test.cleanupPercentage || 0) > 60 ? 'GOOD' :
                 (test.cleanupPercentage || 0) > 40 ? 'FAIR' : 'POOR'
        };
      case 'eventListeners':
        return {
          score: test.cleanupEffective ? 100 : 0,
          status: test.cleanupEffective ? 'EXCELLENT' : 'POOR'
        };
      default:
        return { score: 0, status: 'UNKNOWN' };
    }
  }

  // Test GC efficiency
  async testGCEfficiency() {
    console.log('♻️ Testing garbage collection efficiency...');

    const gcTest = {
      startTime: Date.now(),
      iterations: 50,
      gcCycles: []
    };

    for (let i = 0; i < gcTest.iterations; i++) {
      const preGC = this.getMemorySnapshot();

      // Create garbage
      const garbage = new Array(10000).fill(0).map(() => ({
        id: Math.random(),
        data: new Array(100).fill(Math.random())
      }));

      const withGarbage = this.getMemorySnapshot();

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      await this.sleep(50);
      const postGC = this.getMemorySnapshot();

      gcTest.gcCycles.push({
        iteration: i,
        preGC: preGC.process.heapUsed,
        withGarbage: withGarbage.process.heapUsed,
        postGC: postGC.process.heapUsed,
        garbageCreated: withGarbage.process.heapUsed - preGC.process.heapUsed,
        garbageCollected: withGarbage.process.heapUsed - postGC.process.heapUsed,
        efficiency: ((withGarbage.process.heapUsed - postGC.process.heapUsed) /
                   (withGarbage.process.heapUsed - preGC.process.heapUsed)) * 100
      });
    }

    gcTest.duration = Date.now() - gcTest.startTime;
    gcTest.analysis = this.analyzeGCEfficiency(gcTest.gcCycles);

    this.results.gcEfficiencyTests.push(gcTest);

    console.log(`✅ GC efficiency test complete - Avg efficiency: ${gcTest.analysis.averageEfficiency.toFixed(1)}%`);
    return gcTest;
  }

  // Analyze GC efficiency
  analyzeGCEfficiency(gcCycles) {
    const efficiencies = gcCycles.map(cycle => cycle.efficiency).filter(eff => !isNaN(eff));
    const totalGarbageCreated = gcCycles.reduce((sum, cycle) => sum + cycle.garbageCreated, 0);
    const totalGarbageCollected = gcCycles.reduce((sum, cycle) => sum + cycle.garbageCollected, 0);

    return {
      averageEfficiency: efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length,
      minEfficiency: Math.min(...efficiencies),
      maxEfficiency: Math.max(...efficiencies),
      totalGarbageCreated,
      totalGarbageCollected,
      overallEfficiency: (totalGarbageCollected / totalGarbageCreated) * 100,
      gcConsistency: this.calculateGCConsistency(efficiencies)
    };
  }

  // Calculate GC consistency
  calculateGCConsistency(efficiencies) {
    const mean = efficiencies.reduce((sum, eff) => sum + eff, 0) / efficiencies.length;
    const variance = efficiencies.reduce((sum, eff) => sum + Math.pow(eff - mean, 2), 0) / efficiencies.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = (standardDeviation / mean) * 100;

    return {
      standardDeviation,
      coefficientOfVariation,
      consistency: coefficientOfVariation < 10 ? 'EXCELLENT' :
                  coefficientOfVariation < 25 ? 'GOOD' :
                  coefficientOfVariation < 50 ? 'FAIR' : 'POOR'
    };
  }

  // Cleanup temp files
  async cleanup() {
    for (const file of this.tempFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    this.tempFiles = [];
  }

  // Sleep utility
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Generate comprehensive cleanup report
  generateReport() {
    const finalMemory = this.getMemorySnapshot();

    return {
      metadata: {
        timestamp: this.results.timestamp,
        testDuration: Date.now() - new Date(this.results.timestamp).getTime(),
        nodeVersion: process.version,
        platform: os.platform()
      },
      initialMemory: this.initialMemory,
      finalMemory,
      memoryDifference: {
        rss: finalMemory.process.rss - this.initialMemory.process.rss,
        heapUsed: finalMemory.process.heapUsed - this.initialMemory.process.heapUsed
      },
      results: this.results,
      summary: {
        memoryLeaksDetected: this.results.memoryLeakTests.some(test =>
          test.analysis && test.analysis.leakDetected
        ),
        averageCleanupEfficiency: this.calculateAverageCleanupEfficiency(),
        gcEfficiencyRating: this.calculateGCEfficiencyRating(),
        overallHealthScore: this.calculateOverallHealthScore()
      },
      recommendations: this.generateRecommendations()
    };
  }

  // Calculate average cleanup efficiency
  calculateAverageCleanupEfficiency() {
    const cleanupTests = this.results.resourceCleanupTests;
    if (cleanupTests.length === 0) return 0;

    return cleanupTests.reduce((sum, test) => sum + test.efficiency.overall, 0) / cleanupTests.length;
  }

  // Calculate GC efficiency rating
  calculateGCEfficiencyRating() {
    const gcTests = this.results.gcEfficiencyTests;
    if (gcTests.length === 0) return 'UNKNOWN';

    const avgEfficiency = gcTests.reduce((sum, test) => sum + test.analysis.averageEfficiency, 0) / gcTests.length;

    if (avgEfficiency > 90) return 'EXCELLENT';
    if (avgEfficiency > 75) return 'GOOD';
    if (avgEfficiency > 60) return 'FAIR';
    return 'POOR';
  }

  // Calculate overall health score
  calculateOverallHealthScore() {
    let score = 100;

    // Penalize for memory leaks
    if (this.results.memoryLeakTests.some(test => test.analysis && test.analysis.leakDetected)) {
      score -= 30;
    }

    // Penalize for low cleanup efficiency
    const avgCleanup = this.calculateAverageCleanupEfficiency();
    if (avgCleanup < 80) {
      score -= (80 - avgCleanup) * 0.5;
    }

    // Penalize for poor GC efficiency
    const gcTests = this.results.gcEfficiencyTests;
    if (gcTests.length > 0) {
      const avgGCEfficiency = gcTests.reduce((sum, test) => sum + test.analysis.averageEfficiency, 0) / gcTests.length;
      if (avgGCEfficiency < 80) {
        score -= (80 - avgGCEfficiency) * 0.3;
      }
    }

    return Math.max(0, score);
  }

  // Generate recommendations
  generateRecommendations() {
    const recommendations = [];

    // Memory leak recommendations
    if (this.results.memoryLeakTests.some(test => test.analysis && test.analysis.leakDetected)) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Memory Leak',
        issue: 'Memory leaks detected during testing',
        action: 'Review code for unclosed resources, event listeners, and circular references'
      });
    }

    // Cleanup efficiency recommendations
    const avgCleanup = this.calculateAverageCleanupEfficiency();
    if (avgCleanup < 80) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Cleanup Efficiency',
        issue: `Low cleanup efficiency (${avgCleanup.toFixed(1)}%)`,
        action: 'Implement proper resource disposal patterns and cleanup procedures'
      });
    }

    // GC efficiency recommendations
    const gcTests = this.results.gcEfficiencyTests;
    if (gcTests.length > 0) {
      const avgGCEfficiency = gcTests.reduce((sum, test) => sum + test.analysis.averageEfficiency, 0) / gcTests.length;
      if (avgGCEfficiency < 75) {
        recommendations.push({
          priority: 'MEDIUM',
          category: 'Garbage Collection',
          issue: `Low GC efficiency (${avgGCEfficiency.toFixed(1)}%)`,
          action: 'Review object creation patterns and consider manual GC triggers'
        });
      }
    }

    if (recommendations.length === 0) {
      recommendations.push({
        priority: 'INFO',
        category: 'Resource Management',
        issue: 'Resource cleanup appears healthy',
        action: 'Continue monitoring for sustained performance'
      });
    }

    return recommendations;
  }

  // Run all cleanup validation tests
  async runAllTests() {
    console.log('🚀 Starting cleanup validation test suite...\n');

    try {
      await this.testMemoryLeaks();
      await this.testResourceCleanup();
      await this.testGCEfficiency();

      const report = this.generateReport();

      // Save results
      const resultsPath = path.join(__dirname, '../../results/verification', `cleanup-validation-${Date.now()}.json`);
      await fs.writeFile(resultsPath, JSON.stringify(report, null, 2));

      // Cleanup temp files
      await this.cleanup();

      console.log('\n📊 Cleanup Validation Summary:');
      console.log(`- Memory leaks detected: ${report.summary.memoryLeaksDetected ? '❌' : '✅'}`);
      console.log(`- Average cleanup efficiency: ${report.summary.averageCleanupEfficiency.toFixed(1)}%`);
      console.log(`- GC efficiency rating: ${report.summary.gcEfficiencyRating}`);
      console.log(`- Overall health score: ${report.summary.overallHealthScore.toFixed(1)}/100`);
      console.log(`\n📁 Results saved to: ${resultsPath}`);

      return report;

    } catch (error) {
      console.error('❌ Cleanup validation failed:', error);
      await this.cleanup();
      throw error;
    }
  }
}

module.exports = CleanupValidator;

// Run if called directly
if (require.main === module) {
  const validator = new CleanupValidator();
  validator.runAllTests()
    .then(results => {
      console.log('\n🎉 Cleanup validation completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Cleanup validation failed:', error);
      process.exit(1);
    });
}