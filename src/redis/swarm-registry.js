/**
 * SwarmRegistry - Multi-Swarm State Management and Discovery
 * Phase 2: Fleet Manager Features & Advanced Capabilities
 *
 * Manages registration, discovery, and lifecycle of multiple concurrent swarms
 * Uses Redis for persistent state with 24-hour TTL
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

class SwarmRegistry extends EventEmitter {
  constructor(redisConfig = {}) {
    super();

    // Initialize Redis client with connection pooling
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
    });

    // Configuration
    this.config = {
      swarmTTL: 86400, // 24 hours in seconds
      heartbeatInterval: 30000, // 30 seconds
      cleanupInterval: 300000, // 5 minutes
      maxSwarms: 100, // Maximum concurrent swarms
      registryKey: 'swarm:registry',
      swarmPrefix: 'swarm:',
      indexKey: 'swarm:index',
      metricsKey: 'swarm:metrics',
      ...redisConfig,
    };

    // In-memory cache for performance
    this.swarmCache = new Map();
    this.lastSync = 0;
    this.syncInterval = 5000; // 5 seconds cache TTL

    // Statistics
    this.stats = {
      totalRegistered: 0,
      activeSwarms: 0,
      completedSwarms: 0,
      failedSwarms: 0,
      totalAgents: 0,
      avgSwarmLifetime: 0,
    };

    this.initialized = false;
  }

  /**
   * Initialize the registry
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Verify Redis connection
      await this.redis.ping();
      console.log('✅ SwarmRegistry: Redis connection established');

      // Load existing registry state
      await this.loadRegistryState();

      // Start background tasks
      this.startHeartbeat();
      this.startCleanup();

      // Register cleanup on process exit
      this.registerCleanupHandlers();

      this.initialized = true;
      console.log(`🚀 SwarmRegistry initialized (${this.stats.activeSwarms} active swarms)`);

      this.emit('initialized', this.stats);
    } catch (error) {
      console.error('❌ SwarmRegistry initialization failed:', error);
      throw error;
    }
  }

  /**
   * Register a new swarm
   */
  async registerSwarm(swarmData) {
    this.ensureInitialized();

    const swarmId = swarmData.id || this.generateSwarmId();
    const timestamp = Date.now();

    const swarm = {
      id: swarmId,
      objective: swarmData.objective || 'No objective specified',
      strategy: swarmData.strategy || 'development',
      mode: swarmData.mode || 'mesh',
      maxAgents: swarmData.maxAgents || 10,
      status: 'initializing',
      createdAt: timestamp,
      lastActivity: timestamp,
      lastHeartbeat: timestamp,
      agents: [],
      tasks: [],
      topology: swarmData.mode || 'mesh',
      metadata: {
        creator: swarmData.creator || 'system',
        phase: swarmData.phase || 'unknown',
        priority: swarmData.priority || 'normal',
        tags: swarmData.tags || [],
        ...swarmData.metadata,
      },
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        agentsSpawned: 0,
        messagesSent: 0,
        errors: 0,
      },
    };

    // Check swarm limit
    const activeCount = await this.getActiveSwarmCount();
    if (activeCount >= this.config.maxSwarms) {
      throw new Error(`Swarm limit reached (${this.config.maxSwarms}). Cannot register new swarm.`);
    }

    try {
      // Store swarm in Redis with TTL
      const swarmKey = this.getSwarmKey(swarmId);
      await this.redis.setex(swarmKey, this.config.swarmTTL, JSON.stringify(swarm));

      // Add to registry index
      await this.redis.zadd(this.config.indexKey, timestamp, swarmId);

      // Add to status-based sets
      await this.redis.sadd(`swarm:status:initializing`, swarmId);

      // Update cache
      this.swarmCache.set(swarmId, swarm);

      // Update statistics
      this.stats.totalRegistered++;
      this.stats.activeSwarms++;
      await this.updateMetrics();

      console.log(`📝 Swarm registered: ${swarmId} (${swarm.objective})`);
      this.emit('swarm_registered', swarm);

      return swarm;
    } catch (error) {
      console.error(`❌ Failed to register swarm ${swarmId}:`, error);
      throw error;
    }
  }

  /**
   * Update swarm state
   */
  async updateSwarm(swarmId, updates) {
    this.ensureInitialized();

    try {
      const swarm = await this.getSwarm(swarmId);
      if (!swarm) {
        throw new Error(`Swarm ${swarmId} not found`);
      }

      // Track status changes
      const oldStatus = swarm.status;
      const newStatus = updates.status || oldStatus;

      // Apply updates
      const updatedSwarm = {
        ...swarm,
        ...updates,
        lastActivity: Date.now(),
      };

      // Preserve immutable fields
      updatedSwarm.id = swarmId;
      updatedSwarm.createdAt = swarm.createdAt;

      // Store updated swarm
      const swarmKey = this.getSwarmKey(swarmId);
      await this.redis.setex(swarmKey, this.config.swarmTTL, JSON.stringify(updatedSwarm));

      // Update status-based sets if status changed
      if (oldStatus !== newStatus) {
        await this.redis.srem(`swarm:status:${oldStatus}`, swarmId);
        await this.redis.sadd(`swarm:status:${newStatus}`, swarmId);

        // Update statistics
        if (newStatus === 'completed') {
          this.stats.completedSwarms++;
          this.stats.activeSwarms--;
        } else if (newStatus === 'failed') {
          this.stats.failedSwarms++;
          this.stats.activeSwarms--;
        }

        await this.updateMetrics();
      }

      // Update cache
      this.swarmCache.set(swarmId, updatedSwarm);

      console.log(`🔄 Swarm updated: ${swarmId} (${oldStatus} → ${newStatus})`);
      this.emit('swarm_updated', { swarmId, oldStatus, newStatus, swarm: updatedSwarm });

      return updatedSwarm;
    } catch (error) {
      console.error(`❌ Failed to update swarm ${swarmId}:`, error);
      throw error;
    }
  }

  /**
   * Get swarm by ID
   */
  async getSwarm(swarmId) {
    this.ensureInitialized();

    // Check cache first
    if (this.swarmCache.has(swarmId) && (Date.now() - this.lastSync < this.syncInterval)) {
      return this.swarmCache.get(swarmId);
    }

    try {
      const swarmKey = this.getSwarmKey(swarmId);
      const data = await this.redis.get(swarmKey);

      if (!data) {
        return null;
      }

      const swarm = JSON.parse(data);
      this.swarmCache.set(swarmId, swarm);
      return swarm;
    } catch (error) {
      console.error(`❌ Failed to get swarm ${swarmId}:`, error);
      return null;
    }
  }

  /**
   * Get all swarms with optional filters
   */
  async getSwarms(filters = {}) {
    this.ensureInitialized();

    try {
      let swarmIds;

      // Filter by status if specified
      if (filters.status) {
        swarmIds = await this.redis.smembers(`swarm:status:${filters.status}`);
      } else {
        // Get all swarm IDs from index
        swarmIds = await this.redis.zrange(this.config.indexKey, 0, -1);
      }

      // Fetch swarm data
      const swarms = await Promise.all(
        swarmIds.map(id => this.getSwarm(id))
      );

      // Filter out null values (expired swarms)
      let validSwarms = swarms.filter(s => s !== null);

      // Apply additional filters
      if (filters.objective) {
        const pattern = new RegExp(filters.objective, 'i');
        validSwarms = validSwarms.filter(s => pattern.test(s.objective));
      }

      if (filters.strategy) {
        validSwarms = validSwarms.filter(s => s.strategy === filters.strategy);
      }

      if (filters.mode) {
        validSwarms = validSwarms.filter(s => s.mode === filters.mode);
      }

      if (filters.phase) {
        validSwarms = validSwarms.filter(s => s.metadata?.phase === filters.phase);
      }

      // Sort by creation time (newest first)
      validSwarms.sort((a, b) => b.createdAt - a.createdAt);

      // Apply limit
      if (filters.limit) {
        validSwarms = validSwarms.slice(0, filters.limit);
      }

      return validSwarms;
    } catch (error) {
      console.error('❌ Failed to get swarms:', error);
      return [];
    }
  }

  /**
   * Get active swarm count
   */
  async getActiveSwarmCount() {
    try {
      const activeStatuses = ['initializing', 'active', 'recovering'];
      const counts = await Promise.all(
        activeStatuses.map(status =>
          this.redis.scard(`swarm:status:${status}`)
        )
      );
      return counts.reduce((sum, count) => sum + count, 0);
    } catch (error) {
      console.error('❌ Failed to get active swarm count:', error);
      return 0;
    }
  }

  /**
   * Deregister a swarm
   */
  async deregisterSwarm(swarmId, reason = 'completed') {
    this.ensureInitialized();

    try {
      const swarm = await this.getSwarm(swarmId);
      if (!swarm) {
        console.warn(`⚠️ Swarm ${swarmId} not found for deregistration`);
        return;
      }

      // Archive swarm before deletion
      await this.archiveSwarm(swarmId, swarm, reason);

      // Remove from status set
      await this.redis.srem(`swarm:status:${swarm.status}`, swarmId);

      // Remove from index
      await this.redis.zrem(this.config.indexKey, swarmId);

      // Delete swarm data
      const swarmKey = this.getSwarmKey(swarmId);
      await this.redis.del(swarmKey);

      // Remove from cache
      this.swarmCache.delete(swarmId);

      // Update statistics
      this.stats.activeSwarms--;
      await this.updateMetrics();

      console.log(`🗑️ Swarm deregistered: ${swarmId} (${reason})`);
      this.emit('swarm_deregistered', { swarmId, reason });
    } catch (error) {
      console.error(`❌ Failed to deregister swarm ${swarmId}:`, error);
      throw error;
    }
  }

  /**
   * Archive swarm data for historical analysis
   */
  async archiveSwarm(swarmId, swarm, reason) {
    try {
      const archiveKey = `swarm:archive:${swarmId}`;
      const archiveData = {
        ...swarm,
        archivedAt: Date.now(),
        archiveReason: reason,
        lifetime: Date.now() - swarm.createdAt,
      };

      // Store with longer TTL (7 days)
      await this.redis.setex(archiveKey, 604800, JSON.stringify(archiveData));

      // Add to archive index
      await this.redis.zadd('swarm:archive:index', Date.now(), swarmId);
    } catch (error) {
      console.error(`❌ Failed to archive swarm ${swarmId}:`, error);
    }
  }

  /**
   * Heartbeat mechanism to update swarm liveness
   */
  async heartbeat(swarmId) {
    try {
      const swarm = await this.getSwarm(swarmId);
      if (!swarm) {
        return false;
      }

      swarm.lastHeartbeat = Date.now();
      const swarmKey = this.getSwarmKey(swarmId);
      await this.redis.setex(swarmKey, this.config.swarmTTL, JSON.stringify(swarm));

      // Update cache
      this.swarmCache.set(swarmId, swarm);

      return true;
    } catch (error) {
      console.error(`❌ Heartbeat failed for swarm ${swarmId}:`, error);
      return false;
    }
  }

  /**
   * Discover swarms that need recovery
   */
  async discoverInterruptedSwarms() {
    try {
      const allSwarms = await this.getSwarms();
      const now = Date.now();
      const staleThreshold = 300000; // 5 minutes

      const interrupted = allSwarms.filter(swarm => {
        const timeSinceHeartbeat = now - (swarm.lastHeartbeat || swarm.lastActivity);
        return timeSinceHeartbeat > staleThreshold &&
               swarm.status !== 'completed' &&
               swarm.status !== 'failed';
      });

      return interrupted;
    } catch (error) {
      console.error('❌ Failed to discover interrupted swarms:', error);
      return [];
    }
  }

  /**
   * Load registry state from Redis
   */
  async loadRegistryState() {
    try {
      const metricsData = await this.redis.get(this.config.metricsKey);
      if (metricsData) {
        this.stats = { ...this.stats, ...JSON.parse(metricsData) };
      }

      // Recalculate active swarms
      this.stats.activeSwarms = await this.getActiveSwarmCount();

      console.log('📊 Registry state loaded:', this.stats);
    } catch (error) {
      console.error('❌ Failed to load registry state:', error);
    }
  }

  /**
   * Update metrics in Redis
   */
  async updateMetrics() {
    try {
      await this.redis.setex(
        this.config.metricsKey,
        this.config.swarmTTL,
        JSON.stringify(this.stats)
      );
    } catch (error) {
      console.error('❌ Failed to update metrics:', error);
    }
  }

  /**
   * Start heartbeat monitoring
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        const interrupted = await this.discoverInterruptedSwarms();
        if (interrupted.length > 0) {
          console.log(`⚠️ Found ${interrupted.length} interrupted swarms`);
          this.emit('interrupted_swarms_detected', interrupted);
        }
      } catch (error) {
        console.error('❌ Heartbeat check failed:', error);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Start cleanup of expired swarms
   */
  startCleanup() {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupExpiredSwarms();
        await this.cleanupCache();
      } catch (error) {
        console.error('❌ Cleanup failed:', error);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * Cleanup expired swarms
   */
  async cleanupExpiredSwarms() {
    try {
      const allSwarmIds = await this.redis.zrange(this.config.indexKey, 0, -1);
      let cleanedCount = 0;

      for (const swarmId of allSwarmIds) {
        const exists = await this.redis.exists(this.getSwarmKey(swarmId));
        if (!exists) {
          // Swarm expired, cleanup references
          await this.redis.zrem(this.config.indexKey, swarmId);
          this.swarmCache.delete(swarmId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired swarm references`);
      }
    } catch (error) {
      console.error('❌ Cleanup of expired swarms failed:', error);
    }
  }

  /**
   * Cleanup stale cache entries
   */
  async cleanupCache() {
    if (this.swarmCache.size > 1000) {
      console.log(`🧹 Cache size exceeded 1000, clearing cache`);
      this.swarmCache.clear();
      this.lastSync = 0;
    }
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    await this.loadRegistryState();
    return {
      ...this.stats,
      cacheSize: this.swarmCache.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Utility methods
   */
  getSwarmKey(swarmId) {
    return `${this.config.swarmPrefix}${swarmId}`;
  }

  generateSwarmId() {
    return `swarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('SwarmRegistry not initialized. Call initialize() first.');
    }
  }

  /**
   * Register cleanup handlers
   */
  registerCleanupHandlers() {
    const cleanup = async () => {
      console.log('🛑 SwarmRegistry shutting down...');
      await this.shutdown();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down SwarmRegistry...');

    // Stop background tasks
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Save final metrics
    await this.updateMetrics();

    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }

    this.initialized = false;
    console.log('✅ SwarmRegistry shutdown complete');
  }
}

module.exports = SwarmRegistry;
