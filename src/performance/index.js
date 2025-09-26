/**
 * Performance Optimization Module - Main Export
 *
 * Phase 3 Remediation: Hook Performance Optimization
 * Target: Reduce hook execution time from 1,186ms to <100ms (91.6% improvement)
 * Secondary targets: Fix memory persistence failures, achieve 95% compatibility rate
 */

// Core optimized components
export {
  OptimizedHookSystem,
  OptimizedHookExecutor,
  OptimizedMemoryStore,
  OptimizedHookCache,
} from './optimized-hook-system.js';

// Performance monitoring and analysis
export { HookPerformanceMonitor, PERFORMANCE_THRESHOLDS } from './hook-performance-monitor.js';

// Comprehensive testing suite
export { PerformanceTestSuite } from './performance-test-suite.js';

// Integration and deployment
export {
  PerformanceIntegrationManager,
  createPerformanceIntegration,
  replaceHookSystem,
} from './performance-integration.js';

/**
 * Quick setup function for immediate performance improvement
 */
export async function quickPerformanceUpgrade(existingMemoryStore, options = {}) {
  const { createPerformanceIntegration } = await import('./performance-integration.js');

  return createPerformanceIntegration({
    memoryStore: existingMemoryStore,
    enableMonitoring: true,
    enableTesting: options.runTests || false,
    performanceTarget: options.targetTime || 100, // ms
    compatibilityTarget: options.compatibilityTarget || 0.95,
    ...options,
  });
}

/**
 * Performance validation function
 */
export async function validatePerformanceUpgrade(manager) {
  if (!manager || typeof manager.runPerformanceValidation !== 'function') {
    throw new Error('Invalid performance integration manager');
  }

  const results = await manager.runPerformanceValidation();

  return {
    success: results.success,
    performanceTargetMet: results.testResults.performanceMetrics.summary.targetMet,
    compatibilityAchieved: results.testResults.performanceMetrics.summary.compatibilityRate >= 0.95,
    memoryPersistenceFixed:
      results.testResults.performanceMetrics.summary.memoryPersistenceFailures === 0,
    overallUpgradeSuccess:
      results.testResults.performanceMetrics.summary.targetMet &&
      results.testResults.performanceMetrics.summary.compatibilityRate >= 0.95 &&
      results.testResults.performanceMetrics.summary.memoryPersistenceFailures === 0,
    report: results,
  };
}

/**
 * Default configuration for Phase 3 remediation
 */
export const PHASE3_REMEDIATION_CONFIG = {
  performanceTarget: 100, // ms - main requirement
  compatibilityTarget: 0.95, // 95% - secondary requirement
  memoryPersistenceFailureTolerance: 0, // Zero tolerance for failures
  enableAggressiveOptimizations: true,
  enableRealTimeMonitoring: true,
  enableComprehensiveTesting: true,
  cacheSize: 1000, // Optimize for high-frequency operations
  batchSize: 50, // Optimize batch processing
  batchDelay: 10, // ms - Minimize batch delay
  connectionPooling: true,
  parallelExecution: true,
};

/**
 * Export version and metadata
 */
export const VERSION = '1.0.0-phase3-remediation';
export const REMEDIATION_TARGET = {
  description: 'Reduce hook execution time from 1,186ms to <100ms',
  improvementRequired: '91.6%',
  secondaryTargets: ['Fix memory persistence failures', 'Achieve 95% hook compatibility rate'],
  optimizations: [
    'Connection pooling and statement reuse',
    'Memory-based caching layer',
    'Parallel execution where safe',
    'Reduced I/O operations',
    'Optimized serialization',
    'Connection lifecycle management',
  ],
};
