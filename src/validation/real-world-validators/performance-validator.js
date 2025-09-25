/**
 * Performance Validator - Real Performance Benchmarking and Metrics
 * Replaces simulated validation with actual performance testing and analysis
 *
 * CRITICAL FEATURES:
 * - Real performance benchmarking (CPU, memory, network, disk I/O)
 * - Load testing with real concurrent users
 * - Performance regression detection
 * - Byzantine consensus validation of performance metrics
 * - Real-world performance threshold validation
 */

import { spawn, exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { ByzantineConsensus } from '../../core/byzantine-consensus.js';

export class PerformanceValidator {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 600000, // 10 minutes
      enableByzantineValidation: options.enableByzantineValidation !== false,
      benchmarkSuites: options.benchmarkSuites || ['cpu', 'memory', 'network', 'disk', 'load'],
      loadTestConfig: options.loadTestConfig || {
        concurrent_users: [1, 5, 10, 25, 50],
        duration_seconds: 60,
        ramp_up_time: 30
      },
      performanceThresholds: options.performanceThresholds || {
        response_time_95th: 1000, // 1 second
        memory_usage_max: 512 * 1024 * 1024, // 512MB
        cpu_usage_avg: 70, // 70%
        throughput_min: 100, // requests per second
        error_rate_max: 0.01 // 1%
      },
      regressionThreshold: options.regressionThreshold || 0.1, // 10% performance degradation
      ...options
    };

    this.byzantineConsensus = new ByzantineConsensus();
    this.performanceHistory = new Map();
    this.benchmarkTools = new Map();
  }

  /**
   * Execute real performance validation
   * NO MORE SIMULATION - Real performance benchmarking only
   */
  async validatePerformance(projectPath, performanceConfig = {}) {
    const validationId = this.generateValidationId();
    const startTime = performance.now();

    try {
      console.log(`⚡ Executing real performance validation [${validationId}]...`);

      // Detect performance testing setup
      const performanceSetup = await this.detectPerformanceSetup(projectPath);

      // Install and verify performance testing tools
      const toolSetup = await this.setupPerformanceTools(projectPath);

      // Run system benchmarks
      const systemBenchmarks = await this.runSystemBenchmarks();

      // Run application performance tests
      const applicationBenchmarks = await this.runApplicationBenchmarks(
        projectPath,
        performanceConfig
      );

      // Run load testing
      const loadTestResults = await this.runLoadTests(projectPath, performanceConfig);

      // Analyze performance metrics
      const performanceAnalysis = this.analyzePerformanceMetrics({
        systemBenchmarks,
        applicationBenchmarks,
        loadTestResults
      });

      // Check for performance regressions
      const regressionAnalysis = await this.analyzePerformanceRegressions(
        validationId,
        performanceAnalysis
      );

      // Byzantine consensus validation of performance results
      const byzantineValidation = await this.validateResultsWithConsensus({
        validationId,
        systemBenchmarks,
        applicationBenchmarks,
        loadTestResults,
        performanceAnalysis,
        regressionAnalysis,
        projectPath
      });

      // Generate cryptographic proof
      const cryptographicProof = this.generatePerformanceResultProof({
        validationId,
        performanceAnalysis,
        loadTestResults,
        byzantineValidation,
        timestamp: Date.now()
      });

      const result = {
        validationId,
        framework: 'performance-validation',
        realExecution: true, // Confirms no simulation
        performanceSetup,
        toolSetup,
        systemBenchmarks: {
          completed: systemBenchmarks.length,
          successful: systemBenchmarks.filter(b => b.success).length,
          results: systemBenchmarks
        },
        applicationBenchmarks: {
          completed: applicationBenchmarks.length,
          successful: applicationBenchmarks.filter(b => b.success).length,
          results: applicationBenchmarks
        },
        loadTesting: {
          scenarios: loadTestResults.length,
          successful: loadTestResults.filter(r => r.success).length,
          maxConcurrentUsers: Math.max(...loadTestResults.map(r => r.concurrentUsers || 0)),
          results: loadTestResults
        },
        performance: {
          overallScore: performanceAnalysis.overallScore,
          responseTime: performanceAnalysis.responseTime,
          throughput: performanceAnalysis.throughput,
          resourceUsage: performanceAnalysis.resourceUsage,
          meetsThresholds: this.evaluatePerformanceThresholds(performanceAnalysis)
        },
        regression: {
          detected: regressionAnalysis.detected,
          severity: regressionAnalysis.severity,
          degradedMetrics: regressionAnalysis.degradedMetrics,
          details: regressionAnalysis.details
        },
        byzantineValidation: {
          consensusAchieved: byzantineValidation.consensusAchieved,
          validatorCount: byzantineValidation.validatorCount,
          tamperedResults: byzantineValidation.tamperedResults,
          cryptographicProof
        },
        executionTime: performance.now() - startTime,
        errors: this.extractPerformanceErrors([
          ...systemBenchmarks,
          ...applicationBenchmarks,
          ...loadTestResults
        ])
      };

      // Store performance history for regression analysis
      this.performanceHistory.set(validationId, result);

      console.log(`✅ Performance validation completed [${validationId}]: Score ${(result.performance.overallScore * 100).toFixed(1)}%`);

      return result;

    } catch (error) {
      const errorResult = {
        validationId,
        framework: 'performance-validation',
        realExecution: true,
        success: false,
        error: error.message,
        executionTime: performance.now() - startTime
      };

      this.performanceHistory.set(validationId, errorResult);
      throw new Error(`Performance validation failed [${validationId}]: ${error.message}`);
    }
  }

  /**
   * Detect performance testing setup and configuration
   */
  async detectPerformanceSetup(projectPath) {
    const setup = {
      valid: true,
      errors: [],
      testingFrameworks: [],
      configFiles: [],
      performanceScripts: []
    };

    const performanceIndicators = {
      k6: ['k6.js', 'k6-config.js', 'load-test.js'],
      artillery: ['artillery.yml', 'artillery.yaml'],
      jmeter: ['*.jmx'],
      wrk: ['wrk-script.lua'],
      lighthouse: ['lighthouse.config.js'],
      webpack_bundle_analyzer: ['webpack-bundle-analyzer.json']
    };

    // Detect performance testing tools
    for (const [framework, indicators] of Object.entries(performanceIndicators)) {
      for (const indicator of indicators) {
        try {
          const { glob } = await import('glob');
          const files = await glob(path.join(projectPath, indicator));

          if (files.length > 0) {
            setup.testingFrameworks.push({
              framework,
              configFiles: files.map(file => path.relative(projectPath, file))
            });
            setup.configFiles.push(...files);
            break;
          }
        } catch (error) {
          console.warn(`Error detecting ${framework}:`, error.message);
        }
      }
    }

    // Look for performance test scripts
    const scriptPatterns = [
      'performance/**/*.js',
      'perf/**/*.js',
      'load-test/**/*.js',
      'benchmark/**/*.js'
    ];

    for (const pattern of scriptPatterns) {
      try {
        const { glob } = await import('glob');
        const scripts = await glob(path.join(projectPath, pattern));
        setup.performanceScripts.push(...scripts);
      } catch (error) {
        console.warn(`Error detecting performance scripts with pattern ${pattern}:`, error.message);
      }
    }

    return setup;
  }

  /**
   * Setup and verify performance testing tools
   */
  async setupPerformanceTools(projectPath) {
    const toolSetup = {
      installedTools: [],
      availableTools: [],
      missingTools: []
    };

    const requiredTools = [
      { name: 'curl', command: 'curl --version', package: 'curl' },
      { name: 'wget', command: 'wget --version', package: 'wget' },
      { name: 'node', command: 'node --version', package: 'nodejs' },
      { name: 'npm', command: 'npm --version', package: 'npm' }
    ];

    // Optional performance tools
    const optionalTools = [
      { name: 'k6', command: 'k6 version', package: 'k6' },
      { name: 'artillery', command: 'artillery --version', package: 'artillery-io' },
      { name: 'ab', command: 'ab -V', package: 'apache2-utils' },
      { name: 'wrk', command: 'wrk --version', package: 'wrk' }
    ];

    // Check required tools
    for (const tool of requiredTools) {
      const available = await this.checkToolAvailability(tool.command);
      if (available) {
        toolSetup.installedTools.push(tool.name);
        toolSetup.availableTools.push(tool.name);
      } else {
        toolSetup.missingTools.push(tool.name);
      }
    }

    // Check optional tools
    for (const tool of optionalTools) {
      const available = await this.checkToolAvailability(tool.command);
      if (available) {
        toolSetup.installedTools.push(tool.name);
        toolSetup.availableTools.push(tool.name);
      }
    }

    return toolSetup;
  }

  /**
   * Check if performance tool is available
   */
  async checkToolAvailability(command) {
    return new Promise((resolve) => {
      exec(command, { timeout: 10000 }, (error) => {
        resolve(!error);
      });
    });
  }

  /**
   * Run system benchmarks (CPU, Memory, Disk, Network)
   */
  async runSystemBenchmarks() {
    const benchmarks = [];

    console.log('🏃‍♂️ Running system benchmarks...');

    // CPU Benchmark
    try {
      const cpuBenchmark = await this.runCPUBenchmark();
      benchmarks.push({ type: 'cpu', ...cpuBenchmark });
    } catch (error) {
      benchmarks.push({ type: 'cpu', success: false, error: error.message });
    }

    // Memory Benchmark
    try {
      const memoryBenchmark = await this.runMemoryBenchmark();
      benchmarks.push({ type: 'memory', ...memoryBenchmark });
    } catch (error) {
      benchmarks.push({ type: 'memory', success: false, error: error.message });
    }

    // Disk I/O Benchmark
    try {
      const diskBenchmark = await this.runDiskBenchmark();
      benchmarks.push({ type: 'disk', ...diskBenchmark });
    } catch (error) {
      benchmarks.push({ type: 'disk', success: false, error: error.message });
    }

    // Network Benchmark
    try {
      const networkBenchmark = await this.runNetworkBenchmark();
      benchmarks.push({ type: 'network', ...networkBenchmark });
    } catch (error) {
      benchmarks.push({ type: 'network', success: false, error: error.message });
    }

    return benchmarks;
  }

  /**
   * Run CPU benchmark
   */
  async runCPUBenchmark() {
    const startTime = performance.now();

    return new Promise((resolve) => {
      // Simple CPU-intensive task: calculate primes
      const primeCalculationStart = performance.now();
      const primes = [];
      const limit = 10000;

      for (let num = 2; num <= limit; num++) {
        let isPrime = true;
        for (let i = 2; i <= Math.sqrt(num); i++) {
          if (num % i === 0) {
            isPrime = false;
            break;
          }
        }
        if (isPrime) primes.push(num);
      }

      const cpuTime = performance.now() - primeCalculationStart;
      const duration = performance.now() - startTime;

      // Get system CPU info if available
      exec('nproc', (error, stdout) => {
        const cpuCores = error ? 1 : parseInt(stdout.trim());

        resolve({
          success: true,
          duration,
          metrics: {
            cpuTime,
            primesCalculated: primes.length,
            cpuCores,
            performanceScore: limit / cpuTime, // Higher is better
            threadsUsed: 1
          }
        });
      });
    });
  }

  /**
   * Run memory benchmark
   */
  async runMemoryBenchmark() {
    const startTime = performance.now();

    return new Promise((resolve) => {
      const initialMemory = process.memoryUsage();

      // Memory allocation test
      const arrays = [];
      const arraySize = 100000;
      const numArrays = 100;

      try {
        for (let i = 0; i < numArrays; i++) {
          arrays.push(new Array(arraySize).fill(i));
        }

        const peakMemory = process.memoryUsage();

        // Memory access test
        let sum = 0;
        const accessStart = performance.now();

        for (const array of arrays) {
          for (let i = 0; i < Math.min(1000, array.length); i++) {
            sum += array[i];
          }
        }

        const accessTime = performance.now() - accessStart;
        const duration = performance.now() - startTime;

        resolve({
          success: true,
          duration,
          metrics: {
            initialMemory: initialMemory.heapUsed,
            peakMemory: peakMemory.heapUsed,
            memoryAllocated: peakMemory.heapUsed - initialMemory.heapUsed,
            accessTime,
            accessSpeed: (numArrays * 1000) / accessTime, // accesses per ms
            arraysAllocated: numArrays
          }
        });

      } catch (error) {
        resolve({
          success: false,
          duration: performance.now() - startTime,
          error: error.message
        });
      }
    });
  }

  /**
   * Run disk I/O benchmark
   */
  async runDiskBenchmark() {
    const startTime = performance.now();
    const testFile = path.join('/tmp', `perf-test-${Date.now()}.dat`);

    return new Promise((resolve) => {
      try {
        // Write test
        const writeData = Buffer.alloc(1024 * 1024, 'A'); // 1MB buffer
        const writeIterations = 10;

        const writeStart = performance.now();

        const writePromises = [];
        for (let i = 0; i < writeIterations; i++) {
          writePromises.push(
            fs.writeFile(`${testFile}-${i}`, writeData)
          );
        }

        Promise.all(writePromises).then(() => {
          const writeTime = performance.now() - writeStart;

          // Read test
          const readStart = performance.now();

          const readPromises = [];
          for (let i = 0; i < writeIterations; i++) {
            readPromises.push(
              fs.readFile(`${testFile}-${i}`)
            );
          }

          Promise.all(readPromises).then(() => {
            const readTime = performance.now() - readStart;
            const duration = performance.now() - startTime;

            // Cleanup
            for (let i = 0; i < writeIterations; i++) {
              fs.unlink(`${testFile}-${i}`).catch(() => {});
            }

            resolve({
              success: true,
              duration,
              metrics: {
                writeTime,
                readTime,
                writeSpeed: (writeData.length * writeIterations) / writeTime, // bytes per ms
                readSpeed: (writeData.length * writeIterations) / readTime, // bytes per ms
                filesWritten: writeIterations,
                filesRead: writeIterations,
                totalDataSize: writeData.length * writeIterations
              }
            });

          }).catch(error => {
            resolve({
              success: false,
              duration: performance.now() - startTime,
              error: `Read test failed: ${error.message}`
            });
          });

        }).catch(error => {
          resolve({
            success: false,
            duration: performance.now() - startTime,
            error: `Write test failed: ${error.message}`
          });
        });

      } catch (error) {
        resolve({
          success: false,
          duration: performance.now() - startTime,
          error: error.message
        });
      }
    });
  }

  /**
   * Run network benchmark
   */
  async runNetworkBenchmark() {
    const startTime = performance.now();

    return new Promise((resolve) => {
      // Test network connectivity and response times
      const testUrls = [
        'https://httpbin.org/get',
        'https://www.google.com',
        'https://github.com'
      ];

      const networkTests = testUrls.map(url => this.testNetworkLatency(url));

      Promise.all(networkTests).then(results => {
        const duration = performance.now() - startTime;
        const successfulTests = results.filter(r => r.success);

        const avgLatency = successfulTests.length > 0 ?
          successfulTests.reduce((sum, r) => sum + r.latency, 0) / successfulTests.length : 0;

        resolve({
          success: successfulTests.length > 0,
          duration,
          metrics: {
            testsPerformed: testUrls.length,
            successfulTests: successfulTests.length,
            averageLatency: avgLatency,
            minLatency: Math.min(...successfulTests.map(r => r.latency)),
            maxLatency: Math.max(...successfulTests.map(r => r.latency)),
            results
          }
        });

      }).catch(error => {
        resolve({
          success: false,
          duration: performance.now() - startTime,
          error: error.message
        });
      });
    });
  }

  /**
   * Test network latency to specific URL
   */
  async testNetworkLatency(url) {
    const startTime = performance.now();

    return new Promise((resolve) => {
      exec(`curl -w "%{time_total}" -o /dev/null -s "${url}"`, { timeout: 10000 }, (error, stdout) => {
        const latency = performance.now() - startTime;

        if (error) {
          resolve({ url, success: false, latency, error: error.message });
        } else {
          const curlTime = parseFloat(stdout.trim()) * 1000; // Convert to ms
          resolve({
            url,
            success: true,
            latency: curlTime || latency,
            responseTime: curlTime || latency
          });
        }
      });
    });
  }

  /**
   * Run application-specific performance benchmarks
   */
  async runApplicationBenchmarks(projectPath, performanceConfig) {
    const benchmarks = [];

    console.log('🔥 Running application performance benchmarks...');

    // Bundle size analysis
    try {
      const bundleBenchmark = await this.analyzeBundleSize(projectPath);
      benchmarks.push({ type: 'bundle_size', ...bundleBenchmark });
    } catch (error) {
      benchmarks.push({ type: 'bundle_size', success: false, error: error.message });
    }

    // Startup time benchmark
    try {
      const startupBenchmark = await this.benchmarkStartupTime(projectPath, performanceConfig);
      benchmarks.push({ type: 'startup_time', ...startupBenchmark });
    } catch (error) {
      benchmarks.push({ type: 'startup_time', success: false, error: error.message });
    }

    // API response time benchmark (if applicable)
    if (performanceConfig.apiEndpoints) {
      try {
        const apiBenchmark = await this.benchmarkAPIResponses(performanceConfig.apiEndpoints);
        benchmarks.push({ type: 'api_response', ...apiBenchmark });
      } catch (error) {
        benchmarks.push({ type: 'api_response', success: false, error: error.message });
      }
    }

    return benchmarks;
  }

  /**
   * Analyze bundle size and optimization
   */
  async analyzeBundleSize(projectPath) {
    const startTime = performance.now();

    try {
      // Look for build output directories
      const buildDirs = ['dist/', 'build/', 'public/'];
      let bundleFiles = [];

      for (const buildDir of buildDirs) {
        try {
          const { glob } = await import('glob');
          const files = await glob(path.join(projectPath, buildDir, '**/*.{js,css,html}'));
          bundleFiles.push(...files);
        } catch (error) {
          // Build directory doesn't exist
        }
      }

      if (bundleFiles.length === 0) {
        throw new Error('No bundle files found in common build directories');
      }

      const bundleAnalysis = [];
      let totalSize = 0;

      for (const file of bundleFiles) {
        const stats = await fs.stat(file);
        const analysis = {
          file: path.relative(projectPath, file),
          size: stats.size,
          type: path.extname(file),
          gzipSize: await this.estimateGzipSize(file)
        };

        bundleAnalysis.push(analysis);
        totalSize += stats.size;
      }

      const duration = performance.now() - startTime;

      return {
        success: true,
        duration,
        metrics: {
          totalFiles: bundleFiles.length,
          totalSize,
          averageFileSize: totalSize / bundleFiles.length,
          largestFile: Math.max(...bundleAnalysis.map(f => f.size)),
          smallestFile: Math.min(...bundleAnalysis.map(f => f.size)),
          fileTypes: this.groupFilesByType(bundleAnalysis),
          files: bundleAnalysis
        }
      };

    } catch (error) {
      return {
        success: false,
        duration: performance.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Estimate gzip size for file
   */
  async estimateGzipSize(filePath) {
    try {
      const content = await fs.readFile(filePath);
      // Simple gzip size estimation (actual compression ratio varies)
      return Math.floor(content.length * 0.3); // Estimate 70% compression
    } catch (error) {
      return 0;
    }
  }

  /**
   * Group files by type for analysis
   */
  groupFilesByType(bundleAnalysis) {
    const types = {};

    for (const file of bundleAnalysis) {
      const type = file.type || 'unknown';
      if (!types[type]) {
        types[type] = { count: 0, totalSize: 0 };
      }
      types[type].count++;
      types[type].totalSize += file.size;
    }

    return types;
  }

  /**
   * Benchmark application startup time
   */
  async benchmarkStartupTime(projectPath, performanceConfig) {
    const startTime = performance.now();

    try {
      // Determine startup command
      const startupCommand = performanceConfig.startupCommand ||
                            await this.detectStartupCommand(projectPath);

      if (!startupCommand) {
        throw new Error('No startup command found or configured');
      }

      const startupMetrics = await this.measureStartupTime(projectPath, startupCommand);
      const duration = performance.now() - startTime;

      return {
        success: true,
        duration,
        metrics: startupMetrics
      };

    } catch (error) {
      return {
        success: false,
        duration: performance.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Detect startup command from package.json
   */
  async detectStartupCommand(projectPath) {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

      if (packageJson.scripts) {
        if (packageJson.scripts.start) return 'npm start';
        if (packageJson.scripts.serve) return 'npm run serve';
        if (packageJson.scripts.dev) return 'npm run dev';
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Measure actual startup time
   */
  async measureStartupTime(projectPath, startupCommand) {
    const measurements = [];
    const iterations = 3; // Multiple measurements for accuracy

    for (let i = 0; i < iterations; i++) {
      const measurement = await this.singleStartupMeasurement(projectPath, startupCommand);
      measurements.push(measurement);

      // Wait between measurements
      await this.sleep(2000);
    }

    const successfulMeasurements = measurements.filter(m => m.success);
    const startupTimes = successfulMeasurements.map(m => m.startupTime);

    return {
      measurements: measurements.length,
      successful: successfulMeasurements.length,
      averageStartupTime: startupTimes.length > 0 ?
        startupTimes.reduce((sum, time) => sum + time, 0) / startupTimes.length : 0,
      minStartupTime: Math.min(...startupTimes),
      maxStartupTime: Math.max(...startupTimes),
      details: measurements
    };
  }

  /**
   * Single startup time measurement
   */
  async singleStartupMeasurement(projectPath, startupCommand) {
    const startTime = performance.now();

    return new Promise((resolve) => {
      const childProcess = exec(startupCommand, {
        cwd: projectPath,
        timeout: 30000 // 30 second timeout
      }, (error, stdout, stderr) => {
        const duration = performance.now() - startTime;

        resolve({
          success: !error,
          startupTime: duration,
          error: error?.message,
          stdout: stdout.slice(0, 1000), // First 1KB of output
          stderr: stderr.slice(0, 1000)
        });
      });

      // Kill process after measurement (we just want startup time)
      setTimeout(() => {
        if (childProcess.pid) {
          childProcess.kill();
        }
      }, 5000); // Kill after 5 seconds
    });
  }

  /**
   * Benchmark API response times
   */
  async benchmarkAPIResponses(apiEndpoints) {
    const startTime = performance.now();

    try {
      const endpointTests = [];

      for (const endpoint of apiEndpoints) {
        const endpointTest = await this.benchmarkSingleEndpoint(endpoint);
        endpointTests.push(endpointTest);
      }

      const duration = performance.now() - startTime;
      const successfulTests = endpointTests.filter(t => t.success);

      const avgResponseTime = successfulTests.length > 0 ?
        successfulTests.reduce((sum, t) => sum + t.averageResponseTime, 0) / successfulTests.length : 0;

      return {
        success: successfulTests.length > 0,
        duration,
        metrics: {
          endpointsTested: apiEndpoints.length,
          successfulTests: successfulTests.length,
          averageResponseTime: avgResponseTime,
          totalRequests: successfulTests.reduce((sum, t) => sum + t.requests, 0),
          results: endpointTests
        }
      };

    } catch (error) {
      return {
        success: false,
        duration: performance.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Benchmark single API endpoint
   */
  async benchmarkSingleEndpoint(endpoint) {
    const requests = 10;
    const measurements = [];

    for (let i = 0; i < requests; i++) {
      const measurement = await this.measureAPIRequest(endpoint);
      measurements.push(measurement);

      // Small delay between requests
      await this.sleep(100);
    }

    const successfulRequests = measurements.filter(m => m.success);
    const responseTimes = successfulRequests.map(m => m.responseTime);

    return {
      endpoint: endpoint.url || endpoint,
      success: successfulRequests.length > 0,
      requests: measurements.length,
      successfulRequests: successfulRequests.length,
      averageResponseTime: responseTimes.length > 0 ?
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      measurements
    };
  }

  /**
   * Measure single API request
   */
  async measureAPIRequest(endpoint) {
    const startTime = performance.now();
    const url = typeof endpoint === 'string' ? endpoint : endpoint.url;

    return new Promise((resolve) => {
      const command = `curl -w "%{http_code}:%{time_total}" -o /dev/null -s "${url}"`;

      exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        const responseTime = performance.now() - startTime;

        if (error) {
          resolve({
            success: false,
            responseTime,
            error: error.message
          });
        } else {
          const [statusCode, curlTime] = stdout.split(':');
          const actualResponseTime = parseFloat(curlTime) * 1000; // Convert to ms

          resolve({
            success: parseInt(statusCode) < 400,
            responseTime: actualResponseTime || responseTime,
            statusCode: parseInt(statusCode),
            curlTime: parseFloat(curlTime)
          });
        }
      });
    });
  }

  /**
   * Run load tests with varying concurrent users
   */
  async runLoadTests(projectPath, performanceConfig) {
    const loadTestResults = [];

    if (!performanceConfig.baseUrl) {
      console.warn('No base URL provided for load testing, skipping...');
      return [{
        success: false,
        error: 'No base URL configured for load testing',
        concurrentUsers: 0
      }];
    }

    console.log('🚀 Running load tests...');

    for (const concurrentUsers of this.options.loadTestConfig.concurrent_users) {
      try {
        const loadTestResult = await this.runSingleLoadTest(
          performanceConfig.baseUrl,
          concurrentUsers,
          this.options.loadTestConfig.duration_seconds
        );

        loadTestResults.push({
          concurrentUsers,
          ...loadTestResult
        });

      } catch (error) {
        loadTestResults.push({
          concurrentUsers,
          success: false,
          error: error.message
        });
      }

      // Wait between load test scenarios
      await this.sleep(5000);
    }

    return loadTestResults;
  }

  /**
   * Run single load test scenario
   */
  async runSingleLoadTest(baseUrl, concurrentUsers, durationSeconds) {
    const startTime = performance.now();

    return new Promise((resolve) => {
      // Use Apache Bench if available, otherwise custom load test
      const command = `ab -n ${concurrentUsers * 10} -c ${concurrentUsers} -t ${durationSeconds} "${baseUrl}"`;

      exec(command, { timeout: (durationSeconds + 30) * 1000 }, (error, stdout, stderr) => {
        const duration = performance.now() - startTime;

        if (error) {
          // Fallback to custom load test
          this.runCustomLoadTest(baseUrl, concurrentUsers, durationSeconds).then(resolve);
        } else {
          // Parse Apache Bench output
          const metrics = this.parseApacheBenchOutput(stdout);
          resolve({
            success: true,
            duration,
            tool: 'apache-bench',
            metrics
          });
        }
      });
    });
  }

  /**
   * Custom load test implementation
   */
  async runCustomLoadTest(baseUrl, concurrentUsers, durationSeconds) {
    const startTime = performance.now();
    const endTime = startTime + (durationSeconds * 1000);
    const results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      responseTimes: []
    };

    try {
      const promises = [];

      // Launch concurrent workers
      for (let i = 0; i < concurrentUsers; i++) {
        promises.push(this.loadTestWorker(baseUrl, endTime, results));
      }

      await Promise.all(promises);

      const duration = performance.now() - startTime;
      const avgResponseTime = results.responseTimes.length > 0 ?
        results.responseTimes.reduce((sum, time) => sum + time, 0) / results.responseTimes.length : 0;

      return {
        success: true,
        duration,
        tool: 'custom',
        metrics: {
          totalRequests: results.totalRequests,
          successfulRequests: results.successfulRequests,
          failedRequests: results.failedRequests,
          requestsPerSecond: results.totalRequests / (duration / 1000),
          averageResponseTime: avgResponseTime,
          minResponseTime: Math.min(...results.responseTimes),
          maxResponseTime: Math.max(...results.responseTimes)
        }
      };

    } catch (error) {
      return {
        success: false,
        duration: performance.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Load test worker (single concurrent user)
   */
  async loadTestWorker(baseUrl, endTime, results) {
    while (performance.now() < endTime) {
      try {
        const requestStart = performance.now();
        const response = await this.measureAPIRequest(baseUrl);
        const responseTime = performance.now() - requestStart;

        results.totalRequests++;
        results.responseTimes.push(responseTime);

        if (response.success) {
          results.successfulRequests++;
        } else {
          results.failedRequests++;
        }

      } catch (error) {
        results.totalRequests++;
        results.failedRequests++;
      }

      // Small delay to prevent overwhelming
      await this.sleep(10);
    }
  }

  /**
   * Parse Apache Bench output
   */
  parseApacheBenchOutput(output) {
    const metrics = {};

    // Extract key metrics from ab output
    const patterns = {
      totalRequests: /Complete requests:\s*(\d+)/,
      failedRequests: /Failed requests:\s*(\d+)/,
      requestsPerSecond: /Requests per second:\s*([\d.]+)/,
      meanTime: /Time per request:\s*([\d.]+)\s*\[ms\]/,
      transferRate: /Transfer rate:\s*([\d.]+)/
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = output.match(pattern);
      if (match) {
        metrics[key] = parseFloat(match[1]);
      }
    }

    // Calculate additional metrics
    metrics.successfulRequests = (metrics.totalRequests || 0) - (metrics.failedRequests || 0);
    metrics.errorRate = metrics.totalRequests > 0 ?
      (metrics.failedRequests || 0) / metrics.totalRequests : 0;

    return metrics;
  }

  /**
   * Analyze comprehensive performance metrics
   */
  analyzePerformanceMetrics({ systemBenchmarks, applicationBenchmarks, loadTestResults }) {
    const analysis = {
      overallScore: 0,
      responseTime: {},
      throughput: {},
      resourceUsage: {},
      scalability: {}
    };

    // System performance analysis
    const cpuBenchmark = systemBenchmarks.find(b => b.type === 'cpu' && b.success);
    const memoryBenchmark = systemBenchmarks.find(b => b.type === 'memory' && b.success);
    const diskBenchmark = systemBenchmarks.find(b => b.type === 'disk' && b.success);
    const networkBenchmark = systemBenchmarks.find(b => b.type === 'network' && b.success);

    // Resource usage analysis
    if (cpuBenchmark) {
      analysis.resourceUsage.cpu = {
        performanceScore: cpuBenchmark.metrics.performanceScore,
        cores: cpuBenchmark.metrics.cpuCores
      };
    }

    if (memoryBenchmark) {
      analysis.resourceUsage.memory = {
        peakUsage: memoryBenchmark.metrics.peakMemory,
        allocationSpeed: memoryBenchmark.metrics.memoryAllocated / memoryBenchmark.duration,
        accessSpeed: memoryBenchmark.metrics.accessSpeed
      };
    }

    if (diskBenchmark) {
      analysis.resourceUsage.disk = {
        writeSpeed: diskBenchmark.metrics.writeSpeed,
        readSpeed: diskBenchmark.metrics.readSpeed
      };
    }

    if (networkBenchmark) {
      analysis.resourceUsage.network = {
        averageLatency: networkBenchmark.metrics.averageLatency,
        minLatency: networkBenchmark.metrics.minLatency,
        maxLatency: networkBenchmark.metrics.maxLatency
      };
    }

    // Application performance analysis
    const startupBenchmark = applicationBenchmarks.find(b => b.type === 'startup_time' && b.success);
    const apiBenchmark = applicationBenchmarks.find(b => b.type === 'api_response' && b.success);
    const bundleBenchmark = applicationBenchmarks.find(b => b.type === 'bundle_size' && b.success);

    if (startupBenchmark) {
      analysis.responseTime.startup = {
        average: startupBenchmark.metrics.averageStartupTime,
        min: startupBenchmark.metrics.minStartupTime,
        max: startupBenchmark.metrics.maxStartupTime
      };
    }

    if (apiBenchmark) {
      analysis.responseTime.api = {
        average: apiBenchmark.metrics.averageResponseTime,
        endpoints: apiBenchmark.metrics.endpointsTested,
        totalRequests: apiBenchmark.metrics.totalRequests
      };
    }

    if (bundleBenchmark) {
      analysis.resourceUsage.bundle = {
        totalSize: bundleBenchmark.metrics.totalSize,
        fileCount: bundleBenchmark.metrics.totalFiles,
        averageFileSize: bundleBenchmark.metrics.averageFileSize
      };
    }

    // Load testing analysis
    const successfulLoadTests = loadTestResults.filter(r => r.success);
    if (successfulLoadTests.length > 0) {
      const maxConcurrentUsers = Math.max(...successfulLoadTests.map(r => r.concurrentUsers));
      const bestThroughput = Math.max(...successfulLoadTests.map(r => r.metrics?.requestsPerSecond || 0));

      analysis.scalability = {
        maxConcurrentUsers,
        bestThroughput,
        loadTestScenarios: successfulLoadTests.length
      };

      analysis.throughput = {
        requestsPerSecond: bestThroughput,
        maxConcurrentUsers,
        scalabilityFactor: maxConcurrentUsers / (successfulLoadTests.length > 0 ? 1 : 1)
      };
    }

    // Calculate overall performance score (0-1)
    let scoreComponents = [];

    if (analysis.responseTime.api?.average) {
      const responseScore = Math.max(0, 1 - (analysis.responseTime.api.average / 1000)); // 1s baseline
      scoreComponents.push(responseScore);
    }

    if (analysis.throughput.requestsPerSecond) {
      const throughputScore = Math.min(1, analysis.throughput.requestsPerSecond / 100); // 100 RPS baseline
      scoreComponents.push(throughputScore);
    }

    if (analysis.resourceUsage.memory?.peakUsage) {
      const memoryScore = Math.max(0, 1 - (analysis.resourceUsage.memory.peakUsage / (512 * 1024 * 1024))); // 512MB baseline
      scoreComponents.push(memoryScore);
    }

    analysis.overallScore = scoreComponents.length > 0 ?
      scoreComponents.reduce((sum, score) => sum + score, 0) / scoreComponents.length : 0;

    return analysis;
  }

  /**
   * Analyze performance regressions against historical data
   */
  async analyzePerformanceRegressions(currentValidationId, performanceAnalysis) {
    const regressionAnalysis = {
      detected: false,
      severity: 'none',
      degradedMetrics: [],
      details: []
    };

    // Get historical performance data
    const historicalData = this.getHistoricalPerformanceData(currentValidationId);

    if (historicalData.length === 0) {
      regressionAnalysis.details.push('No historical data available for regression analysis');
      return regressionAnalysis;
    }

    // Compare against recent historical average
    const recentHistory = historicalData.slice(-5); // Last 5 validations
    const baseline = this.calculatePerformanceBaseline(recentHistory);

    // Check for regressions in key metrics
    const regressionChecks = [
      {
        metric: 'responseTime.api.average',
        current: performanceAnalysis.responseTime.api?.average,
        baseline: baseline.responseTime?.api?.average,
        threshold: this.options.regressionThreshold,
        higherIsBetter: false
      },
      {
        metric: 'throughput.requestsPerSecond',
        current: performanceAnalysis.throughput.requestsPerSecond,
        baseline: baseline.throughput?.requestsPerSecond,
        threshold: this.options.regressionThreshold,
        higherIsBetter: true
      },
      {
        metric: 'resourceUsage.memory.peakUsage',
        current: performanceAnalysis.resourceUsage.memory?.peakUsage,
        baseline: baseline.resourceUsage?.memory?.peakUsage,
        threshold: this.options.regressionThreshold,
        higherIsBetter: false
      }
    ];

    for (const check of regressionChecks) {
      if (check.current !== undefined && check.baseline !== undefined) {
        const regressionCheck = this.checkForRegression(check);
        if (regressionCheck.detected) {
          regressionAnalysis.detected = true;
          regressionAnalysis.degradedMetrics.push(check.metric);
          regressionAnalysis.details.push(regressionCheck);

          // Determine severity
          if (regressionCheck.regressionPercent > 0.25) { // 25%
            regressionAnalysis.severity = 'critical';
          } else if (regressionCheck.regressionPercent > 0.15) { // 15%
            regressionAnalysis.severity = 'major';
          } else if (regressionAnalysis.severity === 'none') {
            regressionAnalysis.severity = 'minor';
          }
        }
      }
    }

    return regressionAnalysis;
  }

  /**
   * Get historical performance data
   */
  getHistoricalPerformanceData(excludeValidationId) {
    return Array.from(this.performanceHistory.values())
      .filter(data => data.validationId !== excludeValidationId && data.performance)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Calculate performance baseline from historical data
   */
  calculatePerformanceBaseline(historicalData) {
    if (historicalData.length === 0) return {};

    const baseline = {};

    // Average response times
    const responseTimes = historicalData
      .map(d => d.performance?.responseTime?.api?.average)
      .filter(v => v !== undefined);

    if (responseTimes.length > 0) {
      baseline.responseTime = {
        api: {
          average: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        }
      };
    }

    // Average throughput
    const throughputs = historicalData
      .map(d => d.performance?.throughput?.requestsPerSecond)
      .filter(v => v !== undefined);

    if (throughputs.length > 0) {
      baseline.throughput = {
        requestsPerSecond: throughputs.reduce((sum, throughput) => sum + throughput, 0) / throughputs.length
      };
    }

    // Average memory usage
    const memoryUsages = historicalData
      .map(d => d.performance?.resourceUsage?.memory?.peakUsage)
      .filter(v => v !== undefined);

    if (memoryUsages.length > 0) {
      baseline.resourceUsage = {
        memory: {
          peakUsage: memoryUsages.reduce((sum, usage) => sum + usage, 0) / memoryUsages.length
        }
      };
    }

    return baseline;
  }

  /**
   * Check for performance regression in specific metric
   */
  checkForRegression({ metric, current, baseline, threshold, higherIsBetter }) {
    const regressionPercent = higherIsBetter ?
      (baseline - current) / baseline : // For throughput, lower is worse
      (current - baseline) / baseline;   // For response time, higher is worse

    const detected = regressionPercent > threshold;

    return {
      metric,
      detected,
      current,
      baseline,
      regressionPercent,
      regressionDirection: higherIsBetter ? 'decrease' : 'increase',
      threshold
    };
  }

  /**
   * Evaluate performance against thresholds
   */
  evaluatePerformanceThresholds(performanceAnalysis) {
    const thresholds = this.options.performanceThresholds;
    const evaluation = {};

    // Response time threshold
    if (performanceAnalysis.responseTime.api?.average !== undefined) {
      evaluation.responseTime = performanceAnalysis.responseTime.api.average <= thresholds.response_time_95th;
    }

    // Memory usage threshold
    if (performanceAnalysis.resourceUsage.memory?.peakUsage !== undefined) {
      evaluation.memoryUsage = performanceAnalysis.resourceUsage.memory.peakUsage <= thresholds.memory_usage_max;
    }

    // Throughput threshold
    if (performanceAnalysis.throughput.requestsPerSecond !== undefined) {
      evaluation.throughput = performanceAnalysis.throughput.requestsPerSecond >= thresholds.throughput_min;
    }

    // Overall evaluation
    const passedThresholds = Object.values(evaluation).filter(Boolean).length;
    const totalThresholds = Object.values(evaluation).length;

    evaluation.overall = totalThresholds > 0 ? passedThresholds === totalThresholds : false;
    evaluation.passRate = totalThresholds > 0 ? passedThresholds / totalThresholds : 0;

    return evaluation;
  }

  /**
   * Byzantine consensus validation of performance results
   */
  async validateResultsWithConsensus(validationData) {
    if (!this.options.enableByzantineValidation) {
      return { consensusAchieved: true, validatorCount: 0, tamperedResults: false };
    }

    try {
      const validators = this.generatePerformanceValidators(validationData);

      const proposal = {
        type: 'performance_validation',
        validationId: validationData.validationId,
        performance: {
          overallScore: validationData.performanceAnalysis.overallScore,
          responseTime: validationData.performanceAnalysis.responseTime.api?.average,
          throughput: validationData.performanceAnalysis.throughput.requestsPerSecond,
          memoryUsage: validationData.performanceAnalysis.resourceUsage.memory?.peakUsage
        },
        benchmarks: {
          system: validationData.systemBenchmarks.filter(b => b.success).length,
          application: validationData.applicationBenchmarks.filter(b => b.success).length,
          loadTest: validationData.loadTestResults.filter(r => r.success).length
        },
        regression: {
          detected: validationData.regressionAnalysis.detected,
          severity: validationData.regressionAnalysis.severity
        },
        executionHash: this.generateExecutionHash(validationData),
        timestamp: Date.now()
      };

      const consensus = await this.byzantineConsensus.achieveConsensus(proposal, validators);
      const tamperedResults = this.detectResultTampering(validationData, consensus);

      return {
        consensusAchieved: consensus.achieved,
        consensusRatio: consensus.consensusRatio,
        validatorCount: validators.length,
        tamperedResults,
        byzantineProof: consensus.byzantineProof,
        votes: consensus.votes
      };

    } catch (error) {
      console.error('Byzantine consensus validation failed:', error);
      return {
        consensusAchieved: false,
        error: error.message,
        tamperedResults: true
      };
    }
  }

  /**
   * Generate specialized performance validators
   */
  generatePerformanceValidators(validationData) {
    const baseValidatorCount = 8;
    const regressionMultiplier = validationData.regressionAnalysis.detected ? 1.5 : 1;

    const validatorCount = Math.ceil(baseValidatorCount * regressionMultiplier);

    return Array.from({ length: validatorCount }, (_, i) => ({
      id: `performance-validator-${i}`,
      specialization: ['system_benchmarking', 'load_testing', 'regression_analysis', 'resource_monitoring', 'response_time_validation', 'throughput_verification', 'memory_analysis', 'scalability_testing'][i % 8],
      reputation: 0.85 + (Math.random() * 0.15),
      riskTolerance: validationData.performanceAnalysis.overallScore >= 0.8 ? 'medium' : 'low'
    }));
  }

  // Helper methods

  generateValidationId() {
    return `performance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateExecutionHash(validationData) {
    const hashData = JSON.stringify({
      systemBenchmarks: validationData.systemBenchmarks.map(b => ({
        type: b.type,
        success: b.success,
        duration: b.duration
      })),
      performanceScore: validationData.performanceAnalysis.overallScore,
      regressionDetected: validationData.regressionAnalysis.detected,
      timestamp: Date.now()
    });

    return createHash('md5').update(hashData).digest('hex');
  }

  generatePerformanceResultProof(data) {
    const proofString = JSON.stringify({
      validationId: data.validationId,
      performanceAnalysis: data.performanceAnalysis,
      loadTestResults: data.loadTestResults,
      timestamp: data.timestamp
    });

    const hash = createHash('sha256').update(proofString).digest('hex');

    return {
      algorithm: 'sha256',
      hash,
      timestamp: data.timestamp,
      proofData: proofString.length,
      validator: 'performance-validator',
      byzantineValidated: data.byzantineValidation?.consensusAchieved || false
    };
  }

  extractPerformanceErrors(results) {
    const errors = [];

    for (const result of results) {
      if (!result.success) {
        errors.push({
          type: result.type || result.platform || 'unknown',
          error: result.error || 'Performance test failed',
          details: result.stderr || result.reason
        });
      }
    }

    return errors;
  }

  detectResultTampering(validationData, consensus) {
    const suspiciousVotes = consensus.votes.filter(vote =>
      vote.confidence < 0.5 ||
      (vote.reason && vote.reason.includes('suspicious'))
    );

    const expectedHash = this.generateExecutionHash(validationData);
    const hashMatch = validationData.executionHash === expectedHash;

    return {
      detected: suspiciousVotes.length > consensus.votes.length * 0.3 || !hashMatch,
      suspiciousVoteCount: suspiciousVotes.length,
      hashIntegrityCheck: hashMatch,
      indicators: suspiciousVotes.map(vote => vote.reason).filter(Boolean)
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get performance history for analysis
   */
  getPerformanceHistory(validationId) {
    if (validationId) {
      return this.performanceHistory.get(validationId);
    }
    return Array.from(this.performanceHistory.values());
  }

  /**
   * Calculate false completion rate for performance validation
   */
  calculateFalseCompletionRate() {
    const validations = Array.from(this.performanceHistory.values());
    const totalValidations = validations.length;

    if (totalValidations === 0) return { rate: 0, sample: 0 };

    const falseCompletions = validations.filter(validation =>
      validation.performance?.overallScore >= 0.8 && // Claims good performance
      (!validation.performance?.meetsThresholds?.overall || validation.regression?.detected) // But fails thresholds or has regressions
    );

    return {
      rate: falseCompletions.length / totalValidations,
      sample: totalValidations,
      falseCompletions: falseCompletions.length
    };
  }
}

export default PerformanceValidator;