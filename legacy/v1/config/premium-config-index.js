/**
 * Premium Configuration Index for 96GB DDR5-6400 Setup
 *
 * Centralized configuration management and integration for all premium configs
 */

import { premiumSQLiteConfig, getOptimizedConfig as getSQLiteConfig } from './premium-sqlite-96gb.config.js';
import { premiumBuildConfig, getOptimizedBuildConfig } from './build-optimizer-premium.config.js';
import { premiumConnectionPoolConfig, getConnectionPoolConfig } from './connection-pool-premium.config.js';
import { premiumMonitoringConfig, getMonitoringConfig } from './performance-monitoring-premium.config.js';
import { premiumCacheMemoryConfig, getCacheMemoryConfig } from './cache-memory-optimization-96gb.config.js';

/**
 * Master premium configuration combining all optimizations
 */
export const masterPremiumConfig = {
  // System information
  system: {
    totalMemory: '96GB',
    wsl2Allocation: '64GB',
    cpuCores: 24,
    memoryType: 'DDR5-6400',
    memoryBandwidth: 51200,     // MB/s
    targetLatency: 50,          // nanoseconds
  },

  // Component configurations
  sqlite: premiumSQLiteConfig,
  build: premiumBuildConfig,
  connectionPool: premiumConnectionPoolConfig,
  monitoring: premiumMonitoringConfig,
  cacheMemory: premiumCacheMemoryConfig,

  // Integration settings
  integration: {
    // Cross-component optimization
    crossOptimization: {
      enabled: true,
      memorySharing: true,        // Share memory between components
      cacheCoordination: true,    // Coordinate caching strategies
      resourcePooling: true,      // Pool resources across components
    },

    // Performance coordination
    coordination: {
      enabled: true,
      loadBalancing: true,        // Balance load across components
      backpressureHandling: true, // Handle backpressure gracefully
      circuitBreakers: true,      // Circuit breakers for resilience
    },

    // Monitoring integration
    monitoringIntegration: {
      enabled: true,
      unifiedMetrics: true,       // Unified metrics collection
      crossComponentAlerts: true, // Alerts across components
      performanceCorrelation: true, // Correlate performance metrics
    },
  },

  // Environment-specific overrides
  environments: {
    development: {
      system: {
        wsl2Allocation: '32GB',   // Reduced allocation for dev
      },
      performanceMode: 'balanced',
      debugMode: true,
    },

    testing: {
      system: {
        wsl2Allocation: '16GB',   // Minimal allocation for testing
      },
      performanceMode: 'minimal',
      debugMode: true,
      mockingEnabled: true,
    },

    production: {
      system: {
        wsl2Allocation: '64GB',   // Full allocation for production
      },
      performanceMode: 'maximum',
      debugMode: false,
      optimizationsEnabled: true,
    },
  },
};

/**
 * Get complete premium configuration for environment
 */
export function getCompletePremiumConfig(environment = 'production') {
  const baseConfig = { ...masterPremiumConfig };
  const envOverrides = baseConfig.environments[environment] || {};

  // Get environment-specific component configs
  const config = {
    ...baseConfig,
    sqlite: getSQLiteConfig(environment),
    build: getOptimizedBuildConfig(environment),
    connectionPool: getConnectionPoolConfig(environment),
    monitoring: getMonitoringConfig(environment),
    cacheMemory: getCacheMemoryConfig(environment),
    ...envOverrides,
  };

  return config;
}

/**
 * Initialize all premium configurations
 */
export async function initializeAllPremiumConfigs(environment = 'production') {
  console.log(`Initializing premium configurations for ${environment} environment...`);
  console.log(`System: ${masterPremiumConfig.system.totalMemory} DDR5-6400, ${masterPremiumConfig.system.cpuCores} cores`);

  const config = getCompletePremiumConfig(environment);

  // Initialize each component
  const results = {
    system: config.system,
    sqlite: await initializeSQLiteConfig(config.sqlite),
    build: await initializeBuildConfig(config.build),
    connectionPool: await initializeConnectionPoolConfig(config.connectionPool),
    monitoring: await initializeMonitoringConfig(config.monitoring),
    cacheMemory: await initializeCacheMemoryConfig(config.cacheMemory),
    integration: await initializeIntegrationConfig(config.integration),
  };

  console.log('Premium configuration initialization complete');
  return results;
}

/**
 * Component initialization functions
 */
async function initializeSQLiteConfig(config) {
  console.log('Initializing premium SQLite configuration...');
  console.log(`Cache size: ${config.memory.cache_size / 1024}MB`);
  console.log(`Memory mapping: ${config.memory.mmap_size / (1024 * 1024 * 1024)}GB`);
  console.log(`Connection pool: ${config.connectionPool.minConnections}-${config.connectionPool.maxConnections}`);
  return { status: 'initialized', config };
}

async function initializeBuildConfig(config) {
  console.log('Initializing premium build configuration...');
  console.log(`Max CPU cores: ${config.system.maxCpuCores}`);
  console.log(`Max memory: ${config.system.maxMemoryUsage}`);
  console.log(`Parallel jobs: ${config.system.parallelJobs}`);
  return { status: 'initialized', config };
}

async function initializeConnectionPoolConfig(config) {
  console.log('Initializing premium connection pool configuration...');
  console.log(`Database connections: ${config.database.sqlite.pool.min}-${config.database.sqlite.pool.max}`);
  console.log(`Worker threads: ${config.workers.compute.pool.max} compute, ${config.workers.io.pool.max} I/O`);
  return { status: 'initialized', config };
}

async function initializeMonitoringConfig(config) {
  console.log('Initializing premium monitoring configuration...');
  console.log(`System monitoring: ${config.system.cpu.interval}ms CPU, ${config.system.memory.interval}ms memory`);
  console.log(`DDR5 monitoring: bandwidth tracking enabled`);
  console.log(`Alerts: ${config.alerting.rules.length} rules configured`);
  return { status: 'initialized', config };
}

async function initializeCacheMemoryConfig(config) {
  console.log('Initializing premium cache and memory configuration...');
  console.log(`Available for cache: ${config.memory.system.availableForCache}`);
  console.log(`L4 cache: ${config.caching.l4.size}`);
  if (config.caching.l5.enabled) {
    console.log(`L5 cache: ${config.caching.l5.size}`);
  }
  console.log(`DDR5-6400: ${config.memory.system.ddr5.bandwidth}MB/s bandwidth`);
  return { status: 'initialized', config };
}

async function initializeIntegrationConfig(config) {
  console.log('Initializing premium integration configuration...');
  console.log(`Cross-optimization: ${config.crossOptimization.enabled ? 'enabled' : 'disabled'}`);
  console.log(`Coordination: ${config.coordination.enabled ? 'enabled' : 'disabled'}`);
  console.log(`Unified monitoring: ${config.monitoringIntegration.enabled ? 'enabled' : 'disabled'}`);
  return { status: 'initialized', config };
}

/**
 * Configuration validation
 */
export function validatePremiumConfig(config) {
  const errors = [];
  const warnings = [];

  // Validate system requirements
  if (config.system.totalMemory !== '96GB') {
    warnings.push('System memory is not 96GB - some optimizations may not be optimal');
  }

  if (config.system.cpuCores < 16) {
    warnings.push('CPU core count is less than 16 - parallel optimizations may be limited');
  }

  // Validate memory allocation
  const wsl2GB = parseInt(config.system.wsl2Allocation.replace('GB', ''));
  const totalGB = parseInt(config.system.totalMemory.replace('GB', ''));

  if (wsl2GB > totalGB * 0.8) {
    warnings.push('WSL2 allocation is >80% of system memory - may cause system instability');
  }

  // Validate cache sizes
  const cacheGB = parseInt(config.cacheMemory.memory.system.availableForCache.replace('GB', ''));
  if (cacheGB > wsl2GB * 0.9) {
    errors.push('Cache allocation exceeds 90% of WSL2 memory');
  }

  // Validate connection pools
  const maxConnections = config.connectionPool.database.sqlite.pool.max;
  if (maxConnections > config.system.cpuCores * 3) {
    warnings.push('Database connection pool may be too large for CPU count');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get configuration summary
 */
export function getConfigSummary(environment = 'production') {
  const config = getCompletePremiumConfig(environment);

  return {
    environment,
    system: {
      memory: config.system.totalMemory,
      cores: config.system.cpuCores,
      memoryType: config.system.memoryType,
      wsl2Allocation: config.system.wsl2Allocation,
    },
    optimizations: {
      sqlite: {
        cacheSize: `${config.sqlite.memory.cache_size / 1024}MB`,
        memoryMapping: `${config.sqlite.memory.mmap_size / (1024 * 1024 * 1024)}GB`,
        connectionPool: `${config.connectionPool.database.sqlite.pool.min}-${config.connectionPool.database.sqlite.pool.max}`,
      },
      build: {
        maxCores: config.build.system.maxCpuCores,
        maxMemory: config.build.system.maxMemoryUsage,
        parallelJobs: config.build.system.parallelJobs,
      },
      cache: {
        l4Size: config.cacheMemory.caching.l4.size,
        l5Size: config.cacheMemory.caching.l5.enabled ? config.cacheMemory.caching.l5.size : 'disabled',
        totalCache: config.cacheMemory.memory.system.availableForCache,
      },
      monitoring: {
        systemInterval: config.monitoring.system.cpu.interval,
        alertRules: config.monitoring.alerting.rules.length,
        ddr5Monitoring: config.monitoring.system.memory.ddr5.enabled,
      },
    },
    features: {
      crossOptimization: config.integration.crossOptimization.enabled,
      loadBalancing: config.integration.coordination.loadBalancing,
      unifiedMetrics: config.integration.monitoringIntegration.unifiedMetrics,
    },
  };
}

/**
 * Export all configurations
 */
export {
  premiumSQLiteConfig,
  premiumBuildConfig,
  premiumConnectionPoolConfig,
  premiumMonitoringConfig,
  premiumCacheMemoryConfig,
  getSQLiteConfig,
  getOptimizedBuildConfig,
  getConnectionPoolConfig,
  getMonitoringConfig,
  getCacheMemoryConfig,
};

/**
 * Default export
 */
export default masterPremiumConfig;