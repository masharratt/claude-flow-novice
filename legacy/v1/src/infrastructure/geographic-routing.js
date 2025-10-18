/**
 * Geographic Routing Algorithms with Fast Failover
 *
 * Implements intelligent geographic routing with sub-5 second failover
 * Supports multiple routing strategies and real-time path optimization
 */

import { performance } from 'perf_hooks';
import { GeographicDistance, REGIONS, HEALTH_STATUS } from './multiregion-topology.js';
import { REQUEST_TYPES } from './regional-load-balancer.js';

// Routing configuration
const ROUTING_CONFIG = {
  failoverTimeout: 5000, // 5 seconds
  maxRetries: 3,
  healthCheckInterval: 10000, // 10 seconds
  latencyHistorySize: 50,
  routingCacheTTL: 30000, // 30 seconds
  fallbackStrategy: 'latency_based',
  geolocationAccuracy: 100, // km
  circuitBreakerThreshold: 3,
  retryDelay: 1000 // 1 second
};

// Routing decision factors
const ROUTING_FACTORS = {
  DISTANCE: 0.3,
  LATENCY: 0.4,
  HEALTH: 0.2,
  LOAD: 0.1
};

/**
 * Geographic Routing Engine
 * Core routing algorithm implementation with fast failover
 */
export class GeographicRoutingEngine {
  constructor(topologyManager, loadBalancer) {
    this.topologyManager = topologyManager;
    this.loadBalancer = loadBalancer;
    this.routingCache = new Map();
    this.latencyMatrix = new Map();
    this.pathHistory = new Map();
    this.failoverStats = new Map();
    this.routingMetrics = {
      totalRequests: 0,
      successfulRoutes: 0,
      failedRoutes: 0,
      averageRoutingTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    this.initializeLatencyMatrix();
  }

  initializeLatencyMatrix() {
    // Initialize latency matrix with estimated values
    Object.keys(REGIONS).forEach(region1 => {
      this.latencyMatrix.set(region1, new Map());

      Object.keys(REGIONS).forEach(region2 => {
        if (region1 !== region2) {
          const distance = GeographicDistance.calculateDistance(
            REGIONS[region1].coordinates.lat,
            REGIONS[region1].coordinates.lon,
            REGIONS[region2].coordinates.lat,
            REGIONS[region2].coordinates.lon
          );

          // Estimate latency based on distance (rough approximation)
          const estimatedLatency = Math.max(50, distance * 0.01); // 0.01ms per km minimum
          this.latencyMatrix.get(region1).set(region2, {
            current: estimatedLatency,
            history: [],
            average: estimatedLatency,
            lastUpdated: Date.now()
          });
        }
      });
    });

    console.log('🗺️ Latency matrix initialized');
  }

  async routeRequest(requestContext) {
    const startTime = performance.now();
    const requestId = this.generateRequestId();

    try {
      this.routingMetrics.totalRequests++;

      // Check cache first
      const cacheKey = this.generateCacheKey(requestContext);
      const cachedRoute = this.routingCache.get(cacheKey);

      if (cachedRoute && this.isCacheValid(cachedRoute)) {
        this.routingMetrics.cacheHits++;
        console.log(`🎯 Cache hit for request ${requestId}`);

        return {
          ...cachedRoute.route,
          requestId,
          cached: true,
          routingTime: performance.now() - startTime
        };
      }

      this.routingMetrics.cacheMisses++;

      // Perform geographic routing
      const route = await this.performGeographicRouting(requestContext, requestId);

      // Cache the result
      this.routingCache.set(cacheKey, {
        route,
        timestamp: Date.now(),
        requestId
      });

      this.routingMetrics.successfulRoutes++;
      this.updateAverageRoutingTime(performance.now() - startTime);

      return {
        ...route,
        requestId,
        cached: false,
        routingTime: performance.now() - startTime
      };

    } catch (error) {
      this.routingMetrics.failedRoutes++;
      console.error(`❌ Routing failed for request ${requestId}:`, error.message);

      // Attempt fallback routing
      try {
        const fallbackRoute = await this.performFallbackRouting(requestContext, requestId);
        return {
          ...fallbackRoute,
          requestId,
          fallback: true,
          routingTime: performance.now() - startTime
        };
      } catch (fallbackError) {
        console.error(`❌ Fallback routing also failed for request ${requestId}:`, fallbackError.message);
        throw new Error(`Routing failed: ${error.message}`);
      }
    }
  }

  generateCacheKey(requestContext) {
    const { clientInfo, requestType, priority } = requestContext;

    let key = `${requestType}:${priority || 'normal'}`;

    if (clientInfo) {
      if (clientInfo.coordinates) {
        key += `:${clientInfo.coordinates.lat.toFixed(2)}:${clientInfo.coordinates.lon.toFixed(2)}`;
      }
      if (clientInfo.region) {
        key += `:${clientInfo.region}`;
      }
    }

    return key;
  }

  isCacheValid(cachedRoute) {
    return Date.now() - cachedRoute.timestamp < ROUTING_CONFIG.routingCacheTTL;
  }

  async performGeographicRouting(requestContext, requestId) {
    const { clientInfo, requestType, priority, constraints } = requestContext;

    console.log(`🗺️ Performing geographic routing for request ${requestId}`);

    // Get available regions
    const availableRegions = this.getAvailableRegions(constraints);

    if (availableRegions.length === 0) {
      throw new Error('No available regions for routing');
    }

    // Calculate routing scores for each region
    const regionScores = await this.calculateRegionScores(availableRegions, clientInfo, requestType);

    // Sort regions by score
    const sortedRegions = regionScores.sort((a, b) => b.score - a.score);

    // Select primary region and backup regions
    const primaryRegion = sortedRegions[0];
    const backupRegions = sortedRegions.slice(1, 3); // Top 2 backups

    console.log(`🎯 Selected primary region: ${primaryRegion.region} (score: ${primaryRegion.score.toFixed(2)})`);

    // Build routing decision
    const routingDecision = {
      primaryRegion: primaryRegion.region,
      backupRegions: backupRegions.map(r => r.region),
      routingStrategy: 'geographic',
      scores: regionScores.reduce((acc, r) => {
        acc[r.region] = r.score;
        return acc;
      }, {}),
      factors: primaryRegion.factors,
      estimatedLatency: primaryRegion.estimatedLatency,
      estimatedReliability: primaryRegion.reliability,
      failoverPlan: this.generateFailoverPlan(primaryRegion.region, backupRegions.map(r => r.region))
    };

    // Record routing decision
    this.recordRoutingDecision(requestId, routingDecision, requestContext);

    return routingDecision;
  }

  getAvailableRegions(constraints = {}) {
    const routingTable = this.topologyManager.getRoutingTable();

    return Object.entries(routingTable)
      .filter(([regionId, data]) => {
        // Filter by health status
        if (data.status === HEALTH_STATUS.UNHEALTHY) return false;

        // Filter by constraints
        if (constraints.regions && !constraints.regions.includes(regionId)) return false;

        if (constraints.maxLatency && data.latency > constraints.maxLatency) return false;

        if (constraints.minCapacity && data.capacity < constraints.minCapacity) return false;

        return true;
      })
      .map(([regionId, data]) => ({
        id: regionId,
        ...data,
        config: REGIONS[regionId]
      }));
  }

  async calculateRegionScores(availableRegions, clientInfo, requestType) {
    const scoredRegions = [];

    for (const region of availableRegions) {
      const score = await this.calculateRegionScore(region, clientInfo, requestType);
      scoredRegions.push(score);
    }

    return scoredRegions;
  }

  async calculateRegionScore(region, clientInfo, requestType) {
    const factors = {};

    // Distance factor
    if (clientInfo && clientInfo.coordinates) {
      const distance = GeographicDistance.calculateDistance(
        clientInfo.coordinates.lat,
        clientInfo.coordinates.lon,
        region.config.coordinates.lat,
        region.config.coordinates.lon
      );

      factors.distance = Math.max(0, 1 - distance / 20000); // Normalize to 0-1, 20000km max
    } else {
      factors.distance = 0.5; // Neutral score if no location info
    }

    // Latency factor
    factors.latency = Math.max(0, 1 - region.latency / 1000); // Normalize to 0-1, 1000ms max

    // Health factor
    const healthScore = {
      [HEALTH_STATUS.HEALTHY]: 1.0,
      [HEALTH_STATUS.DEGRADED]: 0.6,
      [HEALTH_STATUS.UNKNOWN]: 0.3
    };
    factors.health = healthScore[region.status] || 0.1;

    // Load factor
    factors.load = Math.max(0, 1 - region.load / 100); // Normalize to 0-1

    // Capacity factor
    factors.capacity = Math.min(1, region.config.capacity / 1000); // Normalize to 0-1, 1000 max

    // Calculate weighted score
    const score =
      factors.distance * ROUTING_FACTORS.DISTANCE +
      factors.latency * ROUTING_FACTORS.LATENCY +
      factors.health * ROUTING_FACTORS.HEALTH +
      factors.load * ROUTING_FACTORS.LOAD;

    // Estimate reliability based on historical performance
    const reliability = this.calculateReliability(region.id);

    // Estimate total latency
    const estimatedLatency = this.estimateTotalLatency(region.id, clientInfo);

    return {
      region: region.id,
      score,
      factors,
      reliability,
      estimatedLatency,
      regionData: region
    };
  }

  calculateReliability(regionId) {
    const stats = this.failoverStats.get(regionId);

    if (!stats || stats.totalRequests === 0) {
      return 0.95; // Default reliability
    }

    const successRate = stats.successfulRequests / stats.totalRequests;
    const failoverPenalty = stats.failoverCount * 0.05; // 5% penalty per failover

    return Math.max(0.5, successRate - failoverPenalty);
  }

  estimateTotalLatency(regionId, clientInfo) {
    let networkLatency = regionId ? this.getAverageLatency(regionId) : 200; // Default 200ms

    // Add client-to-region latency if location info available
    if (clientInfo && clientInfo.coordinates) {
      const distance = GeographicDistance.calculateDistance(
        clientInfo.coordinates.lat,
        clientInfo.coordinates.lon,
        REGIONS[regionId].coordinates.lat,
        REGIONS[regionId].coordinates.lon
      );

      const clientLatency = Math.max(20, distance * 0.008); // 0.008ms per km
      networkLatency += clientLatency;
    }

    // Add processing latency based on load
    const regionData = this.topologyManager.getRegionStatus(regionId);
    const processingLatency = regionData ? regionData.load * 2 : 100; // 2ms per 1% load

    return networkLatency + processingLatency;
  }

  getAverageLatency(regionId) {
    const regionLatencies = this.latencyMatrix.get(regionId);

    if (!regionLatencies || regionLatencies.size === 0) {
      return 200; // Default latency
    }

    let totalLatency = 0;
    let count = 0;

    regionLatencies.forEach(latencyData => {
      totalLatency += latencyData.average;
      count++;
    });

    return count > 0 ? totalLatency / count : 200;
  }

  generateFailoverPlan(primaryRegion, backupRegions) {
    return {
      primary: primaryRegion,
      backups: backupRegions,
      triggers: {
        healthDegradation: true,
        latencySpike: true,
        connectionFailure: true,
        overload: true
      },
      timeout: ROUTING_CONFIG.failoverTimeout,
      retryCount: ROUTING_CONFIG.maxRetries,
      strategy: ROUTING_CONFIG.fallbackStrategy
    };
  }

  async performFallbackRouting(requestContext, requestId) {
    console.log(`🔄 Performing fallback routing for request ${requestId}`);

    // Simple fallback: select region with best availability
    const routingTable = this.topologyManager.getRoutingTable();
    const availableRegions = Object.entries(routingTable)
      .filter(([_, data]) => data.status !== HEALTH_STATUS.UNHEALTHY)
      .sort((a, b) => b[1].weight - a[1].weight);

    if (availableRegions.length === 0) {
      throw new Error('No regions available for fallback routing');
    }

    const fallbackRegion = availableRegions[0][0];

    return {
      primaryRegion: fallbackRegion,
      backupRegions: availableRegions.slice(1, 2).map(([id, _]) => id),
      routingStrategy: 'fallback',
      fallback: true,
      estimatedLatency: this.estimateTotalLatency(fallbackRegion, requestContext.clientInfo)
    };
  }

  recordRoutingDecision(requestId, decision, context) {
    this.pathHistory.set(requestId, {
      decision,
      context,
      timestamp: Date.now(),
      status: 'routed'
    });

    // Update failover stats for primary region
    const stats = this.failoverStats.get(decision.primaryRegion) || {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      failoverCount: 0
    };

    stats.totalRequests++;
    this.failoverStats.set(decision.primaryRegion, stats);
  }

  async updateLatencyMetrics(fromRegion, toRegion, latency) {
    if (!this.latencyMatrix.has(fromRegion)) {
      this.latencyMatrix.set(fromRegion, new Map());
    }

    const regionLatency = this.latencyMatrix.get(fromRegion);
    const latencyData = regionLatency.get(toRegion) || {
      current: latency,
      history: [],
      average: latency,
      lastUpdated: Date.now()
    };

    // Update latency data
    latencyData.current = latency;
    latencyData.history.push(latency);
    latencyData.lastUpdated = Date.now();

    // Keep only recent history
    if (latencyData.history.length > ROUTING_CONFIG.latencyHistorySize) {
      latencyData.history.shift();
    }

    // Calculate new average
    latencyData.average = latencyData.history.reduce((a, b) => a + b, 0) / latencyData.history.length;

    regionLatency.set(toRegion, latencyData);

    console.log(`⏱️ Updated latency ${fromRegion} → ${toRegion}: ${latency.toFixed(2)}ms (avg: ${latencyData.average.toFixed(2)}ms)`);
  }

  async handleFailover(requestId, reason) {
    const pathInfo = this.pathHistory.get(requestId);

    if (!pathInfo) {
      console.warn(`⚠️ No routing path found for request ${requestId}`);
      return;
    }

    const { decision } = pathInfo;
    const primaryRegion = decision.primaryRegion;
    const backupRegions = decision.backupRegions;

    console.log(`🚨 Handling failover for request ${requestId} from ${primaryRegion} (reason: ${reason})`);

    // Update failover stats
    const stats = this.failoverStats.get(primaryRegion) || {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      failoverCount: 0
    };

    stats.failoverCount++;
    stats.failedRequests++;
    this.failoverStats.set(primaryRegion, stats);

    // Select backup region
    if (backupRegions && backupRegions.length > 0) {
      const selectedBackup = backupRegions[0];

      // Update path info
      pathInfo.status = 'failed_over';
      pathInfo.failoverRegion = selectedBackup;
      pathInfo.failoverReason = reason;
      pathInfo.failoverTime = Date.now();

      console.log(`🔄 Failed over request ${requestId} to ${selectedBackup}`);

      return {
        success: true,
        newRegion: selectedBackup,
        reason
      };
    }

    return {
      success: false,
      reason: 'No backup regions available'
    };
  }

  updateAverageRoutingTime(routingTime) {
    const alpha = 0.1; // Exponential moving average factor
    this.routingMetrics.averageRoutingTime =
      alpha * routingTime + (1 - alpha) * this.routingMetrics.averageRoutingTime;
  }

  generateRequestId() {
    return `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getRoutingMetrics() {
    return {
      ...this.routingMetrics,
      cacheHitRate: this.routingMetrics.cacheHits / (this.routingMetrics.cacheHits + this.routingMetrics.cacheMisses) || 0,
      successRate: this.routingMetrics.successfulRoutes / this.routingMetrics.totalRequests || 0,
      failoverStats: Object.fromEntries(this.failoverStats),
      cacheSize: this.routingCache.size,
      pathHistorySize: this.pathHistory.size
    };
  }

  clearCache() {
    this.routingCache.clear();
    console.log('🧹 Routing cache cleared');
  }

  getCacheInfo() {
    const now = Date.now();
    const validEntries = Array.from(this.routingCache.entries())
      .filter(([_, cached]) => now - cached.timestamp < ROUTING_CONFIG.routingCacheTTL);

    return {
      totalEntries: this.routingCache.size,
      validEntries: validEntries.length,
      expiredEntries: this.routingCache.size - validEntries.length,
      ttl: ROUTING_CONFIG.routingCacheTTL
    };
  }
}

/**
 * Fast Failover Manager
 * Implements sub-5 second failover logic
 */
export class FastFailoverManager {
  constructor(routingEngine, topologyManager) {
    this.routingEngine = routingEngine;
    this.topologyManager = topologyManager;
    this.activeFailovers = new Map();
    this.failoverHistory = [];
    this.circuitBreakers = new Map();
  }

  async initiateFailover(requestId, primaryRegion, reason) {
    const failoverId = this.generateFailoverId();
    const startTime = Date.now();

    console.log(`🚨 Initiating fast failover ${failoverId} for request ${requestId} from ${primaryRegion}`);

    const failover = {
      id: failoverId,
      requestId,
      fromRegion: primaryRegion,
      reason,
      startTime,
      status: 'initiated',
      attempts: 0,
      maxAttempts: ROUTING_CONFIG.maxRetries
    };

    this.activeFailovers.set(failoverId, failover);

    try {
      const result = await this.executeFailover(failover);

      failover.endTime = Date.now();
      failover.duration = failover.endTime - failover.startTime;
      failover.status = result.success ? 'success' : 'failed';
      failover.toRegion = result.newRegion;

      this.recordFailover(failover);

      // Clean up active failover
      this.activeFailovers.delete(failoverId);

      return result;

    } catch (error) {
      failover.endTime = Date.now();
      failover.duration = failover.endTime - failover.startTime;
      failover.status = 'failed';
      failover.error = error.message;

      this.recordFailover(failover);
      this.activeFailovers.delete(failoverId);

      throw error;
    }
  }

  async executeFailover(failover) {
    const { requestId, fromRegion, maxAttempts } = failover;

    // Get routing decision for this request
    const pathInfo = this.routingEngine.pathHistory.get(requestId);

    if (!pathInfo || !pathInfo.decision.backupRegions) {
      throw new Error('No backup regions available for failover');
    }

    const backupRegions = pathInfo.decision.backupRegions;

    // Try backup regions in order
    for (let attempt = 0; attempt < Math.min(maxAttempts, backupRegions.length); attempt++) {
      const targetRegion = backupRegions[attempt];
      failover.attempts++;

      console.log(`🔄 Failover attempt ${failover.attempts}: ${fromRegion} → ${targetRegion}`);

      try {
        // Check if target region is healthy
        const targetStatus = this.topologyManager.getRegionStatus(targetRegion);
        if (targetStatus.status === HEALTH_STATUS.UNHEALTHY) {
          console.log(`⚠️ Target region ${targetRegion} is unhealthy, skipping`);
          continue;
        }

        // Simulate failover execution
        const failoverTime = await this.simulateFailoverExecution(targetRegion);

        // Update routing engine with failover
        await this.routingEngine.handleFailover(requestId, `Failover to ${targetRegion}`);

        console.log(`✅ Failover successful: ${fromRegion} → ${targetRegion} (${failoverTime}ms)`);

        return {
          success: true,
          newRegion: targetRegion,
          attempt: failover.attempts,
          failoverTime
        };

      } catch (error) {
        console.error(`❌ Failover attempt ${failover.attempts} failed:`, error.message);

        if (attempt === maxAttempts - 1) {
          throw new Error(`All failover attempts exhausted for request ${requestId}`);
        }

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, ROUTING_CONFIG.retryDelay));
      }
    }

    throw new Error(`No successful failover achieved for request ${requestId}`);
  }

  async simulateFailoverExecution(targetRegion) {
    // Simulate the time it takes to execute failover
    // In real implementation, this would involve DNS updates, connection routing, etc.
    const baseFailoverTime = 500; // 500ms base
    const networkLatency = this.routingEngine.getAverageLatency(targetRegion);
    const randomVariation = Math.random() * 200; // 0-200ms variation

    return baseFailoverTime + networkLatency + randomVariation;
  }

  recordFailover(failover) {
    this.failoverHistory.push(failover);

    // Keep only recent history (last 100 failovers)
    if (this.failoverHistory.length > 100) {
      this.failoverHistory.shift();
    }

    console.log(`📊 Failover recorded: ${failover.id} (${failover.duration}ms, status: ${failover.status})`);
  }

  generateFailoverId() {
    return `fo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  getFailoverMetrics() {
    const recentFailovers = this.failoverHistory.slice(-50); // Last 50 failovers
    const successfulFailovers = recentFailovers.filter(f => f.status === 'success');
    const failedFailovers = recentFailovers.filter(f => f.status === 'failed');

    const averageDuration = successfulFailovers.length > 0
      ? successfulFailovers.reduce((sum, f) => sum + f.duration, 0) / successfulFailovers.length
      : 0;

    const failoverRate = recentFailovers.length > 0
      ? failedFailovers.length / recentFailovers.length
      : 0;

    return {
      activeFailovers: this.activeFailovers.size,
      totalFailovers: this.failoverHistory.length,
      recentFailovers: recentFailovers.length,
      successfulFailovers: successfulFailovers.length,
      failedFailovers: failedFailovers.length,
      successRate: 1 - failoverRate,
      averageDuration,
      failoverRate
    };
  }
}

export { ROUTING_CONFIG, ROUTING_FACTORS };