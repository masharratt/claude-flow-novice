/**
 * Premium SQLite Configuration for 96GB DDR5-6400 Setup
 *
 * Optimized for high-performance workloads with massive memory allocation
 * Target: DDR5-6400 with 96GB total system memory (64GB allocated to WSL2)
 */

export const premiumSQLiteConfig = {
  // ============================================================================
  // MEMORY CONFIGURATION - Optimized for 96GB DDR5-6400
  // ============================================================================

  memory: {
    // Cache configuration for 96GB setup
    cache_size: 4194304,        // 4GB cache (4M pages * 1KB = 4GB)
    temp_store: 'memory',       // Store temporary tables in memory
    mmap_size: 34359738368,     // 32GB memory mapping for ultra-fast access

    // Buffer pool optimization
    page_size: 65536,           // 64KB pages for DDR5-6400 optimization
    max_page_count: 1048576,    // 64GB worth of pages at 64KB each

    // Advanced memory settings
    cache_spill: false,         // Never spill cache to disk with 96GB
    secure_delete: false,       // Disable for performance (we have backups)

    // Memory pressure settings
    soft_heap_limit: 8589934592,  // 8GB soft limit per connection
    hard_heap_limit: 17179869184, // 16GB hard limit per connection
  },

  // ============================================================================
  // CONNECTION POOLING - High Concurrency for Multi-Core
  // ============================================================================

  connectionPool: {
    // Pool sizing for 24-core system
    minConnections: 8,          // Always keep 8 connections warm
    maxConnections: 48,         // 2x CPU cores for optimal performance
    acquireTimeoutMillis: 5000, // 5 second timeout
    createTimeoutMillis: 30000, // 30 second creation timeout

    // Connection lifecycle
    idleTimeoutMillis: 300000,  // 5 minutes idle timeout
    reapIntervalMillis: 10000,  // Check every 10 seconds
    createRetryIntervalMillis: 1000,

    // Advanced pooling
    validationQuery: 'SELECT 1',
    testOnBorrow: true,
    testOnReturn: false,
    testWhileIdle: true,

    // Performance optimization
    maxLifetime: 1800000,       // 30 minutes max connection lifetime
    keepAlive: true,
    keepAliveInitialDelay: 30000,
  },

  // ============================================================================
  // PERFORMANCE PRAGMAS - DDR5-6400 Optimized
  // ============================================================================

  pragmas: {
    // WAL mode for high concurrency
    journal_mode: 'WAL',

    // Synchronization optimized for SSD + DDR5
    synchronous: 'NORMAL',      // Good balance for SSD storage

    // Memory optimization
    temp_store: 'MEMORY',
    cache_size: -4194304,       // Negative = KB (4GB cache)
    mmap_size: 34359738368,     // 32GB mmap

    // Write optimization
    wal_autocheckpoint: 10000,  // Checkpoint every 10K pages
    wal_checkpoint_fullfsync: 0, // Disable full fsync for performance

    // Query optimization
    optimize: 'on',
    query_only: 'off',

    // Lock timeout for high concurrency
    busy_timeout: 30000,        // 30 second timeout

    // Auto vacuum for maintenance
    auto_vacuum: 'INCREMENTAL',
    incremental_vacuum: 1000,   // Vacuum 1000 pages at a time

    // DDR5-6400 specific optimizations
    read_uncommitted: 'on',     // For read-heavy workloads
    case_sensitive_like: 'off', // Faster LIKE operations
    count_changes: 'off',       // Disable for performance
    empty_result_callbacks: 'off',
    legacy_file_format: 'off',  // Use modern format
  },

  // ============================================================================
  // ADVANCED INDEXING CONFIGURATION
  // ============================================================================

  indexing: {
    // Index creation settings
    enable_load_extension: true,
    enable_fts5: true,          // Full-text search
    enable_rtree: true,         // Spatial indexing
    enable_json1: true,         // JSON functions

    // Index optimization
    analysis_limit: 10000,      // Analyze up to 10K rows
    auto_index: true,           // Automatic index creation

    // Statistics collection
    stats_collection: {
      enabled: true,
      sample_size: 100000,      // Large sample for accuracy
      histogram_buckets: 256,   // Detailed histograms
    },
  },

  // ============================================================================
  // COMPRESSION AND STORAGE
  // ============================================================================

  compression: {
    // Enable compression for large datasets
    enable_compression: true,
    compression_algorithm: 'zstd', // Best compression/speed ratio
    compression_level: 6,       // Balanced level

    // Page compression
    page_compression: true,
    compress_threshold: 8192,   // Compress pages > 8KB

    // Backup compression
    backup_compression: true,
    backup_compression_level: 9, // Maximum compression for backups
  },

  // ============================================================================
  // MONITORING AND METRICS
  // ============================================================================

  monitoring: {
    // Performance monitoring
    enable_metrics: true,
    metrics_interval: 5000,     // Collect every 5 seconds

    // Query performance tracking
    slow_query_threshold: 1000, // Log queries > 1 second
    query_plan_logging: true,

    // Memory usage tracking
    memory_tracking: true,
    cache_hit_ratio_target: 0.95, // Target 95% cache hit ratio

    // Connection monitoring
    connection_leak_detection: true,
    connection_timeout_logging: true,

    // Health checks
    health_check_interval: 30000, // Every 30 seconds
    integrity_check_interval: 3600000, // Every hour
  },

  // ============================================================================
  // BACKUP AND RECOVERY
  // ============================================================================

  backup: {
    // Automatic backup configuration
    auto_backup: true,
    backup_interval: 900000,    // Every 15 minutes
    backup_retention: 96,       // Keep 96 backups (24 hours)

    // Backup locations
    backup_paths: [
      './backups/sqlite',
      '/tmp/claude/backups',    // Secondary location
    ],

    // Backup verification
    verify_backups: true,
    verification_sample_rate: 0.1, // Verify 10% of backed up data

    // Point-in-time recovery
    enable_pitr: true,
    pitr_retention_hours: 72,   // 3 days of point-in-time recovery
  },

  // ============================================================================
  // SECURITY AND ENCRYPTION
  // ============================================================================

  security: {
    // Database encryption (if supported)
    encryption: {
      enabled: false,           // Disable for maximum performance
      algorithm: 'AES-256',
      key_rotation_days: 90,
    },

    // Access control
    read_only_connections: false,
    foreign_keys: true,         // Enforce referential integrity

    // SQL injection protection
    prepared_statements_only: true,
    parameter_validation: true,
  },

  // ============================================================================
  // HIGH AVAILABILITY
  // ============================================================================

  highAvailability: {
    // Replication settings
    replication: {
      enabled: false,           // Single-node for now
      async_replication: true,
      replication_lag_threshold: 1000, // 1 second max lag
    },

    // Failover configuration
    failover: {
      enabled: false,
      health_check_interval: 5000,
      failover_timeout: 30000,
    },

    // Load balancing
    load_balancing: {
      enabled: true,
      strategy: 'round_robin',
      weight_factor: 'connection_count',
    },
  },

  // ============================================================================
  // DDR5-6400 SPECIFIC OPTIMIZATIONS
  // ============================================================================

  ddr5Optimizations: {
    // Memory access patterns optimized for DDR5
    memory_access_pattern: 'sequential_preferred',

    // Cache line optimization (DDR5 = 64 bytes)
    cache_line_size: 64,
    prefetch_pages: 32,         // Prefetch 32 pages (2MB)

    // Memory bandwidth utilization
    memory_bandwidth_target: 0.80, // Use 80% of available bandwidth

    // NUMA optimization (if applicable)
    numa_aware: true,
    numa_local_memory: true,

    // Memory latency optimization
    low_latency_mode: true,
    memory_latency_target: 50,  // Target 50ns latency
  },

  // ============================================================================
  // DEVELOPMENT AND DEBUGGING
  // ============================================================================

  development: {
    // Debug settings (disable in production)
    debug_mode: false,
    verbose_logging: false,

    // Query analysis
    explain_query_plan: false,
    trace_queries: false,

    // Performance profiling
    profile_queries: true,
    profile_memory: true,
    profile_locks: false,

    // Testing hooks
    test_mode: false,
    mock_connections: false,
  },
};

/**
 * Environment-specific overrides
 */
export const environmentOverrides = {
  production: {
    development: {
      debug_mode: false,
      verbose_logging: false,
      trace_queries: false,
    },
    security: {
      encryption: {
        enabled: true,          // Enable encryption in production
      },
    },
  },

  development: {
    monitoring: {
      slow_query_threshold: 100, // More sensitive in dev
    },
    development: {
      debug_mode: true,
      verbose_logging: true,
    },
  },

  testing: {
    memory: {
      cache_size: 1048576,      // 1GB cache for testing
    },
    connectionPool: {
      maxConnections: 8,        // Fewer connections for testing
    },
  },
};

/**
 * Apply configuration with environment overrides
 */
export function getOptimizedConfig(environment = 'production') {
  const config = { ...premiumSQLiteConfig };
  const overrides = environmentOverrides[environment] || {};

  // Deep merge overrides
  return mergeDeep(config, overrides);
}

/**
 * Deep merge utility function
 */
function mergeDeep(target, source) {
  const output = Object.assign({}, target);

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = mergeDeep(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export default premiumSQLiteConfig;