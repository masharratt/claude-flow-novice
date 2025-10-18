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
import { createSecureLogger } from '../../../src/security/secure-logger.js';

export class DormantCoordinatorBase {
  constructor(id, redisUrl, options = {}) {
    this.id = id;
    this.redisUrl = redisUrl;
    this.state = 'dormant';
    this.stateHistory = [];
    this.requestQueue = [];
    this.running = false;
    this.heartbeatInterval = null;
    this.messageHandlers = new Map();

    // Secure logging (VULN-005 mitigation)
    this.logger = createSecureLogger(this.id, {
      enableDebug: options.enableDebug || false,
      enableRateLimiting: true,
      rateLimitMax: 100,
      rateLimitWindow: 1000
    });

    // Redis clients (separate for pub/sub)
    this.pubClient = null;
    this.subClient = null;
    this.mainClient = null;

    // Request tracking
    this.pendingRequests = new Map(); // correlationId -> request
    this.completedRequests = new Set();

    // Queue bounds (VULN-004 mitigation: DoS prevention)
    this.MAX_QUEUE_SIZE = parseInt(options.env?.MAX_QUEUE_SIZE || process.env.MAX_QUEUE_SIZE) || 1000;

    // Rate limiting (VULN-004 mitigation: DoS prevention)
    this.RATE_LIMIT_WINDOW_MS = parseInt(options.env?.RATE_LIMIT_WINDOW_MS || process.env.RATE_LIMIT_WINDOW_MS) || 60000; // 1 minute
    this.RATE_LIMIT_MAX_REQUESTS = parseInt(options.env?.RATE_LIMIT_MAX_REQUESTS || process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
    this.rateLimits = new Map(); // sender -> { count, resetTime }
    this.rateLimitCleanupInterval = null;

    // Statistics
    this.stats = {
      requestsReceived: 0,
      requestsCompleted: 0,
      stateTransitions: 0,
      heartbeatsSent: 0,
      messagesReceived: 0,
      messagesSent: 0,
      queueOverflows: 0,
      rateLimitViolations: 0,
      rateLimitEntriesCleaned: 0
    };

    this.setupMessageHandlers();
  }

  /**
   * Setup message handlers for different message types
   * Override in subclasses to add custom handlers
   */
  setupMessageHandlers() {
    console.log(`[${this.id}] [DEBUG] Registering base message handlers`);

    this.messageHandlers.set('request', this.handleRequest.bind(this));
    this.messageHandlers.set('response', this.handleResponse.bind(this));
    this.messageHandlers.set('error', this.handleError.bind(this));
    this.messageHandlers.set('heartbeat', this.handleHeartbeat.bind(this));

    console.log(`[${this.id}] [DEBUG] Base handlers registered:`, Array.from(this.messageHandlers.keys()));
  }

  /**
   * Initialize Redis connections and subscriptions
   */
  async initialize() {
    this.logger.info('Initializing dormant coordinator');

    // Create Redis clients
    this.pubClient = createClient({ url: this.redisUrl });
    this.subClient = createClient({ url: this.redisUrl });
    this.mainClient = createClient({ url: this.redisUrl });

    // Connect clients
    await this.pubClient.connect();
    await this.subClient.connect();
    await this.mainClient.connect();

    this.logger.info('Redis clients connected');

    console.log(`[${this.id}] [DEBUG] Setting up Redis subscriptions...`);

    // Subscribe to own request channel
    await this.subClient.subscribe(`coordinator:${this.id}:requests`, (message) => {
      console.log(`[${this.id}] [DEBUG] Raw Redis message received on requests channel:`, {
        channel: `coordinator:${this.id}:requests`,
        messageLength: message.length,
        messagePreview: message.substring(0, 200)
      });
      try {
        const parsed = JSON.parse(message);
        console.log(`[${this.id}] [DEBUG] Parsed message successfully:`, {
          type: parsed.type,
          task: parsed.task,
          from: parsed.from
        });
        this.handleIncomingMessage(parsed);
      } catch (error) {
        console.error(`[${this.id}] [DEBUG] Failed to parse message:`, error);
      }
    });

    console.log(`[${this.id}] [DEBUG] Subscribed to: coordinator:${this.id}:requests`);

    // Subscribe to own response channel
    await this.subClient.subscribe(`coordinator:${this.id}:responses`, (message) => {
      console.log(`[${this.id}] [DEBUG] Raw Redis message received on responses channel:`, {
        channel: `coordinator:${this.id}:responses`,
        messageLength: message.length,
        messagePreview: message.substring(0, 200)
      });
      try {
        const parsed = JSON.parse(message);
        console.log(`[${this.id}] [DEBUG] Parsed message successfully:`, {
          type: parsed.type,
          task: parsed.task,
          from: parsed.from
        });
        this.handleIncomingMessage(parsed);
      } catch (error) {
        console.error(`[${this.id}] [DEBUG] Failed to parse message:`, error);
      }
    });

    console.log(`[${this.id}] [DEBUG] Subscribed to: coordinator:${this.id}:responses`);

    // Subscribe to state transition events (for monitoring)
    await this.subClient.subscribe('coordinator:state-transitions', (message) => {
      console.log(`[${this.id}] [DEBUG] State transition event received`);
      const data = JSON.parse(message);
      if (data.coordinatorId !== this.id) {
        this.stats.messagesReceived++;
      }
    });

    console.log(`[${this.id}] [DEBUG] Subscribed to: coordinator:state-transitions`);

    this.logger.info('Subscribed to channels');
    console.log(`[${this.id}] [DEBUG] All Redis subscriptions active`);

    // Register coordinator in Redis
    await this.mainClient.hSet(`coordinator:${this.id}:info`, {
      id: this.id,
      type: this.constructor.name,
      state: this.state,
      startedAt: Date.now().toString(),
      pid: process.pid.toString()
    });

    this.logger.info('Registered in Redis');

    // Start rate limit cleanup interval (every 5 minutes)
    this.startRateLimitCleanup();
  }

  /**
   * Handle incoming messages from Redis pub/sub
   */
  async handleIncomingMessage(message) {
    this.stats.messagesReceived++;

    console.log(`[${this.id}] [DEBUG] Redis message received:`, {
      from: message.from,
      to: message.to,
      type: message.type,
      task: message.task,
      hasSignature: !!message.signature,
      hasCorrelationId: !!message.correlationId,
      timestamp: message.timestamp
    });

    // Ignore our own messages
    if (message.from === this.id) {
      console.log(`[${this.id}] [DEBUG] Ignoring own message`);
      return;
    }

    console.log(`[${this.id}] [DEBUG] Handler lookup:`, {
      taskName: message.task,
      messageType: message.type,
      availableHandlers: Array.from(this.messageHandlers.keys())
    });

    // Route by type first (request, response, error, heartbeat)
    let handler = this.messageHandlers.get(message.type);

    // Fall back to task for custom handlers
    if (!handler && message.task) {
      handler = this.messageHandlers.get(message.task);
    }

    console.log(`[${this.id}] [DEBUG] Handler found:`, {
      type: message.type,
      task: message.task,
      handlerExists: !!handler,
      handlerType: handler ? typeof handler : 'undefined',
      routedBy: handler ? (this.messageHandlers.has(message.type) ? 'type' : 'task') : 'none'
    });

    if (handler) {
      console.log(`[${this.id}] [DEBUG] Executing handler for type: ${message.type}, task: ${message.task}`);
      try {
        await handler(message);
        console.log(`[${this.id}] [DEBUG] Handler execution complete for type: ${message.type}, task: ${message.task}`);
      } catch (error) {
        console.error(`[${this.id}] [DEBUG] Handler execution error:`, {
          type: message.type,
          task: message.task,
          error: error.message,
          stack: error.stack
        });
        this.logger.error('Handler error', {
          error: error.message,
          type: message.type,
          task: message.task,
          from: message.from
        });
      }
    } else {
      console.log(`[${this.id}] [DEBUG] No handler found for type: ${message.type}, task: ${message.task}`);
      this.logger.debug(`No handler for type: ${message.type}, task: ${message.task}`);
    }
  }

  /**
   * Enforce rate limiting for incoming requests
   *
   * Security: Prevents DoS attacks via request flooding (VULN-004, CVSS 7.5)
   * Tracks requests per sender with sliding window
   *
   * @param {string} sender - Sender ID from message
   * @throws {Error} If rate limit exceeded
   */
  enforceRateLimit(sender) {
    const now = Date.now();
    let limit = this.rateLimits.get(sender);

    // Initialize or reset window if expired
    if (!limit || now > limit.resetTime) {
      limit = {
        count: 0,
        resetTime: now + this.RATE_LIMIT_WINDOW_MS
      };
      this.rateLimits.set(sender, limit);
    }

    // Check if limit exceeded
    if (limit.count >= this.RATE_LIMIT_MAX_REQUESTS) {
      this.stats.rateLimitViolations++;

      throw new Error(
        `Rate limit exceeded: ${sender} (${this.RATE_LIMIT_MAX_REQUESTS} req/min)`
      );
    }

    // Increment counter
    limit.count++;
  }

  /**
   * Start rate limit cleanup interval
   *
   * Periodically removes expired rate limit entries to prevent memory buildup
   */
  startRateLimitCleanup() {
    this.rateLimitCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [sender, limit] of this.rateLimits.entries()) {
        if (now > limit.resetTime) {
          this.rateLimits.delete(sender);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.stats.rateLimitEntriesCleaned += cleaned;
        this.logger.debug(`Cleaned ${cleaned} expired rate limit entries`);
      }
    }, 300000); // Every 5 minutes

    this.logger.debug('Rate limit cleanup started (5min interval)');
  }

  /**
   * Stop rate limit cleanup interval
   */
  stopRateLimitCleanup() {
    if (this.rateLimitCleanupInterval) {
      clearInterval(this.rateLimitCleanupInterval);
      this.rateLimitCleanupInterval = null;
      this.logger.debug('Rate limit cleanup stopped');
    }
  }

  /**
   * Handle incoming request message
   *
   * Security: Enforces rate limiting and queue bounds (VULN-004 mitigation)
   */
  async handleRequest(message) {
    this.logger.info(`Received request: ${message.task}`, { id: message.id });

    try {
      // Rate limiting check
      const sender = message.from;
      this.enforceRateLimit(sender);

      // Queue bounds check
      if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
        this.stats.queueOverflows++;

        throw new Error(
          `Queue full: ${this.MAX_QUEUE_SIZE} (dropping message from ${sender})`
        );
      }

      // Accept request
      this.stats.requestsReceived++;
      this.requestQueue.push(message);
    } catch (error) {
      this.logger.error('[SECURITY] Request rejected', {
        error: error.message,
        from: message.from,
        messageId: message.id,
        queueSize: this.requestQueue.length,
        rateLimitViolations: this.stats.rateLimitViolations,
        queueOverflows: this.stats.queueOverflows
      });

      // Re-throw to prevent message processing
      throw error;
    }
  }

  /**
   * Handle response message
   */
  async handleResponse(message) {
    console.log(`[${this.id}] [DEBUG] handleResponse called:`, {
      correlationId: message.correlationId,
      hasData: !!message.data,
      pendingRequestCount: this.pendingRequests.size,
      currentState: this.state
    });

    const request = this.pendingRequests.get(message.correlationId);

    console.log(`[${this.id}] [DEBUG] Pending request lookup:`, {
      correlationId: message.correlationId,
      requestFound: !!request,
      pausedForResponse: request?.pausedForResponse,
      responseAlreadyReceived: request?.responseReceived
    });

    if (!request) {
      this.logger.warn('Received response for unknown request', { correlationId: message.correlationId });
      console.log(`[${this.id}] [DEBUG] Available correlation IDs:`, Array.from(this.pendingRequests.keys()));
      return;
    }

    this.logger.info('Received response', { correlationId: message.correlationId });
    console.log(`[${this.id}] [DEBUG] Storing response data...`);

    // Store response data
    request.response = message.data;
    request.responseReceived = true;

    console.log(`[${this.id}] [DEBUG] Response stored:`, {
      correlationId: message.correlationId,
      responseReceived: request.responseReceived,
      hasResponseData: !!request.response
    });

    // If we're paused waiting for this response, we can resume
    if (this.state === 'paused' && request.pausedForResponse) {
      this.logger.info('Response received, resuming from pause');
      console.log(`[${this.id}] [DEBUG] Transitioning from paused to active`);
      this.transitionState('active');
    } else {
      console.log(`[${this.id}] [DEBUG] Not transitioning state:`, {
        currentState: this.state,
        isPaused: this.state === 'paused',
        pausedForResponse: request.pausedForResponse
      });
    }
  }

  /**
   * Handle error message
   */
  async handleError(message) {
    this.logger.error(`Error from ${message.from}`, { error: message.error });
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

    this.logger.info(`State transition: ${this.state} → ${newState}`);

    this.state = newState;

    // Update Redis
    this.mainClient.hSet(`coordinator:${this.id}:info`, 'state', this.state).catch(err => {
      this.logger.error('Failed to update state in Redis', err);
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
        this.logger.error('Heartbeat error', error);
      }
    }, 5000); // Every 5 seconds

    this.logger.info('Heartbeat started (5s interval)');
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.logger.info('Heartbeat stopped');
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
    this.logger.info(`Sent request to ${targetCoordinator}`, { task });

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
    this.logger.info(`Sent response to ${targetCoordinator}`, { correlationId });
  }

  /**
   * Pause and wait for a response
   */
  async pauseAndWait(correlationId, timeoutMs = 60000) {
    const request = this.pendingRequests.get(correlationId);

    if (!request) {
      throw new Error(`Unknown correlation ID: ${correlationId}`);
    }

    this.logger.info('Pausing to wait for response', { correlationId });

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

    this.logger.info('Response received, resuming');
    return request.response;
  }

  /**
   * Main run loop
   * Override in subclasses to implement custom processing logic
   */
  async run() {
    this.logger.info('Starting main run loop');
    this.running = true;

    while (this.running) {
      // Process requests when in dormant state
      if (this.state === 'dormant' && this.requestQueue.length > 0) {
        const request = this.requestQueue.shift();

        this.transitionState('active');

        try {
          await this.processRequest(request);
        } catch (error) {
          this.logger.error('Error processing request', error);
        }

        this.transitionState('dormant');
      }

      await this.sleep(100);
    }

    this.logger.info('Run loop ended');
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
      stateTransitions: this.stateHistory.length,
      rateLimiting: {
        maxQueueSize: this.MAX_QUEUE_SIZE,
        rateLimitMaxRequests: this.RATE_LIMIT_MAX_REQUESTS,
        rateLimitWindowMs: this.RATE_LIMIT_WINDOW_MS,
        activeRateLimits: this.rateLimits.size
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.logger.info('Shutting down');

    this.running = false;
    this.stopHeartbeat();
    this.stopRateLimitCleanup();

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

    this.logger.info('Shutdown complete');
  }

  /**
   * Helper: sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
