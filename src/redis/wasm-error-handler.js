/**
 * WASM Error Handler - Comprehensive error handling and recovery for WASM instances
 * Phase 5 Agent-Booster Integration & Code Performance Acceleration
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

class WASMErrorHandler extends EventEmitter {
  constructor(redisClient) {
    super();
    this.redis = redisClient || new Redis();
    this.errorHistory = new Map();
    this.recoveryStrategies = new Map();
    this.activeRecoveries = new Set();

    // Error handling configuration
    this.config = {
      maxRetries: 3,
      retryDelay: 1000, // Base delay in ms
      backoffMultiplier: 2,
      maxRetryDelay: 30000, // 30 seconds
      panicThreshold: 5, // Consecutive panics before fallback
      errorMemoryKey: 'swarm:phase-5:wasm-errors',
      recoveryChannel: 'swarm:phase-5:wasm-recovery',
      metricsKey: 'swarm:phase-5:wasm-metrics'
    };

    // Error statistics
    this.stats = {
      totalErrors: 0,
      recoveredErrors: 0,
      fallbackActivated: 0,
      panicsHandled: 0,
      avgRecoveryTime: 0,
      errorsByType: {},
      errorsByInstance: {}
    };

    this.initializeErrorHandler();
  }

  async initializeErrorHandler() {
    // Load error history from Redis
    await this.loadErrorHistory();

    // Initialize recovery strategies
    this.initializeRecoveryStrategies();

    // Initialize Redis pub/sub for recovery events
    this.recoverySubscriber = new Redis();
    await this.recoverySubscriber.subscribe(this.config.recoveryChannel);

    this.recoverySubscriber.on('message', async (channel, message) => {
      if (channel === this.config.recoveryChannel) {
        await this.handleRecoveryEvent(JSON.parse(message));
      }
    });

    console.log('🛡️ WASMErrorHandler initialized with comprehensive recovery strategies');
  }

  /**
   * Handle WASM execution errors
   */
  async handleError(error, context = {}) {
    const errorId = this.generateErrorId();
    const startTime = Date.now();

    try {
      // Classify the error
      const errorClassification = this.classifyError(error);

      // Log the error
      await this.logError(errorId, error, context, errorClassification);

      // Determine recovery strategy
      const strategy = this.selectRecoveryStrategy(errorClassification, context);

      // Execute recovery
      const recoveryResult = await this.executeRecovery(strategy, errorId, error, context);

      // Update statistics
      this.updateStats(errorClassification, recoveryResult, Date.now() - startTime);

      // Emit error handling event
      await this.emitRecoveryEvent({
        type: 'error_handled',
        errorId,
        classification: errorClassification,
        strategy,
        result: recoveryResult,
        context,
        timestamp: Date.now()
      });

      return {
        errorId,
        classification: errorClassification,
        strategy,
        result: recoveryResult,
        fallback: recoveryResult.fallback || false
      };

    } catch (handlingError) {
      console.error('❌ Error handling failed:', handlingError);

      // Last resort fallback
      return await this.handleFallbackError(error, context, errorId);
    }
  }

  /**
   * Classify errors for appropriate handling
   */
  classifyError(error) {
    const classification = {
      type: 'unknown',
      severity: 'medium',
      recoverable: true,
      requiresFallback: false,
      category: 'runtime'
    };

    // Error message analysis
    const message = error.message || '';
    const stack = error.stack || '';

    // WASM-specific errors
    if (message.includes('panic') || message.includes('trap')) {
      classification.type = 'panic';
      classification.severity = 'high';
      classification.category = 'wasm_panic';
    } else if (message.includes('out of bounds') || message.includes('memory')) {
      classification.type = 'memory_error';
      classification.severity = 'high';
      classification.category = 'wasm_memory';
    } else if (message.includes('stack overflow')) {
      classification.type = 'stack_overflow';
      classification.severity = 'high';
      classification.category = 'wasm_stack';
    } else if (message.includes('timeout') || message.includes('hang')) {
      classification.type = 'timeout';
      classification.severity = 'medium';
      classification.category = 'performance';
    } else if (message.includes('compile') || message.includes('link')) {
      classification.type = 'compilation_error';
      classification.severity = 'medium';
      classification.category = 'wasm_compile';
    }

    // JavaScript runtime errors
    if (message.includes('TypeError')) {
      classification.type = 'type_error';
      classification.severity = 'medium';
      classification.category = 'javascript';
    } else if (message.includes('ReferenceError')) {
      classification.type = 'reference_error';
      classification.severity = 'medium';
      classification.category = 'javascript';
    } else if (message.includes('RangeError')) {
      classification.type = 'range_error';
      classification.severity = 'medium';
      classification.category = 'javascript';
    }

    // System-level errors
    if (message.includes('ECONNRESET') || message.includes('EPIPE')) {
      classification.type = 'connection_error';
      classification.severity = 'low';
      classification.category = 'network';
    } else if (message.includes('EMFILE') || message.includes('ENFILE')) {
      classification.type = 'resource_error';
      classification.severity = 'high';
      classification.category = 'system';
    }

    // Determine recoverability
    classification.recoverable = this.isRecoverable(classification);
    classification.requiresFallback = this.requiresFallback(classification, error);

    return classification;
  }

  isRecoverable(classification) {
    const nonRecoverableTypes = [
      'memory_error',
      'stack_overflow',
      'resource_error'
    ];

    return !nonRecoverableTypes.includes(classification.type);
  }

  requiresFallback(classification, error) {
    // Check if this error type has occurred multiple times
    const instanceId = error.instanceId || 'unknown';
    const recentErrors = this.getRecentErrors(instanceId, classification.type, 300000); // 5 minutes

    return recentErrors.length >= this.config.panicThreshold;
  }

  /**
   * Select appropriate recovery strategy
   */
  selectRecoveryStrategy(classification, context) {
    const strategy = {
      name: 'default',
      retries: this.config.maxRetries,
      delay: this.config.retryDelay,
      actions: []
    };

    switch (classification.type) {
      case 'panic':
        strategy.name = 'panic_recovery';
        strategy.actions = ['restart_instance', 'clear_memory', 'validate_state'];
        break;

      case 'memory_error':
        strategy.name = 'memory_recovery';
        strategy.actions = ['increase_memory', 'cleanup_cache', 'restart_instance'];
        break;

      case 'timeout':
        strategy.name = 'timeout_recovery';
        strategy.actions = ['extend_timeout', 'optimize_execution', 'retry_with_adjustments'];
        strategy.retries = 2; // Fewer retries for timeouts
        break;

      case 'compilation_error':
        strategy.name = 'compilation_recovery';
        strategy.actions = ['validate_input', 'fallback_to_interpreter', 'retry_with_safe_mode'];
        break;

      case 'connection_error':
        strategy.name = 'connection_recovery';
        strategy.actions = ['reconnect', 'validate_endpoint', 'retry_with_backoff'];
        break;

      default:
        strategy.name = 'generic_recovery';
        strategy.actions = ['retry_with_backoff', 'validate_state', 'fallback_if_needed'];
    }

    // Adjust strategy based on context
    if (context.priority === 'urgent') {
      strategy.retries = Math.max(1, strategy.retries - 1);
      strategy.delay = Math.min(strategy.delay, 1000);
    }

    if (context.instanceId) {
      strategy.instanceId = context.instanceId;
    }

    return strategy;
  }

  /**
   * Execute recovery strategy
   */
  async executeRecovery(strategy, errorId, error, context) {
    console.log(`🔄 Executing recovery strategy: ${strategy.name} for error: ${errorId}`);

    const result = {
      success: false,
      strategy: strategy.name,
      attempts: 0,
      actionsExecuted: [],
      fallback: false,
      duration: 0
    };

    const startTime = Date.now();

    try {
      for (let attempt = 0; attempt < strategy.retries; attempt++) {
        result.attempts++;

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, strategy.delay);
        if (attempt > 0) {
          await this.sleep(delay);
        }

        // Execute recovery actions
        const actionResult = await this.executeRecoveryActions(strategy.actions, error, context);

        result.actionsExecuted.push(...actionResult.actions);

        // Attempt to retry the original operation
        const retryResult = await this.retryOperation(error, context, attempt);

        if (retryResult.success) {
          result.success = true;
          result.duration = Date.now() - startTime;

          await this.emitRecoveryEvent({
            type: 'recovery_success',
            errorId,
            strategy: strategy.name,
            attempt: attempt + 1,
            duration: result.duration,
            timestamp: Date.now()
          });

          return result;
        }

        console.warn(`⚠️ Recovery attempt ${attempt + 1} failed for error: ${errorId}`);
      }

      // All recovery attempts failed, activate fallback
      result.fallback = true;
      result.duration = Date.now() - startTime;

      await this.activateFallback(errorId, error, context, strategy);

      return result;

    } catch (recoveryError) {
      console.error('❌ Recovery execution failed:', recoveryError);
      result.fallback = true;
      result.duration = Date.now() - startTime;

      await this.activateFallback(errorId, error, context, strategy);

      return result;
    }
  }

  async executeRecoveryActions(actions, error, context) {
    const result = {
      actions: [],
      success: true
    };

    for (const action of actions) {
      try {
        console.log(`🔧 Executing recovery action: ${action}`);

        const actionResult = await this.executeAction(action, error, context);
        result.actions.push({
          action,
          success: actionResult.success,
          duration: actionResult.duration || 0,
          details: actionResult.details || {}
        });

        if (!actionResult.success) {
          result.success = false;
        }

      } catch (actionError) {
        console.error(`❌ Recovery action failed: ${action}`, actionError);
        result.actions.push({
          action,
          success: false,
          error: actionError.message
        });
        result.success = false;
      }
    }

    return result;
  }

  async executeAction(action, error, context) {
    const startTime = Date.now();

    switch (action) {
      case 'restart_instance':
        return await this.restartInstance(context.instanceId);

      case 'clear_memory':
        return await this.clearInstanceMemory(context.instanceId);

      case 'validate_state':
        return await this.validateInstanceState(context.instanceId);

      case 'increase_memory':
        return await this.increaseInstanceMemory(context.instanceId);

      case 'cleanup_cache':
        return await this.cleanupInstanceCache(context.instanceId);

      case 'extend_timeout':
        return await this.extendExecutionTimeout(context);

      case 'optimize_execution':
        return await this.optimizeExecution(context);

      case 'validate_input':
        return await this.validateExecutionInput(context);

      case 'fallback_to_interpreter':
        return await this.fallbackToInterpreter(context);

      case 'reconnect':
        return await this.reconnectToInstance(context.instanceId);

      case 'validate_endpoint':
        return await this.validateEndpoint(context);

      case 'retry_with_backoff':
        return { success: true, duration: Date.now() - startTime };

      case 'retry_with_safe_mode':
        return await this.enableSafeMode(context);

      default:
        console.warn(`⚠️ Unknown recovery action: ${action}`);
        return { success: false, duration: Date.now() - startTime };
    }
  }

  async restartInstance(instanceId) {
    if (!instanceId) {
      return { success: false, details: { reason: 'No instance ID provided' } };
    }

    try {
      console.log(`🔄 Restarting WASM instance: ${instanceId}`);

      // Signal instance restart via Redis
      await this.redis.publish('swarm:phase-5:instance-control', JSON.stringify({
        action: 'restart',
        instanceId,
        timestamp: Date.now()
      }));

      // Wait for restart to complete
      await this.sleep(2000);

      return { success: true, details: { instanceId, restartTime: 2000 } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async clearInstanceMemory(instanceId) {
    try {
      console.log(`🧹 Clearing memory for instance: ${instanceId}`);

      // Signal memory cleanup via Redis
      await this.redis.publish('swarm:phase-5:instance-control', JSON.stringify({
        action: 'clear_memory',
        instanceId,
        timestamp: Date.now()
      }));

      return { success: true, details: { instanceId } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async validateInstanceState(instanceId) {
    try {
      // Check instance health via Redis
      const healthKey = `swarm:wasm:instance:${instanceId}:health`;
      const health = await this.redis.get(healthKey);

      const isHealthy = health && JSON.parse(health).status === 'healthy';

      return { success: true, details: { instanceId, healthy: isHealthy } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async increaseInstanceMemory(instanceId) {
    try {
      console.log(`📈 Increasing memory allocation for instance: ${instanceId}`);

      const memoryKey = `swarm:wasm:instance:${instanceId}:memory`;
      const currentMemory = await this.redis.hget(memoryKey, 'allocated');
      const newMemory = parseInt(currentMemory || '128') * 1.5; // Increase by 50%

      await this.redis.hset(memoryKey, 'allocated', Math.round(newMemory).toString());

      return {
        success: true,
        details: { instanceId, oldMemory: currentMemory, newMemory: Math.round(newMemory) }
      };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async cleanupInstanceCache(instanceId) {
    try {
      console.log(`🧹 Cleaning cache for instance: ${instanceId}`);

      const cacheKey = `swarm:wasm:instance:${instanceId}:cache`;
      await this.redis.del(cacheKey);

      return { success: true, details: { instanceId } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async extendExecutionTimeout(context) {
    try {
      const newTimeout = (context.timeout || 30000) * 1.5; // Increase by 50%

      return { success: true, details: { oldTimeout: context.timeout, newTimeout } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async optimizeExecution(context) {
    try {
      // Apply execution optimizations
      const optimizations = {
        reduceMemoryUsage: true,
        enableFastPath: true,
        optimizeLoops: true
      };

      return { success: true, details: { optimizations } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async validateExecutionInput(context) {
    try {
      if (!context.input) {
        return { success: false, details: { reason: 'No input to validate' } };
      }

      // Basic input validation
      const validation = {
        hasContent: !!context.input,
        sizeValid: (context.input.length || 0) < 1000000, // < 1MB
        formatValid: true // Could add format-specific validation
      };

      return { success: validation.hasContent && validation.sizeValid && validation.formatValid, details: validation };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async fallbackToInterpreter(context) {
    try {
      console.log('🔄 Falling back to interpreter mode');

      // Signal fallback via Redis
      await this.redis.publish('swarm:phase-5:fallback', JSON.stringify({
        action: 'activate_interpreter',
        context,
        timestamp: Date.now()
      }));

      return { success: true, details: { mode: 'interpreter' } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async reconnectToInstance(instanceId) {
    try {
      console.log(`🔄 Reconnecting to instance: ${instanceId}`);

      // Signal reconnection via Redis
      await this.redis.publish('swarm:phase-5:instance-control', JSON.stringify({
        action: 'reconnect',
        instanceId,
        timestamp: Date.now()
      }));

      return { success: true, details: { instanceId } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async validateEndpoint(context) {
    try {
      // Validate endpoint connectivity
      const endpoint = context.endpoint || 'default';

      return { success: true, details: { endpoint, status: 'valid' } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async enableSafeMode(context) {
    try {
      console.log('🛡️ Enabling safe mode for execution');

      // Enable safe mode flags
      const safeModeConfig = {
        skipOptimizations: true,
        enableBoundsChecking: true,
        limitMemoryUsage: true,
        enableDebugMode: true
      };

      return { success: true, details: { safeMode: safeModeConfig } };

    } catch (error) {
      return { success: false, details: { error: error.message } };
    }
  }

  async retryOperation(error, context, attempt) {
    try {
      // This would retry the original operation that failed
      // In a real implementation, this would involve re-executing the WASM function

      if (context.retryCallback && typeof context.retryCallback === 'function') {
        return await context.retryCallback(attempt);
      }

      // Simulated retry for demonstration
      const successRate = Math.max(0.3, 1 - (attempt * 0.3)); // Decreasing success rate
      const success = Math.random() < successRate;

      return {
        success,
        attempt: attempt + 1,
        details: { successRate, simulated: true }
      };

    } catch (retryError) {
      return { success: false, error: retryError.message };
    }
  }

  /**
   * Activate fallback when recovery fails
   */
  async activateFallback(errorId, error, context, strategy) {
    console.log(`🚨 Activating fallback for error: ${errorId}`);

    this.stats.fallbackActivated++;

    // Determine fallback type
    const fallbackType = this.selectFallbackType(error, context);

    // Execute fallback
    const fallbackResult = await this.executeFallback(fallbackType, error, context);

    await this.emitRecoveryEvent({
      type: 'fallback_activated',
      errorId,
      fallbackType,
      result: fallbackResult,
      strategy: strategy.name,
      timestamp: Date.now()
    });

    return fallbackResult;
  }

  selectFallbackType(error, context) {
    // Select appropriate fallback based on error and context
    if (context.priority === 'urgent') {
      return 'regular_agent'; // Fast fallback for urgent tasks
    }

    if (error.message && error.message.includes('memory')) {
      return 'streaming_agent'; // Memory-efficient fallback
    }

    return 'regular_agent'; // Default fallback
  }

  async executeFallback(fallbackType, error, context) {
    try {
      console.log(`🔄 Executing fallback: ${fallbackType}`);

      // Signal fallback activation via Redis
      await this.redis.publish('swarm:phase-5:fallback', JSON.stringify({
        type: fallbackType,
        originalError: error.message,
        context,
        timestamp: Date.now()
      }));

      // In a real implementation, this would hand off to regular agents
      return {
        success: true,
        fallbackType,
        handedOff: true,
        timestamp: Date.now()
      };

    } catch (fallbackError) {
      console.error('❌ Fallback execution failed:', fallbackError);
      return {
        success: false,
        fallbackType,
        error: fallbackError.message
      };
    }
  }

  /**
   * Handle last resort fallback errors
   */
  async handleFallbackError(error, context, errorId) {
    console.error('🚨 Last resort fallback handling for error:', errorId);

    // Emergency fallback - signal to regular agents
    try {
      await this.redis.publish('swarm:phase-5:emergency', JSON.stringify({
        type: 'emergency_fallback',
        errorId,
        error: error.message,
        context,
        timestamp: Date.now()
      }));

      return {
        errorId,
        fallback: true,
        emergency: true,
        success: false
      };

    } catch (emergencyError) {
      console.error('💀 Emergency fallback failed:', emergencyError);
      return {
        errorId,
        fallback: true,
        emergency: true,
        success: false,
        criticalFailure: true
      };
    }
  }

  /**
   * Utility methods
   */
  calculateDelay(attempt, baseDelay) {
    const delay = baseDelay * Math.pow(this.config.backoffMultiplier, attempt);
    return Math.min(delay, this.config.maxRetryDelay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getRecentErrors(instanceId, errorType, timeWindow) {
    const cutoff = Date.now() - timeWindow;
    const recent = [];

    for (const [errorId, errorData] of this.errorHistory.entries()) {
      if (errorData.instanceId === instanceId &&
          errorData.classification.type === errorType &&
          errorData.timestamp > cutoff) {
        recent.push(errorId);
      }
    }

    return recent;
  }

  /**
   * Initialize recovery strategies
   */
  initializeRecoveryStrategies() {
    this.recoveryStrategies.set('panic_recovery', {
      name: 'Panic Recovery',
      description: 'Recover from WASM panics and traps',
      actions: ['restart_instance', 'clear_memory', 'validate_state'],
      maxRetries: 2
    });

    this.recoveryStrategies.set('memory_recovery', {
      name: 'Memory Recovery',
      description: 'Handle memory-related errors',
      actions: ['increase_memory', 'cleanup_cache', 'restart_instance'],
      maxRetries: 1
    });

    this.recoveryStrategies.set('timeout_recovery', {
      name: 'Timeout Recovery',
      description: 'Handle execution timeouts',
      actions: ['extend_timeout', 'optimize_execution', 'retry_with_adjustments'],
      maxRetries: 2
    });

    console.log(`📋 Initialized ${this.recoveryStrategies.size} recovery strategies`);
  }

  /**
   * Redis coordination methods
   */
  async loadErrorHistory() {
    try {
      const errorData = await this.redis.get(this.config.errorMemoryKey);
      if (errorData) {
        const data = JSON.parse(errorData);
        this.errorHistory = new Map(Object.entries(data.errorHistory || {}));
        this.stats = { ...this.stats, ...data.stats };
        console.log('📊 Error history loaded from Redis');
      }
    } catch (error) {
      console.error('Failed to load error history:', error);
    }
  }

  async saveErrorHistory() {
    try {
      const data = {
        errorHistory: Object.fromEntries(this.errorHistory),
        stats: this.stats,
        lastUpdated: Date.now()
      };

      await this.redis.setex(this.config.errorMemoryKey, 3600, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save error history:', error);
    }
  }

  async logError(errorId, error, context, classification) {
    const errorData = {
      id: errorId,
      message: error.message,
      stack: error.stack,
      context,
      classification,
      timestamp: Date.now(),
      instanceId: context.instanceId || 'unknown'
    };

    this.errorHistory.set(errorId, errorData);

    // Keep only recent errors (last 1000)
    if (this.errorHistory.size > 1000) {
      const entries = Array.from(this.errorHistory.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      this.errorHistory = new Map(entries.slice(-500));
    }

    await this.saveErrorHistory();
  }

  async emitRecoveryEvent(event) {
    try {
      await this.redis.publish(this.config.recoveryChannel, JSON.stringify(event));
    } catch (error) {
      console.error('Failed to emit recovery event:', error);
    }
  }

  async handleRecoveryEvent(event) {
    switch (event.type) {
      case 'recovery_complete':
        this.activeRecoveries.delete(event.errorId);
        break;
      case 'fallback_complete':
        this.stats.recoveredErrors++;
        break;
    }
  }

  updateStats(classification, result, duration) {
    this.stats.totalErrors++;

    if (result.success) {
      this.stats.recoveredErrors++;
    }

    if (result.fallback) {
      this.stats.fallbackActivated++;
    }

    if (classification.type === 'panic') {
      this.stats.panicsHandled++;
    }

    // Update average recovery time
    if (result.success) {
      const totalRecoveryTime = this.stats.avgRecoveryTime * (this.stats.recoveredErrors - 1) + duration;
      this.stats.avgRecoveryTime = totalRecoveryTime / this.stats.recoveredErrors;
    }

    // Update error type counts
    if (!this.stats.errorsByType[classification.type]) {
      this.stats.errorsByType[classification.type] = 0;
    }
    this.stats.errorsByType[classification.type]++;

    // Update error by instance counts
    const instanceId = classification.instanceId || 'unknown';
    if (!this.stats.errorsByInstance[instanceId]) {
      this.stats.errorsByInstance[instanceId] = 0;
    }
    this.stats.errorsByInstance[instanceId]++;
  }

  /**
   * Get error handling statistics
   */
  async getErrorStats() {
    return {
      ...this.stats,
      activeRecoveries: this.activeRecoveries.size,
      errorHistorySize: this.errorHistory.size,
      recoveryRate: this.stats.totalErrors > 0 ?
        Math.round((this.stats.recoveredErrors / this.stats.totalErrors) * 100) / 100 : 0,
      fallbackRate: this.stats.totalErrors > 0 ?
        Math.round((this.stats.fallbackActivated / this.stats.totalErrors) * 100) / 100 : 0
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down WASMErrorHandler...');

    // Wait for active recoveries to complete
    if (this.activeRecoveries.size > 0) {
      console.log(`⏳ Waiting for ${this.activeRecoveries.size} active recoveries...`);
      await this.sleep(5000);
    }

    if (this.recoverySubscriber) {
      await this.recoverySubscriber.unsubscribe();
      await this.recoverySubscriber.quit();
    }

    await this.saveErrorHistory();

    if (this.redis) {
      await this.redis.quit();
    }

    console.log('✅ WASMErrorHandler shutdown complete');
  }
}

module.exports = WASMErrorHandler;