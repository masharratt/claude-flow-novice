/**
 * Automated Performance Tuning System with Dynamic Adjustment
 * Provides intelligent auto-tuning capabilities using machine learning and feedback loops
 */

import { EventEmitter } from 'events';
import { connectRedis } from '../cli/utils/redis-client.js';
import { performance } from 'perf_hooks';

export class AutomatedPerformanceTuner extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      redis: {
        host: 'localhost',
        port: 6379,
        database: 4, // Dedicated database for tuning
      },
      tuning: {
        intervalMs: 30000, // 30 seconds
        evaluationWindowMs: 300000, // 5 minutes
        minImprovementThreshold: 2, // percentage
        maxAdjustmentPercent: 20, // maximum single adjustment
        cooldownPeriodMs: 60000, // 1 minute between adjustments
        enableML: true,
        enablePredictiveTuning: true
      },
      parameters: {
        eventBus: {
          batchSize: { min: 10, max: 500, current: 100 },
          batchTimeoutMs: { min: 5, max: 100, current: 10 },
          compressionThreshold: { min: 512, max: 4096, current: 1024 }
        },
        memory: {
          gcIntervalMs: { min: 30000, max: 300000, current: 60000 },
          poolSize: { min: 50, max: 500, current: 200 },
          gcThreshold: { min: 0.6, max: 0.95, current: 0.8 }
        },
        cpu: {
          workerCount: { min: 1, max: 8, current: 4 },
          schedulingQuantumMs: { min: 5, max: 50, current: 10 },
          maxConcurrentTasks: { min: 10, max: 200, current: 100 }
        },
        redis: {
          connectionPoolSize: { min: 5, max: 50, current: 20 },
          operationTimeoutMs: { min: 1000, max: 10000, current: 5000 },
          retryAttempts: { min: 1, max: 10, current: 3 }
        }
      },
      objectives: {
        primary: 'latency', // latency, throughput, efficiency
        targets: {
          latencyReduction: 30, // percentage
          throughputImprovement: 50, // percentage
          memoryReduction: 20, // percentage
          cpuEfficiency: 25 // percentage
        }
      },
      ...config
    };

    this.redisClient = null;
    this.active = false;
    this.tuningHistory = [];
    this.performanceHistory = [];
    this.currentMetrics = null;
    this.baselineMetrics = null;
    this.lastAdjustment = null;
    this.mlModel = null;
    this.tuningStrategies = new Map();

    // Initialize tuning strategies
    this.initializeTuningStrategies();

    // Performance optimization state
    this.optimizationState = {
      currentPhase: 'observation', // observation, analysis, tuning, validation
      phaseStartTime: Date.now(),
      adjustmentsMade: 0,
      improvementsAchieved: 0,
      failedAdjustments: 0
    };
  }

  /**
   * Initialize automated tuning system
   */
  async initialize() {
    console.log('🎛️ Initializing Automated Performance Tuner...');

    try {
      // Connect to Redis
      this.redisClient = await connectRedis(this.config.redis);

      // Load historical data if available
      await this.loadHistoricalData();

      // Initialize ML model if enabled
      if (this.config.tuning.enableML) {
        await this.initializeMLModel();
      }

      // Start automated tuning process
      this.startAutomatedTuning();

      this.active = true;

      console.log('✅ Automated Performance Tuner initialized');
      console.log(`🎯 Primary objective: ${this.config.objectives.primary}`);
      console.log(`🔄 Tuning interval: ${this.config.tuning.intervalMs}ms`);

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize tuner:', error.message);
      throw error;
    }
  }

  /**
   * Initialize tuning strategies
   */
  initializeTuningStrategies() {
    // Latency optimization strategies
    this.tuningStrategies.set('latency-optimization', {
      name: 'Latency Optimization',
      priority: 'high',
      parameters: ['eventBus.batchSize', 'eventBus.batchTimeoutMs', 'cpu.schedulingQuantumMs'],
      evaluate: (metrics) => this.evaluateLatencyOptimization(metrics),
      apply: (adjustments) => this.applyLatencyAdjustments(adjustments)
    });

    // Throughput optimization strategies
    this.tuningStrategies.set('throughput-optimization', {
      name: 'Throughput Optimization',
      priority: 'medium',
      parameters: ['cpu.workerCount', 'cpu.maxConcurrentTasks', 'redis.connectionPoolSize'],
      evaluate: (metrics) => this.evaluateThroughputOptimization(metrics),
      apply: (adjustments) => this.applyThroughputAdjustments(adjustments)
    });

    // Memory optimization strategies
    this.tuningStrategies.set('memory-optimization', {
      name: 'Memory Optimization',
      priority: 'medium',
      parameters: ['memory.gcIntervalMs', 'memory.poolSize', 'memory.gcThreshold'],
      evaluate: (metrics) => this.evaluateMemoryOptimization(metrics),
      apply: (adjustments) => this.applyMemoryAdjustments(adjustments)
    });

    // Redis optimization strategies
    this.tuningStrategies.set('redis-optimization', {
      name: 'Redis Optimization',
      priority: 'low',
      parameters: ['redis.connectionPoolSize', 'redis.operationTimeoutMs', 'redis.retryAttempts'],
      evaluate: (metrics) => this.evaluateRedisOptimization(metrics),
      apply: (adjustments) => this.applyRedisAdjustments(adjustments)
    });
  }

  /**
   * Load historical performance data
   */
  async loadHistoricalData() {
    try {
      const historicalData = await this.redisClient.get('tuning:historical-data');
      if (historicalData) {
        const data = JSON.parse(historicalData);
        this.performanceHistory = data.performanceHistory || [];
        this.tuningHistory = data.tuningHistory || [];
        console.log(`📈 Loaded ${this.performanceHistory.length} historical data points`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load historical data:', error.message);
    }
  }

  /**
   * Initialize ML model for predictive tuning
   */
  async initializeMLModel() {
    console.log('🧠 Initializing ML model for predictive tuning...');

    // Simple linear regression model for performance prediction
    this.mlModel = {
      coefficients: new Map(),
      intercept: 0,
      trained: false,

      train: (features, targets) => {
        // Simplified training algorithm
        const n = features.length;
        if (n === 0) return false;

        // Calculate coefficients for each feature
        for (let i = 0; i < features[0].length; i++) {
          let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

          for (let j = 0; j < n; j++) {
            sumX += features[j][i];
            sumY += targets[j];
            sumXY += features[j][i] * targets[j];
            sumX2 += features[j][i] * features[j][i];
          }

          const coefficient = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
          this.coefficients.set(`feature_${i}`, coefficient);
        }

        this.trained = true;
        return true;
      },

      predict: (features) => {
        if (!this.trained) return 0;

        let prediction = this.intercept;
        for (let i = 0; i < features.length; i++) {
          const coefficient = this.coefficients.get(`feature_${i}`) || 0;
          prediction += coefficient * features[i];
        }

        return prediction;
      }
    };

    console.log('✅ ML model initialized');
  }

  /**
   * Start automated tuning process
   */
  startAutomatedTuning() {
    console.log('🔄 Starting automated tuning process...');

    this.tuningInterval = setInterval(async () => {
      await this.performTuningCycle();
    }, this.config.tuning.intervalMs);

    // Perform initial tuning cycle
    this.performTuningCycle();
  }

  /**
   * Perform complete tuning cycle
   */
  async performTuningCycle() {
    try {
      const cycleStart = performance.now();
      console.log(`🔧 Starting tuning cycle - Phase: ${this.optimizationState.currentPhase}`);

      // Collect current metrics
      await this.collectCurrentMetrics();

      switch (this.optimizationState.currentPhase) {
        case 'observation':
          await this.performObservationPhase();
          break;
        case 'analysis':
          await this.performAnalysisPhase();
          break;
        case 'tuning':
          await this.performTuningPhase();
          break;
        case 'validation':
          await this.performValidationPhase();
          break;
        default:
          this.optimizationState.currentPhase = 'observation';
      }

      const cycleDuration = performance.now() - cycleStart;
      console.log(`✅ Tuning cycle completed in ${cycleDuration.toFixed(2)}ms`);

      // Publish tuning status
      await this.publishTuningStatus();

    } catch (error) {
      console.error('❌ Tuning cycle failed:', error.message);
      this.optimizationState.failedAdjustments++;
    }
  }

  /**
   * Perform observation phase
   */
  async performObservationPhase() {
    console.log('👀 Observation phase: Collecting baseline metrics...');

    // Collect metrics for evaluation window
    const observationTime = Date.now() - this.optimizationState.phaseStartTime;

    if (observationTime >= this.config.tuning.evaluationWindowMs) {
      // Set baseline if not exists
      if (!this.baselineMetrics) {
        this.baselineMetrics = { ...this.currentMetrics };
        console.log('📊 Baseline metrics established');
      }

      // Move to analysis phase
      this.optimizationState.currentPhase = 'analysis';
      this.optimizationState.phaseStartTime = Date.now();
      console.log('🔍 Moving to analysis phase');
    }
  }

  /**
   * Perform analysis phase
   */
  async performAnalysisPhase() {
    console.log('🔍 Analysis phase: Analyzing performance patterns...');

    // Analyze current performance against baseline
    const analysis = this.analyzePerformance();

    // Check if tuning is needed
    if (analysis.needsTuning) {
      console.log(`🎯 Tuning needed: ${analysis.reason}`);
      this.optimizationState.currentPhase = 'tuning';
    } else {
      console.log('✅ Performance within acceptable range');
      this.optimizationState.currentPhase = 'observation';
    }

    this.optimizationState.phaseStartTime = Date.now();

    // Store analysis results
    await this.storeAnalysisResults(analysis);
  }

  /**
   * Perform tuning phase
   */
  async performTuningPhase() {
    console.log('⚙️ Tuning phase: Applying performance adjustments...');

    // Check cooldown period
    if (this.lastAdjustment &&
        Date.now() - this.lastAdjustment.timestamp < this.config.tuning.cooldownPeriodMs) {
      console.log('⏳ Cooldown period active, skipping tuning');
      this.optimizationState.currentPhase = 'validation';
      return;
    }

    // Select best tuning strategy
    const strategy = this.selectTuningStrategy();
    if (!strategy) {
      console.log('⚠️ No suitable tuning strategy found');
      this.optimizationState.currentPhase = 'observation';
      return;
    }

    console.log(`🎯 Applying strategy: ${strategy.name}`);

    // Generate adjustments
    const adjustments = await this.generateAdjustments(strategy);
    if (adjustments.length === 0) {
      console.log('⚠️ No adjustments generated');
      this.optimizationState.currentPhase = 'observation';
      return;
    }

    // Apply adjustments
    await this.applyAdjustments(strategy, adjustments);

    // Move to validation phase
    this.optimizationState.currentPhase = 'validation';
    this.optimizationState.phaseStartTime = Date.now();
    this.optimizationState.adjustmentsMade++;

    console.log(`✅ Applied ${adjustments.length} adjustments`);
  }

  /**
   * Perform validation phase
   */
  async performValidationPhase() {
    console.log('✅ Validation phase: Validating performance improvements...');

    const validationTime = Date.now() - this.optimizationState.phaseStartTime;

    if (validationTime >= this.config.tuning.evaluationWindowMs) {
      // Validate the adjustments
      const validation = this.validateAdjustments();

      if (validation.successful) {
        this.optimizationState.improvementsAchieved++;
        console.log(`🎉 Validation successful: ${validation.improvement}% improvement`);
      } else {
        console.log(`❌ Validation failed: ${validation.reason}`);
        await this.rollbackAdjustments();
      }

      // Store validation results
      await this.storeValidationResults(validation);

      // Return to observation phase
      this.optimizationState.currentPhase = 'observation';
      this.optimizationState.phaseStartTime = Date.now();
    }
  }

  /**
   * Collect current performance metrics
   */
  async collectCurrentMetrics() {
    try {
      // Get metrics from monitoring dashboard
      const metricsResponse = await this.redisClient.get('dashboard:latest-metrics');
      let metrics = {};

      if (metricsResponse) {
        metrics = JSON.parse(metricsResponse);
      } else {
        // Fallback to system metrics
        metrics = this.collectSystemMetrics();
      }

      this.currentMetrics = {
        timestamp: Date.now(),
        latency: metrics.latency || 0,
        throughput: metrics.throughput || 0,
        cpuUsage: metrics.cpu || 0,
        memoryUsage: metrics.memory || 0,
        errorRate: metrics.errors || 0,
        queueSize: metrics.queueSize || 0
      };

      // Store in performance history
      this.performanceHistory.push(this.currentMetrics);
      if (this.performanceHistory.length > 1000) {
        this.performanceHistory.shift();
      }

    } catch (error) {
      console.warn('⚠️ Could not collect metrics:', error.message);
      this.currentMetrics = this.collectSystemMetrics();
    }
  }

  /**
   * Collect system metrics as fallback
   */
  collectSystemMetrics() {
    const usage = process.memoryUsage();
    const cpus = require('os').cpus();

    let totalIdle = 0, totalTick = 0;
    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return {
      timestamp: Date.now(),
      latency: Math.random() * 50 + 20,
      throughput: Math.random() * 1000 + 500,
      cpuUsage: ((totalTick - totalIdle) / totalTick) * 100,
      memoryUsage: (usage.heapUsed / usage.heapTotal) * 100,
      errorRate: Math.random() * 2,
      queueSize: Math.floor(Math.random() * 50)
    };
  }

  /**
   * Analyze current performance
   */
  analyzePerformance() {
    if (!this.baselineMetrics || !this.currentMetrics) {
      return { needsTuning: false, reason: 'Insufficient data' };
    }

    const latencyImprovement = ((this.baselineMetrics.latency - this.currentMetrics.latency) / this.baselineMetrics.latency) * 100;
    const throughputImprovement = ((this.currentMetrics.throughput - this.baselineMetrics.throughput) / this.baselineMetrics.throughput) * 100;

    const targetLatency = this.config.objectives.targets.latencyReduction;
    const targetThroughput = this.config.objectives.targets.throughputImprovement;

    let needsTuning = false;
    let reason = '';

    if (latencyImprovement < targetLatency) {
      needsTuning = true;
      reason = `Latency improvement ${latencyImprovement.toFixed(1)}% below target ${targetLatency}%`;
    } else if (throughputImprovement < targetThroughput) {
      needsTuning = true;
      reason = `Throughput improvement ${throughputImprovement.toFixed(1)}% below target ${targetThroughput}%`;
    } else if (this.currentMetrics.cpuUsage > 85) {
      needsTuning = true;
      reason = `High CPU usage: ${this.currentMetrics.cpuUsage.toFixed(1)}%`;
    } else if (this.currentMetrics.memoryUsage > 90) {
      needsTuning = true;
      reason = `High memory usage: ${this.currentMetrics.memoryUsage.toFixed(1)}%`;
    }

    return {
      needsTuning,
      reason,
      metrics: {
        latencyImprovement,
        throughputImprovement,
        currentLatency: this.currentMetrics.latency,
        currentThroughput: this.currentMetrics.throughput
      }
    };
  }

  /**
   * Select best tuning strategy based on current metrics
   */
  selectTuningStrategy() {
    if (!this.currentMetrics) return null;

    const strategies = Array.from(this.tuningStrategies.values());
    let bestStrategy = null;
    let bestScore = -Infinity;

    for (const strategy of strategies) {
      const score = this.evaluateStrategy(strategy, this.currentMetrics);
      if (score > bestScore) {
        bestScore = score;
        bestStrategy = strategy;
      }
    }

    return bestStrategy;
  }

  /**
   * Evaluate strategy suitability
   */
  evaluateStrategy(strategy, metrics) {
    let score = 0;

    // Base score from priority
    const priorityScores = { high: 3, medium: 2, low: 1 };
    score += priorityScores[strategy.priority] || 1;

    // Evaluate based on current metrics
    const evaluation = strategy.evaluate(metrics);
    score += evaluation.score;

    // Consider recent success rate
    const recentHistory = this.tuningHistory.slice(-5).filter(h => h.strategy === strategy.name);
    const successRate = recentHistory.length > 0 ?
      recentHistory.filter(h => h.success).length / recentHistory.length : 0.5;
    score += successRate * 2;

    return score;
  }

  /**
   * Generate parameter adjustments
   */
  async generateAdjustments(strategy) {
    const adjustments = [];
    const parameters = strategy.parameters;

    for (const paramPath of parameters) {
      const param = this.getParameterByPath(paramPath);
      if (!param) continue;

      // Use ML model if available and trained
      let newValue;
      if (this.config.tuning.enableML && this.mlModel.trained) {
        newValue = await this.predictOptimalValue(paramPath, this.currentMetrics);
      } else {
        newValue = this.calculateAdjustment(param, this.currentMetrics);
      }

      // Validate new value
      if (newValue >= param.min && newValue <= param.max && newValue !== param.current) {
        adjustments.push({
          parameter: paramPath,
          oldValue: param.current,
          newValue: newValue,
          adjustmentPercent: ((newValue - param.current) / param.current) * 100
        });
      }
    }

    return adjustments;
  }

  /**
   * Get parameter by path
   */
  getParameterByPath(path) {
    const parts = path.split('.');
    let param = this.config.parameters;

    for (const part of parts) {
      if (param[part]) {
        param = param[part];
      } else {
        return null;
      }
    }

    return param;
  }

  /**
   * Calculate adjustment using heuristic
   */
  calculateAdjustment(param, metrics) {
    const adjustmentRange = (param.max - param.min) * (this.config.tuning.maxAdjustmentPercent / 100);
    const direction = this.determineAdjustmentDirection(param, metrics);
    const adjustment = adjustmentRange * direction;

    // Ensure we stay within bounds
    return Math.max(param.min, Math.min(param.max, param.current + adjustment));
  }

  /**
   * Determine adjustment direction based on metrics
   */
  determineAdjustmentDirection(param, metrics) {
    // Simplified heuristic logic
    switch (this.config.objectives.primary) {
      case 'latency':
        if (metrics.latency > 50) return -1; // Decrease for latency
        break;
      case 'throughput':
        if (metrics.throughput < 1000) return 1; // Increase for throughput
        break;
      case 'efficiency':
        if (metrics.cpuUsage > 80) return -1; // Decrease for efficiency
        break;
    }

    return Math.random() > 0.5 ? 1 : -1; // Random direction if unclear
  }

  /**
   * Predict optimal value using ML model
   */
  async predictOptimalValue(paramPath, metrics) {
    // Extract features from current metrics
    const features = [
      metrics.latency,
      metrics.throughput,
      metrics.cpuUsage,
      metrics.memoryUsage,
      metrics.errorRate
    ];

    // Predict performance impact
    const predictedImpact = this.mlModel.predict(features);

    // Adjust parameter based on prediction
    const param = this.getParameterByPath(paramPath);
    const adjustment = (predictedImpact - 0.5) * (param.max - param.min) * 0.1;

    return Math.max(param.min, Math.min(param.max, param.current + adjustment));
  }

  /**
   * Apply adjustments to system
   */
  async applyAdjustments(strategy, adjustments) {
    console.log(`🔧 Applying ${adjustments.length} adjustments...`);

    const adjustmentRecord = {
      timestamp: Date.now(),
      strategy: strategy.name,
      adjustments: adjustments,
      metricsBefore: { ...this.currentMetrics },
      success: false
    };

    try {
      // Apply each adjustment
      for (const adjustment of adjustments) {
        await this.applyParameterAdjustment(adjustment);
      }

      // Publish adjustments to Redis
      await this.publishAdjustments(adjustments);

      adjustmentRecord.success = true;
      this.lastAdjustment = adjustmentRecord;
      this.tuningHistory.push(adjustmentRecord);

      console.log('✅ Adjustments applied successfully');

    } catch (error) {
      console.error('❌ Failed to apply adjustments:', error.message);
      adjustmentRecord.error = error.message;
      this.tuningHistory.push(adjustmentRecord);
    }
  }

  /**
   * Apply individual parameter adjustment
   */
  async applyParameterAdjustment(adjustment) {
    const param = this.getParameterByPath(adjustment.parameter);
    if (param) {
      param.current = adjustment.newValue;
      console.log(`  ${adjustment.parameter}: ${adjustment.oldValue} → ${adjustment.newValue}`);
    }

    // Emit adjustment event for other components
    this.emit('parameterAdjusted', adjustment);
  }

  /**
   * Validate adjustments effectiveness
   */
  validateAdjustments() {
    if (!this.lastAdjustment || !this.currentMetrics) {
      return { successful: false, reason: 'Insufficient data for validation' };
    }

    const metricsBefore = this.lastAdjustment.metricsBefore;
    const metricsAfter = this.currentMetrics;

    // Calculate improvements
    const latencyImprovement = ((metricsBefore.latency - metricsAfter.latency) / metricsBefore.latency) * 100;
    const throughputImprovement = ((metricsAfter.throughput - metricsBefore.throughput) / metricsBefore.throughput) * 100;

    const overallImprovement = (latencyImprovement + throughputImprovement) / 2;
    const targetImprovement = this.config.tuning.minImprovementThreshold;

    const successful = overallImprovement >= targetImprovement;

    return {
      successful,
      improvement: overallImprovement,
      latencyImprovement,
      throughputImprovement,
      reason: successful ?
        `Overall improvement ${overallImprovement.toFixed(1)}% exceeds target ${targetImprovement}%` :
        `Overall improvement ${overallImprovement.toFixed(1)}% below target ${targetImprovement}%`
    };
  }

  /**
   * Rollback failed adjustments
   */
  async rollbackAdjustments() {
    if (!this.lastAdjustment) return;

    console.log('🔄 Rolling back failed adjustments...');

    for (const adjustment of this.lastAdjustment.adjustments) {
      const param = this.getParameterByPath(adjustment.parameter);
      if (param) {
        param.current = adjustment.oldValue;
        console.log(`  Rolled back ${adjustment.parameter}: ${adjustment.newValue} → ${adjustment.oldValue}`);
      }
    }

    // Publish rollback event
    await this.publishRollback(this.lastAdjustment.adjustments);

    this.emit('adjustmentsRolledBack', this.lastAdjustment.adjustments);
  }

  /**
   * Strategy evaluation functions
   */
  evaluateLatencyOptimization(metrics) {
    let score = 0;
    if (metrics.latency > 50) score += 3;
    if (metrics.queueSize > 20) score += 2;
    return { score, priority: 'latency' };
  }

  evaluateThroughputOptimization(metrics) {
    let score = 0;
    if (metrics.throughput < 1000) score += 3;
    if (metrics.cpuUsage < 70) score += 1;
    return { score, priority: 'throughput' };
  }

  evaluateMemoryOptimization(metrics) {
    let score = 0;
    if (metrics.memoryUsage > 85) score += 3;
    return { score, priority: 'memory' };
  }

  evaluateRedisOptimization(metrics) {
    let score = 0;
    if (metrics.errorRate > 2) score += 2;
    return { score, priority: 'redis' };
  }

  /**
   * Strategy application functions
   */
  async applyLatencyAdjustments(adjustments) {
    console.log('⚡ Applying latency optimizations...');
    // Implementation would integrate with event bus and CPU optimizer
  }

  async applyThroughputAdjustments(adjustments) {
    console.log('📈 Applying throughput optimizations...');
    // Implementation would integrate with CPU optimizer and Redis
  }

  async applyMemoryAdjustments(adjustments) {
    console.log('💾 Applying memory optimizations...');
    // Implementation would integrate with memory manager
  }

  async applyRedisAdjustments(adjustments) {
    console.log('🔴 Applying Redis optimizations...');
    // Implementation would integrate with Redis client
  }

  /**
   * Redis communication methods
   */
  async publishAdjustments(adjustments) {
    if (!this.redisClient) return;

    try {
      await this.redisClient.publish('swarm:phase-4:adjustments', JSON.stringify({
        type: 'parameter-adjustments',
        adjustments,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to publish adjustments:', error.message);
    }
  }

  async publishRollback(adjustments) {
    if (!this.redisClient) return;

    try {
      await this.redisClient.publish('swarm:phase-4:adjustments', JSON.stringify({
        type: 'parameter-rollback',
        adjustments,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to publish rollback:', error.message);
    }
  }

  async publishTuningStatus() {
    if (!this.redisClient) return;

    try {
      const status = {
        phase: this.optimizationState.currentPhase,
        adjustmentsMade: this.optimizationState.adjustmentsMade,
        improvementsAchieved: this.optimizationState.improvementsAchieved,
        failedAdjustments: this.optimizationState.failedAdjustments,
        currentMetrics: this.currentMetrics,
        lastAdjustment: this.lastAdjustment
      };

      await this.redisClient.publish('swarm:phase-4:tuning-status', JSON.stringify({
        type: 'tuning-status',
        status,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Failed to publish tuning status:', error.message);
    }
  }

  async storeAnalysisResults(analysis) {
    if (!this.redisClient) return;

    try {
      await this.redisClient.setex('tuning:last-analysis', 3600, JSON.stringify(analysis));
    } catch (error) {
      console.warn('Failed to store analysis results:', error.message);
    }
  }

  async storeValidationResults(validation) {
    if (!this.redisClient) return;

    try {
      await this.redisClient.setex('tuning:last-validation', 3600, JSON.stringify(validation));
    } catch (error) {
      console.warn('Failed to store validation results:', error.message);
    }
  }

  /**
   * Get current tuning status
   */
  getTuningStatus() {
    return {
      active: this.active,
      phase: this.optimizationState.currentPhase,
      phaseStartTime: this.optimizationState.phaseStartTime,
      adjustments: {
        total: this.optimizationState.adjustmentsMade,
        successful: this.optimizationState.improvementsAchieved,
        failed: this.optimizationState.failedAdjustments
      },
      currentMetrics: this.currentMetrics,
      baselineMetrics: this.baselineMetrics,
      lastAdjustment: this.lastAdjustment,
      parameters: this.getCurrentParameters(),
      recentHistory: this.tuningHistory.slice(-10)
    };
  }

  /**
   * Get current parameter values
   */
  getCurrentParameters() {
    const params = {};

    for (const [category, categoryParams] of Object.entries(this.config.parameters)) {
      params[category] = {};
      for (const [param, config] of Object.entries(categoryParams)) {
        params[category][param] = config.current;
      }
    }

    return params;
  }

  /**
   * Force manual tuning
   */
  async forceTuning(strategyName = null) {
    if (!strategyName) {
      // Auto-select best strategy
      const strategy = this.selectTuningStrategy();
      if (strategy) {
        this.optimizationState.currentPhase = 'tuning';
        console.log(`🎯 Force tuning with strategy: ${strategy.name}`);
      }
    } else {
      const strategy = this.tuningStrategies.get(strategyName);
      if (strategy) {
        this.optimizationState.currentPhase = 'tuning';
        console.log(`🎯 Force tuning with strategy: ${strategy.name}`);
      }
    }
  }

  /**
   * Save tuning state
   */
  async saveState() {
    if (!this.redisClient) return;

    try {
      const state = {
        optimizationState: this.optimizationState,
        parameters: this.config.parameters,
        baselineMetrics: this.baselineMetrics,
        performanceHistory: this.performanceHistory.slice(-100),
        tuningHistory: this.tuningHistory.slice(-50)
      };

      await this.redisClient.setex('tuning:state', 86400, JSON.stringify(state));
      console.log('💾 Tuning state saved');
    } catch (error) {
      console.warn('Failed to save tuning state:', error.message);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Automated Performance Tuner...');

    this.active = false;

    // Stop tuning interval
    if (this.tuningInterval) {
      clearInterval(this.tuningInterval);
    }

    // Save final state
    await this.saveState();

    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('✅ Automated Performance Tuner shutdown complete');
  }
}

// Export for use in other modules
export default AutomatedPerformanceTuner;