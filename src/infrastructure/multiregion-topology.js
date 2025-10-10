/**
 * Multi-Region Load Balancer for Phase 2 Auto-Scaling & Resource Management
 *
 * Implements geographic load balancing with latency optimization using Redis coordination
 * Supports us-east, us-west, eu-west, asia-pacific regions
 * Target: <5s failover, latency-based routing, eventual consistency
 */

import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import EventEmitter from 'events';

// Region configuration
const REGIONS = {
  'us-east': {
    name: 'US East (N. Virginia)',
    coordinates: { lat: 39.04, lon: -77.48 },
    priority: 1,
    healthCheckEndpoint: 'https://us-east.api.example.com/health',
    latencyThreshold: 200, // ms
    capacity: 1000
  },
  'us-west': {
    name: 'US West (Oregon)',
    coordinates: { lat: 45.52, lon: -122.68 },
    priority: 2,
    healthCheckEndpoint: 'https://us-west.api.example.com/health',
    latencyThreshold: 250, // ms
    capacity: 800
  },
  'eu-west': {
    name: 'EU West (Ireland)',
    coordinates: { lat: 53.34, lon: -6.26 },
    priority: 3,
    healthCheckEndpoint: 'https://eu-west.api.example.com/health',
    latencyThreshold: 300, // ms
    capacity: 600
  },
  'asia-pacific': {
    name: 'Asia Pacific (Singapore)',
    coordinates: { lat: 1.35, lon: 103.82 },
    priority: 4,
    healthCheckEndpoint: 'https://ap-southeast.api.example.com/health',
    latencyThreshold: 400, // ms
    capacity: 500
  }
};

// Health status constants
const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

// Routing strategies
const ROUTING_STRATEGIES = {
  LATENCY_BASED: 'latency_based',
  ROUND_ROBIN: 'round_robin',
  WEIGHTED_ROUND_ROBIN: 'weighted_round_robin',
  GEOGRAPHIC: 'geographic',
  PRIORITY_FALLBACK: 'priority_fallback'
};

/**
 * Multi-Region Topology Manager
 * Manages region configuration, health monitoring, and topology state
 */
export class MultiRegionTopology extends EventEmitter {
  constructor(redisConfig) {
    super();
    this.redis = redisConfig;
    this.regions = new Map();
    this.healthStatus = new Map();
    this.routingTable = new Map();
    this.lastHealthCheck = new Map();
    this.heartbeatInterval = null;

    this.initializeRegions();
  }

  initializeRegions() {
    Object.entries(REGIONS).forEach(([regionId, config]) => {
      this.regions.set(regionId, {
        ...config,
        id: regionId,
        status: HEALTH_STATUS.UNKNOWN,
        currentLoad: 0,
        averageLatency: 0,
        lastHealthCheck: null,
        failoverCount: 0,
        connectionsActive: 0,
        throughput: 0
      });
    });
  }

  async initialize() {
    console.log('🌍 Initializing Multi-Region Topology...');

    // Connect to Redis
    this.redisClient = createClient(this.redis);
    await this.redisClient.connect();

    // Subscribe to regional events
    await this.redisClient.subscribe('swarm:phase-2:multiregion', (message) => {
      this.handleRegionalEvent(JSON.parse(message));
    });

    // Start health monitoring
    this.startHealthMonitoring();

    // Load routing table from Redis
    await this.loadRoutingTable();

    console.log('✅ Multi-Region Topology initialized');
    this.emit('initialized', { regions: Array.from(this.regions.keys()) });
  }

  async handleRegionalEvent(event) {
    const { type, region, data, timestamp } = event;

    console.log(`📡 Regional event: ${type} from ${region}`);

    switch (type) {
      case 'health_update':
        await this.updateRegionHealth(region, data);
        break;
      case 'load_update':
        await this.updateRegionLoad(region, data);
        break;
      case 'failover_request':
        await this.handleFailoverRequest(region, data);
        break;
      case 'routing_table_update':
        await this.updateRoutingTable(region, data);
        break;
      case 'latency_measurement':
        await this.updateLatencyMetrics(region, data);
        break;
    }
  }

  async publishRegionalEvent(type, region, data) {
    const event = {
      type,
      region,
      data,
      timestamp: new Date().toISOString(),
      eventId: crypto.randomUUID()
    };

    await this.redisClient.publish('swarm:phase-2:multiregion', JSON.stringify(event));
  }

  startHealthMonitoring() {
    this.heartbeatInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000); // Health checks every 30 seconds

    console.log('❤️ Health monitoring started');
  }

  async performHealthChecks() {
    const healthCheckPromises = Array.from(this.regions.keys()).map(async (regionId) => {
      try {
        const region = this.regions.get(regionId);
        const startTime = performance.now();

        // Simulate health check - in real implementation, would hit actual endpoint
        const healthStatus = await this.checkRegionHealth(regionId);
        const latency = performance.now() - startTime;

        // Update region status
        region.status = healthStatus.status;
        region.averageLatency = latency;
        region.lastHealthCheck = new Date().toISOString();

        // Update health status map
        this.healthStatus.set(regionId, healthStatus);

        // Publish health update
        await this.publishRegionalEvent('health_update', regionId, {
          status: healthStatus.status,
          latency,
          metrics: healthStatus.metrics
        });

        console.log(`🏥 Health check ${regionId}: ${healthStatus.status} (${latency.toFixed(2)}ms)`);

      } catch (error) {
        console.error(`❌ Health check failed for ${regionId}:`, error.message);
        const region = this.regions.get(regionId);
        region.status = HEALTH_STATUS.UNHEALTHY;
        region.lastHealthCheck = new Date().toISOString();
      }
    });

    await Promise.allSettled(healthCheckPromises);

    // Update routing table based on health status
    await this.updateRoutingTable();
  }

  async checkRegionHealth(regionId) {
    const region = this.regions.get(regionId);

    // Simulate health check - replace with actual implementation
    const isHealthy = Math.random() > 0.1; // 90% healthy simulation
    const load = Math.random() * 100; // Random load simulation

    return {
      status: isHealthy ? (load < 80 ? HEALTH_STATUS.HEALTHY : HEALTH_STATUS.DEGRADED) : HEALTH_STATUS.UNHEALTHY,
      metrics: {
        load,
        connectionsActive: Math.floor(Math.random() * region.capacity),
        throughput: Math.random() * 1000,
        errorRate: Math.random() * 0.05
      }
    };
  }

  async updateRegionHealth(regionId, healthData) {
    const region = this.regions.get(regionId);
    if (!region) return;

    region.status = healthData.status;
    region.averageLatency = healthData.latency;
    region.lastHealthCheck = new Date().toISOString();

    if (healthData.metrics) {
      region.currentLoad = healthData.metrics.load;
      region.connectionsActive = healthData.metrics.connectionsActive;
      region.throughput = healthData.metrics.throughput;
    }

    console.log(`📊 Updated health for ${regionId}: ${healthData.status}`);
    this.emit('region_health_updated', { region: regionId, health: healthData });
  }

  async updateRegionLoad(regionId, loadData) {
    const region = this.regions.get(regionId);
    if (!region) return;

    region.currentLoad = loadData.load;
    region.connectionsActive = loadData.connections;
    region.throughput = loadData.throughput;

    // Publish routing update if load changed significantly
    if (Math.abs(loadData.load - region.currentLoad) > 10) {
      await this.updateRoutingTable();
    }
  }

  async handleFailoverRequest(regionId, requestData) {
    console.log(`🚨 Failover request for ${regionId}:`, requestData.reason);

    const region = this.regions.get(regionId);
    region.failoverCount++;

    // Find best alternative region
    const alternativeRegion = this.findBestAlternativeRegion(regionId);

    if (alternativeRegion) {
      console.log(`🔄 Initiating failover to ${alternativeRegion}`);

      await this.publishRegionalEvent('failover_initiated', alternativeRegion, {
        fromRegion: regionId,
        reason: requestData.reason,
        timestamp: new Date().toISOString()
      });

      this.emit('failover_initiated', {
        fromRegion: regionId,
        toRegion: alternativeRegion,
        reason: requestData.reason
      });
    }
  }

  findBestAlternativeRegion(excludeRegion) {
    const healthyRegions = Array.from(this.regions.entries())
      .filter(([id, region]) =>
        id !== excludeRegion &&
        region.status === HEALTH_STATUS.HEALTHY &&
        region.currentLoad < 80
      )
      .sort((a, b) => {
        // Sort by latency, then load
        const latencyDiff = a[1].averageLatency - b[1].averageLatency;
        if (Math.abs(latencyDiff) > 50) return latencyDiff;
        return a[1].currentLoad - b[1].currentLoad;
      });

    return healthyRegions.length > 0 ? healthyRegions[0][0] : null;
  }

  async loadRoutingTable() {
    try {
      const routingData = await this.redisClient.get('multiregion:routing_table');
      if (routingData) {
        this.routingTable = new Map(Object.entries(JSON.parse(routingData)));
        console.log('📋 Loaded routing table from Redis');
      }
    } catch (error) {
      console.warn('⚠️ Failed to load routing table:', error.message);
    }
  }

  async updateRoutingTable(regionId = null, data = null) {
    // Build new routing table based on current region health and performance
    const newRoutingTable = new Map();

    Array.from(this.regions.entries()).forEach(([id, region]) => {
      if (region.status === HEALTH_STATUS.HEALTHY || region.status === HEALTH_STATUS.DEGRADED) {
        newRoutingTable.set(id, {
          region: id,
          weight: this.calculateRegionWeight(region),
          priority: region.priority,
          latency: region.averageLatency,
          load: region.currentLoad,
          status: region.status
        });
      }
    });

    this.routingTable = newRoutingTable;

    // Save to Redis
    await this.redisClient.setEx(
      'multiregion:routing_table',
      3600,
      JSON.stringify(Object.fromEntries(newRoutingTable))
    );

    // Publish update
    await this.publishRegionalEvent('routing_table_update', 'coordinator', {
      routingTable: Object.fromEntries(newRoutingTable),
      timestamp: new Date().toISOString()
    });

    console.log('📋 Routing table updated');
    this.emit('routing_table_updated', { routingTable: Object.fromEntries(newRoutingTable) });
  }

  calculateRegionWeight(region) {
    // Weight based on latency, load, and capacity
    const latencyWeight = Math.max(0, 1000 - region.averageLatency) / 1000;
    const loadWeight = Math.max(0, 100 - region.currentLoad) / 100;
    const capacityWeight = region.capacity / 1000;

    return (latencyWeight * 0.4 + loadWeight * 0.4 + capacityWeight * 0.2) * 100;
  }

  async updateLatencyMetrics(regionId, latencyData) {
    const region = this.regions.get(regionId);
    if (!region) return;

    // Update average latency with exponential moving average
    const alpha = 0.3;
    region.averageLatency = alpha * latencyData.latency + (1 - alpha) * region.averageLatency;

    console.log(`⏱️ Updated latency for ${regionId}: ${region.averageLatency.toFixed(2)}ms`);
  }

  getRegionStatus(regionId) {
    return this.regions.get(regionId);
  }

  getAllRegions() {
    return Object.fromEntries(this.regions);
  }

  getRoutingTable() {
    return Object.fromEntries(this.routingTable);
  }

  async shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('🔌 Multi-Region Topology shut down');
  }
}

/**
 * Geographic Distance Calculator
 * Haversine formula for calculating distance between coordinates
 */
export class GeographicDistance {
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  static findNearestRegions(clientLat, clientLon, maxRegions = 3) {
    const regionsWithDistance = Object.entries(REGIONS).map(([id, config]) => ({
      id,
      distance: this.calculateDistance(clientLat, clientLon, config.coordinates.lat, config.coordinates.lon),
      config
    }));

    return regionsWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxRegions);
  }
}

export { REGIONS, HEALTH_STATUS, ROUTING_STRATEGIES };