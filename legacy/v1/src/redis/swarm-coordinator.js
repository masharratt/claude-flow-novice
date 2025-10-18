/**
 * SwarmCoordinator - Multi-Swarm Orchestration Logic
 * Phase 2: Fleet Manager Features & Advanced Capabilities
 *
 * Coordinates multiple concurrent swarms with:
 * - Leader election
 * - Task distribution
 * - Resource sharing
 * - Conflict resolution
 */

const Redis = require('ioredis');
const EventEmitter = require('events');
const SwarmRegistry = require('./swarm-registry');
const SwarmMessenger = require('./swarm-messenger');

class SwarmCoordinator extends EventEmitter {
  constructor(redisConfig = {}) {
    super();

    // Initialize Redis client
    this.redis = new Redis({
      host: redisConfig.host || 'localhost',
      port: redisConfig.port || 6379,
      db: redisConfig.db || 0,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    // Initialize registry and messenger
    this.registry = new SwarmRegistry(redisConfig);
    this.messenger = null; // Initialized per swarm

    // Configuration
    this.config = {
      leaderElectionInterval: 10000, // 10 seconds
      leaderTTL: 30, // 30 seconds
      taskDistributionStrategy: 'least_loaded', // or 'round_robin', 'priority'
      resourcePoolKey: 'swarm:resources',
      leaderKey: 'swarm:leader',
      taskQueueKey: 'swarm:tasks:queue',
      conflictResolutionStrategy: 'priority', // or 'timestamp', 'voting'
      maxRetries: 3,
      ...redisConfig,
    };

    // State
    this.swarmId = null;
    this.isLeader = false;
    this.leadershipTimer = null;
    this.currentLeader = null;
    this.taskQueue = [];
    this.resourceAllocations = new Map();

    // Statistics
    this.stats = {
      tasksDistributed: 0,
      tasksCompleted: 0,
      resourceAllocations: 0,
      conflictsResolved: 0,
      leadershipChanges: 0,
    };

    this.initialized = false;
  }

  /**
   * Initialize coordinator for a specific swarm
   */
  async initialize(swarmId) {
    if (this.initialized) {
      return;
    }

    this.swarmId = swarmId;

    try {
      // Initialize registry
      await this.registry.initialize();

      // Initialize messenger
      this.messenger = new SwarmMessenger({
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
      });
      await this.messenger.initialize(swarmId);

      // Setup message handlers
      this.setupMessageHandlers();

      // Register swarm events
      this.setupSwarmEventHandlers();

      // Participate in leader election
      await this.participateInLeaderElection();

      // Subscribe to coordination channels
      await this.messenger.subscribeToPattern('swarm:coordination:*');
      await this.messenger.subscribeToChannel('swarm:tasks');
      await this.messenger.subscribeToChannel('swarm:resources');

      this.initialized = true;
      console.log(`✅ SwarmCoordinator initialized for swarm: ${swarmId}`);

      this.emit('initialized', { swarmId, isLeader: this.isLeader });
    } catch (error) {
      console.error('❌ SwarmCoordinator initialization failed:', error);
      throw error;
    }
  }

  /**
   * Leader election using Redis
   */
  async participateInLeaderElection() {
    try {
      // Attempt to become leader
      const acquired = await this.redis.set(
        this.config.leaderKey,
        this.swarmId,
        'EX',
        this.config.leaderTTL,
        'NX'
      );

      if (acquired) {
        await this.becomeLeader();
      } else {
        await this.becomeFollower();
      }

      // Start leadership monitoring
      this.startLeadershipMonitoring();
    } catch (error) {
      console.error('❌ Leader election failed:', error);
      await this.becomeFollower();
    }
  }

  /**
   * Become the leader
   */
  async becomeLeader() {
    if (this.isLeader) {
      return;
    }

    this.isLeader = true;
    this.currentLeader = this.swarmId;
    this.stats.leadershipChanges++;

    console.log(`👑 Swarm ${this.swarmId} became LEADER`);

    // Announce leadership
    await this.messenger.broadcast({
      type: 'leadership_announcement',
      leader: this.swarmId,
      timestamp: Date.now(),
    });

    // Start leader responsibilities
    this.startLeaderDuties();

    this.emit('became_leader', { swarmId: this.swarmId });
  }

  /**
   * Become a follower
   */
  async becomeFollower() {
    if (!this.isLeader) {
      return;
    }

    this.isLeader = false;

    console.log(`📋 Swarm ${this.swarmId} became FOLLOWER`);

    // Stop leader duties
    this.stopLeaderDuties();

    // Get current leader
    this.currentLeader = await this.redis.get(this.config.leaderKey);

    this.emit('became_follower', { swarmId: this.swarmId, leader: this.currentLeader });
  }

  /**
   * Monitor leadership and renew if leader
   */
  startLeadershipMonitoring() {
    this.leadershipTimer = setInterval(async () => {
      try {
        const currentLeader = await this.redis.get(this.config.leaderKey);

        if (this.isLeader) {
          // Renew leadership
          await this.redis.expire(this.config.leaderKey, this.config.leaderTTL);
        } else if (!currentLeader) {
          // Leader lost, attempt election
          await this.participateInLeaderElection();
        } else if (currentLeader !== this.currentLeader) {
          // New leader detected
          this.currentLeader = currentLeader;
          console.log(`ℹ️ New leader detected: ${currentLeader}`);
          this.emit('leader_changed', { newLeader: currentLeader });
        }
      } catch (error) {
        console.error('❌ Leadership monitoring error:', error);
      }
    }, this.config.leaderElectionInterval);
  }

  /**
   * Start leader-specific duties
   */
  startLeaderDuties() {
    // Task distribution
    this.taskDistributionTimer = setInterval(async () => {
      await this.distributeQueuedTasks();
    }, 5000); // Every 5 seconds

    // Resource management
    this.resourceManagementTimer = setInterval(async () => {
      await this.optimizeResourceAllocation();
    }, 15000); // Every 15 seconds

    // Health monitoring
    this.healthMonitoringTimer = setInterval(async () => {
      await this.monitorSwarmHealth();
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop leader duties
   */
  stopLeaderDuties() {
    if (this.taskDistributionTimer) {
      clearInterval(this.taskDistributionTimer);
    }
    if (this.resourceManagementTimer) {
      clearInterval(this.resourceManagementTimer);
    }
    if (this.healthMonitoringTimer) {
      clearInterval(this.healthMonitoringTimer);
    }
  }

  /**
   * Distribute task to appropriate swarm
   */
  async distributeTask(task) {
    this.ensureInitialized();

    try {
      // If leader, distribute directly
      if (this.isLeader) {
        return await this.performTaskDistribution(task);
      }

      // Otherwise, forward to leader
      if (this.currentLeader) {
        await this.messenger.sendToSwarm(this.currentLeader, {
          type: 'task_submission',
          task,
        });
        console.log(`📤 Task forwarded to leader: ${this.currentLeader}`);
        return { queued: true, leader: this.currentLeader };
      }

      // No leader, queue locally
      await this.queueTask(task);
      return { queued: true, waiting_for_leader: true };
    } catch (error) {
      console.error('❌ Task distribution failed:', error);
      throw error;
    }
  }

  /**
   * Perform actual task distribution (leader only)
   */
  async performTaskDistribution(task) {
    if (!this.isLeader) {
      throw new Error('Only leader can distribute tasks');
    }

    try {
      // Get all active swarms
      const swarms = await this.registry.getSwarms({ status: 'active' });

      if (swarms.length === 0) {
        await this.queueTask(task);
        return { queued: true, reason: 'no_active_swarms' };
      }

      // Select target swarm based on strategy
      const targetSwarm = await this.selectTargetSwarm(swarms, task);

      // Assign task
      await this.messenger.sendToSwarm(targetSwarm.id, {
        type: 'task_assignment',
        task,
        assignedBy: this.swarmId,
        timestamp: Date.now(),
      });

      this.stats.tasksDistributed++;

      console.log(`🎯 Task distributed to swarm: ${targetSwarm.id}`);
      this.emit('task_distributed', { task, targetSwarm: targetSwarm.id });

      return {
        distributed: true,
        targetSwarm: targetSwarm.id,
        strategy: this.config.taskDistributionStrategy,
      };
    } catch (error) {
      console.error('❌ Task distribution failed:', error);
      await this.queueTask(task);
      throw error;
    }
  }

  /**
   * Select target swarm based on distribution strategy
   */
  async selectTargetSwarm(swarms, task) {
    switch (this.config.taskDistributionStrategy) {
      case 'least_loaded':
        return this.selectLeastLoadedSwarm(swarms);

      case 'round_robin':
        return this.selectRoundRobinSwarm(swarms);

      case 'priority':
        return this.selectByPriority(swarms, task);

      case 'capability':
        return this.selectByCapability(swarms, task);

      default:
        return swarms[0];
    }
  }

  /**
   * Select least loaded swarm
   */
  selectLeastLoadedSwarm(swarms) {
    return swarms.reduce((least, current) => {
      const leastLoad = least.tasks?.length || 0;
      const currentLoad = current.tasks?.length || 0;
      return currentLoad < leastLoad ? current : least;
    });
  }

  /**
   * Round robin selection
   */
  selectRoundRobinSwarm(swarms) {
    if (!this.roundRobinIndex) {
      this.roundRobinIndex = 0;
    }
    const selected = swarms[this.roundRobinIndex % swarms.length];
    this.roundRobinIndex++;
    return selected;
  }

  /**
   * Select by priority
   */
  selectByPriority(swarms, task) {
    const taskPriority = task.priority || 'normal';

    // Match swarm priority with task priority
    const priorityMatch = swarms.find(s =>
      s.metadata?.priority === taskPriority
    );

    return priorityMatch || this.selectLeastLoadedSwarm(swarms);
  }

  /**
   * Select by capability
   */
  selectByCapability(swarms, task) {
    const requiredCapabilities = task.capabilities || [];

    if (requiredCapabilities.length === 0) {
      return this.selectLeastLoadedSwarm(swarms);
    }

    // Find swarm with matching capabilities
    const capableSwarm = swarms.find(s => {
      const swarmCapabilities = s.metadata?.capabilities || [];
      return requiredCapabilities.every(cap =>
        swarmCapabilities.includes(cap)
      );
    });

    return capableSwarm || this.selectLeastLoadedSwarm(swarms);
  }

  /**
   * Queue task for later distribution
   */
  async queueTask(task) {
    try {
      const queueEntry = {
        id: this.generateTaskId(),
        task,
        queuedAt: Date.now(),
        queuedBy: this.swarmId,
      };

      await this.redis.lpush(
        this.config.taskQueueKey,
        JSON.stringify(queueEntry)
      );

      this.taskQueue.push(queueEntry);

      console.log(`📥 Task queued: ${queueEntry.id}`);
      this.emit('task_queued', queueEntry);
    } catch (error) {
      console.error('❌ Failed to queue task:', error);
      throw error;
    }
  }

  /**
   * Distribute queued tasks (leader only)
   */
  async distributeQueuedTasks() {
    if (!this.isLeader) {
      return;
    }

    try {
      const queueLength = await this.redis.llen(this.config.taskQueueKey);

      if (queueLength === 0) {
        return;
      }

      console.log(`📋 Processing ${queueLength} queued tasks...`);

      // Process up to 10 tasks per cycle
      const batchSize = Math.min(queueLength, 10);

      for (let i = 0; i < batchSize; i++) {
        const entryStr = await this.redis.rpop(this.config.taskQueueKey);
        if (!entryStr) break;

        const entry = JSON.parse(entryStr);
        await this.performTaskDistribution(entry.task);
      }
    } catch (error) {
      console.error('❌ Failed to distribute queued tasks:', error);
    }
  }

  /**
   * Allocate resource to swarm
   */
  async allocateResource(resourceType, swarmId, amount) {
    this.ensureInitialized();

    try {
      // If not leader, forward request
      if (!this.isLeader && this.currentLeader) {
        await this.messenger.sendToSwarm(this.currentLeader, {
          type: 'resource_allocation_request',
          resourceType,
          swarmId,
          amount,
        });
        return { requested: true, leader: this.currentLeader };
      }

      // Check resource availability
      const available = await this.getAvailableResources(resourceType);

      if (available < amount) {
        throw new Error(`Insufficient ${resourceType}: requested ${amount}, available ${available}`);
      }

      // Allocate resource
      const allocationKey = `${this.config.resourcePoolKey}:${resourceType}:${swarmId}`;
      await this.redis.incrby(allocationKey, amount);

      // Decrease available pool
      const poolKey = `${this.config.resourcePoolKey}:${resourceType}:available`;
      await this.redis.decrby(poolKey, amount);

      this.stats.resourceAllocations++;

      console.log(`🎁 Allocated ${amount} ${resourceType} to swarm ${swarmId}`);
      this.emit('resource_allocated', { resourceType, swarmId, amount });

      return { allocated: true, resourceType, amount };
    } catch (error) {
      console.error('❌ Resource allocation failed:', error);
      throw error;
    }
  }

  /**
   * Release resource from swarm
   */
  async releaseResource(resourceType, swarmId, amount) {
    try {
      const allocationKey = `${this.config.resourcePoolKey}:${resourceType}:${swarmId}`;
      await this.redis.decrby(allocationKey, amount);

      const poolKey = `${this.config.resourcePoolKey}:${resourceType}:available`;
      await this.redis.incrby(poolKey, amount);

      console.log(`🔄 Released ${amount} ${resourceType} from swarm ${swarmId}`);
      this.emit('resource_released', { resourceType, swarmId, amount });
    } catch (error) {
      console.error('❌ Resource release failed:', error);
    }
  }

  /**
   * Get available resources
   */
  async getAvailableResources(resourceType) {
    const poolKey = `${this.config.resourcePoolKey}:${resourceType}:available`;
    const available = await this.redis.get(poolKey);
    return parseInt(available) || 0;
  }

  /**
   * Optimize resource allocation across swarms
   */
  async optimizeResourceAllocation() {
    if (!this.isLeader) {
      return;
    }

    try {
      const swarms = await this.registry.getSwarms({ status: 'active' });

      // Analyze resource usage patterns
      for (const swarm of swarms) {
        const load = swarm.tasks?.length || 0;
        const agents = swarm.agents?.length || 0;

        // Simple heuristic: reallocate if underutilized
        if (load === 0 && agents > 2) {
          console.log(`⚡ Swarm ${swarm.id} appears underutilized`);
          // Could trigger resource rebalancing here
        }
      }
    } catch (error) {
      console.error('❌ Resource optimization failed:', error);
    }
  }

  /**
   * Resolve conflict between swarms
   */
  async resolveConflict(conflict) {
    this.ensureInitialized();

    try {
      console.log(`⚖️ Resolving conflict: ${conflict.type}`);

      let resolution;

      switch (this.config.conflictResolutionStrategy) {
        case 'priority':
          resolution = this.resolveBySwarmPriority(conflict);
          break;

        case 'timestamp':
          resolution = this.resolveByTimestamp(conflict);
          break;

        case 'voting':
          resolution = await this.resolveByVoting(conflict);
          break;

        default:
          resolution = this.resolveBySwarmPriority(conflict);
      }

      this.stats.conflictsResolved++;

      console.log(`✅ Conflict resolved: ${JSON.stringify(resolution)}`);
      this.emit('conflict_resolved', { conflict, resolution });

      return resolution;
    } catch (error) {
      console.error('❌ Conflict resolution failed:', error);
      throw error;
    }
  }

  /**
   * Resolve conflict by swarm priority
   */
  resolveBySwarmPriority(conflict) {
    const priorities = { high: 3, normal: 2, low: 1 };

    const swarmA = conflict.swarmA;
    const swarmB = conflict.swarmB;

    const priorityA = priorities[swarmA.metadata?.priority || 'normal'];
    const priorityB = priorities[swarmB.metadata?.priority || 'normal'];

    return {
      winner: priorityA >= priorityB ? swarmA.id : swarmB.id,
      strategy: 'priority',
      reason: `Priority ${priorityA} vs ${priorityB}`,
    };
  }

  /**
   * Resolve conflict by timestamp (first-come-first-served)
   */
  resolveByTimestamp(conflict) {
    const swarmA = conflict.swarmA;
    const swarmB = conflict.swarmB;

    return {
      winner: swarmA.createdAt <= swarmB.createdAt ? swarmA.id : swarmB.id,
      strategy: 'timestamp',
      reason: 'First-come-first-served',
    };
  }

  /**
   * Resolve conflict by voting
   */
  async resolveByVoting(conflict) {
    // Broadcast vote request to all active swarms
    await this.messenger.broadcast({
      type: 'conflict_vote_request',
      conflict,
      voteId: this.generateTaskId(),
    });

    // Collect votes (simplified - in production would wait for responses)
    return {
      winner: conflict.swarmA.id,
      strategy: 'voting',
      reason: 'Voting in progress',
    };
  }

  /**
   * Monitor health of all swarms
   */
  async monitorSwarmHealth() {
    if (!this.isLeader) {
      return;
    }

    try {
      const swarms = await this.registry.getSwarms({ status: 'active' });

      for (const swarm of swarms) {
        const timeSinceHeartbeat = Date.now() - swarm.lastHeartbeat;

        if (timeSinceHeartbeat > 60000) {
          console.warn(`⚠️ Swarm ${swarm.id} health check failed (no heartbeat for ${timeSinceHeartbeat}ms)`);

          // Mark as potentially interrupted
          await this.registry.updateSwarm(swarm.id, {
            status: 'interrupted',
            metadata: {
              ...swarm.metadata,
              interruptedAt: Date.now(),
              reason: 'heartbeat_timeout',
            },
          });

          this.emit('swarm_health_issue', { swarmId: swarm.id, issue: 'heartbeat_timeout' });
        }
      }
    } catch (error) {
      console.error('❌ Health monitoring failed:', error);
    }
  }

  /**
   * Setup message handlers
   */
  setupMessageHandlers() {
    // Task-related messages
    this.messenger.onMessage('task_submission', async (payload, envelope) => {
      if (this.isLeader) {
        await this.performTaskDistribution(payload.task);
      }
    });

    this.messenger.onMessage('task_assignment', (payload) => {
      console.log(`📋 Task assigned: ${payload.task.description || 'No description'}`);
      this.emit('task_assigned', payload);
    });

    this.messenger.onMessage('task_completed', (payload) => {
      this.stats.tasksCompleted++;
      this.emit('task_completed', payload);
    });

    // Resource messages
    this.messenger.onMessage('resource_allocation_request', async (payload) => {
      if (this.isLeader) {
        await this.allocateResource(payload.resourceType, payload.swarmId, payload.amount);
      }
    });

    // Leadership messages
    this.messenger.onMessage('leadership_announcement', (payload) => {
      this.currentLeader = payload.leader;
      console.log(`ℹ️ Leadership announcement: ${payload.leader}`);
    });

    // Conflict messages
    this.messenger.onMessage('conflict_detected', async (payload) => {
      if (this.isLeader) {
        await this.resolveConflict(payload.conflict);
      }
    });
  }

  /**
   * Setup swarm event handlers
   */
  setupSwarmEventHandlers() {
    this.registry.on('swarm_registered', (swarm) => {
      console.log(`📝 New swarm registered: ${swarm.id}`);
    });

    this.registry.on('swarm_deregistered', ({ swarmId, reason }) => {
      console.log(`🗑️ Swarm deregistered: ${swarmId} (${reason})`);

      // Release resources if any
      // Implementation would check and release allocated resources
    });

    this.registry.on('interrupted_swarms_detected', (swarms) => {
      if (this.isLeader && swarms.length > 0) {
        console.log(`🔄 Initiating recovery for ${swarms.length} interrupted swarms`);
        // Could trigger recovery procedures
      }
    });
  }

  /**
   * Get coordinator statistics
   */
  async getStatistics() {
    const registryStats = await this.registry.getStatistics();
    const messengerStats = this.messenger ? this.messenger.getStatistics() : {};

    return {
      coordinator: {
        ...this.stats,
        isLeader: this.isLeader,
        currentLeader: this.currentLeader,
        taskQueueSize: this.taskQueue.length,
      },
      registry: registryStats,
      messenger: messengerStats,
    };
  }

  /**
   * Utility methods
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('SwarmCoordinator not initialized. Call initialize(swarmId) first.');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down SwarmCoordinator...');

    // Stop leadership monitoring
    if (this.leadershipTimer) {
      clearInterval(this.leadershipTimer);
    }

    // Stop leader duties
    this.stopLeaderDuties();

    // Release leadership if leader
    if (this.isLeader) {
      await this.redis.del(this.config.leaderKey);
    }

    // Shutdown components
    if (this.messenger) {
      await this.messenger.shutdown();
    }

    await this.registry.shutdown();

    if (this.redis) {
      await this.redis.quit();
    }

    this.initialized = false;
    console.log('✅ SwarmCoordinator shutdown complete');
  }
}

module.exports = SwarmCoordinator;
