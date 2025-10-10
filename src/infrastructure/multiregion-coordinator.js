/**
 * Multi-Region Coordinator with Redis Pub/Sub
 *
 * Central coordination system for multi-region load balancing
 * Manages cross-region communication, event orchestration, and system-wide coordination
 */

import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import EventEmitter from 'events';
import { MultiRegionTopology } from './multiregion-topology.js';
import { RegionalLoadBalancer } from './regional-load-balancer.js';
import { StateSynchronization } from './state-synchronization.js';
import { GeographicRoutingEngine, FastFailoverManager } from './geographic-routing.js';

// Coordinator configuration
const COORDINATOR_CONFIG = {
  heartbeatInterval: 15000, // 15 seconds
  coordinationTimeout: 30000, // 30 seconds
  eventRetentionTime: 3600000, // 1 hour
  metricsCollectionInterval: 60000, // 1 minute
  healthCheckInterval: 30000, // 30 seconds
  failoverTimeout: 5000, // 5 seconds
  maxRetries: 3
};

// Event types for regional coordination
const COORDINATION_EVENTS = {
  REGION_HEALTH_CHANGE: 'region_health_change',
  LOAD_BALANCER_UPDATE: 'load_balancer_update',
  ROUTING_DECISION: 'routing_decision',
  FAILOVER_INITIATED: 'failover_initiated',
  FAILOVER_COMPLETED: 'failover_completed',
  STATE_SYNC_REQUIRED: 'state_sync_required',
  PERFORMANCE_ALERT: 'performance_alert',
  COORDINATION_REQUEST: 'coordination_request',
  SYSTEM_STATUS_UPDATE: 'system_status_update'
};

/**
 * Multi-Region Coordinator
 * Central coordination hub for all multi-region operations
 */
export class MultiRegionCoordinator extends EventEmitter {
  constructor(redisConfig, regionId = 'us-east') {
    super();
    this.redis = redisConfig;
    this.regionId = regionId;
    this.isCoordinator = regionId === 'us-east'; // Primary coordinator region

    // Component instances
    this.topologyManager = null;
    this.loadBalancer = null;
    this.stateSync = null;
    this.routingEngine = null;
    this.failoverManager = null;

    // Coordination state
    this.coordinationStatus = {
      initialized: false,
      healthy: false,
      lastCoordinationTime: null,
      activeCoordinationEvents: new Map(),
      pendingActions: new Map(),
      systemMetrics: new Map()
    };

    // Event history and tracking
    this.eventHistory = [];
    this.coordinationMetrics = {
      totalEvents: 0,
      successfulCoordinations: 0,
      failedCoordinations: 0,
      averageCoordinationTime: 0,
      activeRegions: 0
    };

    // Redis clients
    this.redisClient = null;
    this.redisPublisher = null;
    this.redisSubscriber = null;
  }

  async initialize() {
    console.log(`🌐 Initializing Multi-Region Coordinator for ${this.regionId}`);

    try {
      // Initialize Redis connections
      await this.initializeRedisConnections();

      // Initialize core components
      await this.initializeComponents();

      // Setup event handlers
      this.setupEventHandlers();

      // Start coordination processes
      this.startCoordinationProcesses();

      // Perform initial coordination
      await this.performInitialCoordination();

      this.coordinationStatus.initialized = true;
      this.coordinationStatus.healthy = true;
      this.coordinationStatus.lastCoordinationTime = new Date();

      console.log(`✅ Multi-Region Coordinator initialized for ${this.regionId}`);
      this.emit('coordinator_initialized', { regionId: this.regionId, isCoordinator: this.isCoordinator });

      // Publish coordinator ready event
      await this.publishCoordinationEvent(COORDINATION_EVENTS.SYSTEM_STATUS_UPDATE, {
        status: 'ready',
        regionId: this.regionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Failed to initialize coordinator for ${this.regionId}:`, error.message);
      this.coordinationStatus.healthy = false;
      throw error;
    }
  }

  async initializeRedisConnections() {
    // Create separate Redis clients for pub/sub to avoid conflicts
    this.redisClient = createClient(this.redis);
    this.redisPublisher = createClient(this.redis);
    this.redisSubscriber = createClient(this.redis);

    await this.redisClient.connect();
    await this.redisPublisher.connect();
    await this.redisSubscriber.connect();

    console.log('🔌 Redis connections established');
  }

  async initializeComponents() {
    // Initialize Multi-Region Topology
    this.topologyManager = new MultiRegionTopology(this.redis);
    await this.topologyManager.initialize();

    // Initialize Regional Load Balancer
    this.loadBalancer = new RegionalLoadBalancer(this.redis, this.topologyManager);
    await this.loadBalancer.initialize();

    // Initialize State Synchronization
    this.stateSync = new StateSynchronization(this.redis, this.regionId);
    await this.stateSync.initialize();

    // Initialize Geographic Routing Engine
    this.routingEngine = new GeographicRoutingEngine(this.topologyManager, this.loadBalancer);

    // Initialize Fast Failover Manager
    this.failoverManager = new FastFailoverManager(this.routingEngine, this.topologyManager);

    console.log('🧩 All components initialized');
  }

  setupEventHandlers() {
    // Subscribe to coordination events
    this.redisSubscriber.subscribe('swarm:phase-2:coordination', (message) => {
      this.handleCoordinationEvent(JSON.parse(message));
    });

    // Subscribe to regional events
    this.redisSubscriber.subscribe('swarm:phase-2:multiregion', (message) => {
      this.handleRegionalEvent(JSON.parse(message));
    });

    // Subscribe to load balancer events
    this.redisSubscriber.subscribe('swarm:phase-2:loadbalancer', (message) => {
      this.handleLoadBalancerEvent(JSON.parse(message));
    });

    // Subscribe to sync events
    this.redisSubscriber.subscribe('swarm:phase-2:sync', (message) => {
      this.handleSyncEvent(JSON.parse(message));
    });

    // Setup component event handlers
    this.topologyManager.on('region_health_updated', (event) => {
      this.handleRegionHealthUpdate(event);
    });

    this.topologyManager.on('failover_initiated', (event) => {
      this.handleFailoverInitiated(event);
    });

    this.loadBalancer.on('routing_table_updated', (event) => {
      this.handleRoutingTableUpdate(event);
    });

    this.stateSync.on('conflict_detected', (event) => {
      this.handleConflictDetected(event);
    });

    console.log('📡 Event handlers configured');
  }

  startCoordinationProcesses() {
    // Start heartbeat coordination
    setInterval(async () => {
      await this.performCoordinationHeartbeat();
    }, COORDINATOR_CONFIG.heartbeatInterval);

    // Start metrics collection
    setInterval(async () => {
      await this.collectAndPublishMetrics();
    }, COORDINATOR_CONFIG.metricsCollectionInterval);

    // Start health checks
    setInterval(async () => {
      await this.performSystemHealthCheck();
    }, COORDINATOR_CONFIG.healthCheckInterval);

    // Start event cleanup
    setInterval(async () => {
      await this.cleanupOldEvents();
    }, 300000); // Every 5 minutes

    console.log('⚙️ Coordination processes started');
  }

  async handleCoordinationEvent(event) {
    const { type, data, regionId, timestamp, eventId } = event;

    // Ignore own events in coordinator-to-coordinator communication
    if (regionId === this.regionId && !event.global) return;

    console.log(`🎯 Coordination event: ${type} from ${regionId}`);

    this.coordinationMetrics.totalEvents++;
    this.recordEvent(event);

    try {
      switch (type) {
        case COORDINATION_EVENTS.REGION_HEALTH_CHANGE:
          await this.coordinateRegionHealthChange(data, regionId);
          break;
        case COORDINATION_EVENTS.FAILOVER_INITIATED:
          await this.coordinateFailover(data, regionId);
          break;
        case COORDINATION_EVENTS.STATE_SYNC_REQUIRED:
          await this.coordinateStateSync(data, regionId);
          break;
        case COORDINATION_EVENTS.PERFORMANCE_ALERT:
          await this.coordinatePerformanceAlert(data, regionId);
          break;
        case COORDINATION_EVENTS.COORDINATION_REQUEST:
          await this.handleCoordinationRequest(data, regionId);
          break;
        case COORDINATION_EVENTS.SYSTEM_STATUS_UPDATE:
          await this.handleSystemStatusUpdate(data, regionId);
          break;
      }

      this.coordinationMetrics.successfulCoordinations++;

    } catch (error) {
      console.error(`❌ Coordination failed for event ${eventId}:`, error.message);
      this.coordinationMetrics.failedCoordinations++;
    }
  }

  async handleRegionalEvent(event) {
    console.log(`🌍 Regional event: ${event.type} from ${event.region}`);

    // Forward important regional events to coordination channel
    if (this.shouldCoordinateEvent(event.type)) {
      await this.publishCoordinationEvent(COORDINATION_EVENTS.REGION_HEALTH_CHANGE, {
        originalEvent: event,
        regionId: event.region,
        timestamp: event.timestamp
      }, true); // Global event
    }
  }

  async handleLoadBalancerEvent(event) {
    console.log(`⚖️ Load balancer event: ${event.type}`);

    if (event.type === 'routing_table_updated') {
      await this.publishCoordinationEvent(COORDINATION_EVENTS.LOAD_BALANCER_UPDATE, {
        routingTable: event.routingTable,
        regionId: this.regionId,
        timestamp: event.timestamp
      });
    }
  }

  async handleSyncEvent(event) {
    console.log(`🔄 Sync event: ${event.type} from ${event.regionId}`);

    if (event.type === 'conflict_resolution' || event.type === 'state_update') {
      await this.publishCoordinationEvent(COORDINATION_EVENTS.STATE_SYNC_REQUIRED, {
        syncEvent: event,
        regionId: event.regionId,
        timestamp: event.timestamp
      });
    }
  }

  async handleRegionHealthUpdate(event) {
    console.log(`🏥 Coordinator handling health update: ${event.region} → ${event.health.status}`);

    await this.publishCoordinationEvent(COORDINATION_EVENTS.REGION_HEALTH_CHANGE, {
      region: event.region,
      health: event.health,
      timestamp: event.timestamp
    });
  }

  async handleFailoverInitiated(event) {
    console.log(`🚨 Coordinator handling failover: ${event.fromRegion} → ${event.toRegion}`);

    // Coordinate failover across all regions
    await this.publishCoordinationEvent(COORDINATION_EVENTS.FAILOVER_INITIATED, {
      fromRegion: event.fromRegion,
      toRegion: event.toRegion,
      reason: event.reason,
      timestamp: new Date().toISOString()
    }, true); // Global event
  }

  async handleRoutingTableUpdate(event) {
    console.log('📋 Coordinator handling routing table update');

    await this.publishCoordinationEvent(COORDINATION_EVENTS.LOAD_BALANCER_UPDATE, {
      routingTable: event.routingTable,
      regionId: this.regionId,
      timestamp: new Date().toISOString()
    });
  }

  async handleConflictDetected(event) {
    console.log(`⚔️ Coordinator handling conflict: ${event.key}`);

    await this.publishCoordinationEvent(COORDINATION_EVENTS.STATE_SYNC_REQUIRED, {
      conflict: event,
      action: 'resolve_conflict',
      regionId: this.regionId,
      timestamp: new Date().toISOString()
    });
  }

  async coordinateRegionHealthChange(data, sourceRegion) {
    console.log(`🏥 Coordinating health change from ${sourceRegion}`);

    // Update local topology if this isn't the source
    if (sourceRegion !== this.regionId) {
      const regionStatus = this.topologyManager.getRegionStatus(data.region);
      if (regionStatus) {
        // Trigger local health check and update
        await this.topologyManager.updateRegionHealth(data.region, data.health);
      }
    }

    // Update coordination metrics
    this.updateSystemMetrics('region_health_changes', {
      region: data.region,
      status: data.health.status,
      sourceRegion,
      timestamp: new Date().toISOString()
    });
  }

  async coordinateFailover(data, sourceRegion) {
    console.log(`🚨 Coordinating failover from ${sourceRegion}: ${data.fromRegion} → ${data.toRegion}`);

    // Update all components about the failover
    await this.routingEngine.updateLatencyMetrics(data.fromRegion, data.toRegion, 1000);

    // Update failover manager
    const failoverMetrics = this.failoverManager.getFailoverMetrics();
    this.updateSystemMetrics('failover_events', {
      ...data,
      coordinatedBy: sourceRegion,
      failoverMetrics,
      timestamp: new Date().toISOString()
    });
  }

  async coordinateStateSync(data, sourceRegion) {
    console.log(`🔄 Coordinating state sync from ${sourceRegion}`);

    // Ensure state synchronization across regions
    if (data.action === 'resolve_conflict') {
      const syncStatus = this.stateSync.getSyncStatus();
      this.updateSystemMetrics('state_sync_operations', {
        conflict: data.conflict,
        syncStatus,
        coordinatedBy: sourceRegion,
        timestamp: new Date().toISOString()
      });
    }
  }

  async coordinatePerformanceAlert(data, sourceRegion) {
    console.log(`📊 Coordinating performance alert from ${sourceRegion}`);

    // Check if other regions need to take action
    if (data.severity === 'critical') {
      // Trigger load balancing adjustment
      const routingTable = this.topologyManager.getRoutingTable();
      this.updateSystemMetrics('performance_alerts', {
        ...data,
        routingTable,
        coordinatedBy: sourceRegion,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleCoordinationRequest(data, sourceRegion) {
    console.log(`🤝 Handling coordination request from ${sourceRegion}`);

    const { requestId, action, parameters } = data;

    try {
      let result;

      switch (action) {
        case 'get_routing_table':
          result = this.topologyManager.getRoutingTable();
          break;
        case 'get_system_status':
          result = this.getSystemStatus();
          break;
        case 'trigger_health_check':
          result = await this.topologyManager.performHealthChecks();
          break;
        default:
          throw new Error(`Unknown coordination action: ${action}`);
      }

      // Send response
      await this.publishCoordinationEvent('coordination_response', {
        requestId,
        result,
        regionId: this.regionId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`❌ Coordination request failed:`, error.message);
    }
  }

  async handleSystemStatusUpdate(data, sourceRegion) {
    console.log(`📊 System status update from ${sourceRegion}: ${data.status}`);

    // Update coordination status
    this.coordinationMetrics.activeRegions = this.countActiveRegions();

    this.updateSystemMetrics('system_status', {
      ...data,
      sourceRegion,
      activeRegions: this.coordinationMetrics.activeRegions,
      timestamp: new Date().toISOString()
    });
  }

  async performCoordinationHeartbeat() {
    const heartbeat = {
      type: 'coordination_heartbeat',
      regionId: this.regionId,
      timestamp: new Date().toISOString(),
      status: this.coordinationStatus,
      metrics: this.coordinationMetrics,
      eventId: crypto.randomUUID()
    };

    await this.redisPublisher.publish('swarm:phase-2:coordination', JSON.stringify(heartbeat));

    // Store heartbeat for monitoring
    await this.redisClient.setEx(
      `coordination:heartbeat:${this.regionId}`,
      60,
      JSON.stringify(heartbeat)
    );
  }

  async collectAndPublishMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      regionId: this.regionId,
      isCoordinator: this.isCoordinator,
      topology: this.topologyManager.getAllRegions(),
      loadBalancer: this.loadBalancer.getLoadBalancerStats(),
      stateSync: this.stateSync.getSyncStatus(),
      routing: this.routingEngine.getRoutingMetrics(),
      failover: this.failoverManager.getFailoverMetrics(),
      coordination: this.coordinationMetrics,
      system: this.getSystemStatus()
    };

    // Publish comprehensive metrics
    await this.redisPublisher.publish('swarm:phase-2:metrics', JSON.stringify(metrics));

    // Store metrics in Redis for historical analysis
    await this.redisClient.setEx(
      `coordination:metrics:${this.regionId}:${Date.now()}`,
      3600,
      JSON.stringify(metrics)
    );

    console.log(`📊 Published metrics for ${this.regionId}`);
  }

  async performSystemHealthCheck() {
    try {
      const startTime = performance.now();

      // Check component health
      const topologyHealth = this.topologyManager ? Object.keys(this.topologyManager.getAllRegions()).length : 0;
      const loadBalancerHealth = this.loadBalancer ? this.loadBalancer.getLoadBalancerStats().circuitBreakers : {};
      const stateSyncHealth = this.stateSync ? this.stateSync.getSyncStatus() : {};
      const routingHealth = this.routingEngine ? this.routingEngine.getRoutingMetrics() : {};

      const healthStatus = {
        overall: 'healthy',
        components: {
          topology: topologyHealth > 0 ? 'healthy' : 'unhealthy',
          loadBalancer: Object.keys(loadBalancerHealth).length > 0 ? 'healthy' : 'unhealthy',
          stateSync: stateSyncHealth.syncPeers ? stateSyncHealth.syncPeers.length > 0 : false,
          routing: routingHealth.totalRequests >= 0 ? 'healthy' : 'unhealthy'
        },
        checkTime: performance.now() - startTime,
        timestamp: new Date().toISOString()
      };

      // Determine overall health
      const componentHealths = Object.values(healthStatus.components);
      const unhealthyComponents = componentHealths.filter(h => h === 'unhealthy');

      if (unhealthyComponents.length > 0) {
        healthStatus.overall = unhealthyComponents.length === componentHealths.length ? 'unhealthy' : 'degraded';
      }

      this.coordinationStatus.healthy = healthStatus.overall === 'healthy';

      // Publish health status
      await this.publishCoordinationEvent(COORDINATION_EVENTS.SYSTEM_STATUS_UPDATE, {
        health: healthStatus,
        regionId: this.regionId
      });

      console.log(`🏥 System health check completed: ${healthStatus.overall}`);

    } catch (error) {
      console.error('❌ System health check failed:', error.message);
      this.coordinationStatus.healthy = false;
    }
  }

  async performInitialCoordination() {
    console.log('🔄 Performing initial coordination...');

    try {
      // Sync with existing regions
      await this.coordinateWithExistingRegions();

      // Establish coordination state
      await this.establishCoordinationState();

      // Verify system readiness
      await this.verifySystemReadiness();

      console.log('✅ Initial coordination completed');

    } catch (error) {
      console.error('❌ Initial coordination failed:', error.message);
      throw error;
    }
  }

  async coordinateWithExistingRegions() {
    // Discover and coordinate with existing regions
    const existingRegions = await this.discoverExistingRegions();

    for (const region of existingRegions) {
      if (region !== this.regionId) {
        console.log(`🤝 Coordinating with existing region: ${region}`);
        await this.sendCoordinationHandshake(region);
      }
    }
  }

  async discoverExistingRegions() {
    try {
      const heartbeatKeys = await this.redisClient.keys('coordination:heartbeat:*');
      const regions = heartbeatKeys.map(key => key.split(':')[2]).filter(r => r !== this.regionId);
      return regions;
    } catch (error) {
      console.warn('⚠️ Failed to discover existing regions:', error.message);
      return [];
    }
  }

  async sendCoordinationHandshake(targetRegion) {
    const handshake = {
      type: COORDINATION_EVENTS.COORDINATION_REQUEST,
      regionId: this.regionId,
      targetRegion,
      action: 'handshake',
      requestId: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };

    await this.publishCoordinationEvent('coordination_request', handshake);
  }

  async establishCoordinationState() {
    // Store initial coordination state
    const coordinationState = {
      regionId: this.regionId,
      isCoordinator: this.isCoordinator,
      initializedAt: new Date().toISOString(),
      status: this.coordinationStatus,
      components: {
        topology: !!this.topologyManager,
        loadBalancer: !!this.loadBalancer,
        stateSync: !!this.stateSync,
        routingEngine: !!this.routingEngine,
        failoverManager: !!this.failoverManager
      }
    };

    await this.redisClient.setEx(
      `coordination:state:${this.regionId}`,
      3600,
      JSON.stringify(coordinationState)
    );
  }

  async verifySystemReadiness() {
    // Verify all components are ready
    const checks = [
      { name: 'Topology Manager', check: () => this.topologyManager && Object.keys(this.topologyManager.getAllRegions()).length > 0 },
      { name: 'Load Balancer', check: () => this.loadBalancer && Object.keys(this.loadBalancer.getLoadBalancerStats().circuitBreakers).length > 0 },
      { name: 'State Sync', check: () => this.stateSync && this.stateSync.getSyncStatus().regionId === this.regionId },
      { name: 'Routing Engine', check: () => this.routingEngine && this.routingEngine.routingMetrics },
      { name: 'Failover Manager', check: () => this.failoverManager }
    ];

    const results = checks.map(({ name, check }) => {
      try {
        const ready = check();
        console.log(`${ready ? '✅' : '❌'} ${name}: ${ready ? 'Ready' : 'Not Ready'}`);
        return { name, ready };
      } catch (error) {
        console.error(`❌ ${name}: Error - ${error.message}`);
        return { name, ready: false, error: error.message };
      }
    });

    const allReady = results.every(r => r.ready);
    if (!allReady) {
      throw new Error('System readiness verification failed');
    }

    return results;
  }

  shouldCoordinateEvent(eventType) {
    // Determine if an event should be coordinated across regions
    const coordinateEvents = [
      'health_update',
      'failover_request',
      'routing_table_update',
      'conflict_resolution',
      'performance_alert'
    ];

    return coordinateEvents.includes(eventType);
  }

  async publishCoordinationEvent(type, data, global = false) {
    const event = {
      type,
      data,
      regionId: this.regionId,
      global,
      timestamp: new Date().toISOString(),
      eventId: crypto.randomUUID()
    };

    await this.redisPublisher.publish('swarm:phase-2:coordination', JSON.stringify(event));
  }

  recordEvent(event) {
    this.eventHistory.push(event);

    // Keep only recent events
    if (this.eventHistory.length > 1000) {
      this.eventHistory.shift();
    }
  }

  updateSystemMetrics(metricType, data) {
    if (!this.systemMetrics.has(metricType)) {
      this.systemMetrics.set(metricType, []);
    }

    const metrics = this.systemMetrics.get(metricType);
    metrics.push(data);

    // Keep only recent metrics
    if (metrics.length > 100) {
      metrics.shift();
    }
  }

  countActiveRegions() {
    // Count regions with recent heartbeat
    // This is a simplified implementation
    return Object.keys(this.topologyManager?.getAllRegions() || {}).length;
  }

  getSystemStatus() {
    return {
      regionId: this.regionId,
      isCoordinator: this.isCoordinator,
      status: this.coordinationStatus,
      metrics: this.coordinationMetrics,
      components: {
        topology: !!this.topologyManager,
        loadBalancer: !!this.loadBalancer,
        stateSync: !!this.stateSync,
        routingEngine: !!this.routingEngine,
        failoverManager: !!this.failoverManager
      },
      uptime: Date.now() - (this.coordinationStatus.initialized ? this.coordinationStatus.lastCoordinationTime?.getTime() || Date.now() : Date.now())
    };
  }

  async cleanupOldEvents() {
    const cutoffTime = Date.now() - COORDINATOR_CONFIG.eventRetentionTime;

    this.eventHistory = this.eventHistory.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime > cutoffTime;
    });

    // Clean up system metrics
    for (const [metricType, metrics] of this.systemMetrics.entries()) {
      this.systemMetrics.set(metricType, metrics.filter(data => {
        const dataTime = new Date(data.timestamp).getTime();
        return dataTime > cutoffTime;
      }));
    }

    console.log('🧹 Old events and metrics cleaned up');
  }

  async shutdown() {
    console.log(`🔌 Shutting down Multi-Region Coordinator for ${this.regionId}`);

    // Graceful shutdown of components
    if (this.topologyManager) await this.topologyManager.shutdown();
    if (this.loadBalancer) await this.loadBalancer.shutdown();
    if (this.stateSync) await this.stateSync.shutdown();

    // Close Redis connections
    if (this.redisClient) await this.redisClient.quit();
    if (this.redisPublisher) await this.redisPublisher.quit();
    if (this.redisSubscriber) await this.redisSubscriber.quit();

    console.log(`✅ Multi-Region Coordinator shut down for ${this.regionId}`);
  }
}

export { COORDINATOR_CONFIG, COORDINATION_EVENTS };