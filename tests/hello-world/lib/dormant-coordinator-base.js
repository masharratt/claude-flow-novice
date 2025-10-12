/**
 * Dormant Coordinator Base Class
 *
 * Base class for Layer 3 dormant coordinators that run as background processes.
 * Implements state machine: dormant → active → paused → active → dormant
 * Communication via Redis pub/sub only (no direct coordinator-to-coordinator calls)
 *
 * State Machine:
 * - dormant: Waiting for requests, consuming minimal resources
 * - active: Processing work, spawning agents
 * - paused: Waiting for dependencies (e.g., review results)
 *
 * Pattern: Request → Pause → Wait for response → Resume → Complete
 */

import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

export class DormantCoordinatorBase {
  constructor(id, redisUrl) {
    this.id = id;
    this.redisUrl = redisUrl;
    this.state = 'dormant';
    this.stateHistory = [];
    this.requestQueue = [];
    this.running = false;
    this.heartbeatInterval = null;
    this.messageHandlers = new Map();

    // Redis clients (separate for pub/sub)
    this.pubClient = null;
    this.subClient = null;
    this.mainClient = null;

    // Request tracking
    this.pendingRequests = new Map(); // correlationId -> request
    this.completedRequests = new Set();

    // Statistics
    this.stats = {
      requestsReceived: 0,
      requestsCompleted: 0,
      stateTransitions: 0,
      heartbeatsSent: 0,
      messagesReceived: 0,
      messagesSent: 0
    };

    this.setupMessageHandlers();
  }

  /**
   * Setup message handlers for different message types
   * Override in subclasses to add custom handlers
   */
  setupMessageHandlers() {
    this.messageHandlers.set('request', this.handleRequest.bind(this));
    this.messageHandlers.set('response', this.handleResponse.bind(this));
    this.messageHandlers.set('error', this.handleError.bind(this));
    this.messageHandlers.set('heartbeat', this.handleHeartbeat.bind(this));
  }

  /**
   * Initialize Redis connections and subscriptions
   */
  async initialize() {
    console.log(`[${this.id}] Initializing dormant coordinator...`);

    // Create Redis clients
    this.pubClient = createClient({ url: this.redisUrl });
    this.subClient = createClient({ url: this.redisUrl });
    this.mainClient = createClient({ url: this.redisUrl });

    // Connect clients
    await this.pubClient.connect();
    await this.subClient.connect();
    await this.mainClient.connect();

    console.log(`[${this.id}] Redis clients connected`);

    // Subscribe to own request channel
    await this.subClient.subscribe(`coordinator:${this.id}:requests`, (message) => {
      this.handleIncomingMessage(JSON.parse(message));
    });

    // Subscribe to own response channel
    await this.subClient.subscribe(`coordinator:${this.id}:responses`, (message) => {
      this.handleIncomingMessage(JSON.parse(message));
    });

    // Subscribe to state transition events (for monitoring)
    await this.subClient.subscribe('coordinator:state-transitions', (message) => {
      const data = JSON.parse(message);
      if (data.coordinatorId !== this.id) {
        this.stats.messagesReceived++;
      }
    });

    console.log(`[${this.id}] Subscribed to channels`);

    // Register coordinator in Redis
    await this.mainClient.hSet(`coordinator:${this.id}:info`, {
      id: this.id,
      type: this.constructor.name,
      state: this.state,
      startedAt: Date.now().toString(),
      pid: process.pid.toString()
    });

    console.log(`[${this.id}] Registered in Redis`);
  }

  /**
   * Handle incoming messages from Redis pub/sub
   */
  handleIncomingMessage(message) {
    this.stats.messagesReceived++;

    // Ignore our own messages
    if (message.from === this.id) {
      return;
    }

    // Route by task name (not message type)
    const handler = this.messageHandlers.get(message.task);
    if (handler) {
      handler(message);
    } else {
      console.log(`[${this.id}] Unknown task: ${message.task} (message type: ${message.type})`);
    }
  }

  /**
   * Handle incoming request message
   */
  async handleRequest(message) {
    console.log(`[${this.id}] Received request: ${message.task} (${message.id})`);

    this.stats.requestsReceived++;
    this.requestQueue.push(message);
  }

  /**
   * Handle response message
   */
  async handleResponse(message) {
    const request = this.pendingRequests.get(message.correlationId);

    if (!request) {
      console.log(`[${this.id}] Received response for unknown request: ${message.correlationId}`);
      return;
    }

    console.log(`[${this.id}] Received response for: ${message.correlationId}`);

    // Store response data
    request.response = message.data;
    request.responseReceived = true;

    // If we're paused waiting for this response, we can resume
    if (this.state === 'paused' && request.pausedForResponse) {
      console.log(`[${this.id}] Response received, resuming from pause`);
      this.transitionState('active');
    }
  }

  /**
   * Handle error message
   */
  async handleError(message) {
    console.error(`[${this.id}] Error from ${message.from}: ${message.error}`);
  }

  /**
   * Handle heartbeat message (from peers)
   */
  async handleHeartbeat(message) {
    // Track peer coordinators
  }

  /**
   * Transition to new state
   */
  transitionState(newState) {
    const transition = {
      from: this.state,
      to: newState,
      timestamp: Date.now()
    };

    this.stateHistory.push(transition);
    this.stats.stateTransitions++;

    console.log(`[${this.id}] State transition: ${this.state} → ${newState}`);

    this.state = newState;

    // Update Redis
    this.mainClient.hSet(`coordinator:${this.id}:info`, 'state', this.state).catch(err => {
      console.error(`[${this.id}] Failed to update state in Redis:`, err);
    });

    // Publish state transition event
    this.publishStateTransition(transition);
  }

  /**
   * Publish state transition event
   */
  async publishStateTransition(transition) {
    const event = {
      coordinatorId: this.id,
      from: transition.from,
      to: transition.to,
      timestamp: transition.timestamp
    };

    await this.pubClient.publish('coordinator:state-transitions', JSON.stringify(event));
  }

  /**
   * Start heartbeat mechanism
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const heartbeat = {
          type: 'heartbeat',
          from: this.id,
          coordinatorId: this.id,
          state: this.state,
          timestamp: Date.now(),
          stats: {
            requestsReceived: this.stats.requestsReceived,
            requestsCompleted: this.stats.requestsCompleted,
            queueSize: this.requestQueue.length,
            pendingRequests: this.pendingRequests.size
          }
        };

        await this.pubClient.publish(`coordinator:${this.id}:heartbeat`, JSON.stringify(heartbeat));
        this.stats.heartbeatsSent++;
      } catch (error) {
        console.error(`[${this.id}] Heartbeat error:`, error);
      }
    }, 5000); // Every 5 seconds

    console.log(`[${this.id}] Heartbeat started (5s interval)`);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log(`[${this.id}] Heartbeat stopped`);
    }
  }

  /**
   * Send a request to another coordinator
   */
  async sendRequest(targetCoordinator, task, data) {
    const request = {
      id: uuidv4(),
      type: 'request',
      from: this.id,
      to: targetCoordinator,
      task,
      data,
      timestamp: Date.now(),
      correlationId: uuidv4()
    };

    // Track pending request
    this.pendingRequests.set(request.correlationId, {
      request,
      sentAt: Date.now(),
      responseReceived: false,
      pausedForResponse: false
    });

    // Publish request
    await this.pubClient.publish(`coordinator:${targetCoordinator}:requests`, JSON.stringify(request));

    this.stats.messagesSent++;
    console.log(`[${this.id}] Sent request to ${targetCoordinator}: ${task}`);

    return request.correlationId;
  }

  /**
   * Send a response to another coordinator
   */
  async sendResponse(targetCoordinator, correlationId, data, success = true) {
    const response = {
      id: uuidv4(),
      type: 'response',
      from: this.id,
      to: targetCoordinator,
      correlationId,
      data,
      success,
      timestamp: Date.now()
    };

    await this.pubClient.publish(`coordinator:${targetCoordinator}:responses`, JSON.stringify(response));

    this.stats.messagesSent++;
    console.log(`[${this.id}] Sent response to ${targetCoordinator} (${correlationId})`);
  }

  /**
   * Pause and wait for a response
   */
  async pauseAndWait(correlationId, timeoutMs = 60000) {
    const request = this.pendingRequests.get(correlationId);

    if (!request) {
      throw new Error(`Unknown correlation ID: ${correlationId}`);
    }

    console.log(`[${this.id}] Pausing to wait for response: ${correlationId}`);

    // Mark request as paused for response
    request.pausedForResponse = true;

    // Transition to paused state
    this.transitionState('paused');

    // Wait for response or timeout
    const startTime = Date.now();
    while (!request.responseReceived && Date.now() - startTime < timeoutMs) {
      await this.sleep(100);
    }

    if (!request.responseReceived) {
      throw new Error(`Timeout waiting for response: ${correlationId}`);
    }

    console.log(`[${this.id}] Response received, resuming`);
    return request.response;
  }

  /**
   * Main run loop
   * Override in subclasses to implement custom processing logic
   */
  async run() {
    console.log(`[${this.id}] Starting main run loop`);
    this.running = true;

    while (this.running) {
      // Process requests when in dormant state
      if (this.state === 'dormant' && this.requestQueue.length > 0) {
        const request = this.requestQueue.shift();

        this.transitionState('active');

        try {
          await this.processRequest(request);
        } catch (error) {
          console.error(`[${this.id}] Error processing request:`, error);
        }

        this.transitionState('dormant');
      }

      await this.sleep(100);
    }

    console.log(`[${this.id}] Run loop ended`);
  }

  /**
   * Process a single request
   * Must be implemented by subclasses
   */
  async processRequest(request) {
    throw new Error('processRequest must be implemented by subclass');
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      id: this.id,
      state: this.state,
      stats: { ...this.stats },
      queueSize: this.requestQueue.length,
      pendingRequests: this.pendingRequests.size,
      completedRequests: this.completedRequests.size,
      stateTransitions: this.stateHistory.length
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log(`[${this.id}] Shutting down...`);

    this.running = false;
    this.stopHeartbeat();

    // Wait for pending requests to complete
    const maxWait = 10000; // 10 seconds
    const startTime = Date.now();

    while (this.pendingRequests.size > 0 && Date.now() - startTime < maxWait) {
      await this.sleep(100);
    }

    // Update state in Redis
    await this.mainClient.hSet(`coordinator:${this.id}:info`, 'state', 'shutdown');

    // Disconnect Redis clients
    await this.pubClient.quit();
    await this.subClient.quit();
    await this.mainClient.quit();

    console.log(`[${this.id}] Shutdown complete`);
  }

  /**
   * Helper: sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
