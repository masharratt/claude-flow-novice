/**
 * Fleet Monitoring Dashboard - Phase 4 Implementation
 *
 * Comprehensive real-time fleet monitoring with 1-second updates
 * for Node Distribution & Performance Optimization
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import fs from 'fs/promises';
import path from 'path';

/**
 * Fleet Monitoring Dashboard with real-time metrics
 */
export class FleetMonitoringDashboard extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      // Update frequency: 1 second as required
      updateInterval: 1000,

      // Data retention periods
      detailedRetention: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
      aggregatedRetention: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds

      // Alert thresholds
      thresholds: {
        performance: {
          latency: 100, // ms
          throughput: 1000, // ops/sec
          errorRate: 5.0 // %
        },
        health: {
          availability: 99.9, // %
          diskUsage: 85, // %
          memoryUsage: 85, // %
          cpuUsage: 80 // %
        },
        utilization: {
          nodeUtilization: 90, // %
          clusterUtilization: 85 // %
        },
        cost: {
          hourlyCost: 100, // USD
          dailyBudget: 2000 // USD
        }
      },

      // Redis configuration
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        password: config.redis?.password || null,
        db: config.redis?.db || 0
      },

      // Data storage
      dataDir: config.dataDir || './data/fleet-monitoring',
      logLevel: config.logLevel || 'info'
    };

    // Internal state
    this.isRunning = false;
    this.updateTimer = null;
    this.redisClient = null;
    this.redisSubscriber = null;

    // Data storage
    this.metricsHistory = [];
    this.aggregatedMetrics = [];
    this.alerts = [];
    this.nodes = new Map();
    this.predictions = new Map();

    // Performance tracking
    this.startTime = Date.now();
    this.lastUpdateTime = null;
    this.updateCount = 0;

    // Initialize subsystems
    this.predictiveMaintenance = null;
    this.automatedHealing = null;
    this.alertSystem = null;
  }

  /**
   * Initialize the fleet monitoring dashboard
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Fleet Monitoring Dashboard...');

      // Ensure data directory exists
      await this.ensureDataDirectory();

      // Initialize Redis clients
      await this.initializeRedis();

      // Initialize subsystems
      await this.initializeSubsystems();

      // Load historical data
      await this.loadHistoricalData();

      console.log('✅ Fleet Monitoring Dashboard initialized');
      this.emit('initialized', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Failed to initialize Fleet Monitoring Dashboard:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start real-time monitoring
   */
  async start() {
    if (this.isRunning) {
      console.warn('⚠️ Fleet Monitoring Dashboard is already running');
      return;
    }

    try {
      console.log('▶️ Starting Fleet Monitoring Dashboard...');

      this.isRunning = true;
      this.startTime = Date.now();

      // Start real-time updates (1-second interval)
      this.startRealTimeUpdates();

      // Start Redis coordination
      await this.startRedisCoordination();

      // Start subsystems
      await this.startSubsystems();

      console.log('✅ Fleet Monitoring Dashboard started with 1-second updates');
      this.emit('started', {
        timestamp: Date.now(),
        updateInterval: this.config.updateInterval
      });

    } catch (error) {
      this.isRunning = false;
      console.error('❌ Failed to start Fleet Monitoring Dashboard:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('⏹️ Stopping Fleet Monitoring Dashboard...');

      this.isRunning = false;

      // Stop update timer
      if (this.updateTimer) {
        clearInterval(this.updateTimer);
        this.updateTimer = null;
      }

      // Stop subsystems
      await this.stopSubsystems();

      // Save final data
      await this.saveFinalData();

      // Cleanup Redis connections
      await this.cleanupRedis();

      console.log('✅ Fleet Monitoring Dashboard stopped');
      this.emit('stopped', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Error stopping Fleet Monitoring Dashboard:', error);
      this.emit('error', error);
    }
  }

  /**
   * Start real-time updates with 1-second frequency
   */
  startRealTimeUpdates() {
    this.updateTimer = setInterval(async () => {
      try {
        await this.collectAndUpdateMetrics();
        this.updateCount++;
        this.lastUpdateTime = Date.now();
      } catch (error) {
        console.error('❌ Error in real-time update:', error);
        this.emit('error', error);
      }
    }, this.config.updateInterval);
  }

  /**
   * Collect and update fleet metrics
   */
  async collectAndUpdateMetrics() {
    const timestamp = Date.now();

    try {
      // Collect metrics from all nodes
      const nodeMetrics = await this.collectNodeMetrics();

      // Calculate aggregated metrics
      const aggregatedMetrics = this.calculateAggregatedMetrics(nodeMetrics);

      // Create metrics snapshot
      const metrics = {
        timestamp,
        nodes: nodeMetrics,
        aggregated: aggregatedMetrics,
        fleet: {
          totalNodes: nodeMetrics.length,
          healthyNodes: nodeMetrics.filter(n => n.health.status === 'healthy').length,
          totalOperations: aggregatedMetrics.performance.totalOperations,
          averageLatency: aggregatedMetrics.performance.averageLatency,
          totalThroughput: aggregatedMetrics.performance.totalThroughput,
          availability: aggregatedMetrics.health.availability,
          utilization: aggregatedMetrics.utilization.overall,
          hourlyCost: aggregatedMetrics.cost.hourlyCost
        }
      };

      // Store metrics
      await this.storeMetrics(metrics);

      // Process through predictive maintenance
      if (this.predictiveMaintenance) {
        const predictions = await this.predictiveMaintenance.analyzeMetrics(metrics);
        this.processPredictions(predictions);
      }

      // Check for alerts
      await this.checkAlerts(metrics);

      // Emit metrics event
      this.emit('metrics', metrics);

      // Publish to Redis for coordination
      await this.publishToRedis(metrics);

    } catch (error) {
      console.error('❌ Error collecting metrics:', error);
      this.emit('metrics_error', { timestamp, error: error.message });
    }
  }

  /**
   * Collect metrics from all fleet nodes
   */
  async collectNodeMetrics() {
    const nodeMetrics = [];

    // Simulate node collection - in real implementation, this would
    // query actual nodes via APIs, agents, or monitoring systems

    for (let i = 1; i <= 10; i++) { // Simulate 10 nodes
      const nodeId = `node-${i.toString().padStart(3, '0')}`;

      // Get existing node data or create new
      let node = this.nodes.get(nodeId) || {
        id: nodeId,
        name: `Fleet Node ${i}`,
        type: i <= 5 ? 'worker' : 'master',
        region: ['us-east-1', 'us-west-2', 'eu-west-1'][i % 3],
        zone: ['a', 'b', 'c'][i % 3]
      };

      // Simulate current metrics
      const performance = {
        latency: 50 + Math.random() * 100,
        throughput: 800 + Math.random() * 400,
        errorRate: Math.random() * 10,
        cpuUsage: 40 + Math.random() * 50,
        memoryUsage: 30 + Math.random() * 60,
        diskUsage: 20 + Math.random() * 70,
        networkIO: Math.random() * 1000,
        operations: Math.floor(Math.random() * 10000)
      };

      const health = {
        status: performance.errorRate < 5 && performance.cpuUsage < 90 ? 'healthy' : 'degraded',
        availability: 95 + Math.random() * 5,
        lastCheck: Date.now(),
        uptime: Math.random() * 86400000 // Random uptime up to 24 hours
      };

      const utilization = {
        cpu: performance.cpuUsage,
        memory: performance.memoryUsage,
        disk: performance.diskUsage,
        network: (performance.networkIO / 1000) * 100,
        overall: (performance.cpuUsage + performance.memoryUsage + performance.diskUsage) / 3
      };

      const cost = {
        hourly: 5 + Math.random() * 15, // $5-20 per hour
        daily: (5 + Math.random() * 15) * 24,
        monthly: (5 + Math.random() * 15) * 24 * 30
      };

      node.metrics = { performance, health, utilization, cost };
      node.lastUpdate = Date.now();

      this.nodes.set(nodeId, node);
      nodeMetrics.push(node);
    }

    return nodeMetrics;
  }

  /**
   * Calculate aggregated fleet metrics
   */
  calculateAggregatedMetrics(nodeMetrics) {
    if (nodeMetrics.length === 0) {
      return { performance: {}, health: {}, utilization: {}, cost: {} };
    }

    // Performance aggregates
    const performance = {
      totalOperations: nodeMetrics.reduce((sum, node) => sum + node.metrics.performance.operations, 0),
      averageLatency: nodeMetrics.reduce((sum, node) => sum + node.metrics.performance.latency, 0) / nodeMetrics.length,
      totalThroughput: nodeMetrics.reduce((sum, node) => sum + node.metrics.performance.throughput, 0),
      averageErrorRate: nodeMetrics.reduce((sum, node) => sum + node.metrics.performance.errorRate, 0) / nodeMetrics.length,
      averageCpuUsage: nodeMetrics.reduce((sum, node) => sum + node.metrics.performance.cpuUsage, 0) / nodeMetrics.length,
      averageMemoryUsage: nodeMetrics.reduce((sum, node) => sum + node.metrics.performance.memoryUsage, 0) / nodeMetrics.length
    };

    // Health aggregates
    const healthyNodes = nodeMetrics.filter(n => n.metrics.health.status === 'healthy').length;
    const health = {
      availability: (healthyNodes / nodeMetrics.length) * 100,
      healthyNodes,
      totalNodes: nodeMetrics.length,
      averageUptime: nodeMetrics.reduce((sum, node) => sum + node.metrics.health.uptime, 0) / nodeMetrics.length
    };

    // Utilization aggregates
    const utilization = {
      overall: nodeMetrics.reduce((sum, node) => sum + node.metrics.utilization.overall, 0) / nodeMetrics.length,
      cpu: performance.averageCpuUsage,
      memory: performance.averageMemoryUsage,
      disk: nodeMetrics.reduce((sum, node) => sum + node.metrics.utilization.disk, 0) / nodeMetrics.length,
      network: nodeMetrics.reduce((sum, node) => sum + node.metrics.utilization.network, 0) / nodeMetrics.length
    };

    // Cost aggregates
    const cost = {
      hourlyCost: nodeMetrics.reduce((sum, node) => sum + node.metrics.cost.hourly, 0),
      dailyCost: nodeMetrics.reduce((sum, node) => sum + node.metrics.cost.daily, 0),
      monthlyCost: nodeMetrics.reduce((sum, node) => sum + node.metrics.cost.monthly, 0)
    };

    return { performance, health, utilization, cost };
  }

  /**
   * Store metrics with appropriate retention
   */
  async storeMetrics(metrics) {
    // Store in memory for real-time access
    this.metricsHistory.push(metrics);

    // Maintain detailed retention (30 days)
    const detailedCutoff = Date.now() - this.config.detailedRetention;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > detailedCutoff);

    // Store aggregated data for long-term retention (1 year)
    await this.storeAggregatedMetrics(metrics);

    // Save to disk periodically (every 100 updates)
    if (this.updateCount % 100 === 0) {
      await this.saveMetricsToDisk();
    }
  }

  /**
   * Store aggregated metrics for long-term retention
   */
  async storeAggregatedMetrics(metrics) {
    const aggregationKey = `${new Date(metrics.timestamp).toISOString().slice(0, 10)}`; // Daily aggregation

    let existing = this.aggregatedMetrics.find(m => m.date === aggregationKey);
    if (!existing) {
      existing = {
        date: aggregationKey,
        samples: [],
        dailyAggregates: {}
      };
      this.aggregatedMetrics.push(existing);
    }

    existing.samples.push(metrics);

    // Calculate daily aggregates
    if (existing.samples.length === 1) {
      existing.dailyAggregates = { ...metrics.fleet };
    } else {
      // Update running averages
      const count = existing.samples.length;
      const prev = existing.dailyAggregates;

      existing.dailyAggregates = {
        totalNodes: metrics.fleet.totalNodes,
        healthyNodes: Math.round((prev.healthyNodes * (count - 1) + metrics.fleet.healthyNodes) / count),
        totalOperations: prev.totalOperations + metrics.fleet.totalOperations,
        averageLatency: (prev.averageLatency * (count - 1) + metrics.fleet.averageLatency) / count,
        totalThroughput: (prev.totalThroughput * (count - 1) + metrics.fleet.totalThroughput) / count,
        availability: (prev.availability * (count - 1) + metrics.fleet.availability) / count,
        utilization: (prev.utilization * (count - 1) + metrics.fleet.utilization) / count,
        hourlyCost: (prev.hourlyCost * (count - 1) + metrics.fleet.hourlyCost) / count
      };
    }

    // Maintain aggregated retention (1 year)
    const aggregatedCutoff = Date.now() - this.config.aggregatedRetention;
    this.aggregatedMetrics = this.aggregatedMetrics.filter(m =>
      new Date(m.date).getTime() > aggregatedCutoff
    );
  }

  /**
   * Process predictions from predictive maintenance
   */
  processPredictions(predictions) {
    if (!predictions || !Array.isArray(predictions)) return;

    predictions.forEach(prediction => {
      this.predictions.set(prediction.id, prediction);

      if (prediction.severity === 'CRITICAL') {
        this.emit('critical_prediction', prediction);
      }

      console.log(`🔮 Prediction: ${prediction.type} - ${prediction.message}`);
    });
  }

  /**
   * Check for alerts based on thresholds
   */
  async checkAlerts(metrics) {
    const alerts = [];
    const thresholds = this.config.thresholds;

    // Performance alerts
    if (metrics.fleet.averageLatency > thresholds.performance.latency) {
      alerts.push({
        id: `perf-latency-${Date.now()}`,
        type: 'PERFORMANCE',
        severity: 'WARNING',
        category: 'LATENCY',
        message: `Average latency ${metrics.fleet.averageLatency.toFixed(2)}ms exceeds threshold ${thresholds.performance.latency}ms`,
        value: metrics.fleet.averageLatency,
        threshold: thresholds.performance.latency,
        timestamp: Date.now()
      });
    }

    // Health alerts
    if (metrics.fleet.availability < thresholds.health.availability) {
      alerts.push({
        id: `health-availability-${Date.now()}`,
        type: 'HEALTH',
        severity: 'CRITICAL',
        category: 'AVAILABILITY',
        message: `Fleet availability ${metrics.fleet.availability.toFixed(2)}% below threshold ${thresholds.health.availability}%`,
        value: metrics.fleet.availability,
        threshold: thresholds.health.availability,
        timestamp: Date.now()
      });
    }

    // Utilization alerts
    if (metrics.fleet.utilization > thresholds.utilization.nodeUtilization) {
      alerts.push({
        id: `util-overall-${Date.now()}`,
        type: 'UTILIZATION',
        severity: 'WARNING',
        category: 'OVERALL',
        message: `Fleet utilization ${metrics.fleet.utilization.toFixed(2)}% exceeds threshold ${thresholds.utilization.nodeUtilization}%`,
        value: metrics.fleet.utilization,
        threshold: thresholds.utilization.nodeUtilization,
        timestamp: Date.now()
      });
    }

    // Cost alerts
    if (metrics.fleet.hourlyCost > thresholds.cost.hourlyCost) {
      alerts.push({
        id: `cost-hourly-${Date.now()}`,
        type: 'COST',
        severity: 'WARNING',
        category: 'HOURLY_COST',
        message: `Hourly cost $${metrics.fleet.hourlyCost.toFixed(2)} exceeds threshold $${thresholds.cost.hourlyCost}`,
        value: metrics.fleet.hourlyCost,
        threshold: thresholds.cost.hourlyCost,
        timestamp: Date.now()
      });
    }

    // Store and emit alerts
    if (alerts.length > 0) {
      alerts.forEach(alert => {
        this.alerts.push(alert);
        this.emit('alert', alert);

        // Send to alert system
        if (this.alertSystem) {
          this.alertSystem.sendAlert(alert);
        }
      });

      // Maintain alert history (last 1000)
      if (this.alerts.length > 1000) {
        this.alerts = this.alerts.slice(-1000);
      }
    }
  }

  /**
   * Initialize Redis clients for coordination
   */
  async initializeRedis() {
    try {
      // Primary Redis client
      this.redisClient = createClient(this.config.redis);
      await this.redisClient.connect();

      // Redis subscriber for coordination
      this.redisSubscriber = this.redisClient.duplicate();
      await this.redisSubscriber.connect();

      console.log('✅ Redis clients initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Redis:', error);
      throw error;
    }
  }

  /**
   * Initialize monitoring subsystems
   */
  async initializeSubsystems() {
    // Initialize Predictive Maintenance
    const { PredictiveMaintenance } = await import('./PredictiveMaintenance.js');
    this.predictiveMaintenance = new PredictiveMaintenance({
      redis: this.config.redis,
      dataDir: path.join(this.config.dataDir, 'predictive')
    });
    await this.predictiveMaintenance.initialize();

    // Initialize Automated Healing
    const { AutomatedHealing } = await import('./AutomatedHealing.js');
    this.automatedHealing = new AutomatedHealing({
      redis: this.config.redis,
      dataDir: path.join(this.config.dataDir, 'healing')
    });
    await this.automatedHealing.initialize();

    // Initialize Alert System
    const { AlertSystem } = await import('./AlertSystem.js');
    this.alertSystem = new AlertSystem({
      redis: this.config.redis,
      thresholds: this.config.thresholds
    });
    await this.alertSystem.initialize();

    console.log('✅ Subsystems initialized');
  }

  /**
   * Start Redis coordination
   */
  async startRedisCoordination() {
    // Subscribe to fleet coordination channel
    await this.redisSubscriber.subscribe('swarm:phase-4:monitoring', (message) => {
      try {
        const data = JSON.parse(message);
        this.handleRedisMessage(data);
      } catch (error) {
        console.error('❌ Error handling Redis message:', error);
      }
    });

    // Subscribe to agent-booster performance channel
    await this.redisSubscriber.subscribe('swarm:phase-5:performance', (message) => {
      try {
        const data = JSON.parse(message);
        this.handleBoosterMetrics(data);
      } catch (error) {
        console.error('❌ Error handling booster metrics:', error);
      }
    });

    console.log('✅ Redis coordination started with agent-booster integration');
  }

  /**
   * Handle Redis coordination messages
   */
  handleRedisMessage(data) {
    switch (data.type) {
      case 'HEALTH_CHECK':
        this.emit('health_check_request', data);
        break;
      case 'METRICS_REQUEST':
        this.sendMetricsToRedis(data.requestId, data.channel);
        break;
      case 'ALERT_ACK':
        this.handleAlertAcknowledgment(data);
        break;
      case 'HEALING_REQUEST':
        if (this.automatedHealing) {
          this.automatedHealing.processHealingRequest(data);
        }
        break;
      default:
        console.log(`📨 Unknown message type: ${data.type}`);
    }
  }

  /**
   * Publish metrics to Redis for coordination
   */
  async publishToRedis(metrics) {
    try {
      const message = {
        type: 'METRICS_UPDATE',
        swarmId: 'phase-4-fleet-monitoring',
        timestamp: metrics.timestamp,
        metrics: metrics.fleet,
        nodeId: 'fleet-dashboard'
      };

      await this.redisClient.publish('swarm:phase-4:monitoring', JSON.stringify(message));

      // Store in Redis memory for swarm coordination
      await this.redisClient.setex(
        `swarm:memory:phase-4:metrics:${Date.now()}`,
        3600, // 1 hour TTL
        JSON.stringify(metrics)
      );

    } catch (error) {
      console.error('❌ Error publishing to Redis:', error);
    }
  }

  /**
   * Send metrics to specific Redis channel
   */
  async sendMetricsToRedis(requestId, channel) {
    try {
      const metrics = this.getRealTimeMetrics();
      const response = {
        type: 'METRICS_RESPONSE',
        requestId,
        timestamp: Date.now(),
        metrics
      };

      await this.redisClient.publish(channel || 'swarm:phase-4:monitoring', JSON.stringify(response));
    } catch (error) {
      console.error('❌ Error sending metrics to Redis:', error);
    }
  }

  /**
   * Handle alert acknowledgment
   */
  handleAlertAcknowledgment(data) {
    const alert = this.alerts.find(a => a.id === data.alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = data.acknowledgedBy;
      alert.acknowledgedAt = data.timestamp;

      this.emit('alert_acknowledged', alert);
    }
  }

  /**
   * Handle agent-booster metrics from Phase 5
   */
  handleBoosterMetrics(data) {
    switch (data.type) {
      case 'BOOSTER_METRICS_UPDATE':
        this.processBoosterMetricsUpdate(data);
        break;
      case 'MONITOR_STARTED':
        console.log('🚀 Agent-Booster monitor started:', data.monitorId);
        break;
      default:
        console.log(`📨 Unknown booster message type: ${data.type}`);
    }
  }

  /**
   * Process booster metrics update
   */
  processBoosterMetricsUpdate(data) {
    try {
      const { metrics, boosters, improvement, timestamp } = data;

      // Store booster metrics for fleet integration
      const boosterData = {
        timestamp,
        boosters: boosters || [],
        performance: {
          totalOperations: metrics?.totalOperations || 0,
          averageLatency: metrics?.averageLatency || 0,
          totalThroughput: metrics?.totalThroughput || 0,
          memoryEfficiency: metrics?.memoryEfficiency || 0,
          errorRate: metrics?.errorRate || 0,
          improvementFactor: improvement?.currentImprovement || 1
        },
        improvement: improvement || {}
      };

      // Update fleet metrics with booster data
      this.updateFleetMetricsWithBoosters(boosterData);

      // Emit booster metrics event
      this.emit('booster_metrics', boosterData);

      // Check for 52x improvement achievement
      if (improvement && improvement.achieved) {
        this.emit('52x_improvement_achieved', {
          timestamp,
          improvement: improvement.currentImprovement,
          percentage: improvement.improvementPercentage
        });
        console.log(`🎉 52x improvement achieved! Current: ${improvement.improvementPercentage}x`);
      }

    } catch (error) {
      console.error('❌ Error processing booster metrics:', error);
    }
  }

  /**
   * Update fleet metrics with booster data
   */
  updateFleetMetricsWithBoosters(boosterData) {
    // Create synthetic node for booster cluster
    const boosterNode = {
      id: 'booster-cluster',
      name: 'Agent-Booster Cluster',
      type: 'booster',
      region: 'wasm-runtime',
      zone: 'memory',
      metrics: {
        performance: {
          latency: boosterData.performance.averageLatency,
          throughput: boosterData.performance.totalThroughput,
          errorRate: boosterData.performance.errorRate,
          cpuUsage: 70 + Math.random() * 20, // Simulated CPU usage
          memoryUsage: (boosterData.performance.memoryEfficiency / 100) * 80, // Convert efficiency to usage
          diskUsage: 10 + Math.random() * 10, // Low disk usage for WASM
          networkIO: boosterData.performance.totalThroughput * 0.1, // Estimated network I/O
          operations: boosterData.performance.totalOperations
        },
        health: {
          status: boosterData.performance.errorRate < 5 ? 'healthy' : 'degraded',
          availability: 95 + Math.random() * 5,
          lastCheck: Date.now(),
          uptime: Date.now() - this.startTime
        },
        utilization: {
          cpu: 70 + Math.random() * 20,
          memory: (boosterData.performance.memoryEfficiency / 100) * 80,
          disk: 10 + Math.random() * 10,
          network: (boosterData.performance.totalThroughput / 1000) * 100,
          overall: (70 + (boosterData.performance.memoryEfficiency / 100) * 80) / 2
        },
        cost: {
          hourly: 15 + Math.random() * 10, // Higher cost for WASM instances
          daily: (15 + Math.random() * 10) * 24,
          monthly: (15 + Math.random() * 10) * 24 * 30
        }
      },
      lastUpdate: Date.now(),
      boosterData: boosterData
    };

    // Add or update booster node in fleet
    this.nodes.set('booster-cluster', boosterNode);

    // Log booster integration
    console.log(`📊 Integrated booster metrics: ${boosterData.boosters.length} boosters, ${boosterData.performance.improvementFactor}x improvement`);
  }

  /**
   * Start all subsystems
   */
  async startSubsystems() {
    if (this.predictiveMaintenance) {
      await this.predictiveMaintenance.start();
    }

    if (this.automatedHealing) {
      await this.automatedHealing.start();
    }

    if (this.alertSystem) {
      await this.alertSystem.start();
    }

    console.log('✅ Subsystems started');
  }

  /**
   * Stop all subsystems
   */
  async stopSubsystems() {
    if (this.predictiveMaintenance) {
      await this.predictiveMaintenance.stop();
    }

    if (this.automatedHealing) {
      await this.automatedHealing.stop();
    }

    if (this.alertSystem) {
      await this.alertSystem.stop();
    }

    console.log('✅ Subsystems stopped');
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.config.dataDir, { recursive: true });
      await fs.mkdir(path.join(this.config.dataDir, 'metrics'), { recursive: true });
      await fs.mkdir(path.join(this.config.dataDir, 'alerts'), { recursive: true });
      await fs.mkdir(path.join(this.config.dataDir, 'predictions'), { recursive: true });
    } catch (error) {
      console.error('❌ Error creating data directory:', error);
    }
  }

  /**
   * Load historical data from disk
   */
  async loadHistoricalData() {
    try {
      const metricsFile = path.join(this.config.dataDir, 'metrics', 'latest.json');
      const data = await fs.readFile(metricsFile, 'utf-8');
      const historical = JSON.parse(data);

      if (historical.metrics && Array.isArray(historical.metrics)) {
        this.metricsHistory = historical.metrics.slice(-1000); // Load last 1000 entries
      }

      if (historical.aggregated && Array.isArray(historical.aggregated)) {
        this.aggregatedMetrics = historical.aggregated;
      }

      console.log(`📂 Loaded ${this.metricsHistory.length} historical metrics entries`);
    } catch (error) {
      console.log('📂 No historical data found, starting fresh');
    }
  }

  /**
   * Save metrics to disk
   */
  async saveMetricsToDisk() {
    try {
      const data = {
        timestamp: Date.now(),
        metrics: this.metricsHistory,
        aggregated: this.aggregatedMetrics,
        alerts: this.alerts.slice(-100), // Last 100 alerts
        updateCount: this.updateCount,
        uptime: Date.now() - this.startTime
      };

      const metricsFile = path.join(this.config.dataDir, 'metrics', 'latest.json');
      await fs.writeFile(metricsFile, JSON.stringify(data, null, 2));

    } catch (error) {
      console.error('❌ Error saving metrics to disk:', error);
    }
  }

  /**
   * Save final data on shutdown
   */
  async saveFinalData() {
    try {
      await this.saveMetricsToDisk();

      const summary = {
        timestamp: Date.now(),
        totalUpdates: this.updateCount,
        uptime: Date.now() - this.startTime,
        finalMetrics: this.getRealTimeMetrics(),
        totalAlerts: this.alerts.length,
        nodes: Array.from(this.nodes.values())
      };

      const summaryFile = path.join(this.config.dataDir, 'session-summary.json');
      await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));

      console.log('💾 Final data saved to disk');
    } catch (error) {
      console.error('❌ Error saving final data:', error);
    }
  }

  /**
   * Cleanup Redis connections
   */
  async cleanupRedis() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      if (this.redisSubscriber) {
        await this.redisSubscriber.quit();
      }

      console.log('✅ Redis connections cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up Redis:', error);
    }
  }

  /**
   * Get real-time metrics for API consumption
   */
  getRealTimeMetrics() {
    if (this.metricsHistory.length === 0) {
      return { status: 'NO_DATA' };
    }

    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const previous = this.metricsHistory.length > 1 ? this.metricsHistory[this.metricsHistory.length - 2] : null;

    return {
      current: latest,
      previous,
      alerts: this.alerts.slice(-10), // Last 10 alerts
      predictions: Array.from(this.predictions.values()).slice(-5), // Last 5 predictions
      status: this.getStatus(),
      summary: this.getPerformanceSummary()
    };
  }

  /**
   * Get current dashboard status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: this.isRunning ? Date.now() - this.startTime : 0,
      updateCount: this.updateCount,
      updateInterval: this.config.updateInterval,
      lastUpdate: this.lastUpdateTime,
      nodesCount: this.nodes.size,
      metricsCount: this.metricsHistory.length,
      alertsCount: this.alerts.length,
      predictionsCount: this.predictions.size
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    if (this.metricsHistory.length === 0) {
      return { status: 'NO_DATA' };
    }

    const recent = this.metricsHistory.slice(-60); // Last 60 seconds (1 minute)
    const latest = recent[recent.length - 1];

    return {
      availability: latest.fleet.availability,
      averageLatency: latest.fleet.averageLatency,
      totalThroughput: latest.fleet.totalThroughput,
      utilization: latest.fleet.utilization,
      hourlyCost: latest.fleet.hourlyCost,
      healthyNodes: latest.fleet.healthyNodes,
      totalNodes: latest.fleet.totalNodes,
      recentTrends: this.calculateRecentTrends(recent)
    };
  }

  /**
   * Calculate recent trends from metrics
   */
  calculateRecentTrends(recentMetrics) {
    if (recentMetrics.length < 2) {
      return { latency: 'stable', throughput: 'stable', availability: 'stable' };
    }

    const latencyTrend = this.calculateTrend(recentMetrics.map(m => m.fleet.averageLatency));
    const throughputTrend = this.calculateTrend(recentMetrics.map(m => m.fleet.totalThroughput));
    const availabilityTrend = this.calculateTrend(recentMetrics.map(m => m.fleet.availability));

    return {
      latency: latencyTrend,
      throughput: throughputTrend,
      availability: availabilityTrend
    };
  }

  /**
   * Calculate trend direction from data points
   */
  calculateTrend(data) {
    if (data.length < 2) return 'stable';

    const first = data[0];
    const last = data[data.length - 1];
    const change = ((last - first) / first) * 100;

    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Generate comprehensive fleet report
   */
  generateFleetReport() {
    if (this.metricsHistory.length === 0) {
      return { status: 'NO_DATA', message: 'No metrics data available' };
    }

    const latest = this.metricsHistory[this.metricsHistory.length - 1];
    const summary = this.getPerformanceSummary();

    return {
      timestamp: Date.now(),
      summary,
      nodes: Array.from(this.nodes.values()).map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        region: node.region,
        status: node.metrics.health.status,
        utilization: node.metrics.utilization.overall,
        performance: {
          latency: node.metrics.performance.latency,
          throughput: node.metrics.performance.throughput,
          errorRate: node.metrics.performance.errorRate
        },
        cost: node.metrics.cost.hourly
      })),
      alerts: {
        total: this.alerts.length,
        critical: this.alerts.filter(a => a.severity === 'CRITICAL').length,
        warnings: this.alerts.filter(a => a.severity === 'WARNING').length,
        recent: this.alerts.slice(-10)
      },
      predictions: Array.from(this.predictions.values()).slice(-5),
      status: this.getStatus()
    };
  }
}

export default FleetMonitoringDashboard;