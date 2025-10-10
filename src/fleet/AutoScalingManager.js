/**
 * AutoScalingManager - Enterprise-grade auto-scaling mechanisms for 100+ concurrent agents
 *
 * Features:
 * - Intelligent auto-scaling with predictive algorithms
 * - Horizontal scaling with distributed coordination
 * - Performance-based scaling triggers
 * - Cost optimization and resource efficiency
 * - Advanced monitoring and alerting
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import os from 'os';
import crypto from 'crypto';

/**
 * Auto-scaling configuration
 */
const AUTOSCALING_CONFIG = {
  // Scaling policies
  policies: {
    scaleUp: {
      cpuThreshold: 0.80,           // 80% CPU utilization
      memoryThreshold: 0.85,        // 85% memory utilization
      responseTimeThreshold: 5000,  // 5 seconds response time
      queueLengthThreshold: 100,    // 100 tasks in queue
      sustainedPeriod: 300000,      // 5 minutes sustained period
      cooldownPeriod: 60000         // 1 minute cooldown
    },
    scaleDown: {
      cpuThreshold: 0.30,           // 30% CPU utilization
      memoryThreshold: 0.40,        // 40% memory utilization
      responseTimeThreshold: 1000,  // 1 second response time
      queueLengthThreshold: 10,     // 10 tasks in queue
      sustainedPeriod: 600000,      // 10 minutes sustained period
      cooldownPeriod: 120000        // 2 minutes cooldown
    }
  },

  // Scaling limits
  limits: {
    minAgents: 10,
    maxAgents: 1000,
    maxScaleUpStep: 50,             // Max agents to add at once
    maxScaleDownStep: 20,           // Max agents to remove at once
    scaleUpRateLimit: 100,          // Max agents per minute
    scaleDownRateLimit: 50          // Max agents per minute
  },

  // Prediction settings
  prediction: {
    enabled: true,
    algorithm: 'linear_regression',
    windowSize: 60,                 // 60 data points for prediction
    predictionHorizon: 900000,      // 15 minutes ahead
    confidenceThreshold: 0.7        // 70% confidence required
  },

  // Cost optimization
  cost: {
    enabled: true,
    targetCostEfficiency: 0.85,     // 85% cost efficiency target
    idleResourceThreshold: 0.20,    // 20% idle resources trigger cleanup
    priorityBasedScaling: true      // Scale based on task priority
  },

  // Redis configuration
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },

  // Channels for coordination
  channels: {
    autoscaling: 'swarm:scalability:autoscaling',
    metrics: 'swarm:scalability:metrics',
    coordination: 'swarm:scalability:coordination',
    alerts: 'swarm:scalability:alerts'
  }
};

/**
 * Scaling states
 */
const SCALING_STATES = {
  IDLE: 'idle',
  SCALING_UP: 'scaling_up',
  SCALING_DOWN: 'scaling_down',
  COOLDOWN: 'cooldown',
  PREDICTIVE_SCALING: 'predictive_scaling'
};

/**
 * Scaling reasons
 */
const SCALING_REASONS = {
  CPU_HIGH: 'cpu_high',
  MEMORY_HIGH: 'memory_high',
  RESPONSE_TIME_HIGH: 'response_time_high',
  QUEUE_LENGTH_HIGH: 'queue_length_high',
  CPU_LOW: 'cpu_low',
  MEMORY_LOW: 'memory_low',
  RESPONSE_TIME_LOW: 'response_time_low',
  QUEUE_LENGTH_LOW: 'queue_length_low',
  PREDICTIVE: 'predictive',
  COST_OPTIMIZATION: 'cost_optimization',
  MANUAL: 'manual'
};

/**
 * AutoScalingManager class
 */
export class AutoScalingManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...AUTOSCALING_CONFIG, ...options };
    this.managerId = `autoscaling-manager-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Redis clients
    this.redis = null;
    this.publisher = null;
    this.subscriber = null;

    // System state
    this.isInitialized = false;
    this.isRunning = false;
    this.currentState = SCALING_STATES.IDLE;

    // Scaling state
    this.currentAgentCount = 0;
    this.targetAgentCount = 0;
    this.lastScalingTime = 0;
    this.lastScalingDirection = null;
    this.scaleHistory = [];

    // Metrics and monitoring
    this.metrics = {
      scaling: {
        totalScaleUps: 0,
        totalScaleDowns: 0,
        successfulScalings: 0,
        failedScalings: 0,
        averageScalingTime: 0,
        predictiveAccuracy: 0
      },
      performance: {
        averageResponseTime: 0,
        cpuUtilization: 0,
        memoryUtilization: 0,
        queueLength: 0,
        throughput: 0
      },
      cost: {
        totalCost: 0,
        costEfficiency: 0,
        resourceWaste: 0,
        savings: 0
      }
    };

    // Prediction data
    this.predictionData = [];
    this.predictions = new Map();
    this.predictionAccuracy = [];

    // Scaling policies
    this.activePolicies = new Map();
    this.policyHistory = [];

    // Cooldown management
    this.cooldowns = new Map();

    // Timers
    this.monitoringTimer = null;
    this.evaluationTimer = null;
    this.predictionTimer = null;
    this.cleanupTimer = null;

    this.setupEventHandlers();
  }

  /**
   * Initialize the auto-scaling manager
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Auto Scaling Manager' });

      // Initialize Redis connections
      await this.initializeRedis();

      // Setup subscriptions
      await this.setupSubscriptions();

      // Initialize scaling state
      await this.initializeScalingState();

      // Setup default policies
      await this.setupDefaultPolicies();

      // Start auto-scaling processes
      this.startAutoScalingProcesses();

      this.isInitialized = true;
      this.isRunning = true;

      // Announce auto-scaling manager startup
      await this.publishAutoScalingEvent({
        type: 'autoscaling_manager_started',
        managerId: this.managerId,
        timestamp: Date.now(),
        config: this.config
      });

      this.emit('status', { status: 'running', message: 'Auto Scaling Manager initialized successfully' });
      console.log(`🚀 Auto Scaling Manager ${this.managerId} initialized`);

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

    console.log('📡 Redis connections established for auto-scaling manager');
  }

  /**
   * Setup Redis subscriptions
   */
  async setupSubscriptions() {
    await this.subscriber.subscribe(this.config.channels.metrics, (message) => {
      this.handleMetricsMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.config.channels.coordination, (message) => {
      this.handleCoordinationMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.config.channels.alerts, (message) => {
      this.handleAlertMessage(JSON.parse(message));
    });

    console.log('📡 Redis subscriptions configured for auto-scaling manager');
  }

  /**
   * Initialize scaling state
   */
  async initializeScalingState() {
    try {
      // Load current state from Redis
      const savedState = await this.redis.get(`autoscaling:state:${this.managerId}`);
      if (savedState) {
        const state = JSON.parse(savedState);
        this.currentAgentCount = state.currentAgentCount || this.config.limits.minAgents;
        this.targetAgentCount = state.targetAgentCount || this.config.limits.minAgents;
        this.scaleHistory = state.scaleHistory || [];
      } else {
        // Set initial values
        this.currentAgentCount = this.config.limits.minAgents;
        this.targetAgentCount = this.config.limits.minAgents;
      }

      // Get current metrics
      await this.collectCurrentMetrics();

      console.log(`📊 Initial agent count: ${this.currentAgentCount}`);
    } catch (error) {
      console.warn('Failed to initialize scaling state:', error.message);
      this.currentAgentCount = this.config.limits.minAgents;
      this.targetAgentCount = this.config.limits.minAgents;
    }
  }

  /**
   * Setup default scaling policies
   */
  async setupDefaultPolicies() {
    // CPU-based scaling policy
    this.activePolicies.set('cpu_policy', {
      name: 'CPU Utilization Policy',
      enabled: true,
      scaleUpTrigger: {
        metric: 'cpu',
        threshold: this.config.policies.scaleUp.cpuThreshold,
        sustainedPeriod: this.config.policies.scaleUp.sustainedPeriod
      },
      scaleDownTrigger: {
        metric: 'cpu',
        threshold: this.config.policies.scaleDown.cpuThreshold,
        sustainedPeriod: this.config.policies.scaleDown.sustainedPeriod
      },
      lastTriggered: null
    });

    // Memory-based scaling policy
    this.activePolicies.set('memory_policy', {
      name: 'Memory Utilization Policy',
      enabled: true,
      scaleUpTrigger: {
        metric: 'memory',
        threshold: this.config.policies.scaleUp.memoryThreshold,
        sustainedPeriod: this.config.policies.scaleUp.sustainedPeriod
      },
      scaleDownTrigger: {
        metric: 'memory',
        threshold: this.config.policies.scaleDown.memoryThreshold,
        sustainedPeriod: this.config.policies.scaleDown.sustainedPeriod
      },
      lastTriggered: null
    });

    // Queue length-based scaling policy
    this.activePolicies.set('queue_policy', {
      name: 'Queue Length Policy',
      enabled: true,
      scaleUpTrigger: {
        metric: 'queueLength',
        threshold: this.config.policies.scaleUp.queueLengthThreshold,
        sustainedPeriod: this.config.policies.scaleUp.sustainedPeriod
      },
      scaleDownTrigger: {
        metric: 'queueLength',
        threshold: this.config.policies.scaleDown.queueLengthThreshold,
        sustainedPeriod: this.config.policies.scaleDown.sustainedPeriod
      },
      lastTriggered: null
    });

    console.log('📋 Default scaling policies configured');
  }

  /**
   * Start auto-scaling processes
   */
  startAutoScalingProcesses() {
    // Metrics monitoring
    this.monitoringTimer = setInterval(async () => {
      await this.collectCurrentMetrics();
    }, 30000); // Every 30 seconds

    // Scaling evaluation
    this.evaluationTimer = setInterval(async () => {
      await this.evaluateScalingPolicies();
    }, 60000); // Every minute

    // Predictive scaling
    if (this.config.prediction.enabled) {
      this.predictionTimer = setInterval(async () => {
        await this.performPredictiveScaling();
      }, 300000); // Every 5 minutes
    }

    // Cleanup and optimization
    this.cleanupTimer = setInterval(async () => {
      await this.performCleanupAndOptimization();
    }, 600000); // Every 10 minutes

    console.log('🔄 Auto-scaling processes started');
  }

  /**
   * Collect current metrics
   */
  async collectCurrentMetrics() {
    try {
      // Get system metrics from Redis
      const metricsData = await this.redis.hGetAll('system:metrics');

      if (metricsData && Object.keys(metricsData).length > 0) {
        this.metrics.performance = {
          averageResponseTime: parseFloat(metricsData.avgResponseTime) || 0,
          cpuUtilization: parseFloat(metricsData.cpuUtilization) || 0,
          memoryUtilization: parseFloat(metricsData.memoryUtilization) || 0,
          queueLength: parseInt(metricsData.queueLength) || 0,
          throughput: parseFloat(metricsData.throughput) || 0
        };
      }

      // Add to prediction data
      this.predictionData.push({
        timestamp: Date.now(),
        ...this.metrics.performance,
        agentCount: this.currentAgentCount
      });

      // Keep prediction data size manageable
      if (this.predictionData.length > this.config.prediction.windowSize * 2) {
        this.predictionData = this.predictionData.slice(-this.config.prediction.windowSize);
      }

    } catch (error) {
      console.warn('Failed to collect metrics:', error.message);
    }
  }

  /**
   * Evaluate scaling policies
   */
  async evaluateScalingPolicies() {
    try {
      if (this.currentState === SCALING_STATES.COOLDOWN) {
        return; // Skip evaluation during cooldown
      }

      let shouldScaleUp = false;
      let shouldScaleDown = false;
      let triggeredPolicies = [];
      let reasons = [];

      // Evaluate each policy
      for (const [policyId, policy] of this.activePolicies) {
        if (!policy.enabled) continue;

        const evaluation = await this.evaluatePolicy(policy);
        if (evaluation.shouldScaleUp) {
          shouldScaleUp = true;
          triggeredPolicies.push(policyId);
          reasons.push(evaluation.reason);
        } else if (evaluation.shouldScaleDown) {
          shouldScaleDown = true;
          triggeredPolicies.push(policyId);
          reasons.push(evaluation.reason);
        }
      }

      // Make scaling decision
      if (shouldScaleUp && !shouldScaleDown) {
        await this.triggerScaleUp(triggeredPolicies, reasons);
      } else if (shouldScaleDown && !shouldScaleUp) {
        await this.triggerScaleDown(triggeredPolicies, reasons);
      }

    } catch (error) {
      this.emit('error', { type: 'policy_evaluation_failed', error: error.message });
    }
  }

  /**
   * Evaluate a single scaling policy
   */
  async evaluatePolicy(policy) {
    const now = Date.now();
    const currentMetricValue = this.metrics.performance[policy.scaleUpTrigger.metric];
    const evaluation = {
      shouldScaleUp: false,
      shouldScaleDown: false,
      reason: '',
      confidence: 0
    };

    // Check scale-up conditions
    if (currentMetricValue >= policy.scaleUpTrigger.threshold) {
      const sustainedPeriod = policy.scaleUpTrigger.sustainedPeriod;
      const timeAboveThreshold = this.calculateTimeAboveThreshold(
        policy.scaleUpTrigger.metric,
        policy.scaleUpTrigger.threshold,
        sustainedPeriod
      );

      if (timeAboveThreshold >= sustainedPeriod) {
        evaluation.shouldScaleUp = true;
        evaluation.reason = `${policy.name}: ${policy.scaleUpTrigger.metric} (${currentMetricValue}) >= threshold (${policy.scaleUpTrigger.threshold}) for sustained period`;
        evaluation.confidence = Math.min(1.0, currentMetricValue / policy.scaleUpTrigger.threshold);
      }
    }

    // Check scale-down conditions
    if (currentMetricValue <= policy.scaleDownTrigger.threshold) {
      const sustainedPeriod = policy.scaleDownTrigger.sustainedPeriod;
      const timeBelowThreshold = this.calculateTimeBelowThreshold(
        policy.scaleDownTrigger.metric,
        policy.scaleDownTrigger.threshold,
        sustainedPeriod
      );

      if (timeBelowThreshold >= sustainedPeriod) {
        evaluation.shouldScaleDown = true;
        evaluation.reason = `${policy.name}: ${policy.scaleDownTrigger.metric} (${currentMetricValue}) <= threshold (${policy.scaleDownTrigger.threshold}) for sustained period`;
        evaluation.confidence = Math.min(1.0, 1 - currentMetricValue / policy.scaleDownTrigger.threshold);
      }
    }

    return evaluation;
  }

  /**
   * Calculate time metric has been above threshold
   */
  calculateTimeAboveThreshold(metric, threshold, maxPeriod) {
    const now = Date.now();
    const cutoffTime = now - maxPeriod;

    let timeAboveThreshold = 0;
    let previousTime = null;
    let previousValue = null;

    for (const dataPoint of this.predictionData) {
      if (dataPoint.timestamp < cutoffTime) continue;

      const value = dataPoint[metric];
      if (value === undefined) continue;

      if (previousTime !== null && previousValue !== null) {
        if (previousValue >= threshold && value >= threshold) {
          timeAboveThreshold += dataPoint.timestamp - previousTime;
        }
      }

      previousTime = dataPoint.timestamp;
      previousValue = value;
    }

    return timeAboveThreshold;
  }

  /**
   * Calculate time metric has been below threshold
   */
  calculateTimeBelowThreshold(metric, threshold, maxPeriod) {
    const now = Date.now();
    const cutoffTime = now - maxPeriod;

    let timeBelowThreshold = 0;
    let previousTime = null;
    let previousValue = null;

    for (const dataPoint of this.predictionData) {
      if (dataPoint.timestamp < cutoffTime) continue;

      const value = dataPoint[metric];
      if (value === undefined) continue;

      if (previousTime !== null && previousValue !== null) {
        if (previousValue <= threshold && value <= threshold) {
          timeBelowThreshold += dataPoint.timestamp - previousTime;
        }
      }

      previousTime = dataPoint.timestamp;
      previousValue = value;
    }

    return timeBelowThreshold;
  }

  /**
   * Trigger scale-up operation
   */
  async triggerScaleUp(triggeredPolicies, reasons) {
    if (this.currentState !== SCALING_STATES.IDLE) {
      console.log('⏸️ Scaling already in progress, skipping scale-up');
      return;
    }

    // Check cooldown
    if (this.isInCooldown('scale_up')) {
      console.log('⏸️ Scale-up cooldown active, skipping');
      return;
    }

    try {
      this.currentState = SCALING_STATES.SCALING_UP;
      const startTime = performance.now();

      // Calculate target agent count
      const targetCount = this.calculateScaleUpTarget();

      if (targetCount <= this.currentAgentCount) {
        this.currentState = SCALING_STATES.IDLE;
        return;
      }

      // Apply limits
      const finalTargetCount = Math.min(targetCount, this.config.limits.maxAgents);
      const scaleAmount = finalTargetCount - this.currentAgentCount;

      // Publish scaling event
      await this.publishAutoScalingEvent({
        type: 'scale_up_initiated',
        currentCount: this.currentAgentCount,
        targetCount: finalTargetCount,
        scaleAmount,
        triggeredPolicies,
        reasons,
        timestamp: Date.now()
      });

      // Execute scaling (in production, would integrate with orchestration system)
      await this.executeScaling(this.currentAgentCount, finalTargetCount, 'up');

      // Update state
      this.currentAgentCount = finalTargetCount;
      this.targetAgentCount = finalTargetCount;
      this.lastScalingTime = Date.now();
      this.lastScalingDirection = 'up';

      // Update metrics
      this.updateScalingMetrics('up', performance.now() - startTime, true);

      // Set cooldown
      this.setCooldown('scale_up', this.config.policies.scaleUp.cooldownPeriod);

      // Record scaling event
      this.recordScalingEvent('up', scaleAmount, triggeredPolicies, reasons);

      this.currentState = SCALING_STATES.IDLE;

      this.emit('scale_up_completed', {
        previousCount: this.currentAgentCount - scaleAmount,
        newCount: this.currentAgentCount,
        scaleAmount,
        reasons
      });

      console.log(`📈 Scaled up by ${scaleAmount} agents to ${this.currentAgentCount} total`);

    } catch (error) {
      this.currentState = SCALING_STATES.IDLE;
      this.metrics.scaling.failedScalings++;
      this.emit('error', { type: 'scale_up_failed', error: error.message });
    }
  }

  /**
   * Trigger scale-down operation
   */
  async triggerScaleDown(triggeredPolicies, reasons) {
    if (this.currentState !== SCALING_STATES.IDLE) {
      console.log('⏸️ Scaling already in progress, skipping scale-down');
      return;
    }

    // Check cooldown
    if (this.isInCooldown('scale_down')) {
      console.log('⏸️ Scale-down cooldown active, skipping');
      return;
    }

    try {
      this.currentState = SCALING_STATES.SCALING_DOWN;
      const startTime = performance.now();

      // Calculate target agent count
      const targetCount = this.calculateScaleDownTarget();

      if (targetCount >= this.currentAgentCount) {
        this.currentState = SCALING_STATES.IDLE;
        return;
      }

      // Apply limits
      const finalTargetCount = Math.max(targetCount, this.config.limits.minAgents);
      const scaleAmount = this.currentAgentCount - finalTargetCount;

      // Publish scaling event
      await this.publishAutoScalingEvent({
        type: 'scale_down_initiated',
        currentCount: this.currentAgentCount,
        targetCount: finalTargetCount,
        scaleAmount,
        triggeredPolicies,
        reasons,
        timestamp: Date.now()
      });

      // Execute scaling (in production, would integrate with orchestration system)
      await this.executeScaling(this.currentAgentCount, finalTargetCount, 'down');

      // Update state
      this.currentAgentCount = finalTargetCount;
      this.targetAgentCount = finalTargetCount;
      this.lastScalingTime = Date.now();
      this.lastScalingDirection = 'down';

      // Update metrics
      this.updateScalingMetrics('down', performance.now() - startTime, true);

      // Set cooldown
      this.setCooldown('scale_down', this.config.policies.scaleDown.cooldownPeriod);

      // Record scaling event
      this.recordScalingEvent('down', scaleAmount, triggeredPolicies, reasons);

      this.currentState = SCALING_STATES.IDLE;

      this.emit('scale_down_completed', {
        previousCount: this.currentAgentCount + scaleAmount,
        newCount: this.currentAgentCount,
        scaleAmount,
        reasons
      });

      console.log(`📉 Scaled down by ${scaleAmount} agents to ${this.currentAgentCount} total`);

    } catch (error) {
      this.currentState = SCALING_STATES.IDLE;
      this.metrics.scaling.failedScalings++;
      this.emit('error', { type: 'scale_down_failed', error: error.message });
    }
  }

  /**
   * Calculate scale-up target
   */
  calculateScaleUpTarget() {
    const currentLoad = this.metrics.performance;
    let targetCount = this.currentAgentCount;

    // CPU-based scaling
    if (currentLoad.cpuUtilization > this.config.policies.scaleUp.cpuThreshold) {
      const cpuFactor = currentLoad.cpuUtilization / this.config.policies.scaleUp.cpuThreshold;
      targetCount = Math.ceil(targetCount * cpuFactor);
    }

    // Memory-based scaling
    if (currentLoad.memoryUtilization > this.config.policies.scaleUp.memoryThreshold) {
      const memoryFactor = currentLoad.memoryUtilization / this.config.policies.scaleUp.memoryThreshold;
      targetCount = Math.ceil(targetCount * memoryFactor);
    }

    // Queue-based scaling
    if (currentLoad.queueLength > this.config.policies.scaleUp.queueLengthThreshold) {
      const queueFactor = currentLoad.queueLength / this.config.policies.scaleUp.queueLengthThreshold;
      targetCount = Math.ceil(targetCount * queueFactor);
    }

    // Apply rate limiting
    const maxIncrease = Math.min(
      this.config.limits.maxScaleUpStep,
      Math.floor((Date.now() - this.lastScalingTime) / 60000) * this.config.limits.scaleUpRateLimit
    );

    return Math.min(targetCount, this.currentAgentCount + maxIncrease);
  }

  /**
   * Calculate scale-down target
   */
  calculateScaleDownTarget() {
    const currentLoad = this.metrics.performance;
    let targetCount = this.currentAgentCount;

    // CPU-based scaling
    if (currentLoad.cpuUtilization < this.config.policies.scaleDown.cpuThreshold) {
      const cpuFactor = currentLoad.cpuUtilization / this.config.policies.scaleDown.cpuThreshold;
      targetCount = Math.ceil(targetCount * cpuFactor);
    }

    // Memory-based scaling
    if (currentLoad.memoryUtilization < this.config.policies.scaleDown.memoryThreshold) {
      const memoryFactor = currentLoad.memoryUtilization / this.config.policies.scaleDown.memoryThreshold;
      targetCount = Math.ceil(targetCount * memoryFactor);
    }

    // Queue-based scaling
    if (currentLoad.queueLength < this.config.policies.scaleDown.queueLengthThreshold) {
      const queueFactor = currentLoad.queueLength / this.config.policies.scaleDown.queueLengthThreshold;
      targetCount = Math.ceil(targetCount * queueFactor);
    }

    // Apply rate limiting
    const maxDecrease = Math.min(
      this.config.limits.maxScaleDownStep,
      Math.floor((Date.now() - this.lastScalingTime) / 60000) * this.config.limits.scaleDownRateLimit
    );

    return Math.max(targetCount, this.currentAgentCount - maxDecrease);
  }

  /**
   * Execute scaling operation
   */
  async executeScaling(fromCount, toCount, direction) {
    // In production, this would integrate with container orchestration,
    // cloud provider APIs, or other scaling mechanisms
    console.log(`🔄 Executing scaling ${direction}: ${fromCount} -> ${toCount} agents`);

    // Simulate scaling time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate success
    return true;
  }

  /**
   * Perform predictive scaling
   */
  async performPredictiveScaling() {
    try {
      if (!this.config.prediction.enabled || this.predictionData.length < this.config.prediction.windowSize) {
        return;
      }

      this.currentState = SCALING_STATES.PREDICTIVE_SCALING;

      // Generate predictions
      const predictions = await this.generatePredictions();

      // Evaluate if predictive scaling is needed
      const predictedLoad = predictions.cpu || 0;
      const currentLoad = this.metrics.performance.cpuUtilization;

      if (predictedLoad > this.config.policies.scaleUp.cpuThreshold &&
          predictedLoad > currentLoad * 1.2) {
        // Predicted load is significantly higher, scale up proactively
        const scaleUpFactor = predictedLoad / this.config.policies.scaleUp.cpuThreshold;
        const targetCount = Math.ceil(this.currentAgentCount * scaleUpFactor);

        if (targetCount > this.currentAgentCount) {
          await this.triggerPredictiveScaleUp(targetCount, predictions);
        }
      }

      this.currentState = SCALING_STATES.IDLE;

    } catch (error) {
      this.currentState = SCALING_STATES.IDLE;
      this.emit('error', { type: 'predictive_scaling_failed', error: error.message });
    }
  }

  /**
   * Generate predictions using linear regression
   */
  async generatePredictions() {
    try {
      const windowSize = this.config.prediction.windowSize;
      const recentData = this.predictionData.slice(-windowSize);

      if (recentData.length < 10) {
        return {};
      }

      // Simple linear regression for CPU utilization
      const cpuPrediction = this.predictLinearRegression(
        recentData.map((d, i) => ({ x: i, y: d.cpuUtilization })),
        this.config.prediction.predictionHorizon / (30000) // Predict in 30-second intervals
      );

      // Store prediction
      const prediction = {
        timestamp: Date.now(),
        horizon: this.config.prediction.predictionHorizon,
        cpu: cpuPrediction,
        confidence: this.calculatePredictionConfidence(recentData)
      };

      this.predictions.set('latest', prediction);

      return prediction;

    } catch (error) {
      console.warn('Failed to generate predictions:', error.message);
      return {};
    }
  }

  /**
   * Simple linear regression prediction
   */
  predictLinearRegression(dataPoints, stepsAhead) {
    if (dataPoints.length < 2) return dataPoints[0]?.y || 0;

    const n = dataPoints.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (const point of dataPoints) {
      sumX += point.x;
      sumY += point.y;
      sumXY += point.x * point.y;
      sumXX += point.x * point.x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const futureX = n + stepsAhead;
    const prediction = slope * futureX + intercept;

    return Math.max(0, Math.min(1, prediction));
  }

  /**
   * Calculate prediction confidence
   */
  calculatePredictionConfidence(dataPoints) {
    if (dataPoints.length < 3) return 0.5;

    const values = dataPoints.map(d => d.cpuUtilization);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    // Lower variance = higher confidence
    const confidence = Math.max(0.1, 1 - (standardDeviation / mean));
    return Math.min(confidence, 0.95);
  }

  /**
   * Trigger predictive scale-up
   */
  async triggerPredictiveScaleUp(targetCount, predictions) {
    if (targetCount <= this.currentAgentCount) return;

    const scaleAmount = targetCount - this.currentAgentCount;
    const limitedScaleAmount = Math.min(scaleAmount, this.config.limits.maxScaleUpStep);
    const finalTargetCount = this.currentAgentCount + limitedScaleAmount;

    await this.publishAutoScalingEvent({
      type: 'predictive_scale_up',
      currentCount: this.currentAgentCount,
      targetCount: finalTargetCount,
      scaleAmount: limitedScaleAmount,
      predictions,
      timestamp: Date.now()
    });

    // Execute scaling
    await this.executeScaling(this.currentAgentCount, finalTargetCount, 'up');

    // Update state
    this.currentAgentCount = finalTargetCount;
    this.targetAgentCount = finalTargetCount;

    console.log(`🔮 Predictive scale-up: +${limitedScaleAmount} agents to ${this.currentAgentCount} total`);
  }

  /**
   * Perform cleanup and optimization
   */
  async performCleanupAndOptimization() {
    try {
      if (!this.config.cost.enabled) return;

      // Check for idle resources
      const idleThreshold = this.config.cost.idleResourceThreshold;
      const currentUtilization = this.metrics.performance.cpuUtilization;

      if (currentUtilization < idleThreshold && this.currentAgentCount > this.config.limits.minAgents) {
        // Optimize for cost
        const targetCount = Math.max(
          Math.ceil(this.currentAgentCount * currentUtilization),
          this.config.limits.minAgents
        );

        if (targetCount < this.currentAgentCount) {
          await this.triggerCostOptimization(targetCount);
        }
      }

      // Cleanup old data
      this.cleanupOldData();

    } catch (error) {
      this.emit('error', { type: 'cleanup_failed', error: error.message });
    }
  }

  /**
   * Trigger cost optimization scaling
   */
  async triggerCostOptimization(targetCount) {
    const scaleAmount = this.currentAgentCount - targetCount;

    await this.publishAutoScalingEvent({
      type: 'cost_optimization_scale_down',
      currentCount: this.currentAgentCount,
      targetCount,
      scaleAmount,
      reason: 'Cost optimization - low utilization',
      timestamp: Date.now()
    });

    // Execute scaling
    await this.executeScaling(this.currentAgentCount, targetCount, 'down');

    // Update state
    this.currentAgentCount = targetCount;
    this.targetAgentCount = targetCount;

    // Update cost metrics
    this.metrics.cost.savings += scaleAmount * 0.1; // Simplified cost calculation

    console.log(`💰 Cost optimization: scaled down by ${scaleAmount} agents to ${this.currentAgentCount} total`);
  }

  /**
   * Cooldown management
   */
  setCooldown(type, duration) {
    this.cooldowns.set(type, {
      endTime: Date.now() + duration,
      duration
    });
  }

  isInCooldown(type) {
    const cooldown = this.cooldowns.get(type);
    if (!cooldown) return false;
    return Date.now() < cooldown.endTime;
  }

  /**
   * Update scaling metrics
   */
  updateScalingMetrics(direction, duration, success) {
    this.metrics.scaling.successfulScalings++;

    if (direction === 'up') {
      this.metrics.scaling.totalScaleUps++;
    } else {
      this.metrics.scaling.totalScaleDowns++;
    }

    // Update average scaling time
    const totalScalings = this.metrics.scaling.totalScaleUps + this.metrics.scaling.totalScaleDowns;
    this.metrics.scaling.averageScalingTime =
      (this.metrics.scaling.averageScalingTime * (totalScalings - 1) + duration) / totalScalings;
  }

  /**
   * Record scaling event
   */
  recordScalingEvent(direction, amount, policies, reasons) {
    const event = {
      timestamp: Date.now(),
      direction,
      amount,
      policies,
      reasons,
      previousCount: this.currentAgentCount - (direction === 'up' ? amount : -amount),
      newCount: this.currentAgentCount
    };

    this.scaleHistory.push(event);

    // Keep history manageable
    if (this.scaleHistory.length > 100) {
      this.scaleHistory = this.scaleHistory.slice(-50);
    }

    // Save to Redis
    this.saveAutoScalingState();
  }

  /**
   * Cleanup old data
   */
  cleanupOldData() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    this.predictionData = this.predictionData.filter(data => data.timestamp > cutoffTime);

    // Clean old predictions
    for (const [key, prediction] of this.predictions.entries()) {
      if (Date.now() - prediction.timestamp > this.config.prediction.predictionHorizon * 2) {
        this.predictions.delete(key);
      }
    }
  }

  /**
   * Save auto-scaling state to Redis
   */
  async saveAutoScalingState() {
    try {
      const state = {
        managerId: this.managerId,
        currentAgentCount: this.currentAgentCount,
        targetAgentCount: this.targetAgentCount,
        lastScalingTime: this.lastScalingTime,
        lastScalingDirection: this.lastScalingDirection,
        scaleHistory: this.scaleHistory.slice(-20),
        metrics: this.metrics,
        timestamp: Date.now()
      };

      await this.redis.setEx(
        `autoscaling:state:${this.managerId}`,
        3600, // 1 hour TTL
        JSON.stringify(state)
      );
    } catch (error) {
      console.warn('Failed to save auto-scaling state:', error.message);
    }
  }

  /**
   * Publish auto-scaling event
   */
  async publishAutoScalingEvent(data) {
    try {
      const eventData = {
        managerId: this.managerId,
        ...data,
        timestamp: Date.now()
      };

      await this.publisher.publish(this.config.channels.autoscaling, JSON.stringify(eventData));
    } catch (error) {
      console.warn('Failed to publish auto-scaling event:', error.message);
    }
  }

  /**
   * Handle Redis messages
   */
  handleMetricsMessage(message) {
    switch (message.type) {
      case 'metrics_update':
        // Update local metrics cache
        Object.assign(this.metrics.performance, message.metrics);
        break;
    }
  }

  handleCoordinationMessage(message) {
    switch (message.type) {
      case 'scaling_request':
        this.handleScalingRequest(message);
        break;
      case 'scaling_acknowledgment':
        this.handleScalingAcknowledgment(message);
        break;
    }
  }

  handleAlertMessage(message) {
    switch (message.type) {
      case 'performance_alert':
        this.handlePerformanceAlert(message);
        break;
    }
  }

  handleScalingRequest(message) {
    this.emit('scaling_request', message);
  }

  handleScalingAcknowledgment(message) {
    this.emit('scaling_acknowledgment', message);
  }

  handlePerformanceAlert(message) {
    // Trigger immediate evaluation if critical
    if (message.severity === 'critical') {
      this.evaluateScalingPolicies();
    }
  }

  /**
   * Get auto-scaling status
   */
  async getAutoScalingStatus() {
    return {
      managerId: this.managerId,
      isRunning: this.isRunning,
      currentState: this.currentState,
      agentCounts: {
        current: this.currentAgentCount,
        target: this.targetAgentCount,
        min: this.config.limits.minAgents,
        max: this.config.limits.maxAgents
      },
      metrics: this.metrics,
      policies: Array.from(this.activePolicies.entries()).map(([id, policy]) => ({
        id,
        name: policy.name,
        enabled: policy.enabled,
        lastTriggered: policy.lastTriggered
      })),
      predictions: Array.from(this.predictions.values()),
      scaleHistory: this.scaleHistory.slice(-10),
      cooldowns: Array.from(this.cooldowns.entries()).map(([type, cooldown]) => ({
        type,
        remainingTime: Math.max(0, cooldown.endTime - Date.now())
      })),
      timestamp: Date.now()
    };
  }

  /**
   * Manual scaling operations
   */
  async manualScaleUp(amount, reason = 'Manual scale-up request') {
    const targetCount = Math.min(this.currentAgentCount + amount, this.config.limits.maxAgents);
    await this.triggerScaleUp(['manual'], [reason]);
  }

  async manualScaleDown(amount, reason = 'Manual scale-down request') {
    const targetCount = Math.max(this.currentAgentCount - amount, this.config.limits.minAgents);
    await this.triggerScaleDown(['manual'], [reason]);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.emit('config_updated', { config: this.config });
    console.log('⚙️ Auto-scaling configuration updated');
  }

  /**
   * Event handlers
   */
  setupEventHandlers() {
    this.on('error', (error) => {
      console.error('❌ AutoScalingManager error:', error);
    });

    this.on('status', (status) => {
      console.log(`📊 AutoScalingManager status: ${status.status} - ${status.message}`);
    });
  }

  /**
   * Shutdown the auto-scaling manager
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Auto Scaling Manager' });

    this.isRunning = false;
    this.currentState = SCALING_STATES.IDLE;

    // Clear all timers
    if (this.monitoringTimer) clearInterval(this.monitoringTimer);
    if (this.evaluationTimer) clearInterval(this.evaluationTimer);
    if (this.predictionTimer) clearInterval(this.predictionTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    // Save final state
    await this.saveAutoScalingState();

    // Publish shutdown event
    await this.publishAutoScalingEvent({
      type: 'autoscaling_manager_shutdown',
      managerId: this.managerId,
      timestamp: Date.now()
    });

    // Close Redis connections
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
    if (this.redis) await this.redis.quit();

    this.emit('status', { status: 'shutdown', message: 'Auto Scaling Manager shutdown complete' });
    console.log('🛑 Auto Scaling Manager shutdown complete');
  }
}

export default AutoScalingManager;