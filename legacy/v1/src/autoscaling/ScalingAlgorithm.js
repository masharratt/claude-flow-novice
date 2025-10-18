/**
 * Auto-Scaling Algorithms for Agent Pool Management
 * Implements predictive, reactive, and hybrid scaling strategies
 */

class ScalingAlgorithm {
  constructor(type, config = {}) {
    this.type = type;
    this.config = {
      predictive: {
        lookbackWindow: 300, // 5 minutes
        forecastWindow: 60,  // 1 minute
        minConfidence: 0.7,
        trendWeight: 0.6,
        seasonalityWeight: 0.4
      },
      reactive: {
        thresholds: {
          scaleUp: 0.8,
          scaleDown: 0.3
        },
        cooldown: {
          scaleUp: 30000,   // 30s
          scaleDown: 120000 // 120s
        }
      },
      hybrid: {
        predictiveWeight: 0.6,
        reactiveWeight: 0.4,
        consensusThreshold: 0.75
      },
      ...config
    };
    this.metrics = new Map();
    this.lastDecision = null;
    this.lastScaleTime = { up: 0, down: 0 };
  }

  /**
   * Analyze current metrics and determine scaling action
   */
  async analyze(metrics) {
    this.updateMetrics(metrics);

    switch (this.type) {
      case 'predictive':
        return this.predictiveScaling();
      case 'reactive':
        return this.reactiveScaling();
      case 'hybrid':
        return this.hybridScaling();
      default:
        throw new Error(`Unknown scaling algorithm type: ${this.type}`);
    }
  }

  /**
   * Predictive scaling using time series analysis
   */
  predictiveScaling() {
    const config = this.config.predictive;
    const currentMetrics = this.getCurrentMetrics();

    if (!currentMetrics || currentMetrics.length < 10) {
      return this.createDecision('no_action', 0.5, 'Insufficient data for prediction');
    }

    // Calculate trend using linear regression
    const trend = this.calculateTrend(currentMetrics);
    const forecast = this.forecastDemand(trend, config.forecastWindow);

    // Determine scaling action based on forecast
    const utilizationForecast = forecast.utilization;
    const confidence = forecast.confidence;

    if (confidence < config.minConfidence) {
      return this.createDecision('no_action', confidence, 'Low forecast confidence');
    }

    if (utilizationForecast > 0.8) {
      return this.createDecision('scale_up', confidence,
        `Predicted high utilization: ${(utilizationForecast * 100).toFixed(1)}%`);
    } else if (utilizationForecast < 0.3) {
      return this.createDecision('scale_down', confidence,
        `Predicted low utilization: ${(utilizationForecast * 100).toFixed(1)}%`);
    }

    return this.createDecision('no_action', confidence, 'Predicted optimal utilization');
  }

  /**
   * Reactive scaling based on current metrics
   */
  reactiveScaling() {
    const config = this.config.reactive;
    const currentMetrics = this.getCurrentMetrics();
    const now = Date.now();

    if (!currentMetrics || currentMetrics.length === 0) {
      return this.createDecision('no_action', 0.5, 'No metrics available');
    }

    const latestMetric = currentMetrics[currentMetrics.length - 1];
    const utilization = latestMetric.utilization;

    // Check cooldowns
    if (utilization > config.thresholds.scaleUp) {
      if (now - this.lastScaleTime.up < config.cooldown.scaleUp) {
        return this.createDecision('no_action', 0.8, 'Scale up cooldown active');
      }

      this.lastScaleTime.up = now;
      return this.createDecision('scale_up', 0.9,
        `High utilization: ${(utilization * 100).toFixed(1)}%`);
    } else if (utilization < config.thresholds.scaleDown) {
      if (now - this.lastScaleTime.down < config.cooldown.scaleDown) {
        return this.createDecision('no_action', 0.8, 'Scale down cooldown active');
      }

      this.lastScaleTime.down = now;
      return this.createDecision('scale_down', 0.9,
        `Low utilization: ${(utilization * 100).toFixed(1)}%`);
    }

    return this.createDecision('no_action', 0.7, 'Utilization within optimal range');
  }

  /**
   * Hybrid scaling combining predictive and reactive approaches
   */
  hybridScaling() {
    const config = this.config.hybrid;

    const predictiveResult = this.predictiveScaling();
    const reactiveResult = this.reactiveScaling();

    // Weight the decisions
    const weightedConfidence =
      (predictiveResult.confidence * config.predictiveWeight) +
      (reactiveResult.confidence * config.reactiveWeight);

    // Check for consensus
    if (predictiveResult.action === reactiveResult.action) {
      return {
        ...predictiveResult,
        confidence: Math.min(0.95, weightedConfidence + 0.1),
        reasoning: `Consensus: ${predictiveResult.reasoning} | ${reactiveResult.reasoning}`
      };
    }

    // Conflict resolution - prefer reactive for immediate needs
    if (reactiveResult.action !== 'no_action') {
      return {
        ...reactiveResult,
        confidence: weightedConfidence,
        reasoning: `Reactive priority: ${reactiveResult.reasoning} (conflict with predictive)`
      };
    }

    return {
      ...predictiveResult,
      confidence: weightedConfidence * 0.8,
      reasoning: `Predictive preference: ${predictiveResult.reasoning} (conflict with reactive)`
    };
  }

  /**
   * Calculate trend using linear regression
   */
  calculateTrend(metrics) {
    const n = metrics.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

    const x = metrics.map((_, i) => i);
    const y = metrics.map(m => m.utilization);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R² for confidence
    const meanY = sumY / n;
    const ssTotal = y.reduce((total, yi) => total + Math.pow(yi - meanY, 2), 0);
    const ssResidual = y.reduce((total, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return total + Math.pow(yi - predicted, 2);
    }, 0);
    const r2 = 1 - (ssResidual / ssTotal);

    return { slope, intercept, r2: Math.max(0, Math.min(1, r2)) };
  }

  /**
   * Forecast future demand based on trend
   */
  forecastDemand(trend, forecastWindow) {
    const currentMetrics = this.getCurrentMetrics();
    const latestUtilization = currentMetrics[currentMetrics.length - 1].utilization;

    const predictedUtilization = Math.max(0, Math.min(1,
      latestUtilization + (trend.slope * forecastWindow / 60) // Convert to per-minute
    ));

    // Calculate confidence based on trend strength and data quality
    const confidence = Math.sqrt(trend.r2) * 0.8 + 0.2;

    return {
      utilization: predictedUtilization,
      confidence,
      trend: trend.slope
    };
  }

  /**
   * Update internal metrics storage
   */
  updateMetrics(metrics) {
    const timestamp = Date.now();

    // Store metrics with timestamp
    this.metrics.set(timestamp, {
      timestamp,
      ...metrics,
      utilization: this.calculateUtilization(metrics)
    });

    // Keep only recent metrics based on lookback window
    const cutoffTime = timestamp - (this.config.predictive.lookbackWindow * 1000);
    for (const [key] of this.metrics) {
      if (key < cutoffTime) {
        this.metrics.delete(key);
      }
    }
  }

  /**
   * Calculate overall utilization from metrics
   */
  calculateUtilization(metrics) {
    if (!metrics) return 0;

    const weights = {
      cpu: 0.3,
      memory: 0.2,
      taskQueue: 0.3,
      responseTime: 0.2
    };

    const utilization = {
      cpu: Math.min(1, metrics.cpu || 0),
      memory: Math.min(1, metrics.memory || 0),
      taskQueue: Math.min(1, metrics.taskQueue / 10 || 0), // Normalize by expected queue size
      responseTime: Math.min(1, metrics.responseTime / 1000 || 0) // Normalize by 1s
    };

    return Object.keys(weights).reduce((total, key) =>
      total + (utilization[key] * weights[key]), 0);
  }

  /**
   * Get current metrics sorted by timestamp
   */
  getCurrentMetrics() {
    return Array.from(this.metrics.values())
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Create scaling decision object
   */
  createDecision(action, confidence, reasoning) {
    this.lastDecision = {
      action,
      confidence,
      reasoning,
      timestamp: Date.now(),
      algorithm: this.type
    };
    return this.lastDecision;
  }

  /**
   * Get algorithm statistics
   */
  getStats() {
    return {
      type: this.type,
      config: this.config,
      lastDecision: this.lastDecision,
      metricsCount: this.metrics.size,
      lastScaleTime: this.lastScaleTime
    };
  }
}

export default ScalingAlgorithm;