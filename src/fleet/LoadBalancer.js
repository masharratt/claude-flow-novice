/**
 * LoadBalancer - Advanced distributed load balancing infrastructure for 100+ concurrent agents
 *
 * Features:
 * - Multiple load balancing algorithms (weighted round robin, least connections, etc.)
 * - Distributed load balancing across multiple nodes
 * - Health checks and failover mechanisms
 * - Performance-based routing
 * - Real-time load distribution monitoring
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import crypto from 'crypto';

/**
 * Load balancing configuration
 */
const LOAD_BALANCER_CONFIG = {
  // Health check configuration
  healthCheck: {
    interval: 10000,          // 10 seconds
    timeout: 5000,            // 5 seconds
    retries: 3,
    unhealthyThreshold: 2,    // 2 failed checks mark as unhealthy
    healthyThreshold: 2       // 2 successful checks mark as healthy
  },

  // Load balancing algorithms
  algorithms: {
    ROUND_ROBIN: 'round_robin',
    WEIGHTED_ROUND_ROBIN: 'weighted_round_robin',
    LEAST_CONNECTIONS: 'least_connections',
    LEAST_RESPONSE_TIME: 'least_response_time',
    HASH_BASED: 'hash_based',
    PERFORMANCE_BASED: 'performance_based'
  },

  // Performance thresholds
  performance: {
    maxResponseTime: 5000,    // 5 seconds
    maxConnections: 1000,     // Max connections per agent
    maxErrorRate: 0.10,       // 10% error rate
    minSuccessRate: 0.90      // 90% success rate
  },

  // Failover configuration
  failover: {
    enabled: true,
    retryAttempts: 3,
    retryDelay: 1000,         // 1 second
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 30000  // 30 seconds
  },

  // Redis configuration
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },

  // Channels for coordination
  channels: {
    loadBalancer: 'swarm:scalability:load_balancer',
    health: 'swarm:scalability:health',
    performance: 'swarm:scalability:performance',
    failover: 'swarm:scalability:failover'
  }
};

/**
 * Agent health status
 */
const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  DRAINING: 'draining',
  MAINTENANCE: 'maintenance'
};

/**
 * LoadBalancer class
 */
export class LoadBalancer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...LOAD_BALANCER_CONFIG, ...options };
    this.balancerId = `load-balancer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Redis clients
    this.redis = null;
    this.publisher = null;
    this.subscriber = null;

    // System state
    this.isInitialized = false;
    this.isRunning = false;

    // Load balancing state
    this.currentAlgorithm = this.config.algorithms.WEIGHTED_ROUND_ROBIN;
    this.roundRobinIndex = 0;
    this.agentWeights = new Map();
    this.agentConnections = new Map();
    this.agentPerformance = new Map();

    // Agent registry
    this.agents = new Map();
    this.healthyAgents = new Set();
    this.unhealthyAgents = new Set();
    this.drainAgents = new Set();

    // Health checking
    this.healthCheckTimer = null;
    this.circuitBreakers = new Map();

    // Metrics
    this.metrics = {
      routing: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0
      },
      health: {
        totalHealthChecks: 0,
        failedHealthChecks: 0,
        agentsHealthy: 0,
        agentsUnhealthy: 0
      },
      failover: {
        totalFailovers: 0,
        circuitBreakerTrips: 0,
        recoveryTime: 0
      },
      performance: {
        loadDistribution: 0,
        agentUtilization: 0,
        routingEfficiency: 0
      }
    };

    // Request tracking
    this.activeRequests = new Map();
    this.requestHistory = [];

    this.setupEventHandlers();
  }

  /**
   * Initialize the load balancer
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Load Balancer' });

      // Initialize Redis connections
      await this.initializeRedis();

      // Setup subscriptions
      await this.setupSubscriptions();

      // Load existing agents
      await this.loadExistingAgents();

      // Start health checking
      this.startHealthChecking();

      this.isInitialized = true;
      this.isRunning = true;

      // Announce load balancer startup
      await this.publishLoadBalancerEvent({
        type: 'load_balancer_started',
        balancerId: this.balancerId,
        algorithm: this.currentAlgorithm,
        timestamp: Date.now()
      });

      this.emit('status', { status: 'running', message: 'Load Balancer initialized successfully' });
      console.log(`🚀 Load Balancer ${this.balancerId} initialized with algorithm ${this.currentAlgorithm}`);

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

    console.log('📡 Redis connections established for load balancer');
  }

  /**
   * Setup Redis subscriptions
   */
  async setupSubscriptions() {
    await this.subscriber.subscribe(this.config.channels.health, (message) => {
      this.handleHealthMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.config.channels.performance, (message) => {
      this.handlePerformanceMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(this.config.channels.failover, (message) => {
      this.handleFailoverMessage(JSON.parse(message));
    });

    console.log('📡 Redis subscriptions configured for load balancer');
  }

  /**
   * Load existing agents from Redis
   */
  async loadExistingAgents() {
    try {
      const agentKeys = await this.redis.keys('load_balancer:agent:*');

      for (const key of agentKeys) {
        const agentData = await this.redis.hGetAll(key);
        if (Object.keys(agentData).length > 0) {
          const agent = JSON.parse(agentData.data);
          this.registerAgent(agent);
        }
      }

      console.log(`📋 Loaded ${agentKeys.length} existing agents`);
    } catch (error) {
      console.warn('Failed to load existing agents:', error.message);
    }
  }

  /**
   * Start health checking
   */
  startHealthChecking() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheck.interval);

    console.log('🏥 Health checking started');
  }

  /**
   * Register a new agent
   */
  registerAgent(agentConfig) {
    const agent = {
      id: agentConfig.id || `agent-${crypto.randomBytes(8).toString('hex')}`,
      host: agentConfig.host || 'localhost',
      port: agentConfig.port || 3000,
      weight: agentConfig.weight || 1,
      maxConnections: agentConfig.maxConnections || this.config.performance.maxConnections,
      capabilities: agentConfig.capabilities || [],
      status: HEALTH_STATUS.HEALTHY,
      registeredAt: Date.now(),
      lastHealthCheck: Date.now(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      performance: {
        responseTime: 0,
        successRate: 1.0,
        activeConnections: 0,
        totalRequests: 0,
        failedRequests: 0
      }
    };

    this.agents.set(agent.id, agent);
    this.healthyAgents.add(agent.id);
    this.agentWeights.set(agent.id, agent.weight);
    this.agentConnections.set(agent.id, 0);
    this.agentPerformance.set(agent.id, {
      responseTime: 0,
      successRate: 1.0
    });

    // Persist to Redis
    this.persistAgent(agent);

    this.emit('agent_registered', { agent });
    console.log(`🤖 Agent ${agent.id} registered with weight ${agent.weight}`);

    return agent.id;
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Remove from all tracking structures
    this.agents.delete(agentId);
    this.healthyAgents.delete(agentId);
    this.unhealthyAgents.delete(agentId);
    this.drainAgents.delete(agentId);
    this.agentWeights.delete(agentId);
    this.agentConnections.delete(agentId);
    this.agentPerformance.delete(agentId);

    // Remove from Redis
    this.redis.del(`load_balancer:agent:${agentId}`);

    this.emit('agent_unregistered', { agentId });
    console.log(`🗑️ Agent ${agentId} unregistered`);
  }

  /**
   * Route a request to the best agent
   */
  async routeRequest(request) {
    try {
      const startTime = performance.now();
      this.metrics.routing.totalRequests++;

      // Select best agent
      const agent = await this.selectAgent(request);
      if (!agent) {
        this.metrics.routing.failedRequests++;
        throw new Error('No healthy agents available');
      }

      // Check circuit breaker
      if (this.isCircuitBreakerOpen(agent.id)) {
        this.metrics.routing.failedRequests++;
        throw new Error(`Circuit breaker open for agent ${agent.id}`);
      }

      // Update connection count
      this.agentConnections.set(agent.id, (this.agentConnections.get(agent.id) || 0) + 1);
      agent.performance.activeConnections++;

      // Track request
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.activeRequests.set(requestId, {
        agentId: agent.id,
        startTime,
        request
      });

      // Update agent metrics
      agent.performance.totalRequests++;

      const result = {
        agentId: agent.id,
        agent,
        requestId,
        timestamp: Date.now()
      };

      this.emit('request_routed', result);

      return result;

    } catch (error) {
      this.metrics.routing.failedRequests++;
      this.emit('error', { type: 'routing_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Complete a request
   */
  async completeRequest(requestId, success = true, responseTime = 0) {
    try {
      const activeRequest = this.activeRequests.get(requestId);
      if (!activeRequest) {
        console.warn(`Request ${requestId} not found in active requests`);
        return;
      }

      const { agentId, startTime } = activeRequest;
      const agent = this.agents.get(agentId);
      if (!agent) {
        console.warn(`Agent ${agentId} not found`);
        return;
      }

      // Calculate response time
      const actualResponseTime = responseTime || (performance.now() - startTime);

      // Update agent metrics
      if (success) {
        this.metrics.routing.successfulRequests++;
        agent.performance.successRate =
          (agent.performance.successRate * (agent.performance.totalRequests - 1) + 1) / agent.performance.totalRequests;
      } else {
        agent.performance.failedRequests++;
        agent.performance.successRate =
          (agent.performance.successRate * (agent.performance.totalRequests - 1)) / agent.performance.totalRequests;
      }

      agent.performance.responseTime =
        (agent.performance.responseTime * (agent.performance.totalRequests - 1) + actualResponseTime) / agent.performance.totalRequests;

      // Update connection count
      this.agentConnections.set(agentId, Math.max(0, (this.agentConnections.get(agentId) || 0) - 1));
      agent.performance.activeConnections = Math.max(0, agent.performance.activeConnections - 1);

      // Update performance tracking
      this.agentPerformance.set(agentId, {
        responseTime: agent.performance.responseTime,
        successRate: agent.performance.successRate
      });

      // Remove from active requests
      this.activeRequests.delete(requestId);

      // Update overall metrics
      this.updateRoutingMetrics(actualResponseTime, success);

      // Store in history
      this.requestHistory.push({
        requestId,
        agentId,
        success,
        responseTime: actualResponseTime,
        timestamp: Date.now()
      });

      // Keep history manageable
      if (this.requestHistory.length > 1000) {
        this.requestHistory = this.requestHistory.slice(-500);
      }

      // Publish completion event
      await this.publishLoadBalancerEvent({
        type: 'request_completed',
        requestId,
        agentId,
        success,
        responseTime: actualResponseTime,
        timestamp: Date.now()
      });

      this.emit('request_completed', { requestId, agentId, success, responseTime: actualResponseTime });

    } catch (error) {
      this.emit('error', { type: 'completion_failed', error: error.message, requestId });
    }
  }

  /**
   * Select the best agent for a request
   */
  async selectAgent(request) {
    const availableAgents = Array.from(this.healthyAgents)
      .filter(agentId => !this.drainAgents.has(agentId))
      .map(agentId => this.agents.get(agentId))
      .filter(agent => agent && agent.status === HEALTH_STATUS.HEALTHY);

    if (availableAgents.length === 0) {
      return null;
    }

    // Apply routing algorithm
    switch (this.currentAlgorithm) {
      case this.config.algorithms.ROUND_ROBIN:
        return this.selectRoundRobin(availableAgents);

      case this.config.algorithms.WEIGHTED_ROUND_ROBIN:
        return this.selectWeightedRoundRobin(availableAgents);

      case this.config.algorithms.LEAST_CONNECTIONS:
        return this.selectLeastConnections(availableAgents);

      case this.config.algorithms.LEAST_RESPONSE_TIME:
        return this.selectLeastResponseTime(availableAgents);

      case this.config.algorithms.HASH_BASED:
        return this.selectHashBased(availableAgents, request);

      case this.config.algorithms.PERFORMANCE_BASED:
        return this.selectPerformanceBased(availableAgents);

      default:
        return this.selectWeightedRoundRobin(availableAgents);
    }
  }

  /**
   * Round robin selection
   */
  selectRoundRobin(agents) {
    const agent = agents[this.roundRobinIndex % agents.length];
    this.roundRobinIndex++;
    return agent;
  }

  /**
   * Weighted round robin selection
   */
  selectWeightedRoundRobin(agents) {
    const totalWeight = agents.reduce((sum, agent) => sum + agent.weight, 0);
    let random = Math.random() * totalWeight;

    for (const agent of agents) {
      random -= agent.weight;
      if (random <= 0) {
        return agent;
      }
    }

    return agents[0];
  }

  /**
   * Least connections selection
   */
  selectLeastConnections(agents) {
    return agents.reduce((min, agent) => {
      const minConnections = this.agentConnections.get(min.id) || 0;
      const agentConnections = this.agentConnections.get(agent.id) || 0;
      return agentConnections < minConnections ? agent : min;
    });
  }

  /**
   * Least response time selection
   */
  selectLeastResponseTime(agents) {
    return agents.reduce((best, agent) => {
      const performance = this.agentPerformance.get(best.id);
      const agentPerf = this.agentPerformance.get(agent.id);

      const bestScore = performance ? (1 / (performance.responseTime || 1)) : 0;
      const agentScore = agentPerf ? (1 / (agentPerf.responseTime || 1)) : 0;

      return agentScore > bestScore ? agent : best;
    });
  }

  /**
   * Hash-based selection
   */
  selectHashBased(agents, request) {
    const hash = this.hashRequest(request);
    const index = hash % agents.length;
    return agents[index];
  }

  /**
   * Performance-based selection
   */
  selectPerformanceBased(agents) {
    return agents.reduce((best, agent) => {
      const performance = this.agentPerformance.get(best.id);
      const agentPerf = this.agentPerformance.get(agent.id);

      const bestScore = performance ?
        (performance.successRate * 0.7 + (1 / (performance.responseTime || 1)) * 0.3) : 0;
      const agentScore = agentPerf ?
        (agentPerf.successRate * 0.7 + (1 / (agentPerf.responseTime || 1)) * 0.3) : 0;

      return agentScore > bestScore ? agent : best;
    });
  }

  /**
   * Hash a request for consistent routing
   */
  hashRequest(request) {
    const str = JSON.stringify(request);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Perform health checks on all agents
   */
  async performHealthChecks() {
    try {
      this.metrics.health.totalHealthChecks++;

      const healthCheckPromises = Array.from(this.agents.values()).map(agent =>
        this.checkAgentHealth(agent)
      );

      await Promise.allSettled(healthCheckPromises);

      // Update health metrics
      this.metrics.health.agentsHealthy = this.healthyAgents.size;
      this.metrics.health.agentsUnhealthy = this.unhealthyAgents.size;

    } catch (error) {
      this.emit('error', { type: 'health_check_failed', error: error.message });
    }
  }

  /**
   * Check health of a specific agent
   */
  async checkAgentHealth(agent) {
    try {
      // Simulate health check (in production, would make actual HTTP request)
      const isHealthy = await this.simulateHealthCheck(agent);
      const now = Date.now();

      agent.lastHealthCheck = now;

      if (isHealthy) {
        agent.consecutiveSuccesses++;
        agent.consecutiveFailures = 0;

        // Mark as healthy if threshold reached
        if (agent.status === HEALTH_STATUS.UNHEALTHY &&
            agent.consecutiveSuccesses >= this.config.healthCheck.healthyThreshold) {
          this.markAgentHealthy(agent);
        }
      } else {
        agent.consecutiveFailures++;
        agent.consecutiveSuccesses = 0;

        // Mark as unhealthy if threshold reached
        if (agent.consecutiveFailures >= this.config.healthCheck.unhealthyThreshold) {
          this.markAgentUnhealthy(agent);
        }
      }

      // Persist agent state
      this.persistAgent(agent);

    } catch (error) {
      agent.consecutiveFailures++;
      agent.lastHealthCheck = Date.now();

      if (agent.consecutiveFailures >= this.config.healthCheck.unhealthyThreshold) {
        this.markAgentUnhealthy(agent);
      }

      this.metrics.health.failedHealthChecks++;
    }
  }

  /**
   * Simulate health check (replace with actual implementation)
   */
  async simulateHealthCheck(agent) {
    // Simulate network latency and response
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate 95% success rate for healthy agents
        const isSuccess = agent.status === HEALTH_STATUS.HEALTHY ?
          Math.random() > 0.05 : Math.random() > 0.5;
        resolve(isSuccess);
      }, Math.random() * 1000);
    });
  }

  /**
   * Mark agent as healthy
   */
  markAgentHealthy(agent) {
    const previousStatus = agent.status;
    agent.status = HEALTH_STATUS.HEALTHY;

    this.healthyAgents.add(agent.id);
    this.unhealthyAgents.delete(agent.id);

    // Reset circuit breaker if it was tripped
    this.resetCircuitBreaker(agent.id);

    this.emit('agent_health_changed', {
      agentId: agent.id,
      status: agent.status,
      previousStatus
    });

    await this.publishLoadBalancerEvent({
      type: 'agent_healthy',
      agentId: agent.id,
      timestamp: Date.now()
    });

    console.log(`✅ Agent ${agent.id} is now healthy`);
  }

  /**
   * Mark agent as unhealthy
   */
  markAgentUnhealthy(agent) {
    const previousStatus = agent.status;
    agent.status = HEALTH_STATUS.UNHEALTHY;

    this.healthyAgents.delete(agent.id);
    this.unhealthyAgents.add(agent.id);

    // Trip circuit breaker
    this.tripCircuitBreaker(agent.id);

    this.emit('agent_health_changed', {
      agentId: agent.id,
      status: agent.status,
      previousStatus
    });

    await this.publishLoadBalancerEvent({
      type: 'agent_unhealthy',
      agentId: agent.id,
      timestamp: Date.now()
    });

    console.log(`❌ Agent ${agent.id} is now unhealthy`);
  }

  /**
   * Drain an agent (stop sending new requests)
   */
  async drainAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    agent.status = HEALTH_STATUS.DRAINING;
    this.drainAgents.add(agentId);

    this.persistAgent(agent);

    this.emit('agent_draining', { agentId });
    console.log(`🚫 Agent ${agentId} is draining`);

    // Wait for active connections to finish
    await this.waitForAgentDrain(agentId);

    // Unregister the agent
    this.unregisterAgent(agentId);
  }

  /**
   * Wait for agent to finish all active requests
   */
  async waitForAgentDrain(agentId, timeout = 30000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const connections = this.agentConnections.get(agentId) || 0;
      if (connections === 0) {
        console.log(`✅ Agent ${agentId} drained successfully`);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.warn(`⚠️ Agent ${agentId} drain timeout, forcing removal`);
  }

  /**
   * Circuit breaker management
   */
  isCircuitBreakerOpen(agentId) {
    const breaker = this.circuitBreakers.get(agentId);
    if (!breaker) return false;

    if (breaker.state === 'open') {
      if (Date.now() - breaker.openTime > this.config.failover.circuitBreakerTimeout) {
        // Move to half-open state
        breaker.state = 'half_open';
        breaker.successCount = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  tripCircuitBreaker(agentId) {
    const breaker = this.circuitBreakers.get(agentId) || {};
    breaker.state = 'open';
    breaker.openTime = Date.now();
    breaker.failureCount = (breaker.failureCount || 0) + 1;
    this.circuitBreakers.set(agentId, breaker);

    this.metrics.failover.circuitBreakerTrips++;
  }

  resetCircuitBreaker(agentId) {
    const breaker = this.circuitBreakers.get(agentId);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failureCount = 0;
      breaker.successCount = 0;
    }
  }

  /**
   * Update routing metrics
   */
  updateRoutingMetrics(responseTime, success) {
    const totalRequests = this.metrics.routing.totalRequests;
    this.metrics.routing.averageResponseTime =
      (this.metrics.routing.averageResponseTime * (totalRequests - 1) + responseTime) / totalRequests;

    // Update performance metrics
    this.calculatePerformanceMetrics();
  }

  /**
   * Calculate performance metrics
   */
  calculatePerformanceMetrics() {
    // Load distribution (standard deviation of connections)
    const connections = Array.from(this.agentConnections.values());
    if (connections.length > 0) {
      const mean = connections.reduce((a, b) => a + b, 0) / connections.length;
      const variance = connections.reduce((sum, conn) => sum + Math.pow(conn - mean, 2), 0) / connections.length;
      this.metrics.performance.loadDistribution = Math.sqrt(variance);
    }

    // Agent utilization
    const totalConnections = connections.reduce((a, b) => a + b, 0);
    const maxConnections = Array.from(this.agents.values())
      .reduce((sum, agent) => sum + agent.maxConnections, 0);
    this.metrics.performance.agentUtilization = maxConnections > 0 ? totalConnections / maxConnections : 0;

    // Routing efficiency (success rate)
    this.metrics.performance.routingEfficiency =
      this.metrics.routing.totalRequests > 0 ?
      this.metrics.routing.successfulRequests / this.metrics.routing.totalRequests : 0;
  }

  /**
   * Set load balancing algorithm
   */
  setAlgorithm(algorithm) {
    if (!Object.values(this.config.algorithms).includes(algorithm)) {
      throw new Error(`Unknown algorithm: ${algorithm}`);
    }

    this.currentAlgorithm = algorithm;
    this.roundRobinIndex = 0; // Reset round robin index

    this.emit('algorithm_changed', { algorithm });
    console.log(`🔄 Load balancing algorithm changed to ${algorithm}`);
  }

  /**
   * Get load balancer status
   */
  async getLoadBalancerStatus() {
    return {
      balancerId: this.balancerId,
      isRunning: this.isRunning,
      algorithm: this.currentAlgorithm,
      agents: {
        total: this.agents.size,
        healthy: this.healthyAgents.size,
        unhealthy: this.unhealthyAgents.size,
        draining: this.drainAgents.size
      },
      metrics: this.metrics,
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([id, breaker]) => ({
        agentId: id,
        state: breaker.state,
        failureCount: breaker.failureCount,
        openTime: breaker.openTime
      })),
      activeRequests: this.activeRequests.size,
      timestamp: Date.now()
    };
  }

  /**
   * Handle Redis messages
   */
  handleHealthMessage(message) {
    switch (message.type) {
      case 'agent_health_update':
        this.handleHealthUpdate(message);
        break;
    }
  }

  handlePerformanceMessage(message) {
    switch (message.type) {
      case 'performance_update':
        this.handlePerformanceUpdate(message);
        break;
    }
  }

  handleFailoverMessage(message) {
    switch (message.type) {
      case 'failover_request':
        this.handleFailoverRequest(message);
        break;
    }
  }

  handleHealthUpdate(message) {
    const agent = this.agents.get(message.agentId);
    if (agent) {
      agent.performance = { ...agent.performance, ...message.performance };
      this.agentPerformance.set(agent.id, {
        responseTime: agent.performance.responseTime,
        successRate: agent.performance.successRate
      });
    }
  }

  handlePerformanceUpdate(message) {
    // Handle performance updates from agents
    this.emit('performance_update', message);
  }

  handleFailoverRequest(message) {
    // Handle failover requests
    this.emit('failover_request', message);
  }

  /**
   * Persist agent data to Redis
   */
  async persistAgent(agent) {
    try {
      await this.redis.hSet(
        `load_balancer:agent:${agent.id}`,
        'data',
        JSON.stringify(agent)
      );
      await this.redis.expire(`load_balancer:agent:${agent.id}`, 3600); // 1 hour TTL
    } catch (error) {
      console.warn('Failed to persist agent:', error.message);
    }
  }

  /**
   * Publish load balancer event
   */
  async publishLoadBalancerEvent(data) {
    try {
      const eventData = {
        balancerId: this.balancerId,
        ...data,
        timestamp: Date.now()
      };

      await this.publisher.publish(this.config.channels.loadBalancer, JSON.stringify(eventData));
    } catch (error) {
      console.warn('Failed to publish load balancer event:', error.message);
    }
  }

  /**
   * Event handlers
   */
  setupEventHandlers() {
    this.on('error', (error) => {
      console.error('❌ LoadBalancer error:', error);
    });

    this.on('status', (status) => {
      console.log(`📊 LoadBalancer status: ${status.status} - ${status.message}`);
    });
  }

  /**
   * Shutdown the load balancer
   */
  async shutdown() {
    this.emit('status', { status: 'shutting_down', message: 'Shutting down Load Balancer' });

    this.isRunning = false;

    // Clear health check timer
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Drain all agents
    const drainPromises = Array.from(this.agents.keys()).map(agentId =>
      this.drainAgent(agentId).catch(error =>
        console.warn(`Failed to drain agent ${agentId}:`, error.message)
      )
    );

    await Promise.allSettled(drainPromises);

    // Publish shutdown event
    await this.publishLoadBalancerEvent({
      type: 'load_balancer_shutdown',
      balancerId: this.balancerId,
      timestamp: Date.now()
    });

    // Close Redis connections
    if (this.subscriber) await this.subscriber.quit();
    if (this.publisher) await this.publisher.quit();
    if (this.redis) await this.redis.quit();

    this.emit('status', { status: 'shutdown', message: 'Load Balancer shutdown complete' });
    console.log('🛑 Load Balancer shutdown complete');
  }
}

export default LoadBalancer;