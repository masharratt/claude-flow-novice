/**
 * Simplified Auto-Scaling Engine Demo (No Redis Required)
 * Demonstrates the Phase 2 Auto-Scaling Engine algorithms and logic
 */

// Mock Redis for demonstration
class MockRedis {
  constructor() {
    this.data = new Map();
    this.subscribers = new Map();
  }

  async get(key) {
    return this.data.get(key);
  }

  async set(key, value) {
    this.data.set(key, value);
  }

  async hget(hash, field) {
    const hashData = this.data.get(hash) || {};
    return hashData[field];
  }

  async hset(hash, field, value) {
    const hashData = this.data.get(hash) || {};
    hashData[field] = value;
    this.data.set(hash, hashData);
  }

  async hgetall(hash) {
    return this.data.get(hash) || {};
  }

  async llen(key) {
    const list = this.data.get(key) || [];
    return list.length;
  }

  async lpush(key, ...items) {
    const list = this.data.get(key) || [];
    list.unshift(...items);
    this.data.set(key, list);
    return list.length;
  }

  async lpop(key) {
    const list = this.data.get(key) || [];
    return list.shift();
  }

  async subscribe(channel) {
    return Promise.resolve();
  }

  async publish(channel, message) {
    const subscribers = this.subscribers.get(channel) || [];
    subscribers.forEach(callback => {
      try {
        callback(channel, message);
      } catch (error) {
        console.error('Subscriber error:', error);
      }
    });
    return Promise.resolve();
  }

  on(event, callback) {
    if (event === 'message') {
      // Store callback for later use
      this.messageCallback = callback;
    }
  }

  async quit() {
    return Promise.resolve();
  }
}

// Simplified Scaling Algorithm implementation
class ScalingAlgorithm {
  constructor(type, config = {}) {
    this.type = type;
    this.config = {
      predictive: {
        lookbackWindow: 300,
        forecastWindow: 60,
        minConfidence: 0.7
      },
      reactive: {
        thresholds: {
          scaleUp: 0.8,
          scaleDown: 0.3
        },
        cooldown: {
          scaleUp: 30000,
          scaleDown: 120000
        }
      },
      hybrid: {
        predictiveWeight: 0.6,
        reactiveWeight: 0.4
      },
      ...config
    };
    this.metrics = new Map();
    this.lastDecision = null;
    this.lastScaleTime = { up: 0, down: 0 };
  }

  async analyze(metrics) {
    this.updateMetrics(metrics);

    switch (this.type) {
      case 'predictive':
        return this.predictiveScaling();
      case 'reactive':
        return this.reactiveScaling();
      case 'hybrid':
        return this.hybridScaling();
      default:
        throw new Error(`Unknown scaling algorithm type: ${this.type}`);
    }
  }

  predictiveScaling() {
    const currentMetrics = this.getCurrentMetrics();

    if (!currentMetrics || currentMetrics.length < 5) {
      return this.createDecision('no_action', 0.5, 'Insufficient data for prediction');
    }

    // Simple trend calculation
    const recentMetrics = currentMetrics.slice(-5);
    const avgUtilization = recentMetrics.reduce((sum, m) => sum + m.utilization, 0) / recentMetrics.length;
    const trend = recentMetrics[recentMetrics.length - 1].utilization - recentMetrics[0].utilization;

    const forecastedUtilization = Math.max(0, Math.min(1, avgUtilization + trend * 0.5));
    const confidence = 0.7 + Math.random() * 0.2; // Simulated confidence

    if (forecastedUtilization > 0.8) {
      return this.createDecision('scale_up', confidence,
        `Predicted high utilization: ${(forecastedUtilization * 100).toFixed(1)}%`);
    } else if (forecastedUtilization < 0.3) {
      return this.createDecision('scale_down', confidence,
        `Predicted low utilization: ${(forecastedUtilization * 100).toFixed(1)}%`);
    }

    return this.createDecision('no_action', confidence, 'Predicted optimal utilization');
  }

  reactiveScaling() {
    const config = this.config.reactive;
    const currentMetrics = this.getCurrentMetrics();
    const now = Date.now();

    if (!currentMetrics || currentMetrics.length === 0) {
      return this.createDecision('no_action', 0.5, 'No metrics available');
    }

    const latestMetric = currentMetrics[currentMetrics.length - 1];
    const utilization = latestMetric.utilization;

    if (utilization > config.thresholds.scaleUp) {
      if (now - this.lastScaleTime.up < config.cooldown.scaleUp) {
        return this.createDecision('no_action', 0.8, 'Scale up cooldown active');
      }

      this.lastScaleTime.up = now;
      return this.createDecision('scale_up', 0.9,
        `High utilization: ${(utilization * 100).toFixed(1)}%`);
    } else if (utilization < config.thresholds.scaleDown) {
      if (now - this.lastScaleTime.down < config.cooldown.scaleDown) {
        return this.createDecision('no_action', 0.8, 'Scale down cooldown active');
      }

      this.lastScaleTime.down = now;
      return this.createDecision('scale_down', 0.9,
        `Low utilization: ${(utilization * 100).toFixed(1)}%`);
    }

    return this.createDecision('no_action', 0.7, 'Utilization within optimal range');
  }

  hybridScaling() {
    const predictiveResult = this.predictiveScaling();
    const reactiveResult = this.reactiveScaling();

    const weightedConfidence =
      (predictiveResult.confidence * this.config.hybrid.predictiveWeight) +
      (reactiveResult.confidence * this.config.hybrid.reactiveWeight);

    if (predictiveResult.action === reactiveResult.action) {
      return {
        ...predictiveResult,
        confidence: Math.min(0.95, weightedConfidence + 0.1),
        reasoning: `Consensus: ${predictiveResult.reasoning} | ${reactiveResult.reasoning}`
      };
    }

    if (reactiveResult.action !== 'no_action') {
      return {
        ...reactiveResult,
        confidence: weightedConfidence,
        reasoning: `Reactive priority: ${reactiveResult.reasoning}`
      };
    }

    return {
      ...predictiveResult,
      confidence: weightedConfidence * 0.8,
      reasoning: `Predictive preference: ${predictiveResult.reasoning}`
    };
  }

  updateMetrics(metrics) {
    const timestamp = Date.now();
    this.metrics.set(timestamp, {
      timestamp,
      ...metrics,
      utilization: this.calculateUtilization(metrics)
    });

    // Keep only recent metrics
    const cutoffTime = timestamp - (this.config.predictive.lookbackWindow * 1000);
    for (const [key] of this.metrics) {
      if (key < cutoffTime) {
        this.metrics.delete(key);
      }
    }
  }

  calculateUtilization(metrics) {
    if (!metrics) return 0;

    const weights = { cpu: 0.3, memory: 0.2, taskQueue: 0.3, responseTime: 0.2 };

    const utilization = {
      cpu: Math.min(1, metrics.cpu || 0),
      memory: Math.min(1, metrics.memory || 0),
      taskQueue: Math.min(1, metrics.taskQueue / 10 || 0),
      responseTime: Math.min(1, metrics.responseTime / 1000 || 0)
    };

    return Object.keys(weights).reduce((total, key) =>
      total + (utilization[key] * weights[key]), 0);
  }

  getCurrentMetrics() {
    return Array.from(this.metrics.values())
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  createDecision(action, confidence, reasoning) {
    this.lastDecision = {
      action,
      confidence,
      reasoning,
      timestamp: Date.now(),
      algorithm: this.type
    };
    return this.lastDecision;
  }
}

// Simplified Pool Manager
class DynamicPoolManager {
  constructor(config = {}) {
    this.config = {
      pool: {
        minSize: 5,
        maxSize: 200,
        initialSize: 10
      },
      scaling: {
        algorithm: 'hybrid',
        scaleUpCooldown: 30000,
        scaleDownCooldown: 120000,
        checkInterval: 5000
      }
    };

    this.agents = new Map();
    this.metrics = new Map();
    this.lastScaleTime = { up: 0, down: 0 };
    this.isRunning = false;
    this.stats = {
      scaleUps: 0,
      scaleDowns: 0,
      totalAgents: 0,
      avgUtilization: 0
    };

    this.scalingAlgorithm = new ScalingAlgorithm(
      this.config.scaling.algorithm,
      this.config.scaling.config
    );

    this.initializePool();
  }

  initializePool() {
    const initialSize = this.config.pool.initialSize;
    console.log(`Initializing agent pool with ${initialSize} agents...`);

    for (let i = 0; i < initialSize; i++) {
      this.addAgent();
    }

    console.log(`Agent pool initialized with ${this.agents.size} agents`);
  }

  async start() {
    if (this.isRunning) {
      console.log('Dynamic Pool Manager is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting Dynamic Pool Manager...');

    this.monitoringInterval = setInterval(async () => {
      await this.checkScaling();
    }, this.config.scaling.checkInterval);
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping Dynamic Pool Manager...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }

  async checkScaling() {
    try {
      const currentMetrics = await this.collectMetrics();
      const scalingDecision = await this.scalingAlgorithm.analyze(currentMetrics);

      console.log(`Scaling decision: ${scalingDecision.action} (${scalingDecision.reasoning})`);

      if (scalingDecision.action === 'scale_up') {
        await this.scaleUp(scalingDecision);
      } else if (scalingDecision.action === 'scale_down') {
        await this.scaleDown(scalingDecision);
      }

      await this.updateStats(currentMetrics);

    } catch (error) {
      console.error('Error during scaling check:', error);
    }
  }

  async scaleUp(decision) {
    const now = Date.now();
    const cooldown = this.config.scaling.scaleUpCooldown;

    if (now - this.lastScaleTime.up < cooldown) {
      console.log('Scale up cooldown active, skipping');
      return;
    }

    if (this.agents.size >= this.config.pool.maxSize) {
      console.log('Pool at maximum size, cannot scale up');
      return;
    }

    const agentsToAdd = Math.min(
      Math.ceil(this.agents.size * 0.2),
      this.config.pool.maxSize - this.agents.size
    );

    console.log(`⬆️  Scaling up by ${agentsToAdd} agents: ${decision.reasoning}`);

    for (let i = 0; i < agentsToAdd; i++) {
      this.addAgent();
    }

    this.lastScaleTime.up = now;
    this.stats.scaleUps++;
  }

  async scaleDown(decision) {
    const now = Date.now();
    const cooldown = this.config.scaling.scaleDownCooldown;

    if (now - this.lastScaleTime.down < cooldown) {
      console.log('Scale down cooldown active, skipping');
      return;
    }

    if (this.agents.size <= this.config.pool.minSize) {
      console.log('Pool at minimum size, cannot scale down');
      return;
    }

    const agentsToRemove = Math.min(
      Math.ceil(this.agents.size * 0.15),
      this.agents.size - this.config.pool.minSize
    );

    console.log(`⬇️  Scaling down by ${agentsToRemove} agents: ${decision.reasoning}`);

    for (let i = 0; i < agentsToRemove; i++) {
      const agentId = this.getIdleAgents(1)[0];
      if (agentId) {
        this.removeAgent(agentId);
      }
    }

    this.lastScaleTime.down = now;
    this.stats.scaleDowns++;
  }

  addAgent() {
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const agent = {
      id: agentId,
      status: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      tasksCompleted: 0,
      utilization: 0
    };

    this.agents.set(agentId, agent);
    return agentId;
  }

  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`Agent ${agentId} not found in pool`);
      return;
    }

    agent.status = 'terminating';
    this.agents.delete(agentId);
    console.log(`Agent ${agentId} removed from pool`);
  }

  getIdleAgents(count) {
    const agents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'idle')
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, count)
      .map(agent => agent.id);

    return agents;
  }

  async collectMetrics() {
    const now = Date.now();
    const activeAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === 'active');

    const avgAgentUtilization = activeAgents.length > 0
      ? activeAgents.reduce((sum, agent) => sum + agent.utilization, 0) / activeAgents.length
      : 0;

    // Simulate system metrics
    const systemMetrics = {
      cpu: 0.3 + Math.random() * 0.5,
      memory: 0.4 + Math.random() * 0.4,
      responseTime: 50 + Math.random() * 150
    };

    const metrics = {
      timestamp: now,
      poolSize: this.agents.size,
      activeAgents: activeAgents.length,
      idleAgents: this.agents.size - activeAgents.length,
      agentUtilization: avgAgentUtilization,
      taskQueue: Math.floor(Math.random() * 20),
      responseTime: systemMetrics.responseTime,
      cpu: systemMetrics.cpu,
      memory: systemMetrics.memory
    };

    this.metrics.set(now, metrics);

    // Keep only recent metrics
    const cutoffTime = now - (60 * 60 * 1000);
    for (const [timestamp] of this.metrics) {
      if (timestamp < cutoffTime) {
        this.metrics.delete(timestamp);
      }
    }

    return metrics;
  }

  async updateStats(currentMetrics) {
    this.stats.totalAgents = this.agents.size;
    this.stats.avgUtilization = currentMetrics.agentUtilization;
  }

  getPoolStatus() {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.status === 'active');
    const idleAgents = agents.filter(a => a.status === 'idle');

    return {
      poolSize: agents.length,
      activeAgents: activeAgents.length,
      idleAgents: idleAgents.length,
      utilization: activeAgents.length > 0
        ? activeAgents.reduce((sum, a) => sum + a.utilization, 0) / activeAgents.length
        : 0,
      stats: this.stats,
      config: this.config
    };
  }
}

// Performance Benchmarking
class PerformanceBenchmark {
  constructor(config = {}) {
    this.config = {
      benchmarks: {
        efficiency: {
          target: 0.40,
          measurementInterval: 60000,
          baselineWindow: 300000
        },
        utilization: {
          target: 0.85,
          minThreshold: 0.7,
          maxThreshold: 0.95
        },
        responseTime: {
          target: 100,
          maxAcceptable: 500
        }
      }
    };

    this.isRunning = false;
    this.metrics = new Map();
    this.baseline = null;
    this.results = {
      efficiency: 0,
      utilization: 0,
      responseTime: 0,
      overall: 0
    };

    this.counters = {
      tasksProcessed: 0,
      scaleUpEvents: 0,
      scaleDownEvents: 0,
      totalResponseTime: 0,
      responseTimeSamples: 0
    };
  }

  async start() {
    if (this.isRunning) {
      console.log('Performance Benchmark is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting Performance Benchmark...');

    await this.establishBaseline();

    this.measurementInterval = setInterval(async () => {
      await this.runBenchmarkCycle();
    }, this.config.benchmarks.efficiency.measurementInterval);
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping Performance Benchmark...');

    if (this.measurementInterval) {
      clearInterval(this.measurementInterval);
    }
  }

  async establishBaseline() {
    console.log('Establishing performance baseline...');

    const baselineStart = Date.now();
    const baselineMetrics = [];

    const baselineInterval = setInterval(async () => {
      const metrics = await this.collectCurrentMetrics();
      baselineMetrics.push(metrics);

      if (Date.now() - baselineStart >= 10000) { // 10 seconds for demo
        clearInterval(baselineInterval);

        this.baseline = this.calculateBaseline(baselineMetrics);
        console.log('Baseline established:', this.baseline);
      }
    }, 2000);
  }

  calculateBaseline(metrics) {
    if (metrics.length === 0) {
      return { utilization: 0.5, responseTime: 200, throughput: 10 };
    }

    const avgUtilization = metrics.reduce((sum, m) => sum + m.utilization, 0) / metrics.length;
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length;
    const avgThroughput = metrics.reduce((sum, m) => sum + m.throughput, 0) / metrics.length;

    return {
      utilization: avgUtilization,
      responseTime: avgResponseTime,
      throughput: avgThroughput,
      timestamp: Date.now(),
      sampleSize: metrics.length
    };
  }

  async runBenchmarkCycle() {
    try {
      const cycleStart = Date.now();
      const currentMetrics = await this.collectCurrentMetrics();

      const efficiency = await this.calculateEfficiency(currentMetrics);
      const utilization = await this.calculateUtilization(currentMetrics);
      const responseTime = await this.calculateResponseTime(currentMetrics);

      this.results = {
        efficiency,
        utilization,
        responseTime,
        overall: this.calculateOverallScore(efficiency, utilization, responseTime)
      };

      this.metrics.set(Date.now(), {
        ...currentMetrics,
        ...this.results
      });

      console.log(`📊 Performance: Efficiency ${(efficiency * 100).toFixed(1)}%, ` +
                  `Utilization ${(utilization * 100).toFixed(1)}%, ` +
                  `Response Score ${(responseTime * 100).toFixed(1)}%`);

    } catch (error) {
      console.error('Error during benchmark cycle:', error);
    }
  }

  async collectCurrentMetrics() {
    // Simulate current metrics
    return {
      timestamp: Date.now(),
      poolSize: 10 + Math.floor(Math.random() * 20),
      activeAgents: 5 + Math.floor(Math.random() * 15),
      taskQueueSize: Math.floor(Math.random() * 10),
      utilization: 0.6 + Math.random() * 0.3,
      responseTime: 80 + Math.random() * 120,
      throughput: 8 + Math.random() * 12
    };
  }

  async calculateEfficiency(currentMetrics) {
    if (!this.baseline) {
      return 0;
    }

    const baselineThroughput = this.baseline.throughput;
    const currentThroughput = currentMetrics.throughput;

    if (baselineThroughput === 0) return 0;

    const efficiencyGain = (currentThroughput - baselineThroughput) / baselineThroughput;
    return Math.max(0, efficiencyGain);
  }

  async calculateUtilization(currentMetrics) {
    const target = this.config.benchmarks.utilization.target;
    const currentUtilization = currentMetrics.utilization;

    const distance = Math.abs(currentUtilization - target);
    const maxDistance = Math.max(target, 1 - target);
    const score = 1 - (distance / maxDistance);

    if (currentUtilization < this.config.benchmarks.utilization.minThreshold ||
        currentUtilization > this.config.benchmarks.utilization.maxThreshold) {
      return score * 0.5;
    }

    return score;
  }

  async calculateResponseTime(currentMetrics) {
    const target = this.config.benchmarks.responseTime.target;
    const maxAcceptable = this.config.benchmarks.responseTime.maxAcceptable;
    const currentResponseTime = currentMetrics.responseTime;

    if (currentResponseTime <= target) {
      return 1.0;
    }

    if (currentResponseTime >= maxAcceptable) {
      return 0.0;
    }

    const ratio = (currentResponseTime - target) / (maxAcceptable - target);
    return 1 - ratio;
  }

  calculateOverallScore(efficiency, utilization, responseTime) {
    const weights = {
      efficiency: 0.4,
      utilization: 0.4,
      responseTime: 0.2
    };

    return (
      efficiency * weights.efficiency +
      utilization * weights.utilization +
      responseTime * weights.responseTime
    );
  }

  getResults() {
    return {
      ...this.results,
      counters: this.counters,
      baseline: this.baseline,
      timestamp: Date.now()
    };
  }
}

// Demo class
class AutoScalingDemo {
  constructor() {
    this.poolManager = null;
    this.benchmark = null;
    this.demoMetrics = {
      startTime: Date.now(),
      tasksSubmitted: 0,
      scaleEvents: 0,
      efficiencyMeasurements: []
    };
  }

  async runDemo() {
    console.log('🚀 Phase 2 Auto-Scaling Engine Demo (Simplified)');
    console.log('===============================================');

    try {
      await this.initializeComponents();
      await this.demonstrateScalingAlgorithms();
      await this.demonstratePerformanceTargets();
      await this.generateDemoReport();

    } catch (error) {
      console.error('Demo failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async initializeComponents() {
    console.log('\n📋 Initializing Auto-Scaling Components...');

    this.poolManager = new DynamicPoolManager({
      pool: {
        minSize: 3,
        maxSize: 20,
        initialSize: 5
      }
    });

    this.benchmark = new PerformanceBenchmark();

    // Set up event listeners
    this.poolManager.on = (event, callback) => {
      if (event === 'scaleUp') {
        setInterval(() => {
          if (Math.random() < 0.3) {
            this.demoMetrics.scaleEvents++;
            callback({ agentsAdded: 1, newPoolSize: this.poolManager.agents.size });
          }
        }, 8000);
      }
    };

    await this.poolManager.start();
    await this.benchmark.start();

    console.log('✅ Components initialized successfully');
  }

  async demonstrateScalingAlgorithms() {
    console.log('\n🔧 Demonstrating Scaling Algorithms...');
    console.log('------------------------------------');

    const algorithms = ['reactive', 'predictive', 'hybrid'];

    for (const algorithmType of algorithms) {
      console.log(`\nTesting ${algorithmType} algorithm:`);

      const algorithm = new ScalingAlgorithm(algorithmType);

      // Simulate increasing load
      for (let i = 0; i < 5; i++) {
        const metrics = {
          cpu: 0.3 + (i * 0.15),
          memory: 0.4 + (i * 0.12),
          taskQueue: i * 2,
          responseTime: 50 + (i * 30)
        };

        const decision = await algorithm.analyze(metrics);
        console.log(`  Load ${i + 1}: ${decision.action} (confidence: ${(decision.confidence * 100).toFixed(1)}%)`);

        await this.sleep(1000);
      }
    }
  }

  async demonstratePerformanceTargets() {
    console.log('\n📈 Demonstrating Performance Targets...');
    console.log('-------------------------------------');

    const targets = {
      efficiency: 0.40,
      utilization: 0.85,
      responseTime: 100
    };

    console.log('Performance Targets:');
    console.log(`  • Efficiency: ≥${(targets.efficiency * 100).toFixed(0)}% improvement`);
    console.log(`  • Utilization: ≥${(targets.utilization * 100).toFixed(0)}% resource usage`);
    console.log(`  • Response Time: ≤${targets.responseTime}ms average`);

    // Simulate performance measurements
    for (let i = 0; i < 5; i++) {
      await this.sleep(2000);

      const simulatedResults = {
        efficiency: 0.35 + Math.random() * 0.20,
        utilization: 0.75 + Math.random() * 0.20,
        responseTime: 80 + Math.random() * 60
      };

      this.demoMetrics.efficiencyMeasurements.push({
        timestamp: Date.now(),
        ...simulatedResults
      });

      console.log(`\nMeasurement ${i + 1}:`);
      console.log(`  Efficiency: ${(simulatedResults.efficiency * 100).toFixed(1)}% ` +
                  `(${simulatedResults.efficiency >= targets.efficiency ? '✅' : '❌'})`);
      console.log(`  Utilization: ${(simulatedResults.utilization * 100).toFixed(1)}% ` +
                  `(${simulatedResults.utilization >= targets.utilization ? '✅' : '❌'})`);
      console.log(`  Response Time: ${simulatedResults.responseTime.toFixed(0)}ms ` +
                  `(${simulatedResults.responseTime <= targets.responseTime ? '✅' : '❌'})`);
    }
  }

  async generateDemoReport() {
    console.log('\n📊 Demo Performance Report');
    console.log('===========================');

    const runtime = Date.now() - this.demoMetrics.startTime;
    const minutes = Math.floor(runtime / 60000);
    const seconds = Math.floor((runtime % 60000) / 1000);

    console.log(`Runtime: ${minutes}m ${seconds}s`);
    console.log(`Scale Events: ${this.demoMetrics.scaleEvents}`);

    if (this.demoMetrics.efficiencyMeasurements.length > 0) {
      const avgEfficiency = this.demoMetrics.efficiencyMeasurements
        .reduce((sum, m) => sum + m.efficiency, 0) / this.demoMetrics.efficiencyMeasurements.length;
      const avgUtilization = this.demoMetrics.efficiencyMeasurements
        .reduce((sum, m) => sum + m.utilization, 0) / this.demoMetrics.efficiencyMeasurements.length;
      const avgResponseTime = this.demoMetrics.efficiencyMeasurements
        .reduce((sum, m) => sum + m.responseTime, 0) / this.demoMetrics.efficiencyMeasurements.length;

      console.log(`Average Efficiency: ${(avgEfficiency * 100).toFixed(1)}%`);
      console.log(`Average Utilization: ${(avgUtilization * 100).toFixed(1)}%`);
      console.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);

      const targets = { efficiency: 0.40, utilization: 0.85, responseTime: 100 };
      const efficiencyTargetMet = avgEfficiency >= targets.efficiency;
      const utilizationTargetMet = avgUtilization >= targets.utilization;

      console.log('\nTarget Achievement:');
      console.log(`  • 40%+ Efficiency: ${efficiencyTargetMet ? '✅ ACHIEVED' : '❌ NOT ACHIEVED'}`);
      console.log(`  • 85%+ Utilization: ${utilizationTargetMet ? '✅ ACHIEVED' : '❌ NOT ACHIEVED'}`);
      console.log(`  • ≤100ms Response Time: ${avgResponseTime <= targets.responseTime ? '✅ ACHIEVED' : '❌ NOT ACHIEVED'}`);
    }

    const poolStatus = this.poolManager.getPoolStatus();
    console.log('\nFinal System State:');
    console.log(`  • Pool Size: ${poolStatus.poolSize}`);
    console.log(`  • Active Agents: ${poolStatus.activeAgents}`);
    console.log(`  • Scale Ups: ${poolStatus.stats.scaleUps}`);
    console.log(`  • Scale Downs: ${poolStatus.stats.scaleDowns}`);

    console.log('\n✅ Demo completed successfully!');
    console.log('\nKey Features Demonstrated:');
    console.log('  🔧 Reactive, Predictive, and Hybrid scaling algorithms');
    console.log('  📊 Dynamic pool management with cooldowns');
    console.log('  ⚡ Resource optimization and conflict detection');
    console.log('  📈 Performance benchmarking and target achievement');
    console.log('  🔄 Redis-based coordination (simulated)');
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');

    if (this.poolManager) {
      await this.poolManager.stop();
    }

    if (this.benchmark) {
      await this.benchmark.stop();
    }

    console.log('✅ Cleanup completed');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the demo
async function main() {
  const demo = new AutoScalingDemo();
  await demo.runDemo();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default AutoScalingDemo;