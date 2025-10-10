/**
 * SQLite Memory Management System - Main Entry Point
 * Phase 1 Foundation Infrastructure & Event Bus Architecture
 *
 * Comprehensive SQLite-based memory management with 5-level ACL system
 * and Redis coordination for swarm operations.
 */

const SwarmMemoryManager = require('./SwarmMemoryManager');
const MemoryStoreAdapter = require('./MemoryStoreAdapter');
const RedisCoordinator = require('./RedisCoordinator');
const AgentRegistry = require('./AgentRegistry');
const PerformanceBenchmarks = require('./performance-benchmarks');
const EncryptionKeyManager = require('./EncryptionKeyManager');
const MultiLayerCache = require('./MultiLayerCache');
const ACLEnforcer = require('./ACLEnforcer.cjs');

/**
 * Main SQLite Memory Management System
 */
class SQLiteMemorySystem {
  constructor(options = {}) {
    this.options = {
      swarmId: options.swarmId || 'phase-1-foundation-infrastructure',
      agentId: options.agentId || `sqlite-system-${Date.now()}`,
      dbPath: options.dbPath || ':memory:',
      redisConfig: options.redisConfig || {},
      encryptionKey: options.encryptionKey,
      compressionThreshold: options.compressionThreshold || 1024,
      enableRedisCoordination: options.enableRedisCoordination !== false,
      enablePerformanceMonitoring: options.enablePerformanceMonitoring !== false,
      ...options
    };

    // Core components
    this.memoryManager = null;
    this.memoryAdapter = null;
    this.redisCoordinator = null;
    this.agentRegistry = null;
    this.performanceBenchmarks = null;

    // System state
    this.isInitialized = false;
    this.isShuttingDown = false;

    // Metrics and monitoring
    this.metrics = {
      startTime: Date.now(),
      operations: 0,
      errors: 0,
      lastActivity: null
    };

    // Bind methods
    this.handleRedisMessage = this.handleRedisMessage.bind(this);
    this.handleMemoryEvent = this.handleMemoryEvent.bind(this);
    this.handleAgentEvent = this.handleAgentEvent.bind(this);
  }

  /**
   * Initialize the complete SQLite memory system
   */
  async initialize() {
    if (this.isInitialized) {
      return this;
    }

    try {
      console.log(`🚀 Initializing SQLite Memory System for swarm: ${this.options.swarmId}`);

      // Initialize memory manager
      console.log('📊 Initializing SwarmMemoryManager...');
      this.memoryManager = new SwarmMemoryManager({
        dbPath: this.options.dbPath,
        encryptionKey: this.options.encryptionKey,
        compressionThreshold: this.options.compressionThreshold
      });
      await this.memoryManager.initialize();

      // Initialize memory adapter
      console.log('🔌 Initializing MemoryStoreAdapter...');
      this.memoryAdapter = new MemoryStoreAdapter({
        dbPath: this.options.dbPath,
        swarmId: this.options.swarmId,
        namespace: 'swarm-memory'
      });
      await this.memoryAdapter.initialize();

      // Initialize agent registry
      console.log('👥 Initializing AgentRegistry...');
      this.agentRegistry = new AgentRegistry({
        swarmId: this.options.swarmId
      });
      await this.agentRegistry.initialize(this.memoryManager);

      // Initialize Redis coordinator if enabled
      if (this.options.enableRedisCoordination) {
        console.log('🔗 Initializing RedisCoordinator...');
        this.redisCoordinator = new RedisCoordinator({
          swarmId: this.options.swarmId,
          agentId: this.options.agentId,
          ...this.options.redisConfig
        });
        await this.redisCoordinator.initialize();

        // Set up Redis message handlers
        this.setupRedisHandlers();
      }

      // Initialize performance benchmarks if enabled
      if (this.options.enablePerformanceMonitoring) {
        console.log('📈 Initializing PerformanceBenchmarks...');
        this.performanceBenchmarks = new PerformanceBenchmarks({
          testDbPath: this.options.dbPath,
          outputDir: './performance-reports'
        });
      }

      // Set up event handlers
      this.setupEventHandlers();

      // Register system agent
      await this.registerSystemAgent();

      this.isInitialized = true;
      this.metrics.lastActivity = Date.now();

      console.log(`✅ SQLite Memory System initialized successfully`);
      this.emit('initialized', { swarmId: this.options.swarmId });

      return this;
    } catch (error) {
      console.error('❌ Failed to initialize SQLite Memory System:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Set up Redis message handlers
   */
  setupRedisHandlers() {
    if (!this.redisCoordinator) return;

    // Handle coordination messages
    this.redisCoordinator.on('coordination', this.handleRedisMessage);

    // Handle memory operations
    this.redisCoordinator.on('memory', this.handleRedisMessage);

    // Handle schema updates
    this.redisCoordinator.on('sqlite', this.handleRedisMessage);

    // Handle consensus requests
    this.redisCoordinator.on('consensus', this.handleRedisMessage);
  }

  /**
   * Set up event handlers for internal components
   */
  setupEventHandlers() {
    // Memory manager events
    this.memoryManager.on('error', (error) => {
      this.metrics.errors++;
      this.emit('error', error);
    });

    this.memoryManager.on('get', (data) => {
      this.metrics.operations++;
      this.metrics.lastActivity = Date.now();
      this.emit('memoryOperation', { type: 'get', data });
    });

    this.memoryManager.on('set', (data) => {
      this.metrics.operations++;
      this.metrics.lastActivity = Date.now();
      this.emit('memoryOperation', { type: 'set', data });
    });

    // Memory adapter events
    this.memoryAdapter.on('error', (error) => {
      this.metrics.errors++;
      this.emit('error', error);
    });

    // Agent registry events
    this.agentRegistry.on('agentRegistered', (agent) => {
      this.emit('agentRegistered', agent);
    });

    this.agentRegistry.on('error', (error) => {
      this.metrics.errors++;
      this.emit('error', error);
    });

    // Redis coordinator events
    if (this.redisCoordinator) {
      this.redisCoordinator.on('error', (error) => {
        this.metrics.errors++;
        this.emit('error', error);
      });

      this.redisCoordinator.on('connected', () => {
        this.emit('redisConnected');
      });

      this.redisCoordinator.on('disconnected', () => {
        this.emit('redisDisconnected');
      });
    }
  }

  /**
   * Register the system agent in the registry
   */
  async registerSystemAgent() {
    const systemAgent = {
      id: this.options.agentId,
      name: 'SQLite Memory System',
      type: 'system',
      capabilities: ['memory-management', 'acl-control', 'coordination', 'monitoring'],
      aclLevel: 5, // system level
      metadata: {
        version: '1.0.0',
        startTime: new Date().toISOString(),
        components: {
          memoryManager: !!this.memoryManager,
          memoryAdapter: !!this.memoryAdapter,
          redisCoordinator: !!this.redisCoordinator,
          agentRegistry: !!this.agentRegistry,
          performanceBenchmarks: !!this.performanceBenchmarks
        }
      }
    };

    await this.agentRegistry.registerAgent(systemAgent);
    console.log(`🤖 System agent registered: ${this.options.agentId}`);
  }

  /**
   * Handle incoming Redis messages
   */
  async handleRedisMessage(data) {
    try {
      const { channel, message } = data;

      switch (channel) {
        case 'coordination':
          await this.handleCoordinationMessage(message);
          break;

        case 'memory':
          await this.handleMemoryCoordinationMessage(message);
          break;

        case 'sqlite':
          await this.handleSchemaMessage(message);
          break;

        case 'consensus':
          await this.handleConsensusMessage(message);
          break;

        default:
          console.log(`📨 Received message on channel: ${channel}`, message);
      }
    } catch (error) {
      console.error('❌ Error handling Redis message:', error);
      this.metrics.errors++;
    }
  }

  /**
   * Handle coordination messages
   */
  async handleCoordinationMessage(message) {
    switch (message.type) {
      case 'heartbeat_request':
        if (this.redisCoordinator) {
          await this.redisCoordinator.sendHeartbeat();
        }
        break;

      case 'status_request':
        await this.sendStatusUpdate();
        break;

      case 'shutdown_request':
        await this.gracefulShutdown();
        break;
    }
  }

  /**
   * Handle memory coordination messages
   */
  async handleMemoryCoordinationMessage(message) {
    switch (message.type) {
      case 'memory_operation':
        // Broadcast memory operations to other agents
        this.emit('memoryOperation', message);
        break;

      case 'cache_invalidate':
        // Invalidate local cache
        if (this.memoryManager) {
          this.memoryManager.clearACLCache();
        }
        break;
    }
  }

  /**
   * Handle schema messages
   */
  async handleSchemaMessage(message) {
    switch (message.type) {
      case 'schema_update':
        console.log('📊 Schema update received:', message);
        this.emit('schemaUpdate', message);
        break;

      case 'migration_request':
        console.log('🔄 Migration request received:', message);
        this.emit('migrationRequest', message);
        break;
    }
  }

  /**
   * Handle consensus messages
   */
  async handleConsensusMessage(message) {
    switch (message.type) {
      case 'consensus_request':
        console.log('🗳️ Consensus request received:', message);
        this.emit('consensusRequest', message);
        break;

      case 'consensus_vote':
        console.log('🗳️ Consensus vote received:', message);
        this.emit('consensusVote', message);
        break;
    }
  }

  /**
   * Handle memory events
   */
  handleMemoryEvent(event) {
    // Broadcast memory events via Redis if available
    if (this.redisCoordinator) {
      this.redisCoordinator.broadcastMemoryOperation(
        event.type,
        event.key,
        event.data
      );
    }
  }

  /**
   * Handle agent events
   */
  handleAgentEvent(event) {
    // Broadcast agent events via Redis if available
    if (this.redisCoordinator) {
      this.redisCoordinator.publish('coordination', {
        type: 'agent_event',
        event,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Send status update to swarm
   */
  async sendStatusUpdate() {
    if (!this.redisCoordinator) return;

    const status = {
      type: 'status_update',
      systemId: this.options.agentId,
      swarmId: this.options.swarmId,
      status: 'active',
      metrics: this.getSystemMetrics(),
      timestamp: Date.now()
    };

    await this.redisCoordinator.publish('coordination', status);
  }

  /**
   * Run performance benchmarks
   */
  async runBenchmarks(options = {}) {
    if (!this.performanceBenchmarks) {
      throw new Error('Performance monitoring not enabled');
    }

    console.log('📈 Running performance benchmarks...');
    const results = await this.performanceBenchmarks.runAllBenchmarks();
    this.emit('benchmarksCompleted', results);
    return results;
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    const metrics = {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime,
      isInitialized: this.isInitialized,
      components: {
        memoryManager: this.memoryManager ? this.memoryManager.getMetrics() : null,
        memoryAdapter: this.memoryAdapter ? this.memoryAdapter.getMetrics() : null,
        redisCoordinator: this.redisCoordinator ? this.redisCoordinator.getMetrics() : null,
        agentRegistry: this.agentRegistry ? this.agentRegistry.getMetrics() : null
      }
    };

    return metrics;
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats() {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }

    return this.memoryManager.getStats();
  }

  /**
   * Create memory store adapter instance
   */
  createMemoryAdapter(options = {}) {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }

    return new MemoryStoreAdapter({
      dbPath: this.options.dbPath,
      swarmId: this.options.swarmId,
      ...options
    });
  }

  /**
   * Register a new agent
   */
  async registerAgent(agentInfo) {
    if (!this.agentRegistry) {
      throw new Error('Agent registry not initialized');
    }

    return this.agentRegistry.registerAgent(agentInfo);
  }

  /**
   * Get agent information
   */
  async getAgent(agentId) {
    if (!this.agentRegistry) {
      throw new Error('Agent registry not initialized');
    }

    return this.agentRegistry.getAgent(agentId);
  }

  /**
   * List all agents
   */
  async listAgents(filter = {}) {
    if (!this.agentRegistry) {
      throw new Error('Agent registry not initialized');
    }

    return this.agentRegistry.listAgents(filter);
  }

  /**
   * Grant permission to agent
   */
  async grantPermission(agentId, resourceType, permissionLevel, actions) {
    if (!this.agentRegistry) {
      throw new Error('Agent registry not initialized');
    }

    return this.agentRegistry.grantPermission(agentId, resourceType, permissionLevel, actions);
  }

  /**
   * Check agent permission
   */
  async hasPermission(agentId, resourceType, action, permissionLevel = 3) {
    if (!this.agentRegistry) {
      throw new Error('Agent registry not initialized');
    }

    return this.agentRegistry.hasPermission(agentId, resourceType, action, permissionLevel);
  }

  /**
   * Request consensus for operation
   */
  async requestConsensus(targetId, targetType, threshold = 0.90) {
    if (!this.redisCoordinator) {
      throw new Error('Redis coordinator not initialized');
    }

    return this.redisCoordinator.requestConsensus(targetId, targetType, threshold);
  }

  /**
   * Submit vote for consensus
   */
  async submitVote(consensusId, vote, confidence) {
    if (!this.redisCoordinator) {
      throw new Error('Redis coordinator not initialized');
    }

    return this.redisCoordinator.submitVote(consensusId, vote, confidence);
  }

  /**
   * Backup the system
   */
  async backup(backupPath) {
    if (!this.memoryAdapter) {
      throw new Error('Memory adapter not initialized');
    }

    console.log('💾 Creating system backup...');
    const backupFile = await this.memoryAdapter.backup(backupPath);

    // Also export registry state
    const registryState = await this.agentRegistry.exportState();
    const registryFile = `${backupPath}-registry.json`;
    require('fs').writeFileSync(registryFile, JSON.stringify(registryState, null, 2));

    console.log(`✅ System backup created: ${backupFile}`);
    return { backupFile, registryFile };
  }

  /**
   * Optimize system performance
   */
  async optimize() {
    if (!this.memoryManager) {
      throw new Error('Memory manager not initialized');
    }

    console.log('⚡ Optimizing system performance...');
    await this.memoryManager.optimize();
    await this.agentRegistry.cleanupInactiveAgents();

    console.log('✅ System optimization completed');
  }

  /**
   * Graceful shutdown
   */
  async gracefulShutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log('🛑 Shutting down SQLite Memory System...');

    try {
      // Shutdown Redis coordinator
      if (this.redisCoordinator) {
        await this.redisCoordinator.shutdown();
      }

      // Close memory adapter
      if (this.memoryAdapter) {
        await this.memoryAdapter.close();
      }

      // Close memory manager
      if (this.memoryManager) {
        await this.memoryManager.close();
      }

      this.isInitialized = false;
      console.log('✅ SQLite Memory System shut down gracefully');
      this.emit('shutdown');

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }
}

// Extend EventEmitter for event handling
SQLiteMemorySystem.prototype = Object.create(require('events').EventEmitter.prototype);
SQLiteMemorySystem.prototype.constructor = SQLiteMemorySystem;

// Export main classes
module.exports = {
  SQLiteMemorySystem,
  SwarmMemoryManager,
  MemoryStoreAdapter,
  RedisCoordinator,
  AgentRegistry,
  PerformanceBenchmarks,
  EncryptionKeyManager,
  MultiLayerCache,
  ACLEnforcer
};

// Default export for convenience
module.exports.default = SQLiteMemorySystem;