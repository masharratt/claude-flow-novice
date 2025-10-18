/**
 * State Synchronization for Multi-Region Coordination
 *
 * Implements eventual consistency across regions with conflict resolution
 * Supports distributed state management and synchronization protocols
 */

import { createClient } from 'redis';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import EventEmitter from 'events';

// Synchronization configuration
const SYNC_CONFIG = {
  heartbeatInterval: 15000, // 15 seconds
  syncTimeout: 30000, // 30 seconds
  maxRetries: 3,
  batchSize: 100,
  compressionThreshold: 1024, // bytes
  conflictResolution: 'last-write-wins', // or 'vector-clock', 'merge'
  consistencyLevel: 'eventual', // or 'strong', 'causal'
  replicationFactor: 2, // Number of regions to replicate to
  ackTimeout: 5000 // 5 seconds for acknowledgments
};

// Synchronization operation types
const SYNC_OPERATIONS = {
  STATE_UPDATE: 'state_update',
  STATE_SYNC: 'state_sync',
  CONFLICT_RESOLUTION: 'conflict_resolution',
  HEARTBEAT: 'heartbeat',
  ACKNOWLEDGMENT: 'acknowledgment',
  REPLICATION: 'replication',
  RECOVERY: 'recovery'
};

// Vector Clock implementation for conflict resolution
class VectorClock {
  constructor(regionId) {
    this.clock = {};
    this.regionId = regionId;
  }

  increment() {
    this.clock[this.regionId] = (this.clock[this.regionId] || 0) + 1;
    return { ...this.clock };
  }

  update(otherClock) {
    Object.keys(otherClock).forEach(region => {
      this.clock[region] = Math.max(this.clock[region] || 0, otherClock[region]);
    });
  }

  compare(otherClock) {
    const thisKeys = new Set(Object.keys(this.clock));
    const otherKeys = new Set(Object.keys(otherClock));
    const allKeys = new Set([...thisKeys, ...otherKeys]);

    let thisGreater = false;
    let otherGreater = false;

    for (const key of allKeys) {
      const thisVal = this.clock[key] || 0;
      const otherVal = otherClock[key] || 0;

      if (thisVal > otherVal) thisGreater = true;
      if (otherVal > thisVal) otherGreater = true;
    }

    if (thisGreater && !otherGreater) return 1;
    if (otherGreater && !thisGreater) return -1;
    if (thisGreater && otherGreater) return 0; // Conflict
    return 0; // Equal
  }

  toString() {
    return JSON.stringify(this.clock);
  }

  static fromString(str) {
    const clock = new VectorClock();
    clock.clock = JSON.parse(str);
    return clock;
  }
}

/**
 * State Synchronization Manager
 * Handles cross-region state synchronization with eventual consistency
 */
export class StateSynchronization extends EventEmitter {
  constructor(redisConfig, regionId) {
    super();
    this.redis = redisConfig;
    this.regionId = regionId;
    this.vectorClock = new VectorClock(regionId);
    this.pendingUpdates = new Map();
    this.conflictLog = [];
    this.syncPeers = new Set();
    this.lastSyncTimes = new Map();
    this.replicationLog = [];
    this.acknowledgments = new Map();

    this.stateStore = new Map();
    this.committedState = new Map();
    this.stateVersions = new Map();
  }

  async initialize() {
    console.log(`🔄 Initializing State Synchronization for region: ${this.regionId}`);

    // Connect to Redis
    this.redisClient = createClient(this.redis);
    await this.redisClient.connect();

    // Subscribe to synchronization events
    await this.redisClient.subscribe('swarm:phase-2:sync', (message) => {
      this.handleSyncEvent(JSON.parse(message));
    });

    // Subscribe to region-specific events
    await this.redisClient.subscribe(`swarm:phase-2:sync:${this.regionId}`, (message) => {
      this.handleRegionSyncEvent(JSON.parse(message));
    });

    // Start heartbeat
    this.startHeartbeat();

    // Load initial state
    await this.loadInitialState();

    // Start synchronization processes
    this.startSynchronizationProcesses();

    console.log(`✅ State Synchronization initialized for ${this.regionId}`);
    this.emit('initialized', { regionId: this.regionId });
  }

  async loadInitialState() {
    try {
      const stateKeys = await this.redisClient.keys('sync:state:*');

      for (const key of stateKeys) {
        const stateData = await this.redisClient.get(key);
        if (stateData) {
          const parsed = JSON.parse(stateData);
          this.stateStore.set(parsed.key, parsed);
          this.committedState.set(parsed.key, parsed.value);
          this.stateVersions.set(parsed.key, parsed.version);
        }
      }

      console.log(`📚 Loaded ${stateKeys.length} state entries`);
    } catch (error) {
      console.warn('⚠️ Failed to load initial state:', error.message);
    }
  }

  startHeartbeat() {
    setInterval(async () => {
      await this.sendHeartbeat();
    }, SYNC_CONFIG.heartbeatInterval);

    console.log('❤️ State synchronization heartbeat started');
  }

  startSynchronizationProcesses() {
    // Periodic state synchronization
    setInterval(async () => {
      await this.performStateSynchronization();
    }, 60000); // Every minute

    // Conflict resolution process
    setInterval(async () => {
      await this.resolveConflicts();
    }, 30000); // Every 30 seconds

    // Cleanup old entries
    setInterval(async () => {
      await this.cleanup();
    }, 300000); // Every 5 minutes
  }

  async sendHeartbeat() {
    const heartbeat = {
      type: SYNC_OPERATIONS.HEARTBEAT,
      regionId: this.regionId,
      timestamp: new Date().toISOString(),
      vectorClock: this.vectorClock.clock,
      state: {
        pendingUpdates: this.pendingUpdates.size,
        conflictLog: this.conflictLog.length,
        syncPeers: this.syncPeers.size
      },
      messageId: crypto.randomUUID()
    };

    await this.redisClient.publish('swarm:phase-2:sync', JSON.stringify(heartbeat));
    await this.redisClient.setEx(`sync:heartbeat:${this.regionId}`, 60, JSON.stringify(heartbeat));
  }

  async handleSyncEvent(event) {
    const { type, regionId, data, messageId } = event;

    if (regionId === this.regionId) return; // Ignore own events

    console.log(`📡 Sync event: ${type} from ${regionId}`);

    switch (type) {
      case SYNC_OPERATIONS.HEARTBEAT:
        await this.handleRemoteHeartbeat(regionId, data);
        break;
      case SYNC_OPERATIONS.STATE_UPDATE:
        await this.handleStateUpdate(regionId, data, messageId);
        break;
      case SYNC_OPERATIONS.STATE_SYNC:
        await this.handleStateSync(regionId, data, messageId);
        break;
      case SYNC_OPERATIONS.REPLICATION:
        await this.handleReplication(regionId, data, messageId);
        break;
      case SYNC_OPERATIONS.ACKNOWLEDGMENT:
        await this.handleAcknowledgment(regionId, data, messageId);
        break;
    }
  }

  async handleRegionSyncEvent(event) {
    // Handle region-specific sync events
    console.log(`🎯 Region-specific sync event: ${event.type}`);
    this.emit('region_sync_event', event);
  }

  async handleRemoteHeartbeat(regionId, data) {
    this.syncPeers.add(regionId);
    this.lastSyncTimes.set(regionId, new Date());

    // Update vector clock if remote clock is newer
    this.vectorClock.update(data.vectorClock);

    console.log(`💓 Heartbeat from ${regionId} - peers: ${this.syncPeers.size}`);
  }

  async updateState(key, value, metadata = {}) {
    const timestamp = new Date().toISOString();
    const version = this.vectorClock.increment();
    const stateEntry = {
      key,
      value,
      version,
      timestamp,
      regionId: this.regionId,
      metadata: {
        ...metadata,
        updatedBy: this.regionId
      }
    };

    // Store locally
    this.stateStore.set(key, stateEntry);
    this.committedState.set(key, value);
    this.stateVersions.set(key, version);

    // Store in Redis
    await this.redisClient.setEx(
      `sync:state:${key}`,
      3600,
      JSON.stringify(stateEntry)
    );

    // Queue for replication
    this.pendingUpdates.set(key, stateEntry);

    // Publish update
    await this.publishStateUpdate(stateEntry);

    console.log(`📝 State updated: ${key} in ${this.regionId}`);
    this.emit('state_updated', { key, value, regionId: this.regionId });

    return stateEntry;
  }

  async publishStateUpdate(stateEntry) {
    const update = {
      type: SYNC_OPERATIONS.STATE_UPDATE,
      regionId: this.regionId,
      data: stateEntry,
      timestamp: new Date().toISOString(),
      messageId: crypto.randomUUID()
    };

    await this.redisClient.publish('swarm:phase-2:sync', JSON.stringify(update));
  }

  async handleStateUpdate(regionId, data, messageId) {
    const { key, value, version, timestamp } = data;

    // Check for conflicts
    const existingEntry = this.stateStore.get(key);
    let conflictDetected = false;

    if (existingEntry) {
      const comparison = this.vectorClock.compare(version);
      if (comparison === 0) {
        // Conflict detected
        conflictDetected = true;
        await this.handleConflict(key, existingEntry, data);
      }
    }

    if (!conflictDetected) {
      // Update vector clock
      this.vectorClock.update(version);

      // Store the update
      this.stateStore.set(key, { ...data, replicatedFrom: regionId });
      this.committedState.set(key, value);
      this.stateVersions.set(key, version);

      // Store in Redis
      await this.redisClient.setEx(
        `sync:state:${key}`,
        3600,
        JSON.stringify({ ...data, replicatedFrom: regionId })
      );

      console.log(`📥 State replicated: ${key} from ${regionId}`);
      this.emit('state_replicated', { key, value, fromRegion: regionId });
    }

    // Send acknowledgment
    await this.sendAcknowledgment(regionId, messageId, conflictDetected);
  }

  async handleConflict(key, localEntry, remoteEntry) {
    const conflict = {
      key,
      localEntry,
      remoteEntry,
      timestamp: new Date().toISOString(),
      regionId: this.regionId,
      resolved: false
    };

    this.conflictLog.push(conflict);

    console.log(`⚔️ Conflict detected for key: ${key}`);

    // Resolve conflict based on strategy
    const resolvedEntry = await this.resolveConflict(key, localEntry, remoteEntry);

    if (resolvedEntry) {
      await this.applyConflictResolution(key, resolvedEntry);
    }

    this.emit('conflict_detected', { key, localEntry, remoteEntry, resolvedEntry });
  }

  async resolveConflict(key, localEntry, remoteEntry) {
    switch (SYNC_CONFIG.conflictResolution) {
      case 'last-write-wins':
        return this.resolveByTimestamp(localEntry, remoteEntry);

      case 'vector-clock':
        return await this.resolveByVectorClock(localEntry, remoteEntry);

      case 'merge':
        return await this.resolveByMerge(key, localEntry, remoteEntry);

      default:
        return this.resolveByTimestamp(localEntry, remoteEntry);
    }
  }

  resolveByTimestamp(localEntry, remoteEntry) {
    const localTime = new Date(localEntry.timestamp);
    const remoteTime = new Date(remoteEntry.timestamp);

    return remoteTime > localTime ? remoteEntry : localEntry;
  }

  async resolveByVectorClock(localEntry, remoteEntry) {
    const localClock = new VectorClock();
    const remoteClock = new VectorClock();

    localClock.clock = localEntry.version;
    remoteClock.clock = remoteEntry.version;

    const comparison = localClock.compare(remoteClock.clock);

    if (comparison === 1) return localEntry;
    if (comparison === -1) return remoteEntry;

    // If clocks are concurrent, use timestamp as tiebreaker
    return this.resolveByTimestamp(localEntry, remoteEntry);
  }

  async resolveByMerge(key, localEntry, remoteEntry) {
    // Simple merge strategy - in real implementation would be more sophisticated
    try {
      const mergedValue = {
        ...localEntry.value,
        ...remoteEntry.value,
        _merged: true,
        _mergedAt: new Date().toISOString(),
        _mergedBy: this.regionId
      };

      return {
        ...localEntry,
        value: mergedValue,
        timestamp: new Date().toISOString(),
        _conflictResolved: true
      };
    } catch (error) {
      console.warn('⚠️ Merge failed, falling back to timestamp:', error.message);
      return this.resolveByTimestamp(localEntry, remoteEntry);
    }
  }

  async applyConflictResolution(key, resolvedEntry) {
    const version = this.vectorClock.increment();

    const finalEntry = {
      ...resolvedEntry,
      version,
      conflictResolved: true,
      resolvedAt: new Date().toISOString(),
      resolvedBy: this.regionId
    };

    // Update state
    this.stateStore.set(key, finalEntry);
    this.committedState.set(key, finalEntry.value);
    this.stateVersions.set(key, version);

    // Store in Redis
    await this.redisClient.setEx(
      `sync:state:${key}`,
      3600,
      JSON.stringify(finalEntry)
    );

    // Mark conflict as resolved
    const conflict = this.conflictLog.find(c => c.key === key && !c.resolved);
    if (conflict) {
      conflict.resolved = true;
      conflict.resolvedAt = new Date().toISOString();
      conflict.resolution = finalEntry;
    }

    // Publish conflict resolution
    await this.publishConflictResolution(key, finalEntry);

    console.log(`✅ Conflict resolved for key: ${key}`);
    this.emit('conflict_resolved', { key, resolvedEntry: finalEntry });
  }

  async publishConflictResolution(key, resolvedEntry) {
    const resolution = {
      type: SYNC_OPERATIONS.CONFLICT_RESOLUTION,
      regionId: this.regionId,
      data: {
        key,
        resolvedEntry
      },
      timestamp: new Date().toISOString(),
      messageId: crypto.randomUUID()
    };

    await this.redisClient.publish('swarm:phase-2:sync', JSON.stringify(resolution));
  }

  async performStateSynchronization() {
    if (this.pendingUpdates.size === 0) return;

    console.log(`🔄 Synchronizing ${this.pendingUpdates.size} pending updates`);

    const updates = Array.from(this.pendingUpdates.values());
    const batchSize = SYNC_CONFIG.batchSize;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      await this.replicateBatch(batch);
    }

    // Clear replicated updates
    this.pendingUpdates.clear();

    console.log('✅ State synchronization completed');
  }

  async replicateBatch(batch) {
    const replication = {
      type: SYNC_OPERATIONS.REPLICATION,
      regionId: this.regionId,
      data: {
        updates: batch,
        batchId: crypto.randomUUID()
      },
      timestamp: new Date().toISOString(),
      messageId: crypto.randomUUID()
    };

    // Track replication for acknowledgments
    this.replicationLog.push({
      batchId: replication.data.batchId,
      updates: batch,
      timestamp: replication.timestamp,
      acknowledgments: new Set(),
      requiredAcks: SYNC_CONFIG.replicationFactor
    });

    await this.redisClient.publish('swarm:phase-2:sync', JSON.stringify(replication));
  }

  async handleReplication(regionId, data, messageId) {
    const { updates, batchId } = data;

    // Process each update in the batch
    for (const update of updates) {
      await this.handleStateUpdate(regionId, update, `${messageId}:${update.key}`);
    }

    console.log(`📦 Processed replication batch ${batchId} from ${regionId}`);
  }

  async sendAcknowledgment(targetRegion, originalMessageId, conflictDetected = false) {
    const acknowledgment = {
      type: SYNC_OPERATIONS.ACKNOWLEDGMENT,
      regionId: this.regionId,
      targetRegion,
      data: {
        originalMessageId,
        acknowledged: true,
        conflictDetected,
        timestamp: new Date().toISOString()
      },
      messageId: crypto.randomUUID()
    };

    await this.redisClient.publish('swarm:phase-2:sync', JSON.stringify(acknowledgment));

    // Store acknowledgment for tracking
    this.acknowledgments.set(originalMessageId, {
      ...acknowledgment.data,
      acknowledgedAt: new Date()
    });
  }

  async handleAcknowledgment(regionId, data, messageId) {
    const { originalMessageId, acknowledged, conflictDetected } = data;

    console.log(`✅ Acknowledgment received from ${regionId} for ${originalMessageId}`);

    // Update replication log
    const replication = this.replicationLog.find(r =>
      r.updates.some(u => u.key === originalMessageId)
    );

    if (replication) {
      replication.acknowledgments.add(regionId);

      // Check if replication is complete
      if (replication.acknowledgments.size >= replication.requiredAcks) {
        console.log(`🎯 Replication batch ${replication.batchId} fully acknowledged`);
        this.emit('replication_completed', { batchId: replication.batchId });
      }
    }

    this.emit('acknowledgment_received', {
      fromRegion: regionId,
      originalMessageId,
      conflictDetected
    });
  }

  async resolveConflicts() {
    const unresolvedConflicts = this.conflictLog.filter(c => !c.resolved);

    if (unresolvedConflicts.length === 0) return;

    console.log(`⚔️ Resolving ${unresolvedConflicts.length} conflicts`);

    for (const conflict of unresolvedConflicts) {
      try {
        await this.handleConflict(conflict.key, conflict.localEntry, conflict.remoteEntry);
      } catch (error) {
        console.error(`❌ Failed to resolve conflict for ${conflict.key}:`, error.message);
      }
    }
  }

  async cleanup() {
    const cutoffTime = new Date(Date.now() - 3600000); // 1 hour ago

    // Clean up old conflict logs
    this.conflictLog = this.conflictLog.filter(c =>
      new Date(c.timestamp) > cutoffTime || !c.resolved
    );

    // Clean up old replication logs
    this.replicationLog = this.replicationLog.filter(r =>
      new Date(r.timestamp) > cutoffTime ||
      r.acknowledgments.size < r.requiredAcks
    );

    // Clean up old acknowledgments
    const ackCutoffTime = new Date(Date.now() - 1800000); // 30 minutes ago
    for (const [key, ack] of this.acknowledgments.entries()) {
      if (new Date(ack.acknowledgedAt) < ackCutoffTime) {
        this.acknowledgments.delete(key);
      }
    }

    console.log('🧹 State synchronization cleanup completed');
  }

  getState(key) {
    return this.stateStore.get(key);
  }

  getAllStates() {
    return Object.fromEntries(this.stateStore);
  }

  getSyncStatus() {
    return {
      regionId: this.regionId,
      syncPeers: Array.from(this.syncPeers),
      pendingUpdates: this.pendingUpdates.size,
      conflictLog: this.conflictLog.length,
      replicationLog: this.replicationLog.length,
      vectorClock: this.vectorClock.clock,
      lastSyncTimes: Object.fromEntries(this.lastSyncTimes),
      stateStoreSize: this.stateStore.size
    };
  }

  async shutdown() {
    // Perform final state sync
    await this.performStateSynchronization();

    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log(`🔌 State Synchronization shut down for ${this.regionId}`);
  }
}

export { SYNC_OPERATIONS, SYNC_CONFIG, VectorClock };