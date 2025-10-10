/**
 * Genetic Algorithm for Node Distribution Optimization
 *
 * This algorithm evolves optimal node distribution strategies over time,
 * optimizing for latency, cost, and reliability metrics.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

/**
 * Genetic Algorithm Configuration
 */
const GA_CONFIG = {
  populationSize: 100,
  generations: 50,
  mutationRate: 0.1,
  crossoverRate: 0.7,
  elitismRate: 0.1,
  tournamentSize: 5,
  convergenceThreshold: 0.001,
  maxStagnantGenerations: 10
};

/**
 * Node Distribution Problem Definition
 */
class NodeDistributionProblem {
  constructor(nodes, tasks, constraints = {}) {
    this.nodes = nodes;
    this.tasks = tasks;
    this.constraints = {
      maxLatency: constraints.maxLatency || 200,
      maxCost: constraints.maxCost || 1000,
      minReliability: constraints.minReliability || 0.95,
      ...constraints
    };

    this.problemSize = nodes.length;
    this.taskRequirements = this.calculateTaskRequirements();
  }

  calculateTaskRequirements() {
    return this.tasks.map(task => ({
      id: task.id,
      computeUnits: task.computeUnits || 1,
      memory: task.memory || 1024,
      bandwidth: task.bandwidth || 100,
      priority: task.priority || 1,
      deadline: task.deadline || Date.now() + 300000,
      affinity: task.affinity || []
    }));
  }

  evaluateFitness(individual) {
    const allocation = this.decodeIndividual(individual);
    const metrics = this.calculateMetrics(allocation);

    // Multi-objective fitness function
    const latencyScore = this.calculateLatencyScore(allocation, metrics);
    const costScore = this.calculateCostScore(allocation, metrics);
    const reliabilityScore = this.calculateReliabilityScore(allocation, metrics);
    const loadBalanceScore = this.calculateLoadBalanceScore(allocation, metrics);

    // Weighted fitness (can be adjusted based on priorities)
    const fitness = (
      latencyScore * 0.3 +
      costScore * 0.25 +
      reliabilityScore * 0.3 +
      loadBalanceScore * 0.15
    );

    return {
      fitness,
      metrics: {
        latency: metrics.avgLatency,
        cost: metrics.totalCost,
        reliability: metrics.avgReliability,
        loadBalance: metrics.loadBalanceIndex,
        utilization: metrics.avgUtilization
      },
      valid: this.isValidAllocation(allocation)
    };
  }

  decodeIndividual(individual) {
    const allocation = [];

    for (let i = 0; i < this.taskRequirements.length; i++) {
      const nodeIndex = individual[i] % this.nodes.length;
      allocation.push({
        taskId: this.taskRequirements[i].id,
        nodeId: this.nodes[nodeIndex].id,
        node: this.nodes[nodeIndex],
        task: this.taskRequirements[i]
      });
    }

    return allocation;
  }

  calculateMetrics(allocation) {
    const nodeUtilization = new Map();
    let totalLatency = 0;
    let totalCost = 0;
    let totalReliability = 0;

    // Initialize node metrics
    this.nodes.forEach(node => {
      nodeUtilization.set(node.id, {
        compute: 0,
        memory: 0,
        bandwidth: 0,
        tasks: []
      });
    });

    // Calculate allocation metrics
    allocation.forEach(alloc => {
      const node = alloc.node;
      const task = alloc.task;
      const utilization = nodeUtilization.get(node.id);

      // Update utilization
      utilization.compute += task.computeUnits;
      utilization.memory += task.memory;
      utilization.bandwidth += task.bandwidth;
      utilization.tasks.push(task);

      // Calculate latency (network + processing)
      const networkLatency = this.calculateNetworkLatency(node, task);
      const processingLatency = this.calculateProcessingLatency(node, task);
      const latency = networkLatency + processingLatency;
      totalLatency += latency;

      // Calculate cost
      const cost = this.calculateTaskCost(node, task);
      totalCost += cost;

      // Calculate reliability
      const reliability = node.reliability * this.calculateTaskReliability(node, task);
      totalReliability += reliability;
    });

    // Calculate derived metrics
    const utilizationValues = Array.from(nodeUtilization.values()).map(u => {
      const nodeId = Array.from(nodeUtilization.entries()).find(([id, util]) => util === u)?.[0];
      const node = this.nodes.find(n => n.id === nodeId);
      return node ? (u.compute / node.capacity.compute) * 100 : 0;
    });

    const avgUtilization = utilizationValues.reduce((a, b) => a + b, 0) / utilizationValues.length;
    const maxUtilization = Math.max(...utilizationValues);
    const minUtilization = Math.min(...utilizationValues);
    const loadBalanceIndex = maxUtilization > 0 ? (maxUtilization - minUtilization) / maxUtilization : 0;

    return {
      avgLatency: totalLatency / allocation.length,
      totalCost,
      avgReliability: totalReliability / allocation.length,
      loadBalanceIndex,
      avgUtilization,
      nodeUtilization: Object.fromEntries(nodeUtilization)
    };
  }

  calculateNetworkLatency(node, task) {
    // Simplified latency calculation based on distance and bandwidth
    const baseLatency = node.latency || 10;
    const bandwidthFactor = Math.max(1, task.bandwidth / node.bandwidth);
    return baseLatency * bandwidthFactor;
  }

  calculateProcessingLatency(node, task) {
    const processingPower = node.capacity.compute || 1;
    const processingTime = (task.computeUnits / processingPower) * 1000;
    return processingTime;
  }

  calculateTaskCost(node, task) {
    const computeCost = (task.computeUnits / 1000) * (node.costPerCompute || 0.01);
    const memoryCost = (task.memory / 1024) * (node.costPerMemory || 0.001);
    const bandwidthCost = (task.bandwidth / 1000) * (node.costPerBandwidth || 0.005);
    return computeCost + memoryCost + bandwidthCost;
  }

  calculateTaskReliability(node, task) {
    // Base reliability adjusted by task complexity and node load
    const baseReliability = node.reliability || 0.99;
    const complexityFactor = Math.max(0.9, 1 - (task.computeUnits / 10000));
    return baseReliability * complexityFactor;
  }

  calculateLatencyScore(allocation, metrics) {
    const maxAcceptableLatency = this.constraints.maxLatency;
    const latencyScore = Math.max(0, 1 - (metrics.avgLatency / maxAcceptableLatency));
    return latencyScore;
  }

  calculateCostScore(allocation, metrics) {
    const maxAcceptableCost = this.constraints.maxCost;
    const costScore = Math.max(0, 1 - (metrics.totalCost / maxAcceptableCost));
    return costScore;
  }

  calculateReliabilityScore(allocation, metrics) {
    const minAcceptableReliability = this.constraints.minReliability;
    const reliabilityScore = Math.max(0, (metrics.avgReliability - minAcceptableReliability) / (1 - minAcceptableReliability));
    return reliabilityScore;
  }

  calculateLoadBalanceScore(allocation, metrics) {
    // Lower load balance index is better (more balanced)
    return Math.max(0, 1 - metrics.loadBalanceIndex);
  }

  isValidAllocation(allocation) {
    // Check if allocation respects all constraints
    for (const alloc of allocation) {
      const node = alloc.node;
      const task = alloc.task;

      // Check capacity constraints
      if (task.computeUnits > node.capacity.compute) return false;
      if (task.memory > node.capacity.memory) return false;
      if (task.bandwidth > node.capacity.bandwidth) return false;

      // Check deadline constraints
      const latency = this.calculateNetworkLatency(node, task) + this.calculateProcessingLatency(node, task);
      if (Date.now() + latency > task.deadline) return false;

      // Check reliability constraints
      const reliability = node.reliability * this.calculateTaskReliability(node, task);
      if (reliability < this.constraints.minReliability) return false;
    }

    return true;
  }
}

/**
 * Genetic Algorithm Implementation
 */
export class GeneticAlgorithmOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = { ...GA_CONFIG, ...options };
    this.generation = 0;
    this.population = [];
    this.bestIndividual = null;
    this.bestFitness = -Infinity;
    this.stagnantGenerations = 0;
    this.problem = null;
    this.isRunning = false;
    this.optimizationHistory = [];
  }

  async optimize(problem, swarmId = null) {
    this.problem = problem;
    this.isRunning = true;
    this.generation = 0;
    this.bestFitness = -Infinity;
    this.stagnantGenerations = 0;
    this.optimizationHistory = [];

    this.emit('optimizationStarted', {
      swarmId,
      problemSize: problem.problemSize,
      populationSize: this.config.populationSize
    });

    try {
      // Initialize population
      await this.initializePopulation();

      // Evolution loop
      while (this.generation < this.config.generations && this.isRunning) {
        await this.evolveGeneration();

        // Check for convergence
        if (this.checkConvergence()) {
          this.emit('convergenceReached', { generation: this.generation });
          break;
        }

        this.generation++;
      }

      const result = this.getResult();
      this.emit('optimizationCompleted', result);

      return result;

    } catch (error) {
      this.emit('optimizationError', { error: error.message, generation: this.generation });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async initializePopulation() {
    this.population = [];

    for (let i = 0; i < this.config.populationSize; i++) {
      const individual = this.generateRandomIndividual();
      const fitness = this.problem.evaluateFitness(individual);

      this.population.push({
        id: crypto.randomBytes(8).toString('hex'),
        individual,
        fitness: fitness.fitness,
        metrics: fitness.metrics,
        valid: fitness.valid,
        generation: 0,
        parentIds: []
      });

      // Track best individual
      if (fitness.fitness > this.bestFitness && fitness.valid) {
        this.bestFitness = fitness.fitness;
        this.bestIndividual = {
          ...this.population[this.population.length - 1],
          age: 0
        };
      }
    }

    this.emit('populationInitialized', {
      populationSize: this.population.length,
      bestFitness: this.bestFitness
    });
  }

  generateRandomIndividual() {
    const individual = [];
    for (let i = 0; i < this.problem.problemSize; i++) {
      individual.push(Math.floor(Math.random() * this.problem.nodes.length));
    }
    return individual;
  }

  async evolveGeneration() {
    const newPopulation = [];

    // Elitism - keep best individuals
    const eliteCount = Math.floor(this.config.populationSize * this.config.elitismRate);
    const elite = this.selectElite(eliteCount);
    newPopulation.push(...elite);

    // Generate offspring
    while (newPopulation.length < this.config.populationSize) {
      if (Math.random() < this.config.crossoverRate) {
        // Crossover
        const parent1 = this.tournamentSelection();
        const parent2 = this.tournamentSelection();
        const offspring = this.crossover(parent1.individual, parent2.individual);

        for (const child of offspring) {
          if (Math.random() < this.config.mutationRate) {
            this.mutate(child);
          }

          const fitness = this.problem.evaluateFitness(child);
          const individualData = {
            id: crypto.randomBytes(8).toString('hex'),
            individual: child,
            fitness: fitness.fitness,
            metrics: fitness.metrics,
            valid: fitness.valid,
            generation: this.generation + 1,
            parentIds: [parent1.id, parent2.id]
          };

          newPopulation.push(individualData);

          // Track best individual
          if (fitness.fitness > this.bestFitness && fitness.valid) {
            const wasImprovement = fitness.fitness > this.bestFitness;
            this.bestFitness = fitness.fitness;
            this.bestIndividual = {
              ...individualData,
              age: 0
            };

            if (wasImprovement) {
              this.stagnantGenerations = 0;
              this.emit('newBestSolution', {
                fitness: this.bestFitness,
                generation: this.generation,
                metrics: fitness.metrics
              });
            }
          }
        }
      } else {
        // Direct selection with mutation
        const parent = this.tournamentSelection();
        const child = [...parent.individual];

        if (Math.random() < this.config.mutationRate) {
          this.mutate(child);
        }

        const fitness = this.problem.evaluateFitness(child);
        const individualData = {
          id: crypto.randomBytes(8).toString('hex'),
          individual: child,
          fitness: fitness.fitness,
          metrics: fitness.metrics,
          valid: fitness.valid,
          generation: this.generation + 1,
          parentIds: [parent.id]
        };

        newPopulation.push(individualData);
      }
    }

    // Trim population to exact size
    this.population = newPopulation.slice(0, this.config.populationSize);

    // Update best individual age
    if (this.bestIndividual) {
      this.bestIndividual.age++;
    } else {
      this.stagnantGenerations++;
    }

    // Store generation metrics
    const generationMetrics = this.calculateGenerationMetrics();
    this.optimizationHistory.push(generationMetrics);

    this.emit('generationCompleted', {
      generation: this.generation,
      populationSize: this.population.length,
      bestFitness: this.bestFitness,
      avgFitness: generationMetrics.avgFitness,
      diversity: generationMetrics.diversity,
      stagnantGenerations: this.stagnantGenerations
    });
  }

  selectElite(count) {
    return this.population
      .filter(ind => ind.valid)
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, count)
      .map(ind => ({ ...ind, age: 0 }));
  }

  tournamentSelection() {
    const tournament = [];

    for (let i = 0; i < this.config.tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * this.population.length);
      tournament.push(this.population[randomIndex]);
    }

    return tournament
      .filter(ind => ind.valid)
      .sort((a, b) => b.fitness - a.fitness)[0] || tournament[0];
  }

  crossover(parent1, parent2) {
    const child1 = [];
    const child2 = [];

    // Uniform crossover
    for (let i = 0; i < parent1.length; i++) {
      if (Math.random() < 0.5) {
        child1.push(parent1[i]);
        child2.push(parent2[i]);
      } else {
        child1.push(parent2[i]);
        child2.push(parent1[i]);
      }
    }

    return [child1, child2];
  }

  mutate(individual) {
    const mutationType = Math.random();

    if (mutationType < 0.3) {
      // Point mutation
      const point = Math.floor(Math.random() * individual.length);
      individual[point] = Math.floor(Math.random() * this.problem.nodes.length);
    } else if (mutationType < 0.6) {
      // Swap mutation
      const point1 = Math.floor(Math.random() * individual.length);
      const point2 = Math.floor(Math.random() * individual.length);
      [individual[point1], individual[point2]] = [individual[point2], individual[point1]];
    } else {
      // Inversion mutation
      const start = Math.floor(Math.random() * individual.length);
      const end = Math.floor(Math.random() * individual.length);
      const [min, max] = [Math.min(start, end), Math.max(start, end)];

      for (let i = min, j = max; i < j; i++, j--) {
        [individual[i], individual[j]] = [individual[j], individual[i]];
      }
    }
  }

  checkConvergence() {
    if (this.stagnantGenerations >= this.config.maxStagnantGenerations) {
      return true;
    }

    if (this.optimizationHistory.length < 2) {
      return false;
    }

    const currentFitness = this.optimizationHistory[this.optimizationHistory.length - 1].bestFitness;
    const previousFitness = this.optimizationHistory[this.optimizationHistory.length - 2].bestFitness;

    const improvement = Math.abs(currentFitness - previousFitness);
    return improvement < this.config.convergenceThreshold;
  }

  calculateGenerationMetrics() {
    const validIndividuals = this.population.filter(ind => ind.valid);

    if (validIndividuals.length === 0) {
      return {
        avgFitness: 0,
        bestFitness: 0,
        worstFitness: 0,
        diversity: 0,
        validCount: 0
      };
    }

    const fitnesses = validIndividuals.map(ind => ind.fitness);
    const avgFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const bestFitness = Math.max(...fitnesses);
    const worstFitness = Math.min(...fitnesses);

    // Calculate diversity (average Hamming distance)
    let totalDistance = 0;
    let comparisons = 0;

    for (let i = 0; i < validIndividuals.length; i++) {
      for (let j = i + 1; j < validIndividuals.length; j++) {
        const distance = this.hammingDistance(
          validIndividuals[i].individual,
          validIndividuals[j].individual
        );
        totalDistance += distance;
        comparisons++;
      }
    }

    const diversity = comparisons > 0 ? totalDistance / comparisons : 0;

    return {
      avgFitness,
      bestFitness,
      worstFitness,
      diversity,
      validCount: validIndividuals.length
    };
  }

  hammingDistance(ind1, ind2) {
    let distance = 0;
    for (let i = 0; i < ind1.length; i++) {
      if (ind1[i] !== ind2[i]) distance++;
    }
    return distance;
  }

  getResult() {
    if (!this.bestIndividual) {
      throw new Error('No valid solution found');
    }

    const allocation = this.problem.decodeIndividual(this.bestIndividual.individual);

    return {
      solution: allocation,
      fitness: this.bestIndividual.fitness,
      metrics: this.bestIndividual.metrics,
      generations: this.generation,
      convergenceGeneration: this.generation - this.bestIndividual.age,
      optimizationHistory: this.optimizationHistory,
      efficiency: this.calculateEfficiency(),
      swarmId: this.config.swarmId
    };
  }

  calculateEfficiency() {
    if (!this.bestIndividual) return 0;

    const targetEfficiency = 0.95;
    const efficiency = Math.min(1.0, this.bestIndividual.fitness / targetEfficiency);
    return efficiency;
  }

  stop() {
    this.isRunning = false;
    this.emit('optimizationStopped', { generation: this.generation });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      generation: this.generation,
      populationSize: this.population.length,
      bestFitness: this.bestFitness,
      stagnantGenerations: this.stagnantGenerations,
      convergence: this.checkConvergence()
    };
  }
}

/**
 * Utility functions for creating and configuring genetic algorithm optimizations
 */
export function createGeneticOptimizer(options = {}) {
  return new GeneticAlgorithmOptimizer(options);
}

export function createNodeDistributionProblem(nodes, tasks, constraints = {}) {
  return new NodeDistributionProblem(nodes, tasks, constraints);
}

export default GeneticAlgorithmOptimizer;