/**
 * Performance Benchmarks for SQLite Memory Management
 * Phase 1 Foundation Infrastructure & Event Bus Architecture
 *
 * Comprehensive performance testing for the 12-table SQLite schema
 * with 5-level ACL system and Redis coordination.
 */

const SwarmMemoryManager = require('./SwarmMemoryManager');
const MemoryStoreAdapter = require('./MemoryStoreAdapter');
const fs = require('fs');
const path = require('path');

class PerformanceBenchmarks {
  constructor(options = {}) {
    this.options = {
      testDbPath: options.testDbPath || ':memory:',
      testIterations: options.testIterations || 1000,
      concurrency: options.concurrency || 10,
      dataSize: options.dataSize || 1024, // 1KB
      enableEncryption: options.enableEncryption !== false,
      enableCompression: options.enableCompression !== false,
      outputDir: options.outputDir || './benchmarks',
      ...options
    };

    this.memoryManager = null;
    this.adapter = null;
    this.results = {
      timestamp: new Date().toISOString(),
      configuration: this.options,
      tests: {}
    };
  }

  /**
   * Initialize benchmark environment
   */
  async initialize() {
    console.log('🚀 Initializing Performance Benchmarks...');

    // Create output directory
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    // Initialize memory manager
    this.memoryManager = new SwarmMemoryManager({
      dbPath: this.options.testDbPath,
      encryptionKey: Buffer.from('benchmark-encryption-key-32-bytes', 'utf8'),
      compressionThreshold: this.options.enableCompression ? 1024 : Infinity
    });

    await this.memoryManager.initialize();

    // Initialize adapter
    this.adapter = new MemoryStoreAdapter({
      dbPath: this.options.testDbPath,
      swarmId: 'benchmark-swarm',
      namespace: 'benchmark-test'
    });

    await this.adapter.initialize();

    console.log('✅ Benchmark environment initialized');
  }

  /**
   * Run all performance benchmarks
   */
  async runAllBenchmarks() {
    console.log('📊 Running Performance Benchmarks...');

    await this.initialize();

    try {
      // Basic operations benchmarks
      await this.benchmarkBasicOperations();
      await this.benchmarkConcurrentOperations();
      await this.benchmarkAclPerformance();
      await this.benchmarkEncryptionPerformance();
      await this.benchmarkCompressionPerformance();

      // Advanced benchmarks
      await this.benchmarkLargeDataOperations();
      await this.benchmarkTtlOperations();
      await this.benchmarkNamespaceOperations();
      await this.benchmarkBackupAndRestore();
      await this.benchmarkOptimizationOperations();

      // Summary
      this.generateSummary();
      await this.saveResults();

      console.log('✅ All benchmarks completed');
      return this.results;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Benchmark basic CRUD operations
   */
  async benchmarkBasicOperations() {
    console.log('🔍 Benchmarking Basic Operations...');

    const testName = 'basic_operations';
    const results = {
      set: [],
      get: [],
      delete: [],
      has: []
    };

    const testData = this.generateTestData(this.options.testIterations);

    // Benchmark SET operations
    console.log('  📝 SET operations...');
    for (let i = 0; i < this.options.testIterations; i++) {
      const start = process.hrtime.bigint();
      await this.adapter.set(`key-${i}`, testData[i]);
      const end = process.hrtime.bigint();
      results.set.push(Number(end - start) / 1000000); // Convert to milliseconds
    }

    // Benchmark GET operations
    console.log('  📖 GET operations...');
    for (let i = 0; i < this.options.testIterations; i++) {
      const start = process.hrtime.bigint();
      await this.adapter.get(`key-${i}`);
      const end = process.hrtime.bigint();
      results.get.push(Number(end - start) / 1000000);
    }

    // Benchmark HAS operations
    console.log('  🔍 HAS operations...');
    for (let i = 0; i < this.options.testIterations; i++) {
      const start = process.hrtime.bigint();
      await this.adapter.has(`key-${i}`);
      const end = process.hrtime.bigint();
      results.has.push(Number(end - start) / 1000000);
    }

    // Benchmark DELETE operations
    console.log('  🗑️  DELETE operations...');
    for (let i = 0; i < this.options.testIterations; i++) {
      const start = process.hrtime.bigint();
      await this.adapter.delete(`key-${i}`);
      const end = process.hrtime.bigint();
      results.delete.push(Number(end - start) / 1000000);
    }

    this.results.tests[testName] = this.calculateStats(results);
    console.log(`  ✅ Basic Operations: ${this.results.tests[testName].set.avg.toFixed(2)}ms avg SET`);
  }

  /**
   * Benchmark concurrent operations
   */
  async benchmarkConcurrentOperations() {
    console.log('🚀 Benchmarking Concurrent Operations...');

    const testName = 'concurrent_operations';
    const results = {
      concurrent_sets: [],
      concurrent_gets: []
    };

    const concurrency = this.options.concurrency;
    const operationsPerWorker = Math.floor(this.options.testIterations / concurrency);

    // Concurrent SET operations
    console.log('  📝 Concurrent SET operations...');
    const setPromises = [];
    for (let worker = 0; worker < concurrency; worker++) {
      setPromises.push(this.runConcurrentSets(worker, operationsPerWorker, results));
    }

    const setStart = process.hrtime.bigint();
    await Promise.all(setPromises);
    const setEnd = process.hrtime.bigint();

    // Concurrent GET operations
    console.log('  📖 Concurrent GET operations...');
    const getPromises = [];
    for (let worker = 0; worker < concurrency; worker++) {
      getPromises.push(this.runConcurrentGets(worker, operationsPerWorker, results));
    }

    const getStart = process.hrtime.bigint();
    await Promise.all(getPromises);
    const getEnd = process.hrtime.bigint();

    this.results.tests[testName] = {
      concurrent_sets: {
        totalTime: Number(setEnd - setStart) / 1000000,
        opsPerSecond: (this.options.testIterations) / (Number(setEnd - setStart) / 1000000000),
        workers: concurrency
      },
      concurrent_gets: {
        totalTime: Number(getEnd - getStart) / 1000000,
        opsPerSecond: (this.options.testIterations) / (Number(getEnd - getStart) / 1000000000),
        workers: concurrency
      }
    };

    console.log(`  ✅ Concurrent: ${this.results.tests[testName].concurrent_sets.opsPerSecond.toFixed(0)} SET ops/sec`);
  }

  /**
   * Benchmark ACL performance
   */
  async benchmarkAclPerformance() {
    console.log('🔐 Benchmarking ACL Performance...');

    const testName = 'acl_performance';
    const results = {
      acl_checks: [],
      cache_hits: 0,
      cache_misses: 0
    };

    // Test ACL checks at different levels
    const agentIds = ['agent-1', 'agent-2', 'agent-3'];
    const aclLevels = [1, 2, 3, 4, 5];

    for (let i = 0; i < this.options.testIterations; i++) {
      const agentId = agentIds[i % agentIds.length];
      const aclLevel = aclLevels[i % aclLevels.length];

      const start = process.hrtime.bigint();
      await this.memoryManager._checkACL(agentId, aclLevel, 'read');
      const end = process.hrtime.bigint();

      results.acl_checks.push(Number(end - start) / 1000000);
    }

    // Get cache metrics
    const metrics = this.memoryManager.getMetrics();
    results.cache_hits = metrics.cacheHits;
    results.cache_misses = metrics.cacheMisses;

    this.results.tests[testName] = {
      acl_checks: this.calculateStats(results.acl_checks),
      cache_hit_rate: results.cache_hits / (results.cache_hits + results.cache_misses)
    };

    console.log(`  ✅ ACL: ${this.results.tests[testName].acl_checks.avg.toFixed(2)}ms avg check`);
  }

  /**
   * Benchmark encryption performance
   */
  async benchmarkEncryptionPerformance() {
    if (!this.options.enableEncryption) {
      console.log('⏭️  Skipping encryption benchmarks (disabled)');
      return;
    }

    console.log('🔒 Benchmarking Encryption Performance...');

    const testName = 'encryption_performance';
    const results = {
      encrypt: [],
      decrypt: []
    };

    const testData = this.generateTestData(this.options.testIterations);

    for (let i = 0; i < this.options.testIterations; i++) {
      const data = testData[i];
      const aclLevel = (i % 2) + 1; // private or team level

      // Benchmark encryption
      const encryptStart = process.hrtime.bigint();
      this.memoryManager._encrypt(data, aclLevel);
      const encryptEnd = process.hrtime.bigint();
      results.encrypt.push(Number(encryptEnd - encryptStart) / 1000000);

      // Benchmark decryption
      const encrypted = this.memoryManager._encrypt(data, aclLevel);
      const decryptStart = process.hrtime.bigint();
      this.memoryManager._decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag, aclLevel);
      const decryptEnd = process.hrtime.bigint();
      results.decrypt.push(Number(decryptEnd - decryptStart) / 1000000);
    }

    this.results.tests[testName] = {
      encrypt: this.calculateStats(results.encrypt),
      decrypt: this.calculateStats(results.decrypt)
    };

    console.log(`  ✅ Encryption: ${this.results.tests[testName].encrypt.avg.toFixed(2)}ms avg`);
  }

  /**
   * Benchmark compression performance
   */
  async benchmarkCompressionPerformance() {
    if (!this.options.enableCompression) {
      console.log('⏭️  Skipping compression benchmarks (disabled)');
      return;
    }

    console.log('📦 Benchmarking Compression Performance...');

    const testName = 'compression_performance';
    const results = {
      compress: [],
      decompress: [],
      compression_ratios: []
    };

    const testData = this.generateLargeTestData(this.options.testIterations, 10240); // 10KB

    for (let i = 0; i < this.options.testIterations; i++) {
      const data = testData[i];
      const originalSize = Buffer.byteLength(data, 'utf8');

      // Benchmark compression
      const compressStart = process.hrtime.bigint();
      const compressed = this.memoryManager._compress(data);
      const compressEnd = process.hrtime.bigint();
      results.compress.push(Number(compressEnd - compressStart) / 1000000);

      // Calculate compression ratio
      const compressedSize = Buffer.byteLength(compressed, 'utf8');
      const compressionRatio = originalSize / compressedSize;
      results.compression_ratios.push(compressionRatio);

      // Benchmark decompression
      const decompressStart = process.hrtime.bigint();
      this.memoryManager._decompress(compressed);
      const decompressEnd = process.hrtime.bigint();
      results.decompress.push(Number(decompressEnd - decompressStart) / 1000000);
    }

    this.results.tests[testName] = {
      compress: this.calculateStats(results.compress),
      decompress: this.calculateStats(results.decompress),
      compression_ratio: {
        avg: results.compression_ratios.reduce((a, b) => a + b, 0) / results.compression_ratios.length,
        min: Math.min(...results.compression_ratios),
        max: Math.max(...results.compression_ratios)
      }
    };

    console.log(`  ✅ Compression: ${this.results.tests[testName].compress.avg.toFixed(2)}ms avg, ${this.results.tests[testName].compression_ratio.avg.toFixed(2)}x ratio`);
  }

  /**
   * Benchmark large data operations
   */
  async benchmarkLargeDataOperations() {
    console.log('📊 Benchmarking Large Data Operations...');

    const testName = 'large_data_operations';
    const results = {
      large_sets: [],
      large_gets: []
    };

    const largeDataSizes = [10240, 51200, 102400, 512000]; // 10KB to 500KB

    for (const size of largeDataSizes) {
      const largeData = this.generateLargeTestData(10, size);

      for (let i = 0; i < 10; i++) {
        // Benchmark large SET
        const setStart = process.hrtime.bigint();
        await this.adapter.set(`large-key-${size}-${i}`, largeData[i]);
        const setEnd = process.hrtime.bigint();
        results.large_sets.push({
          size,
          time: Number(setEnd - setStart) / 1000000
        });

        // Benchmark large GET
        const getStart = process.hrtime.bigint();
        await this.adapter.get(`large-key-${size}-${i}`);
        const getEnd = process.hrtime.bigint();
        results.large_gets.push({
          size,
          time: Number(getEnd - getStart) / 1000000
        });
      }
    }

    this.results.tests[testName] = {
      large_sets: this.groupBySize(results.large_sets),
      large_gets: this.groupBySize(results.large_gets)
    };

    console.log(`  ✅ Large Data: Benchmark completed for up to 500KB`);
  }

  /**
   * Benchmark TTL operations
   */
  async benchmarkTtlOperations() {
    console.log('⏰ Benchmarking TTL Operations...');

    const testName = 'ttl_operations';
    const results = {
      set_with_ttl: [],
      ttl_cleanup: []
    };

    // Benchmark SET with TTL
    for (let i = 0; i < 100; i++) {
      const ttl = Math.floor(Math.random() * 300) + 60; // 1-5 minutes

      const start = process.hrtime.bigint();
      await this.adapter.set(`ttl-key-${i}`, `value-${i}`, { ttl });
      const end = process.hrtime.bigint();

      results.set_with_ttl.push(Number(end - start) / 1000000);
    }

    // Wait for some entries to expire
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Benchmark TTL cleanup
    const cleanupStart = process.hrtime.bigint();
    await this.memoryManager.vacuum();
    const cleanupEnd = process.hrtime.bigint();
    results.ttl_cleanup.push(Number(cleanupEnd - cleanupStart) / 1000000);

    this.results.tests[testName] = {
      set_with_ttl: this.calculateStats(results.set_with_ttl),
      ttl_cleanup: this.calculateStats(results.ttl_cleanup)
    };

    console.log(`  ✅ TTL: ${this.results.tests[testName].set_with_ttl.avg.toFixed(2)}ms avg SET`);
  }

  /**
   * Benchmark namespace operations
   */
  async benchmarkNamespaceOperations() {
    console.log('📂 Benchmarking Namespace Operations...');

    const testName = 'namespace_operations';
    const results = {
      namespace_sets: [],
      namespace_gets: [],
      namespace_clears: []
    };

    const namespaces = ['ns1', 'ns2', 'ns3', 'ns4', 'ns5'];

    for (const ns of namespaces) {
      const adapter = new MemoryStoreAdapter({
        dbPath: this.options.testDbPath,
        swarmId: 'benchmark-swarm',
        namespace: ns
      });
      await adapter.initialize();

      // Benchmark SET in namespace
      const setStart = process.hrtime.bigint();
      for (let i = 0; i < 50; i++) {
        await adapter.set(`key-${i}`, `value-${i}`);
      }
      const setEnd = process.hrtime.bigint();
      results.namespace_sets.push(Number(setEnd - setStart) / 1000000);

      // Benchmark GET from namespace
      const getStart = process.hrtime.bigint();
      for (let i = 0; i < 50; i++) {
        await adapter.get(`key-${i}`);
      }
      const getEnd = process.hrtime.bigint();
      results.namespace_gets.push(Number(getEnd - getStart) / 1000000);

      // Benchmark CLEAR namespace
      const clearStart = process.hrtime.bigint();
      await adapter.clear();
      const clearEnd = process.hrtime.bigint();
      results.namespace_clears.push(Number(clearEnd - clearStart) / 1000000);

      await adapter.close();
    }

    this.results.tests[testName] = {
      namespace_sets: this.calculateStats(results.namespace_sets),
      namespace_gets: this.calculateStats(results.namespace_gets),
      namespace_clears: this.calculateStats(results.namespace_clears)
    };

    console.log(`  ✅ Namespace: ${this.results.tests[testName].namespace_sets.avg.toFixed(2)}ms avg SET`);
  }

  /**
   * Benchmark backup and restore operations
   */
  async benchmarkBackupAndRestore() {
    console.log('💾 Benchmarking Backup and Restore...');

    const testName = 'backup_restore';
    const results = {
      backup: [],
      restore: []
    };

    // Populate with test data
    for (let i = 0; i < 100; i++) {
      await this.adapter.set(`backup-key-${i}`, `backup-value-${i}`);
    }

    // Benchmark backup
    const backupPath = path.join(this.options.outputDir, 'benchmark-backup.db');
    const backupStart = process.hrtime.bigint();
    await this.adapter.backup(backupPath);
    const backupEnd = process.hrtime.bigint();
    results.backup.push(Number(backupEnd - backupStart) / 1000000);

    // Clear current data
    await this.adapter.clear({ clearAll: true });

    // Benchmark restore (create new adapter with backup)
    const restoreStart = process.hrtime.bigint();
    const restoreAdapter = new MemoryStoreAdapter({
      dbPath: backupPath,
      swarmId: 'benchmark-swarm',
      namespace: 'benchmark-test'
    });
    await restoreAdapter.initialize();
    const restoreEnd = process.hrtime.bigint();
    results.restore.push(Number(restoreEnd - restoreStart) / 1000000);

    // Verify restore worked
    const restoredValue = await restoreAdapter.get('backup-key-50');
    if (restoredValue !== 'backup-value-50') {
      throw new Error('Restore verification failed');
    }

    await restoreAdapter.close();

    // Cleanup backup file
    try {
      fs.unlinkSync(backupPath);
    } catch (error) {
      // Ignore cleanup errors
    }

    this.results.tests[testName] = {
      backup: this.calculateStats(results.backup),
      restore: this.calculateStats(results.restore)
    };

    console.log(`  ✅ Backup/Restore: ${this.results.tests[testName].backup.avg.toFixed(2)}ms avg backup`);
  }

  /**
   * Benchmark optimization operations
   */
  async benchmarkOptimizationOperations() {
    console.log('⚡ Benchmarking Optimization Operations...');

    const testName = 'optimization_operations';
    const results = {
      vacuum: [],
      analyze: [],
      cache_clear: []
    };

    // Populate with data to optimize
    for (let i = 0; i < 500; i++) {
      await this.adapter.set(`opt-key-${i}`, `opt-value-${i}`);
      if (i % 10 === 0) {
        await this.adapter.delete(`opt-key-${i-10}`);
      }
    }

    // Benchmark VACUUM
    const vacuumStart = process.hrtime.bigint();
    await this.memoryManager.vacuum();
    const vacuumEnd = process.hrtime.bigint();
    results.vacuum.push(Number(vacuumEnd - vacuumStart) / 1000000);

    // Benchmark ANALYZE
    const analyzeStart = process.hrtime.bigint();
    await this.memoryManager.analyze();
    const analyzeEnd = process.hrtime.bigint();
    results.analyze.push(Number(analyzeEnd - analyzeStart) / 1000000);

    // Benchmark ACL cache clear
    const cacheStart = process.hrtime.bigint();
    this.memoryManager.clearACLCache();
    const cacheEnd = process.hrtime.bigint();
    results.cache_clear.push(Number(cacheEnd - cacheStart) / 1000000);

    this.results.tests[testName] = {
      vacuum: this.calculateStats(results.vacuum),
      analyze: this.calculateStats(results.analyze),
      cache_clear: this.calculateStats(results.cache_clear)
    };

    console.log(`  ✅ Optimization: ${this.results.tests[testName].vacuum.avg.toFixed(2)}ms avg VACUUM`);
  }

  /**
   * Generate test data
   */
  generateTestData(count) {
    const data = [];
    for (let i = 0; i < count; i++) {
      data.push(`test-data-${i}-${Math.random().toString(36).substring(7)}`.repeat(10));
    }
    return data;
  }

  /**
   * Generate large test data
   */
  generateLargeTestData(count, size) {
    const data = [];
    for (let i = 0; i < count; i++) {
      let str = `large-data-${i}-`;
      while (Buffer.byteLength(str, 'utf8') < size) {
        str += Math.random().toString(36).substring(7);
      }
      data.push(str.substring(0, size));
    }
    return data;
  }

  /**
   * Calculate statistics from array of numbers
   */
  calculateStats(values) {
    if (values.length === 0) return {};

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      ops: values.length
    };
  }

  /**
   * Group results by data size
   */
  groupBySize(results) {
    const grouped = {};
    results.forEach(result => {
      if (!grouped[result.size]) {
        grouped[result.size] = [];
      }
      grouped[result.size].push(result.time);
    });

    const stats = {};
    Object.keys(grouped).forEach(size => {
      stats[size] = this.calculateStats(grouped[size]);
    });

    return stats;
  }

  /**
   * Run concurrent SET operations
   */
  async runConcurrentSets(workerId, count, results) {
    for (let i = 0; i < count; i++) {
      const key = `concurrent-set-${workerId}-${i}`;
      const value = `value-${Math.random()}`;

      const start = process.hrtime.bigint();
      await this.adapter.set(key, value);
      const end = process.hrtime.bigint();

      results.concurrent_sets.push(Number(end - start) / 1000000);
    }
  }

  /**
   * Run concurrent GET operations
   */
  async runConcurrentGets(workerId, count, results) {
    for (let i = 0; i < count; i++) {
      const key = `concurrent-set-${workerId}-${i}`;

      const start = process.hrtime.bigint();
      await this.adapter.get(key);
      const end = process.hrtime.bigint();

      results.concurrent_gets.push(Number(end - start) / 1000000);
    }
  }

  /**
   * Generate performance summary
   */
  generateSummary() {
    console.log('📋 Generating Performance Summary...');

    this.results.summary = {
      totalTests: Object.keys(this.results.tests).length,
      keyMetrics: {}
    };

    // Extract key metrics
    if (this.results.tests.basic_operations) {
      this.results.summary.keyMetrics.avgSetTime = this.results.tests.basic_operations.set.avg;
      this.results.summary.keyMetrics.avgGetTime = this.results.tests.basic_operations.get.avg;
    }

    if (this.results.tests.concurrent_operations) {
      this.results.summary.keyMetrics.maxSetOpsPerSec = this.results.tests.concurrent_operations.concurrent_sets.opsPerSecond;
      this.results.summary.keyMetrics.maxGetOpsPerSec = this.results.tests.concurrent_operations.concurrent_gets.opsPerSecond;
    }

    if (this.results.tests.acl_performance) {
      this.results.summary.keyMetrics.aclCheckTime = this.results.tests.acl_performance.acl_checks.avg;
      this.results.summary.keyMetrics.aclCacheHitRate = this.results.tests.acl_performance.cache_hit_rate;
    }

    if (this.results.tests.encryption_performance) {
      this.results.summary.keyMetrics.encryptionTime = this.results.tests.encryption_performance.encrypt.avg;
    }

    if (this.results.tests.compression_performance) {
      this.results.summary.keyMetrics.compressionTime = this.results.tests.compression_performance.compress.avg;
      this.results.summary.keyMetrics.compressionRatio = this.results.tests.compression_performance.compression_ratio.avg;
    }

    console.log('✅ Performance summary generated');
  }

  /**
   * Save benchmark results
   */
  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(this.options.outputDir, `performance-benchmarks-${timestamp}.json`);

    fs.writeFileSync(resultsFile, JSON.stringify(this.results, null, 2));

    // Generate HTML report
    const htmlFile = path.join(this.options.outputDir, `performance-report-${timestamp}.html`);
    this.generateHtmlReport(htmlFile);

    console.log(`💾 Results saved to: ${resultsFile}`);
    console.log(`📄 HTML report: ${htmlFile}`);
  }

  /**
   * Generate HTML performance report
   */
  generateHtmlReport(outputFile) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>SQLite Memory Management Performance Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { margin: 20px 0; }
        .test-section { margin: 30px 0; border: 1px solid #ddd; border-radius: 5px; padding: 20px; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f9f9f9; border-radius: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f5f5f5; }
        .metric-value { font-weight: bold; color: #2196F3; }
    </style>
</head>
<body>
    <div class="header">
        <h1>SQLite Memory Management Performance Report</h1>
        <p>Generated: ${this.results.timestamp}</p>
        <p>Test Configuration: ${JSON.stringify(this.results.configuration, null, 2)}</p>
    </div>

    <div class="summary">
        <h2>Summary</h2>
        <div class="metric">
            <span class="metric-label">Total Tests:</span>
            <span class="metric-value">${this.results.summary.totalTests}</span>
        </div>
        <div class="metric">
            <span class="metric-label">Avg SET Time:</span>
            <span class="metric-value">${(this.results.summary.keyMetrics.avgSetTime || 0).toFixed(2)}ms</span>
        </div>
        <div class="metric">
            <span class="metric-label">Avg GET Time:</span>
            <span class="metric-value">${(this.results.summary.keyMetrics.avgGetTime || 0).toFixed(2)}ms</span>
        </div>
        <div class="metric">
            <span class="metric-label">Max SET Ops/sec:</span>
            <span class="metric-value">${(this.results.summary.keyMetrics.maxSetOpsPerSec || 0).toFixed(0)}</span>
        </div>
        <div class="metric">
            <span class="metric-label">Max GET Ops/sec:</span>
            <span class="metric-value">${(this.results.summary.keyMetrics.maxGetOpsPerSec || 0).toFixed(0)}</span>
        </div>
    </div>

    ${Object.entries(this.results.tests).map(([testName, testResults]) => `
        <div class="test-section">
            <h3>${testName.replace(/_/g, ' ').toUpperCase()}</h3>
            <pre>${JSON.stringify(testResults, null, 2)}</pre>
        </div>
    `).join('')}
</body>
</html>`;

    fs.writeFileSync(outputFile, html);
  }

  /**
   * Cleanup benchmark environment
   */
  async cleanup() {
    console.log('🧹 Cleaning up benchmark environment...');

    if (this.adapter) {
      await this.adapter.close();
    }

    if (this.memoryManager) {
      await this.memoryManager.close();
    }

    console.log('✅ Cleanup completed');
  }
}

module.exports = PerformanceBenchmarks;