/**
 * Premium Performance Monitoring Configuration for 96GB DDR5-6400 Setup
 *
 * Comprehensive monitoring optimized for high-performance systems:
 * - Real-time metrics collection with minimal overhead
 * - DDR5-6400 memory bandwidth monitoring
 * - 24-core CPU utilization tracking
 * - Advanced profiling and bottleneck detection
 */

export const premiumMonitoringConfig = {
  // ============================================================================
  // SYSTEM PERFORMANCE MONITORING
  // ============================================================================

  system: {
    // CPU monitoring optimized for 24-core system
    cpu: {
      enabled: true,
      interval: 1000,             // Monitor every second

      // Per-core monitoring
      perCore: true,
      coreThresholds: {
        warning: 80,              // 80% per-core usage warning
        critical: 95,             // 95% per-core usage critical
      },

      // Overall CPU metrics
      metrics: [
        'usage_percent',
        'load_average_1m',
        'load_average_5m',
        'load_average_15m',
        'context_switches',
        'interrupts',
        'steal_time',
        'idle_time',
      ],

      // CPU frequency monitoring (DDR5 systems)
      frequency: {
        enabled: true,
        trackTurboBoost: true,
        trackPowerStates: true,
        targetFrequency: 3800,     // Target base frequency (MHz)
      },

      // Process-level CPU monitoring
      processes: {
        enabled: true,
        topProcesses: 20,         // Track top 20 CPU consumers
        cpuThreshold: 5.0,        // Track processes using >5% CPU
      },
    },

    // Memory monitoring for 96GB DDR5-6400 system
    memory: {
      enabled: true,
      interval: 2000,             // Monitor every 2 seconds

      // DDR5-6400 specific metrics
      ddr5: {
        enabled: true,
        bandwidth: {
              target: 51200,         // 51.2 GB/s theoretical max (DDR5-6400)
              monitor: true,
              alertThreshold: 0.85,   // Alert at 85% bandwidth utilization
        },
        latency: {
          target: 50,             // Target 50ns latency
          monitor: true,
          alertThreshold: 100,    // Alert if latency > 100ns
        },
        temperature: {
          enabled: true,
          maxTemp: 85,            // 85°C max for DDR5
          warnTemp: 75,           // 75°C warning
        },
      },

      // Memory metrics
      metrics: [
        'total',
        'available',
        'used',
        'free',
        'cached',
        'buffers',
        'swap_total',
        'swap_used',
        'swap_free',
        'page_faults',
        'page_faults_major',
        'memory_bandwidth',
        'memory_latency',
      ],

      // Memory pressure monitoring
      pressure: {
        enabled: true,
        thresholds: {
          low: 75,                // 75% usage
          medium: 85,             // 85% usage
          high: 95,               // 95% usage
        },

        actions: {
          low: ['log_warning'],
          medium: ['force_gc', 'alert'],
          high: ['emergency_cleanup', 'kill_low_priority'],
        },
      },

      // Memory leak detection
      leakDetection: {
        enabled: true,
        scanInterval: 300000,     // Scan every 5 minutes
        growthThreshold: 0.1,     // 10% growth threshold
        sustainedGrowthTime: 1800000, // 30 minutes sustained growth
      },
    },

    // Disk I/O monitoring
    disk: {
      enabled: true,
      interval: 5000,             // Monitor every 5 seconds

      // SSD-specific monitoring
      ssd: {
        enabled: true,
        wearLeveling: true,
        trimSupport: true,
        targetIOPS: 100000,       // Target IOPS for NVMe SSD
      },

      metrics: [
        'reads_per_sec',
        'writes_per_sec',
        'read_bytes_per_sec',
        'write_bytes_per_sec',
        'read_latency',
        'write_latency',
        'queue_depth',
        'utilization_percent',
        'iops',
      ],

      // I/O pattern analysis
      patterns: {
        enabled: true,
        sequentialThreshold: 0.8, // 80% sequential I/O
        randomThreshold: 0.2,     // 20% random I/O
        blockSizeAnalysis: true,
      },
    },

    // Network monitoring
    network: {
      enabled: true,
      interval: 2000,             // Monitor every 2 seconds

      interfaces: ['eth0', 'wsl0'], // Common WSL interfaces

      metrics: [
        'bytes_sent',
        'bytes_recv',
        'packets_sent',
        'packets_recv',
        'errors_in',
        'errors_out',
        'drops_in',
        'drops_out',
        'bandwidth_utilization',
      ],

      // Connection tracking
      connections: {
        enabled: true,
        trackStates: ['ESTABLISHED', 'TIME_WAIT', 'CLOSE_WAIT'],
        maxConnections: 10000,    // Alert at 10K connections
      },
    },
  },

  // ============================================================================
  // APPLICATION PERFORMANCE MONITORING
  // ============================================================================

  application: {
    // Node.js specific monitoring
    nodejs: {
      enabled: true,
      interval: 1000,             // Monitor every second

      // V8 heap monitoring
      heap: {
        enabled: true,
        targetHeapSize: '12GB',   // Target heap size
        gcMonitoring: true,
        heapDumpOnOOM: true,
        heapDumpPath: '/tmp/claude/dumps',

        metrics: [
          'heap_used',
          'heap_total',
          'heap_size_limit',
          'external_memory',
          'array_buffers',
          'gc_pause_time',
          'gc_frequency',
        ],
      },

      // Event loop monitoring
      eventLoop: {
        enabled: true,
        lagThreshold: 100,        // 100ms lag threshold
        metrics: [
          'lag',
          'utilization',
          'active_handles',
          'active_requests',
        ],
      },

      // CPU profiling
      profiling: {
        enabled: true,
        sampleInterval: 100,      // 100ms sampling
        profileDuration: 60000,   // 1 minute profiles
        autoProfile: {
          enabled: true,
          cpuThreshold: 80,       // Auto-profile at 80% CPU
        },
      },
    },

    // Database performance monitoring
    database: {
      enabled: true,
      interval: 2000,             // Monitor every 2 seconds

      // SQLite specific metrics
      sqlite: {
        enabled: true,

        metrics: [
          'connection_count',
          'active_connections',
          'query_execution_time',
          'slow_queries',
          'cache_hit_ratio',
          'wal_size',
          'page_cache_size',
          'temp_files',
        ],

        // Query performance analysis
        queries: {
          enabled: true,
          slowQueryThreshold: 1000, // 1 second
          explainSlowQueries: true,
          queryPlanAnalysis: true,
          indexUsageAnalysis: true,
        },

        // Connection pool monitoring
        pool: {
          enabled: true,
          metrics: [
            'pool_size',
            'active_connections',
            'idle_connections',
            'waiting_requests',
            'pool_utilization',
          ],
        },
      },
    },

    // HTTP/API monitoring
    http: {
      enabled: true,
      interval: 1000,             // Monitor every second

      // Request metrics
      requests: {
        enabled: true,

        metrics: [
          'requests_per_second',
          'response_time_avg',
          'response_time_p95',
          'response_time_p99',
          'error_rate',
          'status_codes',
          'request_size',
          'response_size',
        ],

        // Route-specific monitoring
        routes: {
          enabled: true,
          trackRoutes: true,
          slowRouteThreshold: 5000, // 5 seconds
        },
      },

      // Connection monitoring
      connections: {
        enabled: true,
        maxConcurrent: 10000,     // Max concurrent connections
        keepAliveMonitoring: true,
        timeoutMonitoring: true,
      },
    },
  },

  // ============================================================================
  // CUSTOM METRICS AND KPIs
  // ============================================================================

  customMetrics: {
    // Claude Flow specific metrics
    claudeFlow: {
      enabled: true,
      interval: 5000,             // Monitor every 5 seconds

      metrics: [
        'agent_count',
        'active_tasks',
        'completed_tasks',
        'task_execution_time',
        'memory_usage_per_agent',
        'neural_training_progress',
        'swarm_coordination_latency',
        'hooks_execution_time',
      ],

      // Agent performance tracking
      agents: {
        enabled: true,
        perAgentMetrics: true,
        agentLifecycleTracking: true,

        metrics: [
          'spawn_time',
          'execution_time',
          'memory_usage',
          'cpu_usage',
          'error_rate',
          'success_rate',
        ],
      },

      // Neural network monitoring
      neural: {
        enabled: true,

        metrics: [
          'training_iterations',
          'loss_function',
          'accuracy',
          'inference_time',
          'model_size',
          'gpu_utilization',
        ],
      },
    },

    // Business KPIs
    business: {
      enabled: true,
      interval: 60000,            // Monitor every minute

      kpis: [
        'tasks_completed_per_hour',
        'average_task_completion_time',
        'system_uptime',
        'error_rate_percentage',
        'resource_utilization_efficiency',
        'cost_per_task',
      ],
    },
  },

  // ============================================================================
  // REAL-TIME DASHBOARDS
  // ============================================================================

  dashboards: {
    // System overview dashboard
    system: {
      enabled: true,
      refreshInterval: 2000,      // Refresh every 2 seconds

      widgets: [
        {
          type: 'cpu_usage',
          position: { x: 0, y: 0, width: 6, height: 4 },
          config: { showPerCore: true },
        },
        {
          type: 'memory_usage',
          position: { x: 6, y: 0, width: 6, height: 4 },
          config: { showDDR5Stats: true },
        },
        {
          type: 'disk_io',
          position: { x: 0, y: 4, width: 6, height: 4 },
          config: { showSSDStats: true },
        },
        {
          type: 'network_io',
          position: { x: 6, y: 4, width: 6, height: 4 },
        },
      ],
    },

    // Application dashboard
    application: {
      enabled: true,
      refreshInterval: 1000,      // Refresh every second

      widgets: [
        {
          type: 'response_times',
          position: { x: 0, y: 0, width: 8, height: 4 },
        },
        {
          type: 'throughput',
          position: { x: 8, y: 0, width: 4, height: 4 },
        },
        {
          type: 'error_rates',
          position: { x: 0, y: 4, width: 6, height: 3 },
        },
        {
          type: 'database_performance',
          position: { x: 6, y: 4, width: 6, height: 3 },
        },
      ],
    },

    // Claude Flow dashboard
    claudeFlow: {
      enabled: true,
      refreshInterval: 2000,      // Refresh every 2 seconds

      widgets: [
        {
          type: 'agent_overview',
          position: { x: 0, y: 0, width: 12, height: 6 },
        },
        {
          type: 'task_queue',
          position: { x: 0, y: 6, width: 6, height: 4 },
        },
        {
          type: 'neural_training',
          position: { x: 6, y: 6, width: 6, height: 4 },
        },
      ],
    },
  },

  // ============================================================================
  // ALERTING AND NOTIFICATIONS
  // ============================================================================

  alerting: {
    enabled: true,

    // Alert rules
    rules: [
      {
        name: 'high_cpu_usage',
        condition: 'cpu_usage > 90',
        duration: 300000,          // 5 minutes sustained
        severity: 'warning',
        cooldown: 600000,          // 10 minutes cooldown
      },
      {
        name: 'memory_pressure',
        condition: 'memory_usage > 95',
        duration: 60000,           // 1 minute sustained
        severity: 'critical',
        cooldown: 300000,          // 5 minutes cooldown
      },
      {
        name: 'disk_space_low',
        condition: 'disk_usage > 90',
        duration: 0,               // Immediate alert
        severity: 'warning',
        cooldown: 3600000,         // 1 hour cooldown
      },
      {
        name: 'slow_response_time',
        condition: 'response_time_p95 > 5000',
        duration: 180000,          // 3 minutes sustained
        severity: 'warning',
        cooldown: 300000,          // 5 minutes cooldown
      },
      {
        name: 'high_error_rate',
        condition: 'error_rate > 5',
        duration: 120000,          // 2 minutes sustained
        severity: 'critical',
        cooldown: 300000,          // 5 minutes cooldown
      },
      {
        name: 'database_slow_queries',
        condition: 'slow_query_count > 10',
        duration: 300000,          // 5 minutes sustained
        severity: 'warning',
        cooldown: 600000,          // 10 minutes cooldown
      },
    ],

    // Notification channels
    channels: {
      console: {
        enabled: true,
        minSeverity: 'warning',
      },

      file: {
        enabled: true,
        path: '/tmp/claude/logs/alerts.log',
        minSeverity: 'warning',
        maxFileSize: '100MB',
        rotateFiles: 5,
      },

      webhook: {
        enabled: false,           // Configure as needed
        url: null,
        headers: {},
        minSeverity: 'critical',
      },

      email: {
        enabled: false,           // Configure as needed
        smtp: null,
        to: [],
        minSeverity: 'critical',
      },
    },
  },

  // ============================================================================
  // DATA COLLECTION AND STORAGE
  // ============================================================================

  dataCollection: {
    // Time series database
    storage: {
      type: 'sqlite',             // Use SQLite for simplicity
      path: '/tmp/claude/metrics.db',

      // Retention policies
      retention: {
        raw: '7d',                // Keep raw data for 7 days
        '1m': '30d',              // 1-minute aggregates for 30 days
        '5m': '90d',              // 5-minute aggregates for 90 days
        '1h': '1y',               // 1-hour aggregates for 1 year
        '1d': '5y',               // Daily aggregates for 5 years
      },

      // Compression
      compression: {
        enabled: true,
        algorithm: 'zstd',
        level: 6,
      },
    },

    // Batch processing
    batching: {
      enabled: true,
      batchSize: 1000,            // 1000 metrics per batch
      maxBatchTime: 10000,        // 10 seconds max batch time
      compression: true,
    },

    // Export capabilities
    export: {
      enabled: true,
      formats: ['json', 'csv', 'prometheus'],

      schedules: [
        {
          format: 'json',
          interval: '1h',
          path: '/tmp/claude/exports/hourly',
          retention: '30d',
        },
        {
          format: 'csv',
          interval: '1d',
          path: '/tmp/claude/exports/daily',
          retention: '90d',
        },
      ],
    },
  },

  // ============================================================================
  // PERFORMANCE OPTIMIZATION
  // ============================================================================

  optimization: {
    // Monitoring overhead minimization
    overhead: {
      maxCpuUsage: 2.0,           // Max 2% CPU for monitoring
      maxMemoryUsage: '512MB',    // Max 512MB memory

      // Adaptive sampling
      adaptiveSampling: {
        enabled: true,
        baseSampleRate: 1.0,      // 100% base rate
        maxSampleRate: 1.0,       // 100% max rate
        minSampleRate: 0.1,       // 10% min rate

        // Adjust based on system load
        loadThresholds: {
          low: 0.5,               // <50% load
          medium: 0.8,            // <80% load
          high: 0.95,             // <95% load
        },

        sampleRates: {
          low: 1.0,               // Full sampling at low load
          medium: 0.5,            // 50% sampling at medium load
          high: 0.1,              // 10% sampling at high load
        },
      },
    },

    // Buffer management
    buffers: {
      maxBufferSize: '256MB',     // 256MB max buffer
      flushInterval: 5000,        // Flush every 5 seconds
      compressionThreshold: 1024, // Compress buffers > 1KB
    },

    // Async processing
    async: {
      enabled: true,
      workerThreads: 4,           // 4 worker threads for processing
      queueSize: 10000,           // 10K metric queue
    },
  },

  // ============================================================================
  // ENVIRONMENT CONFIGURATIONS
  // ============================================================================

  environments: {
    development: {
      system: {
        cpu: {
          interval: 5000,         // Less frequent in dev
        },
        memory: {
          interval: 10000,        // Less frequent in dev
        },
      },

      alerting: {
        enabled: false,           // Disable alerts in dev
      },
    },

    testing: {
      dataCollection: {
        retention: {
          raw: '1h',              // Short retention for testing
        },
      },

      optimization: {
        overhead: {
          maxCpuUsage: 5.0,       // Allow more overhead in testing
        },
      },
    },

    production: {
      // Use full configuration
      alerting: {
        enabled: true,
      },

      optimization: {
        overhead: {
          maxCpuUsage: 1.0,       // Strict overhead limits in prod
        },
      },
    },
  },
};

/**
 * Get monitoring configuration for environment
 */
export function getMonitoringConfig(environment = 'production') {
  const config = { ...premiumMonitoringConfig };
  const envConfig = config.environments[environment] || {};

  return mergeDeep(config, envConfig);
}

/**
 * Initialize monitoring system
 */
export async function initializeMonitoring(config = premiumMonitoringConfig) {
  console.log('Initializing premium performance monitoring...');

  // System monitoring
  if (config.system.cpu.enabled) {
    console.log(`CPU monitoring: ${config.system.cpu.interval}ms interval`);
  }

  if (config.system.memory.enabled) {
    console.log(`Memory monitoring: ${config.system.memory.interval}ms interval (DDR5-6400 optimized)`);
  }

  // Application monitoring
  if (config.application.nodejs.enabled) {
    console.log('Node.js monitoring enabled');
  }

  if (config.application.database.enabled) {
    console.log('Database monitoring enabled');
  }

  // Custom metrics
  if (config.customMetrics.claudeFlow.enabled) {
    console.log('Claude Flow metrics enabled');
  }

  // Alerting
  if (config.alerting.enabled) {
    console.log(`Alerting enabled with ${config.alerting.rules.length} rules`);
  }

  return {
    system: {},     // Would return actual monitoring instances
    application: {},
    custom: {},
    alerts: {},
    dashboards: {},
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

export default premiumMonitoringConfig;