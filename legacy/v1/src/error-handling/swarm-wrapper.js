/**
 * Swarm Error Handling Wrapper
 *
 * Provides comprehensive error handling and recovery for swarm execution.
 */

import { ErrorHandler, SwarmError, ValidationError, TimeoutError, ResourceError } from './index.js';
import { ValidationSchema, ValidationTypes, ValidationConstraints } from './validation.js';

/**
 * Swarm error handling configuration
 */
const SWARM_ERROR_CONFIG = {
  // Retry configuration
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    retryableErrors: ['TIMEOUT', 'NETWORK', 'RESOURCE']
  },

  // Timeout configuration
  timeouts: {
    agentSpawn: 30000,      // 30 seconds
    taskExecution: 300000,  // 5 minutes
    swarmInitialization: 60000, // 1 minute
    cleanup: 15000         // 15 seconds
  },

  // Resource limits
  limits: {
    maxAgents: 50,
    maxTasksPerAgent: 10,
    maxExecutionTime: 3600000, // 1 hour
    maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
    maxDiskUsage: 100 * 1024 * 1024 // 100MB
  },

  // Validation schemas
  validation: {
    objective: ValidationSchema.create({
      objective: new ValidationRule(ValidationTypes.STRING, {
        [ValidationConstraints.REQUIRED]: true,
        [ValidationConstraints.MIN_LENGTH]: 1,
        [ValidationConstraints.MAX_LENGTH]: 2000,
        [ValidationConstraints.TRIM]: true,
        [ValidationConstraints.SANITIZE_HTML]: true,
        [ValidationConstraints.NORMALIZE_WHITESPACE]: true
      })
    }),
    swarmConfig: ValidationSchema.create({
      strategy: new ValidationRule(ValidationTypes.STRING, {
        [ValidationConstraints.REQUIRED]: true,
        [ValidationConstraints.ENUM]: ['auto', 'development', 'research', 'testing', 'analysis', 'optimization']
      }),
      mode: new ValidationRule(ValidationTypes.STRING, {
        [ValidationConstraints.REQUIRED]: true,
        [ValidationConstraints.ENUM]: ['centralized', 'distributed', 'hierarchical', 'mesh', 'hybrid']
      }),
      maxAgents: new ValidationRule(ValidationTypes.NUMBER, {
        [ValidationConstraints.REQUIRED]: true,
        [ValidationConstraints.MIN_VALUE]: 1,
        [ValidationConstraints.MAX_VALUE]: 50,
        [ValidationConstraints.INTEGER]: true
      }),
      timeout: new ValidationRule(ValidationTypes.NUMBER, {
        [ValidationConstraints.MIN_VALUE]: 1,
        [ValidationConstraints.MAX_VALUE]: 3600,
        [ValidationConstraints.INTEGER]: true,
        [ValidationConstraints.DEFAULT]: 300
      })
    })
  }
};

/**
 * Swarm Error Handler class
 */
export class SwarmErrorHandler extends ErrorHandler {
  constructor() {
    super({
      enableLogging: true,
      enableMetrics: true,
      enableRecovery: true,
      maxRetries: SWARM_ERROR_CONFIG.retry.maxAttempts
    });

    this.setupRecoveryStrategies();
    this.setupMonitoring();
  }

  /**
   * Setup recovery strategies for swarm-specific errors
   */
  setupRecoveryStrategies() {
    // Agent spawn failure recovery
    this.registerRecoveryStrategy('SPAWN_ERROR', async (error, context) => {
      console.log(`🔄 Attempting to recover from agent spawn failure...`);

      // Wait before retry
      await this.delay(SWARM_ERROR_CONFIG.retry.baseDelay);

      // Reduce agent count if resource issue
      if (error.context.maxAgents > 1) {
        const newMaxAgents = Math.max(1, Math.floor(error.context.maxAgents * 0.8));
        console.log(`📉 Reducing max agents from ${error.context.maxAgents} to ${newMaxAgents}`);

        // Retry with reduced agent count
        return {
          action: 'retry_with_reduced_agents',
          maxAgents: newMaxAgents,
          suggestions: ['Consider reducing system load', 'Check available memory']
        };
      }

      throw new Error('Cannot recover from agent spawn failure');
    });

    // Timeout recovery
    this.registerRecoveryStrategy('TIMEOUT', async (error, context) => {
      console.log(`🔄 Attempting to recover from timeout...`);

      if (context.retryCount < SWARM_ERROR_CONFIG.retry.maxAttempts) {
        const newTimeout = Math.min(
          error.context.timeout * SWARM_ERROR_CONFIG.retry.backoffFactor,
          SWARM_ERROR_CONFIG.timeouts.taskExecution
        );

        console.log(`⏱️ Increasing timeout from ${error.context.timeout} to ${newTimeout}ms`);

        return {
          action: 'retry_with_extended_timeout',
          timeout: newTimeout,
          suggestions: ['Consider breaking task into smaller parts', 'Check system performance']
        };
      }

      throw new Error('Timeout recovery attempts exhausted');
    });

    // Resource exhaustion recovery
    this.registerRecoveryStrategy('RESOURCE', async (error, context) => {
      console.log(`🔄 Attempting to recover from resource exhaustion...`);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('🗑️ Forced garbage collection');
      }

      // Suggest resource optimization
      return {
        action: 'optimize_resources',
        suggestions: [
          'Reduce concurrent agent count',
          'Free up system memory',
          'Close unnecessary applications',
          'Consider using smaller swarm'
        ]
      };
    });

    // Swarm coordination failure recovery
    this.registerRecoveryStrategy('COORDINATION_ERROR', async (error, context) => {
      console.log(`🔄 Attempting to recover from coordination failure...`);

      // Attempt to reset swarm state
      return {
        action: 'reset_swarm_state',
        suggestions: [
          'Check network connectivity',
          'Verify Redis connection',
          'Restart swarm coordination'
        ]
      };
    });
  }

  /**
   * Setup monitoring for swarm health
   */
  setupMonitoring() {
    // Monitor swarm execution
    this.on('error', (error) => {
      if (error.type === 'SWARM') {
        this.trackSwarmError(error);
      }
    });

    // Monitor recovery attempts
    this.on('recovered', (recovery) => {
      console.log(`✅ Successfully recovered from ${recovery.strategy} error`);
    });

    this.on('recovery-failed', (recovery) => {
      console.log(`❌ Recovery failed for ${recovery.strategy}: ${recovery.recoveryError.message}`);
    });
  }

  /**
   * Track swarm-specific errors
   */
  trackSwarmError(error) {
    const swarmErrorKey = `swarm:${error.context.swarmId || 'unknown'}`;
    const errorCount = this.errorCounts.get(swarmErrorKey) || 0;

    this.errorCounts.set(swarmErrorKey, errorCount + 1);

    // If too many errors for a swarm, suggest termination
    if (errorCount > 5) {
      console.log(`⚠️ Swarm ${error.context.swarmId} has ${errorCount} errors. Consider terminating.`);
    }
  }

  /**
   * Validate swarm configuration
   */
  validateSwarmConfig(config) {
    const result = SWARM_ERROR_CONFIG.validation.swarmConfig.validate(config);

    if (!result.valid) {
      throw new ValidationError('Invalid swarm configuration', {
        context: {
          config,
          errors: result.errors
        },
        suggestions: [
          'Check required fields',
          'Verify parameter types and ranges',
          'Review swarm configuration documentation'
        ]
      });
    }

    return result.data;
  }

  /**
   * Validate objective
   */
  validateObjective(objective) {
    const result = SWARM_ERROR_CONFIG.validation.objective.validate({ objective });

    if (!result.valid) {
      throw new ValidationError('Invalid objective', {
        context: {
          objective,
          errors: result.errors
        },
        suggestions: [
          'Provide a clear, specific objective',
          'Avoid special characters or HTML',
          'Keep objective concise but descriptive'
        ]
      });
    }

    return result.data.objective;
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn, timeoutMs, context = {}) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`, {
          context: { ...context, timeout: timeoutMs }
        }));
      }, timeoutMs);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry(fn, options = {}) {
    const config = {
      maxAttempts: SWARM_ERROR_CONFIG.retry.maxAttempts,
      baseDelay: SWARM_ERROR_CONFIG.retry.baseDelay,
      maxDelay: SWARM_ERROR_CONFIG.retry.maxDelay,
      backoffFactor: SWARM_ERROR_CONFIG.retry.backoffFactor,
      retryableErrors: SWARM_ERROR_CONFIG.retry.retryableErrors,
      ...options
    };

    let lastError;
    let attempt = 0;

    while (attempt < config.maxAttempts) {
      attempt++;

      try {
        const result = await fn();

        if (attempt > 1) {
          console.log(`✅ Operation succeeded on attempt ${attempt}`);
        }

        return result;
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = config.retryableErrors.includes(error.type) ||
                          config.retryableErrors.includes(error.code);

        if (!isRetryable || attempt >= config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay
        );

        console.log(`⚠️ Attempt ${attempt} failed (${error.message}). Retrying in ${delay}ms...`);
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Monitor resource usage
   */
  monitorResourceUsage() {
    const usage = process.memoryUsage();
    const memoryMB = Math.round(usage.heapUsed / 1024 / 1024);

    if (memoryMB > 500) { // 500MB threshold
      console.log(`⚠️ High memory usage: ${memoryMB}MB`);

      if (memoryMB > SWARM_ERROR_CONFIG.limits.maxMemoryUsage / 1024 / 1024) {
        throw new ResourceError(`Memory usage exceeded limit: ${memoryMB}MB`, {
          context: { memoryUsage: usage },
          suggestions: [
            'Reduce concurrent agent count',
            'Free up system memory',
            'Restart swarm execution'
          ]
        });
      }
    }

    return usage;
  }

  /**
   * Delay helper function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wrap swarm coordinator with error handling
   */
  wrapSwarmCoordinator(coordinator) {
    const self = this;

    return {
      async initialize(config) {
        try {
          // Validate configuration
          const validatedConfig = self.validateSwarmConfig(config);

          // Initialize with timeout
          return await self.executeWithTimeout(
            () => coordinator.initialize(validatedConfig),
            SWARM_ERROR_CONFIG.timeouts.swarmInitialization,
            { operation: 'initialize', config: validatedConfig }
          );
        } catch (error) {
          throw await self.handleError(error, {
            operation: 'swarm_initialize',
            config
          });
        }
      },

      async addAgent(type, name) {
        try {
          self.monitorResourceUsage();

          return await self.executeWithTimeout(
            () => coordinator.addAgent(type, name),
            SWARM_ERROR_CONFIG.timeouts.agentSpawn,
            { operation: 'add_agent', type, name }
          );
        } catch (error) {
          throw await self.handleError(error, {
            operation: 'add_agent',
            type,
            name
          });
        }
      },

      async executeTask(task) {
        try {
          self.monitorResourceUsage();

          return await self.executeWithRetry(
            () => self.executeWithTimeout(
              () => coordinator.executeTask(task),
              SWARM_ERROR_CONFIG.timeouts.taskExecution,
              { operation: 'execute_task', task }
            ),
            { context: { task } }
          );
        } catch (error) {
          throw await self.handleError(error, {
            operation: 'execute_task',
            task
          });
        }
      },

      async cleanup() {
        try {
          return await self.executeWithTimeout(
            () => coordinator.cleanup(),
            SWARM_ERROR_CONFIG.timeouts.cleanup,
            { operation: 'cleanup' }
          );
        } catch (error) {
          throw await self.handleError(error, {
            operation: 'cleanup'
          });
        }
      },

      // Pass through other methods
      getStatus: () => coordinator.getStatus(),
      getAgents: () => coordinator.getAgents(),
      getTasks: () => coordinator.getTasks()
    };
  }

  /**
   * Create swarm error handler instance
   */
  static create() {
    return new SwarmErrorHandler();
  }
}

/**
 * Convenience function to wrap swarm execution
 */
export function wrapSwarmExecution(objective, flags, executor) {
  const errorHandler = SwarmErrorHandler.create();

  return async () => {
    try {
      // Validate inputs
      const validatedObjective = errorHandler.validateObjective(objective);
      const validatedConfig = errorHandler.validateSwarmConfig(flags);

      console.log(`✅ Validated objective: ${validatedObjective}`);
      console.log(`✅ Validated configuration`);

      // Monitor resources before execution
      errorHandler.monitorResourceUsage();

      // Execute with error handling
      const result = await executor(validatedObjective, validatedConfig);

      console.log(`✅ Swarm execution completed successfully`);
      return result;

    } catch (error) {
      const processedError = await errorHandler.handleError(error, {
        objective,
        flags
      });

      console.error(`❌ Swarm execution failed: ${processedError.message}`);

      if (processedError.suggestions && processedError.suggestions.length > 0) {
        console.error(`💡 Suggestions: ${processedError.suggestions.join(', ')}`);
      }

      throw processedError;
    }
  };
}

export default SwarmErrorHandler;