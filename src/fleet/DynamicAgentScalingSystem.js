/**
 * DynamicAgentScalingSystem - Advanced scaling system for 100+ concurrent agents
 *
 * Features:
 * - Intelligent load-based scaling with predictive algorithms
 * - Resource optimization and real-time monitoring
 * - Horizontal scaling with distributed load balancing
 * - Performance-based auto-scaling mechanisms
 * - Enterprise-grade fault tolerance and recovery
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import os from 'os';
import { performance } from 'perf_hooks';

/**
 * Scaling configuration and thresholds
 */
const SCALING_CONFIG = {
  // Core scaling thresholds
  targetUtilization: 0.75,        // Target 75% utilization
  maxUtilization: 0.90,            // Scale up at 90% utilization
  minUtilization: 0.30,            // Scale down at 30% utilization
  scaleUpCooldown: 30000,          // 30 seconds between scale-up events
  scaleDownCooldown: 60000,        // 60 seconds between scale-down events

  // Resource thresholds
  cpuThreshold: 0.80,              // Scale if CPU > 80%
  memoryThreshold: 0.85,           // Scale if memory > 85%
  queuePressureThreshold: 2.0,     // Scale if queue pressure > 2x agents

  // Performance thresholds
  responseTimeThreshold: 5000,     // 5 seconds max response time
  errorRateThreshold: 0.10,        // 10% error rate threshold

  // Predictive scaling
  predictionWindow: 300000,        // 5 minutes prediction window
  loadHistorySize: 100,            // Keep 100 data points for prediction

  // Limits
  maxConcurrentAgents: 1000,       // Hard limit of 1000 agents
  minConcurrentAgents: 10,         // Minimum 10 agents
  burstCapacity: 1.5,              // Allow 50% burst capacity

  // Redis configuration
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },

  // Channels for coordination
  channels: {
    scaling: 'swarm:scalability:scaling',
    metrics: 'swarm:scalability:metrics',
    coordination: 'swarm:scalability:coordination',
    alerts: 'swarm:scalability:alerts'
  }
};

/**
 * Load prediction algorithms
 */
const PREDICTION_ALGORITHMS = {
  LINEAR_REGRESSION: 'linear_regression',
  MOVING_AVERAGE: 'moving_average',
  EXPONENTIAL_SMOOTHING: 'exponential_smoothing',
  SEASONAL_DECOMPOSITION: 'seasonal_decomposition'
};

/**
 * Scaling strategies
 */
const SCALING_STRATEGIES = {
  REACTIVE: 'reactive',            // Scale based on current load
  PREDICTIVE: 'predictive',        // Scale based on predicted load
  HYBRID: 'hybrid',                // Combine reactive and predictive
  BURST: 'burst'                   // Handle traffic bursts
};

/**
 * DynamicAgentScalingSystem class
 */
export class DynamicAgentScalingSystem extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...SCALING_CONFIG, ...options };
    this.systemId = `scaling-system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Redis clients
    this.redis = null;
    this.publisher = null;
    this.subscriber = null;

    // System state
    this.isInitialized = false;
    this.isRunning = false;

    // Scaling state
    this.currentAgentCount = 0;
    this.targetAgentCount = 0;
    this.lastScaleTime = 0;
    this.lastScaleDirection = null;
    this.scaleHistory = [];

    // Metrics and monitoring
    this.metrics = {
      systemLoad: {
        cpu: 0,
        memory: 0,
        agents: 0,
        tasks: 0,
        queueSize: 0
      },
      performance: {
        averageResponseTime: 0,
        errorRate: 0,
        throughput: 0,
        utilization: 0
      },
      scaling: {
        totalScaleUps: 0,
        totalScaleDowns: 0,
        averageScaleTime: 0,
        predictionAccuracy: 0
      }
    };

    // Load history for prediction
    this.loadHistory = [];
    this.predictions = new Map();

    // Scaling cooldown timers
    this.scaleUpCooldownActive = false;
    this.scaleDownCooldownActive = false;

    // Resource monitoring
    this.resourceMonitor = null;
    this.performanceMonitor = null;

    this.setupEventHandlers();
  }

  /**
   * Initialize the scaling system
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Dynamic Agent Scaling System' });

      // Initialize Redis connections
      await this.initializeRedis();

      // Setup monitoring
      await this.setupMonitoring();

      // Initialize system state
      await this.initializeSystemState();

      // Start scaling processes
      this.startScalingProcesses();

      this.isInitialized = true;
      this.isRunning = true;

      // Announce system startup
      await this.publishScalingEvent({
        type: 'scaling_system_started',
        systemId: this.systemId,
        timestamp: Date.now(),
        config: this.config
      });

      this.emit('status', { status: 'running', message: 'Dynamic Agent Scaling System initialized successfully' });
      console.log(`🚀 Dynamic Agent Scaling System ${this.systemId} initialized`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Initialize Redis connections
   */
  async initializeRedis() {
    this.redis = createClient(this.config.redis);
    this.publisher = this.redis.duplicate();
    this.subscriber = this.redis.duplicate();

    await Promise.all([
      this.redis.connect(),
      this.publisher.connect(),
      this.subscriber.connect()
    ]);

    // Setup subscriptions
    await this.subscriber.subscribe(this.config.channels.metrics, (message) => {
      this.handleMetricsMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.config.channels.coordination, (message) => {
      this.handleCoordinationMessage(JSON.parse(message));
    });

    console.log('📡 Redis connections established for scaling system');
  }

  /**
   * Setup monitoring systems
   */
  async setupMonitoring() {
    // System resource monitoring
    this.resourceMonitor = setInterval(() => {
      this.collectSystemMetrics();
    }, 5000); // Every 5 seconds

    // Performance monitoring
    this.performanceMonitor = setInterval(() => {
      this.collectPerformanceMetrics();
    }, 10000); // Every 10 seconds

    console.log('📊 Monitoring systems activated');
  }

  /**
   * Initialize system state
   */
  async initializeSystemState() {
    try {
      // Load current state from Redis
      const savedState = await this.redis.get(`scaling:state:${this.systemId}`);
      if (savedState) {
        const state = JSON.parse(savedState);
        this.currentAgentCount = state.currentAgentCount || 0;
        this.targetAgentCount = state.targetAgentCount || 0;
        this.scaleHistory = state.scaleHistory || [];
      }

      // Get initial system metrics
      await this.collectSystemMetrics();
      await this.collectPerformanceMetrics();

      // Set initial target based on current load
      this.targetAgentCount = Math.max(
        this.config.minConcurrentAgents,
        Math.min(this.calculateOptimalAgentCount(), this.config.maxConcurrentAgents)
      );

      console.log(`🎯 Initial target agent count: ${this.targetAgentCount}`);
    } catch (error) {
      console.warn('Failed to initialize system state:', error.message);
      // Set defaults
      this.currentAgentCount = this.config.minConcurrentAgents;
      this.targetAgentCount = this.config.minConcurrentAgents;
    }
  }

  /**
   * Start scaling processes
   */
  startScalingProcesses() {
    // Main scaling loop
    this.scalingLoop = setInterval(async () => {
      await this.executeScalingCycle();
    }, 15000); // Every 15 seconds

    // Predictive scaling
    this.predictionLoop = setInterval(async () => {
      await this.updatePredictions();
    }, 60000); // Every minute

    // Metrics publishing
    this.metricsLoop = setInterval(async () => {
      await this.publishMetrics();
    }, 30000); // Every 30 seconds

    // Cleanup old data
    this.cleanupLoop = setInterval(async () => {
      await this.cleanupOldData();
    }, 300000); // Every 5 minutes

    console.log('🔄 Scaling processes started');
  }

  /**
   * Main scaling cycle
   */
  async executeScalingCycle() {
    try {
      // Collect current metrics
      await this.collectSystemMetrics();
      await this.collectPerformanceMetrics();

      // Calculate optimal agent count
      const optimalCount = await this.calculateOptimalAgentCount();

      // Apply scaling logic
      const scalingDecision = this.makeScalingDecision(optimalCount);

      if (scalingDecision.shouldScale) {
        await this.executeScaling(scalingDecision);
      }

      // Update load history
      this.updateLoadHistory();

    } catch (error) {
      this.emit('error', { type: 'scaling_cycle_failed', error: error.message });
    }
  }

  /**
   * Calculate optimal agent count based on current and predicted load
   */
  async calculateOptimalAgentCount() {
    const currentLoad = this.metrics.systemLoad;
    const performance = this.metrics.performance;

    // Base calculation on current utilization
    let optimalCount = this.currentAgentCount;

    // Scale based on CPU utilization
    if (currentLoad.cpu > this.config.cpuThreshold) {
      optimalCount = Math.ceil(optimalCount * (1 + (currentLoad.cpu - this.config.cpuThreshold)));
    }

    // Scale based on memory utilization
    if (currentLoad.memory > this.config.memoryThreshold) {
      optimalCount = Math.ceil(optimalCount * (1 + (currentLoad.memory - this.config.memoryThreshold) * 0.5));
    }

    // Scale based on queue pressure
    const queuePressure = currentLoad.tasks / Math.max(currentLoad.agents, 1);
    if (queuePressure > this.config.queuePressureThreshold) {
      optimalCount = Math.ceil(optimalCount * (queuePressure / this.config.queuePressureThreshold));
    }

    // Scale based on response time
    if (performance.averageResponseTime > this.config.responseTimeThreshold) {
      const responseTimeFactor = performance.averageResponseTime / this.config.responseTimeThreshold;
      optimalCount = Math.ceil(optimalCount * responseTimeFactor);
    }

    // Consider predicted load
    const prediction = this.getPrediction();
    if (prediction && prediction.predictedLoad > currentLoad.tasks) {
      const predictionFactor = prediction.predictedLoad / currentLoad.tasks;
      optimalCount = Math.ceil(optimalCount * (1 + (predictionFactor - 1) * 0.5));
    }

    // Apply constraints
    optimalCount = Math.max(this.config.minConcurrentAgents, optimalCount);
    optimalCount = Math.min(this.config.maxConcurrentAgents, optimalCount);

    return optimalCount;
  }

  /**
   * Make scaling decision based on analysis
   */
  makeScalingDecision(optimalCount) {
    const now = Date.now();
    const timeSinceLastScale = now - this.lastScaleTime;

    const decision = {
      shouldScale: false,
      direction: null,
      currentCount: this.currentAgentCount,
      targetCount: optimalCount,
      scaleAmount: 0,
      reason: '',
      urgency: 'normal'
    };

    // Check if scaling is needed
    const scaleUpThreshold = this.currentAgentCount * this.config.targetUtilization;
    const scaleDownThreshold = this.currentAgentCount * this.config.maxUtilization;

    if (optimalCount > this.currentAgentCount &&
        this.metrics.performance.utilization > this.config.maxUtilization) {
      // Need to scale up
      if (!this.scaleUpCooldownActive || timeSinceLastScale > this.config.scaleUpCooldown) {
        decision.shouldScale = true;
        decision.direction = 'up';
        decision.scaleAmount = Math.min(
          optimalCount - this.currentAgentCount,
          Math.ceil(this.currentAgentCount * 0.25) // Max 25% increase at once
        );
        decision.reason = 'High utilization and performance thresholds exceeded';

        // Determine urgency
        if (this.metrics.performance.errorRate > this.config.errorRateThreshold) {
          decision.urgency = 'high';
        }
      }
    } else if (optimalCount < this.currentAgentCount &&
               this.metrics.performance.utilization < this.config.minUtilization) {
      // Need to scale down
      if (!this.scaleDownCooldownActive || timeSinceLastScale > this.config.scaleDownCooldown) {
        decision.shouldScale = true;
        decision.direction = 'down';
        decision.scaleAmount = Math.min(
          this.currentAgentCount - optimalCount,
          Math.ceil(this.currentAgentCount * 0.15) // Max 15% decrease at once
        );
        decision.reason = 'Low utilization - cost optimization';
      }
    }

    return decision;
  }

  /**
   * Execute scaling operation
   */
  async executeScaling(decision) {
    const startTime = performance.now();

    try {
      this.emit('scaling_started', decision);

      // Set cooldown
      if (decision.direction === 'up') {
        this.scaleUpCooldownActive = true;
        setTimeout(() => { this.scaleUpCooldownActive = false; }, this.config.scaleUpCooldown);
      } else {
        this.scaleDownCooldownActive = true;
        setTimeout(() => { this.scaleDownCooldownActive = false; }, this.config.scaleDownCooldown);
      }

      // Publish scaling request
      await this.publishScalingEvent({
        type: 'scale_request',
        direction: decision.direction,
        amount: decision.scaleAmount,
        reason: decision.reason,
        urgency: decision.urgency,
        timestamp: Date.now()
      });

      // Update internal state
      const previousCount = this.currentAgentCount;
      if (decision.direction === 'up') {
        this.currentAgentCount += decision.scaleAmount;
        this.metrics.scaling.totalScaleUps++;
      } else {
        this.currentAgentCount -= decision.scaleAmount;
        this.metrics.scaling.totalScaleDowns++;
      }

      this.targetAgentCount = this.currentAgentCount;
      this.lastScaleTime = Date.now();
      this.lastScaleDirection = decision.direction;

      // Record scaling event
      const scaleEvent = {
        timestamp: Date.now(),
        direction: decision.direction,
        previousCount,
        newCount: this.currentAgentCount,
        amount: decision.scaleAmount,
        reason: decision.reason,
        duration: performance.now() - startTime
      };

      this.scaleHistory.push(scaleEvent);

      // Keep history size manageable
      if (this.scaleHistory.length > 1000) {
        this.scaleHistory = this.scaleHistory.slice(-500);
      }

      // Update metrics
      this.updateScalingMetrics(scaleEvent);

      // Save state to Redis
      await this.saveSystemState();

      this.emit('scaling_completed', scaleEvent);
      console.log(`📈 ${decision.direction === 'up' ? 'Scaled up' : 'Scaled down'} by ${decision.scaleAmount} agents to ${this.currentAgentCount} total`);

    } catch (error) {
      this.emit('error', { type: 'scaling_execution_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Collect system metrics
   */
  async collectSystemMetrics() {
    try {
      const cpuUsage = process.cpuUsage();
      const memoryUsage = process.memoryUsage();
      const systemLoad = os.loadavg();

      // Update system load metrics
      this.metrics.systemLoad = {
        cpu: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        memory: memoryUsage.heapUsed / memoryUsage.heapTotal,
        agents: this.currentAgentCount,
        tasks: await this.getCurrentTaskCount(),
        queueSize: await this.getQueueSize(),
        systemLoad: systemLoad[0] // 1-minute load average
      };

    } catch (error) {
      console.warn('Failed to collect system metrics:', error.message);
    }
  }

  /**
   * Collect performance metrics
   */
  async collectPerformanceMetrics() {
    try {
      // Get recent performance data from Redis
      const performanceData = await this.redis.hGetAll('performance:metrics');

      if (performanceData && Object.keys(performanceData).length > 0) {
        this.metrics.performance = {
          averageResponseTime: parseFloat(performanceData.avgResponseTime) || 0,
          errorRate: parseFloat(performanceData.errorRate) || 0,
          throughput: parseFloat(performanceData.throughput) || 0,
          utilization: this.calculateSystemUtilization()
        };
      }

    } catch (error) {
      console.warn('Failed to collect performance metrics:', error.message);
    }
  }

  /**
   * Calculate system utilization
   */
  calculateSystemUtilization() {
    const systemLoad = this.metrics.systemLoad;
    const maxTasks = this.currentAgentCount * 2; // Assume 2 tasks per agent max
    return Math.min(systemLoad.tasks / maxTasks, 1.0);
  }

  /**
   * Update load history for prediction
   */
  updateLoadHistory() {
    const dataPoint = {
      timestamp: Date.now(),
      load: this.metrics.systemLoad.tasks,
      agents: this.currentAgentCount,
      utilization: this.metrics.performance.utilization
    };

    this.loadHistory.push(dataPoint);

    // Keep history size limited
    if (this.loadHistory.length > this.config.loadHistorySize) {
      this.loadHistory = this.loadHistory.slice(-this.config.loadHistorySize);
    }
  }

  /**
   * Update predictions using various algorithms
   */
  async updatePredictions() {
    try {
      if (this.loadHistory.length < 10) return; // Need enough data

      // Linear regression prediction
      const linearPrediction = this.predictLinearRegression();

      // Moving average prediction
      const movingAveragePrediction = this.predictMovingAverage();

      // Store predictions
      this.predictions.set('linear', linearPrediction);
      this.predictions.set('moving_average', movingAveragePrediction);

      // Publish predictions
      await this.publishScalingEvent({
        type: 'predictions_updated',
        predictions: {
          linear: linearPrediction,
          movingAverage: movingAveragePrediction
        },
        timestamp: Date.now()
      });

    } catch (error) {
      console.warn('Failed to update predictions:', error.message);
    }
  }

  /**
   * Linear regression prediction
   */
  predictLinearRegression() {
    const n = Math.min(this.loadHistory.length, 20); // Use last 20 points
    if (n < 2) return null;

    const recentData = this.loadHistory.slice(-n);
    const x = recentData.map((_, i) => i);
    const y = recentData.map(d => d.load);

    // Calculate linear regression
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict future load
    const futureX = n + (this.config.predictionWindow / 15000); // Predict based on scaling cycles
    const predictedLoad = slope * futureX + intercept;

    return {
      algorithm: PREDICTION_ALGORITHMS.LINEAR_REGRESSION,
      predictedLoad: Math.max(0, predictedLoad),
      confidence: this.calculatePredictionConfidence(recentData),
      timestamp: Date.now()
    };
  }

  /**
   * Moving average prediction
   */
  predictMovingAverage() {
    const windowSize = Math.min(10, this.loadHistory.length);
    if (windowSize < 3) return null;

    const recentData = this.loadHistory.slice(-windowSize);
    const average = recentData.reduce((sum, d) => sum + d.load, 0) / windowSize;

    // Calculate trend
    const trend = (recentData[recentData.length - 1].load - recentData[0].load) / windowSize;

    // Predict future load
    const futureCycles = this.config.predictionWindow / 15000;
    const predictedLoad = average + (trend * futureCycles);

    return {
      algorithm: PREDICTION_ALGORITHMS.MOVING_AVERAGE,
      predictedLoad: Math.max(0, predictedLoad),
      confidence: this.calculatePredictionConfidence(recentData),
      timestamp: Date.now()
    };
  }

  /**
   * Get best current prediction
   */
  getPrediction() {
    if (this.predictions.size === 0) return null;

    // Use the prediction with highest confidence
    let bestPrediction = null;
    let bestConfidence = 0;

    for (const prediction of this.predictions.values()) {
      if (prediction.confidence > bestConfidence) {
        bestPrediction = prediction;
        bestConfidence = prediction.confidence;
      }
    }

    return bestPrediction;
  }

  /**
   * Calculate prediction confidence based on historical accuracy
   */
  calculatePredictionConfidence(data) {
    if (data.length < 3) return 0.5;

    // Calculate variance as a measure of stability
    const mean = data.reduce((sum, d) => sum + d.load, 0) / data.length;
    const variance = data.reduce((sum, d) => sum + Math.pow(d.load - mean, 2), 0) / data.length;

    // Lower variance = higher confidence
    const confidence = Math.max(0.1, 1 - (variance / (mean * mean)));
    return Math.min(confidence, 0.95);
  }

  /**
   * Update scaling metrics
   */
  updateScalingMetrics(scaleEvent) {
    // Update average scale time
    const totalScaleTime = this.metrics.scaling.averageScaleTime * (this.metrics.scaling.totalScaleUps + this.metrics.scaling.totalScaleDowns - 1) + scaleEvent.duration;
    const totalScaleEvents = this.metrics.scaling.totalScaleUps + this.metrics.scaling.totalScaleDowns;
    this.metrics.scaling.averageScaleTime = totalScaleTime / totalScaleEvents;

    // Calculate prediction accuracy if we have predictions
    if (this.predictions.size > 0) {
      const predictions = Array.from(this.predictions.values());
      const accuracies = predictions.map(p => {
        const actualLoad = this.metrics.systemLoad.tasks;
        const error = Math.abs(p.predictedLoad - actualLoad) / actualLoad;
        return Math.max(0, 1 - error);
      });
      this.metrics.scaling.predictionAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    }
  }

  /**
   * Helper methods
   */
  async getCurrentTaskCount() {
    try {
      const count = await this.redis.get('fleet:tasks:active') || '0';
      return parseInt(count, 10);
    } catch {
      return 0;
    }
  }

  async getQueueSize() {
    try {
      const size = await this.redis.lLen('fleet:tasks:queue') || 0;
      return size;
    } catch {
      return 0;
    }
  }

  async saveSystemState() {
    try {
      const state = {
        systemId: this.systemId,
        currentAgentCount: this.currentAgentCount,
        targetAgentCount: this.targetAgentCount,
        lastScaleTime: this.lastScaleTime,
        lastScaleDirection: this.lastScaleDirection,
        scaleHistory: this.scaleHistory.slice(-100), // Keep last 100 events
        metrics: this.metrics,
        timestamp: Date.now()
      };

      await this.redis.setEx(
        `scaling:state:${this.systemId}`,
        3600, // 1 hour TTL
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn('Failed to save system state:', error.message);
    }
  }

  async publishScalingEvent(data) {
    try {
      const eventData = {
        systemId: this.systemId,
        ...data,
        timestamp: Date.now()
      };

      await this.publisher.publish(this.config.channels.scaling, JSON.stringify(eventData));
    } catch (error) {
      console.warn('Failed to publish scaling event:', error.message);
    }
  }

  async publishMetrics() {
    try {
      const metricsData = {
        systemId: this.systemId,
        metrics: this.metrics,
        currentAgentCount: this.currentAgentCount,
        targetAgentCount: this.targetAgentCount,
        predictions: Array.from(this.predictions.values()),
        timestamp: Date.now()
      };

      await this.publisher.publish(this.config.channels.metrics, JSON.stringify(metricsData));
    } catch (error) {
      console.warn('Failed to publish metrics:', error.message);
    }
  }

  async cleanupOldData() {
    try {
      // Cleanup old load history
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
      this.loadHistory = this.loadHistory.filter(point => point.timestamp > cutoffTime);

      // Cleanup old predictions
      for (const [key, prediction] of this.predictions.entries()) {
        if (Date.now() - prediction.timestamp > this.config.predictionWindow) {
          this.predictions.delete(key);
        }
      }

      // Cleanup old scale history
      const scaleCutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
      this.scaleHistory = this.scaleHistory.filter(event => event.timestamp > scaleCutoffTime);

    } catch (error) {
      console.warn('Failed to cleanup old data:', error.message);
    }
  }

  /**
   * Event handlers
   */
  setupEventHandlers() {
    this.on('error', (error) => {
      console.error('❌ DynamicAgentScalingSystem error:', error);
    });

    this.on('status', (status) => {
      console.log(`📊 DynamicAgentScalingSystem status: ${status.status} - ${status.message}`);
    });
  }

  async handleMetricsMessage(message) {
    // Handle incoming metrics from other components
    if (message.type === 'performance_update') {
      // Update local performance metrics
      Object.assign(this.metrics.performance, message.metrics);
    }
  }

  async handleCoordinationMessage(message) {
    // Handle coordination messages
    switch (message.type) {
      case 'scale_acknowledgment':
        this.emit('scale_acknowledged', message);
        break;
      case 'scale_completed':
        this.emit('scale_completed', message);
        break;
    }
  }

  /**
   * Get system status and metrics
   */
  async getSystemStatus() {
    return {
      systemId: this.systemId,
      isRunning: this.isRunning,
      currentAgentCount: this.currentAgentCount,
      targetAgentCount: this.targetAgentCount,
      metrics: this.metrics,
      lastScaleTime: this.lastScaleTime,
      lastScaleDirection: this.lastScaleDirection,
      predictions: Array.from(this.predictions.values()),
      scaleHistory: this.scaleHistory.slice(-10),
      config: {
        maxConcurrentAgents: this.config.maxConcurrentAgents,
        targetUtilization: this.config.targetUtilization,
        scaleUpCooldown: this.config.scaleUpCooldown,
        scaleDownCooldown: this.config.scaleDownCooldown
      },
      timestamp: Date.now()
    };
  }

  /**
   * Force scaling operation
   */
  async forceScaling(direction, amount, reason = 'Manual scaling request') {
    const decision = {
      shouldScale: true,
      direction,
      amount,
      reason,
      urgency: 'high'
    };

    return await this.executeScaling(decision);
  }

  /**
   * Set scaling configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };

    this.emit('config_updated', { config: this.config });
    console.log('⚙️ Scaling configuration updated');
  }

  /**
   * Shutdown the scaling system
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Dynamic Agent Scaling System' });

    this.isRunning = false;

    // Clear all intervals
    if (this.scalingLoop) clearInterval(this.scalingLoop);
    if (this.predictionLoop) clearInterval(this.predictionLoop);
    if (this.metricsLoop) clearInterval(this.metricsLoop);
    if (this.cleanupLoop) clearInterval(this.cleanupLoop);
    if (this.resourceMonitor) clearInterval(this.resourceMonitor);
    if (this.performanceMonitor) clearInterval(this.performanceMonitor);

    // Save final state
    await this.saveSystemState();

    // Publish shutdown event
    await this.publishScalingEvent({
      type: 'scaling_system_shutdown',
      systemId: this.systemId,
      timestamp: Date.now()
    });

    // Close Redis connections
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
    if (this.redis) await this.redis.quit();

    this.emit('status', { status: 'shutdown', message: 'Dynamic Agent Scaling System shutdown complete' });
    console.log('🛑 Dynamic Agent Scaling System shutdown complete');
  }
}

export default DynamicAgentScalingSystem;