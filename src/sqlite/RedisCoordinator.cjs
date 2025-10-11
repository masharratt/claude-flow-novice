/**
 * RedisCoordinator - Redis pub/sub coordination for SQLite memory management
 * Phase 1 Foundation Infrastructure & Event Bus Architecture
 *
 * Provides Redis-based coordination and messaging for the swarm memory system,
 * enabling distributed coordination and state synchronization.
 */

const Redis = require('ioredis');
const EventEmitter = require('events');
const crypto = require('crypto');

class RedisCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.redisConfig = {
      host: options.redisHost || 'localhost',
      port: options.redisPort || 6379,
      password: options.redisPassword,
      db: options.redisDb || 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      ...options.redisConfig
    };

    this.swarmId = options.swarmId || 'phase-1-foundation-infrastructure';
    this.agentId = options.agentId || `agent-${crypto.randomBytes(8).toString('hex')}`;
    this.channelPrefix = options.channelPrefix || 'swarm';

    // Redis clients
    this.publisher = null;
    this.subscriber = null;
    this.client = null;

    // Connection state
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;

    // Message handling
    this.messageHandlers = new Map();
    this.messageQueue = [];
    this.processingQueue = false;

    // Coordination state
    this.activeAgents = new Map();
    this.coordinationState = {
      phase: 'phase-1',
      status: 'initializing',
      lastHeartbeat: Date.now(),
      leader: null,
      participants: []
    };

    // Metrics
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectCount: 0,
      lastHeartbeatTime: 0,
      averageLatency: 0,
      totalLatency: 0,
      latencyCount: 0
    };

    // Heartbeat interval
    this.heartbeatInterval = options.heartbeatInterval || 5000; // 5 seconds
    this.heartbeatTimer = null;

    // Bind methods
    this.onMessage = this.onMessage.bind(this);
    this.onConnect = this.onConnect.bind(this);
    this.onError = this.onError.bind(this);
    this.onClose = this.onClose.bind(this);
  }

  /**
   * Initialize Redis coordinator
   */
  async initialize() {
    try {
      console.log(`🔗 Initializing Redis Coordinator for swarm: ${this.swarmId}`);

      // Create Redis clients
      this.publisher = new Redis(this.redisConfig);
      this.subscriber = new Redis(this.redisConfig);
      this.client = new Redis(this.redisConfig);

      // Set up event handlers
      this.setupEventHandlers();

      // Connect to Redis
      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
        this.client.connect()
      ]);

      // Subscribe to swarm channels
      await this.subscribeToChannels();

      // Start heartbeat
      this.startHeartbeat();

      // Register agent
      await this.registerAgent();

      this.isConnected = true;
      this.coordinationState.status = 'active';

      console.log(`✅ Redis Coordinator initialized (Agent: ${this.agentId})`);
      this.emit('initialized', { agentId: this.agentId, swarmId: this.swarmId });

    } catch (error) {
      console.error('❌ Failed to initialize Redis Coordinator:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set up Redis event handlers
   */
  setupEventHandlers() {
    // Publisher events
    this.publisher.on('connect', this.onConnect);
    this.publisher.on('error', this.onError);

    // Subscriber events
    this.subscriber.on('connect', this.onConnect);
    this.subscriber.on('error', this.onError);
    this.subscriber.on('message', this.onMessage);

    // Client events
    this.client.on('connect', this.onConnect);
    this.client.on('error', this.onError);
    this.client.on('close', this.onClose);
  }

  /**
   * Subscribe to swarm coordination channels
   */
  async subscribeToChannels() {
    const channels = [
      `${this.channelPrefix}:${this.swarmId}:coordination`,
      `${this.channelPrefix}:${this.swarmId}:memory`,
      `${this.channelPrefix}:${this.swarmId}:events`,
      `${this.channelPrefix}:${this.swarmId}:consensus`,
      `${this.channelPrefix}:${this.swarmId}:heartbeat`,
      `${this.channelPrefix}:${this.swarmId}:sqlite`,
      `${this.channelPrefix}:global:coordination`
    ];

    await this.subscriber.subscribe(...channels);

    console.log(`📡 Subscribed to ${channels.length} channels for swarm: ${this.swarmId}`);
  }

  /**
   * Register this agent with the swarm
   */
  async registerAgent() {
    const agentInfo = {
      id: this.agentId,
      swarmId: this.swarmId,
      type: 'sqlite-coordinator',
      status: 'active',
      capabilities: ['sqlite-memory', 'acl-management', 'performance-monitoring'],
      joinedAt: new Date().toISOString(),
      lastHeartbeat: Date.now()
    };

    // Store in Redis
    await this.client.hset(
      `${this.channelPrefix}:${this.swarmId}:agents`,
      this.agentId,
      JSON.stringify(agentInfo)
    );

    // Publish registration event
    await this.publish('coordination', {
      type: 'agent_registered',
      agent: agentInfo,
      timestamp: Date.now()
    });

    // Update local state
    this.activeAgents.set(this.agentId, agentInfo);
    this.coordinationState.participants.push(this.agentId);

    console.log(`👤 Agent registered: ${this.agentId}`);
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        console.error('❌ Heartbeat failed:', error);
      }
    }, this.heartbeatInterval);
  }

  /**
   * Send heartbeat to maintain presence
   */
  async sendHeartbeat() {
    const heartbeat = {
      agentId: this.agentId,
      swarmId: this.swarmId,
      timestamp: Date.now(),
      status: 'active',
      metrics: {
        ...this.metrics,
        memoryStats: await this.getMemoryStats()
      }
    };

    // Update heartbeat in Redis
    await this.client.hset(
      `${this.channelPrefix}:${this.swarmId}:heartbeat`,
      this.agentId,
      JSON.stringify(heartbeat)
    );

    // Set expiry
    await this.client.expire(`${this.channelPrefix}:${this.swarmId}:heartbeat`, 30);

    // Update metrics
    this.metrics.lastHeartbeatTime = Date.now();

    this.emit('heartbeat', heartbeat);
  }

  /**
   * Publish message to swarm channel
   */
  async publish(channel, message, options = {}) {
    if (!this.isConnected) {
      throw new Error('Redis coordinator not connected');
    }

    const messageWrapper = {
      id: crypto.randomUUID(),
      swarmId: this.swarmId,
      senderId: this.agentId,
      channel,
      message,
      timestamp: Date.now(),
      priority: options.priority || 'normal',
      ttl: options.ttl || 3600, // 1 hour default
      ...options.metadata
    };

    const channelName = `${this.channelPrefix}:${this.swarmId}:${channel}`;

    try {
      await this.publisher.publish(channelName, JSON.stringify(messageWrapper));
      this.metrics.messagesSent++;

      // Track latency for responses
      if (options.expectResponse) {
        messageWrapper.sentAt = Date.now();
      }

      this.emit('published', { channel, message: messageWrapper });
      return messageWrapper.id;

    } catch (error) {
      console.error(`❌ Failed to publish to ${channel}:`, error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Handle incoming messages
   */
  async onMessage(channel, rawMessage) {
    try {
      const message = JSON.parse(rawMessage);
      this.metrics.messagesReceived++;

      // Calculate latency
      if (message.sentAt) {
        const latency = Date.now() - message.sentAt;
        this.metrics.totalLatency += latency;
        this.metrics.latencyCount++;
        this.metrics.averageLatency = this.metrics.totalLatency / this.metrics.latencyCount;
      }

      // Filter own messages
      if (message.senderId === this.agentId) {
        return;
      }

      // Add to queue for processing
      this.messageQueue.push({ channel, message });

      // Process queue if not already processing
      if (!this.processingQueue) {
        this.processMessageQueue();
      }

    } catch (error) {
      console.error('❌ Failed to parse message:', error);
    }
  }

  /**
   * Process message queue
   */
  async processMessageQueue() {
    this.processingQueue = true;

    while (this.messageQueue.length > 0) {
      const { channel, message } = this.messageQueue.shift();

      try {
        await this.handleMessage(channel, message);
      } catch (error) {
        console.error('❌ Failed to handle message:', error);
        this.emit('error', error);
      }
    }

    this.processingQueue = false;
  }

  /**
   * Handle individual message
   */
  async handleMessage(channel, message) {
    const channelName = channel.replace(`${this.channelPrefix}:${this.swarmId}:`, '');

    // Update coordination state based on message type
    if (message.message && message.message.type) {
      await this.updateCoordinationState(message.message);
    }

    // Call registered message handlers
    const handlers = this.messageHandlers.get(channelName);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(message);
        } catch (error) {
          console.error(`❌ Message handler error for ${channelName}:`, error);
        }
      }
    }

    // Emit generic message event
    this.emit('message', { channel: channelName, message });
  }

  /**
   * Update coordination state based on messages
   */
  async updateCoordinationState(message) {
    switch (message.type) {
      case 'agent_registered':
        if (message.agent.id !== this.agentId) {
          this.activeAgents.set(message.agent.id, message.agent);
          this.coordinationState.participants.push(message.agent.id);
        }
        break;

      case 'agent_disconnected':
        this.activeAgents.delete(message.agentId);
        const index = this.coordinationState.participants.indexOf(message.agentId);
        if (index > -1) {
          this.coordinationState.participants.splice(index, 1);
        }
        break;

      case 'phase_change':
        this.coordinationState.phase = message.phase;
        break;

      case 'leader_election':
        this.coordinationState.leader = message.leaderId;
        break;

      case 'schema_update':
        // Handle schema updates from SQLite coordination
        this.emit('schemaUpdate', message);
        break;

      case 'memory_operation':
        // Handle memory operations
        this.emit('memoryOperation', message);
        break;
    }
  }

  /**
   * Register message handler for specific channel
   */
  on(channel, handler) {
    if (!this.messageHandlers.has(channel)) {
      this.messageHandlers.set(channel, []);
    }
    this.messageHandlers.get(channel).push(handler);
  }

  /**
   * Remove message handler
   */
  off(channel, handler) {
    const handlers = this.messageHandlers.get(channel);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Get current swarm participants
   */
  async getParticipants() {
    try {
      const agents = await this.client.hgetall(`${this.channelPrefix}:${this.swarmId}:agents`);
      const participants = [];

      for (const [agentId, agentData] of Object.entries(agents)) {
        try {
          const agent = JSON.parse(agentData);
          participants.push(agent);
        } catch (error) {
          // Skip invalid agent data
        }
      }

      return participants;
    } catch (error) {
      console.error('❌ Failed to get participants:', error);
      return [];
    }
  }

  /**
   * Get memory statistics from local memory manager
   */
  async getMemoryStats() {
    try {
      // This would be populated by the SwarmMemoryManager
      // For now, return placeholder data
      return {
        totalEntries: 0,
        totalSize: 0,
        avgAccessTime: 0,
        cacheHitRate: 0
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Coordinate schema operations
   */
  async coordinateSchemaOperation(operation, details) {
    const message = {
      type: 'schema_operation',
      operation,
      details,
      requestedBy: this.agentId,
      timestamp: Date.now()
    };

    return this.publish('sqlite', message, { priority: 'high' });
  }

  /**
   * Request consensus for an operation
   */
  async requestConsensus(targetId, targetType, threshold = 0.90) {
    const consensusRequest = {
      type: 'consensus_request',
      targetId,
      targetType,
      threshold,
      requestedBy: this.agentId,
      timestamp: Date.now()
    };

    return this.publish('consensus', consensusRequest, { priority: 'high' });
  }

  /**
   * Submit vote for consensus
   */
  async submitVote(consensusId, vote, confidence) {
    const voteMessage = {
      type: 'consensus_vote',
      consensusId,
      vote,
      confidence,
      voterId: this.agentId,
      timestamp: Date.now()
    };

    return this.publish('consensus', voteMessage);
  }

  /**
   * Broadcast memory operation
   */
  async broadcastMemoryOperation(operation, key, details) {
    const message = {
      type: 'memory_operation',
      operation,
      key,
      details,
      agentId: this.agentId,
      timestamp: Date.now()
    };

    return this.publish('memory', message);
  }

  /**
   * Get coordinator metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isConnected: this.isConnected,
      activeAgents: this.activeAgents.size,
      queuedMessages: this.messageQueue.length,
      coordinationState: this.coordinationState
    };
  }

  /**
   * Handle connection events
   */
  onConnect() {
    console.log('🔗 Redis connection established');
    this.reconnectAttempts = 0;

    if (!this.isConnected) {
      this.isConnected = true;
      this.emit('connected');
    }
  }

  /**
   * Handle error events
   */
  onError(error) {
    console.error('❌ Redis error:', error);
    this.emit('error', error);
  }

  /**
   * Handle connection close events
   */
  async onClose() {
    console.log('🔌 Redis connection closed');
    this.isConnected = false;
    this.emit('disconnected');

    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.metrics.reconnectCount++;

      console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

      setTimeout(async () => {
        try {
          await this.initialize();
        } catch (error) {
          console.error('❌ Reconnection failed:', error);
        }
      }, Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)); // Exponential backoff
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.emit('reconnectionFailed');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Redis Coordinator...');

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Unregister agent
    try {
      await this.client.hdel(`${this.channelPrefix}:${this.swarmId}:agents`, this.agentId);
      await this.client.hdel(`${this.channelPrefix}:${this.swarmId}:heartbeat`, this.agentId);

      // Publish disconnection event
      await this.publish('coordination', {
        type: 'agent_disconnected',
        agentId: this.agentId,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Failed to unregister agent:', error);
    }

    // Close Redis connections
    const closePromises = [];
    if (this.publisher) closePromises.push(this.publisher.disconnect());
    if (this.subscriber) closePromises.push(this.subscriber.disconnect());
    if (this.client) closePromises.push(this.client.disconnect());

    try {
      await Promise.all(closePromises);
    } catch (error) {
      console.error('❌ Failed to close Redis connections:', error);
    }

    this.isConnected = false;
    console.log('✅ Redis Coordinator shut down');
    this.emit('shutdown');
  }
}

module.exports = RedisCoordinator;