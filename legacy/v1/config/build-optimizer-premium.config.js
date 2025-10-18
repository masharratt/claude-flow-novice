/**
 * Premium Build Optimizer Configuration for 96GB DDR5-6400 Setup
 *
 * Optimized for maximum build performance using available system resources
 * Target: 24-core CPU with 64GB WSL2 allocation and DDR5-6400 memory
 */

import { createRequire } from 'module';
import { cpus, totalmem } from 'os';
import { buildConfig } from '../scripts/build/build-config.js';

const require = createRequire(import.meta.url);

export const premiumBuildConfig = {
  // ============================================================================
  // SYSTEM RESOURCE OPTIMIZATION
  // ============================================================================

  system: {
    // CPU utilization (24 cores available)
    maxCpuCores: 22,              // Leave 2 cores for system
    parallelJobs: 20,             // 20 parallel compilation jobs
    threadPoolSize: 24,           // Full thread pool utilization

    // Memory allocation (64GB WSL2)
    maxMemoryUsage: '56GB',       // 56GB max for builds (leave 8GB buffer)
    heapSizeLimit: '12GB',        // 12GB Node.js heap limit
    v8MaxOldSpace: 12288,         // 12GB in MB

    // Build cache optimization
    cacheSize: '8GB',             // 8GB build cache
    cacheDirectory: '/tmp/claude/build-cache',
    persistentCache: true,

    // Temporary directory optimization
    tempDirectory: '/tmp/claude/build-temp',
    tempSizeLimit: '16GB',        // 16GB temp space
  },

  // ============================================================================
  // TYPESCRIPT COMPILATION OPTIMIZATION
  // ============================================================================

  typescript: {
    // Compiler options optimized for DDR5-6400
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'node',

      // Performance optimizations
      incremental: true,
      tsBuildInfoFile: '/tmp/claude/build-cache/.tsbuildinfo',

      // Memory optimization
      preserveWatchOutput: false,
      assumeChangesOnlyAffectDirectDependencies: true,

      // Advanced optimizations
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      disableSourceOfProjectReferenceRedirect: true,

      // Path mapping optimization
      baseUrl: '.',
      paths: {
        '@/*': ['./src/*'],
        '@config/*': ['./config/*'],
        '@utils/*': ['./src/utils/*'],
        '@memory/*': ['./src/memory/*'],
        '@neural/*': ['./src/neural/*'],
      },
    },

    // Build performance settings
    performance: {
      // Use all available cores
      maxNodeModuleJsDepth: 3,

      // Memory management
      memoryLimit: 8192,          // 8GB TypeScript memory limit

      // Cache optimization
      useIncrementalCache: true,
      cacheStrategy: 'aggressive',

      // Parallel compilation
      parallel: true,
      parallelJobs: 20,

      // Watch mode optimization
      watchOptions: {
        aggregateTimeout: 200,
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/coverage/**',
          '**/.*',
        ],
        followSymlinks: false,
        usePolling: false,          // Use inotify for better performance
      },
    },
  },

  // ============================================================================
  // BUNDLING AND OPTIMIZATION
  // ============================================================================

  bundling: {
    // Webpack/ESBuild optimization
    optimization: {
      // Code splitting for better caching
      splitChunks: {
        chunks: 'all',
        minSize: 20000,
        maxSize: 2000000,         // 2MB max chunk size

        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 20,
          },
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            priority: 10,
          },
          neural: {
            test: /[\\/]src[\\/]neural[\\/]/,
            name: 'neural',
            chunks: 'all',
            priority: 15,
          },
        },
      },

      // Minification settings
      minimize: true,
      minimizer: {
        terser: {
          parallel: 20,            // Use 20 cores for minification
          cache: true,
          cacheLocation: '/tmp/claude/build-cache/terser',

          terserOptions: {
            compress: {
              drop_console: false,   // Keep console for debugging
              drop_debugger: true,
              pure_funcs: ['console.debug'],
            },
            mangle: {
              safari10: true,
            },
            output: {
              comments: false,
            },
          },
        },
      },

      // Tree shaking optimization
      usedExports: true,
      sideEffects: false,
      providedExports: true,
      innerGraph: true,

      // Module concatenation
      concatenateModules: true,
      flagIncludedChunks: true,
      mergeDuplicateChunks: true,
      removeEmptyChunks: true,
    },

    // Performance budgets
    performance: {
      maxAssetSize: 5000000,      // 5MB max asset size
      maxEntrypointSize: 10000000, // 10MB max entrypoint

      hints: 'warning',
      assetFilter: (assetFilename) => {
        return !assetFilename.endsWith('.map');
      },
    },
  },

  // ============================================================================
  // MEMORY OPTIMIZATION FOR DDR5-6400
  // ============================================================================

  memory: {
    // Buffer optimization for DDR5
    bufferSize: 65536,            // 64KB buffers (cache line optimized)
    preallocation: true,
    memoryMapping: true,

    // Garbage collection optimization
    gc: {
      maxOldSpaceSize: 12288,     // 12GB
      maxSemiSpaceSize: 256,      // 256MB

      // V8 flags for DDR5 optimization
      v8Flags: [
        '--max-old-space-size=12288',
        '--max-semi-space-size=256',
        '--optimize-for-size',
        '--memory-reducer',
        '--use-idle-notification',
        '--expose-gc',
      ],
    },

    // Memory monitoring
    monitoring: {
      enabled: true,
      threshold: 0.85,            // Alert at 85% usage
      interval: 5000,             // Check every 5 seconds

      actions: {
        onHighUsage: 'gc',        // Force GC on high usage
        onCritical: 'abort',      // Abort on critical usage
      },
    },
  },

  // ============================================================================
  // PARALLEL PROCESSING OPTIMIZATION
  // ============================================================================

  parallel: {
    // Worker thread configuration
    workers: {
      maxWorkers: 20,             // 20 worker threads
      minWorkers: 4,              // Always keep 4 workers

      // Worker lifecycle
      workerIdleTimeout: 300000,  // 5 minutes
      maxWorkerMemory: 2048,      // 2GB per worker

      // Task distribution
      taskDistribution: 'roundrobin',
      loadBalancing: true,

      // Worker pools
      pools: {
        typescript: {
          workers: 8,
          memory: 1024,           // 1GB per TS worker
        },
        bundling: {
          workers: 6,
          memory: 2048,           // 2GB per bundling worker
        },
        testing: {
          workers: 4,
          memory: 512,            // 512MB per test worker
        },
        linting: {
          workers: 2,
          memory: 256,            // 256MB per lint worker
        },
      },
    },

    // Async operations
    async: {
      concurrency: 50,            // 50 concurrent async operations
      queueSize: 1000,            // 1000 operation queue

      // Batching
      batchSize: 10,
      batchTimeout: 100,          // 100ms batch timeout

      // Retry logic
      retries: 3,
      retryDelay: 1000,           // 1 second retry delay
    },
  },

  // ============================================================================
  // CACHING STRATEGY
  // ============================================================================

  caching: {
    // Multi-level caching
    levels: {
      // L1: Memory cache (fastest)
      memory: {
        enabled: true,
        size: '2GB',
        ttl: 300000,              // 5 minutes
        algorithm: 'lru',
      },

      // L2: SSD cache (fast)
      disk: {
        enabled: true,
        path: '/tmp/claude/build-cache/disk',
        size: '8GB',
        ttl: 86400000,            // 24 hours
        compression: true,
      },

      // L3: Network cache (if available)
      network: {
        enabled: false,
        url: null,
        ttl: 604800000,           // 7 days
      },
    },

    // Cache strategies
    strategies: {
      source: 'aggressive',       // Cache source files aggressively
      dependencies: 'moderate',   // Moderate caching for deps
      outputs: 'conservative',    // Conservative output caching
    },

    // Cache warming
    warming: {
      enabled: true,
      preload: [
        'typescript-compiler',
        'node-modules',
        'source-maps',
      ],
    },
  },

  // ============================================================================
  // I/O OPTIMIZATION FOR SSD + DDR5
  // ============================================================================

  io: {
    // File system optimization
    filesystem: {
      // Async I/O settings
      asyncConcurrency: 32,       // 32 concurrent file operations
      bufferSize: 1048576,        // 1MB read/write buffers

      // Directory watching
      watcherOptions: {
        usePolling: false,        // Use inotify for better performance
        interval: 100,            // 100ms polling interval (fallback)
        binaryInterval: 300,      // 300ms for binary files

        ignored: /node_modules|\.git|dist|coverage/,
        persistent: true,
        followSymlinks: false,

        // Performance optimization
        atomic: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      },
    },

    // Network optimization (for dependencies)
    network: {
      // Connection pooling
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 30000,             // 30 second timeout
      keepAlive: true,

      // Retry settings
      retries: 3,
      retryDelay: 1000,

      // Compression
      compression: true,
      gzip: true,
    },
  },

  // ============================================================================
  // DEVELOPMENT ENVIRONMENT OPTIMIZATION
  // ============================================================================

  development: {
    // Hot module replacement
    hmr: {
      enabled: true,
      port: 3001,
      overlay: true,

      // Performance settings
      poll: false,                // Disable polling for better performance
      aggregateTimeout: 300,      // 300ms aggregation

      // Memory optimization
      maxEntries: 1000,           // Limit HMR entries
      cleanup: true,              // Auto cleanup old entries
    },

    // Development server
    devServer: {
      // Performance optimization
      compress: true,
      cacheControl: 'max-age=31536000',

      // Memory settings
      maxMemory: '4GB',

      // File watching
      watchFiles: ['src/**/*'],
      watchOptions: {
        aggregateTimeout: 200,
        poll: false,
        ignored: ['**/node_modules/**'],
      },
    },

    // Live reload
    liveReload: {
      enabled: true,
      delay: 500,                 // 500ms delay

      // Performance optimization
      usePolling: false,
      interval: 1000,

      // Resource limits
      maxFiles: 10000,
      maxFileSize: 10485760,      // 10MB max file size
    },
  },

  // ============================================================================
  // TESTING OPTIMIZATION
  // ============================================================================

  testing: {
    // Jest configuration
    jest: {
      // Performance settings
      maxWorkers: '50%',          // Use 50% of cores for testing
      cache: true,
      cacheDirectory: '/tmp/claude/build-cache/jest',

      // Memory optimization
      maxConcurrency: 10,         // 10 concurrent test suites
      workerIdleMemoryLimit: '512MB',

      // Coverage optimization
      collectCoverageFrom: [
        'src/**/*.{ts,tsx,js,jsx}',
        '!src/**/*.d.ts',
        '!src/**/*.test.{ts,tsx,js,jsx}',
        '!src/**/__tests__/**',
      ],

      coverageReporters: ['text-summary', 'lcov'],
      coverageThreshold: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    // Test execution optimization
    execution: {
      parallel: true,
      timeout: 30000,             // 30 second test timeout

      // Resource limits
      memoryLimit: '1GB',         // 1GB per test worker

      // Cleanup
      forceExit: true,
      detectOpenHandles: true,
      detectLeaks: true,
    },
  },

  // ============================================================================
  // MONITORING AND METRICS
  // ============================================================================

  monitoring: {
    // Build performance tracking
    performance: {
      enabled: true,

      // Metrics collection
      metrics: [
        'build_time',
        'memory_usage',
        'cpu_usage',
        'cache_hit_ratio',
        'bundle_size',
        'compilation_time',
      ],

      // Alerting
      alerts: {
        slowBuild: 300000,        // Alert if build > 5 minutes
        highMemory: 0.9,          // Alert at 90% memory usage
        lowCacheHit: 0.7,         // Alert if cache hit < 70%
      },
    },

    // Resource monitoring
    resources: {
      enabled: true,
      interval: 5000,             // Monitor every 5 seconds

      thresholds: {
        cpu: 0.95,                // 95% CPU threshold
        memory: 0.85,             // 85% memory threshold
        disk: 0.9,                // 90% disk threshold
      },
    },
  },

  // ============================================================================
  // INTEGRATION WITH EXISTING CONFIG
  // ============================================================================

  integration: {
    // Merge with existing build config
    baseConfig: buildConfig,

    // Override settings
    overrides: {
      moduleAliases: {
        ...buildConfig.moduleAliases,
        '@config/*': ['./config/*'],
        '@premium/*': ['./config/premium/*'],
      },

      externals: [
        ...buildConfig.externals,
        'better-sqlite3',
        'sharp',                  // Image processing
        'canvas',                 // Canvas operations
      ],
    },
  },
};

/**
 * Environment-specific configurations
 */
export const environmentConfigs = {
  development: {
    system: {
      maxCpuCores: 16,            // Lighter load in development
      maxMemoryUsage: '32GB',
    },

    typescript: {
      compilerOptions: {
        sourceMap: true,
        declaration: true,
      },
    },

    bundling: {
      optimization: {
        minimize: false,          // No minification in dev
      },
    },
  },

  production: {
    system: {
      maxCpuCores: 22,            // Maximum cores in production
      maxMemoryUsage: '56GB',
    },

    bundling: {
      optimization: {
        minimize: true,           // Full minification
      },
    },

    monitoring: {
      performance: {
        enabled: true,
      },
    },
  },

  testing: {
    system: {
      maxCpuCores: 12,            // Moderate load for testing
      maxMemoryUsage: '24GB',
    },

    testing: {
      jest: {
        maxWorkers: '75%',        // More workers for testing env
      },
    },
  },
};

/**
 * Get optimized build configuration
 */
export function getOptimizedBuildConfig(environment = 'production') {
  const config = { ...premiumBuildConfig };
  const envConfig = environmentConfigs[environment] || {};

  return mergeDeep(config, envConfig);
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

export default premiumBuildConfig;