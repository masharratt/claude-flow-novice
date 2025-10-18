/**
 * Prometheus Metrics Exporter - Sprint 3.3: Prometheus Integration
 *
 * Implements Prometheus metrics collection for blocking coordination observability.
 * Provides 5 core metrics for monitoring coordinator health and performance.
 *
 * Epic: production-blocking-coordination
 * Sprint: 3.3 - Prometheus Integration
 *
 * @module observability/prometheus-metrics
 */

const client = require('prom-client');

// Create a Registry to register metrics
const register = new client.Registry();

// Add default metrics (process metrics like CPU, memory)
client.collectDefaultMetrics({ register });

// ===== METRIC 1: Active Blocking Coordinators (Gauge) =====

const blockingCoordinatorsTotal = new client.Gauge({
  name: 'blocking_coordinators_total',
  help: 'Total number of active blocking coordinators',
  labelNames: ['swarm_id', 'phase', 'status'],
  registers: [register]
});

// ===== METRIC 2: Blocking Duration (Histogram) =====

const blockingDurationSeconds = new client.Histogram({
  name: 'blocking_duration_seconds',
  help: 'Duration of blocking coordination in seconds',
  labelNames: ['swarm_id', 'coordinator_id', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1800], // 1s to 30min
  registers: [register]
});

// ===== METRIC 3: Signal Delivery Latency (Histogram) =====

const signalDeliveryLatencySeconds = new client.Histogram({
  name: 'signal_delivery_latency_seconds',
  help: 'Latency of signal delivery from send to ACK in seconds',
  labelNames: ['sender_id', 'receiver_id', 'signal_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10], // 10ms to 10s
  registers: [register]
});

// ===== METRIC 4: Heartbeat Failures (Counter) =====

const heartbeatFailuresTotal = new client.Counter({
  name: 'heartbeat_failures_total',
  help: 'Total number of heartbeat failures detected',
  labelNames: ['coordinator_id', 'failure_type'], // stale, missing, timeout
  registers: [register]
});

// ===== METRIC 5: Timeout Events (Counter) =====

const timeoutEventsTotal = new client.Counter({
  name: 'timeout_events_total',
  help: 'Total number of timeout events triggered',
  labelNames: ['coordinator_id', 'timeout_type'], // blocking, signal_ack, heartbeat
  registers: [register]
});

// ===== PROMETHEUS METRICS CLASS =====

/**
 * Prometheus Metrics Collector for Blocking Coordination
 */
class PrometheusMetrics {
  constructor({ redis, logger }) {
    this.redis = redis;
    this.logger = logger || console;
  }

  /**
   * Collect metrics from Redis and update Prometheus metrics
   *
   * This method is called by the /metrics endpoint before serving metrics.
   * It queries Redis for current state and updates Prometheus gauges/counters.
   */
  async collectMetrics() {
    try {
      // Get active coordinators from Redis
      const coordinators = await this.getActiveCoordinators();

      // Reset gauge before updating (ensures stale coordinators are removed)
      blockingCoordinatorsTotal.reset();

      // Update gauge for each active coordinator
      for (const coord of coordinators) {
        blockingCoordinatorsTotal
          .labels(coord.swarmId || 'unknown', coord.phase || 'unknown', coord.status || 'active')
          .set(1);
      }

      this.logger.debug('Prometheus metrics collected', {
        activeCoordinators: coordinators.length,
      });
    } catch (error) {
      this.logger.error('Prometheus metrics collection failed', {
        error: error.message,
      });
    }
  }

  /**
   * Record blocking duration
   *
   * @param {string} swarmId - Swarm ID
   * @param {string} coordinatorId - Coordinator ID
   * @param {number} durationMs - Duration in milliseconds
   * @param {string} status - Status (completed, timeout, error)
   */
  recordBlockingDuration(swarmId, coordinatorId, durationMs, status) {
    blockingDurationSeconds
      .labels(swarmId, coordinatorId, status)
      .observe(durationMs / 1000);

    this.logger.debug('Recorded blocking duration', {
      swarmId,
      coordinatorId,
      durationSeconds: (durationMs / 1000).toFixed(2),
      status,
    });
  }

  /**
   * Record signal delivery latency
   *
   * @param {string} senderId - Sender coordinator ID
   * @param {string} receiverId - Receiver coordinator ID
   * @param {string} signalType - Signal type (completion, retry, validation)
   * @param {number} latencyMs - Latency in milliseconds
   */
  recordSignalLatency(senderId, receiverId, signalType, latencyMs) {
    signalDeliveryLatencySeconds
      .labels(senderId, receiverId, signalType)
      .observe(latencyMs / 1000);

    this.logger.debug('Recorded signal latency', {
      senderId,
      receiverId,
      signalType,
      latencySeconds: (latencyMs / 1000).toFixed(3),
    });
  }

  /**
   * Increment heartbeat failure counter
   *
   * @param {string} coordinatorId - Coordinator ID
   * @param {string} failureType - Failure type (stale, missing, timeout)
   */
  incrementHeartbeatFailure(coordinatorId, failureType) {
    heartbeatFailuresTotal.labels(coordinatorId, failureType).inc();

    this.logger.warn('Heartbeat failure recorded', {
      coordinatorId,
      failureType,
    });
  }

  /**
   * Increment timeout event counter
   *
   * @param {string} coordinatorId - Coordinator ID
   * @param {string} timeoutType - Timeout type (blocking, signal_ack, heartbeat)
   */
  incrementTimeoutEvent(coordinatorId, timeoutType) {
    timeoutEventsTotal.labels(coordinatorId, timeoutType).inc();

    this.logger.warn('Timeout event recorded', {
      coordinatorId,
      timeoutType,
    });
  }

  /**
   * Get Prometheus metrics in text format
   *
   * @returns {Promise<string>} Prometheus metrics text
   */
  async getMetrics() {
    // Collect latest metrics from Redis before returning
    await this.collectMetrics();

    // Return metrics in Prometheus text format
    return register.metrics();
  }

  /**
   * Get active coordinators from Redis
   *
   * @returns {Promise<Array>} Active coordinators
   * @private
   */
  async getActiveCoordinators() {
    if (!this.redis) {
      return [];
    }

    const pattern = 'swarm:*:blocking:*';
    const keys = await this.scanKeys(pattern);

    const coordinators = [];
    for (const key of keys) {
      const stateJson = await this.redis.get(key);
      if (stateJson) {
        try {
          const state = JSON.parse(stateJson);
          coordinators.push({
            swarmId: state.swarmId,
            coordinatorId: state.coordinatorId,
            status: state.status,
            duration: Date.now() - state.startTime,
            iteration: state.iteration,
            phase: state.phase
          });
        } catch (parseError) {
          this.logger.warn('Failed to parse coordinator state', {
            key,
            error: parseError.message,
          });
        }
      }
    }

    return coordinators;
  }

  /**
   * Non-blocking Redis SCAN
   *
   * @param {string} pattern - Redis key pattern
   * @returns {Promise<string[]>} Matching keys
   * @private
   */
  async scanKeys(pattern) {
    const keys = [];
    let cursor = '0';

    do {
      const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  resetMetrics() {
    blockingCoordinatorsTotal.reset();
    blockingDurationSeconds.reset();
    signalDeliveryLatencySeconds.reset();
    heartbeatFailuresTotal.reset();
    timeoutEventsTotal.reset();

    this.logger.info('Prometheus metrics reset');
  }
}

// ===== EXPORTS =====

module.exports = {
  PrometheusMetrics,
  register,
  // Export individual metrics for direct instrumentation
  blockingCoordinatorsTotal,
  blockingDurationSeconds,
  signalDeliveryLatencySeconds,
  heartbeatFailuresTotal,
  timeoutEventsTotal,
};
