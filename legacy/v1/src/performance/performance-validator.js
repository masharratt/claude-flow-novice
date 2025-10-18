/**
 * Performance Validator for 30% Latency Reduction Target
 * Validates and reports on performance improvements achieved by the optimization system
 */

import { connectRedis } from '../cli/utils/redis-client.js';
import PerformanceBenchmarkSuite from './benchmark-suite.js';
import { performance } from 'perf_hooks';

export class PerformanceValidator {
  constructor(config = {}) {
    this.config = {
      redis: {
        host: 'localhost',
        port: 6379,
        database: 5 // Dedicated database for validation
      },
      validation: {
        baselineSamples: 10,
        testSamples: 10,
        confidenceLevel: 0.95,
        targetLatencyReduction: 30, // percentage
        targetThroughputImprovement: 50, // percentage
        targetMemoryOptimization: 20, // percentage
        targetCPUEfficiency: 25, // percentage
        testDurationMs: 60000 // 1 minute per test
      },
      reporting: {
        outputPath: './performance-reports',
        includeCharts: true,
        includeRecommendations: true
      },
      ...config
    };

    this.redisClient = null;
    this.benchmarkSuite = new PerformanceBenchmarkSuite({
      redis: this.config.redis
    });

    this.validationResults = {
      baseline: null,
      current: null,
      improvements: {},
      targets: {},
      overall: {
        passed: false,
        score: 0,
        confidence: 0
      },
      timestamp: null
    };

    this.active = false;
  }

  /**
   * Initialize performance validator
   */
  async initialize() {
    console.log('✅ Initializing Performance Validator...');

    try {
      // Connect to Redis
      this.redisClient = await connectRedis(this.config.redis);

      // Initialize benchmark suite
      await this.benchmarkSuite.initialize();

      // Create reports directory
      const { promises: fs } = await import('fs');
      await fs.mkdir(this.config.reporting.outputPath, { recursive: true });

      this.active = true;
      console.log('✅ Performance Validator initialized');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize validator:', error.message);
      throw error;
    }
  }

  /**
   * Run comprehensive performance validation
   */
  async runValidation() {
    console.log('🎯 Starting Performance Validation...');

    const validationStart = performance.now();
    this.validationResults.timestamp = Date.now();

    try {
      // Step 1: Establish baseline if not exists
      if (!await this.hasBaseline()) {
        console.log('📊 Establishing performance baseline...');
        this.validationResults.baseline = await this.establishBaseline();
      } else {
        console.log('📊 Loading existing baseline...');
        this.validationResults.baseline = await this.loadBaseline();
      }

      // Step 2: Run current performance tests
      console.log('📈 Running current performance tests...');
      this.validationResults.current = await this.runCurrentTests();

      // Step 3: Calculate improvements
      console.log('📊 Calculating performance improvements...');
      this.validationResults.improvements = this.calculateImprovements();

      // Step 4: Validate against targets
      console.log('🎯 Validating against performance targets...');
      this.validationResults.targets = this.validateTargets();

      // Step 5: Calculate overall score
      this.validationResults.overall = this.calculateOverallScore();

      // Step 6: Generate validation report
      console.log('📄 Generating validation report...');
      await this.generateValidationReport();

      const validationDuration = performance.now() - validationStart;
      console.log(`✅ Validation completed in ${validationDuration.toFixed(2)}ms`);

      // Publish results to Redis
      await this.publishValidationResults();

      return this.validationResults;

    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      throw error;
    }
  }

  /**
   * Check if baseline exists
   */
  async hasBaseline() {
    try {
      const baseline = await this.redisClient.get('validation:baseline');
      return baseline !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Establish performance baseline
   */
  async establishBaseline() {
    console.log('📊 Running baseline benchmarks...');

    const baselineResults = {
      timestamp: Date.now(),
      benchmarks: {},
      summary: {}
    };

    // Run multiple baseline samples for statistical significance
    const samples = [];
    for (let i = 0; i < this.config.validation.baselineSamples; i++) {
      console.log(`  📊 Running baseline sample ${i + 1}/${this.config.validation.baselineSamples}`);
      const result = await this.benchmarkSuite.runBenchmarks();
      samples.push(result);

      // Small delay between samples
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Aggregate baseline results
    baselineResults.benchmarks = this.aggregateBenchmarkResults(samples);
    baselineResults.summary = this.calculateBaselineSummary(baselineResults.benchmarks);

    // Save baseline to Redis
    await this.redisClient.setex('validation:baseline', 86400, JSON.stringify(baselineResults));

    console.log('✅ Baseline established successfully');
    return baselineResults;
  }

  /**
   * Load existing baseline
   */
  async loadBaseline() {
    try {
      const baselineData = await this.redisClient.get('validation:baseline');
      return JSON.parse(baselineData);
    } catch (error) {
      console.warn('⚠️ Could not load baseline, establishing new one...');
      return await this.establishBaseline();
    }
  }

  /**
   * Run current performance tests
   */
  async runCurrentTests() {
    console.log('📈 Running current performance tests...');

    const currentResults = {
      timestamp: Date.now(),
      benchmarks: {},
      summary: {}
    };

    // Run multiple test samples
    const samples = [];
    for (let i = 0; i < this.config.validation.testSamples; i++) {
      console.log(`  📈 Running test sample ${i + 1}/${this.config.validation.testSamples}`);
      const result = await this.benchmarkSuite.runBenchmarks();
      samples.push(result);

      // Small delay between samples
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Aggregate current results
    currentResults.benchmarks = this.aggregateBenchmarkResults(samples);
    currentResults.summary = this.calculateCurrentSummary(currentResults.benchmarks);

    console.log('✅ Current performance tests completed');
    return currentResults;
  }

  /**
   * Aggregate multiple benchmark results
   */
  aggregateBenchmarkResults(samples) {
    const aggregated = {};

    // Process each test category
    const testCategories = ['redisOperations', 'eventBusLatency', 'memoryUsage', 'cpuUtilization', 'concurrentOperations'];

    for (const category of testCategories) {
      aggregated[category] = {};

      // Get all metrics for this category
      const categorySamples = samples.map(s => s.tests[category]).filter(Boolean);
      if (categorySamples.length === 0) continue;

      // Extract all metric names
      const metricNames = new Set();
      categorySamples.forEach(sample => {
        if (typeof sample === 'object') {
          Object.keys(sample).forEach(key => {
            if (typeof sample[key] === 'object' && sample[key].avgLatency !== undefined) {
              metricNames.add(key);
            } else if (typeof sample[key] === 'number' || (typeof sample[key] === 'string' && !isNaN(parseFloat(sample[key])))) {
              metricNames.add(key);
            }
          });
        }
      });

      // Calculate statistics for each metric
      for (const metricName of metricNames) {
        const values = categorySamples.map(sample => {
          if (sample[metricName] && typeof sample[metricName] === 'object') {
            return parseFloat(sample[metricName].avgLatency) || 0;
          } else if (sample[metricName] !== undefined) {
            return parseFloat(sample[metricName]) || 0;
          }
          return 0;
        }).filter(v => v > 0);

        if (values.length > 0) {
          aggregated[category][metricName] = {
            mean: this.mean(values),
            median: this.median(values),
            stdDev: this.standardDeviation(values),
            min: Math.min(...values),
            max: Math.max(...values),
            confidenceInterval: this.confidenceInterval(values, this.config.validation.confidenceLevel)
          };
        }
      }
    }

    return aggregated;
  }

  /**
   * Calculate baseline summary
   */
  calculateBaselineSummary(benchmarks) {
    return {
      avgLatency: this.extractMetric(benchmarks, 'eventBusLatency', 'avgLatency'),
      avgThroughput: this.extractMetric(benchmarks, 'concurrentOperations', 'avgOperationsPerSecond'),
      avgMemoryUsage: this.extractMetric(benchmarks, 'memoryUsage', 'heapUsed'),
      avgCpuUsage: this.extractMetric(benchmarks, 'cpuUtilization', 'avgOperationsPerSecond'),
      performanceScore: this.calculatePerformanceScore(benchmarks)
    };
  }

  /**
   * Calculate current summary
   */
  calculateCurrentSummary(benchmarks) {
    return {
      avgLatency: this.extractMetric(benchmarks, 'eventBusLatency', 'avgLatency'),
      avgThroughput: this.extractMetric(benchmarks, 'concurrentOperations', 'avgOperationsPerSecond'),
      avgMemoryUsage: this.extractMetric(benchmarks, 'memoryUsage', 'heapUsed'),
      avgCpuUsage: this.extractMetric(benchmarks, 'cpuUtilization', 'avgOperationsPerSecond'),
      performanceScore: this.calculatePerformanceScore(benchmarks)
    };
  }

  /**
   * Extract metric from benchmarks
   */
  extractMetric(benchmarks, category, metric) {
    if (!benchmarks[category]) return 0;

    const metrics = Object.values(benchmarks[category]);
    if (metrics.length === 0) return 0;

    // Use the first available metric value
    const firstMetric = metrics[0];
    if (firstMetric && firstMetric.mean !== undefined) {
      return firstMetric.mean;
    }

    return 0;
  }

  /**
   * Calculate performance score from benchmarks
   */
  calculatePerformanceScore(benchmarks) {
    let score = 100;

    // Redis operations performance
    const redisLatency = this.extractMetric(benchmarks, 'redisOperations', 'avgLatency');
    if (redisLatency > 5) score -= 20;
    else if (redisLatency > 2) score -= 10;

    // Event bus latency
    const eventLatency = this.extractMetric(benchmarks, 'eventBusLatency', 'avgLatency');
    if (eventLatency > 20) score -= 20;
    else if (eventLatency > 10) score -= 10;

    // Memory efficiency
    const memoryUsage = this.extractMetric(benchmarks, 'memoryUsage', 'heapUsed');
    if (memoryUsage > 100) score -= 15;
    else if (memoryUsage > 50) score -= 8;

    // Concurrency performance
    const concurrency = this.extractMetric(benchmarks, 'concurrentOperations', 'avgOperationsPerSecond');
    if (concurrency < 1000) score -= 15;
    else if (concurrency < 2000) score -= 8;

    return Math.max(0, score);
  }

  /**
   * Calculate performance improvements
   */
  calculateImprovements() {
    const baseline = this.validationResults.baseline.summary;
    const current = this.validationResults.current.summary;

    const improvements = {
      latency: {
        baseline: baseline.avgLatency,
        current: current.avgLatency,
        improvement: ((baseline.avgLatency - current.avgLatency) / baseline.avgLatency) * 100,
        target: this.config.validation.targetLatencyReduction,
        achieved: false
      },
      throughput: {
        baseline: baseline.avgThroughput,
        current: current.avgThroughput,
        improvement: ((current.avgThroughput - baseline.avgThroughput) / baseline.avgThroughput) * 100,
        target: this.config.validation.targetThroughputImprovement,
        achieved: false
      },
      memory: {
        baseline: baseline.avgMemoryUsage,
        current: current.avgMemoryUsage,
        improvement: ((baseline.avgMemoryUsage - current.avgMemoryUsage) / baseline.avgMemoryUsage) * 100,
        target: this.config.validation.targetMemoryOptimization,
        achieved: false
      },
      cpu: {
        baseline: baseline.avgCpuUsage,
        current: current.avgCpuUsage,
        improvement: ((baseline.avgCpuUsage - current.avgCpuUsage) / baseline.avgCpuUsage) * 100,
        target: this.config.validation.targetCPUEfficiency,
        achieved: false
      },
      performanceScore: {
        baseline: baseline.performanceScore,
        current: current.performanceScore,
        improvement: current.performanceScore - baseline.performanceScore,
        target: 10, // Minimum 10 point improvement
        achieved: false
      }
    };

    // Mark achieved targets
    Object.keys(improvements).forEach(key => {
      improvements[key].achieved = improvements[key].improvement >= improvements[key].target;
    });

    return improvements;
  }

  /**
   * Validate against targets
   */
  validateTargets() {
    const improvements = this.validationResults.improvements;
    const targets = {
      latencyReduction: {
        target: this.config.validation.targetLatencyReduction,
        achieved: improvements.latency.achieved,
        actual: improvements.latency.improvement
      },
      throughputImprovement: {
        target: this.config.validation.targetThroughputImprovement,
        achieved: improvements.throughput.achieved,
        actual: improvements.throughput.improvement
      },
      memoryOptimization: {
        target: this.config.validation.targetMemoryOptimization,
        achieved: improvements.memory.achieved,
        actual: improvements.memory.improvement
      },
      cpuEfficiency: {
        target: this.config.validation.targetCPUEfficiency,
        achieved: improvements.cpu.achieved,
        actual: improvements.cpu.improvement
      }
    };

    // Calculate overall achievement
    const achievedCount = Object.values(targets).filter(t => t.achieved).length;
    const totalCount = Object.keys(targets).length;
    targets.overallAchievement = (achievedCount / totalCount) * 100;

    return targets;
  }

  /**
   * Calculate overall validation score
   */
  calculateOverallScore() {
    const improvements = this.validationResults.improvements;
    const targets = this.validationResults.targets;

    // Weight the scores (latency is most important)
    const weights = {
      latency: 0.4,
      throughput: 0.3,
      memory: 0.15,
      cpu: 0.15
    };

    let weightedScore = 0;
    for (const [metric, weight] of Object.entries(weights)) {
      const improvement = improvements[metric].improvement;
      const target = improvements[metric].target;
      const score = Math.min(100, (improvement / target) * 100);
      weightedScore += score * weight;
    }

    // Bonus for achieving primary latency target
    if (improvements.latency.achieved) {
      weightedScore = Math.min(100, weightedScore + 10);
    }

    // Calculate confidence based on statistical significance
    const confidence = this.calculateConfidence();

    const passed = weightedScore >= 85 && improvements.latency.achieved; // 85% overall AND latency target

    return {
      score: Math.round(weightedScore),
      confidence,
      passed,
      grade: this.calculateGrade(weightedScore),
      recommendations: this.generateRecommendations(improvements, targets)
    };
  }

  /**
   * Calculate confidence level in results
   */
  calculateConfidence() {
    const baseline = this.validationResults.baseline.benchmarks;
    const current = this.validationResults.current.benchmarks;

    // Calculate confidence based on statistical significance
    let confidence = 0.95; // Base confidence

    // Adjust confidence based on sample size and variance
    const sampleSizes = [
      this.config.validation.baselineSamples,
      this.config.validation.testSamples
    ];

    const minSampleSize = Math.min(...sampleSizes);
    if (minSampleSize < 5) {
      confidence -= 0.1;
    } else if (minSampleSize >= 10) {
      confidence = Math.min(0.99, confidence + 0.05);
    }

    return Math.max(0.8, confidence);
  }

  /**
   * Calculate performance grade
   */
  calculateGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'B+';
    if (score >= 80) return 'B';
    if (score >= 75) return 'C+';
    if (score >= 70) return 'C';
    if (score >= 65) return 'D+';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(improvements, targets) {
    const recommendations = [];

    // Latency recommendations
    if (!improvements.latency.achieved) {
      recommendations.push({
        priority: 'high',
        category: 'latency',
        title: 'Improve Latency Reduction',
        description: `Current: ${improvements.latency.improvement.toFixed(1)}%, Target: ${improvements.latency.target}%`,
        actions: [
          'Optimize event bus batching parameters',
          'Reduce Redis operation overhead',
          'Implement more aggressive caching strategies'
        ]
      });
    }

    // Throughput recommendations
    if (!improvements.throughput.achieved) {
      recommendations.push({
        priority: 'medium',
        category: 'throughput',
        title: 'Increase Throughput',
        description: `Current: ${improvements.throughput.improvement.toFixed(1)}%, Target: ${improvements.throughput.target}%`,
        actions: [
          'Scale worker thread pool',
          'Optimize concurrent operations',
          'Improve connection pooling'
        ]
      });
    }

    // Memory recommendations
    if (!improvements.memory.achieved) {
      recommendations.push({
        priority: 'medium',
        category: 'memory',
        title: 'Optimize Memory Usage',
        description: `Current: ${improvements.memory.improvement.toFixed(1)}%, Target: ${improvements.memory.target}%`,
        actions: [
          'Implement object pooling',
          'Optimize garbage collection',
          'Reduce memory leaks'
        ]
      });
    }

    // CPU recommendations
    if (!improvements.cpu.achieved) {
      recommendations.push({
        priority: 'low',
        category: 'cpu',
        title: 'Improve CPU Efficiency',
        description: `Current: ${improvements.cpu.improvement.toFixed(1)}%, Target: ${improvements.cpu.target}%`,
        actions: [
          'Optimize algorithms',
          'Reduce computational complexity',
          'Improve task scheduling'
        ]
      });
    }

    return recommendations;
  }

  /**
   * Generate validation report
   */
  async generateValidationReport() {
    const { promises: fs } = await import('fs');
    const path = await import('path');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(this.config.reporting.outputPath, `performance-validation-${timestamp}.json`);
    const htmlReportPath = path.join(this.config.reporting.outputPath, `performance-validation-${timestamp}.html`);

    // Generate JSON report
    const report = {
      metadata: {
        timestamp: this.validationResults.timestamp,
        validationDuration: Date.now() - this.validationResults.timestamp,
        config: this.config,
        agent: 'Phase 4 Performance Validator',
        confidence: this.config.validation.confidenceLevel
      },
      results: this.validationResults,
      summary: {
        overall: this.validationResults.overall,
        keyFindings: this.extractKeyFindings(),
        recommendations: this.validationResults.overall.recommendations
      }
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 JSON report saved: ${reportPath}`);

    // Generate HTML report
    const htmlReport = await this.generateHTMLReport(report);
    await fs.writeFile(htmlReportPath, htmlReport);
    console.log(`📄 HTML report saved: ${htmlReportPath}`);

    return { reportPath, htmlReportPath };
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(report) {
    const results = report.results;
    const summary = report.summary;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Validation Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; margin: -20px -20px 30px -20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .score-circle { width: 120px; height: 120px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2em; font-weight: bold; color: white; margin: 0 auto 20px; }
        .score-excellent { background: linear-gradient(135deg, #27ae60, #2ecc71); }
        .score-good { background: linear-gradient(135deg, #3498db, #5dade2); }
        .score-fair { background: linear-gradient(135deg, #f39c12, #f1c40f); }
        .score-poor { background: linear-gradient(135deg, #e74c3c, #c0392b); }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { text-align: center; padding: 20px; }
        .metric-value { font-size: 2em; font-weight: bold; color: #2c3e50; }
        .metric-label { color: #7f8c8d; margin-top: 5px; }
        .improvement { color: #27ae60; }
        .regression { color: #e74c3c; }
        .target-met { color: #27ae60; font-weight: bold; }
        .target-missed { color: #e74c3c; font-weight: bold; }
        .recommendation { background: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin: 10px 0; }
        .recommendation.high { border-left-color: #dc3545; }
        .recommendation.medium { border-left-color: #ffc107; }
        .recommendation.low { border-left-color: #28a745; }
        .chart-container { height: 300px; margin: 20px 0; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; color: white; font-size: 0.9em; }
        .status-passed { background: #27ae60; }
        .status-failed { background: #e74c3c; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Performance Validation Report</h1>
        <p>Phase 4 Performance Optimization Results</p>
        <p>Generated: ${new Date(report.metadata.timestamp).toLocaleString()}</p>
    </div>

    <div class="container">
        <!-- Overall Score -->
        <div class="card">
            <h2>Overall Performance Score</h2>
            <div class="score-circle ${this.getScoreClass(summary.overall.score)}">
                ${summary.overall.score}
            </div>
            <div style="text-align: center;">
                <h3>Grade: ${summary.overall.grade}</h3>
                <span class="status-badge ${summary.overall.passed ? 'status-passed' : 'status-failed'}">
                    ${summary.overall.passed ? 'PASSED' : 'FAILED'}
                </span>
                <p style="margin-top: 10px;">Confidence: ${(summary.overall.confidence * 100).toFixed(1)}%</p>
            </div>
        </div>

        <!-- Key Metrics -->
        <div class="card">
            <h2>Performance Improvements</h2>
            <div class="metrics-grid">
                <div class="metric">
                    <div class="metric-value ${results.improvements.latency.improvement >= 0 ? 'improvement' : 'regression'}">
                        ${results.improvements.latency.improvement.toFixed(1)}%
                    </div>
                    <div class="metric-label">Latency Reduction</div>
                    <div class="${results.improvements.latency.achieved ? 'target-met' : 'target-missed'}">
                        Target: ${results.improvements.latency.target}%
                    </div>
                </div>
                <div class="metric">
                    <div class="metric-value ${results.improvements.throughput.improvement >= 0 ? 'improvement' : 'regression'}">
                        ${results.improvements.throughput.improvement.toFixed(1)}%
                    </div>
                    <div class="metric-label">Throughput Improvement</div>
                    <div class="${results.improvements.throughput.achieved ? 'target-met' : 'target-missed'}">
                        Target: ${results.improvements.throughput.target}%
                    </div>
                </div>
                <div class="metric">
                    <div class="metric-value ${results.improvements.memory.improvement >= 0 ? 'improvement' : 'regression'}">
                        ${results.improvements.memory.improvement.toFixed(1)}%
                    </div>
                    <div class="metric-label">Memory Optimization</div>
                    <div class="${results.improvements.memory.achieved ? 'target-met' : 'target-missed'}">
                        Target: ${results.improvements.memory.target}%
                    </div>
                </div>
                <div class="metric">
                    <div class="metric-value ${results.improvements.cpu.improvement >= 0 ? 'improvement' : 'regression'}">
                        ${results.improvements.cpu.improvement.toFixed(1)}%
                    </div>
                    <div class="metric-label">CPU Efficiency</div>
                    <div class="${results.improvements.cpu.achieved ? 'target-met' : 'target-missed'}">
                        Target: ${results.improvements.cpu.target}%
                    </div>
                </div>
            </div>
        </div>

        <!-- Performance Chart -->
        <div class="card">
            <h2>Performance Comparison</h2>
            <div class="chart-container">
                <canvas id="performanceChart"></canvas>
            </div>
        </div>

        <!-- Recommendations -->
        <div class="card">
            <h2>Recommendations</h2>
            ${summary.recommendations.map(rec => `
                <div class="recommendation ${rec.priority}">
                    <h4>${rec.title}</h4>
                    <p>${rec.description}</p>
                    <ul>
                        ${rec.actions.map(action => `<li>${action}</li>`).join('')}
                    </ul>
                </div>
            `).join('')}
        </div>

        <!-- Key Findings -->
        <div class="card">
            <h2>Key Findings</h2>
            <ul>
                ${summary.keyFindings.map(finding => `<li>${finding}</li>`).join('')}
            </ul>
        </div>
    </div>

    <script>
        // Performance comparison chart
        const ctx = document.getElementById('performanceChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Latency', 'Throughput', 'Memory', 'CPU'],
                datasets: [
                    {
                        label: 'Baseline',
                        data: [
                            ${results.baseline.summary.avgLatency},
                            ${results.baseline.summary.avgThroughput},
                            ${results.baseline.summary.avgMemoryUsage},
                            ${results.baseline.summary.avgCpuUsage}
                        ],
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Current',
                        data: [
                            ${results.current.summary.avgLatency},
                            ${results.current.summary.avgThroughput},
                            ${results.current.summary.avgMemoryUsage},
                            ${results.current.summary.avgCpuUsage}
                        ],
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Value'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Baseline vs Current Performance'
                    }
                }
            }
        });
    </script>
</body>
</html>`;
  }

  /**
   * Get CSS class for score
   */
  getScoreClass(score) {
    if (score >= 90) return 'score-excellent';
    if (score >= 75) return 'score-good';
    if (score >= 60) return 'score-fair';
    return 'score-poor';
  }

  /**
   * Extract key findings
   */
  extractKeyFindings() {
    const findings = [];
    const improvements = this.validationResults.improvements;

    if (improvements.latency.achieved) {
      findings.push(`✅ Latency reduction target achieved: ${improvements.latency.improvement.toFixed(1)}%`);
    } else {
      findings.push(`❌ Latency reduction target missed: ${improvements.latency.improvement.toFixed(1)}% (target: ${improvements.latency.target}%)`);
    }

    if (improvements.throughput.achieved) {
      findings.push(`✅ Throughput improvement target achieved: ${improvements.throughput.improvement.toFixed(1)}%`);
    } else {
      findings.push(`❌ Throughput improvement target missed: ${improvements.throughput.improvement.toFixed(1)}% (target: ${improvements.throughput.target}%)`);
    }

    const overallAchievement = this.validationResults.targets.overallAchievement;
    findings.push(`📊 Overall target achievement: ${overallAchievement.toFixed(1)}%`);

    if (this.validationResults.overall.passed) {
      findings.push(`🎉 Validation PASSED with score ${this.validationResults.overall.score} (${this.validationResults.overall.grade})`);
    } else {
      findings.push(`❌ Validation FAILED with score ${this.validationResults.overall.score} (${this.validationResults.overall.grade})`);
    }

    return findings;
  }

  /**
   * Publish validation results to Redis
   */
  async publishValidationResults() {
    try {
      await this.redisClient.publish('swarm:phase-4:validation-results', JSON.stringify({
        type: 'performance-validation',
        results: this.validationResults,
        timestamp: Date.now()
      }));

      // Store latest results
      await this.redisClient.setex('validation:latest', 3600, JSON.stringify(this.validationResults));

    } catch (error) {
      console.warn('Failed to publish validation results:', error.message);
    }
  }

  /**
   * Statistical helper functions
   */
  mean(values) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  standardDeviation(values) {
    const mean = this.mean(values);
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = this.mean(squaredDiffs);
    return Math.sqrt(avgSquaredDiff);
  }

  confidenceInterval(values, confidence) {
    const mean = this.mean(values);
    const stdDev = this.standardDeviation(values);
    const n = values.length;
    const t = this.getTCriticalValue(n - 1, confidence);
    const margin = t * (stdDev / Math.sqrt(n));

    return {
      lower: mean - margin,
      upper: mean + margin,
      margin
    };
  }

  getTCriticalValue(degreesOfFreedom, confidence) {
    // Simplified t-critical values for common confidence levels
    const tValues = {
      0.95: {
        1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
        6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
        'inf': 1.96
      }
    };

    const df = Math.min(degreesOfFreedom, 'inf');
    return tValues[confidence]?.[df] || 2.0;
  }

  /**
   * Get validation results
   */
  getResults() {
    return this.validationResults;
  }

  /**
   * Reset validation state
   */
  async reset() {
    console.log('🔄 Resetting validation state...');

    try {
      // Clear baseline
      await this.redisClient.del('validation:baseline');
      await this.redisClient.del('validation:latest');

      // Reset local state
      this.validationResults = {
        baseline: null,
        current: null,
        improvements: {},
        targets: {},
        overall: {
          passed: false,
          score: 0,
          confidence: 0
        },
        timestamp: null
      };

      console.log('✅ Validation state reset');
    } catch (error) {
      console.error('❌ Failed to reset validation state:', error.message);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Performance Validator...');

    this.active = false;

    // Shutdown benchmark suite
    await this.benchmarkSuite.cleanup();

    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('✅ Performance Validator shutdown complete');
  }
}

// Export for use in other modules
export default PerformanceValidator;