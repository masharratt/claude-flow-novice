/**
 * Conflict Resolution Engine for Performance Benchmarks
 * Uses CRDT semantics for automated conflict resolution
 */

import { VerificationReport, GCounter, ORSet, LWWRegister } from '../crdt/types.js';
import { EventEmitter } from 'events';

export interface BenchmarkResult {
  benchmarkId: string;
  nodeId: string;
  timestamp: number;
  metrics: {
    executionTime: number;
    throughput: number;
    errorRate: number;
    memoryUsage: number;
    cpuUtilization: number;
  };
  metadata: {
    testSuite: string;
    environment: string;
    version: string;
    configuration: Record<string, any>;
  };
  conflicts: string[];
}

export interface ResolutionStrategy {
  name: string;
  priority: number;
  applicability: (results: BenchmarkResult[]) => number; // 0-1 score
  resolve: (results: BenchmarkResult[]) => BenchmarkResult;
}

export interface ConflictAnalysis {
  conflictType: 'timing' | 'environment' | 'configuration' | 'version' | 'data';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedMetrics: string[];
  recommendedStrategy: string;
  confidence: number;
}

export class CRDTConflictResolver extends EventEmitter {
  private readonly nodeId: string;
  private readonly strategies: Map<string, ResolutionStrategy>;
  private readonly resolutionHistory: Map<string, any[]>;
  private readonly conflictPatterns: Map<string, ConflictAnalysis>;
  private readonly performanceMetrics: GCounter;
  private readonly resolvedConflicts: ORSet<string>;
  private readonly lastResolution: LWWRegister<number>;

  constructor(nodeId: string) {
    super();
    this.nodeId = nodeId;
    this.strategies = new Map();
    this.resolutionHistory = new Map();
    this.conflictPatterns = new Map();
    this.performanceMetrics = new GCounter(nodeId, [nodeId]);
    this.resolvedConflicts = new ORSet<string>(nodeId);
    this.lastResolution = new LWWRegister<number>(nodeId, Date.now());

    this.initializeStrategies();
  }

  /**
   * Initialize built-in conflict resolution strategies
   */
  private initializeStrategies(): void {
    // Statistical aggregation strategy
    this.strategies.set('statistical', {
      name: 'statistical',
      priority: 1,
      applicability: (results: BenchmarkResult[]): number => {
        // Best for numerical metrics with normal distribution
        return results.length >= 3 ? 0.9 : 0.5;
      },
      resolve: (results: BenchmarkResult[]): BenchmarkResult => {
        return this.statisticalAggregation(results);
      }
    });

    // Environment-weighted strategy
    this.strategies.set('environment-weighted', {
      name: 'environment-weighted',
      priority: 2,
      applicability: (results: BenchmarkResult[]): number => {
        const environments = new Set(results.map(r => r.metadata.environment));
        return environments.size > 1 ? 0.8 : 0.3;
      },
      resolve: (results: BenchmarkResult[]): BenchmarkResult => {
        return this.environmentWeightedResolution(results);
      }
    });

    // Temporal consensus strategy
    this.strategies.set('temporal', {
      name: 'temporal',
      priority: 3,
      applicability: (results: BenchmarkResult[]): number => {
        const timeSpread = Math.max(...results.map(r => r.timestamp)) -
                          Math.min(...results.map(r => r.timestamp));
        return timeSpread > 300000 ? 0.7 : 0.4; // 5 minutes
      },
      resolve: (results: BenchmarkResult[]): BenchmarkResult => {
        return this.temporalConsensus(results);
      }
    });

    // CRDT-based merge strategy
    this.strategies.set('crdt-merge', {
      name: 'crdt-merge',
      priority: 4,
      applicability: (results: BenchmarkResult[]): number => {
        // Always applicable as fallback
        return 0.6;
      },
      resolve: (results: BenchmarkResult[]): BenchmarkResult => {
        return this.crdtMergeResolution(results);
      }
    });

    // Performance-optimized strategy
    this.strategies.set('performance-optimized', {
      name: 'performance-optimized',
      priority: 5,
      applicability: (results: BenchmarkResult[]): number => {
        const hasPerformanceMetrics = results.every(r =>
          r.metrics.executionTime && r.metrics.throughput
        );
        return hasPerformanceMetrics ? 0.85 : 0.2;
      },
      resolve: (results: BenchmarkResult[]): BenchmarkResult => {
        return this.performanceOptimizedResolution(results);
      }
    });
  }

  /**
   * Resolve conflicts in performance benchmark results
   */
  async resolveConflicts(conflictingResults: Map<string, BenchmarkResult[]>): Promise<Map<string, BenchmarkResult>> {
    const resolved = new Map<string, BenchmarkResult>();

    for (const [benchmarkId, results] of conflictingResults) {
      try {
        if (results.length === 1) {
          resolved.set(benchmarkId, results[0]);
          continue;
        }

        // Analyze conflict characteristics
        const analysis = await this.analyzeConflict(benchmarkId, results);
        this.conflictPatterns.set(benchmarkId, analysis);

        // Select optimal resolution strategy
        const strategy = this.selectResolutionStrategy(results, analysis);

        // Apply resolution
        const resolvedResult = strategy.resolve(results);
        resolved.set(benchmarkId, resolvedResult);

        // Track resolution
        this.resolvedConflicts.add(`${benchmarkId}-${Date.now()}`);
        this.performanceMetrics.increment(1);
        this.lastResolution.set(Date.now());

        // Store resolution history
        if (!this.resolutionHistory.has(benchmarkId)) {
          this.resolutionHistory.set(benchmarkId, []);
        }
        this.resolutionHistory.get(benchmarkId)!.push({
          timestamp: Date.now(),
          strategy: strategy.name,
          inputCount: results.length,
          analysis: analysis,
          result: resolvedResult
        });

        this.emit('conflict-resolved', {
          benchmarkId,
          strategy: strategy.name,
          inputCount: results.length,
          analysis: analysis
        });

      } catch (error) {
        this.emit('resolution-error', { benchmarkId, error, results });

        // Fallback to latest result
        resolved.set(benchmarkId, results[results.length - 1]);
      }
    }

    return resolved;
  }

  /**
   * Analyze conflict characteristics
   */
  private async analyzeConflict(benchmarkId: string, results: BenchmarkResult[]): Promise<ConflictAnalysis> {
    const analysis: ConflictAnalysis = {
      conflictType: 'data',
      severity: 'medium',
      affectedMetrics: [],
      recommendedStrategy: 'statistical',
      confidence: 0.5
    };

    // Analyze metric variations
    const metricVariations = this.calculateMetricVariations(results);
    analysis.affectedMetrics = Object.keys(metricVariations).filter(
      metric => metricVariations[metric].coefficient > 0.2
    );

    // Determine conflict type
    if (this.hasEnvironmentConflicts(results)) {
      analysis.conflictType = 'environment';
      analysis.recommendedStrategy = 'environment-weighted';
      analysis.confidence = 0.8;
    } else if (this.hasTimingConflicts(results)) {
      analysis.conflictType = 'timing';
      analysis.recommendedStrategy = 'temporal';
      analysis.confidence = 0.7;
    } else if (this.hasConfigurationConflicts(results)) {
      analysis.conflictType = 'configuration';
      analysis.recommendedStrategy = 'crdt-merge';
      analysis.confidence = 0.6;
    }

    // Determine severity
    const maxVariation = Math.max(...Object.values(metricVariations).map(v => v.coefficient));
    if (maxVariation > 0.5) analysis.severity = 'critical';
    else if (maxVariation > 0.3) analysis.severity = 'high';
    else if (maxVariation > 0.1) analysis.severity = 'medium';
    else analysis.severity = 'low';

    return analysis;
  }

  /**
   * Statistical aggregation resolution
   */
  private statisticalAggregation(results: BenchmarkResult[]): BenchmarkResult {
    const aggregated: BenchmarkResult = {
      benchmarkId: results[0].benchmarkId,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      metrics: {
        executionTime: 0,
        throughput: 0,
        errorRate: 0,
        memoryUsage: 0,
        cpuUtilization: 0
      },
      metadata: {
        testSuite: results[0].metadata.testSuite,
        environment: 'aggregated',
        version: results[0].metadata.version,
        configuration: {
          aggregation: 'statistical',
          sources: results.length,
          outliers_removed: false
        }
      },
      conflicts: []
    };

    // Remove statistical outliers
    const filteredResults = this.removeOutliers(results);

    // Calculate statistical measures
    const metrics = ['executionTime', 'throughput', 'errorRate', 'memoryUsage', 'cpuUtilization'] as const;

    for (const metric of metrics) {
      const values = filteredResults.map(r => r.metrics[metric]);
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      // Use median for skewed distributions, mean for normal
      const skewness = this.calculateSkewness(values);
      if (Math.abs(skewness) > 1) {
        aggregated.metrics[metric] = this.median(values);
        aggregated.metadata.configuration[`${metric}_method`] = 'median';
      } else {
        aggregated.metrics[metric] = mean;
        aggregated.metadata.configuration[`${metric}_method`] = 'mean';
      }

      aggregated.metadata.configuration[`${metric}_stddev`] = stdDev;
      aggregated.metadata.configuration[`${metric}_samples`] = values.length;
    }

    // Track aggregated conflicts
    const allConflicts = new Set<string>();
    results.forEach(r => r.conflicts.forEach(c => allConflicts.add(c)));
    aggregated.conflicts = Array.from(allConflicts);

    return aggregated;
  }

  /**
   * Environment-weighted resolution
   */
  private environmentWeightedResolution(results: BenchmarkResult[]): BenchmarkResult {
    // Weight results by environment reliability
    const environmentWeights = new Map<string, number>();
    const environmentCounts = new Map<string, number>();

    // Count environment occurrences
    results.forEach(r => {
      const env = r.metadata.environment;
      environmentCounts.set(env, (environmentCounts.get(env) || 0) + 1);
    });

    // Assign weights (more occurrences = more reliable)
    const maxCount = Math.max(...environmentCounts.values());
    environmentCounts.forEach((count, env) => {
      environmentWeights.set(env, count / maxCount);
    });

    // Calculate weighted averages
    const weightedResult: BenchmarkResult = {
      benchmarkId: results[0].benchmarkId,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      metrics: {
        executionTime: 0,
        throughput: 0,
        errorRate: 0,
        memoryUsage: 0,
        cpuUtilization: 0
      },
      metadata: {
        testSuite: results[0].metadata.testSuite,
        environment: 'weighted-aggregate',
        version: results[0].metadata.version,
        configuration: {
          resolution: 'environment-weighted',
          environments: Array.from(environmentCounts.keys()),
          weights: Object.fromEntries(environmentWeights)
        }
      },
      conflicts: []
    };

    let totalWeight = 0;
    const metrics = Object.keys(weightedResult.metrics) as (keyof BenchmarkResult['metrics'])[];

    results.forEach(result => {
      const weight = environmentWeights.get(result.metadata.environment) || 0;
      totalWeight += weight;

      metrics.forEach(metric => {
        weightedResult.metrics[metric] += result.metrics[metric] * weight;
      });
    });

    // Normalize by total weight
    metrics.forEach(metric => {
      weightedResult.metrics[metric] /= totalWeight;
    });

    return weightedResult;
  }

  /**
   * Temporal consensus resolution
   */
  private temporalConsensus(results: BenchmarkResult[]): BenchmarkResult {
    // Sort by timestamp
    const sortedResults = [...results].sort((a, b) => b.timestamp - a.timestamp);

    // Give more weight to recent results
    const now = Date.now();
    const maxAge = now - Math.min(...results.map(r => r.timestamp));

    const temporalResult: BenchmarkResult = {
      benchmarkId: results[0].benchmarkId,
      nodeId: this.nodeId,
      timestamp: now,
      metrics: {
        executionTime: 0,
        throughput: 0,
        errorRate: 0,
        memoryUsage: 0,
        cpuUtilization: 0
      },
      metadata: {
        testSuite: results[0].metadata.testSuite,
        environment: 'temporal-consensus',
        version: results[0].metadata.version,
        configuration: {
          resolution: 'temporal',
          timeWindow: maxAge,
          samples: results.length
        }
      },
      conflicts: []
    };

    let totalWeight = 0;
    const metrics = Object.keys(temporalResult.metrics) as (keyof BenchmarkResult['metrics'])[];

    sortedResults.forEach(result => {
      const age = now - result.timestamp;
      // Exponential decay weight (more recent = higher weight)
      const weight = Math.exp(-age / (maxAge / 4));
      totalWeight += weight;

      metrics.forEach(metric => {
        temporalResult.metrics[metric] += result.metrics[metric] * weight;
      });
    });

    // Normalize
    metrics.forEach(metric => {
      temporalResult.metrics[metric] /= totalWeight;
    });

    return temporalResult;
  }

  /**
   * CRDT-based merge resolution
   */
  private crdtMergeResolution(results: BenchmarkResult[]): BenchmarkResult {
    // Use CRDT semantics for conflict-free merge
    const nodeIds = results.map(r => r.nodeId);

    // G-Counters for additive metrics
    const executionTimeCounter = new GCounter(this.nodeId, nodeIds);
    const throughputCounter = new GCounter(this.nodeId, nodeIds);
    const memoryCounter = new GCounter(this.nodeId, nodeIds);
    const cpuCounter = new GCounter(this.nodeId, nodeIds);

    // OR-Set for error tracking
    const errorSet = new ORSet<number>(this.nodeId);

    // LWW-Registers for configuration
    const versionRegister = new LWWRegister<string>(this.nodeId);
    const envRegister = new LWWRegister<string>(this.nodeId);

    // Populate CRDTs
    results.forEach(result => {
      executionTimeCounter.increment(result.metrics.executionTime);
      throughputCounter.increment(result.metrics.throughput);
      memoryCounter.increment(result.metrics.memoryUsage);
      cpuCounter.increment(result.metrics.cpuUtilization);

      errorSet.add(result.metrics.errorRate);

      versionRegister.set(result.metadata.version, result.timestamp);
      envRegister.set(result.metadata.environment, result.timestamp);
    });

    // Create merged result
    const mergedResult: BenchmarkResult = {
      benchmarkId: results[0].benchmarkId,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      metrics: {
        executionTime: executionTimeCounter.value() / results.length, // Average
        throughput: throughputCounter.value() / results.length,
        errorRate: Array.from(errorSet.values()).reduce((sum, val) => sum + val, 0) / errorSet.values().size,
        memoryUsage: memoryCounter.value() / results.length,
        cpuUtilization: cpuCounter.value() / results.length
      },
      metadata: {
        testSuite: results[0].metadata.testSuite,
        environment: envRegister.get() || 'merged',
        version: versionRegister.get() || 'unknown',
        configuration: {
          resolution: 'crdt-merge',
          merged_nodes: nodeIds,
          merge_timestamp: Date.now()
        }
      },
      conflicts: []
    };

    return mergedResult;
  }

  /**
   * Performance-optimized resolution
   */
  private performanceOptimizedResolution(results: BenchmarkResult[]): BenchmarkResult {
    // Select results with best performance characteristics
    const scored = results.map(result => {
      const score = this.calculatePerformanceScore(result);
      return { result, score };
    });

    // Sort by performance score
    scored.sort((a, b) => b.score - a.score);

    // Take top performers (top 50% or minimum 2)
    const topCount = Math.max(2, Math.ceil(scored.length * 0.5));
    const topPerformers = scored.slice(0, topCount);

    // Weight by performance score
    let totalWeight = 0;
    const optimizedResult: BenchmarkResult = {
      benchmarkId: results[0].benchmarkId,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      metrics: {
        executionTime: 0,
        throughput: 0,
        errorRate: 0,
        memoryUsage: 0,
        cpuUtilization: 0
      },
      metadata: {
        testSuite: results[0].metadata.testSuite,
        environment: 'performance-optimized',
        version: results[0].metadata.version,
        configuration: {
          resolution: 'performance-optimized',
          top_performers: topCount,
          performance_threshold: 0.5
        }
      },
      conflicts: []
    };

    const metrics = Object.keys(optimizedResult.metrics) as (keyof BenchmarkResult['metrics'])[];

    topPerformers.forEach(({ result, score }) => {
      totalWeight += score;

      metrics.forEach(metric => {
        optimizedResult.metrics[metric] += result.metrics[metric] * score;
      });
    });

    // Normalize
    metrics.forEach(metric => {
      optimizedResult.metrics[metric] /= totalWeight;
    });

    return optimizedResult;
  }

  // Helper methods
  private selectResolutionStrategy(results: BenchmarkResult[], analysis: ConflictAnalysis): ResolutionStrategy {
    const candidates = Array.from(this.strategies.values())
      .map(strategy => ({
        strategy,
        applicability: strategy.applicability(results),
        priority: strategy.priority
      }))
      .filter(c => c.applicability > 0.3)
      .sort((a, b) => b.applicability - a.applicability || a.priority - b.priority);

    // Use recommended strategy if available and applicable
    if (analysis.recommendedStrategy && this.strategies.has(analysis.recommendedStrategy)) {
      const recommended = this.strategies.get(analysis.recommendedStrategy)!;
      if (recommended.applicability(results) > 0.5) {
        return recommended;
      }
    }

    return candidates[0]?.strategy || this.strategies.get('statistical')!;
  }

  private calculateMetricVariations(results: BenchmarkResult[]): Record<string, { mean: number; stdDev: number; coefficient: number }> {
    const variations: Record<string, { mean: number; stdDev: number; coefficient: number }> = {};
    const metrics = ['executionTime', 'throughput', 'errorRate', 'memoryUsage', 'cpuUtilization'] as const;

    metrics.forEach(metric => {
      const values = results.map(r => r.metrics[metric]);
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      const coefficient = mean > 0 ? stdDev / mean : 0;

      variations[metric] = { mean, stdDev, coefficient };
    });

    return variations;
  }

  private hasEnvironmentConflicts(results: BenchmarkResult[]): boolean {
    const environments = new Set(results.map(r => r.metadata.environment));
    return environments.size > 1;
  }

  private hasTimingConflicts(results: BenchmarkResult[]): boolean {
    const timestamps = results.map(r => r.timestamp);
    const timeSpread = Math.max(...timestamps) - Math.min(...timestamps);
    return timeSpread > 300000; // 5 minutes
  }

  private hasConfigurationConflicts(results: BenchmarkResult[]): boolean {
    const configs = results.map(r => JSON.stringify(r.metadata.configuration));
    return new Set(configs).size > 1;
  }

  private removeOutliers(results: BenchmarkResult[]): BenchmarkResult[] {
    if (results.length < 4) return results;

    // Use IQR method for outlier detection on execution time
    const times = results.map(r => r.metrics.executionTime).sort((a, b) => a - b);
    const q1 = times[Math.floor(times.length * 0.25)];
    const q3 = times[Math.floor(times.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return results.filter(r =>
      r.metrics.executionTime >= lowerBound &&
      r.metrics.executionTime <= upperBound
    );
  }

  private calculateSkewness(values: number[]): number {
    const n = values.length;
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    const skewness = values.reduce((sum, val) => sum + Math.pow((val - mean) / stdDev, 3), 0) / n;
    return skewness;
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  private calculatePerformanceScore(result: BenchmarkResult): number {
    // Higher throughput, lower execution time, lower error rate = better score
    const normalizedThroughput = Math.min(result.metrics.throughput / 1000, 1); // Normalize to 0-1
    const normalizedTime = Math.max(1 - result.metrics.executionTime / 10000, 0); // Lower is better
    const normalizedError = Math.max(1 - result.metrics.errorRate, 0); // Lower is better

    return (normalizedThroughput * 0.4 + normalizedTime * 0.4 + normalizedError * 0.2);
  }
}