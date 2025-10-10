/**
 * Simulated Annealing Algorithm for Node Placement Optimization
 *
 * This algorithm uses a probabilistic technique to approximate the global optimum
 * of node placement, allowing uphill moves to escape local optima.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Simulated Annealing Configuration
 */
const SA_CONFIG = {
  initialTemperature: 1000,
  finalTemperature: 0.01,
  coolingRate: 0.95,
  minIterations: 100,
  maxIterations: 10000,
  equilibriumIterations: 50,
  acceptanceRateTarget: 0.4,
  reheatingThreshold: 0.001,
  maxReheats: 3
};

/**
 * Temperature Schedule Strategies
 */
const TEMPERATURE_SCHEDULES = {
  linear: (temp, coolingRate) => temp * coolingRate,

  exponential: (temp, coolingRate) => temp * Math.pow(coolingRate, 1),

  logarithmic: (temp, iteration) => temp / Math.log(iteration + 1),

  geometric: (temp, coolingRate) => temp * coolingRate,

  adaptive: (temp, acceptanceRate, targetRate) => {
    if (acceptanceRate < targetRate * 0.5) {
      return temp * 1.1; // Reheat if acceptance rate too low
    } else if (acceptanceRate > targetRate * 1.5) {
      return temp * 0.9; // Cool faster if acceptance rate too high
    }
    return temp * 0.95;
  }
};

/**
 * Node Placement Problem for Simulated Annealing
 */
class NodePlacementProblem {
  constructor(nodes, tasks, constraints = {}) {
    this.nodes = nodes;
    this.tasks = tasks;
    this.constraints = {
      maxLatency: constraints.maxLatency || 200,
      maxCost: constraints.maxCost || 1000,
      minReliability: constraints.minReliability || 0.95,
      loadBalanceThreshold: constraints.loadBalanceThreshold || 0.8,
      ...constraints
    };

    this.taskRequirements = this.preprocessTasks();
    this.nodeCapabilities = this.preprocessNodes();
    this.problemSize = tasks.length;
  }

  preprocessTasks() {
    return this.tasks.map(task => ({
      id: task.id,
      computeUnits: task.computeUnits || 1,
      memory: task.memory || 1024,
      bandwidth: task.bandwidth || 100,
      storage: task.storage || 0,
      priority: task.priority || 1,
      deadline: task.deadline || Date.now() + 300000,
      affinity: task.affinity || [],
      antiAffinity: task.antiAffinity || [],
      locationPreference: task.locationPreference || null,
      estimatedDuration: task.estimatedDuration || 60000
    }));
  }

  preprocessNodes() {
    return this.nodes.map(node => ({
      id: node.id,
      capacity: {
        compute: node.capacity?.compute || 100,
        memory: node.capacity?.memory || 8192,
        bandwidth: node.capacity?.bandwidth || 1000,
        storage: node.capacity?.storage || 10000
      },
      utilization: {
        compute: 0,
        memory: 0,
        bandwidth: 0,
        storage: 0,
        tasks: []
      },
      location: node.location || { lat: 0, lon: 0, region: 'unknown' },
      cost: {
        compute: node.cost?.compute || 0.01,
        memory: node.cost?.memory || 0.001,
        bandwidth: node.cost?.bandwidth || 0.005,
        storage: node.cost?.storage || 0.0001
      },
      performance: {
        latency: node.latency || 10,
        throughput: node.throughput || 1000,
        reliability: node.reliability || 0.99,
        availability: node.availability || 0.995
      },
      tags: node.tags || [],
      supportedTasks: node.supportedTasks || []
    }));
  }

  generateRandomSolution() {
    const solution = [];

    for (const task of this.taskRequirements) {
      const compatibleNodes = this.getCompatibleNodes(task);
      if (compatibleNodes.length === 0) {
        // Fallback to any node if no compatible nodes found
        solution.push(Math.floor(Math.random() * this.nodeCapabilities.length));
      } else {
        // Weighted selection based on node performance
        const weights = compatibleNodes.map(node =>
          this.calculateNodeWeight(node, task)
        );
        const selectedIndex = this.weightedRandomSelection(weights);
        const nodeIndex = this.nodeCapabilities.findIndex(n => n.id === compatibleNodes[selectedIndex].id);
        solution.push(nodeIndex);
      }
    }

    return solution;
  }

  getCompatibleNodes(task) {
    return this.nodeCapabilities.filter(node => {
      // Check if node supports this task type
      if (node.supportedTasks.length > 0 && !node.supportedTasks.includes(task.id)) {
        return false;
      }

      // Check capacity constraints
      const availableCompute = node.capacity.compute - node.utilization.compute;
      const availableMemory = node.capacity.memory - node.utilization.memory;
      const availableBandwidth = node.capacity.bandwidth - node.utilization.bandwidth;
      const availableStorage = node.capacity.storage - node.utilization.storage;

      return availableCompute >= task.computeUnits &&
             availableMemory >= task.memory &&
             availableBandwidth >= task.bandwidth &&
             availableStorage >= task.storage;
    });
  }

  calculateNodeWeight(node, task) {
    let weight = 1.0;

    // Performance factors
    weight *= node.performance.reliability;
    weight *= node.performance.availability;
    weight *= 1 / (1 + node.performance.latency / 100);
    weight *= node.performance.throughput / 1000;

    // Cost factor (lower cost is better)
    const totalCost = (task.computeUnits * node.cost.compute +
                      task.memory * node.cost.memory +
                      task.bandwidth * node.cost.bandwidth);
    weight *= Math.exp(-totalCost / 100);

    // Location preference
    if (task.locationPreference && node.location.region === task.locationPreference) {
      weight *= 1.5;
    }

    // Tag matching
    if (task.affinity.length > 0) {
      const matchingTags = task.affinity.filter(tag => node.tags.includes(tag));
      weight *= 1 + (matchingTags.length * 0.2);
    }

    return Math.max(0.1, weight);
  }

  weightedRandomSelection(weights) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return i;
      }
    }

    return weights.length - 1;
  }

  calculateEnergy(solution) {
    // Energy is the inverse of fitness (lower is better)
    const metrics = this.evaluateSolution(solution);
    const penalty = this.calculatePenalties(solution, metrics);

    // Multi-objective energy function
    const energy = (
      metrics.avgLatency * 0.3 +
      metrics.totalCost * 0.00025 +
      (1 - metrics.avgReliability) * 0.3 +
      metrics.loadBalanceIndex * 0.2 +
      penalty * 0.1
    );

    return energy;
  }

  evaluateSolution(solution) {
    // Reset node utilization
    this.nodeCapabilities.forEach(node => {
      node.utilization = {
        compute: 0,
        memory: 0,
        bandwidth: 0,
        storage: 0,
        tasks: []
      };
    });

    const allocation = [];
    let totalLatency = 0;
    let totalCost = 0;
    let totalReliability = 0;

    // Process allocation
    for (let i = 0; i < solution.length; i++) {
      const nodeIndex = solution[i];
      const node = this.nodeCapabilities[nodeIndex];
      const task = this.taskRequirements[i];

      // Update utilization
      node.utilization.compute += task.computeUnits;
      node.utilization.memory += task.memory;
      node.utilization.bandwidth += task.bandwidth;
      node.utilization.storage += task.storage;
      node.utilization.tasks.push(task);

      allocation.push({
        taskId: task.id,
        nodeId: node.id,
        task,
        node
      });

      // Calculate metrics
      const latency = this.calculateTaskLatency(node, task);
      const cost = this.calculateTaskCost(node, task);
      const reliability = this.calculateTaskReliability(node, task);

      totalLatency += latency;
      totalCost += cost;
      totalReliability += reliability;
    }

    // Calculate derived metrics
    const utilizationRates = this.nodeCapabilities.map(node => ({
      compute: (node.utilization.compute / node.capacity.compute) * 100,
      memory: (node.utilization.memory / node.capacity.memory) * 100,
      bandwidth: (node.utilization.bandwidth / node.capacity.bandwidth) * 100,
      storage: (node.utilization.storage / node.capacity.storage) * 100
    }));

    const avgUtilization = utilizationRates.reduce((sum, rates) =>
      sum + (rates.compute + rates.memory + rates.bandwidth) / 3, 0) / utilizationRates.length;

    const maxUtilization = Math.max(...utilizationRates.map(r => r.compute));
    const minUtilization = Math.min(...utilizationRates.map(r => r.compute));
    const loadBalanceIndex = maxUtilization > 0 ? (maxUtilization - minUtilization) / maxUtilization : 0;

    return {
      allocation,
      avgLatency: totalLatency / allocation.length,
      totalCost,
      avgReliability: totalReliability / allocation.length,
      loadBalanceIndex,
      avgUtilization,
      utilizationRates,
      valid: this.isValidSolution(solution)
    };
  }

  calculateTaskLatency(node, task) {
    const networkLatency = node.performance.latency;
    const computeLatency = (task.computeUnits / node.capacity.compute) * 1000;
    const bandwidthLatency = (task.bandwidth / node.performance.throughput) * 1000;

    return networkLatency + computeLatency + bandwidthLatency;
  }

  calculateTaskCost(node, task) {
    return (
      task.computeUnits * node.cost.compute +
      task.memory * node.cost.memory +
      task.bandwidth * node.cost.bandwidth +
      task.storage * node.cost.storage
    );
  }

  calculateTaskReliability(node, task) {
    const baseReliability = node.performance.reliability * node.performance.availability;
    const complexityFactor = Math.max(0.9, 1 - (task.computeUnits / 10000));
    const durationFactor = Math.max(0.95, 1 - (task.estimatedDuration / 3600000));

    return baseReliability * complexityFactor * durationFactor;
  }

  calculatePenalties(solution, metrics) {
    let penalty = 0;

    // Constraint violations
    if (metrics.avgLatency > this.constraints.maxLatency) {
      penalty += (metrics.avgLatency - this.constraints.maxLatency) * 0.1;
    }

    if (metrics.totalCost > this.constraints.maxCost) {
      penalty += (metrics.totalCost - this.constraints.maxCost) * 0.01;
    }

    if (metrics.avgReliability < this.constraints.minReliability) {
      penalty += (this.constraints.minReliability - metrics.avgReliability) * 10;
    }

    if (metrics.loadBalanceIndex > (1 - this.constraints.loadBalanceThreshold)) {
      penalty += (metrics.loadBalanceIndex - (1 - this.constraints.loadBalanceThreshold)) * 5;
    }

    // Deadline violations
    for (let i = 0; i < solution.length; i++) {
      const node = this.nodeCapabilities[solution[i]];
      const task = this.taskRequirements[i];
      const completionTime = Date.now() + this.calculateTaskLatency(node, task);

      if (completionTime > task.deadline) {
        penalty += (completionTime - task.deadline) * 0.001;
      }
    }

    return penalty;
  }

  isValidSolution(solution) {
    // Check capacity constraints
    const nodeUtilization = new Map();

    for (let i = 0; i < solution.length; i++) {
      const nodeIndex = solution[i];
      const task = this.taskRequirements[i];
      const node = this.nodeCapabilities[nodeIndex];

      if (!nodeUtilization.has(nodeIndex)) {
        nodeUtilization.set(nodeIndex, {
          compute: 0, memory: 0, bandwidth: 0, storage: 0
        });
      }

      const util = nodeUtilization.get(nodeIndex);
      util.compute += task.computeUnits;
      util.memory += task.memory;
      util.bandwidth += task.bandwidth;
      util.storage += task.storage;

      // Check if exceeds capacity
      if (util.compute > node.capacity.compute ||
          util.memory > node.capacity.memory ||
          util.bandwidth > node.capacity.bandwidth ||
          util.storage > node.capacity.storage) {
        return false;
      }
    }

    return true;
  }

  generateNeighbor(solution) {
    const neighbor = [...solution];
    const mutationType = Math.random();

    if (mutationType < 0.4) {
      // Single point mutation
      const point = Math.floor(Math.random() * solution.length);
      const task = this.taskRequirements[point];
      const compatibleNodes = this.getCompatibleNodes(task);

      if (compatibleNodes.length > 0) {
        const newNodeId = compatibleNodes[Math.floor(Math.random() * compatibleNodes.length)].id;
        const newNodeIndex = this.nodeCapabilities.findIndex(n => n.id === newNodeId);
        neighbor[point] = newNodeIndex;
      }
    } else if (mutationType < 0.7) {
      // Swap mutation
      const point1 = Math.floor(Math.random() * solution.length);
      const point2 = Math.floor(Math.random() * solution.length);
      [neighbor[point1], neighbor[point2]] = [neighbor[point2], neighbor[point1]];
    } else {
      // Block swap mutation
      const blockSize = Math.min(3, Math.floor(Math.random() * solution.length / 2) + 1);
      const start1 = Math.floor(Math.random() * (solution.length - blockSize));
      const start2 = Math.floor(Math.random() * (solution.length - blockSize));

      for (let i = 0; i < blockSize; i++) {
        [neighbor[start1 + i], neighbor[start2 + i]] =
          [neighbor[start2 + i], neighbor[start1 + i]];
      }
    }

    return neighbor;
  }
}

/**
 * Simulated Annealing Optimizer Implementation
 */
export class SimulatedAnnealingOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...SA_CONFIG, ...options };
    this.temperatureSchedule = TEMPERATURE_SCHEDULES[this.config.scheduleType || 'geometric'];
    this.problem = null;
    this.isRunning = false;
    this.iteration = 0;
    this.temperature = this.config.initialTemperature;
    this.currentSolution = null;
    this.bestSolution = null;
    this.bestEnergy = Infinity;
    this.currentEnergy = Infinity;
    this.acceptanceHistory = [];
    this.reheatCount = 0;
    this.optimizationHistory = [];
  }

  async optimize(problem, swarmId = null) {
    this.problem = problem;
    this.isRunning = true;
    this.iteration = 0;
    this.temperature = this.config.initialTemperature;
    this.acceptanceHistory = [];
    this.reheatCount = 0;
    this.optimizationHistory = [];

    this.emit('optimizationStarted', {
      swarmId,
      problemSize: problem.problemSize,
      initialTemperature: this.temperature
    });

    try {
      // Generate initial solution
      this.currentSolution = this.problem.generateRandomSolution();
      this.currentEnergy = this.problem.calculateEnergy(this.currentSolution);
      this.bestSolution = [...this.currentSolution];
      this.bestEnergy = this.currentEnergy;

      this.emit('initialSolutionGenerated', {
        energy: this.currentEnergy,
        valid: this.problem.isValidSolution(this.currentSolution)
      });

      // Main annealing loop
      while (this.temperature > this.config.finalTemperature &&
             this.iteration < this.config.maxIterations &&
             this.isRunning) {

        await this.annealingStep();

        // Check for equilibrium
        if (this.iteration % this.config.equilibriumIterations === 0) {
          await this.checkEquilibrium();
        }

        this.iteration++;
      }

      const result = this.getResult();
      this.emit('optimizationCompleted', result);

      return result;

    } catch (error) {
      this.emit('optimizationError', { error: error.message, iteration: this.iteration });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async annealingStep() {
    // Generate neighbor solution
    const neighborSolution = this.problem.generateNeighbor(this.currentSolution);
    const neighborEnergy = this.problem.calculateEnergy(neighborSolution);

    // Calculate energy difference
    const deltaEnergy = neighborEnergy - this.currentEnergy;

    // Acceptance criteria
    let accepted = false;
    if (deltaEnergy < 0) {
      // Always accept better solutions
      accepted = true;
    } else {
      // Accept worse solutions with probability based on temperature
      const acceptanceProbability = Math.exp(-deltaEnergy / this.temperature);
      accepted = Math.random() < acceptanceProbability;
    }

    // Update solution if accepted
    if (accepted) {
      this.currentSolution = neighborSolution;
      this.currentEnergy = neighborEnergy;

      // Update best solution if necessary
      if (neighborEnergy < this.bestEnergy) {
        this.bestSolution = [...neighborSolution];
        this.bestEnergy = neighborEnergy;

        this.emit('newBestSolution', {
          energy: this.bestEnergy,
          iteration: this.iteration,
          temperature: this.temperature
        });
      }
    }

    // Track acceptance
    this.acceptanceHistory.push(accepted);
    if (this.acceptanceHistory.length > this.config.equilibriumIterations) {
      this.acceptanceHistory.shift();
    }

    // Cool down temperature
    this.temperature = this.updateTemperature();

    // Record step metrics
    this.recordStepMetrics(accepted, deltaEnergy);
  }

  updateTemperature() {
    const acceptanceRate = this.calculateAcceptanceRate();

    if (this.config.scheduleType === 'adaptive') {
      return this.temperatureSchedule(
        this.temperature,
        acceptanceRate,
        this.config.acceptanceRateTarget
      );
    } else if (this.config.scheduleType === 'logarithmic') {
      return this.temperatureSchedule(this.temperature, this.iteration);
    } else {
      return this.temperatureSchedule(this.temperature, this.config.coolingRate);
    }
  }

  calculateAcceptanceRate() {
    if (this.acceptanceHistory.length === 0) return 0;
    const accepted = this.acceptanceHistory.filter(a => a).length;
    return accepted / this.acceptanceHistory.length;
  }

  async checkEquilibrium() {
    const acceptanceRate = this.calculateAcceptanceRate();

    // Check if we need to reheat
    if (acceptanceRate < this.config.reheatingThreshold &&
        this.reheatCount < this.config.maxReheats) {

      this.temperature = Math.min(
        this.config.initialTemperature,
        this.temperature * 2
      );
      this.reheatCount++;

      this.emit('reheating', {
        newTemperature: this.temperature,
        acceptanceRate,
        reheatCount: this.reheatCount
      });
    }

    // Emit equilibrium metrics
    const equilibriumMetrics = {
      iteration: this.iteration,
      temperature: this.temperature,
      acceptanceRate,
      currentEnergy: this.currentEnergy,
      bestEnergy: this.bestEnergy,
      stagnation: this.currentEnergy === this.bestEnergy
    };

    this.emit('equilibriumReached', equilibriumMetrics);
  }

  recordStepMetrics(accepted, deltaEnergy) {
    const stepMetrics = {
      iteration: this.iteration,
      temperature: this.temperature,
      currentEnergy: this.currentEnergy,
      bestEnergy: this.bestEnergy,
      deltaEnergy,
      accepted,
      acceptanceRate: this.calculateAcceptanceRate()
    };

    this.optimizationHistory.push(stepMetrics);

    // Limit history size
    if (this.optimizationHistory.length > 1000) {
      this.optimizationHistory = this.optimizationHistory.slice(-1000);
    }
  }

  getResult() {
    if (!this.bestSolution) {
      throw new Error('No valid solution found');
    }

    const evaluation = this.problem.evaluateSolution(this.bestSolution);
    const efficiency = this.calculateEfficiency();

    return {
      solution: evaluation.allocation,
      energy: this.bestEnergy,
      fitness: 1 / (1 + this.bestEnergy), // Convert to fitness
      metrics: {
        avgLatency: evaluation.avgLatency,
        totalCost: evaluation.totalCost,
        avgReliability: evaluation.avgReliability,
        loadBalanceIndex: evaluation.loadBalanceIndex,
        avgUtilization: evaluation.avgUtilization,
        valid: evaluation.valid
      },
      optimization: {
        iterations: this.iteration,
        finalTemperature: this.temperature,
        reheatCount: this.reheatCount,
        convergenceRate: this.calculateConvergenceRate(),
        acceptanceRate: this.calculateAcceptanceRate()
      },
      efficiency,
      swarmId: this.config.swarmId,
      history: this.optimizationHistory.slice(-100) // Last 100 steps
    };
  }

  calculateEfficiency() {
    const targetEfficiency = 0.95;
    const currentEfficiency = 1 / (1 + this.bestEnergy);
    return Math.min(1.0, currentEfficiency / targetEfficiency);
  }

  calculateConvergenceRate() {
    if (this.optimizationHistory.length < 10) return 0;

    const recent = this.optimizationHistory.slice(-10);
    const energyReduction = recent[0].bestEnergy - recent[recent.length - 1].bestEnergy;
    const iterations = recent.length;

    return energyReduction / iterations;
  }

  stop() {
    this.isRunning = false;
    this.emit('optimizationStopped', {
      iteration: this.iteration,
      temperature: this.temperature,
      bestEnergy: this.bestEnergy
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      iteration: this.iteration,
      temperature: this.temperature,
      currentEnergy: this.currentEnergy,
      bestEnergy: this.bestEnergy,
      acceptanceRate: this.calculateAcceptanceRate(),
      reheatCount: this.reheatCount,
      convergenceRate: this.calculateConvergenceRate()
    };
  }
}

/**
 * Utility functions for creating and configuring simulated annealing optimizations
 */
export function createSimulatedAnnealingOptimizer(options = {}) {
  return new SimulatedAnnealingOptimizer(options);
}

export function createNodePlacementProblem(nodes, tasks, constraints = {}) {
  return new NodePlacementProblem(nodes, tasks, constraints);
}

export default SimulatedAnnealingOptimizer;