/**
 * Performance Benchmarking Framework for Auto-Scaling Engine
 * Measures efficiency gains and resource utilization metrics
 */

import Redis from 'ioredis';
import EventEmitter from 'events';

class PerformanceBenchmark extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      benchmarks: {
        efficiency: {
          target: 0.40, // 40% efficiency gain
          measurementInterval: 60000, // 1 minute
          baselineWindow: 300000 // 5 minutes
        },
        utilization: {
          target: 0.85, // 85% resource utilization
          minThreshold: 0.7,
          maxThreshold: 0.95
        },
        responseTime: {
          target: 100, // 100ms average response time
          maxAcceptable: 500 // 500ms max
        },
        scaling: {
          targetScaleUpTime: 30000, // 30s
          targetScaleDownTime: 60000, // 60s
          maxOscillationFrequency: 3 // per hour
        }
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
      },
      ...config
    };

    this.redis = new Redis(this.config.redis);
    this.isRunning = false;
    this.metrics = new Map();
    this.baseline = null;
    this.results = {
      efficiency: 0,
      utilization: 0,
      responseTime: 0,
      scalingPerformance: 0,
      overall: 0
    };

    // Performance counters
    this.counters = {
      tasksProcessed: 0,
      scaleUpEvents: 0,
      scaleDownEvents: 0,
      totalResponseTime: 0,
      responseTimeSamples: 0,
      scalingOscillations: 0
    };
  }

  /**
   * Start performance benchmarking
   */
  async start() {
    if (this.isRunning) {
      console.log('Performance Benchmark is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting Performance Benchmark...');

    // Establish baseline
    await this.establishBaseline();

    // Start periodic measurements
    this.measurementInterval = setInterval(async () => {
      await this.runBenchmarkCycle();
    }, this.config.benchmarks.efficiency.measurementInterval);

    // Subscribe to scaling events
    await this.redis.subscribe('swarm:phase-2:autoscaling');
    this.redis.on('message', async (channel, message) => {
      if (channel === 'swarm:phase-2:autoscaling') {
        await this.handleScalingEvent(message);
      }
    });

    // Subscribe to optimizer events
    await this.redis.subscribe('swarm:phase-2:optimizer');
    this.redis.on('message', async (channel, message) => {
      if (channel === 'swarm:phase-2:optimizer') {
        await this.handleOptimizerEvent(message);
      }
    });

    this.emit('started', { timestamp: Date.now() });
  }

  /**
   * Stop performance benchmarking
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping Performance Benchmark...');

    if (this.measurementInterval) {
      clearInterval(this.measurementInterval);
    }

    await this.redis.unsubscribe('swarm:phase-2:autoscaling');
    await this.redis.unsubscribe('swarm:phase-2:optimizer');

    // Generate final report
    const finalReport = await this.generateReport();
    this.emit('stopped', { timestamp: Date.now(), report: finalReport });

    await this.redis.quit();
  }

  /**
   * Establish performance baseline
   */
  async establishBaseline() {
    console.log('Establishing performance baseline...');

    const baselineStart = Date.now();
    const baselineMetrics = [];

    // Collect metrics for baseline window
    const baselineInterval = setInterval(async () => {
      const metrics = await this.collectCurrentMetrics();
      baselineMetrics.push(metrics);

      if (Date.now() - baselineStart >= this.config.benchmarks.efficiency.baselineWindow) {
        clearInterval(baselineInterval);

        this.baseline = this.calculateBaseline(baselineMetrics);
        console.log('Baseline established:', this.baseline);

        await this.publishEvent('baseline_established', this.baseline);
      }
    }, 10000); // Collect every 10 seconds
  }

  /**
   * Calculate baseline from collected metrics
   */
  calculateBaseline(metrics) {
    if (metrics.length === 0) {
      return { utilization: 0.5, responseTime: 200, throughput: 10 };
    }

    const avgUtilization = metrics.reduce((sum, m) => sum + m.utilization, 0) / metrics.length;
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length;
    const avgThroughput = metrics.reduce((sum, m) => sum + m.throughput, 0) / metrics.length;

    return {
      utilization: avgUtilization,
      responseTime: avgResponseTime,
      throughput: avgThroughput,
      timestamp: Date.now(),
      sampleSize: metrics.length
    };
  }

  /**
   * Run complete benchmark cycle
   */
  async runBenchmarkCycle() {
    try {
      const cycleStart = Date.now();

      // Collect current metrics
      const currentMetrics = await this.collectCurrentMetrics();

      // Calculate efficiency metrics
      const efficiency = await this.calculateEfficiency(currentMetrics);
      const utilization = await this.calculateUtilization(currentMetrics);
      const responseTime = await this.calculateResponseTime(currentMetrics);
      const scalingPerformance = await this.calculateScalingPerformance();

      // Update results
      this.results = {
        efficiency,
        utilization,
        responseTime,
        scalingPerformance,
        overall: this.calculateOverallScore(efficiency, utilization, responseTime, scalingPerformance)
      };

      // Store metrics with timestamp
      this.metrics.set(Date.now(), {
        ...currentMetrics,
        ...this.results
      });

      // Keep only recent metrics (last hour)
      const cutoffTime = Date.now() - (60 * 60 * 1000);
      for (const [timestamp] of this.metrics) {
        if (timestamp < cutoffTime) {
          this.metrics.delete(timestamp);
        }
      }

      // Check for performance alerts
      await this.checkPerformanceAlerts();

      // Publish results
      await this.publishEvent('benchmark_results', {
        timestamp: Date.now(),
        results: this.results,
        targets: this.config.benchmarks,
        cycleTime: Date.now() - cycleStart
      });

      this.emit('benchmarkCycle', { results: this.results });

    } catch (error) {
      console.error('Error during benchmark cycle:', error);
      await this.publishEvent('benchmark_error', {
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Collect current performance metrics
   */
  async collectCurrentMetrics() {
    try {
      // Get pool status
      const poolStats = await this.redis.hgetall('swarm:pool-stats');
      const stats = poolStats.stats ? JSON.parse(poolStats.stats) : {};

      // Get agent count
      const agents = await this.redis.hgetall('swarm:agents');
      const agentCount = Object.keys(agents).length;

      // Get task queue size
      const queueSize = await this.redis.llen('swarm:task-queue');

      // Calculate metrics
      const metrics = {
        timestamp: Date.now(),
        poolSize: stats.totalAgents || agentCount,
        activeAgents: this.countActiveAgents(agents),
        taskQueueSize: queueSize,
        utilization: this.calculateCurrentUtilization(stats),
        responseTime: this.getAverageResponseTime(),
        throughput: this.calculateThroughput(),
        cpu: await this.getSystemCPU(),
        memory: await this.getSystemMemory()
      };

      return metrics;

    } catch (error) {
      console.error('Error collecting metrics:', error);
      return {
        timestamp: Date.now(),
        poolSize: 0,
        activeAgents: 0,
        taskQueueSize: 0,
        utilization: 0,
        responseTime: 0,
        throughput: 0,
        cpu: 0,
        memory: 0
      };
    }
  }

  /**
   * Count active agents
   */
  countActiveAgents(agents) {
    return Object.values(agents)
      .map(agentData => JSON.parse(agentData))
      .filter(agent => agent.status === 'active' || agent.status === 'busy')
      .length;
  }

  /**
   * Calculate current utilization
   */
  calculateCurrentUtilization(stats) {
    if (!stats.avgUtilization) return 0;
    return Math.min(1.0, stats.avgUtilization);
  }

  /**
   * Get average response time
   */
  getAverageResponseTime() {
    if (this.counters.responseTimeSamples === 0) return 0;
    return this.counters.totalResponseTime / this.counters.responseTimeSamples;
  }

  /**
   * Calculate throughput (tasks per minute)
   */
  calculateThroughput() {
    const recentMetrics = Array.from(this.metrics.values())
      .filter(m => Date.now() - m.timestamp < 60000); // Last minute

    if (recentMetrics.length === 0) return 0;

    const tasksCompleted = recentMetrics.reduce((sum, m) => sum + (m.tasksCompleted || 0), 0);
    return tasksCompleted / (recentMetrics.length / 60); // Convert to per-minute rate
  }

  /**
   * Get system CPU usage (placeholder)
   */
  async getSystemCPU() {
    // In production, this would integrate with actual system monitoring
    return Math.random() * 0.8; // Simulated CPU usage
  }

  /**
   * Get system memory usage (placeholder)
   */
  async getSystemMemory() {
    // In production, this would integrate with actual system monitoring
    return Math.random() * 0.7; // Simulated memory usage
  }

  /**
   * Calculate efficiency gain compared to baseline
   */
  async calculateEfficiency(currentMetrics) {
    if (!this.baseline) {
      return 0; // No baseline established yet
    }

    const baselineThroughput = this.baseline.throughput;
    const currentThroughput = currentMetrics.throughput;

    if (baselineThroughput === 0) return 0;

    // Efficiency gain as percentage improvement over baseline
    const efficiencyGain = (currentThroughput - baselineThroughput) / baselineThroughput;
    return Math.max(0, efficiencyGain);
  }

  /**
   * Calculate resource utilization score
   */
  async calculateUtilization(currentMetrics) {
    const target = this.config.benchmarks.utilization.target;
    const currentUtilization = currentMetrics.utilization;

    // Score based on how close to target utilization
    const distance = Math.abs(currentUtilization - target);
    const maxDistance = Math.max(target, 1 - target);
    const score = 1 - (distance / maxDistance);

    // Penalize extreme utilization (too low or too high)
    if (currentUtilization < this.config.benchmarks.utilization.minThreshold ||
        currentUtilization > this.config.benchmarks.utilization.maxThreshold) {
      return score * 0.5; // 50% penalty for out-of-range utilization
    }

    return score;
  }

  /**
   * Calculate response time score
   */
  async calculateResponseTime(currentMetrics) {
    const target = this.config.benchmarks.responseTime.target;
    const maxAcceptable = this.config.benchmarks.responseTime.maxAcceptable;
    const currentResponseTime = currentMetrics.responseTime;

    if (currentResponseTime <= target) {
      return 1.0; // Perfect score
    }

    if (currentResponseTime >= maxAcceptable) {
      return 0.0; // Failed score
    }

    // Linear interpolation between target and max acceptable
    const ratio = (currentResponseTime - target) / (maxAcceptable - target);
    return 1 - ratio;
  }

  /**
   * Calculate scaling performance score
   */
  async calculateScalingPerformance() {
    // In a real implementation, this would measure:
    // - Scale-up and scale-down times
    // - Oscillation frequency
    // - Prediction accuracy

    const avgScaleTime = this.calculateAverageScaleTime();
    const targetScaleUpTime = this.config.benchmarks.scaling.targetScaleUpTime;
    const targetScaleDownTime = this.config.benchmarks.scaling.targetScaleDownTime;

    const scaleUpScore = Math.min(1.0, targetScaleUpTime / (avgScaleTime.scaleUp || targetScaleUpTime));
    const scaleDownScore = Math.min(1.0, targetScaleDownTime / (avgScaleTime.scaleDown || targetScaleDownTime));

    // Penalize oscillations
    const oscillationPenalty = Math.min(0.3, this.counters.scalingOscillations * 0.1);

    return ((scaleUpScore + scaleDownScore) / 2) - oscillationPenalty;
  }

  /**
   * Calculate average scaling times
   */
  calculateAverageScaleTime() {
    // This would be calculated from actual scaling event timestamps
    // For now, return simulated values
    return {
      scaleUp: 25000, // 25 seconds
      scaleDown: 45000 // 45 seconds
    };
  }

  /**
   * Calculate overall performance score
   */
  calculateOverallScore(efficiency, utilization, responseTime, scalingPerformance) {
    // Weight the different components
    const weights = {
      efficiency: 0.3,
      utilization: 0.3,
      responseTime: 0.2,
      scalingPerformance: 0.2
    };

    return (
      efficiency * weights.efficiency +
      utilization * weights.utilization +
      responseTime * weights.responseTime +
      scalingPerformance * weights.scalingPerformance
    );
  }

  /**
   * Check for performance alerts
   */
  async checkPerformanceAlerts() {
    const alerts = [];

    // Check efficiency target
    if (this.results.efficiency < this.config.benchmarks.efficiency.target) {
      alerts.push({
        type: 'efficiency',
        severity: 'warning',
        message: `Efficiency ${(this.results.efficiency * 100).toFixed(1)}% below target ${(this.config.benchmarks.efficiency.target * 100).toFixed(1)}%`
      });
    }

    // Check utilization
    if (this.results.utilization < this.config.benchmarks.utilization.minThreshold) {
      alerts.push({
        type: 'utilization',
        severity: 'warning',
        message: `Low utilization: ${(this.results.utilization * 100).toFixed(1)}%`
      });
    }

    // Check response time
    if (this.results.responseTime < 0.5) {
      alerts.push({
        type: 'response_time',
        severity: 'critical',
        message: `Poor response time performance`
      });
    }

    // Publish alerts if any
    if (alerts.length > 0) {
      await this.publishEvent('performance_alerts', {
        timestamp: Date.now(),
        alerts
      });

      this.emit('performanceAlerts', { alerts });
    }
  }

  /**
   * Handle scaling events from Redis
   */
  async handleScalingEvent(message) {
    try {
      const event = JSON.parse(message);

      switch (event.type) {
        case 'scale_up':
          this.counters.scaleUpEvents++;
          this.trackScaleTiming(event.data, 'up');
          break;
        case 'scale_down':
          this.counters.scaleDownEvents++;
          this.trackScaleTiming(event.data, 'down');
          break;
        case 'scaling_decision':
          this.trackScalingDecision(event.data);
          break;
      }
    } catch (error) {
      console.error('Error handling scaling event:', error);
    }
  }

  /**
   * Handle optimizer events from Redis
   */
  async handleOptimizerEvent(message) {
    try {
      const event = JSON.parse(message);

      switch (event.type) {
        case 'task_assigned':
          this.counters.tasksProcessed++;
          break;
        case 'task_completed':
          if (event.data.duration) {
            this.counters.totalResponseTime += event.data.duration;
            this.counters.responseTimeSamples++;
          }
          break;
      }
    } catch (error) {
      console.error('Error handling optimizer event:', error);
    }
  }

  /**
   * Track scaling timing
   */
  trackScaleTiming(data, direction) {
    // Store timing data for analysis
    const timingKey = `scale_${direction}_timing`;
    if (!this[timingKey]) {
      this[timingKey] = [];
    }

    this[timingKey].push({
      timestamp: Date.now(),
      duration: data.duration || 0,
      agentCount: data.newPoolSize || 0
    });
  }

  /**
   * Track scaling decisions for oscillation detection
   */
  trackScalingDecision(decision) {
    // Simple oscillation detection - would be more sophisticated in production
    if (this.lastScalingDecision) {
      const timeDiff = decision.timestamp - this.lastScalingDecision.timestamp;
      const directionChanged =
        (decision.action === 'scale_up' && this.lastScalingDecision.action === 'scale_down') ||
        (decision.action === 'scale_down' && this.lastScalingDecision.action === 'scale_up');

      if (directionChanged && timeDiff < 300000) { // 5 minutes
        this.counters.scalingOscillations++;
      }
    }

    this.lastScalingDecision = decision;
  }

  /**
   * Generate comprehensive performance report
   */
  async generateReport() {
    const report = {
      timestamp: Date.now(),
      summary: {
        overall: this.results.overall,
        efficiency: this.results.efficiency,
        utilization: this.results.utilization,
        responseTime: this.results.responseTime,
        scalingPerformance: this.results.scalingPerformance
      },
      targets: this.config.benchmarks,
      achievements: this.calculateAchievements(),
      counters: this.counters,
      baseline: this.baseline,
      recommendations: this.generateRecommendations()
    };

    // Store report in Redis
    await this.redis.setex('swarm:performance-report', 3600, JSON.stringify(report));

    return report;
  }

  /**
   * Calculate achievement status
   */
  calculateAchievements() {
    return {
      efficiency: {
        achieved: this.results.efficiency >= this.config.benchmarks.efficiency.target,
        value: this.results.efficiency,
        target: this.config.benchmarks.efficiency.target
      },
      utilization: {
        achieved: this.results.utilization >= this.config.benchmarks.utilization.target,
        value: this.results.utilization,
        target: this.config.benchmarks.utilization.target
      },
      responseTime: {
        achieved: this.results.responseTime >= 0.5,
        value: this.results.responseTime,
        target: 1.0
      },
      overall: {
        achieved: this.results.overall >= 0.8,
        value: this.results.overall,
        target: 0.8
      }
    };
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    if (this.results.efficiency < this.config.benchmarks.efficiency.target) {
      recommendations.push({
        type: 'efficiency',
        priority: 'high',
        message: 'Consider optimizing scaling algorithms or improving task distribution'
      });
    }

    if (this.results.utilization < this.config.benchmarks.utilization.minThreshold) {
      recommendations.push({
        type: 'utilization',
        priority: 'medium',
        message: 'Pool may be over-provisioned. Consider reducing minimum pool size'
      });
    }

    if (this.results.responseTime < 0.7) {
      recommendations.push({
        type: 'response_time',
        priority: 'high',
        message: 'Response times are degraded. Check system resources and task complexity'
      });
    }

    if (this.counters.scalingOscillations > this.config.benchmarks.scaling.maxOscillationFrequency) {
      recommendations.push({
        type: 'oscillation',
        priority: 'medium',
        message: 'High scaling oscillation detected. Consider increasing cooldown periods'
      });
    }

    return recommendations;
  }

  /**
   * Publish events to Redis
   */
  async publishEvent(eventType, data) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      data
    };

    try {
      await this.redis.publish('swarm:phase-2:benchmark', JSON.stringify(event));
    } catch (error) {
      console.error('Error publishing benchmark event:', error);
    }
  }

  /**
   * Get current benchmark results
   */
  getResults() {
    return {
      ...this.results,
      counters: this.counters,
      baseline: this.baseline,
      timestamp: Date.now()
    };
  }

  /**
   * Get detailed metrics history
   */
  getMetricsHistory(minutes = 60) {
    const cutoffTime = Date.now() - (minutes * 60 * 1000);

    return Array.from(this.metrics.entries())
      .filter(([timestamp]) => timestamp >= cutoffTime)
      .map(([timestamp, metrics]) => ({ timestamp, ...metrics }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

export default PerformanceBenchmark;