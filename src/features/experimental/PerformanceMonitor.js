/**
 * Performance Monitor for Experimental Features
 * Checkpoint 1.4 - Safety and Performance Tracking
 */

export class PerformanceMonitor {
  constructor() {
    this.monitoredFeatures = new Map();
    this.performanceData = new Map();
    this.thresholds = this.getDefaultThresholds();
    this.alertHandlers = new Set();
    this.isInitialized = false;
  }

  /**
   * Initialize performance monitoring
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    // Set up performance observers
    if (typeof PerformanceObserver !== 'undefined') {
      this.setupPerformanceObservers();
    }

    // Start monitoring interval
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000); // Collect metrics every 5 seconds

    this.isInitialized = true;
    console.log('[PerformanceMonitor] Initialized successfully');
  }

  /**
   * Get default performance thresholds
   */
  getDefaultThresholds() {
    return {
      // CPU thresholds (percentage)
      cpu: {
        warning: 70,
        critical: 85
      },
      // Memory thresholds (percentage)
      memory: {
        warning: 75,
        critical: 90
      },
      // Response time thresholds (milliseconds)
      responseTime: {
        warning: 1000,
        critical: 5000
      },
      // Error rate thresholds (percentage)
      errorRate: {
        warning: 5,
        critical: 15
      },
      // Task completion time thresholds (milliseconds)
      taskDuration: {
        warning: 30000,  // 30 seconds
        critical: 120000 // 2 minutes
      }
    };
  }

  /**
   * Start monitoring a specific experimental feature
   */
  async startMonitoring(featureName, options = {}) {
    const monitoringConfig = {
      featureName,
      startTime: Date.now(),
      stability: options.stability || 'alpha',
      category: options.category || 'unknown',
      metrics: {
        cpuUsage: [],
        memoryUsage: [],
        taskDurations: [],
        errorCounts: [],
        responsesTimes: []
      },
      alerts: [],
      status: 'active'
    };

    this.monitoredFeatures.set(featureName, monitoringConfig);

    // Set feature-specific thresholds based on stability
    this.setFeatureThresholds(featureName, options.stability);

    console.log(`[PerformanceMonitor] Started monitoring feature: ${featureName}`);
    return monitoringConfig;
  }

  /**
   * Stop monitoring a feature
   */
  async stopMonitoring(featureName) {
    const config = this.monitoredFeatures.get(featureName);
    if (!config) {
      return false;
    }

    config.status = 'stopped';
    config.endTime = Date.now();
    config.totalDuration = config.endTime - config.startTime;

    // Generate final report
    const finalReport = this.generatePerformanceReport(featureName);

    // Move to historical data
    this.performanceData.set(`${featureName}_${config.startTime}`, config);
    this.monitoredFeatures.delete(featureName);

    console.log(`[PerformanceMonitor] Stopped monitoring feature: ${featureName}`);
    return finalReport;
  }

  /**
   * Set feature-specific thresholds based on stability level
   */
  setFeatureThresholds(featureName, stability) {
    const baseThresholds = this.thresholds;
    let adjustmentFactor;

    switch (stability) {
      case 'stable':
        adjustmentFactor = 1.0;
        break;
      case 'beta':
        adjustmentFactor = 0.9; // Slightly more strict
        break;
      case 'alpha':
        adjustmentFactor = 0.8; // More strict
        break;
      case 'research':
        adjustmentFactor = 0.7; // Most strict
        break;
      default:
        adjustmentFactor = 0.8;
    }

    const featureThresholds = {};
    for (const [metric, thresholds] of Object.entries(baseThresholds)) {
      featureThresholds[metric] = {
        warning: Math.round(thresholds.warning * adjustmentFactor),
        critical: Math.round(thresholds.critical * adjustmentFactor)
      };
    }

    this.thresholds[featureName] = featureThresholds;
  }

  /**
   * Record performance metric for a feature
   */
  recordMetric(featureName, metricType, value, metadata = {}) {
    const config = this.monitoredFeatures.get(featureName);
    if (!config) {
      return; // Feature not being monitored
    }

    const timestamp = Date.now();
    const metric = {
      value,
      timestamp,
      ...metadata
    };

    // Store metric
    if (!config.metrics[metricType]) {
      config.metrics[metricType] = [];
    }
    config.metrics[metricType].push(metric);

    // Check thresholds
    this.checkThresholds(featureName, metricType, value);

    // Limit metric history to prevent memory bloat
    const maxHistorySize = 1000;
    if (config.metrics[metricType].length > maxHistorySize) {
      config.metrics[metricType] = config.metrics[metricType].slice(-maxHistorySize);
    }
  }

  /**
   * Check if metric value exceeds thresholds
   */
  checkThresholds(featureName, metricType, value) {
    const featureThresholds = this.thresholds[featureName] || this.thresholds;
    const thresholds = featureThresholds[metricType];

    if (!thresholds) {
      return;
    }

    let severity = null;
    if (value >= thresholds.critical) {
      severity = 'critical';
    } else if (value >= thresholds.warning) {
      severity = 'warning';
    }

    if (severity) {
      this.handleThresholdExceeded(featureName, metricType, value, severity, thresholds);
    }
  }

  /**
   * Handle threshold exceeded event
   */
  handleThresholdExceeded(featureName, metricType, value, severity, thresholds) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      feature: featureName,
      metric: metricType,
      value,
      severity,
      threshold: severity === 'critical' ? thresholds.critical : thresholds.warning,
      message: `${metricType} for ${featureName} exceeded ${severity} threshold: ${value} (threshold: ${thresholds[severity]})`
    };

    // Store alert
    const config = this.monitoredFeatures.get(featureName);
    if (config) {
      config.alerts.push(alert);
    }

    // Emit event to alert handlers
    this.emitAlert(alert);

    console.warn(`[PerformanceMonitor] Alert: ${alert.message}`);
  }

  /**
   * Emit alert to registered handlers
   */
  emitAlert(alert) {
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        console.error('[PerformanceMonitor] Alert handler error:', error);
      }
    }
  }

  /**
   * Add alert handler
   */
  addAlertHandler(handler) {
    this.alertHandlers.add(handler);
  }

  /**
   * Remove alert handler
   */
  removeAlertHandler(handler) {
    this.alertHandlers.delete(handler);
  }

  /**
   * Collect system-wide metrics
   */
  collectSystemMetrics() {
    try {
      // CPU Usage (mock implementation - would use actual system APIs)
      const cpuUsage = this.getCPUUsage();

      // Memory Usage
      const memoryUsage = this.getMemoryUsage();

      // Record metrics for all monitored features
      for (const featureName of this.monitoredFeatures.keys()) {
        this.recordMetric(featureName, 'cpuUsage', cpuUsage);
        this.recordMetric(featureName, 'memoryUsage', memoryUsage);
      }

    } catch (error) {
      console.error('[PerformanceMonitor] Error collecting system metrics:', error);
    }
  }

  /**
   * Get CPU usage (mock implementation)
   */
  getCPUUsage() {
    // In real implementation, would use system APIs or Node.js process metrics
    // This is a mock that simulates CPU usage patterns
    return Math.random() * 100;
  }

  /**
   * Get memory usage
   */
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      const totalHeap = usage.heapTotal;
      const usedHeap = usage.heapUsed;
      return (usedHeap / totalHeap) * 100;
    }

    // Browser environment
    if (typeof performance !== 'undefined' && performance.memory) {
      return (performance.memory.usedJSHeapSize / performance.memory.totalJSHeapSize) * 100;
    }

    // Fallback mock
    return Math.random() * 100;
  }

  /**
   * Setup performance observers for browser environment
   */
  setupPerformanceObservers() {
    try {
      // Observe navigation timing
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordNavigationMetrics(entry);
        }
      });
      navObserver.observe({ entryTypes: ['navigation'] });

      // Observe resource timing
      const resourceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordResourceMetrics(entry);
        }
      });
      resourceObserver.observe({ entryTypes: ['resource'] });

    } catch (error) {
      console.warn('[PerformanceMonitor] Performance observers not available:', error.message);
    }
  }

  /**
   * Record navigation metrics
   */
  recordNavigationMetrics(entry) {
    const responseTime = entry.responseEnd - entry.responseStart;

    // Record for all monitored features
    for (const featureName of this.monitoredFeatures.keys()) {
      this.recordMetric(featureName, 'responseTime', responseTime, {
        type: 'navigation',
        name: entry.name
      });
    }
  }

  /**
   * Record resource metrics
   */
  recordResourceMetrics(entry) {
    const loadTime = entry.responseEnd - entry.startTime;

    // Record for all monitored features
    for (const featureName of this.monitoredFeatures.keys()) {
      this.recordMetric(featureName, 'resourceLoadTime', loadTime, {
        type: 'resource',
        name: entry.name
      });
    }
  }

  /**
   * Generate performance report for a feature
   */
  generatePerformanceReport(featureName) {
    const config = this.monitoredFeatures.get(featureName);
    if (!config) {
      return null;
    }

    const report = {
      featureName,
      stability: config.stability,
      category: config.category,
      monitoringDuration: Date.now() - config.startTime,
      status: config.status,
      summary: this.calculateMetricsSummary(config.metrics),
      alerts: config.alerts,
      recommendations: this.generateRecommendations(config)
    };

    return report;
  }

  /**
   * Calculate metrics summary
   */
  calculateMetricsSummary(metrics) {
    const summary = {};

    for (const [metricType, values] of Object.entries(metrics)) {
      if (values.length === 0) {
        continue;
      }

      const numericValues = values.map(m => m.value).filter(v => typeof v === 'number');

      if (numericValues.length > 0) {
        summary[metricType] = {
          count: numericValues.length,
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          average: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          latest: numericValues[numericValues.length - 1]
        };
      }
    }

    return summary;
  }

  /**
   * Generate recommendations based on performance data
   */
  generateRecommendations(config) {
    const recommendations = [];

    // High CPU usage recommendation
    const cpuMetrics = config.metrics.cpuUsage || [];
    if (cpuMetrics.length > 0) {
      const avgCpu = cpuMetrics.reduce((a, b) => a + b.value, 0) / cpuMetrics.length;
      if (avgCpu > 70) {
        recommendations.push({
          type: 'performance',
          severity: 'warning',
          message: 'High CPU usage detected. Consider optimizing algorithms or reducing feature complexity.',
          metric: 'cpu',
          value: avgCpu
        });
      }
    }

    // High memory usage recommendation
    const memoryMetrics = config.metrics.memoryUsage || [];
    if (memoryMetrics.length > 0) {
      const avgMemory = memoryMetrics.reduce((a, b) => a + b.value, 0) / memoryMetrics.length;
      if (avgMemory > 80) {
        recommendations.push({
          type: 'memory',
          severity: 'warning',
          message: 'High memory usage detected. Consider implementing memory cleanup or reducing data structures.',
          metric: 'memory',
          value: avgMemory
        });
      }
    }

    // Too many alerts recommendation
    if (config.alerts.length > 10) {
      recommendations.push({
        type: 'stability',
        severity: 'critical',
        message: 'Multiple performance alerts detected. Consider disabling this experimental feature.',
        metric: 'alerts',
        value: config.alerts.length
      });
    }

    return recommendations;
  }

  /**
   * Get metrics for all monitored features
   */
  getMetrics() {
    const metrics = {};

    for (const [featureName, config] of this.monitoredFeatures.entries()) {
      metrics[featureName] = this.generatePerformanceReport(featureName);
    }

    return metrics;
  }

  /**
   * Get overall system health score
   */
  getSystemHealthScore() {
    const features = Array.from(this.monitoredFeatures.values());
    if (features.length === 0) {
      return { score: 100, status: 'excellent' };
    }

    let totalScore = 0;
    let criticalIssues = 0;
    let warnings = 0;

    for (const config of features) {
      let featureScore = 100;

      // Deduct points for alerts
      for (const alert of config.alerts) {
        if (alert.severity === 'critical') {
          featureScore -= 20;
          criticalIssues++;
        } else if (alert.severity === 'warning') {
          featureScore -= 5;
          warnings++;
        }
      }

      totalScore += Math.max(0, featureScore);
    }

    const averageScore = totalScore / features.length;
    let status = 'excellent';

    if (criticalIssues > 0) {
      status = 'critical';
    } else if (warnings > 2) {
      status = 'poor';
    } else if (averageScore < 80) {
      status = 'fair';
    } else if (averageScore < 95) {
      status = 'good';
    }

    return {
      score: Math.round(averageScore),
      status,
      criticalIssues,
      warnings,
      monitoredFeatures: features.length
    };
  }

  /**
   * Cleanup monitoring data
   */
  cleanup() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.monitoredFeatures.clear();
    this.alertHandlers.clear();
    this.isInitialized = false;

    console.log('[PerformanceMonitor] Cleanup completed');
  }

  /**
   * Emit performance issue event
   */
  emit(event, data) {
    // Simple event emitter implementation
    if (event === 'performanceIssue') {
      // Handle performance issue
      console.warn('[PerformanceMonitor] Performance issue:', data);
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (event === 'performanceIssue') {
      this.addAlertHandler(callback);
    }
  }
}