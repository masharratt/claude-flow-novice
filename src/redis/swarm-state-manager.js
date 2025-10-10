/**
 * SwarmStateManager - Swarm State Persistence and Recovery
 * Phase 2: Fleet Manager Features & Advanced Capabilities
 *
 * Handles:
 * - State persistence with 24-hour TTL
 * - Automatic recovery from interruptions
 * - State snapshots and rollback
 * - Connection pool management
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

class SwarmStateManager extends EventEmitter {
  constructor(redisConfig = {}) {
    super();

    // Create connection pool for better performance
    this.redis = new Redis({
      host: redisConfig.host || 'localhost',
      port: redisConfig.port || 6379,
      db: redisConfig.db || 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      lazyConnect: false,
    });

    // Configuration
    this.config = {
      stateTTL: 86400, // 24 hours
      snapshotInterval: 300000, // 5 minutes
      maxSnapshots: 10, // Keep last 10 snapshots
      recoveryTimeout: 30000, // 30 seconds
      statePrefix: 'swarm:state:',
      snapshotPrefix: 'swarm:snapshot:',
      checkpointPrefix: 'swarm:checkpoint:',
      ...redisConfig,
    };

    // State cache for performance
    this.stateCache = new Map();
    this.snapshotTimers = new Map();

    // Statistics
    this.stats = {
      statesSaved: 0,
      statesLoaded: 0,
      snapshotsCreated: 0,
      recoveriesPerformed: 0,
      errors: 0,
    };

    this.initialized = false;
  }

  /**
   * Initialize state manager
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      await this.redis.ping();
      console.log('✅ SwarmStateManager: Redis connection established');

      // Load statistics
      await this.loadStatistics();

      this.initialized = true;
      console.log('🚀 SwarmStateManager initialized');

      this.emit('initialized');
    } catch (error) {
      console.error('❌ SwarmStateManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Save swarm state with TTL
   */
  async saveState(swarmId, state) {
    this.ensureInitialized();

    try {
      const stateKey = this.getStateKey(swarmId);
      const timestamp = Date.now();

      // Add metadata
      const stateWithMeta = {
        ...state,
        swarmId,
        savedAt: timestamp,
        version: state.version || 1,
      };

      // Serialize and save
      const serialized = JSON.stringify(stateWithMeta);
      await this.redis.setex(stateKey, this.config.stateTTL, serialized);

      // Update cache
      this.stateCache.set(swarmId, stateWithMeta);

      // Update statistics
      this.stats.statesSaved++;

      console.log(`💾 State saved for swarm ${swarmId} (version ${stateWithMeta.version})`);
      this.emit('state_saved', { swarmId, timestamp });

      return true;
    } catch (error) {
      console.error(`❌ Failed to save state for swarm ${swarmId}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Load swarm state
   */
  async loadState(swarmId) {
    this.ensureInitialized();

    try {
      // Check cache first
      if (this.stateCache.has(swarmId)) {
        const cached = this.stateCache.get(swarmId);
        const age = Date.now() - cached.savedAt;

        // Return cached if less than 5 seconds old
        if (age < 5000) {
          return cached;
        }
      }

      // Load from Redis
      const stateKey = this.getStateKey(swarmId);
      const serialized = await this.redis.get(stateKey);

      if (!serialized) {
        console.log(`⚠️ No state found for swarm ${swarmId}`);
        return null;
      }

      const state = JSON.parse(serialized);

      // Update cache
      this.stateCache.set(swarmId, state);

      // Update statistics
      this.stats.statesLoaded++;

      console.log(`📂 State loaded for swarm ${swarmId} (version ${state.version || 1})`);
      this.emit('state_loaded', { swarmId, state });

      return state;
    } catch (error) {
      console.error(`❌ Failed to load state for swarm ${swarmId}:`, error);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Update swarm state (partial update)
   */
  async updateState(swarmId, updates) {
    this.ensureInitialized();

    try {
      // Load current state
      const currentState = await this.loadState(swarmId);

      if (!currentState) {
        throw new Error(`No state found for swarm ${swarmId}`);
      }

      // Merge updates
      const updatedState = {
        ...currentState,
        ...updates,
        updatedAt: Date.now(),
        version: (currentState.version || 1) + 1,
      };

      // Save updated state
      await this.saveState(swarmId, updatedState);

      console.log(`🔄 State updated for swarm ${swarmId} (v${currentState.version} → v${updatedState.version})`);
      this.emit('state_updated', { swarmId, updates, version: updatedState.version });

      return updatedState;
    } catch (error) {
      console.error(`❌ Failed to update state for swarm ${swarmId}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Create snapshot of current state
   */
  async createSnapshot(swarmId, label = '') {
    this.ensureInitialized();

    try {
      const state = await this.loadState(swarmId);

      if (!state) {
        throw new Error(`No state found for swarm ${swarmId}`);
      }

      const snapshotId = this.generateSnapshotId();
      const snapshotKey = this.getSnapshotKey(swarmId, snapshotId);

      const snapshot = {
        id: snapshotId,
        swarmId,
        label,
        state,
        createdAt: Date.now(),
      };

      // Save snapshot
      await this.redis.setex(
        snapshotKey,
        this.config.stateTTL,
        JSON.stringify(snapshot)
      );

      // Add to snapshot index
      await this.redis.zadd(
        `${this.config.snapshotPrefix}${swarmId}:index`,
        Date.now(),
        snapshotId
      );

      // Cleanup old snapshots
      await this.cleanupOldSnapshots(swarmId);

      this.stats.snapshotsCreated++;

      console.log(`📸 Snapshot created for swarm ${swarmId}: ${snapshotId} (${label})`);
      this.emit('snapshot_created', { swarmId, snapshotId, label });

      return snapshotId;
    } catch (error) {
      console.error(`❌ Failed to create snapshot for swarm ${swarmId}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Restore from snapshot
   */
  async restoreFromSnapshot(swarmId, snapshotId) {
    this.ensureInitialized();

    try {
      const snapshotKey = this.getSnapshotKey(swarmId, snapshotId);
      const serialized = await this.redis.get(snapshotKey);

      if (!serialized) {
        throw new Error(`Snapshot ${snapshotId} not found for swarm ${swarmId}`);
      }

      const snapshot = JSON.parse(serialized);

      // Restore state
      await this.saveState(swarmId, {
        ...snapshot.state,
        restoredFrom: snapshotId,
        restoredAt: Date.now(),
      });

      console.log(`🔄 State restored from snapshot ${snapshotId} for swarm ${swarmId}`);
      this.emit('state_restored', { swarmId, snapshotId });

      return snapshot.state;
    } catch (error) {
      console.error(`❌ Failed to restore from snapshot for swarm ${swarmId}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * List snapshots for swarm
   */
  async listSnapshots(swarmId) {
    try {
      const indexKey = `${this.config.snapshotPrefix}${swarmId}:index`;
      const snapshotIds = await this.redis.zrange(indexKey, 0, -1);

      const snapshots = await Promise.all(
        snapshotIds.map(async (id) => {
          const key = this.getSnapshotKey(swarmId, id);
          const data = await this.redis.get(key);
          return data ? JSON.parse(data) : null;
        })
      );

      return snapshots.filter(s => s !== null);
    } catch (error) {
      console.error(`❌ Failed to list snapshots for swarm ${swarmId}:`, error);
      return [];
    }
  }

  /**
   * Cleanup old snapshots
   */
  async cleanupOldSnapshots(swarmId) {
    try {
      const indexKey = `${this.config.snapshotPrefix}${swarmId}:index`;
      const count = await this.redis.zcard(indexKey);

      if (count > this.config.maxSnapshots) {
        // Remove oldest snapshots
        const toRemove = count - this.config.maxSnapshots;
        const oldestIds = await this.redis.zrange(indexKey, 0, toRemove - 1);

        for (const id of oldestIds) {
          const key = this.getSnapshotKey(swarmId, id);
          await this.redis.del(key);
        }

        await this.redis.zremrangebyrank(indexKey, 0, toRemove - 1);

        console.log(`🧹 Cleaned up ${toRemove} old snapshots for swarm ${swarmId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to cleanup snapshots for swarm ${swarmId}:`, error);
    }
  }

  /**
   * Create checkpoint for recovery
   */
  async createCheckpoint(swarmId, checkpointData) {
    try {
      const checkpointId = this.generateCheckpointId();
      const checkpointKey = `${this.config.checkpointPrefix}${swarmId}:${checkpointId}`;

      const checkpoint = {
        id: checkpointId,
        swarmId,
        timestamp: Date.now(),
        data: checkpointData,
      };

      await this.redis.setex(
        checkpointKey,
        this.config.stateTTL,
        JSON.stringify(checkpoint)
      );

      // Add to checkpoint index
      await this.redis.zadd(
        `${this.config.checkpointPrefix}${swarmId}:index`,
        Date.now(),
        checkpointId
      );

      console.log(`✅ Checkpoint created for swarm ${swarmId}: ${checkpointId}`);
      this.emit('checkpoint_created', { swarmId, checkpointId });

      return checkpointId;
    } catch (error) {
      console.error(`❌ Failed to create checkpoint for swarm ${swarmId}:`, error);
      throw error;
    }
  }

  /**
   * Get latest checkpoint
   */
  async getLatestCheckpoint(swarmId) {
    try {
      const indexKey = `${this.config.checkpointPrefix}${swarmId}:index`;
      const latestIds = await this.redis.zrange(indexKey, -1, -1);

      if (latestIds.length === 0) {
        return null;
      }

      const checkpointKey = `${this.config.checkpointPrefix}${swarmId}:${latestIds[0]}`;
      const data = await this.redis.get(checkpointKey);

      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`❌ Failed to get latest checkpoint for swarm ${swarmId}:`, error);
      return null;
    }
  }

  /**
   * Recover swarm from last known state
   */
  async recoverSwarm(swarmId) {
    this.ensureInitialized();

    try {
      console.log(`🔄 Starting recovery for swarm ${swarmId}...`);

      // Try to load current state
      let state = await this.loadState(swarmId);

      if (!state) {
        // Try latest checkpoint
        const checkpoint = await this.getLatestCheckpoint(swarmId);
        if (checkpoint) {
          console.log(`📋 Using checkpoint for recovery: ${checkpoint.id}`);
          state = checkpoint.data;
        }
      }

      if (!state) {
        // Try latest snapshot
        const snapshots = await this.listSnapshots(swarmId);
        if (snapshots.length > 0) {
          const latest = snapshots[snapshots.length - 1];
          console.log(`📸 Using snapshot for recovery: ${latest.id}`);
          state = latest.state;
        }
      }

      if (!state) {
        throw new Error(`No recoverable state found for swarm ${swarmId}`);
      }

      // Analyze recovery state
      const recoveryPlan = this.createRecoveryPlan(state);

      // Update state to indicate recovery
      const recoveredState = {
        ...state,
        status: 'recovering',
        recoveredAt: Date.now(),
        recoveryPlan,
        previousStatus: state.status,
      };

      await this.saveState(swarmId, recoveredState);

      this.stats.recoveriesPerformed++;

      console.log(`✅ Swarm ${swarmId} recovery initiated`);
      console.log(`   Previous status: ${state.status}`);
      console.log(`   Recovery plan: ${JSON.stringify(recoveryPlan, null, 2)}`);

      this.emit('swarm_recovered', {
        swarmId,
        previousStatus: state.status,
        recoveryPlan,
      });

      return {
        success: true,
        swarmId,
        state: recoveredState,
        recoveryPlan,
      };
    } catch (error) {
      console.error(`❌ Recovery failed for swarm ${swarmId}:`, error);
      this.stats.errors++;

      this.emit('recovery_failed', { swarmId, error: error.message });

      return {
        success: false,
        swarmId,
        error: error.message,
      };
    }
  }

  /**
   * Create recovery plan based on state
   */
  createRecoveryPlan(state) {
    const completedTasks = (state.tasks || []).filter(t => t.status === 'completed');
    const inProgressTasks = (state.tasks || []).filter(t => t.status === 'in_progress');
    const pendingTasks = (state.tasks || []).filter(t => t.status === 'pending');

    const progress = state.tasks?.length > 0
      ? completedTasks.length / state.tasks.length
      : 0;

    return {
      resumeFrom: inProgressTasks.length > 0 ? 'in_progress' : 'pending',
      completedTasks: completedTasks.length,
      inProgressTasks: inProgressTasks.length,
      pendingTasks: pendingTasks.length,
      progress: Math.round(progress * 100) / 100,
      nextActions: [
        inProgressTasks.length > 0 && 'Resume in-progress tasks',
        pendingTasks.length > 0 && 'Process pending tasks',
        'Re-establish agent communication',
        'Verify system state',
      ].filter(Boolean),
      estimatedTime: this.estimateRecoveryTime(state),
      confidence: this.calculateRecoveryConfidence(state),
    };
  }

  /**
   * Estimate recovery time
   */
  estimateRecoveryTime(state) {
    const tasksRemaining = (state.tasks || []).filter(
      t => t.status !== 'completed'
    ).length;

    const avgTaskTime = 30; // seconds (estimate)
    const estimatedSeconds = tasksRemaining * avgTaskTime;

    if (estimatedSeconds < 60) {
      return `${estimatedSeconds} seconds`;
    } else if (estimatedSeconds < 3600) {
      return `${Math.round(estimatedSeconds / 60)} minutes`;
    } else {
      return `${Math.round(estimatedSeconds / 3600)} hours`;
    }
  }

  /**
   * Calculate recovery confidence
   */
  calculateRecoveryConfidence(state) {
    let confidence = 0.5; // Base confidence

    // Increase if we have recent state
    const stateAge = Date.now() - (state.savedAt || 0);
    if (stateAge < 60000) {
      confidence += 0.3; // Very recent
    } else if (stateAge < 300000) {
      confidence += 0.2; // Recent
    }

    // Increase if tasks are well-defined
    if (state.tasks && state.tasks.length > 0) {
      confidence += 0.1;
    }

    // Increase if agents are tracked
    if (state.agents && state.agents.length > 0) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * Start automatic snapshots for swarm
   */
  startAutomaticSnapshots(swarmId) {
    if (this.snapshotTimers.has(swarmId)) {
      return; // Already running
    }

    const timer = setInterval(async () => {
      try {
        await this.createSnapshot(swarmId, 'automatic');
      } catch (error) {
        console.error(`❌ Automatic snapshot failed for swarm ${swarmId}:`, error);
      }
    }, this.config.snapshotInterval);

    this.snapshotTimers.set(swarmId, timer);

    console.log(`⏰ Automatic snapshots started for swarm ${swarmId} (every ${this.config.snapshotInterval / 1000}s)`);
  }

  /**
   * Stop automatic snapshots
   */
  stopAutomaticSnapshots(swarmId) {
    if (this.snapshotTimers.has(swarmId)) {
      clearInterval(this.snapshotTimers.get(swarmId));
      this.snapshotTimers.delete(swarmId);
      console.log(`⏰ Automatic snapshots stopped for swarm ${swarmId}`);
    }
  }

  /**
   * Delete swarm state
   */
  async deleteState(swarmId) {
    try {
      const stateKey = this.getStateKey(swarmId);
      await this.redis.del(stateKey);

      // Remove from cache
      this.stateCache.delete(swarmId);

      // Stop automatic snapshots
      this.stopAutomaticSnapshots(swarmId);

      console.log(`🗑️ State deleted for swarm ${swarmId}`);
      this.emit('state_deleted', { swarmId });
    } catch (error) {
      console.error(`❌ Failed to delete state for swarm ${swarmId}:`, error);
    }
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    return {
      ...this.stats,
      cacheSize: this.stateCache.size,
      activeSnapshotTimers: this.snapshotTimers.size,
    };
  }

  /**
   * Load statistics from Redis
   */
  async loadStatistics() {
    try {
      const statsKey = 'swarm:state:manager:stats';
      const data = await this.redis.get(statsKey);

      if (data) {
        this.stats = { ...this.stats, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('❌ Failed to load statistics:', error);
    }
  }

  /**
   * Save statistics to Redis
   */
  async saveStatistics() {
    try {
      const statsKey = 'swarm:state:manager:stats';
      await this.redis.setex(statsKey, 86400, JSON.stringify(this.stats));
    } catch (error) {
      console.error('❌ Failed to save statistics:', error);
    }
  }

  /**
   * Utility methods
   */
  getStateKey(swarmId) {
    return `${this.config.statePrefix}${swarmId}`;
  }

  getSnapshotKey(swarmId, snapshotId) {
    return `${this.config.snapshotPrefix}${swarmId}:${snapshotId}`;
  }

  generateSnapshotId() {
    return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCheckpointId() {
    return `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('SwarmStateManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down SwarmStateManager...');

    // Stop all snapshot timers
    for (const [swarmId, timer] of this.snapshotTimers.entries()) {
      clearInterval(timer);
      console.log(`⏰ Stopped snapshots for swarm ${swarmId}`);
    }
    this.snapshotTimers.clear();

    // Save statistics
    await this.saveStatistics();

    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }

    this.initialized = false;
    console.log('✅ SwarmStateManager shutdown complete');
  }
}

module.exports = SwarmStateManager;
