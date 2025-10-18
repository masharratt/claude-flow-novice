/**
 * Node Placement Optimizer - Intelligent Node Distribution System
 *
 * This class integrates multiple optimization algorithms (Genetic Algorithm,
 * Simulated Annealing, and ML-based prediction) to provide optimal
 * node placement solutions with real-time adjustments.
 */

import { EventEmitter } from 'events';
import { createGeneticOptimizer, createNodeDistributionProblem } from './genetic-algorithm-optimizer.js';
import { createSimulatedAnnealingOptimizer, createNodePlacementProblem } from './simulated-annealing-optimizer.js';
import { createMLPerformancePredictor } from './ml-performance-predictor.js';
import { connectRedis } from '../cli/utils/redis-client.js';
import crypto from 'crypto';

/**
 * Node Placement Optimizer Configuration
 */
const NPO_CONFIG = {
  swarmId: 'phase-4-node-distribution',
  redis: {
    host: 'localhost',
    port: 6379,
    database: 0
  },
  optimization: {
    algorithms: ['genetic', 'annealing', 'ml_hybrid'],
    weights: { latency: 0.3, cost: 0.25, reliability: 0.3, loadBalance: 0.15 },
    maxOptimizationTime: 60000, // 60 seconds
    convergenceThreshold: 0.001,
    minConfidence: 0.7
  },
  realTime: {
    adjustmentInterval: 30000, // 30 seconds
    performanceWindow: 300000, // 5 minutes
    maxConcurrentOptimizations: 3
  },
  redis: {
    coordinationChannel: 'swarm:phase-4:distribution',
    resultsChannel: 'swarm:phase-4:results',
    stateKey: 'swarm:phase-4:optimizer-state'
  }
};

/**
 * Optimization Strategy Selector
 */
class OptimizationStrategySelector {
  constructor() {
    this.strategies = new Map();
    this.performanceHistory = new Map();
  }

  registerStrategy(name, strategy, metadata = {}) {
    this.strategies.set(name, {
      strategy,
      metadata: {
        complexity: metadata.complexity || 'medium',
        convergenceSpeed: metadata.convergenceSpeed || 'medium',
        solutionQuality: metadata.solutionQuality || 'high',
        resourceRequirements: metadata.resourceRequirements || 'medium',
        bestFor: metadata.bestFor || ['general']
      }
    });
  }

  selectBestStrategy(problemSize, constraints, timeLimit, availableResources) {
    const candidates = [];

    for (const [name, config] of this.strategies) {
      const score = this.calculateStrategyScore(
        config.metadata,
        problemSize,
        constraints,
        timeLimit,
        availableResources
      );

      candidates.push({ name, score, config });
    }

    // Sort by score and return best
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      throw new Error('No suitable optimization strategy available');
    }

    return candidates[0].name;
  }

  calculateStrategyScore(metadata, problemSize, constraints, timeLimit, resources) {
    let score = 1.0;

    // Time constraint scoring
    if (timeLimit < 10000) { // Very short time limit
      score *= metadata.convergenceSpeed === 'fast' ? 1.5 : 0.7;
    } else if (timeLimit > 60000) { // Long time limit
      score *= metadata.solutionQuality === 'high' ? 1.3 : 1.0;
    }

    // Problem size scoring
    if (problemSize > 100) {
      score *= metadata.complexity === 'high' ? 1.2 : 0.8;
    } else if (problemSize < 10) {
      score *= metadata.complexity === 'low' ? 1.2 : 1.0;
    }

    // Resource constraint scoring
    if (resources === 'low') {
      score *= metadata.resourceRequirements === 'low' ? 1.5 : 0.6;
    }

    // Constraint complexity scoring
    const constraintCount = Object.keys(constraints).length;
    if (constraintCount > 5) {
      score *= metadata.bestFor.includes('complex_constraints') ? 1.3 : 0.9;
    }

    return score;
  }

  updateStrategyPerformance(strategyName, executionTime, solutionQuality) {
    if (!this.performanceHistory.has(strategyName)) {
      this.performanceHistory.set(strategyName, []);
    }

    const history = this.performanceHistory.get(strategyName);
    history.push({
      executionTime,
      solutionQuality,
      timestamp: Date.now()
    });

    // Keep only recent history
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  getStrategyRecommendations(problemSize, constraints) {
    const recommendations = [];

    for (const [name, config] of this.strategies) {
      const history = this.performanceHistory.get(name) || [];
      const avgPerformance = history.length > 0 ?
        history.reduce((sum, h) => sum + h.solutionQuality, 0) / history.length : 0.5;

      recommendations.push({
        name,
        suitability: this.calculateStrategyScore(
          config.metadata,
          problemSize,
          constraints,
          30000,
          'medium'
        ),
        historicalPerformance: avgPerformance,
        metadata: config.metadata
      });
    }

    return recommendations.sort((a, b) => b.suitability - a.suitability);
  }
}

/**
 * Real-time Performance Monitor
 */
class RealTimePerformanceMonitor {
  constructor(redisClient, config) {
    this.redis = redisClient;
    this.config = config;
    this.activeOptimizations = new Map();
    this.performanceMetrics = new Map();
    this.isMonitoring = false;
  }

  startMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    // Subscribe to performance events
    this.redis.subscribe(this.config.redis.coordinationChannel, (message) => {
      this.handleCoordinationMessage(message);
    });

    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectPerformanceMetrics();
    }, this.config.realTime.adjustmentInterval);

    console.log('Real-time performance monitoring started');
  }

  stopMonitoring() {
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    console.log('Real-time performance monitoring stopped');
  }

  async handleCoordinationMessage(message) {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'optimization_request':
          await this.handleOptimizationRequest(data);
          break;

        case 'performance_update':
          await this.handlePerformanceUpdate(data);
          break;

        case 'system_state_change':
          await this.handleSystemStateChange(data);
          break;

        default:
          console.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling coordination message:', error);
    }
  }

  async handleOptimizationRequest(data) {
    const optimizationId = data.optimizationId || crypto.randomBytes(8).toString('hex');

    // Check if we can handle this request
    if (this.activeOptimizations.size >= this.config.realTime.maxConcurrentOptimizations) {
      await this.publishResponse({
        type: 'optimization_rejected',
        optimizationId,
        reason: 'max_concurrent_optimizations',
        timestamp: Date.now()
      });
      return;
    }

    // Track optimization
    this.activeOptimizations.set(optimizationId, {
      startTime: Date.now(),
      status: 'pending',
      data
    });

    // Start optimization in background
    this.startOptimization(optimizationId, data);
  }

  async startOptimization(optimizationId, data) {
    try {
      // This would integrate with the main optimizer
      const result = await this.runOptimization(data);

      this.activeOptimizations.set(optimizationId, {
        ...this.activeOptimizations.get(optimizationId),
        status: 'completed',
        result,
        endTime: Date.now()
      });

      await this.publishResponse({
        type: 'optimization_completed',
        optimizationId,
        result,
        timestamp: Date.now()
      });

    } catch (error) {
      this.activeOptimizations.set(optimizationId, {
        ...this.activeOptimizations.get(optimizationId),
        status: 'failed',
        error: error.message,
        endTime: Date.now()
      });

      await this.publishResponse({
        type: 'optimization_failed',
        optimizationId,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  async runOptimization(data) {
    // Placeholder for actual optimization logic
    // This would delegate to the main NodePlacementOptimizer
    return {
      allocation: [],
      fitness: 0.8,
      metrics: {
        latency: 150,
        cost: 50,
        reliability: 0.95,
        efficiency: 0.85
      }
    };
  }

  async handlePerformanceUpdate(data) {
    const { nodeId, metrics } = data;

    // Update performance metrics
    if (!this.performanceMetrics.has(nodeId)) {
      this.performanceMetrics.set(nodeId, []);
    }

    const nodeMetrics = this.performanceMetrics.get(nodeId);
    nodeMetrics.push({
      ...metrics,
      timestamp: Date.now()
    });

    // Keep only recent metrics
    const cutoffTime = Date.now() - this.config.realTime.performanceWindow;
    nodeMetrics.splice(0, nodeMetrics.findIndex(m => m.timestamp > cutoffTime));

    // Check if performance degradation requires re-optimization
    if (this.shouldTriggerReoptimization(nodeId, nodeMetrics)) {
      await this.triggerReoptimization(nodeId, nodeMetrics);
    }
  }

  shouldTriggerReoptimization(nodeId, metrics) {
    if (metrics.length < 5) return false;

    // Calculate performance trends
    const recentMetrics = metrics.slice(-5);
    const avgLatency = recentMetrics.reduce((sum, m) => sum + m.latency, 0) / recentMetrics.length;
    const avgErrorRate = recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length;

    // Trigger if performance degraded
    return avgLatency > 300 || avgErrorRate > 0.1;
  }

  async triggerReoptimization(nodeId, metrics) {
    await this.publishResponse({
      type: 'reoptimization_triggered',
      nodeId,
      reason: 'performance_degradation',
      metrics: metrics.slice(-1)[0],
      timestamp: Date.now()
    });
  }

  async handleSystemStateChange(data) {
    const { changeType, affectedNodes } = data;

    switch (changeType) {
      case 'node_added':
        await this.handleNodeAddition(affectedNodes);
        break;

      case 'node_removed':
        await this.handleNodeRemoval(affectedNodes);
        break;

      case 'load_change':
        await this.handleLoadChange(affectedNodes);
        break;

      default:
        console.log(`Unknown system state change: ${changeType}`);
    }
  }

  async handleNodeAddition(nodes) {
    // New nodes available - may trigger optimization
    await this.publishResponse({
      type: 'system_change',
      changeType: 'nodes_added',
      nodes,
      timestamp: Date.now()
    });
  }

  async handleNodeRemoval(nodes) {
    // Nodes removed - may require immediate re-optimization
    await this.publishResponse({
      type: 'system_change',
      changeType: 'nodes_removed',
      nodes,
      urgent: true,
      timestamp: Date.now()
    });
  }

  async handleLoadChange(nodes) {
    // Load patterns changed - may trigger optimization
    await this.publishResponse({
      type: 'system_change',
      changeType: 'load_changed',
      nodes,
      timestamp: Date.now()
    });
  }

  async collectPerformanceMetrics() {
    const metrics = {
      activeOptimizations: this.activeOptimizations.size,
      monitoredNodes: this.performanceMetrics.size,
      timestamp: Date.now()
    };

    // Store metrics in Redis
    await this.redis.setEx(
      `metrics:node-placement:${Date.now()}`,
      3600,
      JSON.stringify(metrics)
    );

    this.emit('metricsCollected', metrics);
  }

  async publishResponse(data) {
    await this.redis.publish(this.config.redis.resultsChannel, JSON.stringify(data));
  }

  getActiveOptimizations() {
    return Array.from(this.activeOptimizations.entries()).map(([id, opt]) => ({
      id,
      ...opt,
      duration: opt.endTime ? opt.endTime - opt.startTime : Date.now() - opt.startTime
    }));
  }

  getNodeMetrics(nodeId) {
    return this.performanceMetrics.get(nodeId) || [];
  }
}

/**
 * Main Node Placement Optimizer Class
 */
export class NodePlacementOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...NPO_CONFIG, ...options };
    this.swarmId = this.config.swarmId;
    this.redisClient = null;
    this.isInitialized = false;
    this.isOptimizing = false;

    // Initialize components
    this.strategySelector = new OptimizationStrategySelector();
    this.performanceMonitor = null;
    this.mlPredictor = null;
    this.optimizationHistory = [];

    // Algorithm instances
    this.geneticOptimizer = null;
    this.annealingOptimizer = null;

    // State management
    this.currentOptimization = null;
    this.optimizationQueue = [];
  }

  async initialize() {
    try {
      // Connect to Redis
      this.redisClient = await connectRedis(this.config.redis);

      // Initialize ML predictor
      this.mlPredictor = createMLPerformancePredictor({
        ensembleSize: 5,
        swarmId: this.swarmId
      });

      // Initialize performance monitor
      this.performanceMonitor = new RealTimePerformanceMonitor(
        this.redisClient,
        this.config
      );

      // Register optimization strategies
      this.registerOptimizationStrategies();

      // Load historical data
      await this.loadHistoricalData();

      // Start real-time monitoring
      this.performanceMonitor.startMonitoring();

      this.isInitialized = true;

      console.log(`NodePlacementOptimizer initialized for swarm ${this.swarmId}`);
      this.emit('initialized', { swarmId: this.swarmId });

    } catch (error) {
      console.error('Failed to initialize NodePlacementOptimizer:', error);
      this.emit('initializationError', { error: error.message });
      throw error;
    }
  }

  registerOptimizationStrategies() {
    // Register Genetic Algorithm strategy
    this.strategySelector.registerStrategy('genetic', {
      optimize: async (problem, options) => {
        if (!this.geneticOptimizer) {
          this.geneticOptimizer = createGeneticOptimizer({
            swarmId: this.swarmId,
            ...options
          });
        }

        return await this.geneticOptimizer.optimize(problem, this.swarmId);
      },
      prepareProblem: (nodes, tasks, constraints) =>
        createNodeDistributionProblem(nodes, tasks, constraints)
    }, {
      complexity: 'high',
      convergenceSpeed: 'medium',
      solutionQuality: 'very_high',
      resourceRequirements: 'high',
      bestFor: ['complex_constraints', 'large_problems', 'global_optimization']
    });

    // Register Simulated Annealing strategy
    this.strategySelector.registerStrategy('annealing', {
      optimize: async (problem, options) => {
        if (!this.annealingOptimizer) {
          this.annealingOptimizer = createSimulatedAnnealingOptimizer({
            swarmId: this.swarmId,
            ...options
          });
        }

        return await this.annealingOptimizer.optimize(problem, this.swarmId);
      },
      prepareProblem: (nodes, tasks, constraints) =>
        createNodePlacementProblem(nodes, tasks, constraints)
    }, {
      complexity: 'medium',
      convergenceSpeed: 'fast',
      solutionQuality: 'high',
      resourceRequirements: 'medium',
      bestFor: ['time_constraints', 'medium_problems', 'local_search']
    });

    // Register ML-Hybrid strategy
    this.strategySelector.registerStrategy('ml_hybrid', {
      optimize: async (problem, options) => {
        return await this.optimizeWithMLHybrid(problem, options);
      },
      prepareProblem: (nodes, tasks, constraints) =>
        createNodeDistributionProblem(nodes, tasks, constraints)
    }, {
      complexity: 'high',
      convergenceSpeed: 'fast',
      solutionQuality: 'very_high',
      resourceRequirements: 'high',
      bestFor: ['prediction_based', 'adaptive_optimization', 'performance_critical']
    });
  }

  async optimizeNodePlacement(nodes, tasks, constraints = {}, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Optimizer must be initialized before optimization');
    }

    if (this.isOptimizing) {
      throw new Error('Optimization already in progress');
    }

    this.isOptimizing = true;

    const optimizationId = options.optimizationId || crypto.randomBytes(8).toString('hex');
    const startTime = Date.now();

    try {
      console.log(`Starting node placement optimization ${optimizationId}`);

      // Validate inputs
      this.validateOptimizationInputs(nodes, tasks, constraints);

      // Select best strategy
      const strategyName = this.strategySelector.selectBestStrategy(
        tasks.length,
        constraints,
        options.maxTime || this.config.optimization.maxOptimizationTime,
        options.resourceLevel || 'medium'
      );

      console.log(`Selected optimization strategy: ${strategyName}`);

      // Publish optimization start
      await this.publishOptimizationEvent({
        type: 'optimization_started',
        optimizationId,
        strategy: strategyName,
        problemSize: tasks.length,
        constraints,
        timestamp: startTime
      });

      // Prepare problem
      const strategy = this.strategySelector.strategies.get(strategyName);
      const problem = strategy.prepareProblem(nodes, tasks, constraints);

      // Run optimization
      const result = await this.runOptimizationWithTimeout(
        strategy,
        problem,
        options
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Process results
      const processedResult = this.processOptimizationResult(result, nodes, tasks);

      // Update strategy performance
      this.strategySelector.updateStrategyPerformance(
        strategyName,
        duration,
        processedResult.efficiency
      );

      // Store optimization history
      this.optimizationHistory.push({
        id: optimizationId,
        strategy: strategyName,
        startTime,
        endTime,
        duration,
        result: processedResult,
        problemSize: tasks.length,
        constraints
      });

      // Publish completion
      await this.publishOptimizationEvent({
        type: 'optimization_completed',
        optimizationId,
        strategy: strategyName,
        result: processedResult,
        duration,
        efficiency: processedResult.efficiency,
        timestamp: endTime
      });

      console.log(`Optimization ${optimizationId} completed in ${duration}ms with efficiency ${processedResult.efficiency.toFixed(3)}`);

      this.emit('optimizationCompleted', {
        optimizationId,
        result: processedResult,
        strategy: strategyName,
        duration
      });

      return processedResult;

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.error(`Optimization ${optimizationId} failed:`, error);

      await this.publishOptimizationEvent({
        type: 'optimization_failed',
        optimizationId,
        error: error.message,
        duration,
        timestamp: endTime
      });

      this.emit('optimizationError', {
        optimizationId,
        error: error.message,
        duration
      });

      throw error;

    } finally {
      this.isOptimizing = false;
    }
  }

  async runOptimizationWithTimeout(strategy, problem, options) {
    const maxTime = options.maxTime || this.config.optimization.maxOptimizationTime;

    return new Promise(async (resolve, reject) => {
      let timeoutId;
      let completed = false;

      const timeoutPromise = new Promise((_, timeoutReject) => {
        timeoutId = setTimeout(() => {
          if (!completed) {
            completed = true;
            timeoutReject(new Error(`Optimization timeout after ${maxTime}ms`));
          }
        }, maxTime);
      });

      const optimizationPromise = strategy.optimize(problem, options);

      try {
        const result = await Promise.race([optimizationPromise, timeoutPromise]);

        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          resolve(result);
        }
      } catch (error) {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      }
    });
  }

  async optimizeWithMLHybrid(problem, options) {
    // Use ML predictions to guide the optimization
    const mlPredictions = await this.generateMLPredictions(problem);

    // Create a hybrid approach combining ML predictions with traditional optimization
    const hybridStrategy = {
      optimize: async (problem, options) => {
        // Start with ML-predicted initial solution
        const initialSolution = this.createInitialSolutionFromPredictions(mlPredictions, problem);

        // Refine with simulated annealing
        const annealingOptimizer = createSimulatedAnnealingOptimizer({
          ...options,
          initialSolution,
          swarmId: this.swarmId
        });

        return await annealingOptimizer.optimize(problem, this.swarmId);
      }
    };

    return await hybridStrategy.optimize(problem, options);
  }

  async generateMLPredictions(problem) {
    const predictions = [];

    for (const task of problem.taskRequirements) {
      const taskPredictions = [];

      for (const node of problem.nodes) {
        try {
          const prediction = await this.mlPredictor.predictPerformance(
            node,
            task,
            { systemLoad: 0.5, concurrentTasks: 0 }
          );

          taskPredictions.push({
            nodeId: node.id,
            prediction,
            score: this.calculatePredictionScore(prediction)
          });
        } catch (error) {
          console.warn(`ML prediction failed for node ${node.id}, task ${task.id}:`, error.message);
        }
      }

      // Sort by prediction score
      taskPredictions.sort((a, b) => b.score - a.score);
      predictions.push({
        taskId: task.id,
        predictions: taskPredictions
      });
    }

    return predictions;
  }

  calculatePredictionScore(prediction) {
    // Calculate a composite score from ML predictions
    const latencyScore = Math.max(0, 1 - prediction.latency / 500);
    const costScore = Math.max(0, 1 - prediction.cost / 100);
    const reliabilityScore = prediction.reliability;
    const successRateScore = prediction.successRate;

    return (
      latencyScore * 0.3 +
      costScore * 0.2 +
      reliabilityScore * 0.3 +
      successRateScore * 0.2
    ) * prediction.confidence;
  }

  createInitialSolutionFromPredictions(predictions, problem) {
    const solution = [];

    for (const taskPrediction of predictions) {
      if (taskPrediction.predictions.length > 0) {
        const bestPrediction = taskPrediction.predictions[0];
        const nodeIndex = problem.nodes.findIndex(
          n => n.id === bestPrediction.nodeId
        );

        if (nodeIndex >= 0) {
          solution.push(nodeIndex);
        } else {
          solution.push(0); // Fallback to first node
        }
      } else {
        solution.push(0); // Fallback to first node
      }
    }

    return solution;
  }

  validateOptimizationInputs(nodes, tasks, constraints) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new Error('Nodes must be a non-empty array');
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      throw new Error('Tasks must be a non-empty array');
    }

    // Validate node structure
    for (const node of nodes) {
      if (!node.id) {
        throw new Error('Each node must have an id');
      }
    }

    // Validate task structure
    for (const task of tasks) {
      if (!task.id) {
        throw new Error('Each task must have an id');
      }
    }
  }

  processOptimizationResult(result, nodes, tasks) {
    let allocation = [];

    if (result.solution) {
      allocation = result.solution;
    } else if (result.allocation) {
      allocation = result.allocation;
    }

    // Calculate comprehensive metrics
    const metrics = this.calculateOptimizationMetrics(allocation, nodes, tasks);

    return {
      allocation,
      fitness: result.fitness || 0.8,
      efficiency: this.calculateOverallEfficiency(metrics),
      metrics,
      algorithm: result.algorithm || 'hybrid',
      optimizationTime: result.optimizationTime || 0,
      confidence: this.calculateSolutionConfidence(result),
      swarmId: this.swarmId,
      timestamp: Date.now()
    };
  }

  calculateOptimizationMetrics(allocation, nodes, tasks) {
    // Calculate utilization, latency, cost, etc.
    const nodeUtilization = new Map();

    // Initialize utilization tracking
    nodes.forEach(node => {
      nodeUtilization.set(node.id, {
        compute: 0,
        memory: 0,
        bandwidth: 0,
        tasks: []
      });
    });

    let totalLatency = 0;
    let totalCost = 0;
    let totalReliability = 0;

    // Process allocation
    allocation.forEach(alloc => {
      const node = nodes.find(n => n.id === alloc.nodeId);
      const task = tasks.find(t => t.id === alloc.taskId);

      if (node && task) {
        const utilization = nodeUtilization.get(node.id);

        utilization.compute += task.computeUnits || 1;
        utilization.memory += task.memory || 1024;
        utilization.bandwidth += task.bandwidth || 100;
        utilization.tasks.push(task);

        // Estimate metrics
        const latency = (node.latency || 10) + (task.computeUnits || 1) * 10;
        const cost = (task.computeUnits || 1) * (node.cost?.compute || 0.01);
        const reliability = node.reliability || 0.99;

        totalLatency += latency;
        totalCost += cost;
        totalReliability += reliability;
      }
    });

    // Calculate derived metrics
    const utilizationRates = Array.from(nodeUtilization.entries()).map(([nodeId, util]) => {
      const node = nodes.find(n => n.id === nodeId);
      return {
        compute: (util.compute / (node?.capacity?.compute || 100)) * 100,
        memory: (util.memory / (node?.capacity?.memory || 8192)) * 100,
        bandwidth: (util.bandwidth / (node?.capacity?.bandwidth || 1000)) * 100
      };
    });

    const avgUtilization = utilizationRates.reduce((sum, rates) =>
      sum + (rates.compute + rates.memory + rates.bandwidth) / 3, 0) / utilizationRates.length;

    const maxUtilization = Math.max(...utilizationRates.map(r => r.compute));
    const minUtilization = Math.min(...utilizationRates.map(r => r.compute));
    const loadBalanceIndex = maxUtilization > 0 ? (maxUtilization - minUtilization) / maxUtilization : 0;

    return {
      avgLatency: totalLatency / allocation.length,
      totalCost,
      avgReliability: totalReliability / allocation.length,
      avgUtilization,
      loadBalanceIndex,
      nodeUtilization: Object.fromEntries(nodeUtilization),
      tasksAllocated: allocation.length,
      totalTasks: tasks.length
    };
  }

  calculateOverallEfficiency(metrics) {
    // Multi-dimensional efficiency calculation
    const latencyEfficiency = Math.max(0, 1 - metrics.avgLatency / 200);
    const costEfficiency = Math.max(0, 1 - metrics.totalCost / 1000);
    const reliabilityEfficiency = metrics.avgReliability;
    const utilizationEfficiency = Math.min(1, metrics.avgUtilization / 80);
    const balanceEfficiency = Math.max(0, 1 - metrics.loadBalanceIndex);

    const overallEfficiency = (
      latencyEfficiency * 0.25 +
      costEfficiency * 0.2 +
      reliabilityEfficiency * 0.3 +
      utilizationEfficiency * 0.15 +
      balanceEfficiency * 0.1
    );

    return overallEfficiency;
  }

  calculateSolutionConfidence(result) {
    // Calculate confidence based on algorithm performance and convergence
    if (result.confidence !== undefined) {
      return result.confidence;
    }

    // Default confidence based on fitness
    return Math.min(1.0, Math.max(0.5, result.fitness || 0.8));
  }

  async publishOptimizationEvent(event) {
    try {
      const channel = this.config.redis?.coordinationChannel || 'swarm:phase-4:distribution';
      const message = JSON.stringify(event || {});
      await this.redisClient.publish(channel, message);
    } catch (error) {
      console.error('Failed to publish optimization event:', error);
    }
  }

  async loadHistoricalData() {
    try {
      // Load historical optimization data from Redis
      const historyData = await this.redisClient.get(
        `${this.config.redis.stateKey}:history`
      );

      if (historyData) {
        const history = JSON.parse(historyData);
        this.optimizationHistory = history.slice(-1000); // Keep last 1000 records

        // Train ML predictor with historical data
        if (this.mlPredictor && this.optimizationHistory.length > 0) {
          const trainingData = this.prepareTrainingData();
          await this.mlPredictor.initialize(trainingData);
        }
      }

      console.log(`Loaded ${this.optimizationHistory.length} historical optimization records`);
    } catch (error) {
      console.warn('Failed to load historical data:', error.message);
    }
  }

  prepareTrainingData() {
    // Convert optimization history to ML training format
    return this.optimizationHistory.map(record => ({
      node: record.allocation[0]?.node || {},
      task: record.allocation[0]?.task || {},
      context: { systemLoad: 0.5 },
      actualLatency: record.metrics.avgLatency,
      actualCost: record.metrics.totalCost,
      actualReliability: record.metrics.avgReliability,
      actualSuccessRate: record.efficiency
    }));
  }

  async saveOptimizationHistory() {
    try {
      await this.redisClient.setEx(
        `${this.config.redis.stateKey}:history`,
        86400 * 7, // 7 days TTL
        JSON.stringify(this.optimizationHistory)
      );
    } catch (error) {
      console.error('Failed to save optimization history:', error);
    }
  }

  // Public API methods
  async updateWithActualResult(optimizationId, actualMetrics) {
    const optimization = this.optimizationHistory.find(o => o.id === optimizationId);
    if (optimization) {
      optimization.actualMetrics = actualMetrics;
      optimization.timestamp = Date.now();

      // Update ML predictor with actual results
      if (this.mlPredictor) {
        this.mlPredictor.updateWithActualResult(
          optimization.allocation[0]?.nodeId,
          optimization.allocation[0]?.taskId,
          actualMetrics
        );
      }

      await this.saveOptimizationHistory();

      this.emit('resultUpdated', { optimizationId, actualMetrics });
    }
  }

  getOptimizationMetrics() {
    return {
      isInitialized: this.isInitialized,
      isOptimizing: this.isOptimizing,
      swarmId: this.swarmId,
      totalOptimizations: this.optimizationHistory.length,
      averageEfficiency: this.optimizationHistory.length > 0 ?
        this.optimizationHistory.reduce((sum, o) => sum + o.efficiency, 0) / this.optimizationHistory.length : 0,
      activeOptimizations: this.performanceMonitor?.getActiveOptimizations() || [],
      strategyPerformance: this.getStrategyPerformance(),
      mlMetrics: this.mlPredictor?.getMetrics() || { status: 'not_initialized' }
    };
  }

  getStrategyPerformance() {
    const performance = {};

    for (const [name, history] of this.strategySelector.performanceHistory.entries()) {
      if (history.length > 0) {
        const avgQuality = history.reduce((sum, h) => sum + h.solutionQuality, 0) / history.length;
        const avgTime = history.reduce((sum, h) => sum + h.executionTime, 0) / history.length;

        performance[name] = {
          averageQuality: avgQuality,
          averageTime: avgTime,
          usageCount: history.length,
          lastUsed: history[history.length - 1].timestamp
        };
      }
    }

    return performance;
  }

  async shutdown() {
    try {
      this.isOptimizing = false;

      // Stop monitoring
      if (this.performanceMonitor) {
        this.performanceMonitor.stopMonitoring();
      }

      // Save state
      await this.saveOptimizationHistory();

      // Close Redis connection
      if (this.redisClient) {
        await this.redisClient.quit();
      }

      console.log('NodePlacementOptimizer shutdown completed');
      this.emit('shutdown');

    } catch (error) {
      console.error('Error during shutdown:', error);
      this.emit('shutdownError', { error: error.message });
    }
  }
}

/**
 * Utility functions
 */
export function createNodePlacementOptimizer(options = {}) {
  return new NodePlacementOptimizer(options);
}

export default NodePlacementOptimizer;