/**
 * Performance Integration Module - Phase 3 Remediation
 *
 * Integrates the optimized hook system with the existing Claude Flow infrastructure
 * Provides seamless replacement of the existing hook system with performance-optimized version
 */

import { SqliteMemoryStore } from '../memory/sqlite-store.js';
import { OptimizedHookSystem } from './optimized-hook-system.js';
import { HookPerformanceMonitor } from './hook-performance-monitor.js';
import { PerformanceTestSuite } from './performance-test-suite.js';
import { performance } from 'perf_hooks';

/**
 * Performance Integration Manager
 * Manages the integration of optimized hook system with existing infrastructure
 */
class PerformanceIntegrationManager {
  constructor(options = {}) {
    this.options = {
      enableOptimizations: true,
      enableMonitoring: true,
      enableTesting: options.testing || false,
      performanceTarget: 100, // ms
      compatibilityTarget: 0.95, // 95%
      ...options,
    };

    this.memoryStore = null;
    this.optimizedHookSystem = null;
    this.performanceMonitor = null;
    this.testSuite = null;
    this.isInitialized = false;
    this.integrationMetrics = {
      initializationTime: 0,
      memoryPersistenceFixed: false,
      performanceTargetMet: false,
      compatibilityRate: 0,
    };
  }

  /**
   * Initialize the performance-optimized hook system
   */
  async initialize() {
    if (this.isInitialized) {
      return { success: true, message: 'Already initialized', metrics: this.integrationMetrics };
    }

    const initStart = performance.now();
    console.log('🚀 Initializing Performance-Optimized Hook System...');

    try {
      // Step 1: Initialize optimized memory store
      await this._initializeMemoryStore();

      // Step 2: Initialize optimized hook system
      await this._initializeOptimizedHookSystem();

      // Step 3: Initialize performance monitoring
      if (this.options.enableMonitoring) {
        await this._initializePerformanceMonitoring();
      }

      // Step 4: Initialize test suite if requested
      if (this.options.enableTesting) {
        await this._initializeTestSuite();
      }

      // Step 5: Validate integration
      await this._validateIntegration();

      this.isInitialized = true;
      this.integrationMetrics.initializationTime = performance.now() - initStart;

      const result = {
        success: true,
        message: 'Performance-optimized hook system initialized successfully',
        metrics: this.integrationMetrics,
        initializationTime: this.integrationMetrics.initializationTime,
      };

      console.log('✅ Performance-optimized hook system ready');
      console.log(
        `📊 Initialization time: ${this.integrationMetrics.initializationTime.toFixed(2)}ms`,
      );

      return result;
    } catch (error) {
      const initTime = performance.now() - initStart;
      console.error('❌ Failed to initialize performance-optimized hook system:', error);

      return {
        success: false,
        error: error.message,
        initializationTime: initTime,
        metrics: this.integrationMetrics,
      };
    }
  }

  /**
   * Execute a hook with performance optimization
   */
  async executeHook(hookType, context = {}) {
    if (!this.isInitialized) {
      throw new Error('Performance integration manager not initialized');
    }

    const executionStart = performance.now();

    try {
      // Execute hook using optimized system
      const result = await this.optimizedHookSystem.executeHook(hookType, context);

      // Record execution metrics
      if (this.performanceMonitor) {
        const executionTime = performance.now() - executionStart;
        this.performanceMonitor.recordExecution(hookType, executionTime, true, {
          optimized: true,
          context: context,
        });
      }

      return {
        ...result,
        optimized: true,
        executionTime: performance.now() - executionStart,
      };
    } catch (error) {
      // Record failed execution
      if (this.performanceMonitor) {
        const executionTime = performance.now() - executionStart;
        this.performanceMonitor.recordExecution(hookType, executionTime, false, {
          optimized: true,
          error: error.message,
          context: context,
        });
      }

      throw error;
    }
  }

  /**
   * Run performance validation tests
   */
  async runPerformanceValidation() {
    if (!this.testSuite) {
      throw new Error('Test suite not initialized - enable testing in options');
    }

    console.log('🔬 Running Performance Validation...');

    try {
      const testResults = await this.testSuite.runCompleteTestSuite();

      // Update integration metrics based on test results
      this.integrationMetrics.performanceTargetMet =
        testResults.performanceMetrics.summary.targetMet;
      this.integrationMetrics.compatibilityRate =
        testResults.performanceMetrics.summary.compatibilityRate;
      this.integrationMetrics.memoryPersistenceFixed =
        testResults.performanceMetrics.summary.memoryPersistenceFailures === 0;

      return {
        success: true,
        testResults,
        metrics: this.integrationMetrics,
        recommendations: testResults.recommendations,
      };
    } catch (error) {
      console.error('❌ Performance validation failed:', error);
      throw error;
    }
  }

  /**
   * Get current performance status
   */
  getPerformanceStatus() {
    if (!this.isInitialized) {
      return {
        initialized: false,
        message: 'Performance integration not initialized',
      };
    }

    const hookSystemMetrics = this.optimizedHookSystem.getPerformanceReport();
    const monitorStatus = this.performanceMonitor
      ? this.performanceMonitor.getCurrentStatus()
      : null;

    return {
      initialized: true,
      integrationMetrics: this.integrationMetrics,
      hookSystemPerformance: hookSystemMetrics,
      monitoringStatus: monitorStatus,
      compliance: {
        executionTimeCompliance: this.integrationMetrics.performanceTargetMet,
        compatibilityCompliance:
          this.integrationMetrics.compatibilityRate >= this.options.compatibilityTarget,
        memoryPersistenceCompliance: this.integrationMetrics.memoryPersistenceFixed,
        overallCompliance:
          this.integrationMetrics.performanceTargetMet &&
          this.integrationMetrics.compatibilityRate >= this.options.compatibilityTarget &&
          this.integrationMetrics.memoryPersistenceFixed,
      },
    };
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    const status = this.getPerformanceStatus();

    return {
      timestamp: new Date().toISOString(),
      phase3Remediation: {
        target: 'Reduce hook execution time from 1,186ms to <100ms (91.6% improvement)',
        status: status.compliance.executionTimeCompliance ? 'ACHIEVED' : 'IN_PROGRESS',
        currentPerformance: status.hookSystemPerformance?.averageTime || 'unknown',
        improvementAchieved: status.hookSystemPerformance?.averageTime
          ? `${(((1186 - status.hookSystemPerformance.averageTime) / 1186) * 100).toFixed(1)}%`
          : 'unknown',
      },
      memoryPersistence: {
        target: 'Fix memory persistence failures',
        status: status.compliance.memoryPersistenceCompliance ? 'FIXED' : 'IN_PROGRESS',
        failuresDetected: status.hookSystemPerformance?.memoryPersistenceFailures || 0,
      },
      compatibility: {
        target: 'Achieve 95% hook compatibility rate',
        status: status.compliance.compatibilityCompliance ? 'ACHIEVED' : 'IN_PROGRESS',
        currentRate: `${(status.integrationMetrics.compatibilityRate * 100).toFixed(1)}%`,
      },
      optimizations: {
        cachingImplemented: true,
        parallelExecutionEnabled: true,
        memoryStoreOptimized: true,
        timeoutHandlingAdded: true,
        performanceMonitoringActive: status.monitoringStatus?.isMonitoring || false,
      },
      recommendations: this._generateRecommendations(status),
    };
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up performance integration...');

    if (this.performanceMonitor) {
      this.performanceMonitor.stopMonitoring();
    }

    if (this.optimizedHookSystem) {
      await this.optimizedHookSystem.close();
    }

    if (this.testSuite) {
      await this.testSuite.cleanup();
    }

    if (this.memoryStore) {
      this.memoryStore.close();
    }

    this.isInitialized = false;
    console.log('✅ Cleanup completed');
  }

  // Private methods

  async _initializeMemoryStore() {
    console.log('💾 Initializing optimized memory store...');

    this.memoryStore = new SqliteMemoryStore({
      dbName: 'performance-optimized.db',
      directory: '.swarm',
    });

    await this.memoryStore.initialize();
    console.log('✅ Optimized memory store initialized');
  }

  async _initializeOptimizedHookSystem() {
    console.log('⚡ Initializing optimized hook system...');

    this.optimizedHookSystem = new OptimizedHookSystem(this.memoryStore);
    await this.optimizedHookSystem.initialize();

    console.log('✅ Optimized hook system initialized');
  }

  async _initializePerformanceMonitoring() {
    console.log('📊 Initializing performance monitoring...');

    this.performanceMonitor = new HookPerformanceMonitor();
    this.performanceMonitor.startMonitoring();

    // Set up event handlers
    this.performanceMonitor.on('target_missed', (data) => {
      console.warn(
        `⚠️  Performance target missed: ${data.hookType} took ${data.executionTime.toFixed(2)}ms`,
      );
    });

    this.performanceMonitor.on('critical_performance', (data) => {
      console.error(
        `❌ Critical performance issue: ${data.hookType} took ${data.executionTime.toFixed(2)}ms`,
      );
    });

    console.log('✅ Performance monitoring active');
  }

  async _initializeTestSuite() {
    console.log('🧪 Initializing test suite...');

    this.testSuite = new PerformanceTestSuite();
    await this.testSuite.initialize();

    console.log('✅ Test suite initialized');
  }

  async _validateIntegration() {
    console.log('🔍 Validating integration...');

    // Test basic hook execution
    const testStart = performance.now();
    const result = await this.optimizedHookSystem.executeHook('pre-task', {
      description: 'Integration validation test',
      taskId: 'validation-test',
    });

    const testTime = performance.now() - testStart;

    if (!result.success) {
      throw new Error('Integration validation failed - hook execution unsuccessful');
    }

    if (testTime >= 100) {
      console.warn(`⚠️  Integration validation slow: ${testTime.toFixed(2)}ms (target: <100ms)`);
    } else {
      console.log(`✅ Integration validation passed: ${testTime.toFixed(2)}ms`);
    }

    // Test memory persistence
    try {
      await this.memoryStore.store('integration-test', { validated: true });
      const retrieved = await this.memoryStore.retrieve('integration-test');

      if (!retrieved || !retrieved.validated) {
        throw new Error('Memory persistence validation failed');
      }

      this.integrationMetrics.memoryPersistenceFixed = true;
      console.log('✅ Memory persistence validation passed');
    } catch (error) {
      console.error('❌ Memory persistence validation failed:', error);
      this.integrationMetrics.memoryPersistenceFixed = false;
    }

    console.log('✅ Integration validation completed');
  }

  _generateRecommendations(status) {
    const recommendations = [];

    if (!status.compliance.executionTimeCompliance) {
      recommendations.push({
        type: 'CRITICAL',
        message: 'Hook execution time still exceeds 100ms target',
        actions: [
          'Profile slow hooks using performance monitor',
          'Increase cache sizes and optimize cache keys',
          'Reduce database I/O operations',
          'Consider asynchronous processing for non-critical operations',
        ],
      });
    }

    if (!status.compliance.compatibilityCompliance) {
      recommendations.push({
        type: 'HIGH',
        message: 'Hook compatibility rate below 95% target',
        actions: [
          'Review failed hook executions in performance monitor',
          'Improve error handling for edge cases',
          'Add fallback mechanisms for critical hooks',
          'Validate hook context parameters',
        ],
      });
    }

    if (!status.compliance.memoryPersistenceCompliance) {
      recommendations.push({
        type: 'HIGH',
        message: 'Memory persistence failures detected',
        actions: [
          'Check database connection stability',
          'Implement retry logic for failed operations',
          'Validate database schema and permissions',
          'Monitor disk space and database locks',
        ],
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'SUCCESS',
        message: 'All performance targets achieved',
        actions: [
          'Continue monitoring performance trends',
          'Consider further optimizations for edge cases',
          'Document successful optimization patterns',
          'Share performance improvements with team',
        ],
      });
    }

    return recommendations;
  }
}

/**
 * Factory function to create and initialize performance integration
 */
async function createPerformanceIntegration(options = {}) {
  const manager = new PerformanceIntegrationManager(options);
  const result = await manager.initialize();

  if (!result.success) {
    throw new Error(`Failed to initialize performance integration: ${result.error}`);
  }

  return manager;
}

/**
 * Utility function to replace existing hook system with optimized version
 */
async function replaceHookSystem(existingHookSystem, options = {}) {
  console.log('🔄 Replacing existing hook system with performance-optimized version...');

  // Create new optimized system
  const optimizedManager = await createPerformanceIntegration({
    ...options,
    enableMonitoring: true,
  });

  // Clean up existing system if possible
  if (existingHookSystem && typeof existingHookSystem.close === 'function') {
    await existingHookSystem.close();
  }

  console.log('✅ Hook system replacement completed');
  return optimizedManager;
}

export { PerformanceIntegrationManager, createPerformanceIntegration, replaceHookSystem };
