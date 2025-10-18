/**
 * Enhanced Recovery Engine with Multiple Failure Modes and Stress Testing
 * Comprehensive recovery management for swarm orchestration
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Recovery engine configuration
 */
const DEFAULT_CONFIG = {
  // Retry configuration
  maxRetries: 3,
  retryDelay: 1000,
  retryBackoffMultiplier: 2,
  maxRetryDelay: 30000,

  // Health check configuration
  healthCheckInterval: 5000,
  healthCheckTimeout: 5000,
  consecutiveFailuresThreshold: 3,

  // Backup configuration
  backupLocation: './backups/swarm-states',
  maxBackupAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  backupCompressionEnabled: true,

  // Stress testing configuration
  stressTestEnabled: false,
  maxConcurrentRecoveries: 10,
  stressTestTimeout: 60000, // 1 minute

  // Monitoring and logging
  enableDetailedLogging: true,
  metricsCollectionEnabled: true,
  alertThresholds: {
    failureRate: 0.2, // 20% failure rate triggers alert
    averageRecoveryTime: 30000, // 30 seconds
    consecutiveFailures: 5
  },

  // Recovery strategies
  defaultStrategy: 'standard',
  availableStrategies: ['standard', 'aggressive', 'conservative', 'custom'],

  // Performance tuning
  connectionPoolSize: 5,
  maxMemoryUsage: 100 * 1024 * 1024, // 100MB
  gcInterval: 60000 // 1 minute
};

/**
 * Enhanced Recovery Engine with comprehensive failure handling
 */
export class EnhancedRecoveryEngine extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.isShutdown = false;
    this.isRecovering = false;

    // Recovery state tracking
    this.activeRecoveries = new Map();
    this.recoveryHistory = [];
    this.retryQueues = new Map();

    // Health monitoring
    this.healthStatus = {
      status: 'initializing',
      lastCheck: null,
      consecutiveFailures: 0,
      metrics: {
        totalRecoveries: 0,
        successfulRecoveries: 0,
        failedRecoveries: 0,
        averageRecoveryTime: 0,
        lastRecoveryTime: null
      }
    };

    // Stress testing state
    this.stressTestResults = [];
    this.stressTestActive = false;

    // Recovery strategies registry
    this.recoveryStrategies = new Map();
    this.registerDefaultStrategies();

    // Monitoring and metrics
    this.metricsCollector = new MetricsCollector();
    this.alertManager = new AlertManager(this.config.alertThresholds);

    // Initialize backup directory
    this.ensureBackupDirectory();

    // Start background tasks
    this.startBackgroundTasks();
  }

  /**
   * Register default recovery strategies
   */
  registerDefaultStrategies() {
    // Standard recovery strategy
    this.recoveryStrategies.set('standard', {
      name: 'Standard Recovery',
      description: 'Balanced approach with moderate retry attempts',
      execute: async (swarmId, state) => {
        return this.executeStandardRecovery(swarmId, state);
      }
    });

    // Aggressive recovery strategy
    this.recoveryStrategies.set('aggressive', {
      name: 'Aggressive Recovery',
      description: 'Fast recovery with minimal delays',
      execute: async (swarmId, state) => {
        return this.executeAggressiveRecovery(swarmId, state);
      }
    });

    // Conservative recovery strategy
    this.recoveryStrategies.set('conservative', {
      name: 'Conservative Recovery',
      description: 'Careful recovery with extensive validation',
      execute: async (swarmId, state) => {
        return this.executeConservativeRecovery(swarmId, state);
      }
    });
  }

  /**
   * Main recovery execution method
   */
  async recoverSwarm(swarmId, options = {}) {
    const recoveryId = randomUUID();
    const startTime = Date.now();

    try {
      this.emit('recovery-started', { swarmId, recoveryId, timestamp: startTime });

      // Validate swarm ID
      if (!swarmId || typeof swarmId !== 'string') {
        throw new Error('Invalid swarm ID provided');
      }

      // Check if recovery is already in progress
      if (this.activeRecoveries.has(swarmId)) {
        throw new Error(`Recovery already in progress for swarm ${swarmId}`);
      }

      // Check concurrent recovery limits
      if (this.activeRecoveries.size >= this.config.maxConcurrentRecoveries) {
        throw new Error('Maximum concurrent recoveries reached');
      }

      // Create recovery context
      const recoveryContext = {
        id: recoveryId,
        swarmId,
        startTime,
        strategy: options.strategy || this.config.defaultStrategy,
        attempts: 0,
        maxAttempts: options.maxAttempts || this.config.maxRetries,
        status: 'initializing',
        metadata: {}
      };

      this.activeRecoveries.set(swarmId, recoveryContext);

      // Load swarm state
      const swarmState = await this.loadSwarmState(swarmId);
      if (!swarmState) {
        throw new Error(`Swarm state not found for ${swarmId}`);
      }

      // Validate swarm state
      const validation = await this.validateSwarmState(swarmState);
      if (!validation.isValid) {
        throw new Error(`Invalid swarm state: ${validation.errors.join(', ')}`);
      }

      // Select and execute recovery strategy
      const strategy = this.recoveryStrategies.get(recoveryContext.strategy);
      if (!strategy) {
        throw new Error(`Unknown recovery strategy: ${recoveryContext.strategy}`);
      }

      recoveryContext.status = 'recovering';
      this.emit('recovery-progress', recoveryContext);

      const result = await strategy.execute(swarmId, swarmState, recoveryContext);

      // Update recovery context
      recoveryContext.status = result.success ? 'completed' : 'failed';
      recoveryContext.endTime = Date.now();
      recoveryContext.duration = recoveryContext.endTime - startTime;
      recoveryContext.result = result;

      // Record recovery metrics
      this.recordRecoveryMetrics(recoveryContext, result);

      // Clean up active recovery
      this.activeRecoveries.delete(swarmId);

      // Emit completion event
      this.emit('recovery-completed', {
        swarmId,
        recoveryId,
        result,
        duration: recoveryContext.duration,
        timestamp: Date.now()
      });

      return {
        success: result.success,
        swarmId,
        recoveryId,
        duration: recoveryContext.duration,
        recoveredState: result.recoveredState,
        metadata: result.metadata || {}
      };

    } catch (error) {
      // Handle recovery failure
      const failureContext = {
        swarmId,
        recoveryId,
        error: error.message,
        timestamp: Date.now(),
        duration: Date.now() - startTime
      };

      this.recordRecoveryFailure(failureContext);
      this.activeRecoveries.delete(swarmId);

      this.emit('recovery-failed', failureContext);

      return {
        success: false,
        swarmId,
        recoveryId,
        error: error.message,
        duration: failureContext.duration
      };
    }
  }

  /**
   * Standard recovery implementation
   */
  async executeStandardRecovery(swarmId, state, context) {
    let lastError;

    for (let attempt = 0; attempt <= context.maxAttempts; attempt++) {
      context.attempts = attempt + 1;

      try {
        // Create backup before recovery attempt
        if (attempt === 0) {
          await this.createBackup(swarmId, state);
        }

        // Validate and repair swarm state
        const repairedState = await this.repairSwarmState(state);

        // Update swarm status to recovering
        await this.updateSwarmStatus(swarmId, 'recovering', {
          recoveryAttempt: attempt + 1,
          recoveryId: context.id
        });

        // Resume swarm execution
        const resumeResult = await this.resumeSwarmExecution(repairedState);

        if (resumeResult.success) {
          await this.updateSwarmStatus(swarmId, 'running', {
            recoveryCompleted: true,
            recoveryId: context.id
          });

          return {
            success: true,
            recoveredState: repairedState,
            attempts: attempt + 1,
            metadata: {
              strategy: 'standard',
              backupCreated: true,
              resumeResult: resumeResult
            }
          };
        }

        throw new Error('Failed to resume swarm execution');

      } catch (error) {
        lastError = error;

        // Log attempt failure
        this.emit('recovery-attempt-failed', {
          swarmId,
          attempt: attempt + 1,
          error: error.message,
          timestamp: Date.now()
        });

        // Check if we should retry
        if (attempt < context.maxAttempts) {
          const delay = this.calculateRetryDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError.message,
      attempts: context.maxAttempts,
      metadata: {
        strategy: 'standard',
        backupCreated: true
      }
    };
  }

  /**
   * Aggressive recovery implementation
   */
  async executeAggressiveRecovery(swarmId, state, context) {
    try {
      // Minimal validation for faster recovery
      const quickValidation = await this.quickValidateSwarmState(state);
      if (!quickValidation.isValid) {
        // Attempt basic repairs
        state = await this.basicRepairSwarmState(state);
      }

      // Update status immediately
      await this.updateSwarmStatus(swarmId, 'recovering', {
        strategy: 'aggressive',
        recoveryId: context.id
      });

      // Force resume with minimal checks
      const resumeResult = await this.forceResumeSwarmExecution(state);

      return {
        success: resumeResult.success,
        recoveredState: state,
        attempts: 1,
        metadata: {
          strategy: 'aggressive',
          fastMode: true,
          resumeResult: resumeResult
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        attempts: 1,
        metadata: {
          strategy: 'aggressive',
          fastMode: true
        }
      };
    }
  }

  /**
   * Conservative recovery implementation
   */
  async executeConservativeRecovery(swarmId, state, context) {
    let attempts = 0;
    const maxAttempts = context.maxAttempts * 2; // Double attempts for conservative

    while (attempts < maxAttempts) {
      attempts++;
      context.attempts = attempts;

      try {
        // Extensive validation
        const validation = await this.extensiveValidateSwarmState(state);
        if (!validation.isValid) {
          state = await this.comprehensiveRepairSwarmState(state, validation.issues);
        }

        // Create backup before each attempt
        await this.createBackup(swarmId, state, `conservative-attempt-${attempts}`);

        // Update status with detailed information
        await this.updateSwarmStatus(swarmId, 'recovering', {
          strategy: 'conservative',
          attempt: attempts,
          validationPassed: validation.isValid,
          recoveryId: context.id
        });

        // Verify system health before resume
        const healthCheck = await this.performSystemHealthCheck();
        if (!healthCheck.isHealthy) {
          throw new Error(`System health check failed: ${healthCheck.issues.join(', ')}`);
        }

        // Resume with full validation
        const resumeResult = await this.validatedResumeSwarmExecution(state);

        if (resumeResult.success) {
          await this.updateSwarmStatus(swarmId, 'running', {
            strategy: 'conservative',
            recoveryCompleted: true,
            totalAttempts: attempts,
            recoveryId: context.id
          });

          return {
            success: true,
            recoveredState: state,
            attempts,
            metadata: {
              strategy: 'conservative',
              extensiveValidation: true,
              healthCheckPassed: healthCheck.isHealthy,
              resumeResult: resumeResult
            }
          };
        }

        throw new Error('Resume validation failed');

      } catch (error) {
        if (attempts >= maxAttempts) {
          return {
            success: false,
            error: error.message,
            attempts,
            metadata: {
              strategy: 'conservative',
              extensiveValidation: true
            }
          };
        }

        // Longer delays for conservative approach
        const delay = this.calculateRetryDelay(attempts) * 2;
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: 'Maximum attempts exceeded',
      attempts,
      metadata: {
        strategy: 'conservative',
        extensiveValidation: true
      }
    };
  }

  /**
   * Stress testing for recovery capabilities
   */
  async runStressTest(options = {}) {
    const testConfig = {
      swarmCount: options.swarmCount || 100,
      concurrentRecoveries: options.concurrentRecoveries || 10,
      failureRate: options.failureRate || 0.3,
      failureTypes: options.failureTypes || ['timeout', 'corruption', 'connection'],
      duration: options.duration || 60000,
      ...options
    };

    this.stressTestActive = true;
    const startTime = Date.now();
    const testResults = {
      testId: randomUUID(),
      startTime,
      config: testConfig,
      results: [],
      metrics: {
        totalSwarms: testConfig.swarmCount,
        successfulRecoveries: 0,
        failedRecoveries: 0,
        averageRecoveryTime: 0,
        maxRecoveryTime: 0,
        minRecoveryTime: Infinity,
        throughput: 0
      }
    };

    this.emit('stress-test-started', { testId: testResults.testId, config: testConfig });

    try {
      // Generate test swarms
      const testSwarms = this.generateTestSwarms(testConfig.swarmCount, testConfig);

      // Process swarms in batches
      const batchSize = testConfig.concurrentRecoveries;
      for (let i = 0; i < testSwarms.length; i += batchSize) {
        if (!this.stressTestActive) {
          break;
        }

        const batch = testSwarms.slice(i, i + batchSize);
        const batchPromises = batch.map(swarm => this.processTestSwarm(swarm, testConfig));

        const batchResults = await Promise.allSettled(batchPromises);

        // Process batch results
        batchResults.forEach((result, index) => {
          const swarmResult = {
            swarmId: batch[index].id,
            success: result.status === 'fulfilled' ? result.value.success : false,
            duration: result.status === 'fulfilled' ? result.value.duration : 0,
            error: result.status === 'rejected' ? result.reason.message : null,
            timestamp: Date.now()
          };

          testResults.results.push(swarmResult);

          if (swarmResult.success) {
            testResults.metrics.successfulRecoveries++;
            testResults.metrics.averageRecoveryTime += swarmResult.duration;
            testResults.metrics.maxRecoveryTime = Math.max(testResults.metrics.maxRecoveryTime, swarmResult.duration);
            testResults.metrics.minRecoveryTime = Math.min(testResults.metrics.minRecoveryTime, swarmResult.duration);
          } else {
            testResults.metrics.failedRecoveries++;
          }
        });

        // Emit progress update
        this.emit('stress-test-progress', {
          testId: testResults.testId,
          processed: Math.min(i + batchSize, testSwarms.length),
          total: testSwarms.length,
          successRate: testResults.metrics.successfulRecoveries / (testResults.metrics.successfulRecoveries + testResults.metrics.failedRecoveries)
        });

        // Small delay between batches
        await this.sleep(100);
      }

      // Calculate final metrics
      if (testResults.metrics.successfulRecoveries > 0) {
        testResults.metrics.averageRecoveryTime /= testResults.metrics.successfulRecoveries;
      }
      testResults.metrics.throughput = testResults.results.length / ((Date.now() - startTime) / 1000);

      testResults.endTime = Date.now();
      testResults.duration = testResults.endTime - startTime;

      this.stressTestResults.push(testResults);
      this.emit('stress-test-completed', testResults);

      return testResults;

    } catch (error) {
      testResults.error = error.message;
      testResults.endTime = Date.now();
      testResults.duration = testResults.endTime - startTime;

      this.emit('stress-test-failed', testResults);
      throw error;

    } finally {
      this.stressTestActive = false;
    }
  }

  /**
   * Generate test swarms for stress testing
   */
  generateTestSwarms(count, config) {
    const swarms = [];

    for (let i = 0; i < count; i++) {
      const swarmId = `stress-test-swarm-${i}`;
      const shouldFail = Math.random() < config.failureRate;
      const failureType = shouldFail ?
        config.failureTypes[Math.floor(Math.random() * config.failureTypes.length)] : null;

      let swarmState = {
        id: swarmId,
        status: 'running',
        objective: `Stress test swarm ${i}`,
        agents: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, j) => ({
          id: `agent-${i}-${j}`,
          status: 'running',
          data: 'x'.repeat(Math.floor(Math.random() * 1000))
        })),
        tasks: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, j) => `task-${i}-${j}`),
        lastUpdated: Date.now()
      };

      // Inject failures based on failure type
      if (failureType === 'corruption') {
        swarmState = this.corruptSwarmState(swarmState);
      } else if (failureType === 'incomplete') {
        swarmState = this.makeSwarmStateIncomplete(swarmState);
      }

      swarms.push({
        id: swarmId,
        state: swarmState,
        failureType,
        shouldFail
      });
    }

    return swarms;
  }

  /**
   * Process a single test swarm during stress testing
   */
  async processTestSwarm(testSwarm, config) {
    const startTime = Date.now();

    try {
      // Mock the swarm state loading for testing
      const mockLoadSwarmState = async (swarmId) => {
        if (testSwarm.failureType === 'missing') {
          return null;
        }
        return testSwarm.state;
      };

      // Mock other dependencies as needed
      const result = await this.recoverSwarm(testSwarm.id, {
        strategy: 'aggressive', // Use aggressive for stress testing
        maxAttempts: 2, // Limit attempts for stress testing
        mockDependencies: {
          loadSwarmState: mockLoadSwarmState
        }
      });

      return {
        ...result,
        duration: Date.now() - startTime,
        expectedFailure: testSwarm.shouldFail,
        failureType: testSwarm.failureType
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        expectedFailure: testSwarm.shouldFail,
        failureType: testSwarm.failureType
      };
    }
  }

  /**
   * Corrupt swarm state for testing
   */
  corruptSwarmState(state) {
    const corrupted = { ...state };

    // Add circular reference
    corrupted.self = corrupted;

    // Or make invalid JSON
    if (Math.random() < 0.5) {
      return { invalid: 'structure', data: 'corrupted' };
    }

    return corrupted;
  }

  /**
   * Make swarm state incomplete for testing
   */
  makeSwarmStateIncomplete(state) {
    const incomplete = { ...state };

    // Remove required fields randomly
    const fieldsToRemove = ['objective', 'agents', 'tasks'];
    const fieldsCount = Math.floor(Math.random() * fieldsToRemove.length) + 1;

    for (let i = 0; i < fieldsCount; i++) {
      const fieldToRemove = fieldsToRemove[Math.floor(Math.random() * fieldsToRemove.length)];
      delete incomplete[fieldToRemove];
    }

    return incomplete;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(attempt) {
    const delay = this.config.retryDelay * Math.pow(this.config.retryBackoffMultiplier, attempt);
    return Math.min(delay, this.config.maxRetryDelay);
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Ensure backup directory exists
   */
  ensureBackupDirectory() {
    if (!existsSync(this.config.backupLocation)) {
      mkdirSync(this.config.backupLocation, { recursive: true });
    }
  }

  /**
   * Record recovery metrics
   */
  recordRecoveryMetrics(context, result) {
    const metrics = {
      timestamp: Date.now(),
      swarmId: context.swarmId,
      recoveryId: context.id,
      strategy: context.strategy,
      success: result.success,
      duration: context.duration,
      attempts: context.attempts
    };

    this.recoveryHistory.push(metrics);
    this.metricsCollector.record(metrics);

    // Update health status
    this.healthStatus.metrics.totalRecoveries++;
    if (result.success) {
      this.healthStatus.metrics.successfulRecoveries++;
    } else {
      this.healthStatus.metrics.failedRecoveries++;
      this.healthStatus.consecutiveFailures++;
    }

    this.healthStatus.metrics.lastRecoveryTime = metrics.timestamp;

    // Check for alerts
    this.alertManager.checkMetrics(this.healthStatus.metrics);
  }

  /**
   * Record recovery failure
   */
  recordRecoveryFailure(context) {
    const failure = {
      timestamp: Date.now(),
      swarmId: context.swarmId,
      recoveryId: context.recoveryId,
      error: context.error,
      duration: context.duration
    };

    this.recoveryHistory.push(failure);
    this.healthStatus.consecutiveFailures++;
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStatistics() {
    const stats = { ...this.healthStatus.metrics };

    if (stats.totalRecoveries > 0) {
      stats.successRate = stats.successfulRecoveries / stats.totalRecoveries;
      stats.failureRate = stats.failedRecoveries / stats.totalRecoveries;
    } else {
      stats.successRate = 0;
      stats.failureRate = 0;
    }

    stats.activeRecoveries = this.activeRecoveries.size;
    stats.averageRecoveryTime = this.calculateAverageRecoveryTime();
    stats.lastStressTest = this.stressTestResults[this.stressTestResults.length - 1];

    return stats;
  }

  /**
   * Calculate average recovery time
   */
  calculateAverageRecoveryTime() {
    const successfulRecoveries = this.recoveryHistory.filter(r => r.success);
    if (successfulRecoveries.length === 0) return 0;

    const totalTime = successfulRecoveries.reduce((sum, r) => sum + r.duration, 0);
    return Math.round(totalTime / successfulRecoveries.length);
  }

  /**
   * Start background tasks
   */
  startBackgroundTasks() {
    // Health check interval
    setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Metrics collection
    if (this.config.metricsCollectionEnabled) {
      setInterval(() => {
        this.collectMetrics();
      }, 60000); // Every minute
    }

    // Cleanup expired data
    setInterval(() => {
      this.cleanupExpiredData();
    }, this.config.gcInterval);
  }

  /**
   * Perform system health check
   */
  async performHealthCheck() {
    try {
      const startTime = Date.now();

      // Check Redis connection (mocked for testing)
      const redisHealthy = await this.checkRedisHealth();

      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryHealthy = memoryUsage.heapUsed < this.config.maxMemoryUsage;

      // Check active recoveries
      const activeRecoveriesHealthy = this.activeRecoveries.size < this.config.maxConcurrentRecoveries;

      const healthCheck = {
        timestamp: Date.now(),
        responseTime: Date.now() - startTime,
        redisHealthy,
        memoryHealthy,
        activeRecoveriesHealthy,
        memoryUsage,
        activeRecoveries: this.activeRecoveries.size,
        isHealthy: redisHealthy && memoryHealthy && activeRecoveriesHealthy,
        issues: []
      };

      if (!redisHealthy) healthCheck.issues.push('Redis connection unhealthy');
      if (!memoryHealthy) healthCheck.issues.push('Memory usage too high');
      if (!activeRecoveriesHealthy) healthCheck.issues.push('Too many active recoveries');

      this.healthStatus.status = healthCheck.isHealthy ? 'healthy' : 'unhealthy';
      this.healthStatus.lastCheck = healthCheck.timestamp;

      if (!healthCheck.isHealthy) {
        this.healthStatus.consecutiveFailures++;
      } else {
        this.healthStatus.consecutiveFailures = 0;
      }

      this.emit('health-check', healthCheck);
      return healthCheck;

    } catch (error) {
      this.healthStatus.status = 'unhealthy';
      this.healthStatus.consecutiveFailures++;
      this.emit('health-error', error);
      return { isHealthy: false, error: error.message };
    }
  }

  /**
   * Check Redis health (mocked)
   */
  async checkRedisHealth() {
    // Mock implementation - would connect to actual Redis in production
    return true;
  }

  /**
   * Collect system metrics
   */
  collectMetrics() {
    const metrics = {
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage(),
      activeRecoveries: this.activeRecoveries.size,
      recoveryHistorySize: this.recoveryHistory.length,
      stressTestResults: this.stressTestResults.length
    };

    this.emit('metrics-collected', metrics);
  }

  /**
   * Cleanup expired data
   */
  cleanupExpiredData() {
    const now = Date.now();
    const maxAge = this.config.maxBackupAge;

    // Clean up recovery history
    this.recoveryHistory = this.recoveryHistory.filter(entry =>
      now - entry.timestamp < maxAge
    );

    // Clean up stress test results
    this.stressTestResults = this.stressTestResults.filter(result =>
      now - result.startTime < maxAge
    );
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.isShutdown = true;
    this.stressTestActive = false;

    // Wait for active recoveries to complete or timeout
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeRecoveries.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      await this.sleep(1000);
    }

    this.emit('shutdown', {
      timestamp: Date.now(),
      activeRecoveries: this.activeRecoveries.size
    });
  }
}

/**
 * Metrics collector for recovery operations
 */
class MetricsCollector {
  constructor() {
    this.metrics = [];
  }

  record(metric) {
    this.metrics.push(metric);
  }

  getMetrics(timeRange = 3600000) { // Default 1 hour
    const now = Date.now();
    const cutoff = now - timeRange;

    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  getAggregatedMetrics(timeRange = 3600000) {
    const recentMetrics = this.getMetrics(timeRange);

    if (recentMetrics.length === 0) {
      return {
        totalRecoveries: 0,
        successRate: 0,
        averageDuration: 0,
        strategyPerformance: {}
      };
    }

    const successful = recentMetrics.filter(m => m.success);
    const totalDuration = successful.reduce((sum, m) => sum + m.duration, 0);

    // Strategy performance breakdown
    const strategyPerformance = {};
    recentMetrics.forEach(m => {
      if (!strategyPerformance[m.strategy]) {
        strategyPerformance[m.strategy] = { total: 0, successful: 0 };
      }
      strategyPerformance[m.strategy].total++;
      if (m.success) {
        strategyPerformance[m.strategy].successful++;
      }
    });

    return {
      totalRecoveries: recentMetrics.length,
      successfulRecoveries: successful.length,
      successRate: successful.length / recentMetrics.length,
      averageDuration: successful.length > 0 ? totalDuration / successful.length : 0,
      strategyPerformance
    };
  }
}

/**
 * Alert manager for recovery operations
 */
class AlertManager {
  constructor(thresholds) {
    this.thresholds = thresholds;
    this.alerts = [];
  }

  checkMetrics(metrics) {
    const alerts = [];

    // Check failure rate
    if (metrics.totalRecoveries > 0) {
      const failureRate = metrics.failedRecoveries / metrics.totalRecoveries;
      if (failureRate > this.thresholds.failureRate) {
        alerts.push({
          type: 'high_failure_rate',
          severity: 'warning',
          message: `Recovery failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold`,
          value: failureRate,
          threshold: this.thresholds.failureRate
        });
      }
    }

    // Check average recovery time
    if (metrics.averageRecoveryTime > this.thresholds.averageRecoveryTime) {
      alerts.push({
        type: 'slow_recovery',
        severity: 'warning',
        message: `Average recovery time ${metrics.averageRecoveryTime}ms exceeds threshold`,
        value: metrics.averageRecoveryTime,
        threshold: this.thresholds.averageRecoveryTime
      });
    }

    // Check consecutive failures
    if (metrics.consecutiveFailures > this.thresholds.consecutiveFailures) {
      alerts.push({
        type: 'consecutive_failures',
        severity: 'critical',
        message: `${metrics.consecutiveFailures} consecutive recovery failures`,
        value: metrics.consecutiveFailures,
        threshold: this.thresholds.consecutiveFailures
      });
    }

    this.alerts.push(...alerts);
    return alerts;
  }

  getActiveAlerts() {
    const now = Date.now();
    const alertLifetime = 3600000; // 1 hour

    return this.alerts.filter(alert =>
      (now - alert.timestamp) < alertLifetime
    );
  }
}

export default EnhancedRecoveryEngine;