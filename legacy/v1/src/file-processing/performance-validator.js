/**
 * File Processing Performance Validator
 * Validates 10+ MB/s throughput performance target with comprehensive testing
 */

import HighThroughputFileProcessor from './high-throughput-engine.js';
import ThroughputMonitor from './throughput-monitor.js';
import SIMDOptimizer from './simd-optimizer.js';
import RedisCoordinator from './redis-coordinator.js';
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class PerformanceValidator {
  constructor(options = {}) {
    this.options = {
      testDuration: options.testDuration || 30000, // 30 seconds
      targetThroughput: options.targetThroughput || 10, // MB/s
      minFileSize: options.minFileSize || 1024 * 1024, // 1MB
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
      fileCount: options.fileCount || 1000,
      enableRedis: options.enableRedis || false,
      enableSIMD: options.enableSIMD !== false,
      ...options
    };

    // Components
    this.fileProcessor = null;
    this.monitor = null;
    this.simdOptimizer = null;
    this.redisCoordinator = null;

    // Test state
    this.isRunning = false;
    this.testResults = null;
    this.testFiles = [];

    // Performance targets
    this.targets = {
      throughput: this.options.targetThroughput, // MB/s
      fileProcessingRate: 100, // files/second
      errorRate: 5, // percentage
      memoryUsage: 80, // percentage
      cpuUsage: 90 // percentage
    };

    console.log(`🎯 Performance validator initialized with target: ${this.options.targetThroughput} MB/s`);
  }

  /**
   * Initialize all components for validation
   */
  async initialize() {
    console.log('🔧 Initializing performance validator components...');

    // Initialize file processor
    this.fileProcessor = new HighThroughputFileProcessor({
      swarmId: 'performance-validation',
      workerPoolSize: require('os').cpus().length,
      chunkSize: 2 * 1024 * 1024, // 2MB chunks
      bufferSize: 128 * 1024 * 1024 // 128MB buffer
    });

    // Initialize throughput monitor
    this.monitor = new ThroughputMonitor({
      samplingInterval: 500, // 500ms
      reportInterval: 2000, // 2 seconds
      throughputThreshold: this.options.targetThroughput,
      errorThreshold: 5
    });

    // Initialize SIMD optimizer
    this.simdOptimizer = new SIMDOptimizer({
      enableSIMD: this.options.enableSIMD,
      chunkSize: 64 * 1024, // 64KB chunks
      workerCount: require('os').cpus().length
    });

    // Initialize Redis coordinator if enabled
    if (this.options.enableRedis) {
      this.redisCoordinator = new RedisCoordinator({
        swarmId: 'performance-validation'
      });
      await this.redisCoordinator.initialize();
    }

    // Setup event listeners
    this.setupEventListeners();

    console.log('✅ Performance validator initialized');
  }

  /**
   * Setup event listeners for monitoring
   */
  setupEventListeners() {
    // File processor events
    this.fileProcessor.on('progress', (progress) => {
      this.monitor.updateMetrics({
        bytesProcessed: progress.bytesProcessed - (this.lastProcessedBytes || 0),
        filesProcessed: progress.file && progress.file !== this.lastFile ? 1 : 0
      });
      this.lastProcessedBytes = progress.bytesProcessed;
      this.lastFile = progress.file;
    });

    this.fileProcessor.on('error', (error) => {
      this.monitor.updateMetrics({ errors: 1 });
      console.error('File processing error:', error.message);
    });

    // Monitor events
    this.monitor.on('alert', (alert) => {
      console.warn(`⚠️ Performance alert: ${alert.message}`);
    });

    this.monitor.on('report-generated', (report) => {
      if (report.isFinal) {
        this.testResults = report;
        this.analyzeResults();
      }
    });
  }

  /**
   * Generate test files for benchmarking
   */
  async generateTestFiles() {
    console.log(`📁 Generating ${this.options.fileCount} test files...`);

    const testDir = path.join(__dirname, '../../test-data');
    await fs.mkdir(testDir, { recursive: true });

    this.testFiles = [];

    for (let i = 0; i < this.options.fileCount; i++) {
      // Generate random file size between min and max
      const fileSize = Math.floor(
        Math.random() * (this.options.maxFileSize - this.options.minFileSize) +
        this.options.minFileSize
      );

      const fileName = `test-file-${i.toString().padStart(4, '0')}.bin`;
      const filePath = path.join(testDir, fileName);

      // Generate random data
      const data = crypto.randomBytes(fileSize);
      await fs.writeFile(filePath, data);

      this.testFiles.push({
        path: filePath,
        size: fileSize,
        name: fileName
      });

      // Progress indicator
      if ((i + 1) % 100 === 0) {
        console.log(`  Generated ${i + 1}/${this.options.fileCount} files`);
      }
    }

    const totalSize = this.testFiles.reduce((sum, f) => sum + f.size, 0);
    console.log(`✅ Generated ${this.options.fileCount} test files (${(totalSize / 1024 / 1024).toFixed(2)} MB total)`);

    return this.testFiles;
  }

  /**
   * Run comprehensive performance validation
   */
  async validatePerformance() {
    if (this.isRunning) {
      throw new Error('Validation already running');
    }

    console.log('🚀 Starting comprehensive performance validation...');

    try {
      await this.initialize();
      await this.generateTestFiles();

      this.isRunning = true;
      this.startTime = Date.now();

      // Start monitoring
      await this.monitor.startMonitoring();

      // Initialize metrics tracking
      this.lastProcessedBytes = 0;
      this.lastFile = null;

      console.log(`📊 Running validation for ${this.options.testDuration / 1000} seconds...`);

      // Create timeout for test duration
      const testTimeout = new Promise((resolve) => {
        setTimeout(resolve, this.options.testDuration);
      });

      // Run file processing
      const processingPromise = this.runFileProcessing();

      // Wait for test completion
      await Promise.race([testTimeout, processingPromise]);

      // Stop monitoring and generate final report
      await this.monitor.stopMonitoring();

      // Cleanup test files
      await this.cleanupTestFiles();

      this.isRunning = false;

      return this.testResults;

    } catch (error) {
      this.isRunning = false;
      console.error('❌ Performance validation failed:', error);
      throw error;
    }
  }

  /**
   * Run file processing with optimized algorithms
   */
  async runFileProcessing() {
    const processingPromises = [];

    for (const file of this.testFiles) {
      const fileProcessor = async () => {
        try {
          // Choose processing strategy based on file size
          let result;
          if (file.size > 10 * 1024 * 1024 && this.options.enableSIMD) {
            // Use SIMD optimization for large files
            const data = await fs.readFile(file.path);
            result = await this.simdOptimizer.processData(data, 'analyze');
          } else {
            // Use standard file processor
            result = await this.fileProcessor.processFile(file.path, async (chunk) => {
              // Simple analysis processor
              return {
                size: chunk.length,
                checksum: this.calculateChecksum(chunk),
                timestamp: Date.now()
              };
            });
          }

          return {
            file: file.name,
            size: file.size,
            processed: true,
            result
          };

        } catch (error) {
          console.error(`Error processing ${file.name}:`, error.message);
          return {
            file: file.name,
            size: file.size,
            processed: false,
            error: error.message
          };
        }
      };

      processingPromises.push(fileProcessor());

      // Add small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    // Wait for all files to be processed
    const results = await Promise.allSettled(processingPromises);

    // Process results
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.processed);
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.processed));

    console.log(`✅ Processed ${successful.length} files successfully`);
    if (failed.length > 0) {
      console.warn(`⚠️ ${failed.length} files failed processing`);
    }

    return {
      successful: successful.length,
      failed: failed.length,
      total: this.testFiles.length
    };
  }

  /**
   * Calculate simple checksum
   */
  calculateChecksum(data) {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Analyze validation results
   */
  analyzeResults() {
    if (!this.testResults) {
      console.error('❌ No test results available for analysis');
      return;
    }

    const { summary } = this.testResults;

    console.log('\n📊 PERFORMANCE VALIDATION RESULTS');
    console.log('=' .repeat(60));

    // Throughput analysis
    const throughputMet = summary.avgThroughput >= this.targets.throughput;
    console.log(`Throughput: ${summary.avgThroughput.toFixed(2)} MB/s ${throughputMet ? '✅' : '❌'} (target: ${this.targets.throughput} MB/s)`);

    // File processing rate
    const fileRate = summary.totalFiles / (this.testResults.duration / 1000);
    const fileRateMet = fileRate >= this.targets.fileProcessingRate;
    console.log(`File Rate: ${fileRate.toFixed(2)} files/s ${fileRateMet ? '✅' : '❌'} (target: ${this.targets.fileProcessingRate} files/s)`);

    // Error rate
    const errorRate = summary.avgErrorRate;
    const errorRateMet = errorRate <= this.targets.errorRate;
    console.log(`Error Rate: ${errorRate.toFixed(2)}% ${errorRateMet ? '✅' : '❌'} (target: ≤${this.targets.errorRate}%)`);

    // Efficiency
    console.log(`Efficiency: ${summary.efficiency.toFixed(2)}%`);

    // Performance score
    const scores = [
      throughputMet ? 1 : 0,
      fileRateMet ? 1 : 0,
      errorRateMet ? 1 : 0,
      summary.efficiency >= 80 ? 1 : 0
    ];

    const performanceScore = (scores.reduce((a, b) => a + b, 0) / scores.length) * 100;
    const passed = performanceScore >= 75;

    console.log('\n🎯 PERFORMANCE SCORE: ' + performanceScore.toFixed(0) + '% ' + (passed ? '✅ PASSED' : '❌ FAILED'));
    console.log('=' .repeat(60));

    // Store validation results
    this.validationResults = {
      timestamp: Date.now(),
      duration: this.testResults.duration,
      targets: this.targets,
      actual: {
        throughput: summary.avgThroughput,
        fileRate,
        errorRate,
        efficiency: summary.efficiency
      },
      passed,
      performanceScore,
      summary
    };

    // Publish to Redis if available
    if (this.redisCoordinator) {
      this.publishValidationResults();
    }
  }

  /**
   * Publish validation results to Redis
   */
  async publishValidationResults() {
    if (!this.redisCoordinator || !this.validationResults) {
      return;
    }

    try {
      await this.redisCoordinator.publishMetrics({
        validation: this.validationResults,
        type: 'performance-validation'
      });

      console.log('📡 Validation results published to Redis');
    } catch (error) {
      console.error('Failed to publish results to Redis:', error.message);
    }
  }

  /**
   * Cleanup test files
   */
  async cleanupTestFiles() {
    const testDir = path.join(__dirname, '../../test-data');

    try {
      const files = await fs.readdir(testDir);
      for (const file of files) {
        if (file.startsWith('test-file-')) {
          await fs.unlink(path.join(testDir, file));
        }
      }
      console.log('🧹 Test files cleaned up');
    } catch (error) {
      console.warn('Warning: Could not clean up test files:', error.message);
    }
  }

  /**
   * Get validation status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      duration: this.startTime ? Date.now() - this.startTime : 0,
      targetThroughput: this.options.targetThroughput,
      currentMetrics: this.monitor ? this.monitor.currentMetrics : null,
      testResults: this.testResults,
      validationResults: this.validationResults
    };
  }

  /**
   * Generate detailed performance report
   */
  generateReport() {
    if (!this.validationResults) {
      return null;
    }

    return {
      title: 'File Processing Performance Validation Report',
      timestamp: new Date(this.validationResults.timestamp).toISOString(),
      testDuration: (this.validationResults.duration / 1000).toFixed(2) + ' seconds',
      targets: {
        throughput: `${this.targets.throughput} MB/s`,
        fileRate: `${this.targets.fileProcessingRate} files/s`,
        errorRate: `≤${this.targets.errorRate}%`
      },
      results: {
        throughput: `${this.validationResults.actual.throughput.toFixed(2)} MB/s`,
        fileRate: `${this.validationResults.actual.fileRate.toFixed(2)} files/s`,
        errorRate: `${this.validationResults.actual.errorRate.toFixed(2)}%`,
        efficiency: `${this.validationResults.actual.efficiency.toFixed(2)}%`
      },
      performance: {
        score: `${this.validationResults.performanceScore.toFixed(0)}%`,
        status: this.validationResults.passed ? 'PASSED' : 'FAILED'
      },
      details: this.validationResults.summary,
      configuration: {
        testFiles: this.options.fileCount,
        testDuration: `${this.options.testDuration / 1000}s`,
        enableSIMD: this.options.enableSIMD,
        enableRedis: this.options.enableRedis,
        minFileSize: `${(this.options.minFileSize / 1024 / 1024).toFixed(2)} MB`,
        maxFileSize: `${(this.options.maxFileSize / 1024 / 1024).toFixed(2)} MB`
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🔄 Shutting down performance validator...');

    if (this.isRunning) {
      this.isRunning = false;
    }

    // Stop monitoring
    if (this.monitor) {
      await this.monitor.stopMonitoring();
    }

    // Shutdown components
    if (this.fileProcessor) {
      await this.fileProcessor.shutdown();
    }

    if (this.simdOptimizer) {
      await this.simdOptimizer.shutdown();
    }

    if (this.redisCoordinator) {
      await this.redisCoordinator.shutdown();
    }

    // Cleanup
    await this.cleanupTestFiles();

    console.log('✅ Performance validator shut down');
  }
}

export default PerformanceValidator;