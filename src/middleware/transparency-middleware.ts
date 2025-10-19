import { createClient, RedisClientType } from 'redis';
import { SQLiteMemorySystem, AccessLevel } from '../memory/sqlite-memory-system.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Parsed I/O structure from agent execution
 */
export interface ParsedIO {
  toolCalls: ToolCall[];
  rawInput: string;
  timestamp: number;
}

/**
 * Tool call structure extracted from I/O
 */
export interface ToolCall {
  tool: 'Edit' | 'Write' | 'Bash' | 'Task' | 'Read' | 'MultiEdit';
  parameters: Record<string, any>;
  lineNumber?: number;
}

/**
 * High-value event structure for memory storage
 */
export interface HighValueEvent {
  type: 'edit' | 'write' | 'bash' | 'task' | 'multi_edit';
  agentId: string;
  taskId?: string;
  timestamp: number;
  metadata: {
    filePath?: string;
    command?: string;
    description?: string;
    oldStringLength?: number;
    newStringLength?: number;
    contentLength?: number;
    subagentType?: string;
    replaceAll?: boolean;
    tool?: string;
  };
  confidence?: number;
  iteration?: number;
}

/**
 * Memory entry for batch storage
 */
interface MemoryEntry {
  agentId: string;
  taskId: string;
  event: HighValueEvent;
}

/**
 * Configuration for TransparencyMiddleware
 */
export interface MiddlewareConfig {
  redis: {
    host: string;
    port: number;
    channel: string;
  };
  storage: {
    database: string;
    table: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    destination: 'console' | 'file';
  };
  events: {
    emit_memory_store: boolean;
    emit_agent_lifecycle: boolean;
    emit_high_value_actions: boolean;
  };
  capture: {
    edit_operations: boolean;
    bash_commands: boolean;
    task_spawning: boolean;
    read_operations: boolean;
  };
  security: {
    anonymize_sensitive_data: boolean;
    max_payload_size_bytes: number;
  };
}

/**
 * Memory event structure for Redis pub/sub
 */
export interface MemoryEvent {
  type: 'agent_execution' | 'memory_store' | 'lifecycle' | 'high_value_action';
  timestamp: number;
  agentId: string;
  taskId?: string;
  data: Record<string, any>;
  metadata?: {
    confidence?: number;
    iteration?: number;
    loop?: number;
  };
}

/**
 * Agent execution input structure
 */
export interface AgentExecutionInput {
  command?: string;
  tool?: string;
  parameters?: Record<string, any>;
  context?: string;
}

/**
 * Logger interface for structured logging
 */
interface Logger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
}

/**
 * TransparencyMiddleware - Intercepts agent I/O and emits events to Redis
 *
 * Features:
 * - I/O interception hooks for agent operations
 * - Redis pub/sub event emission
 * - SQLite memory integration
 * - Structured logging with configurable output
 * - Graceful error handling and degradation
 * - Security features (anonymization, size limits)
 *
 * @example
 * ```typescript
 * const middleware = new TransparencyMiddleware(config);
 * await middleware.initialize();
 *
 * // Capture agent execution
 * await middleware.captureAgentExecution('backend-dev', 'npm test');
 *
 * // Emit memory event
 * await middleware.emitMemoryEvent({
 *   type: 'memory_store',
 *   timestamp: Date.now(),
 *   agentId: 'backend-dev',
 *   data: { key: 'confidence', value: 0.85 }
 * });
 * ```
 */
export class TransparencyMiddleware {
  private redisClient: RedisClientType | null = null;
  private memorySystem: SQLiteMemorySystem | null = null;
  private logger: Logger;
  private initialized: boolean = false;
  private memoryQueue: {
    agentId: string;
    taskId?: string;
    event: HighValueEvent;
  }[] = [];

  constructor(private config: MiddlewareConfig) {
    this.logger = this.createLogger();
  }

  /**
   * Batch storage for memory events with queue management
   */
  private async flushMemoryQueue(): Promise<void> {
    if (this.memoryQueue.length === 0) return;

    try {
      for (const entry of this.memoryQueue) {
        await this.storeMemory(entry.agentId, entry.taskId, entry.event);
      }

      this.logger.info('Batch memory storage completed', {
        batchSize: this.memoryQueue.length
      });

      this.memoryQueue = []; // Reset queue after successful storage
    } catch (error) {
      this.logger.error('Batch memory storage failed', {
        batchSize: this.memoryQueue.length,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Queue a memory event for batch processing
   *
   * @param agentId - Agent identifier
   * @param taskId - Optional task identifier
   * @param event - High-value event to queue
   * @param flushThreshold - Optional batch size to trigger flush (default 10)
   */
  async queueMemory(
    agentId: string,
    taskId: string | undefined,
    event: HighValueEvent,
    flushThreshold: number = 10
  ): Promise<void> {
    this.memoryQueue.push({ agentId, taskId, event });

    // Automatically flush if queue reaches threshold
    if (this.memoryQueue.length >= flushThreshold) {
      await this.flushMemoryQueue();
    }
  }

  /**
   * Initialize Redis client and SQLite memory system
   *
   * @throws {Error} If initialization fails
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('TransparencyMiddleware already initialized');
      return;
    }

    try {
      // Initialize Redis client
      this.redisClient = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port
        }
      });

      this.redisClient.on('error', (err) => {
        this.logger.error('Redis client error', { error: err.message });
      });

      await this.redisClient.connect();
      this.logger.info('Redis client connected', {
        host: this.config.redis.host,
        port: this.config.redis.port
      });

      // Initialize SQLite memory system
      this.memorySystem = new SQLiteMemorySystem(this.config.storage.database);
      await this.memorySystem.initialize();
      this.logger.info('SQLite memory system initialized', {
        database: this.config.storage.database
      });

      this.initialized = true;
      this.logger.info('TransparencyMiddleware initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize TransparencyMiddleware', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`TransparencyMiddleware initialization failed: ${error}`);
    }
  }

  /**
   * Capture agent execution event (tool calls, bash commands, etc.)
   *
   * @param agentId - Unique identifier for the agent
   * @param input - Execution input (command, tool, parameters)
   * @param taskId - Optional task identifier for CFN loop tracking
   *
   * @example
   * ```typescript
   * await middleware.captureAgentExecution('backend-dev', {
   *   command: 'npm test',
   *   tool: 'Bash',
   *   context: 'Running unit tests'
   * }, 'sprint-1.1-middleware');
   * ```
   */
  async captureAgentExecution(
    agentId: string,
    input: string | AgentExecutionInput,
    taskId?: string
  ): Promise<void> {
    if (!this.initialized) {
      this.logger.warn('TransparencyMiddleware not initialized, skipping capture');
      return;
    }

    try {
      // Convert input to string for parsing
      const inputString = typeof input === 'string'
        ? input
        : JSON.stringify(input);

      // Parse I/O to extract tool calls
      const parsed = this.parseAgentIO(inputString);

      // Extract high-value events
      const events = this.extractHighValueEvents(parsed, agentId, taskId);

      // Process each high-value event
      for (const event of events) {
        // Check capture filters
        const shouldCapture = this.shouldCaptureEvent(event.type);
        if (!shouldCapture) {
          this.logger.debug('Skipping event based on filter rules', {
            agentId,
            eventType: event.type
          });
          continue;
        }

        // Check payload size limit
        const payloadSize = JSON.stringify(event).length;
        if (payloadSize > this.config.security.max_payload_size_bytes) {
          this.logger.warn('Event payload exceeds max size limit', {
            agentId,
            eventType: event.type,
            payloadSize,
            maxSize: this.config.security.max_payload_size_bytes
          });
          continue;
        }

        // Store event in SQLite memory system
        await this.storeMemory(agentId, taskId, event);

        // Emit event to Redis if configured
        if (this.config.events.emit_high_value_actions) {
          await this.emitMemoryEvent({
            type: 'high_value_action',
            timestamp: event.timestamp,
            agentId,
            taskId,
            data: {
              eventType: event.type,
              metadata: event.metadata
            },
            metadata: {
              confidence: event.confidence,
              iteration: event.iteration
            }
          });
        }
      }

      if (events.length > 0) {
        this.logger.info('Captured agent execution with high-value events', {
          agentId,
          taskId,
          eventCount: events.length,
          eventTypes: events.map(e => e.type)
        });
      }
    } catch (error) {
      // Graceful degradation - log error but don't throw
      this.logger.error('Failed to capture agent execution', {
        agentId,
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Emit memory event to Redis pub/sub channel
   *
   * @param event - Memory event structure
   *
   * @example
   * ```typescript
   * await middleware.emitMemoryEvent({
   *   type: 'memory_store',
   *   timestamp: Date.now(),
   *   agentId: 'backend-dev',
   *   taskId: 'sprint-1.1',
   *   data: { confidence: 0.85, iteration: 1 },
   *   metadata: { loop: 3 }
   * });
   * ```
   */
  async emitMemoryEvent(event: MemoryEvent): Promise<void> {
    if (!this.initialized || !this.redisClient) {
      this.logger.warn('TransparencyMiddleware not initialized, skipping event emission');
      return;
    }

    try {
      // Validate event type against config
      if (!this.shouldEmitEvent(event.type)) {
        this.logger.debug('Skipping event emission based on config', { type: event.type });
        return;
      }

      // Publish to Redis channel
      const eventPayload = JSON.stringify(event);
      await this.redisClient.publish(this.config.redis.channel, eventPayload);

      this.logger.debug('Emitted memory event to Redis', {
        channel: this.config.redis.channel,
        type: event.type,
        agentId: event.agentId,
        taskId: event.taskId
      });

      // Store event in SQLite if memory_store type
      if (event.type === 'memory_store' && this.config.events.emit_memory_store) {
        const eventKey = `event:${event.type}:${event.agentId}:${event.timestamp}`;
        await this.memorySystem?.store(eventKey, event, 1);
      }
    } catch (error) {
      // Graceful degradation - log error but don't throw
      this.logger.error('Failed to emit memory event', {
        eventType: event.type,
        agentId: event.agentId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Parse agent I/O to extract tool calls
   *
   * @param input - Raw input string or AgentExecutionInput
   * @returns Parsed I/O structure with tool calls
   *
   * @example
   * ```typescript
   * const parsed = middleware.parseAgentIO('<invoke name="Edit">...');
   * console.log(parsed.toolCalls); // [{ tool: 'Edit', parameters: {...} }]
   * ```
   */
  private parseAgentIO(input: string): ParsedIO {
    const toolCalls: ToolCall[] = [];
    const timestamp = Date.now();

    // Pattern 1: XML-style invoke tags - <invoke name="ToolName">
    const xmlInvokeRegex = /<invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/invoke>/gi;
    let xmlMatch;

    while ((xmlMatch = xmlInvokeRegex.exec(input)) !== null) {
      const toolName = xmlMatch[1];
      const invokeContent = xmlMatch[2];

      // Skip non-high-value tools
      if (!['Edit', 'Write', 'Bash', 'Task', 'MultiEdit'].includes(toolName)) {
        continue;
      }

      const parameters: Record<string, any> = {};

      // Extract parameters from invoke block
      const paramRegex = /<parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/parameter>/gi;
      let paramMatch;

      while ((paramMatch = paramRegex.exec(invokeContent)) !== null) {
        const paramName = paramMatch[1];
        const paramValue = paramMatch[2].trim();

        // Try to parse JSON values, otherwise store as string
        try {
          parameters[paramName] = JSON.parse(paramValue);
        } catch {
          parameters[paramName] = paramValue;
        }
      }

      toolCalls.push({
        tool: toolName as ToolCall['tool'],
        parameters,
        lineNumber: this.getLineNumber(input, xmlMatch.index)
      });
    }

    // Pattern 2: Function call style - ToolName(...)
    const functionCallRegex = /\b(Edit|Write|Bash|Task|MultiEdit)\s*\([^)]*\)/gi;
    let funcMatch;

    while ((funcMatch = functionCallRegex.exec(input)) !== null) {
      const toolName = funcMatch[1];

      // Skip if already captured via XML pattern
      if (toolCalls.some(tc => tc.tool === toolName &&
          Math.abs((tc.lineNumber || 0) - this.getLineNumber(input, funcMatch.index)) < 3)) {
        continue;
      }

      toolCalls.push({
        tool: toolName as ToolCall['tool'],
        parameters: {},
        lineNumber: this.getLineNumber(input, funcMatch.index)
      });
    }

    return {
      toolCalls,
      rawInput: input,
      timestamp
    };
  }

  /**
   * Extract high-value events from parsed I/O
   *
   * @param parsed - Parsed I/O structure
   * @param agentId - Agent identifier
   * @param taskId - Optional task identifier
   * @returns Array of high-value events
   */
  private extractHighValueEvents(
    parsed: ParsedIO,
    agentId: string,
    taskId?: string
  ): HighValueEvent[] {
    const events: HighValueEvent[] = [];

    for (const toolCall of parsed.toolCalls) {
      let event: HighValueEvent | null = null;

      switch (toolCall.tool) {
        case 'Edit':
          event = {
            type: 'edit',
            agentId,
            taskId,
            timestamp: parsed.timestamp,
            metadata: {
              filePath: toolCall.parameters.file_path,
              oldStringLength: toolCall.parameters.old_string?.length,
              newStringLength: toolCall.parameters.new_string?.length,
              replaceAll: toolCall.parameters.replace_all || false,
              tool: 'Edit'
            }
          };
          break;

        case 'Write':
          event = {
            type: 'write',
            agentId,
            taskId,
            timestamp: parsed.timestamp,
            metadata: {
              filePath: toolCall.parameters.file_path,
              contentLength: toolCall.parameters.content?.length,
              tool: 'Write'
            }
          };
          break;

        case 'Bash':
          event = {
            type: 'bash',
            agentId,
            taskId,
            timestamp: parsed.timestamp,
            metadata: {
              command: toolCall.parameters.command,
              description: toolCall.parameters.description,
              tool: 'Bash'
            }
          };
          break;

        case 'Task':
          event = {
            type: 'task',
            agentId,
            taskId,
            timestamp: parsed.timestamp,
            metadata: {
              subagentType: toolCall.parameters.subagent_type || toolCall.parameters.type,
              description: toolCall.parameters.description || toolCall.parameters.task,
              tool: 'Task'
            }
          };
          break;

        case 'MultiEdit':
          event = {
            type: 'multi_edit',
            agentId,
            taskId,
            timestamp: parsed.timestamp,
            metadata: {
              filePath: toolCall.parameters.file_path,
              tool: 'MultiEdit'
            }
          };
          break;
      }

      if (event) {
        events.push(event);
      }
    }

    return events;
  }

  /**
   * Store memory event in SQLite
   *
   * @param agentId - Agent identifier
   * @param taskId - Optional task identifier
   * @param event - High-value event to store
   */
  private async storeMemory(
    agentId: string,
    taskId: string | undefined,
    event: HighValueEvent
  ): Promise<void> {
    if (!this.memorySystem) {
      this.logger.warn('Memory system not initialized, skipping storage');
      return;
    }

    try {
      const memoryKey = `agent:${agentId}:${event.type}:${event.timestamp}`;

      await this.memorySystem.store(
        memoryKey,
        {
          agentId,
          taskId,
          event,
          timestamp: event.timestamp
        },
        AccessLevel.COORDINATOR // ACL level 1
      );

      this.logger.debug('Stored high-value event in memory', {
        agentId,
        taskId,
        eventType: event.type,
        memoryKey
      });
    } catch (error) {
      this.logger.error('Failed to store memory event', {
        agentId,
        taskId,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get line number for a character index in input string
   */
  private getLineNumber(input: string, index: number): number {
    return input.substring(0, index).split('\n').length;
  }

  /**
   * Cleanup resources (close Redis connection, SQLite database)
   */
  async cleanup(): Promise<void> {
    try {
      if (this.redisClient?.isOpen) {
        await this.redisClient.quit();
        this.logger.info('Redis client disconnected');
      }

      this.initialized = false;
      this.logger.info('TransparencyMiddleware cleanup complete');
    } catch (error) {
      this.logger.error('Error during cleanup', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Create structured logger based on config
   */
  private createLogger(): Logger {
    const logLevels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = logLevels.indexOf(this.config.logging.level);

    const shouldLog = (level: string): boolean => {
      return logLevels.indexOf(level) >= currentLevelIndex;
    };

    const formatMessage = (level: string, message: string, meta?: Record<string, any>): string => {
      if (this.config.logging.format === 'json') {
        return JSON.stringify({
          level,
          message,
          timestamp: new Date().toISOString(),
          ...meta
        });
      }
      const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
      return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${metaStr}`;
    };

    const log = (level: string, message: string, meta?: Record<string, any>): void => {
      if (!shouldLog(level)) return;

      const formatted = formatMessage(level, message, meta);

      if (this.config.logging.destination === 'console') {
        console.log(formatted);
      }
      // File logging could be implemented here if needed
    };

    return {
      debug: (message, meta) => log('debug', message, meta),
      info: (message, meta) => log('info', message, meta),
      warn: (message, meta) => log('warn', message, meta),
      error: (message, meta) => log('error', message, meta)
    };
  }

  /**
   * Check if execution should be captured based on config filters
   */
  private shouldCapture(input: AgentExecutionInput): boolean {
    if (input.tool === 'Edit' || input.tool === 'Write') {
      return this.config.capture.edit_operations;
    }
    if (input.tool === 'Bash' || input.command) {
      return this.config.capture.bash_commands;
    }
    if (input.tool === 'Task') {
      return this.config.capture.task_spawning;
    }
    if (input.tool === 'Read') {
      return this.config.capture.read_operations;
    }
    return true; // Capture by default
  }

  /**
   * Check if high-value event should be captured based on config filters
   */
  private shouldCaptureEvent(eventType: HighValueEvent['type']): boolean {
    switch (eventType) {
      case 'edit':
      case 'write':
      case 'multi_edit':
        return this.config.capture.edit_operations;
      case 'bash':
        return this.config.capture.bash_commands;
      case 'task':
        return this.config.capture.task_spawning;
      default:
        return true; // Capture by default
    }
  }

  /**
   * Check if event type should be emitted based on config
   */
  private shouldEmitEvent(type: MemoryEvent['type']): boolean {
    switch (type) {
      case 'memory_store':
        return this.config.events.emit_memory_store;
      case 'lifecycle':
        return this.config.events.emit_agent_lifecycle;
      case 'high_value_action':
        return this.config.events.emit_high_value_actions;
      case 'agent_execution':
        return this.config.events.emit_high_value_actions;
      default:
        return true;
    }
  }

  /**
   * Determine if execution is a high-value action (Edit, Write, Task spawning)
   */
  private isHighValueAction(input: AgentExecutionInput): boolean {
    const highValueTools = ['Edit', 'Write', 'Task', 'MultiEdit'];
    return highValueTools.includes(input.tool || '');
  }

  /**
   * Anonymize sensitive data in execution input
   */
  private anonymizeSensitiveData(input: AgentExecutionInput): AgentExecutionInput {
    const sensitivePatterns = [
      { regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'Bearer [REDACTED]' },
      { regex: /api[_-]?key["\s:=]+[A-Za-z0-9]+/gi, replacement: 'api_key=[REDACTED]' },
      { regex: /password["\s:=]+[^\s"]+/gi, replacement: 'password=[REDACTED]' },
      { regex: /token["\s:=]+[A-Za-z0-9\-._~+/]+=*/gi, replacement: 'token=[REDACTED]' }
    ];

    const sanitized = { ...input };

    if (sanitized.command) {
      sensitivePatterns.forEach(({ regex, replacement }) => {
        sanitized.command = sanitized.command!.replace(regex, replacement);
      });
    }

    if (sanitized.parameters) {
      const paramsStr = JSON.stringify(sanitized.parameters);
      let sanitizedParams = paramsStr;
      sensitivePatterns.forEach(({ regex, replacement }) => {
        sanitizedParams = sanitizedParams.replace(regex, replacement);
      });
      sanitized.parameters = JSON.parse(sanitizedParams);
    }

    return sanitized;
  }

  /**
   * Load configuration from file
   *
   * @param configPath - Absolute path to config JSON file
   * @returns Parsed middleware configuration
   */
  static loadConfig(configPath: string): MiddlewareConfig {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(configContent) as MiddlewareConfig;
    } catch (error) {
      throw new Error(`Failed to load config from ${configPath}: ${error}`);
    }
  }
}

export default TransparencyMiddleware;
