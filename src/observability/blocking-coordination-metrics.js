/**
 * Blocking Coordination Metrics Collector
 * Gathers real-time metrics from Redis for observability dashboard
 */
class BlockingCoordinationMetrics {
  constructor({ redis, logger }) {
    this.redis = redis;
    this.logger = logger || console;
  }

  /**
   * Get count of active blocking coordinators
   * @returns {Promise<number>}
   */
  async getActiveCoordinatorsCount() {
    const pattern = 'swarm:*:blocking:*';
    const keys = await this.scanKeys(pattern);
    return keys.length;
  }

  /**
   * Get active blocking coordinators with details
   * @returns {Promise<Array>}
   */
  async getActiveCoordinators() {
    const pattern = 'swarm:*:blocking:*';
    const keys = await this.scanKeys(pattern);

    const coordinators = [];
    for (const key of keys) {
      const stateJson = await this.redis.get(key);
      if (stateJson) {
        const state = JSON.parse(stateJson);
        coordinators.push({
          swarmId: state.swarmId,
          coordinatorId: state.coordinatorId,
          status: state.status,
          duration: Date.now() - state.startTime,
          iteration: state.iteration,
          phase: state.phase
        });
      }
    }

    return coordinators;
  }

  /**
   * Calculate average blocking duration
   * @returns {Promise<number>} Average duration in ms
   */
  async getAverageBlockingDuration() {
    const coordinators = await this.getActiveCoordinators();
    if (coordinators.length === 0) return 0;

    const totalDuration = coordinators.reduce((sum, c) => sum + c.duration, 0);
    return Math.round(totalDuration / coordinators.length);
  }

  /**
   * Get heartbeat status for all coordinators
   * @returns {Promise<Array>}
   */
  async getHeartbeatStatus() {
    const pattern = 'blocking:heartbeat:*';
    const keys = await this.scanKeys(pattern);

    const heartbeats = [];
    const now = Date.now();

    for (const key of keys) {
      const hbJson = await this.redis.get(key);
      if (hbJson) {
        const hb = JSON.parse(hbJson);
        const age = now - hb.lastHeartbeat;

        heartbeats.push({
          coordinatorId: hb.coordinatorId,
          lastHeartbeat: hb.lastHeartbeat,
          age: age,
          status: age > 120000 ? 'stale' : age > 60000 ? 'warning' : 'healthy',
          iteration: hb.iteration
        });
      }
    }

    return heartbeats;
  }

  /**
   * Get timeout events count
   * @returns {Promise<number>}
   */
  async getTimeoutEventsCount() {
    // Get from coordinator timeout handler metrics or Redis counter
    const timeouts = await this.redis.get('metrics:timeout_events_total') || '0';
    return parseInt(timeouts, 10);
  }

  /**
   * Get signal delivery latency histogram
   * @returns {Promise<Object>}
   */
  async getSignalDeliveryLatency() {
    // Placeholder for latency tracking
    // In production, this would aggregate latency data from signal delivery logs
    return {
      p50: 100,  // median 100ms
      p95: 500,  // 95th percentile 500ms
      p99: 1000, // 99th percentile 1s
      max: 2000  // max 2s
    };
  }

  /**
   * Get comprehensive dashboard metrics
   * @returns {Promise<Object>}
   */
  async getDashboardMetrics() {
    const [
      activeCount,
      coordinators,
      avgDuration,
      heartbeats,
      timeouts
    ] = await Promise.all([
      this.getActiveCoordinatorsCount(),
      this.getActiveCoordinators(),
      this.getAverageBlockingDuration(),
      this.getHeartbeatStatus(),
      this.getTimeoutEventsCount()
    ]);

    return {
      activeCoordinators: activeCount,
      coordinatorDetails: coordinators,
      averageBlockingDuration: avgDuration,
      heartbeatStatus: heartbeats,
      timeoutEvents: timeouts,
      timestamp: Date.now()
    };
  }

  /**
   * Non-blocking Redis SCAN
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
}

module.exports = { BlockingCoordinationMetrics };
