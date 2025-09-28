/**
 * Premium Connection Pool Configuration for 96GB DDR5-6400 Setup
 *
 * High-performance connection pooling optimized for:
 * - 24-core CPU architecture
 * - 64GB WSL2 memory allocation
 * - DDR5-6400 memory bandwidth
 * - High-concurrency workloads
 */

export const premiumConnectionPoolConfig = {
  // ============================================================================
  // DATABASE CONNECTION POOLS
  // ============================================================================

  database: {
    // Primary SQLite connection pool
    sqlite: {
      // Pool sizing optimized for 24-core system
      pool: {
        min: 8,                   // Always maintain 8 connections
        max: 48,                  // 2x CPU cores for optimal throughput
        acquireTimeoutMillis: 5000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 300000, // 5 minutes
        reapIntervalMillis: 10000, // Check every 10 seconds
        createRetryIntervalMillis: 200,
        maxLifetime: 1800000,     // 30 minutes max lifetime
      },

      // Connection validation
      validation: {
        validateOnBorrow: true,
        validateOnReturn: false,
        validateWhileIdle: true,
        validationQuery: 'PRAGMA quick_check',
        validationInterval: 30000, // 30 seconds
      },

      // Performance optimization
      performance: {
        // DDR5-6400 optimized settings
        defaultTransactionIsolation: 'READ_COMMITTED',
        autoCommit: true,
        readOnly: false,

        // Connection caching
        prepareStatementCache: true,
        prepareStatementCacheSize: 1000,
        prepareStatementCacheSqlLimit: 2048,

        // Result set optimization
        defaultFetchSize: 1000,
        maxResultSetSize: 100000,

        // Memory per connection (64GB / 48 connections = ~1.3GB each)
        connectionMemoryLimit: '1GB',
        statementMemoryLimit: '128MB',
      },

      // Monitoring and metrics
      monitoring: {
        enabled: true,
        metricsInterval: 5000,    // Collect metrics every 5 seconds

        alerts: {
          poolExhaustion: 0.9,    // Alert at 90% pool usage
          slowConnection: 1000,   // Alert if connection > 1 second
          connectionLeaks: 5,     // Alert if 5+ leaked connections
        },

        tracking: {
          connectionLifetime: true,
          queryExecutionTime: true,
          poolUtilization: true,
          errorRates: true,
        },
      },
    },

    // Secondary connection pool for read-only operations
    readOnly: {
      pool: {
        min: 4,                   // Fewer read-only connections
        max: 16,                  // Dedicated read pool
        acquireTimeoutMillis: 3000,
        createTimeoutMillis: 15000,
        idleTimeoutMillis: 600000, // 10 minutes (longer for reads)
        reapIntervalMillis: 15000,
      },

      performance: {
        readOnly: true,           // Force read-only mode
        autoCommit: true,
        defaultFetchSize: 5000,   // Larger fetch for analytics
        connectionMemoryLimit: '512MB', // Less memory for read-only
      },
    },

    // High-priority connection pool for critical operations
    priority: {
      pool: {
        min: 2,                   // Always ready for priority tasks
        max: 8,                   // Dedicated priority pool
        acquireTimeoutMillis: 1000, // Fast acquisition
        createTimeoutMillis: 5000,
        priority: 'high',
      },

      performance: {
        connectionMemoryLimit: '2GB', // More memory for priority
        prepareStatementCacheSize: 2000,
      },
    },
  },

  // ============================================================================
  // HTTP/API CONNECTION POOLS
  // ============================================================================

  http: {
    // Outbound HTTP connections
    outbound: {
      // Agent configuration
      agent: {
        keepAlive: true,
        keepAliveMsecs: 30000,    // 30 seconds
        maxSockets: 100,          // 100 concurrent sockets
        maxFreeSockets: 20,       // 20 free sockets
        timeout: 30000,           // 30 second timeout
        freeSocketTimeout: 300000, // 5 minutes free socket timeout
      },

      // Connection pooling
      pool: {
        maxSockets: 200,          // Total socket limit
        maxSocketsPerHost: 50,    // Per-host limit

        // Socket reuse optimization
        socketReuse: true,
        socketReuseTimeout: 60000, // 1 minute reuse timeout

        // Request queuing
        maxQueueSize: 1000,       // 1000 queued requests
        queueTimeout: 10000,      // 10 second queue timeout
      },

      // Performance optimization
      performance: {
        // TCP optimization
        tcpKeepAlive: true,
        tcpKeepAliveInitialDelay: 30000,

        // Request/response optimization
        highWaterMark: 65536,     // 64KB buffer
        maxHeaderSize: 16384,     // 16KB max headers

        // Compression
        compression: true,
        compressionLevel: 6,      // Balanced compression
      },

      // Retry and circuit breaker
      reliability: {
        retries: 3,
        retryDelay: 1000,         // 1 second base delay
        retryBackoff: 'exponential',

        circuitBreaker: {
          enabled: true,
          threshold: 5,           // 5 failures to open
          timeout: 30000,         // 30 second timeout
          resetTimeout: 60000,    // 1 minute reset
        },
      },
    },

    // Inbound HTTP server connections
    inbound: {
      server: {
        // Connection limits
        maxConnections: 10000,    // High connection limit
        maxHeadersCount: 2000,
        maxRequestSize: '100MB',  // Large request support

        // Keep-alive optimization
        keepAliveTimeout: 65000,  // 65 seconds
        headersTimeout: 60000,    // 60 seconds
        requestTimeout: 300000,   // 5 minutes

        // Performance tuning
        highWaterMark: 65536,     // 64KB
        maxConcurrentStreams: 1000,
      },

      // Load balancing and clustering
      cluster: {
        enabled: true,
        workers: 20,              // 20 worker processes
        workerMemoryLimit: '2GB', // 2GB per worker

        // Worker lifecycle
        respawnOnExit: true,
        gracefulShutdownTimeout: 30000,
        killTimeout: 5000,

        // Load balancing
        scheduler: 'round_robin',
        stickySession: false,
      },
    },
  },

  // ============================================================================
  // WEBSOCKET CONNECTION POOLS
  // ============================================================================

  websocket: {
    // WebSocket server configuration
    server: {
      // Connection limits
      maxConnections: 5000,      // 5000 concurrent WebSocket connections
      maxFrameSize: 1048576,     // 1MB max frame
      maxMessageSize: 10485760,  // 10MB max message

      // Performance optimization
      compression: {
        enabled: true,
        threshold: 1024,          // Compress messages > 1KB
        level: 6,                 // Balanced compression
        memLevel: 8,
      },

      // Connection management
      heartbeat: {
        enabled: true,
        interval: 30000,          // 30 second ping
        timeout: 10000,           // 10 second pong timeout
      },

      // Memory management
      bufferSize: 65536,          // 64KB buffer per connection
      maxBackpressure: 1048576,   // 1MB max backpressure
    },

    // WebSocket client pool
    client: {
      pool: {
        min: 0,                   // No minimum client connections
        max: 100,                 // 100 max client connections
        acquireTimeoutMillis: 5000,
        createTimeoutMillis: 10000,
      },

      // Client configuration
      options: {
        handshakeTimeout: 30000,  // 30 second handshake
        maxRedirects: 3,
        followRedirects: true,

        // Performance
        perMessageDeflate: true,
        skipUTF8Validation: false, // Keep validation for safety
      },
    },
  },

  // ============================================================================
  // WORKER THREAD POOLS
  // ============================================================================

  workers: {
    // CPU-intensive task pool
    compute: {
      pool: {
        min: 4,                   // Always keep 4 compute workers
        max: 20,                  // 20 max workers (leave 4 cores free)
        acquireTimeoutMillis: 10000,
        idleTimeoutMillis: 600000, // 10 minutes idle timeout
      },

      // Worker configuration
      worker: {
        memoryLimit: '2GB',       // 2GB per compute worker
        cpuLimit: 1.0,            // 1 full CPU core per worker

        // V8 optimization
        v8Options: [
          '--max-old-space-size=2048', // 2GB heap
          '--optimize-for-size',
        ],
      },

      // Task distribution
      distribution: {
        strategy: 'least_busy',   // Distribute to least busy worker
        loadBalancing: true,
        queueLimit: 1000,         // 1000 queued tasks
      },
    },

    // I/O-intensive task pool
    io: {
      pool: {
        min: 8,                   // More I/O workers
        max: 32,                  // Higher limit for I/O
        acquireTimeoutMillis: 5000,
        idleTimeoutMillis: 300000, // 5 minutes
      },

      worker: {
        memoryLimit: '1GB',       // Less memory for I/O workers
        cpuLimit: 0.5,            // Half CPU core per I/O worker
      },

      // I/O optimization
      io: {
        bufferSize: 65536,        // 64KB I/O buffers
        concurrency: 4,           // 4 concurrent I/O ops per worker
        batchSize: 10,            // Batch 10 operations
      },
    },

    // Neural network processing pool
    neural: {
      pool: {
        min: 2,                   // Always keep 2 neural workers
        max: 8,                   // 8 max neural workers
        acquireTimeoutMillis: 30000, // Longer timeout for neural tasks
        idleTimeoutMillis: 1800000, // 30 minutes idle
      },

      worker: {
        memoryLimit: '4GB',       // 4GB for neural processing
        cpuLimit: 2.0,            // 2 CPU cores per neural worker

        // Neural-specific optimization
        v8Options: [
          '--max-old-space-size=4096', // 4GB heap
          '--expose-gc',
          '--optimize-for-size',
        ],
      },

      // GPU acceleration (if available)
      gpu: {
        enabled: false,           // Disabled by default
        memoryLimit: '8GB',       // 8GB GPU memory
        batchSize: 32,            // Batch size for GPU operations
      },
    },
  },

  // ============================================================================
  // MEMORY POOL MANAGEMENT
  // ============================================================================

  memory: {
    // Object pooling for performance
    objectPools: {
      // Buffer pool
      buffers: {
        sizes: [1024, 4096, 16384, 65536], // Common buffer sizes
        maxPoolSize: 1000,        // 1000 buffers per size
        preAllocate: true,        // Pre-allocate buffers
      },

      // String pool
      strings: {
        maxPoolSize: 10000,       // 10K string pool
        maxStringLength: 1024,    // Pool strings up to 1KB
      },

      // Array pool
      arrays: {
        sizes: [10, 100, 1000],   // Common array sizes
        maxPoolSize: 1000,        // 1000 arrays per size
      },
    },

    // Memory pressure management
    pressure: {
      // Thresholds for 64GB system
      low: '48GB',                // 75% usage
      medium: '54GB',             // 84% usage
      high: '60GB',               // 94% usage
      critical: '62GB',           // 97% usage

      // Actions on pressure
      actions: {
        low: ['reduce_cache'],
        medium: ['force_gc', 'reduce_pools'],
        high: ['emergency_gc', 'close_idle_connections'],
        critical: ['abort_low_priority', 'emergency_cleanup'],
      },

      // Monitoring
      checkInterval: 5000,        // Check every 5 seconds
      gcThreshold: 0.8,           // Force GC at 80% usage
    },
  },

  // ============================================================================
  // MONITORING AND METRICS
  // ============================================================================

  monitoring: {
    // Real-time metrics collection
    metrics: {
      enabled: true,
      interval: 1000,             // Collect every second

      // Metrics to track
      tracked: [
        'pool_utilization',
        'connection_count',
        'queue_length',
        'response_time',
        'error_rate',
        'memory_usage',
        'cpu_usage',
        'throughput',
      ],

      // Aggregation
      aggregation: {
        window: 60000,            // 1 minute window
        retention: 86400000,      // 24 hours retention
      },
    },

    // Health checks
    health: {
      enabled: true,
      interval: 30000,            // Check every 30 seconds

      checks: [
        'database_connectivity',
        'pool_availability',
        'memory_pressure',
        'response_times',
        'error_rates',
      ],

      // Health endpoints
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        status: '/status',
      },
    },

    // Alerting
    alerts: {
      enabled: true,

      conditions: [
        {
          name: 'pool_exhaustion',
          condition: 'pool_utilization > 0.9',
          severity: 'critical',
          cooldown: 300000,       // 5 minutes
        },
        {
          name: 'high_response_time',
          condition: 'avg_response_time > 5000',
          severity: 'warning',
          cooldown: 60000,        // 1 minute
        },
        {
          name: 'memory_pressure',
          condition: 'memory_usage > 0.85',
          severity: 'warning',
          cooldown: 120000,       // 2 minutes
        },
      ],

      // Notification channels
      channels: {
        console: true,
        file: '/tmp/claude/logs/alerts.log',
        webhook: null,            // Configure if needed
      },
    },
  },

  // ============================================================================
  // ENVIRONMENT CONFIGURATIONS
  // ============================================================================

  environments: {
    development: {
      database: {
        sqlite: {
          pool: {
            min: 2,
            max: 8,               // Fewer connections in dev
          },
        },
      },

      monitoring: {
        metrics: {
          interval: 5000,         // Less frequent in dev
        },
      },
    },

    testing: {
      database: {
        sqlite: {
          pool: {
            min: 1,
            max: 4,               // Minimal connections for testing
          },
        },
      },

      workers: {
        compute: {
          pool: {
            max: 4,               // Fewer workers for testing
          },
        },
      },
    },

    production: {
      // Use full configuration
      monitoring: {
        alerts: {
          enabled: true,          // Enable all alerts in production
        },
      },
    },
  },
};

/**
 * Get connection pool configuration for environment
 */
export function getConnectionPoolConfig(environment = 'production') {
  const config = { ...premiumConnectionPoolConfig };
  const envConfig = config.environments[environment] || {};

  return mergeDeep(config, envConfig);
}

/**
 * Initialize connection pools with configuration
 */
export async function initializeConnectionPools(config = premiumConnectionPoolConfig) {
  // Implementation would initialize actual connection pools
  console.log('Initializing premium connection pools...');

  // Database pools
  console.log(`SQLite pool: ${config.database.sqlite.pool.min}-${config.database.sqlite.pool.max} connections`);

  // Worker pools
  console.log(`Compute workers: ${config.workers.compute.pool.min}-${config.workers.compute.pool.max}`);
  console.log(`I/O workers: ${config.workers.io.pool.min}-${config.workers.io.pool.max}`);
  console.log(`Neural workers: ${config.workers.neural.pool.min}-${config.workers.neural.pool.max}`);

  // HTTP pools
  console.log(`HTTP connections: max ${config.http.outbound.pool.maxSockets}`);
  console.log(`WebSocket connections: max ${config.websocket.server.maxConnections}`);

  return {
    database: {}, // Would return actual pool instances
    workers: {},
    http: {},
    websocket: {},
  };
}

/**
 * Deep merge utility
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

export default premiumConnectionPoolConfig;