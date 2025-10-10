/**
 * HealthMonitor - Agent discovery and health monitoring system
 *
 * Features:
 * - Agent health monitoring with 5-second intervals
 * - Automatic failure detection and recovery
 * - Performance metrics tracking
 * - Circuit breaker patterns
 * - Health status reporting
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';

/**
 * Health status levels
 */
const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  FAILED: 'failed',
  RECOVERING: 'recovering'
};

/**
 * Health check configuration
 */
const HEALTH_CONFIG = {
  interval: 5000, // 5 seconds
  timeout: 10000, // 10 seconds
  maxFailures: 3,
  recoveryTimeout: 60000, // 1 minute
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 30000, // 30 seconds
  metricsRetention: 3600000, // 1 hour
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  channels: {
    health: 'swarm:phase-1:health',
    discovery: 'swarm:phase-1:discovery'
  }
};

/**
 * HealthMonitor class
 */
export class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = { ...HEALTH_CONFIG, ...options };
    this.monitorId = `health-monitor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.redis = null;
    this.publisher = null;
    this.isInitialized = false;
    this.isRunning = false;

    this.agents = new Map(); // agentId -> agent health data
    this.healthChecks = new Map(); // agentId -> check interval
    this.circuitBreakers = new Map(); // agentId -> circuit breaker state
    this.metrics = new Map(); // agentId -> performance metrics
    this.discoveryAgents = new Set(); // Set of discovered agents

    this.stats = {
      totalAgents: 0,
      healthyAgents: 0,
      unhealthyAgents: 0,
      failedAgents: 0,
      recoveringAgents: 0,
      averageResponseTime: 0,
      totalChecks: 0,
      totalFailures: 0,
      uptime: 0,
      startTime: null
    };

    this.checkInterval = null;
    this.cleanupInterval = null;
  }

  /**
   * Initialize the health monitor
   */
  async initialize() {
    try {
      this.emit('status', { status: 'initializing', message: 'Initializing Health Monitor' });

      // Initialize Redis connection
      this.redis = createClient(this.config.redis);
      this.publisher = this.redis.duplicate();

      await Promise.all([
        this.redis.connect(),
        this.publisher.connect()
      ]);

      // Load existing health data
      await this.loadHealthData();

      this.isInitialized = true;

      this.emit('status', { status: 'initialized', message: 'Health Monitor initialized' });
      console.log(`🏥 Health Monitor ${this.monitorId} initialized`);

    } catch (error) {
      this.emit('error', { type: 'initialization_failed', error: error.message });
      throw error;
    }
  }

  /**
   * Start health monitoring
   */
  async start() {
    this.ensureInitialized();

    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();

    // Start periodic health checks
    this.checkInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.interval);

    // Start cleanup process
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute

    this.emit('status', { status: 'running', message: 'Health monitoring started' });
    console.log('🏥 Health monitoring started');

    // Perform initial health checks
    await this.performHealthChecks();
  }

  /**
   * Stop health monitoring
   */
  async stop() {
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Stop all agent-specific health checks
    for (const [agentId, interval] of this.healthChecks.entries()) {
      clearInterval(interval);
    }
    this.healthChecks.clear();

    this.emit('status', { status: 'stopped', message: 'Health monitoring stopped' });
    console.log('🏥 Health monitoring stopped');
  }

  /**
   * Register an agent for health monitoring
   */
  async registerAgent(agent) {
    this.ensureInitialized();

    try {
      const agentId = agent.id;
      const healthData = {
        agentId,
        type: agent.type,
        status: HEALTH_STATUS.HEALTHY,
        lastCheck: Date.now(),
        lastHealthy: Date.now(),
        failures: 0,
        consecutiveFailures: 0,
        totalChecks: 0,
        responseTime: 0,
        averageResponseTime: 0,
        circuitBreakerTripped: false,
        circuitBreakerTrippedAt: null,
        recoveryAttempts: 0,
        lastRecoveryAttempt: null,
        metadata: agent.metadata || {},
        discoveredAt: Date.now()
      };

      this.agents.set(agentId, healthData);
      this.discoveryAgents.add(agentId);

      // Start agent-specific health checks
      this.startAgentHealthCheck(agentId);

      // Persist health data
      await this.persistHealthData(agentId, healthData);

      // Announce agent discovery
      await this.publishHealthEvent('agent_discovered', {
        agentId,
        type: agent.type,
        timestamp: Date.now()
      });

      this.emit('agent_registered', { agentId, agent });
      this.updateStats();

      return agentId;
    } catch (error) {
      this.emit('error', { type: 'agent_registration_failed', error: error.message, agentId: agent.id });
      throw error;
    }
  }

  /**
   * Unregister an agent from health monitoring
   */
  async unregisterAgent(agentId) {
    this.ensureInitialized();

    try {
      // Stop agent-specific health checks
      const interval = this.healthChecks.get(agentId);
      if (interval) {
        clearInterval(interval);
        this.healthChecks.delete(agentId);
      }

      // Remove from tracking
      this.agents.delete(agentId);
      this.metrics.delete(agentId);
      this.circuitBreakers.delete(agentId);
      this.discoveryAgents.delete(agentId);

      // Remove from Redis
      await this.redis.del(`health:${agentId}`);

      // Announce agent removal
      await this.publishHealthEvent('agent_removed', {
        agentId,
        timestamp: Date.now()
      });

      this.emit('agent_unregistered', { agentId });
      this.updateStats();

      return true;
    } catch (error) {
      this.emit('error', { type: 'agent_unregistration_failed', error: error.message, agentId });
      throw error;
    }
  }

  /**
   * Update agent health status
   */
  async updateHealthStatus(agentId, status, metadata = {}) {
    this.ensureInitialized();

    try {
      const healthData = this.agents.get(agentId);
      if (!healthData) {
        throw new Error(`Agent ${agentId} not found`);
      }

      const previousStatus = healthData.status;
      healthData.status = status;
      healthData.lastCheck = Date.now();

      if (status === HEALTH_STATUS.HEALTHY) {
        healthData.lastHealthy = Date.now();
        healthData.failures = 0;
        healthData.consecutiveFailures = 0;
        healthData.circuitBreakerTripped = false;
      } else if (status === HEALTH_STATUS.UNHEALTHY || status === HEALTH_STATUS.FAILED) {
        healthData.failures++;
        healthData.consecutiveFailures++;
      }

      // Add metadata
      if (metadata.responseTime) {
        healthData.responseTime = metadata.responseTime;
        healthData.averageResponseTime =
          (healthData.averageResponseTime * (healthData.totalChecks - 1) + metadata.responseTime) /
          healthData.totalChecks;
      }

      // Check circuit breaker
      if (healthData.consecutiveFailures >= this.config.circuitBreakerThreshold) {
        this.tripCircuitBreaker(agentId);
      }

      // Persist health data
      await this.persistHealthData(agentId, healthData);

      // Publish health status change
      await this.publishHealthEvent('health_status_changed', {
        agentId,
        previousStatus,
        currentStatus: status,
        timestamp: Date.now(),
        metadata
      });

      this.emit('health_status_updated', { agentId, status, previousStatus, metadata });
      this.updateStats();

      return true;
    } catch (error) {
      this.emit('error', { type: 'health_update_failed', error: error.message, agentId });
      throw error;
    }
  }

  /**
   * Record agent heartbeat
   */
  async recordHeartbeat(agentId, heartbeatData = {}) {
    this.ensureInitialized();

    try {
      const healthData = this.agents.get(agentId);
      if (!healthData) {
        // Auto-register agent on first heartbeat
        await this.registerAgent({
          id: agentId,
          type: heartbeatData.type || 'unknown',
          metadata: heartbeatData.metadata
        });
        return;
      }

      healthData.lastCheck = Date.now();
      healthData.lastHealthy = Date.now();

      // Update response time if provided
      if (heartbeatData.responseTime) {
        healthData.responseTime = heartbeatData.responseTime;
        healthData.totalChecks++;
        healthData.averageResponseTime =
          (healthData.averageResponseTime * (healthData.totalChecks - 1) + heartbeatData.responseTime) /
          healthData.totalChecks;
      }

      // Reset failure count on successful heartbeat
      if (healthData.status !== HEALTH_STATUS.HEALTHY) {
        await this.updateHealthStatus(agentId, HEALTH_STATUS.HEALTHY);
      }

      // Update metrics
      this.updateAgentMetrics(agentId, heartbeatData);

      // Persist health data
      await this.persistHealthData(agentId, healthData);

      this.emit('heartbeat_received', { agentId, heartbeatData });

      return true;
    } catch (error) {
      this.emit('error', { type: 'heartbeat_failed', error: error.message, agentId });
      throw error;
    }
  }

  /**
   * Get agent health status
   */
  async getAgentHealth(agentId) {
    this.ensureInitialized();

    const healthData = this.agents.get(agentId);
    if (!healthData) {
      return null;
    }

    const agentMetrics = this.metrics.get(agentId) || {};
    const circuitBreaker = this.circuitBreakers.get(agentId);

    return {
      ...healthData,
      metrics: agentMetrics,
      circuitBreaker: {
        tripped: healthData.circuitBreakerTripped,
        trippedAt: healthData.circuitBreakerTrippedAt,
        timeout: this.config.circuitBreakerTimeout
      }
    };
  }

  /**
   * Get health statistics
   */
  getHealthStats() {
    this.updateStats();

    return {
      ...this.stats,
      uptime: this.isRunning ? Date.now() - this.stats.startTime : 0,
      monitoredAgents: this.agents.size,
      circuitBreakersTripped: Array.from(this.agents.values())
        .filter(agent => agent.circuitBreakerTripped).length
    };
  }

  /**
   * Get all monitored agents
   */
  async getMonitoredAgents() {
    const agents = [];
    for (const [agentId, healthData] of this.agents.entries()) {
      agents.push({
        agentId,
        ...healthData,
        metrics: this.metrics.get(agentId) || {}
      });
    }
    return agents;
  }

  /**
   * Perform health checks on all agents
   */
  async performHealthChecks() {
    if (!this.isRunning) {
      return;
    }

    const now = Date.now();
    const timeoutThreshold = now - this.config.timeout;

    for (const [agentId, healthData] of this.agents.entries()) {
      try {
        healthData.totalChecks++;
        this.stats.totalChecks++;

        // Check if agent is overdue for heartbeat
        if (healthData.lastCheck < timeoutThreshold) {
          await this.handleMissedHeartbeat(agentId, healthData);
        } else {
          // Agent is responding normally
          if (healthData.status !== HEALTH_STATUS.HEALTHY && !healthData.circuitBreakerTripped) {
            await this.updateHealthStatus(agentId, HEALTH_STATUS.HEALTHY);
          }
        }
      } catch (error) {
        this.emit('error', { type: 'health_check_failed', error: error.message, agentId });
      }
    }
  }

  /**
   * Handle missed heartbeat
   */
  async handleMissedHeartbeat(agentId, healthData) {
    healthData.consecutiveFailures++;
    healthData.failures++;
    this.stats.totalFailures++;

    let newStatus;
    if (healthData.circuitBreakerTripped) {
      newStatus = HEALTH_STATUS.FAILED;
    } else if (healthData.consecutiveFailures >= this.config.maxFailures) {
      newStatus = HEALTH_STATUS.UNHEALTHY;
      await this.attemptAgentRecovery(agentId);
    } else {
      newStatus = HEALTH_STATUS.DEGRADED;
    }

    await this.updateHealthStatus(agentId, newStatus);

    this.emit('agent_missed_heartbeat', {
      agentId,
      consecutiveFailures: healthData.consecutiveFailures,
      status: newStatus
    });
  }

  /**
   * Attempt agent recovery
   */
  async attemptAgentRecovery(agentId) {
    const healthData = this.agents.get(agentId);
    if (!healthData) {
      return;
    }

    healthData.recoveryAttempts++;
    healthData.lastRecoveryAttempt = Date.now();
    healthData.status = HEALTH_STATUS.RECOVERING;

    await this.persistHealthData(agentId, healthData);

    // Publish recovery request
    await this.publishHealthEvent('agent_recovery_requested', {
      agentId,
      recoveryAttempt: healthData.recoveryAttempts,
      timestamp: Date.now()
    });

    this.emit('agent_recovery_attempted', { agentId, attempt: healthData.recoveryAttempts });

    // Set recovery timeout
    setTimeout(async () => {
      const currentData = this.agents.get(agentId);
      if (currentData && currentData.status === HEALTH_STATUS.RECOVERING) {
        // Recovery failed, mark as failed
        await this.updateHealthStatus(agentId, HEALTH_STATUS.FAILED);
        this.tripCircuitBreaker(agentId);
      }
    }, this.config.recoveryTimeout);
  }

  /**
   * Trip circuit breaker for an agent
   */
  tripCircuitBreaker(agentId) {
    const healthData = this.agents.get(agentId);
    if (!healthData) {
      return;
    }

    healthData.circuitBreakerTripped = true;
    healthData.circuitBreakerTrippedAt = Date.now();
    healthData.status = HEALTH_STATUS.FAILED;

    this.circuitBreakers.set(agentId, {
      trippedAt: Date.now(),
      timeout: this.config.circuitBreakerTimeout
    });

    this.emit('circuit_breaker_tripped', { agentId });

    // Schedule circuit breaker reset
    setTimeout(() => {
      this.resetCircuitBreaker(agentId);
    }, this.config.circuitBreakerTimeout);
  }

  /**
   * Reset circuit breaker for an agent
   */
  async resetCircuitBreaker(agentId) {
    const healthData = this.agents.get(agentId);
    if (!healthData) {
      return;
    }

    healthData.circuitBreakerTripped = false;
    healthData.circuitBreakerTrippedAt = null;
    healthData.status = HEALTH_STATUS.RECOVERING;
    healthData.consecutiveFailures = 0;

    this.circuitBreakers.delete(agentId);

    await this.persistHealthData(agentId, healthData);

    this.emit('circuit_breaker_reset', { agentId });
  }

  /**
   * Start agent-specific health check
   */
  startAgentHealthCheck(agentId) {
    const interval = setInterval(async () => {
      try {
        const healthData = this.agents.get(agentId);
        if (!healthData || healthData.circuitBreakerTripped) {
          return;
        }

        // Perform agent-specific health check
        await this.performAgentHealthCheck(agentId);
      } catch (error) {
        this.emit('error', { type: 'agent_health_check_failed', error: error.message, agentId });
      }
    }, this.config.interval);

    this.healthChecks.set(agentId, interval);
  }

  /**
   * Perform agent-specific health check
   */
  async performAgentHealthCheck(agentId) {
    // This would typically involve:
    // 1. Sending a ping/health check request to the agent
    // 2. Measuring response time
    // 3. Verifying agent functionality
    // 4. Recording metrics

    // For now, we'll simulate a health check
    const startTime = Date.now();

    // Simulate health check latency
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

    const responseTime = Date.now() - startTime;

    // Record successful health check
    await this.recordHeartbeat(agentId, {
      responseTime,
      checkType: 'periodic',
      timestamp: Date.now()
    });
  }

  /**
   * Update agent metrics
   */
  updateAgentMetrics(agentId, heartbeatData) {
    const agentMetrics = this.metrics.get(agentId) || {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastUpdated: Date.now(),
      customMetrics: {}
    };

    agentMetrics.totalRequests++;
    agentMetrics.lastUpdated = Date.now();

    if (heartbeatData.responseTime) {
      agentMetrics.averageResponseTime =
        (agentMetrics.averageResponseTime * (agentMetrics.totalRequests - 1) + heartbeatData.responseTime) /
        agentMetrics.totalRequests;
    }

    // Add custom metrics
    if (heartbeatData.metrics) {
      Object.assign(agentMetrics.customMetrics, heartbeatData.metrics);
    }

    this.metrics.set(agentId, agentMetrics);
  }

  /**
   * Update overall statistics
   */
  updateStats() {
    this.stats.totalAgents = this.agents.size;
    this.stats.healthyAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === HEALTH_STATUS.HEALTHY).length;
    this.stats.unhealthyAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === HEALTH_STATUS.UNHEALTHY).length;
    this.stats.failedAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === HEALTH_STATUS.FAILED).length;
    this.stats.recoveringAgents = Array.from(this.agents.values())
      .filter(agent => agent.status === HEALTH_STATUS.RECOVERING).length;

    // Calculate average response time
    const responseTimes = Array.from(this.agents.values())
      .map(agent => agent.averageResponseTime)
      .filter(time => time > 0);

    if (responseTimes.length > 0) {
      this.stats.averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    }
  }

  /**
   * Cleanup old data
   */
  cleanup() {
    const now = Date.now();
    const cutoffTime = now - this.config.metricsRetention;

    // Clean up old metrics
    for (const [agentId, metrics] of this.metrics.entries()) {
      if (metrics.lastUpdated < cutoffTime) {
        this.metrics.delete(agentId);
      }
    }

    // Remove agents that haven't been seen for a very long time
    for (const [agentId, healthData] of this.agents.entries()) {
      if (healthData.lastCheck < cutoffTime) {
        this.unregisterAgent(agentId);
      }
    }

    this.emit('cleanup_completed');
  }

  /**
   * Close the health monitor
   */
  async close() {
    await this.stop();

    if (this.publisher) {
      await this.publisher.quit();
    }

    if (this.redis) {
      await this.redis.quit();
    }

    this.agents.clear();
    this.metrics.clear();
    this.circuitBreakers.clear();
    this.discoveryAgents.clear();

    this.isInitialized = false;

    this.emit('status', { status: 'closed', message: 'Health Monitor closed' });
    console.log('🏥 Health Monitor closed');
  }

  /**
   * Private helper methods
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('HealthMonitor is not initialized. Call initialize() first.');
    }
  }

  async loadHealthData() {
    try {
      const keys = await this.redis.keys('health:*');
      for (const key of keys) {
        const healthData = await this.redis.hGetAll(key);
        if (Object.keys(healthData).length > 0) {
          const agentId = key.replace('health:', '');
          const reconstructedData = this.reconstructObject(healthData);
          this.agents.set(agentId, reconstructedData);
          this.discoveryAgents.add(agentId);
        }
      }
    } catch (error) {
      console.warn('Failed to load health data from Redis:', error.message);
    }
  }

  async persistHealthData(agentId, healthData) {
    const key = `health:${agentId}`;
    await this.redis.hSet(key, this.flattenObject(healthData));
    await this.redis.expire(key, this.config.metricsRetention / 1000);
  }

  async publishHealthEvent(eventType, data) {
    if (this.publisher) {
      await this.publisher.publish(
        this.config.channels.health,
        JSON.stringify({
          type: eventType,
          ...data,
          monitorId: this.monitorId,
          timestamp: Date.now()
        })
      );
    }
  }

  flattenObject(obj, prefix = '') {
    const flattened = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = JSON.stringify(value);
      }
    }

    return flattened;
  }

  reconstructObject(flatObj) {
    const obj = {};

    for (const [key, value] of Object.entries(flatObj)) {
      const keys = key.split('.');
      let current = obj;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      // Parse JSON values
      try {
        current[keys[keys.length - 1]] = JSON.parse(value);
      } catch {
        current[keys[keys.length - 1]] = value;
      }
    }

    return obj;
  }
}

export default HealthMonitor;