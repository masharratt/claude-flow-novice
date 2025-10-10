/**
 * Redis Coordination Layer for Dependency Resolution Engine
 *
 * Manages cross-functional dependency resolution with Redis pub/sub
 * Supports distributed swarm coordination and state persistence
 */

import { createClient } from 'redis';
import { DependencyResolver } from './dependency-resolver.js';
import { ConflictResolutionEngine } from './conflict-resolution-engine.js';
import { performance } from 'perf_hooks';
import crypto from 'crypto';

/**
 * Redis Coordination Configuration
 */
const REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
  db: 0,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
};

/**
 * Coordination Channels
 */
const CHANNELS = {
  DEPENDENCIES: 'swarm:phase-2:dependencies',
  CONFLICTS: 'swarm:phase-2:conflicts',
  RESOLUTION: 'swarm:phase-2:resolution',
  COORDINATION: 'swarm:phase-2:coordination',
  HEARTBEAT: 'swarm:phase-2:heartbeat'
};

/**
 * Message Types
 */
const MESSAGE_TYPES = {
  TASK_ADDED: 'task_added',
  TASK_UPDATED: 'task_updated',
  TASK_COMPLETED: 'task_completed',
  DEPENDENCY_ADDED: 'dependency_added',
  DEPENDENCY_REMOVED: 'dependency_removed',
  CONFLICT_DETECTED: 'conflict_detected',
  CONFLICT_RESOLVED: 'conflict_resolved',
  RESOLUTION_REQUEST: 'resolution_request',
  COORDINATION_REQUEST: 'coordination_request',
  HEARTBEAT: 'heartbeat'
};

/**
 * Redis-backed Coordination Manager
 */
class RedisCoordinationManager {
  constructor(options = {}) {
    this.options = {
      redisConfig: REDIS_CONFIG,
      nodeId: `node_${crypto.randomBytes(8).toString('hex')}`,
      enablePersistence: true,
      syncInterval: 5000, // 5 seconds
      heartbeatInterval: 30000, // 30 seconds
      maxResolutionTime: 10, // 10ms
      ...options
    };

    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.dependencyResolver = null;
    this.conflictEngine = null;
    this.isInitialized = false;
    this.lastSync = null;
    this.metrics = {
      messagesPublished: 0,
      messagesReceived: 0,
      conflictsDetected: 0,
      conflictsResolved: 0,
      averageResolutionTime: 0,
      totalNodes: 0
    };

    this.eventHandlers = new Map();
    this.setupEventHandlers();
  }

  /**
   * Initialize Redis connections and coordination components
   */
  async initialize() {
    try {
      console.log('🔧 Initializing Redis coordination...');

      // Initialize Redis clients
      this.client = createClient(this.options.redisConfig);
      this.subscriber = this.client.duplicate();
      this.publisher = this.client.duplicate();

      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);

      console.log('✅ Redis clients connected');

      // Initialize dependency resolver and conflict engine
      this.dependencyResolver = new DependencyResolver({
        maxResolutionTime: this.options.maxResolutionTime,
        enableMetrics: true
      });

      this.conflictEngine = new ConflictResolutionEngine(
        this.dependencyResolver,
        {
          autoResolve: true,
          enableMetrics: true
        }
      );

      // Load persisted state if available
      if (this.options.enablePersistence) {
        await this.loadPersistedState();
      }

      // Setup Redis subscriptions
      await this.setupSubscriptions();

      // Start background processes
      this.startHeartbeat();
      this.startSyncProcess();

      this.isInitialized = true;
      console.log('✅ Redis coordination initialized');

      // Announce node joining
      await this.publishMessage(CHANNELS.COORDINATION, {
        type: 'node_joined',
        nodeId: this.options.nodeId,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ Failed to initialize Redis coordination:', error);
      throw error;
    }
  }

  /**
   * Setup Redis subscriptions for coordination channels
   */
  async setupSubscriptions() {
    await this.subscriber.subscribe(CHANNELS.DEPENDENCIES, (message) => {
      this.handleDependencyMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(CHANNELS.CONFLICTS, (message) => {
      this.handleConflictMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(CHANNELS.RESOLUTION, (message) => {
      this.handleResolutionMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(CHANNELS.COORDINATION, (message) => {
      this.handleCoordinationMessage(JSON.parse(message));
    });

    await this.subscriber.subscribe(CHANNELS.HEARTBEAT, (message) => {
      this.handleHeartbeatMessage(JSON.parse(message));
    });

    console.log('📡 Redis subscriptions established');
  }

  /**
   * Setup event handlers for coordination
   */
  setupEventHandlers() {
    this.eventHandlers.set(MESSAGE_TYPES.TASK_ADDED, this.handleTaskAdded.bind(this));
    this.eventHandlers.set(MESSAGE_TYPES.TASK_UPDATED, this.handleTaskUpdated.bind(this));
    this.eventHandlers.set(MESSAGE_TYPES.TASK_COMPLETED, this.handleTaskCompleted.bind(this));
    this.eventHandlers.set(MESSAGE_TYPES.DEPENDENCY_ADDED, this.handleDependencyAdded.bind(this));
    this.eventHandlers.set(MESSAGE_TYPES.DEPENDENCY_REMOVED, this.handleDependencyRemoved.bind(this));
    this.eventHandlers.set(MESSAGE_TYPES.CONFLICT_DETECTED, this.handleConflictDetected.bind(this));
    this.eventHandlers.set(MESSAGE_TYPES.CONFLICT_RESOLVED, this.handleConflictResolved.bind(this));
    this.eventHandlers.set(MESSAGE_TYPES.RESOLUTION_REQUEST, this.handleResolutionRequest.bind(this));
    this.eventHandlers.set(MESSAGE_TYPES.COORDINATION_REQUEST, this.handleCoordinationRequest.bind(this));
  }

  /**
   * Add a task to the distributed dependency graph
   */
  async addTask(taskId, taskData) {
    const startTime = performance.now();

    try {
      // Add to local resolver
      const node = this.dependencyResolver.addTask(taskId, taskData);

      // Publish to coordination channel
      await this.publishMessage(CHANNELS.DEPENDENCIES, {
        type: MESSAGE_TYPES.TASK_ADDED,
        nodeId: this.options.nodeId,
        taskId,
        taskData,
        timestamp: Date.now()
      });

      // Detect conflicts
      const conflicts = await this.conflictEngine.detectConflicts();
      if (conflicts.length > 0) {
        await this.publishMessage(CHANNELS.CONFLICTS, {
          type: MESSAGE_TYPES.CONFLICT_DETECTED,
          nodeId: this.options.nodeId,
          conflicts: conflicts.map(c => c.toJSON()),
          timestamp: Date.now()
        });
        this.metrics.conflictsDetected += conflicts.length;
      }

      // Persist state
      if (this.options.enablePersistence) {
        await this.persistState();
      }

      const duration = performance.now() - startTime;
      this.updateAverageResolutionTime(duration);

      return {
        success: true,
        taskId,
        nodeId: node,
        conflictsDetected: conflicts.length,
        duration
      };

    } catch (error) {
      console.error(`❌ Failed to add task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Add a dependency between tasks
   */
  async addDependency(fromTaskId, toTaskId) {
    const startTime = performance.now();

    try {
      // Add to local resolver
      this.dependencyResolver.addDependency(fromTaskId, toTaskId);

      // Publish to coordination channel
      await this.publishMessage(CHANNELS.DEPENDENCIES, {
        type: MESSAGE_TYPES.DEPENDENCY_ADDED,
        nodeId: this.options.nodeId,
        fromTaskId,
        toTaskId,
        timestamp: Date.now()
      });

      // Detect conflicts
      const conflicts = await this.conflictEngine.detectConflicts();
      if (conflicts.length > 0) {
        await this.publishMessage(CHANNELS.CONFLICTS, {
          type: MESSAGE_TYPES.CONFLICT_DETECTED,
          nodeId: this.options.nodeId,
          conflicts: conflicts.map(c => c.toJSON()),
          timestamp: Date.now()
        });
        this.metrics.conflictsDetected += conflicts.length;
      }

      const duration = performance.now() - startTime;
      this.updateAverageResolutionTime(duration);

      return {
        success: true,
        fromTaskId,
        toTaskId,
        conflictsDetected: conflicts.length,
        duration
      };

    } catch (error) {
      console.error(`❌ Failed to add dependency ${fromTaskId} -> ${toTaskId}:`, error);
      throw error;
    }
  }

  /**
   * Resolve dependencies with cross-functional coordination
   */
  async resolveDependencies() {
    const startTime = performance.now();

    try {
      // Detect conflicts
      const conflicts = await this.conflictEngine.detectConflicts();

      if (conflicts.length > 0) {
        // Request resolution from the network
        await this.publishMessage(CHANNELS.RESOLUTION, {
          type: MESSAGE_TYPES.RESOLUTION_REQUEST,
          nodeId: this.options.nodeId,
          conflicts: conflicts.map(c => c.toJSON()),
          timestamp: Date.now()
        });

        // Auto-resolve conflicts
        const resolutionResult = await this.conflictEngine.resolveAllConflicts();

        if (resolutionResult.resolved > 0) {
          await this.publishMessage(CHANNELS.CONFLICTS, {
            type: MESSAGE_TYPES.CONFLICT_RESOLVED,
            nodeId: this.options.nodeId,
            resolvedConflicts: resolutionResult.resolved,
            results: resolutionResult.results,
            timestamp: Date.now()
          });

          this.metrics.conflictsResolved += resolutionResult.resolved;
        }
      }

      // Get final resolution
      const resolution = this.dependencyResolver.resolve();

      const duration = performance.now() - startTime;
      this.updateAverageResolutionTime(duration);

      return {
        success: true,
        resolution,
        conflictsDetected: conflicts.length,
        conflictsResolved: this.metrics.conflictsResolved,
        duration
      };

    } catch (error) {
      console.error('❌ Failed to resolve dependencies:', error);
      throw error;
    }
  }

  /**
   * Publish message to Redis channel
   */
  async publishMessage(channel, message) {
    try {
      await this.publisher.publish(channel, JSON.stringify(message));
      this.metrics.messagesPublished++;
    } catch (error) {
      console.error(`❌ Failed to publish to ${channel}:`, error);
      throw error;
    }
  }

  /**
   * Handle dependency messages
   */
  handleDependencyMessage(message) {
    this.metrics.messagesReceived++;

    if (message.nodeId === this.options.nodeId) {
      return; // Ignore own messages
    }

    const handler = this.eventHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }

  /**
   * Handle conflict messages
   */
  handleConflictMessage(message) {
    this.metrics.messagesReceived++;

    if (message.nodeId === this.options.nodeId) {
      return; // Ignore own messages
    }

    const handler = this.eventHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }

  /**
   * Handle resolution messages
   */
  handleResolutionMessage(message) {
    this.metrics.messagesReceived++;

    if (message.nodeId === this.options.nodeId) {
      return; // Ignore own messages
    }

    const handler = this.eventHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }

  /**
   * Handle coordination messages
   */
  handleCoordinationMessage(message) {
    this.metrics.messagesReceived++;

    if (message.nodeId === this.options.nodeId) {
      return; // Ignore own messages
    }

    switch (message.type) {
      case 'node_joined':
        console.log(`👋 Node ${message.nodeId} joined the coordination network`);
        break;
      case 'node_left':
        console.log(`👋 Node ${message.nodeId} left the coordination network`);
        break;
      case 'sync_request':
        this.handleSyncRequest(message);
        break;
    }
  }

  /**
   * Handle heartbeat messages
   */
  handleHeartbeatMessage(message) {
    this.metrics.messagesReceived++;

    if (message.nodeId === this.options.nodeId) {
      return; // Ignore own heartbeats
    }

    // Update node activity tracking
    this.updateNodeActivity(message.nodeId, message.timestamp);
  }

  /**
   * Event handlers for different message types
   */
  handleTaskAdded(message) {
    try {
      // Add task to local resolver if not present
      if (!this.dependencyResolver.graph.getNode(message.taskId)) {
        this.dependencyResolver.addTask(message.taskId, message.taskData);
      }
    } catch (error) {
      console.error(`❌ Error handling task added: ${error.message}`);
    }
  }

  handleTaskUpdated(message) {
    try {
      const node = this.dependencyResolver.graph.getNode(message.taskId);
      if (node) {
        Object.assign(node.data, message.taskData);
        this.dependencyResolver.invalidateCache();
      }
    } catch (error) {
      console.error(`❌ Error handling task updated: ${error.message}`);
    }
  }

  handleTaskCompleted(message) {
    try {
      this.dependencyResolver.updateTaskState(message.taskId, 'completed');
    } catch (error) {
      console.error(`❌ Error handling task completed: ${error.message}`);
    }
  }

  handleDependencyAdded(message) {
    try {
      this.dependencyResolver.addDependency(message.fromTaskId, message.toTaskId);
    } catch (error) {
      console.error(`❌ Error handling dependency added: ${error.message}`);
    }
  }

  handleDependencyRemoved(message) {
    try {
      this.dependencyResolver.removeDependency(message.fromTaskId, message.toTaskId);
    } catch (error) {
      console.error(`❌ Error handling dependency removed: ${error.message}`);
    }
  }

  handleConflictDetected(message) {
    console.log(`⚠️  Node ${message.nodeId} detected ${message.conflicts.length} conflicts`);
  }

  handleConflictResolved(message) {
    console.log(`✅ Node ${message.nodeId} resolved ${message.resolvedConflicts} conflicts`);
  }

  handleResolutionRequest(message) {
    // Process resolution requests from other nodes
    console.log(`🔄 Node ${message.nodeId} requesting resolution for ${message.conflicts.length} conflicts`);
  }

  handleCoordinationRequest(message) {
    // Handle coordination requests
    console.log(`🤝 Coordination request from ${message.nodeId}:`, message.request);
  }

  /**
   * Start heartbeat process
   */
  startHeartbeat() {
    setInterval(async () => {
      try {
        await this.publishMessage(CHANNELS.HEARTBEAT, {
          type: MESSAGE_TYPES.HEARTBEAT,
          nodeId: this.options.nodeId,
          timestamp: Date.now(),
          stats: this.getStats()
        });
      } catch (error) {
        console.error('❌ Heartbeat failed:', error);
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Start synchronization process
   */
  startSyncProcess() {
    if (!this.options.enablePersistence) return;

    setInterval(async () => {
      try {
        await this.persistState();
        await this.requestSync();
        this.lastSync = Date.now();
      } catch (error) {
        console.error('❌ Sync process failed:', error);
      }
    }, this.options.syncInterval);
  }

  /**
   * Persist state to Redis
   */
  async persistState() {
    if (!this.client) return;

    try {
      const state = {
        dependencyResolver: this.dependencyResolver.export(),
        conflictEngine: this.conflictEngine.export(),
        nodeId: this.options.nodeId,
        timestamp: Date.now()
      };

      const key = `dependency_resolution:${this.options.nodeId}:state`;
      await this.client.setEx(key, 3600, JSON.stringify(state)); // 1 hour TTL
    } catch (error) {
      console.error('❌ Failed to persist state:', error);
    }
  }

  /**
   * Load persisted state from Redis
   */
  async loadPersistedState() {
    if (!this.client) return;

    try {
      const key = `dependency_resolution:${this.options.nodeId}:state`;
      const stateData = await this.client.get(key);

      if (stateData) {
        const state = JSON.parse(stateData);
        console.log('📂 Loaded persisted state');

        // Restore dependency resolver
        if (state.dependencyResolver) {
          this.dependencyResolver = DependencyResolver.import(state.dependencyResolver);
        }

        // Restore conflict engine (basic restoration)
        if (state.conflictEngine) {
          // Basic conflict engine restoration would go here
          console.log('📂 Conflict engine data loaded');
        }
      }
    } catch (error) {
      console.error('❌ Failed to load persisted state:', error);
    }
  }

  /**
   * Request synchronization from other nodes
   */
  async requestSync() {
    try {
      await this.publishMessage(CHANNELS.COORDINATION, {
        type: 'sync_request',
        nodeId: this.options.nodeId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Failed to request sync:', error);
    }
  }

  /**
   * Handle sync requests from other nodes
   */
  async handleSyncRequest(message) {
    // Respond with current state if needed
    console.log(`🔄 Sync request from ${message.nodeId}`);
  }

  /**
   * Update node activity tracking
   */
  updateNodeActivity(nodeId, timestamp) {
    // This would typically be stored in a local cache or Redis
    // For now, just update metrics
    this.metrics.totalNodes = Math.max(this.metrics.totalNodes, 1);
  }

  /**
   * Update average resolution time
   */
  updateAverageResolutionTime(duration) {
    const alpha = 0.1; // Smoothing factor
    this.metrics.averageResolutionTime =
      alpha * duration + (1 - alpha) * this.metrics.averageResolutionTime;
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      nodeId: this.options.nodeId,
      metrics: this.metrics,
      graphStats: this.dependencyResolver.getStats(),
      conflictStats: this.conflictEngine.getMetrics(),
      lastSync: this.lastSync,
      uptime: this.isInitialized ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Redis coordination...');

    try {
      // Announce node leaving
      await this.publishMessage(CHANNELS.COORDINATION, {
        type: 'node_left',
        nodeId: this.options.nodeId,
        timestamp: Date.now()
      });

      // Final state persistence
      if (this.options.enablePersistence) {
        await this.persistState();
      }

      // Close Redis connections
      if (this.client) await this.client.quit();
      if (this.subscriber) await this.subscriber.quit();
      if (this.publisher) await this.publisher.quit();

      console.log('✅ Redis coordination shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}

export {
  RedisCoordinationManager,
  CHANNELS,
  MESSAGE_TYPES,
  REDIS_CONFIG
};