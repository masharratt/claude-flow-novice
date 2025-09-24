#!/usr/bin/env node

/**
 * Master Benchmark Runner
 * Executes all performance benchmarks and generates verification report
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const PerformanceBenchmarker = require('./comprehensive-benchmark');
const MemoryProfiler = require('./memory/memory-profiler');
const CPUBenchmark = require('./cpu/cpu-benchmark');
const CleanupValidator = require('./cleanup/cleanup-validator');

class MasterBenchmarkRunner {
  constructor() {
    this.results = {
      startTime: Date.now(),
      comprehensive: null,
      memory: null,
      cpu: null,
      cleanup: null,
      summary: {},
      verification: {},
      recommendations: [],
      timestamp: new Date().toISOString()
    };
  }

  // Run comprehensive benchmark
  async runComprehensiveBenchmark() {
    console.log('\n🚀 Running comprehensive performance benchmark...');

    try {
      const benchmarker = new PerformanceBenchmarker();
      this.results.comprehensive = await benchmarker.runAllBenchmarks();
      console.log('✅ Comprehensive benchmark completed');
      return this.results.comprehensive;
    } catch (error) {
      console.error('❌ Comprehensive benchmark failed:', error);
      this.results.comprehensive = { error: error.message };
      throw error;
    }
  }

  // Run memory profiling
  async runMemoryProfiling() {
    console.log('\n🧠 Running memory profiling benchmark...');

    try {
      const profiler = new MemoryProfiler();

      // Start monitoring
      profiler.startMonitoring(500);

      // Run memory-intensive operations
      await this.simulateMemoryIntensiveOperations();

      // Stop monitoring and generate report
      profiler.stopMonitoring();
      this.results.memory = profiler.generateReport();

      console.log('✅ Memory profiling completed');
      return this.results.memory;
    } catch (error) {
      console.error('❌ Memory profiling failed:', error);
      this.results.memory = { error: error.message };
      throw error;
    }
  }

  // Run CPU benchmark
  async runCPUBenchmark() {
    console.log('\n⚡ Running CPU performance benchmark...');

    try {
      const cpuBenchmark = new CPUBenchmark();
      this.results.cpu = await cpuBenchmark.runAllBenchmarks();
      console.log('✅ CPU benchmark completed');
      return this.results.cpu;
    } catch (error) {
      console.error('❌ CPU benchmark failed:', error);
      this.results.cpu = { error: error.message };
      throw error;
    }
  }

  // Run cleanup validation
  async runCleanupValidation() {
    console.log('\n🧹 Running cleanup validation tests...');

    try {
      const validator = new CleanupValidator();
      this.results.cleanup = await validator.runAllTests();
      console.log('✅ Cleanup validation completed');
      return this.results.cleanup;
    } catch (error) {
      console.error('❌ Cleanup validation failed:', error);
      this.results.cleanup = { error: error.message };
      throw error;
    }
  }

  // Simulate memory-intensive operations for profiling
  async simulateMemoryIntensiveOperations() {
    console.log('  🔄 Simulating agent operations...');

    // Simulate spawning multiple agents with memory usage
    const operations = [];
    for (let i = 0; i < 20; i++) {
      operations.push(this.simulateAgentOperation(i));
    }

    await Promise.all(operations);
  }

  // Simulate individual agent operation
  async simulateAgentOperation(id) {
    return new Promise((resolve) => {
      // Create memory usage pattern similar to agent operations
      const data = {
        agentId: id,
        workspace: new Array(5000).fill(0).map(() => ({
          task: Math.random(),
          result: new Array(100).fill(Math.random())
        })),
        history: [],
        context: {}
      };

      // Simulate processing
      setTimeout(() => {
        data.history.push({ timestamp: Date.now(), status: 'complete' });
        resolve(data);
      }, Math.random() * 2000 + 500); // 500-2500ms
    });
  }

  // Generate master summary
  generateMasterSummary() {
    const summary = {
      totalDuration: Date.now() - this.results.startTime,
      testsRun: 0,
      testsSucceeded: 0,
      testsFailed: 0,
      performance: {},
      issues: [],
      achievements: []
    };

    // Count tests and analyze results
    const testSuites = ['comprehensive', 'memory', 'cpu', 'cleanup'];

    for (const suite of testSuites) {
      summary.testsRun++;
      if (this.results[suite] && !this.results[suite].error) {
        summary.testsSucceeded++;
      } else {
        summary.testsFailed++;
        summary.issues.push(`${suite} benchmark failed`);
      }
    }

    // Extract performance metrics
    if (this.results.comprehensive && !this.results.comprehensive.error) {
      const comp = this.results.comprehensive;
      summary.performance.concurrentAgents = comp.summary?.concurrentAgentSuccess || false;
      summary.performance.memoryManagement = !comp.summary?.memoryLeakDetected || false;
      summary.performance.systemStability = comp.summary?.systemStability || false;
    }

    if (this.results.cpu && !this.results.cpu.error) {
      const cpu = this.results.cpu;
      summary.performance.cpuEfficiency = cpu.summary?.cpuStability === 'STABLE';
      summary.performance.throughput = cpu.summary?.maxThroughput || 0;
    }

    if (this.results.cleanup && !this.results.cleanup.error) {
      const cleanup = this.results.cleanup;
      summary.performance.cleanupEfficiency = cleanup.summary?.overallHealthScore > 80;
      summary.performance.noMemoryLeaks = !cleanup.summary?.memoryLeaksDetected;
    }

    // Generate achievements
    if (summary.performance.concurrentAgents) {
      summary.achievements.push('Successfully handled 50+ concurrent agents');
    }
    if (summary.performance.memoryManagement) {
      summary.achievements.push('Excellent memory management with no leaks detected');
    }
    if (summary.performance.cpuEfficiency) {
      summary.achievements.push('Stable CPU performance under load');
    }
    if (summary.performance.cleanupEfficiency) {
      summary.achievements.push('Efficient resource cleanup and management');
    }

    this.results.summary = summary;
    return summary;
  }

  // Verify implementation claims
  verifyClaims() {
    const verification = {
      claimsToVerify: {
        memoryManagement: 'Efficient memory usage and cleanup',
        concurrentCapability: '50+ concurrent agents support',
        resourceCleanup: 'No memory leaks or resource leaks',
        cpuEfficiency: 'Stable CPU performance under load',
        systemStability: 'Reliable operation without crashes'
      },
      verificationResults: {},
      overallScore: 0
    };

    let totalScore = 0;
    let maxScore = 0;

    // Verify memory management
    if (this.results.comprehensive && this.results.memory) {
      const memoryGood = !this.results.comprehensive.summary?.memoryLeakDetected &&
                         this.results.memory.analysis?.memoryLeakDetection?.detected !== true;
      verification.verificationResults.memoryManagement = {
        verified: memoryGood,
        score: memoryGood ? 100 : 0,
        evidence: 'Memory leak tests and cleanup validation'
      };
      totalScore += memoryGood ? 100 : 0;
    }
    maxScore += 100;

    // Verify concurrent capability
    if (this.results.comprehensive) {
      const concurrentGood = this.results.comprehensive.summary?.concurrentAgentSuccess === true;
      verification.verificationResults.concurrentCapability = {
        verified: concurrentGood,
        score: concurrentGood ? 100 : 0,
        evidence: `${this.results.comprehensive.results?.concurrent?.successful || 0}/50 agents succeeded`
      };
      totalScore += concurrentGood ? 100 : 0;
    }
    maxScore += 100;

    // Verify resource cleanup
    if (this.results.cleanup) {
      const cleanupGood = this.results.cleanup.summary?.overallHealthScore > 80;
      verification.verificationResults.resourceCleanup = {
        verified: cleanupGood,
        score: this.results.cleanup.summary?.overallHealthScore || 0,
        evidence: `Health score: ${this.results.cleanup.summary?.overallHealthScore || 0}/100`
      };
      totalScore += this.results.cleanup.summary?.overallHealthScore || 0;
    }
    maxScore += 100;

    // Verify CPU efficiency
    if (this.results.cpu) {
      const cpuGood = this.results.cpu.summary?.cpuStability === 'STABLE';
      verification.verificationResults.cpuEfficiency = {
        verified: cpuGood,
        score: cpuGood ? 100 : 0,
        evidence: `CPU stability: ${this.results.cpu.summary?.cpuStability || 'Unknown'}`
      };
      totalScore += cpuGood ? 100 : 0;
    }
    maxScore += 100;

    // Verify system stability
    if (this.results.comprehensive) {
      const stabilityGood = this.results.comprehensive.summary?.systemStability === true;
      verification.verificationResults.systemStability = {
        verified: stabilityGood,
        score: stabilityGood ? 100 : 0,
        evidence: 'No system crashes during testing'
      };
      totalScore += stabilityGood ? 100 : 0;
    }
    maxScore += 100;

    verification.overallScore = maxScore > 0 ? (totalScore / maxScore) : 0;
    this.results.verification = verification;

    return verification;
  }

  // Generate recommendations
  generateRecommendations() {
    const recommendations = [];

    // Collect recommendations from all test suites
    if (this.results.comprehensive?.recommendations) {
      recommendations.push(...this.results.comprehensive.recommendations);
    }
    if (this.results.memory?.recommendations) {
      recommendations.push(...this.results.memory.recommendations);
    }
    if (this.results.cpu?.analysis?.recommendations) {
      recommendations.push(...this.results.cpu.analysis.recommendations);
    }
    if (this.results.cleanup?.recommendations) {
      recommendations.push(...this.results.cleanup.recommendations);
    }

    // Add master-level recommendations
    if (this.results.summary.testsFailed > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Test Coverage',
        issue: `${this.results.summary.testsFailed} benchmark suite(s) failed`,
        action: 'Review and fix failing benchmark suites to ensure complete validation'
      });
    }

    if (this.results.verification.overallScore < 80) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Performance Claims',
        issue: `Overall verification score: ${this.results.verification.overallScore.toFixed(1)}%`,
        action: 'Address failing verification criteria to meet implementation claims'
      });
    }

    this.results.recommendations = recommendations;
    return recommendations;
  }

  // Generate comprehensive report
  async generateReport() {
    console.log('\n📊 Generating comprehensive verification report...');

    const summary = this.generateMasterSummary();
    const verification = this.verifyClaims();
    const recommendations = this.generateRecommendations();

    const report = {
      metadata: {
        timestamp: this.results.timestamp,
        totalDuration: Date.now() - this.results.startTime,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      executiveSummary: {
        testsRun: summary.testsRun,
        testsSucceeded: summary.testsSucceeded,
        testsFailed: summary.testsFailed,
        overallVerificationScore: verification.overallScore,
        majorIssues: recommendations.filter(r => r.priority === 'HIGH').length,
        systemHealthy: summary.testsFailed === 0 && verification.overallScore > 80
      },
      detailedResults: {
        comprehensive: this.results.comprehensive,
        memory: this.results.memory,
        cpu: this.results.cpu,
        cleanup: this.results.cleanup
      },
      summary,
      verification,
      recommendations,
      conclusions: this.generateConclusions(summary, verification)
    };

    // Save comprehensive report
    const reportPath = path.join(__dirname, '../results/verification', `master-benchmark-report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Generate human-readable summary
    const summaryPath = path.join(__dirname, '../results/verification', `verification-summary-${Date.now()}.md`);
    await this.generateHumanReadableReport(report, summaryPath);

    console.log(`📁 Comprehensive report saved to: ${reportPath}`);
    console.log(`📄 Human-readable summary saved to: ${summaryPath}`);

    return report;
  }

  // Generate conclusions
  generateConclusions(summary, verification) {
    const conclusions = {
      claimsVerified: [],
      claimsFailed: [],
      overallAssessment: '',
      confidenceLevel: 'LOW'
    };

    // Analyze verification results
    for (const [claim, result] of Object.entries(verification.verificationResults)) {
      if (result.verified) {
        conclusions.claimsVerified.push(claim);
      } else {
        conclusions.claimsFailed.push(claim);
      }
    }

    // Generate overall assessment
    if (verification.overallScore >= 90) {
      conclusions.overallAssessment = 'All major performance claims are verified with excellent results.';
      conclusions.confidenceLevel = 'HIGH';
    } else if (verification.overallScore >= 75) {
      conclusions.overallAssessment = 'Most performance claims are verified with good results.';
      conclusions.confidenceLevel = 'MEDIUM';
    } else if (verification.overallScore >= 50) {
      conclusions.overallAssessment = 'Some performance claims are verified, but significant issues exist.';
      conclusions.confidenceLevel = 'LOW';
    } else {
      conclusions.overallAssessment = 'Major performance claims could not be verified. System needs improvement.';
      conclusions.confidenceLevel = 'VERY_LOW';
    }

    return conclusions;
  }

  // Generate human-readable report
  async generateHumanReadableReport(report, filePath) {
    const md = `# Performance Benchmark Verification Report

## Executive Summary

- **Tests Run**: ${report.executiveSummary.testsRun}
- **Tests Succeeded**: ${report.executiveSummary.testsSucceeded}
- **Tests Failed**: ${report.executiveSummary.testsFailed}
- **Overall Verification Score**: ${report.verification.overallScore.toFixed(1)}%
- **System Health**: ${report.executiveSummary.systemHealthy ? '✅ Healthy' : '❌ Issues Detected'}

## Test Results Summary

### Comprehensive Benchmark
${report.detailedResults.comprehensive?.error ?
  '❌ **FAILED**: ' + report.detailedResults.comprehensive.error :
  '✅ **PASSED**: All comprehensive benchmarks completed successfully'
}

### Memory Profiling
${report.detailedResults.memory?.error ?
  '❌ **FAILED**: ' + report.detailedResults.memory.error :
  '✅ **PASSED**: Memory profiling completed with health score: ' + (report.detailedResults.memory?.analysis?.overallHealthScore || 'N/A')
}

### CPU Benchmark
${report.detailedResults.cpu?.error ?
  '❌ **FAILED**: ' + report.detailedResults.cpu.error :
  '✅ **PASSED**: CPU benchmark completed with stability: ' + (report.detailedResults.cpu?.summary?.cpuStability || 'N/A')
}

### Cleanup Validation
${report.detailedResults.cleanup?.error ?
  '❌ **FAILED**: ' + report.detailedResults.cleanup.error :
  '✅ **PASSED**: Cleanup validation completed with health score: ' + (report.detailedResults.cleanup?.summary?.overallHealthScore || 'N/A') + '/100'
}

## Claims Verification

${Object.entries(report.verification.verificationResults).map(([claim, result]) =>
  `### ${claim}\n${result.verified ? '✅' : '❌'} **${result.verified ? 'VERIFIED' : 'FAILED'}**: ${result.evidence} (Score: ${result.score})`
).join('\n\n')}

## Performance Highlights

${report.summary.achievements.map(achievement => `- ✅ ${achievement}`).join('\n')}

## Issues Identified

${report.summary.issues.length > 0 ?
  report.summary.issues.map(issue => `- ❌ ${issue}`).join('\n') :
  '- ✅ No major issues identified'
}

## Recommendations

${report.recommendations.map(rec =>
  `### ${rec.category} (${rec.priority})\n**Issue**: ${rec.issue}\n**Action**: ${rec.action}`
).join('\n\n')}

## Conclusions

**Overall Assessment**: ${report.conclusions.overallAssessment}

**Confidence Level**: ${report.conclusions.confidenceLevel}

**Claims Verified**: ${report.conclusions.claimsVerified.length}/${Object.keys(report.verification.verificationResults).length}

---

*Report generated on ${new Date(report.metadata.timestamp).toLocaleString()}*
*Total benchmark duration: ${(report.metadata.totalDuration / 1000).toFixed(1)} seconds*
`;

    await fs.writeFile(filePath, md);
  }

  // Run all benchmarks
  async runAllBenchmarks() {
    console.log('🚀 Starting master benchmark suite...\n');
    console.log('This comprehensive test will validate system performance claims:');
    console.log('- Memory usage efficiency and leak prevention');
    console.log('- CPU performance under high load (50+ concurrent agents)');
    console.log('- Resource cleanup and system stability');
    console.log('- Performance improvements vs baseline metrics\n');

    try {
      // Run all benchmark suites
      await this.runComprehensiveBenchmark();
      await this.runMemoryProfiling();
      await this.runCPUBenchmark();
      await this.runCleanupValidation();

      // Generate final report
      const report = await this.generateReport();

      // Print final summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 FINAL BENCHMARK RESULTS');
      console.log('='.repeat(60));
      console.log(`Tests Run: ${report.executiveSummary.testsRun}`);
      console.log(`Tests Succeeded: ${report.executiveSummary.testsSucceeded}`);
      console.log(`Tests Failed: ${report.executiveSummary.testsFailed}`);
      console.log(`Overall Verification Score: ${report.verification.overallScore.toFixed(1)}%`);
      console.log(`System Health: ${report.executiveSummary.systemHealthy ? '✅ Healthy' : '❌ Issues Detected'}`);
      console.log(`Major Issues: ${report.executiveSummary.majorIssues}`);
      console.log(`\nConclusion: ${report.conclusions.overallAssessment}`);
      console.log(`Confidence: ${report.conclusions.confidenceLevel}`);

      return report;

    } catch (error) {
      console.error('\n💥 Master benchmark suite failed:', error);

      // Generate partial report even on failure
      const partialReport = await this.generateReport();

      throw error;
    }
  }
}

module.exports = MasterBenchmarkRunner;

// Run if called directly
if (require.main === module) {
  const runner = new MasterBenchmarkRunner();
  runner.runAllBenchmarks()
    .then(results => {
      console.log('\n🎉 Master benchmark suite completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Master benchmark suite failed:', error);
      process.exit(1);
    });
}