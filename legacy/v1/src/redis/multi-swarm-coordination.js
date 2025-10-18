/**
 * Multi-Swarm Coordination API
 * Phase 2: Fleet Manager Features & Advanced Capabilities
 *
 * Complete multi-swarm coordination system with:
 * - Registry for swarm discovery and management
 * - Messenger for inter-swarm communication
 * - Coordinator for orchestration and leader election
 * - StateManager for persistence and recovery
 */

const SwarmRegistry = require('./swarm-registry');
const SwarmMessenger = require('./swarm-messenger');
const SwarmCoordinator = require('./swarm-coordinator');
const SwarmStateManager = require('./swarm-state-manager');

/**
 * Multi-Swarm Coordination System
 */
class MultiSwarmCoordination {
  constructor(redisConfig = {}) {
    this.config = {
      host: redisConfig.host || 'localhost',
      port: redisConfig.port || 6379,
      db: redisConfig.db || 0,
      ...redisConfig,
    };

    // Core components
    this.registry = new SwarmRegistry(this.config);
    this.stateManager = new SwarmStateManager(this.config);
    this.coordinators = new Map();
    this.messengers = new Map();

    this.initialized = false;
  }

  /**
   * Initialize the coordination system
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    console.log('🚀 Initializing Multi-Swarm Coordination System...');

    try {
      // Initialize registry and state manager
      await this.registry.initialize();
      await this.stateManager.initialize();

      this.initialized = true;
      console.log('✅ Multi-Swarm Coordination System initialized');

      return {
        success: true,
        message: 'Coordination system ready',
      };
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create and register a new swarm
   */
  async createSwarm(swarmConfig) {
    this.ensureInitialized();

    try {
      // Register swarm
      const swarm = await this.registry.registerSwarm(swarmConfig);

      // Initialize coordinator
      const coordinator = new SwarmCoordinator(this.config);
      await coordinator.initialize(swarm.id);
      this.coordinators.set(swarm.id, coordinator);

      // Get messenger from coordinator
      this.messengers.set(swarm.id, coordinator.messenger);

      // Save initial state
      await this.stateManager.saveState(swarm.id, {
        ...swarm,
        initializedAt: Date.now(),
      });

      // Start automatic snapshots
      this.stateManager.startAutomaticSnapshots(swarm.id);

      console.log(`✅ Swarm created: ${swarm.id}`);

      return {
        success: true,
        swarm,
        coordinator,
      };
    } catch (error) {
      console.error('❌ Failed to create swarm:', error);
      throw error;
    }
  }

  /**
   * Get swarm by ID
   */
  async getSwarm(swarmId) {
    return await this.registry.getSwarm(swarmId);
  }

  /**
   * Get all swarms with filters
   */
  async getSwarms(filters = {}) {
    return await this.registry.getSwarms(filters);
  }

  /**
   * Get coordinator for swarm
   */
  getCoordinator(swarmId) {
    return this.coordinators.get(swarmId);
  }

  /**
   * Get messenger for swarm
   */
  getMessenger(swarmId) {
    return this.messengers.get(swarmId);
  }

  /**
   * Send message between swarms
   */
  async sendMessage(fromSwarmId, toSwarmId, message) {
    const messenger = this.messengers.get(fromSwarmId);
    if (!messenger) {
      throw new Error(`Messenger not found for swarm ${fromSwarmId}`);
    }

    return await messenger.sendToSwarm(toSwarmId, message);
  }

  /**
   * Broadcast message to all swarms
   */
  async broadcast(swarmId, message) {
    const messenger = this.messengers.get(swarmId);
    if (!messenger) {
      throw new Error(`Messenger not found for swarm ${swarmId}`);
    }

    return await messenger.broadcast(message);
  }

  /**
   * Distribute task across swarms
   */
  async distributeTask(swarmId, task) {
    const coordinator = this.coordinators.get(swarmId);
    if (!coordinator) {
      throw new Error(`Coordinator not found for swarm ${swarmId}`);
    }

    return await coordinator.distributeTask(task);
  }

  /**
   * Allocate resource to swarm
   */
  async allocateResource(swarmId, resourceType, amount) {
    const coordinator = this.coordinators.get(swarmId);
    if (!coordinator) {
      throw new Error(`Coordinator not found for swarm ${swarmId}`);
    }

    return await coordinator.allocateResource(resourceType, swarmId, amount);
  }

  /**
   * Release resource from swarm
   */
  async releaseResource(swarmId, resourceType, amount) {
    const coordinator = this.coordinators.get(swarmId);
    if (!coordinator) {
      throw new Error(`Coordinator not found for swarm ${swarmId}`);
    }

    return await coordinator.releaseResource(resourceType, swarmId, amount);
  }

  /**
   * Update swarm state
   */
  async updateSwarmState(swarmId, updates) {
    await this.registry.updateSwarm(swarmId, updates);
    await this.stateManager.updateState(swarmId, updates);

    return { success: true, swarmId, updates };
  }

  /**
   * Recover interrupted swarm
   */
  async recoverSwarm(swarmId) {
    return await this.stateManager.recoverSwarm(swarmId);
  }

  /**
   * Create snapshot of swarm state
   */
  async createSnapshot(swarmId, label = '') {
    return await this.stateManager.createSnapshot(swarmId, label);
  }

  /**
   * Restore swarm from snapshot
   */
  async restoreFromSnapshot(swarmId, snapshotId) {
    return await this.stateManager.restoreFromSnapshot(swarmId, snapshotId);
  }

  /**
   * Deregister swarm
   */
  async deregisterSwarm(swarmId, reason = 'completed') {
    // Stop automatic snapshots
    this.stateManager.stopAutomaticSnapshots(swarmId);

    // Shutdown coordinator
    const coordinator = this.coordinators.get(swarmId);
    if (coordinator) {
      await coordinator.shutdown();
      this.coordinators.delete(swarmId);
    }

    // Remove messenger
    this.messengers.delete(swarmId);

    // Deregister from registry
    await this.registry.deregisterSwarm(swarmId, reason);

    console.log(`✅ Swarm deregistered: ${swarmId}`);

    return { success: true, swarmId, reason };
  }

  /**
   * Get system statistics
   */
  async getStatistics() {
    const registryStats = await this.registry.getStatistics();
    const stateStats = await this.stateManager.getStatistics();

    const coordinatorStats = [];
    for (const [swarmId, coordinator] of this.coordinators.entries()) {
      const stats = await coordinator.getStatistics();
      coordinatorStats.push({ swarmId, ...stats });
    }

    return {
      registry: registryStats,
      state: stateStats,
      coordinators: coordinatorStats,
      activeCoordinators: this.coordinators.size,
      activeMessengers: this.messengers.size,
    };
  }

  /**
   * Discover interrupted swarms
   */
  async discoverInterruptedSwarms() {
    return await this.registry.discoverInterruptedSwarms();
  }

  /**
   * Recover all interrupted swarms
   */
  async recoverAllInterrupted() {
    const interrupted = await this.discoverInterruptedSwarms();
    const results = [];

    for (const swarm of interrupted) {
      try {
        const result = await this.recoverSwarm(swarm.id);
        results.push({ swarmId: swarm.id, ...result });
      } catch (error) {
        results.push({
          swarmId: swarm.id,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      total: interrupted.length,
      results,
    };
  }

  /**
   * Ensure system is initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Multi-Swarm Coordination System not initialized. Call initialize() first.');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Multi-Swarm Coordination System...');

    // Shutdown all coordinators
    for (const [swarmId, coordinator] of this.coordinators.entries()) {
      console.log(`   Shutting down coordinator for swarm ${swarmId}...`);
      await coordinator.shutdown();
    }
    this.coordinators.clear();

    // Clear messengers
    this.messengers.clear();

    // Shutdown components
    if (this.stateManager) {
      await this.stateManager.shutdown();
    }

    if (this.registry) {
      await this.registry.shutdown();
    }

    this.initialized = false;
    console.log('✅ Multi-Swarm Coordination System shutdown complete');
  }
}

/**
 * Factory function for creating coordination system
 */
function createMultiSwarmCoordination(redisConfig = {}) {
  return new MultiSwarmCoordination(redisConfig);
}

// Exports
module.exports = {
  MultiSwarmCoordination,
  SwarmRegistry,
  SwarmMessenger,
  SwarmCoordinator,
  SwarmStateManager,
  createMultiSwarmCoordination,
};
