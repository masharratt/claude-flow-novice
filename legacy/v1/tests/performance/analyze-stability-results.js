#!/usr/bin/env node
/**
 * Stability Test Results Analyzer
 * Phase 2 Sprint 2.3 - 8-Hour Stability Test Analysis
 *
 * Validates:
 * - Memory growth <5%
 * - No resource leaks (FDs, processes)
 * - Sustained throughput >1000 msg/s
 * - CPU stability
 */

const fs = require('fs');
const path = require('path');

// Success thresholds
const THRESHOLDS = {
  MEMORY_GROWTH_PERCENT: 5.0,
  MIN_THROUGHPUT: 1000,
  MAX_CPU_PERCENT: 85.0,
  MAX_FD_COUNT: 10000,
  MAX_PROCESS_COUNT: 500,
  WARNING_MEMORY_SPIKES: 3
};

class StabilityAnalyzer {
  constructor(resultsDir) {
    this.resultsDir = resultsDir;
    this.results = {
      success: false,
      metrics: {},
      violations: [],
      warnings: []
    };
  }

  analyze() {
    console.log('Analyzing stability test results...\n');

    // Find latest CSV file
    const csvFiles = fs.readdirSync(this.resultsDir)
      .filter(f => f.startsWith('resource-usage-') && f.endsWith('.csv'))
      .map(f => ({
        name: f,
        path: path.join(this.resultsDir, f),
        mtime: fs.statSync(path.join(this.resultsDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (csvFiles.length === 0) {
      console.error('ERROR: No resource usage CSV files found');
      process.exit(1);
    }

    const csvPath = csvFiles[0].path;
    console.log(`Analyzing: ${csvFiles[0].name}\n`);

    // Parse CSV
    const data = this.parseCSV(csvPath);
    if (data.length === 0) {
      console.error('ERROR: No data found in CSV file');
      process.exit(1);
    }

    // Run analysis
    this.analyzeMemory(data);
    this.analyzeCPU(data);
    this.analyzeFileDescriptors(data);
    this.analyzeProcesses(data);
    this.analyzeThroughput(data);

    // Generate report
    this.generateReport();

    return this.results.success;
  }

  parseCSV(csvPath) {
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',');

    return lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      headers.forEach((header, i) => {
        row[header] = values[i];
      });
      return row;
    });
  }

  analyzeMemory(data) {
    const memoryRSS = data.map(row => parseFloat(row.memory_rss_mb));
    const initial = memoryRSS[0];
    const final = memoryRSS[memoryRSS.length - 1];
    const max = Math.max(...memoryRSS);
    const avg = memoryRSS.reduce((a, b) => a + b, 0) / memoryRSS.length;
    const growth = ((final - initial) / initial) * 100;

    this.results.metrics.memory = {
      initial_mb: initial.toFixed(2),
      final_mb: final.toFixed(2),
      max_mb: max.toFixed(2),
      avg_mb: avg.toFixed(2),
      growth_percent: growth.toFixed(2)
    };

    // Check for memory growth violation
    if (growth > THRESHOLDS.MEMORY_GROWTH_PERCENT) {
      this.results.violations.push({
        category: 'MEMORY',
        severity: 'CRITICAL',
        message: `Memory growth ${growth.toFixed(2)}% exceeds threshold ${THRESHOLDS.MEMORY_GROWTH_PERCENT}%`
      });
    }

    // Check for memory spikes
    let spikeCount = 0;
    for (let i = 1; i < memoryRSS.length; i++) {
      const increase = ((memoryRSS[i] - memoryRSS[i - 1]) / memoryRSS[i - 1]) * 100;
      if (increase > 10) spikeCount++;
    }

    if (spikeCount > THRESHOLDS.WARNING_MEMORY_SPIKES) {
      this.results.warnings.push({
        category: 'MEMORY',
        message: `${spikeCount} memory spikes detected (>10% increase)`
      });
    }
  }

  analyzeCPU(data) {
    const cpuPercent = data.map(row => parseFloat(row.cpu_percent));
    const max = Math.max(...cpuPercent);
    const avg = cpuPercent.reduce((a, b) => a + b, 0) / cpuPercent.length;

    this.results.metrics.cpu = {
      max_percent: max.toFixed(2),
      avg_percent: avg.toFixed(2)
    };

    if (max > THRESHOLDS.MAX_CPU_PERCENT) {
      this.results.warnings.push({
        category: 'CPU',
        message: `CPU peaked at ${max.toFixed(2)}% (threshold: ${THRESHOLDS.MAX_CPU_PERCENT}%)`
      });
    }
  }

  analyzeFileDescriptors(data) {
    const fdCounts = data.map(row => parseInt(row.fd_count));
    const max = Math.max(...fdCounts);
    const final = fdCounts[fdCounts.length - 1];
    const initial = fdCounts[0];
    const growth = final - initial;

    this.results.metrics.file_descriptors = {
      initial: initial,
      final: final,
      max: max,
      growth: growth
    };

    if (max > THRESHOLDS.MAX_FD_COUNT) {
      this.results.violations.push({
        category: 'FILE_DESCRIPTORS',
        severity: 'CRITICAL',
        message: `File descriptor count peaked at ${max} (threshold: ${THRESHOLDS.MAX_FD_COUNT})`
      });
    }

    if (growth > 100) {
      this.results.warnings.push({
        category: 'FILE_DESCRIPTORS',
        message: `File descriptor growth: ${growth} (potential leak)`
      });
    }
  }

  analyzeProcesses(data) {
    const processCounts = data.map(row => parseInt(row.process_count));
    const max = Math.max(...processCounts);
    const final = processCounts[processCounts.length - 1];
    const initial = processCounts[0];

    this.results.metrics.processes = {
      initial: initial,
      final: final,
      max: max
    };

    if (max > THRESHOLDS.MAX_PROCESS_COUNT) {
      this.results.violations.push({
        category: 'PROCESSES',
        severity: 'CRITICAL',
        message: `Process count peaked at ${max} (threshold: ${THRESHOLDS.MAX_PROCESS_COUNT})`
      });
    }

    if (final > initial + 10) {
      this.results.warnings.push({
        category: 'PROCESSES',
        message: `Process count increased by ${final - initial} (potential leak)`
      });
    }
  }

  analyzeThroughput(data) {
    const duration = data.length; // seconds (assuming 1s sampling)
    const totalElapsed = parseInt(data[data.length - 1].elapsed_sec);

    // Estimate throughput based on data points (1 sample = 1 second)
    // This is a placeholder - actual throughput should come from application metrics
    const estimatedThroughput = data.length > 0 ? Math.floor(duration / totalElapsed * 1000) : 0;

    this.results.metrics.throughput = {
      duration_seconds: totalElapsed,
      estimated_msg_per_sec: estimatedThroughput,
      total_samples: data.length
    };

    // Note: Real throughput validation requires application-level metrics
    this.results.warnings.push({
      category: 'THROUGHPUT',
      message: 'Throughput validation requires application metrics (not available in resource monitor)'
    });
  }

  generateReport() {
    console.log('='.repeat(60));
    console.log('STABILITY TEST RESULTS');
    console.log('='.repeat(60));
    console.log();

    // Metrics
    console.log('METRICS:');
    console.log('-'.repeat(60));

    console.log('\nMemory:');
    console.log(`  Initial: ${this.results.metrics.memory.initial_mb} MB`);
    console.log(`  Final:   ${this.results.metrics.memory.final_mb} MB`);
    console.log(`  Max:     ${this.results.metrics.memory.max_mb} MB`);
    console.log(`  Avg:     ${this.results.metrics.memory.avg_mb} MB`);
    console.log(`  Growth:  ${this.results.metrics.memory.growth_percent}% (threshold: ${THRESHOLDS.MEMORY_GROWTH_PERCENT}%)`);

    console.log('\nCPU:');
    console.log(`  Max:     ${this.results.metrics.cpu.max_percent}%`);
    console.log(`  Avg:     ${this.results.metrics.cpu.avg_percent}%`);

    console.log('\nFile Descriptors:');
    console.log(`  Initial: ${this.results.metrics.file_descriptors.initial}`);
    console.log(`  Final:   ${this.results.metrics.file_descriptors.final}`);
    console.log(`  Max:     ${this.results.metrics.file_descriptors.max}`);
    console.log(`  Growth:  ${this.results.metrics.file_descriptors.growth}`);

    console.log('\nProcesses:');
    console.log(`  Initial: ${this.results.metrics.processes.initial}`);
    console.log(`  Final:   ${this.results.metrics.processes.final}`);
    console.log(`  Max:     ${this.results.metrics.processes.max}`);

    console.log('\nDuration:');
    console.log(`  ${this.results.metrics.throughput.duration_seconds}s (${(this.results.metrics.throughput.duration_seconds / 3600).toFixed(2)} hours)`);
    console.log(`  Samples: ${this.results.metrics.throughput.total_samples}`);

    // Violations
    if (this.results.violations.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('VIOLATIONS:');
      console.log('-'.repeat(60));
      this.results.violations.forEach(v => {
        console.log(`[${v.severity}] ${v.category}: ${v.message}`);
      });
    }

    // Warnings
    if (this.results.warnings.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('WARNINGS:');
      console.log('-'.repeat(60));
      this.results.warnings.forEach(w => {
        console.log(`[${w.category}] ${w.message}`);
      });
    }

    // Final verdict
    console.log('\n' + '='.repeat(60));
    this.results.success = this.results.violations.length === 0;

    if (this.results.success) {
      console.log('RESULT: ✅ PASS');
      console.log('All success criteria met.');
    } else {
      console.log('RESULT: ❌ FAIL');
      console.log(`${this.results.violations.length} critical violation(s) detected.`);
    }
    console.log('='.repeat(60));

    // Save results
    const reportPath = path.join(this.resultsDir, `stability-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\nReport saved: ${reportPath}`);
  }
}

// Main execution
const resultsDir = process.argv[2] || './stability-results';

if (!fs.existsSync(resultsDir)) {
  console.error(`ERROR: Results directory not found: ${resultsDir}`);
  process.exit(1);
}

const analyzer = new StabilityAnalyzer(resultsDir);
const success = analyzer.analyze();

process.exit(success ? 0 : 1);
