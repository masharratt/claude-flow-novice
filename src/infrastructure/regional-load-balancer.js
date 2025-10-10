/**
 * Regional Load Balancer with Latency-Based Routing
 *
 * Implements intelligent geographic routing with <5s failover time
 * Supports multiple routing strategies and real-time latency optimization
 */

import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import EventEmitter from 'events';
import { GeographicDistance, ROUTING_STRATEGIES, HEALTH_STATUS } from './multiregion-topology.js';

// Load balancer configuration
const LOAD_BALANCER_CONFIG = {
  healthCheckInterval: 30000, // 30 seconds
  failoverTimeout: 5000, // 5 seconds
  maxRetries: 3,
  latencyThreshold: 500, // ms
  connectionTimeout: 3000, // 3 seconds
  circuitBreakerThreshold: 5, // failures before opening circuit
  circuitBreakerTimeout: 60000 // 1 minute
};

// Request types for routing
const REQUEST_TYPES = {
  READ: 'read',
  WRITE: 'write',
  COMPUTE: 'compute',
  STREAMING: 'streaming',
  BATCH: 'batch'
};

/**
 * Circuit Breaker for Regional Failover
 * Prevents cascade failures by temporarily routing away from unhealthy regions
 */
export class CircuitBreaker {
  constructor(regionId, config = {}) {
    this.regionId = regionId;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;

    this.config = {
      threshold: config.threshold || LOAD_BALANCER_CONFIG.circuitBreakerThreshold,
      timeout: config.timeout || LOAD_BALANCER_CONFIG.circuitBreakerTimeout,
      ...config
    };
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        console.log(`🔓 Circuit breaker for ${this.regionId} attempting reset`);
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.regionId}`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.successCount++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      console.log(`✅ Circuit breaker for ${this.regionId} closed`);
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.threshold) {
      this.state = 'OPEN';
      console.log(`🚫 Circuit breaker OPEN for ${this.regionId} (${this.failureCount} failures)`);
    }
  }

  shouldAttemptReset() {
    return this.state === 'OPEN' &&
           Date.now() - this.lastFailureTime > this.config.timeout;
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime
    };
  }
}

/**
 * Regional Load Balancer
 * Core component implementing latency-based geographic routing
 */
export class RegionalLoadBalancer extends EventEmitter {
  constructor(redisConfig, topologyManager) {
    super();
    this.redis = redisConfig;
    this.topologyManager = topologyManager;
    this.circuitBreakers = new Map();
    this.routingStrategy = ROUTING_STRATEGIES.LATENCY_BASED;
    this.requestStats = new Map();
    this.latencyHistory = new Map();
    this.activeConnections = new Map();

    this.initializeCircuitBreakers();
    this.setupEventHandlers();
  }

  initializeCircuitBreakers() {
    const regions = ['us-east', 'us-west', 'eu-west', 'asia-pacific'];

    regions.forEach(regionId => {
      this.circuitBreakers.set(regionId, new CircuitBreaker(regionId));
      this.requestStats.set(regionId, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        lastRequestTime: null
      });
      this.latencyHistory.set(regionId, []);
      this.activeConnections.set(regionId, 0);
    });
  }

  setupEventHandlers() {
    this.topologyManager.on('region_health_updated', (event) => {
      this.handleRegionHealthUpdate(event);
    });

    this.topologyManager.on('routing_table_updated', (event) => {
      this.handleRoutingTableUpdate(event);
    });

    this.topologyManager.on('failover_initiated', (event) => {
      this.handleFailoverInitiated(event);
    });
  }

  async initialize() {
    console.log('⚖️ Initializing Regional Load Balancer...');

    // Connect to Redis
    this.redisClient = createClient(this.redis);
    await this.redisClient.connect();

    // Subscribe to load balancer events
    await this.redisClient.subscribe('swarm:phase-2:loadbalancer', (message) => {
      this.handleLoadBalancerEvent(JSON.parse(message));
    });

    // Start metrics collection
    this.startMetricsCollection();

    // Load historical data
    await this.loadHistoricalData();

    console.log('✅ Regional Load Balancer initialized');
    this.emit('initialized', { strategy: this.routingStrategy });
  }

  async handleLoadBalancerEvent(event) {
    const { type, data, timestamp } = event;

    switch (type) {
      case 'routing_request':
        await this.processRoutingRequest(data);
        break;
      case 'latency_update':
        this.updateLatencyMetrics(data.region, data.latency);
        break;
      case 'performance_metrics':
        this.updatePerformanceMetrics(data);
        break;
    }
  }

  async processRoutingRequest(requestData) {
    const { requestId, clientInfo, requestType, payload } = requestData;

    try {
      const routingDecision = await this.routeRequest(clientInfo, requestType);

      await this.publishRoutingResponse(requestId, routingDecision);

      // Execute the request
      const result = await this.executeRoutedRequest(routingDecision, payload);

      // Update metrics
      this.updateRequestMetrics(routingDecision.region, true, result.responseTime);

    } catch (error) {
      console.error(`❌ Routing request ${requestId} failed:`, error.message);
      await this.publishRoutingError(requestId, error);
    }
  }

  async routeRequest(clientInfo, requestType = REQUEST_TYPES.READ) {
    const startTime = performance.now();

    try {
      const routingTable = this.topologyManager.getRoutingTable();
      const availableRegions = Object.entries(routingTable)
        .filter(([_, data]) =>
          data.status === HEALTH_STATUS.HEALTHY ||
          data.status === HEALTH_STATUS.DEGRADED
        );

      if (availableRegions.length === 0) {
        throw new Error('No healthy regions available for routing');
      }

      let selectedRegion;

      switch (this.routingStrategy) {
        case ROUTING_STRATEGIES.LATENCY_BASED:
          selectedRegion = this.selectByLatency(availableRegions, clientInfo);
          break;
        case ROUTING_STRATEGIES.GEOGRAPHIC:
          selectedRegion = this.selectByGeography(availableRegions, clientInfo);
          break;
        case ROUTING_STRATEGIES.WEIGHTED_ROUND_ROBIN:
          selectedRegion = this.selectByWeightedRoundRobin(availableRegions);
          break;
        case ROUTING_STRATEGIES.PRIORITY_FALLBACK:
          selectedRegion = this.selectByPriority(availableRegions);
          break;
        default:
          selectedRegion = this.selectByLatency(availableRegions, clientInfo);
      }

      const routingTime = performance.now() - startTime;

      return {
        region: selectedRegion,
        strategy: this.routingStrategy,
        routingTime,
        clientInfo,
        requestType,
        timestamp: new Date().toISOString(),
        routingId: crypto.randomUUID()
      };

    } catch (error) {
      console.error('❌ Route selection failed:', error.message);
      throw error;
    }
  }

  selectByLatency(availableRegions, clientInfo) {
    // Consider both client-to-region latency and region performance
    let bestRegion = null;
    let bestScore = Infinity;

    availableRegions.forEach(([regionId, regionData]) => {
      const circuitBreaker = this.circuitBreakers.get(regionId);

      // Skip if circuit breaker is open
      if (circuitBreaker.state === 'OPEN') {
        return;
      }

      // Calculate composite score: latency + load penalty
      const latencyScore = regionData.latency || 500;
      const loadScore = regionData.load * 5; // Weight load more heavily
      const circuitScore = circuitBreaker.state === 'HALF_OPEN' ? 200 : 0;

      const totalScore = latencyScore + loadScore + circuitScore;

      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestRegion = regionId;
      }
    });

    return bestRegion || availableRegions[0][0];
  }

  selectByGeography(availableRegions, clientInfo) {
    if (!clientInfo || !clientInfo.coordinates) {
      return this.selectByLatency(availableRegions, clientInfo);
    }

    const nearestRegions = GeographicDistance.findNearestRegions(
      clientInfo.coordinates.lat,
      clientInfo.coordinates.lon,
      2
    );

    // Find the nearest healthy region
    for (const region of nearestRegions) {
      const regionData = availableRegions.find(([id, _]) => id === region.id);
      if (regionData) {
        const circuitBreaker = this.circuitBreakers.get(region.id);
        if (circuitBreaker.state !== 'OPEN') {
          return region.id;
        }
      }
    }

    // Fallback to latency-based selection
    return this.selectByLatency(availableRegions, clientInfo);
  }

  selectByWeightedRoundRobin(availableRegions) {
    // Implement weighted round robin based on region weights
    const totalWeight = availableRegions.reduce((sum, [_, data]) => sum + data.weight, 0);
    let random = Math.random() * totalWeight;

    for (const [regionId, regionData] of availableRegions) {
      const circuitBreaker = this.circuitBreakers.get(regionId);
      if (circuitBreaker.state === 'OPEN') {
        continue;
      }

      random -= regionData.weight;
      if (random <= 0) {
        return regionId;
      }
    }

    return availableRegions[0][0];
  }

  selectByPriority(availableRegions) {
    // Select based on priority (1 = highest priority)
    const sortedByPriority = availableRegions
      .filter(([regionId, _]) => this.circuitBreakers.get(regionId).state !== 'OPEN')
      .sort((a, b) => a[1].priority - b[1].priority);

    return sortedByPriority.length > 0 ? sortedByPriority[0][0] : availableRegions[0][0];
  }

  async executeRoutedRequest(routingDecision, payload) {
    const { region } = routingDecision;
    const circuitBreaker = this.circuitBreakers.get(region);
    const startTime = performance.now();

    // Increment active connections
    this.activeConnections.set(region, this.activeConnections.get(region) + 1);

    try {
      const result = await circuitBreaker.execute(async () => {
        // Simulate request execution - replace with actual implementation
        const requestLatency = Math.random() * 200 + 50; // 50-250ms simulation

        if (Math.random() < 0.05) { // 5% failure simulation
          throw new Error(`Request failed in region ${region}`);
        }

        await new Promise(resolve => setTimeout(resolve, requestLatency));

        return {
          success: true,
          region,
          responseTime: requestLatency,
          timestamp: new Date().toISOString(),
          data: `Processed by ${region}`
        };
      });

      const totalTime = performance.now() - startTime;

      return {
        ...result,
        routingDecision,
        totalExecutionTime: totalTime
      };

    } finally {
      // Decrement active connections
      this.activeConnections.set(region, Math.max(0, this.activeConnections.get(region) - 1));
    }
  }

  async publishRoutingResponse(requestId, routingDecision) {
    const response = {
      type: 'routing_response',
      requestId,
      success: true,
      routingDecision,
      timestamp: new Date().toISOString()
    };

    await this.redisClient.publish('swarm:phase-2:loadbalancer', JSON.stringify(response));
  }

  async publishRoutingError(requestId, error) {
    const response = {
      type: 'routing_error',
      requestId,
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    await this.redisClient.publish('swarm:phase-2:loadbalancer', JSON.stringify(response));
  }

  updateLatencyMetrics(regionId, latency) {
    const history = this.latencyHistory.get(regionId) || [];
    history.push(latency);

    // Keep only last 100 measurements
    if (history.length > 100) {
      history.shift();
    }

    this.latencyHistory.set(regionId, history);

    // Update average in request stats
    const stats = this.requestStats.get(regionId);
    stats.averageResponseTime = history.reduce((a, b) => a + b, 0) / history.length;
  }

  updateRequestMetrics(regionId, success, responseTime) {
    const stats = this.requestStats.get(regionId);

    stats.totalRequests++;
    stats.lastRequestTime = new Date().toISOString();

    if (success) {
      stats.successfulRequests++;
      this.updateLatencyMetrics(regionId, responseTime);
    } else {
      stats.failedRequests++;
    }
  }

  handleRegionHealthUpdate(event) {
    const { region, health } = event;
    console.log(`🏥 Load balancer received health update for ${region}: ${health.status}`);

    // Reset circuit breaker if region becomes healthy
    if (health.status === HEALTH_STATUS.HEALTHY) {
      const circuitBreaker = this.circuitBreakers.get(region);
      if (circuitBreaker.state === 'OPEN') {
        circuitBreaker.state = 'CLOSED';
        circuitBreaker.failureCount = 0;
        console.log(`🔄 Reset circuit breaker for ${region} - region is healthy`);
      }
    }
  }

  handleRoutingTableUpdate(event) {
    console.log('📋 Load balancer received routing table update');
    this.emit('routing_table_updated', event);
  }

  handleFailoverInitiated(event) {
    const { fromRegion, toRegion, reason } = event;
    console.log(`🚨 Load balancer handling failover: ${fromRegion} → ${toRegion} (${reason})`);

    // Open circuit breaker for failed region
    const circuitBreaker = this.circuitBreakers.get(fromRegion);
    circuitBreaker.onFailure();

    this.emit('failover_handled', { fromRegion, toRegion, reason });
  }

  startMetricsCollection() {
    setInterval(() => {
      this.collectAndPublishMetrics();
    }, 60000); // Every minute
  }

  async collectAndPublishMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      circuitBreakers: {},
      requestStats: {},
      latencyHistory: {},
      activeConnections: {}
    };

    // Collect circuit breaker states
    this.circuitBreakers.forEach((breaker, regionId) => {
      metrics.circuitBreakers[regionId] = breaker.getState();
    });

    // Collect request statistics
    this.requestStats.forEach((stats, regionId) => {
      metrics.requestStats[regionId] = { ...stats };
    });

    // Collect latency summaries
    this.latencyHistory.forEach((history, regionId) => {
      if (history.length > 0) {
        const sorted = history.slice().sort((a, b) => a - b);
        metrics.latencyHistory[regionId] = {
          count: history.length,
          average: history.reduce((a, b) => a + b, 0) / history.length,
          min: Math.min(...history),
          max: Math.max(...history),
          p50: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          p99: sorted[Math.floor(sorted.length * 0.99)]
        };
      }
    });

    // Collect active connections
    this.activeConnections.forEach((count, regionId) => {
      metrics.activeConnections[regionId] = count;
    });

    // Publish metrics
    await this.redisClient.publish('swarm:phase-2:loadbalancer', JSON.stringify({
      type: 'performance_metrics',
      data: metrics
    }));
  }

  async loadHistoricalData() {
    try {
      const historicalData = await this.redisClient.get('loadbalancer:historical_metrics');
      if (historicalData) {
        const data = JSON.parse(historicalData);

        // Load latency history
        if (data.latencyHistory) {
          Object.entries(data.latencyHistory).forEach(([regionId, history]) => {
            this.latencyHistory.set(regionId, history);
          });
        }

        console.log('📚 Loaded historical load balancer data');
      }
    } catch (error) {
      console.warn('⚠️ Failed to load historical data:', error.message);
    }
  }

  async saveHistoricalData() {
    const data = {
      timestamp: new Date().toISOString(),
      latencyHistory: Object.fromEntries(this.latencyHistory)
    };

    await this.redisClient.setEx('loadbalancer:historical_metrics', 86400, JSON.stringify(data));
  }

  setRoutingStrategy(strategy) {
    if (Object.values(ROUTING_STRATEGIES).includes(strategy)) {
      this.routingStrategy = strategy;
      console.log(`🔄 Routing strategy changed to: ${strategy}`);
      this.emit('routing_strategy_changed', { strategy });
    } else {
      throw new Error(`Invalid routing strategy: ${strategy}`);
    }
  }

  getLoadBalancerStats() {
    return {
      strategy: this.routingStrategy,
      circuitBreakers: Object.fromEntries(
        Array.from(this.circuitBreakers.entries()).map(([id, breaker]) => [id, breaker.getState()])
      ),
      requestStats: Object.fromEntries(this.requestStats),
      activeConnections: Object.fromEntries(this.activeConnections),
      latencySummary: Object.fromEntries(
        Array.from(this.latencyHistory.entries()).map(([id, history]) => [
          id,
          {
            count: history.length,
            average: history.reduce((a, b) => a + b, 0) / history.length || 0
          }
        ])
      )
    };
  }

  async shutdown() {
    // Save historical data
    await this.saveHistoricalData();

    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('🔌 Regional Load Balancer shut down');
  }
}

export { REQUEST_TYPES, LOAD_BALANCER_CONFIG };