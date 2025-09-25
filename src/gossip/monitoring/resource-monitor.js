/**
 * Resource Monitoring System
 * Implements threshold-based alerts and resource tracking via gossip protocol
 */

const EventEmitter = require('events');
const os = require('os');

class ResourceMonitor extends EventEmitter {
  constructor(gossipCoordinator, options = {}) {
    super();
    this.gossip = gossipCoordinator;
    this.nodeId = gossipCoordinator.nodeId;

    // Monitoring configuration
    this.config = {
      monitoringInterval: options.monitoringInterval || 5000,
      alertThresholds: {
        memory: options.memoryThreshold || 80,
        cpu: options.cpuThreshold || 75,
        network: options.networkThreshold || 90,
        agents: options.agentThreshold || 50,
        ...options.alertThresholds
      },
      historySize: options.historySize || 100,
      alertCooldown: options.alertCooldown || 30000,
      ...options
    };

    // State tracking
    this.metrics = {
      memory: [],
      cpu: [],
      network: [],
      agents: [],
      custom: new Map()
    };

    this.alerts = {
      active: new Map(), // alertId -> AlertInfo
      history: [],
      lastAlert: new Map() // metric -> timestamp
    };

    this.isMonitoring = false;
    this.monitoringInterval = null;

    console.log(`📊 Resource Monitor initialized on node ${this.nodeId}`);
  }

  /**
   * Start resource monitoring
   */
  start() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoringInterval);

    this.emit('monitoringStarted', { nodeId: this.nodeId });
    console.log(`🔍 Resource monitoring started on node ${this.nodeId}`);
  }

  /**
   * Stop resource monitoring
   */
  stop() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('monitoringStopped', { nodeId: this.nodeId });
    console.log(`⏹️  Resource monitoring stopped on node ${this.nodeId}`);
  }

  /**
   * Collect system metrics
   */
  async collectMetrics() {
    const timestamp = Date.now();

    try {
      // Collect system metrics
      const memoryMetric = await this.getMemoryMetrics();
      const cpuMetric = await this.getCpuMetrics();
      const networkMetric = await this.getNetworkMetrics();
      const agentMetric = await this.getAgentMetrics();

      // Store metrics with timestamp
      this.addMetric('memory', { ...memoryMetric, timestamp });
      this.addMetric('cpu', { ...cpuMetric, timestamp });
      this.addMetric('network', { ...networkMetric, timestamp });
      this.addMetric('agents', { ...agentMetric, timestamp });

      // Check thresholds and generate alerts
      await this.checkThresholds({
        memory: memoryMetric,
        cpu: cpuMetric,
        network: networkMetric,
        agents: agentMetric,
        timestamp
      });

      // Emit metrics update
      this.emit('metricsCollected', {
        nodeId: this.nodeId,
        timestamp,
        metrics: { memoryMetric, cpuMetric, networkMetric, agentMetric }
      });

    } catch (error) {
      console.error(`❌ Error collecting metrics on node ${this.nodeId}:`, error.message);
      this.emit('metricsError', { nodeId: this.nodeId, error: error.message });
    }
  }

  /**
   * Get memory metrics
   */
  async getMemoryMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usage = (usedMem / totalMem) * 100;

    return {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usage: Math.round(usage * 100) / 100,
      unit: 'bytes'
    };
  }

  /**
   * Get CPU metrics
   */
  async getCpuMetrics() {
    const cpus = os.cpus();
    const loads = os.loadavg();

    // Calculate average CPU usage (simplified)
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      Object.values(cpu.times).forEach(time => totalTick += time);
      totalIdle += cpu.times.idle;
    });

    const usage = Math.max(0, Math.min(100, 100 - (totalIdle / totalTick) * 100));

    return {
      cores: cpus.length,
      loadAverage: loads,
      usage: Math.round(usage * 100) / 100,
      model: cpus[0]?.model || 'Unknown'
    };
  }

  /**
   * Get network metrics
   */
  async getNetworkMetrics() {
    const networkInterfaces = os.networkInterfaces();
    const activeInterfaces = Object.values(networkInterfaces)
      .flat()
      .filter(iface => !iface.internal && iface.family === 'IPv4');

    // Simulate network usage (in a real system, this would track bytes sent/received)
    const usage = Math.random() * 100;
    const latency = Math.random() * 50 + 10; // 10-60ms

    return {
      interfaces: activeInterfaces.length,
      usage: Math.round(usage * 100) / 100,
      latency: Math.round(latency * 100) / 100,
      connections: Math.floor(Math.random() * 20) + 1
    };
  }

  /**
   * Get agent metrics
   */
  async getAgentMetrics() {
    const gossipStatus = this.gossip.getStatus();
    const totalPeers = gossipStatus.peers;
    const activePeers = gossipStatus.activePeers || 0;

    // Simulate agent load
    const agentLoad = Math.random() * 100;
    const maxAgents = 20; // Configurable
    const currentAgents = Math.floor(Math.random() * maxAgents);

    return {
      total: totalPeers,
      active: activePeers,
      load: Math.round(agentLoad * 100) / 100,
      maxCapacity: maxAgents,
      currentAgents,
      utilization: Math.round((currentAgents / maxAgents) * 100 * 100) / 100
    };
  }

  /**
   * Add metric to history
   */
  addMetric(type, metric) {
    if (!this.metrics[type]) {
      this.metrics[type] = [];
    }

    this.metrics[type].push(metric);

    // Keep only recent history
    if (this.metrics[type].length > this.config.historySize) {
      this.metrics[type] = this.metrics[type].slice(-this.config.historySize);
    }
  }

  /**
   * Check thresholds and generate alerts
   */
  async checkThresholds(currentMetrics) {
    const { timestamp } = currentMetrics;
    const thresholds = this.config.alertThresholds;

    // Check each metric against its threshold
    for (const [metricType, threshold] of Object.entries(thresholds)) {
      const metric = currentMetrics[metricType];
      if (!metric) continue;

      const value = metric.usage !== undefined ? metric.usage : metric.utilization;
      if (value === undefined) continue;

      if (value > threshold) {
        await this.generateAlert(metricType, value, threshold, timestamp, metric);
      }
    }
  }

  /**
   * Generate and propagate alert
   */
  async generateAlert(metricType, value, threshold, timestamp, metricDetails) {
    const alertId = `${this.nodeId}-${metricType}-${timestamp}`;

    // Check alert cooldown
    const lastAlert = this.alerts.lastAlert.get(metricType);
    if (lastAlert && (timestamp - lastAlert) < this.config.alertCooldown) {
      return; // Skip alert due to cooldown
    }

    const alert = {
      id: alertId,
      nodeId: this.nodeId,
      type: metricType,
      value,
      threshold,
      timestamp,
      severity: this.calculateSeverity(value, threshold),
      details: metricDetails,
      status: 'active'
    };

    // Store alert locally
    this.alerts.active.set(alertId, alert);
    this.alerts.history.push({ ...alert });
    this.alerts.lastAlert.set(metricType, timestamp);

    // Propagate alert via gossip
    await this.gossip.spreadVerificationTask(alertId, {
      type: 'resource_alert',
      alert,
      nodeId: this.nodeId
    }, alert.severity);

    this.emit('alertGenerated', alert);
    console.warn(`🚨 Alert generated on node ${this.nodeId}: ${metricType} at ${value.toFixed(2)}% (threshold: ${threshold}%)`);
  }

  /**
   * Calculate alert severity based on threshold breach
   */
  calculateSeverity(value, threshold) {
    const excess = value - threshold;
    const percentageOverThreshold = (excess / threshold) * 100;

    if (percentageOverThreshold > 50) return 'critical';
    if (percentageOverThreshold > 25) return 'high';
    if (percentageOverThreshold > 10) return 'medium';
    return 'low';
  }

  /**
   * Handle incoming resource alerts from other nodes
   */
  handleResourceAlert(alert, fromNode) {
    console.log(`📢 Received alert from node ${fromNode}: ${alert.type} at ${alert.value.toFixed(2)}%`);

    this.emit('alertReceived', { alert, fromNode });

    // Store remote alert for analysis
    this.alerts.history.push({
      ...alert,
      received: true,
      receivedAt: Date.now(),
      fromNode
    });
  }

  /**
   * Resolve an active alert
   */
  resolveAlert(alertId, reason = 'manual') {
    const alert = this.alerts.active.get(alertId);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolveReason = reason;

    this.alerts.active.delete(alertId);

    this.emit('alertResolved', alert);
    console.log(`✅ Alert resolved on node ${this.nodeId}: ${alertId} (${reason})`);

    return true;
  }

  /**
   * Get current resource status
   */
  getResourceStatus() {
    const latest = {};

    for (const [type, history] of Object.entries(this.metrics)) {
      if (history.length > 0) {
        latest[type] = history[history.length - 1];
      }
    }

    return {
      nodeId: this.nodeId,
      timestamp: Date.now(),
      metrics: latest,
      alerts: {
        active: this.alerts.active.size,
        total: this.alerts.history.length,
        lastHour: this.alerts.history.filter(
          a => Date.now() - a.timestamp < 3600000
        ).length
      },
      thresholds: this.config.alertThresholds
    };
  }

  /**
   * Get historical metrics
   */
  getMetricHistory(type, limit = 50) {
    if (!this.metrics[type]) return [];

    return this.metrics[type]
      .slice(-limit)
      .map(metric => ({
        timestamp: metric.timestamp,
        value: metric.usage !== undefined ? metric.usage : metric.utilization,
        details: metric
      }));
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.alerts.active.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100) {
    return this.alerts.history
      .slice(-limit)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Set custom threshold
   */
  setThreshold(metricType, threshold) {
    this.config.alertThresholds[metricType] = threshold;

    this.emit('thresholdUpdated', { metricType, threshold });
    console.log(`🎯 Threshold updated for ${metricType}: ${threshold}%`);
  }

  /**
   * Add custom metric
   */
  addCustomMetric(name, value, timestamp = Date.now()) {
    if (!this.metrics.custom.has(name)) {
      this.metrics.custom.set(name, []);
    }

    const history = this.metrics.custom.get(name);
    history.push({ value, timestamp });

    // Keep only recent history
    if (history.length > this.config.historySize) {
      this.metrics.custom.set(name, history.slice(-this.config.historySize));
    }

    this.emit('customMetricAdded', { name, value, timestamp });
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats() {
    const totalMetrics = Object.values(this.metrics)
      .reduce((sum, history) => sum + history.length, 0);

    const avgMetricsPerType = {};
    for (const [type, history] of Object.entries(this.metrics)) {
      if (history.length > 0) {
        const values = history.map(m => m.usage || m.utilization || m.value).filter(v => v !== undefined);
        avgMetricsPerType[type] = values.length > 0
          ? values.reduce((sum, v) => sum + v, 0) / values.length
          : 0;
      }
    }

    return {
      nodeId: this.nodeId,
      isMonitoring: this.isMonitoring,
      totalMetrics,
      averageValues: avgMetricsPerType,
      alertStats: {
        totalAlerts: this.alerts.history.length,
        activeAlerts: this.alerts.active.size,
        alertTypes: this.getAlertTypeStats()
      },
      uptime: Date.now() - (this.startTime || Date.now())
    };
  }

  getAlertTypeStats() {
    const stats = {};
    for (const alert of this.alerts.history) {
      stats[alert.type] = (stats[alert.type] || 0) + 1;
    }
    return stats;
  }
}

module.exports = ResourceMonitor;