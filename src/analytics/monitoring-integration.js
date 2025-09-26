/**
 * Monitoring System Integration for Claude Flow Analytics
 * Integrates with existing monitoring and adds improvement tracking
 */

import fs from 'fs-extra';
import path from 'path';
import { EventEmitter } from 'events';

export class MonitoringIntegration extends EventEmitter {
  constructor(analyzer, optimizationEngine, suggestionGenerator) {
    super();

    this.analyzer = analyzer;
    this.optimizationEngine = optimizationEngine;
    this.suggestionGenerator = suggestionGenerator;

    this.metricsPath = '.claude-flow/metrics';
    this.improvementPath = '.claude-flow/improvements';
    this.alertsPath = '.claude-flow/alerts';

    this.monitoringInterval = 60000; // 1 minute
    this.alertThresholds = this.initializeAlertThresholds();
    this.improvementMetrics = new Map();
    this.isMonitoring = false;
  }

  /**
   * Initialize alert thresholds
   */
  initializeAlertThresholds() {
    return {
      memory: {
        warning: 75,
        critical: 90,
      },
      cpu: {
        warning: 2.0,
        critical: 4.0,
      },
      taskFailureRate: {
        warning: 20,
        critical: 40,
      },
      agentPerformance: {
        warning: 0.6,
        critical: 0.4,
      },
      consensusScore: {
        warning: 0.5,
        critical: 0.3,
      },
    };
  }

  /**
   * Start monitoring integration
   */
  async startMonitoring() {
    if (this.isMonitoring) {
      return { message: 'Monitoring already active' };
    }

    try {
      await this.initializeMonitoring();
      this.isMonitoring = true;

      // Start monitoring loops
      this.startPerformanceMonitoring();
      this.startImprovementTracking();
      this.startAlertProcessing();

      console.log('📊 Analytics monitoring started');
      this.emit('monitoring:started');

      return { success: true, message: 'Monitoring integration started successfully' };
    } catch (error) {
      console.error('Failed to start monitoring:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop monitoring integration
   */
  async stopMonitoring() {
    if (!this.isMonitoring) {
      return { message: 'Monitoring not active' };
    }

    this.isMonitoring = false;

    // Clear intervals
    if (this.performanceInterval) clearInterval(this.performanceInterval);
    if (this.improvementInterval) clearInterval(this.improvementInterval);
    if (this.alertInterval) clearInterval(this.alertInterval);

    console.log('📊 Analytics monitoring stopped');
    this.emit('monitoring:stopped');

    return { success: true, message: 'Monitoring integration stopped successfully' };
  }

  /**
   * Initialize monitoring directories and baseline metrics
   */
  async initializeMonitoring() {
    await fs.ensureDir(this.metricsPath);
    await fs.ensureDir(this.improvementPath);
    await fs.ensureDir(this.alertsPath);

    // Initialize baseline metrics
    await this.captureBaselineMetrics();

    // Load existing improvement metrics
    await this.loadImprovementMetrics();
  }

  /**
   * Start performance monitoring loop
   */
  startPerformanceMonitoring() {
    this.performanceInterval = setInterval(async () => {
      try {
        await this.capturePerformanceSnapshot();
        await this.analyzePerformanceTrends();
        await this.checkPerformanceAlerts();
      } catch (error) {
        console.error('Performance monitoring error:', error.message);
      }
    }, this.monitoringInterval);
  }

  /**
   * Start improvement tracking loop
   */
  startImprovementTracking() {
    this.improvementInterval = setInterval(async () => {
      try {
        await this.trackImprovements();
        await this.updateImprovementMetrics();
        await this.generateImprovementReport();
      } catch (error) {
        console.error('Improvement tracking error:', error.message);
      }
    }, this.monitoringInterval * 5); // Every 5 minutes
  }

  /**
   * Start alert processing loop
   */
  startAlertProcessing() {
    this.alertInterval = setInterval(async () => {
      try {
        await this.processAlerts();
        await this.evaluateOptimizationOpportunities();
        await this.triggerAutomatedActions();
      } catch (error) {
        console.error('Alert processing error:', error.message);
      }
    }, this.monitoringInterval * 2); // Every 2 minutes
  }

  /**
   * Capture baseline metrics for comparison
   */
  async captureBaselineMetrics() {
    try {
      await this.analyzer.initialize();
      const report = await this.analyzer.generateComprehensiveReport();

      const baseline = {
        timestamp: new Date().toISOString(),
        system: this.extractSystemBaseline(report.analysis.performance),
        tasks: this.extractTaskBaseline(report.analysis.taskPatterns),
        agents: this.extractAgentBaseline(report.analysis.taskPatterns),
        coordination: this.extractCoordinationBaseline(report.analysis.coordinationPatterns),
        memory: this.extractMemoryBaseline(report.analysis.memoryPatterns),
      };

      await fs.writeJson(path.join(this.metricsPath, 'baseline.json'), baseline, { spaces: 2 });
      return baseline;
    } catch (error) {
      console.warn('Failed to capture baseline metrics:', error.message);
      return null;
    }
  }

  /**
   * Capture performance snapshot
   */
  async capturePerformanceSnapshot() {
    const snapshot = {
      timestamp: new Date().toISOString(),
      metrics: await this.collectCurrentMetrics(),
      trends: await this.calculateTrends(),
      alerts: await this.generateCurrentAlerts(),
    };

    const snapshotPath = path.join(this.metricsPath, `snapshot-${Date.now()}.json`);

    await fs.writeJson(snapshotPath, snapshot, { spaces: 2 });

    // Emit snapshot event
    this.emit('snapshot:captured', snapshot);

    return snapshot;
  }

  /**
   * Collect current metrics
   */
  async collectCurrentMetrics() {
    try {
      const report = await this.analyzer.generateComprehensiveReport();

      return {
        system: {
          memory: this.extractCurrentMemoryMetrics(report.analysis.performance),
          cpu: this.extractCurrentCPUMetrics(report.analysis.performance),
          efficiency: this.extractCurrentEfficiencyMetrics(report.analysis.performance),
        },
        tasks: {
          total: this.extractCurrentTaskCount(report.analysis.taskPatterns),
          successRate: this.extractCurrentSuccessRate(report.analysis.taskPatterns),
          avgDuration: this.extractCurrentAvgDuration(report.analysis.taskPatterns),
        },
        agents: {
          total: this.extractCurrentAgentCount(report.analysis.taskPatterns),
          active: this.extractCurrentActiveAgents(report.analysis.taskPatterns),
          avgPerformance: this.extractCurrentAvgPerformance(report.analysis.taskPatterns),
        },
      };
    } catch (error) {
      console.warn('Failed to collect current metrics:', error.message);
      return {};
    }
  }

  /**
   * Analyze performance trends
   */
  async analyzePerformanceTrends() {
    try {
      // Load recent snapshots
      const snapshots = await this.loadRecentSnapshots(10);

      if (snapshots.length < 2) {
        return { message: 'Insufficient data for trend analysis' };
      }

      const trends = {
        memory: this.calculateMetricTrend(snapshots, 'metrics.system.memory.usage'),
        cpu: this.calculateMetricTrend(snapshots, 'metrics.system.cpu.load'),
        successRate: this.calculateMetricTrend(snapshots, 'metrics.tasks.successRate'),
        agentPerformance: this.calculateMetricTrend(snapshots, 'metrics.agents.avgPerformance'),
      };

      // Store trends
      await fs.writeJson(
        path.join(this.metricsPath, 'trends.json'),
        { timestamp: new Date().toISOString(), trends },
        { spaces: 2 },
      );

      // Emit trends event
      this.emit('trends:updated', trends);

      return trends;
    } catch (error) {
      console.warn('Failed to analyze performance trends:', error.message);
      return {};
    }
  }

  /**
   * Check performance alerts
   */
  async checkPerformanceAlerts() {
    const currentMetrics = await this.collectCurrentMetrics();
    const alerts = [];

    // Memory alerts
    if (currentMetrics.system?.memory?.usage) {
      const memUsage = currentMetrics.system.memory.usage;
      if (memUsage >= this.alertThresholds.memory.critical) {
        alerts.push({
          type: 'memory',
          severity: 'critical',
          message: `Critical memory usage: ${memUsage.toFixed(1)}%`,
          threshold: this.alertThresholds.memory.critical,
          value: memUsage,
          timestamp: new Date().toISOString(),
        });
      } else if (memUsage >= this.alertThresholds.memory.warning) {
        alerts.push({
          type: 'memory',
          severity: 'warning',
          message: `High memory usage: ${memUsage.toFixed(1)}%`,
          threshold: this.alertThresholds.memory.warning,
          value: memUsage,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // CPU alerts
    if (currentMetrics.system?.cpu?.load) {
      const cpuLoad = currentMetrics.system.cpu.load;
      if (cpuLoad >= this.alertThresholds.cpu.critical) {
        alerts.push({
          type: 'cpu',
          severity: 'critical',
          message: `Critical CPU load: ${cpuLoad.toFixed(2)}`,
          threshold: this.alertThresholds.cpu.critical,
          value: cpuLoad,
          timestamp: new Date().toISOString(),
        });
      } else if (cpuLoad >= this.alertThresholds.cpu.warning) {
        alerts.push({
          type: 'cpu',
          severity: 'warning',
          message: `High CPU load: ${cpuLoad.toFixed(2)}`,
          threshold: this.alertThresholds.cpu.warning,
          value: cpuLoad,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Task failure rate alerts
    if (currentMetrics.tasks?.successRate !== undefined) {
      const failureRate = 100 - currentMetrics.tasks.successRate;
      if (failureRate >= this.alertThresholds.taskFailureRate.critical) {
        alerts.push({
          type: 'task_failure',
          severity: 'critical',
          message: `Critical task failure rate: ${failureRate.toFixed(1)}%`,
          threshold: this.alertThresholds.taskFailureRate.critical,
          value: failureRate,
          timestamp: new Date().toISOString(),
        });
      } else if (failureRate >= this.alertThresholds.taskFailureRate.warning) {
        alerts.push({
          type: 'task_failure',
          severity: 'warning',
          message: `High task failure rate: ${failureRate.toFixed(1)}%`,
          threshold: this.alertThresholds.taskFailureRate.warning,
          value: failureRate,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Store alerts if any
    if (alerts.length > 0) {
      await this.storeAlerts(alerts);
      this.emit('alerts:triggered', alerts);
    }

    return alerts;
  }

  /**
   * Track improvements over time
   */
  async trackImprovements() {
    try {
      const currentMetrics = await this.collectCurrentMetrics();
      const baseline = await this.loadBaseline();

      if (!baseline) {
        console.warn('No baseline metrics available for improvement tracking');
        return;
      }

      const improvements = this.calculateImprovements(currentMetrics, baseline);

      // Update improvement metrics
      const timestamp = new Date().toISOString();
      this.improvementMetrics.set(timestamp, improvements);

      // Store improvements
      await this.storeImprovements(improvements);

      // Emit improvements event
      this.emit('improvements:tracked', improvements);

      return improvements;
    } catch (error) {
      console.warn('Failed to track improvements:', error.message);
      return {};
    }
  }

  /**
   * Calculate improvements compared to baseline
   */
  calculateImprovements(current, baseline) {
    const improvements = {
      timestamp: new Date().toISOString(),
      metrics: {},
    };

    // System improvements
    if (current.system && baseline.system) {
      improvements.metrics.memory_efficiency = this.calculateMetricImprovement(
        current.system.memory?.efficiency,
        baseline.system.memory?.efficiency,
        'higher_better',
      );

      improvements.metrics.cpu_efficiency = this.calculateMetricImprovement(
        current.system.cpu?.load,
        baseline.system.cpu?.load,
        'lower_better',
      );
    }

    // Task improvements
    if (current.tasks && baseline.tasks) {
      improvements.metrics.success_rate = this.calculateMetricImprovement(
        current.tasks.successRate,
        baseline.tasks.successRate,
        'higher_better',
      );

      improvements.metrics.avg_duration = this.calculateMetricImprovement(
        current.tasks.avgDuration,
        baseline.tasks.avgDuration,
        'lower_better',
      );
    }

    // Agent improvements
    if (current.agents && baseline.agents) {
      improvements.metrics.agent_performance = this.calculateMetricImprovement(
        current.agents.avgPerformance,
        baseline.agents.avgPerformance,
        'higher_better',
      );
    }

    // Calculate overall improvement score
    const validImprovements = Object.values(improvements.metrics).filter(
      (imp) => imp.improvement_percentage !== null,
    );

    improvements.overall_score =
      validImprovements.length > 0
        ? validImprovements.reduce((sum, imp) => sum + imp.improvement_percentage, 0) /
          validImprovements.length
        : 0;

    return improvements;
  }

  /**
   * Calculate improvement for a specific metric
   */
  calculateMetricImprovement(currentValue, baselineValue, direction) {
    if (currentValue === undefined || baselineValue === undefined) {
      return {
        current: null,
        baseline: null,
        improvement_percentage: null,
        direction: direction,
      };
    }

    const change = currentValue - baselineValue;
    const percentageChange = baselineValue !== 0 ? (change / Math.abs(baselineValue)) * 100 : 0;

    const improvementPercentage =
      direction === 'higher_better' ? percentageChange : -percentageChange;

    return {
      current: currentValue,
      baseline: baselineValue,
      change: change,
      improvement_percentage: improvementPercentage,
      direction: direction,
      is_improvement: improvementPercentage > 0,
    };
  }

  /**
   * Generate improvement report
   */
  async generateImprovementReport() {
    try {
      const improvements = await this.loadRecentImprovements(30); // Last 30 entries

      const report = {
        timestamp: new Date().toISOString(),
        period: '30 data points',
        summary: this.summarizeImprovements(improvements),
        trends: this.analyzeImprovementTrends(improvements),
        recommendations: await this.generateImprovementRecommendations(improvements),
      };

      await fs.writeJson(path.join(this.improvementPath, `report-${Date.now()}.json`), report, {
        spaces: 2,
      });

      this.emit('improvement:report_generated', report);

      return report;
    } catch (error) {
      console.warn('Failed to generate improvement report:', error.message);
      return null;
    }
  }

  /**
   * Process alerts and trigger actions
   */
  async processAlerts() {
    try {
      const recentAlerts = await this.loadRecentAlerts(100);
      const activeAlerts = recentAlerts.filter(
        (alert) => new Date(alert.timestamp) > new Date(Date.now() - 3600000), // Last hour
      );

      if (activeAlerts.length === 0) {
        return { message: 'No active alerts to process' };
      }

      // Group alerts by type and severity
      const alertGroups = this.groupAlerts(activeAlerts);

      // Process each alert group
      for (const [type, alerts] of Object.entries(alertGroups)) {
        await this.processAlertGroup(type, alerts);
      }

      return { processed: activeAlerts.length };
    } catch (error) {
      console.warn('Failed to process alerts:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Evaluate optimization opportunities
   */
  async evaluateOptimizationOpportunities() {
    try {
      const optimizations = await this.optimizationEngine.generateOptimizationSuggestions();

      // Filter high-impact, low-effort optimizations for automation
      const automationCandidates = optimizations.priority.high.filter(
        (opt) => opt.impact === 'high' && opt.effort === 'low',
      );

      if (automationCandidates.length > 0) {
        await this.evaluateAutomationCandidates(automationCandidates);
      }

      return { candidates: automationCandidates.length };
    } catch (error) {
      console.warn('Failed to evaluate optimization opportunities:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Trigger automated actions based on conditions
   */
  async triggerAutomatedActions() {
    try {
      const conditions = await this.evaluateAutomationConditions();
      const actions = [];

      for (const condition of conditions) {
        if (condition.shouldTrigger) {
          const result = await this.executeAutomatedAction(condition.action);
          actions.push({ condition: condition.name, result });
        }
      }

      if (actions.length > 0) {
        this.emit('automated:actions_triggered', actions);
      }

      return { actions: actions.length };
    } catch (error) {
      console.warn('Failed to trigger automated actions:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Helper methods
   */
  async loadBaseline() {
    try {
      const baselinePath = path.join(this.metricsPath, 'baseline.json');
      if (await fs.pathExists(baselinePath)) {
        return await fs.readJson(baselinePath);
      }
    } catch (error) {
      console.warn('Failed to load baseline:', error.message);
    }
    return null;
  }

  async loadRecentSnapshots(count) {
    try {
      const files = await fs.readdir(this.metricsPath);
      const snapshotFiles = files
        .filter((file) => file.startsWith('snapshot-'))
        .sort()
        .slice(-count);

      const snapshots = [];
      for (const file of snapshotFiles) {
        try {
          const snapshot = await fs.readJson(path.join(this.metricsPath, file));
          snapshots.push(snapshot);
        } catch (error) {
          console.warn(`Failed to read snapshot ${file}:`, error.message);
        }
      }

      return snapshots;
    } catch (error) {
      console.warn('Failed to load recent snapshots:', error.message);
      return [];
    }
  }

  async storeAlerts(alerts) {
    const alertsFile = path.join(this.alertsPath, `alerts-${Date.now()}.json`);
    await fs.writeJson(alertsFile, { timestamp: new Date().toISOString(), alerts }, { spaces: 2 });
  }

  async storeImprovements(improvements) {
    const improvementsFile = path.join(this.improvementPath, `improvements-${Date.now()}.json`);
    await fs.writeJson(improvementsFile, improvements, { spaces: 2 });
  }

  calculateMetricTrend(snapshots, metricPath) {
    const values = snapshots
      .map((snapshot) => this.getNestedValue(snapshot, metricPath))
      .filter((v) => v !== undefined);

    if (values.length < 2) return { trend: 'insufficient_data' };

    const recent = values.slice(-3).reduce((sum, v) => sum + v, 0) / Math.min(3, values.length);
    const older =
      values.slice(0, -3).reduce((sum, v) => sum + v, 0) / Math.max(1, values.length - 3);

    const change = recent - older;
    const percentChange = older !== 0 ? (change / Math.abs(older)) * 100 : 0;

    return {
      trend: percentChange > 5 ? 'increasing' : percentChange < -5 ? 'decreasing' : 'stable',
      change: change,
      percent_change: percentChange,
      current: recent,
      previous: older,
    };
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Extract metric methods
  extractSystemBaseline(performance) {
    if (!performance?.resourceAnalysis) return {};

    return {
      memory: {
        usage: performance.resourceAnalysis.memory?.average || 0,
        efficiency: performance.resourceAnalysis.efficiency?.average || 0,
      },
      cpu: {
        load: performance.resourceAnalysis.cpu?.average || 0,
      },
    };
  }

  extractTaskBaseline(taskPatterns) {
    if (!taskPatterns?.statusAnalysis) return {};

    const total = taskPatterns.statusAnalysis.reduce((sum, s) => sum + s.count, 0);
    const completed = taskPatterns.statusAnalysis.find((s) => s.status === 'completed')?.count || 0;

    return {
      total: total,
      successRate: total > 0 ? (completed / total) * 100 : 0,
      avgDuration:
        taskPatterns.statusAnalysis.find((s) => s.status === 'completed')?.avg_duration || 0,
    };
  }

  extractAgentBaseline(taskPatterns) {
    if (!taskPatterns?.agentPerformance) return {};

    return {
      total: taskPatterns.agentPerformance.length,
      avgPerformance:
        taskPatterns.agentPerformance.reduce((sum, a) => sum + a.performance_score, 0) /
        taskPatterns.agentPerformance.length,
    };
  }

  extractCoordinationBaseline(coordinationPatterns) {
    if (!coordinationPatterns?.consensusAnalysis) return {};

    return {
      consensusScore:
        coordinationPatterns.consensusAnalysis.reduce((sum, c) => sum + c.avg_vote, 0) /
        coordinationPatterns.consensusAnalysis.length,
    };
  }

  extractMemoryBaseline(memoryPatterns) {
    if (!memoryPatterns?.efficiencyAnalysis) return {};

    return {
      totalEntries: memoryPatterns.efficiencyAnalysis.reduce((sum, e) => sum + e.entry_count, 0),
      totalSize: memoryPatterns.efficiencyAnalysis.reduce((sum, e) => sum + e.total_size, 0),
    };
  }

  // Current metric extraction methods (simplified)
  extractCurrentMemoryMetrics(performance) {
    if (!performance?.resourceAnalysis?.memory) return {};
    return { usage: performance.resourceAnalysis.memory.average };
  }

  extractCurrentCPUMetrics(performance) {
    if (!performance?.resourceAnalysis?.cpu) return {};
    return { load: performance.resourceAnalysis.cpu.average };
  }

  extractCurrentEfficiencyMetrics(performance) {
    if (!performance?.resourceAnalysis?.efficiency) return {};
    return { efficiency: performance.resourceAnalysis.efficiency.average };
  }

  extractCurrentTaskCount(taskPatterns) {
    if (!taskPatterns?.statusAnalysis) return 0;
    return taskPatterns.statusAnalysis.reduce((sum, s) => sum + s.count, 0);
  }

  extractCurrentSuccessRate(taskPatterns) {
    if (!taskPatterns?.statusAnalysis) return 0;
    const total = taskPatterns.statusAnalysis.reduce((sum, s) => sum + s.count, 0);
    const completed = taskPatterns.statusAnalysis.find((s) => s.status === 'completed')?.count || 0;
    return total > 0 ? (completed / total) * 100 : 0;
  }

  extractCurrentAvgDuration(taskPatterns) {
    if (!taskPatterns?.statusAnalysis) return 0;
    return taskPatterns.statusAnalysis.find((s) => s.status === 'completed')?.avg_duration || 0;
  }

  extractCurrentAgentCount(taskPatterns) {
    return taskPatterns?.agentPerformance?.length || 0;
  }

  extractCurrentActiveAgents(taskPatterns) {
    if (!taskPatterns?.agentPerformance) return 0;
    return taskPatterns.agentPerformance.filter((a) => a.recent_tasks > 0).length;
  }

  extractCurrentAvgPerformance(taskPatterns) {
    if (!taskPatterns?.agentPerformance) return 0;
    return (
      taskPatterns.agentPerformance.reduce((sum, a) => sum + a.performance_score, 0) /
      taskPatterns.agentPerformance.length
    );
  }

  // Additional helper methods would be implemented here...
  async loadImprovementMetrics() {
    // Implementation for loading existing improvement metrics
  }

  async loadRecentImprovements(count) {
    // Implementation for loading recent improvements
    return [];
  }

  async loadRecentAlerts(count) {
    // Implementation for loading recent alerts
    return [];
  }

  summarizeImprovements(improvements) {
    // Implementation for summarizing improvements
    return {};
  }

  analyzeImprovementTrends(improvements) {
    // Implementation for analyzing improvement trends
    return {};
  }

  async generateImprovementRecommendations(improvements) {
    // Implementation for generating recommendations based on improvements
    return [];
  }

  groupAlerts(alerts) {
    // Implementation for grouping alerts
    return {};
  }

  async processAlertGroup(type, alerts) {
    // Implementation for processing alert groups
  }

  async evaluateAutomationCandidates(candidates) {
    // Implementation for evaluating automation candidates
  }

  async evaluateAutomationConditions() {
    // Implementation for evaluating automation conditions
    return [];
  }

  async executeAutomatedAction(action) {
    // Implementation for executing automated actions
    return { success: true };
  }

  async generateCurrentAlerts() {
    // Implementation for generating current alerts
    return [];
  }

  async calculateTrends() {
    // Implementation for calculating trends
    return {};
  }
}

export default MonitoringIntegration;
