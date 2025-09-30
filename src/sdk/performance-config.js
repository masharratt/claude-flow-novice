/**
 * Claude SDK Performance Configuration
 * Phase 4: Production Optimization
 *
 * Provides comprehensive performance tuning parameters for SDK integration
 */

const os = require('os');

class PerformanceConfig {
  constructor(environment = 'production') {
    this.environment = environment;
    this.systemResources = this.detectSystemResources();
  }

  detectSystemResources() {
    return {
      cpuCount: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      platform: os.platform(),
      nodeVersion: process.version
    };
  }

  getCachingConfig() {
    const baseConfig = {
      enabled: true,
      ttl: 3600000, // 1 hour
      maxSize: 100, // MB
      breakpoints: 4, // Max cache segments for extended caching
      strategy: 'lru', // Least recently used

      // Cache warming strategy
      warmup: {
        enabled: true,
        patterns: [
          'common-queries',
          'validation-patterns',
          'consensus-algorithms'
        ],
        schedule: '0 */6 * * *' // Every 6 hours
      },

      // Cache invalidation
      invalidation: {
        automatic: true,
        onMemoryPressure: true,
        maxAge: 86400000, // 24 hours absolute max
        patterns: {
          agent: 3600000, // 1 hour
          swarm: 7200000, // 2 hours
          validation: 1800000 // 30 minutes
        }
      }
    };

    // Environment-specific overrides
    const envOverrides = {
      development: {
        ttl: 300000, // 5 minutes
        maxSize: 50,
        warmup: { enabled: false }
      },
      staging: {
        ttl: 1800000, // 30 minutes
        maxSize: 75
      },
      production: {
        ttl: 3600000, // 1 hour
        maxSize: 150,
        // Production gets extended TTL for prompt caching
        extendedTTL: 3600000 // 1 hour vs 5 minutes
      }
    };

    return { ...baseConfig, ...envOverrides[this.environment] };
  }

  getContextConfig() {
    return {
      editing: true,
      threshold: 0.5, // Edit at 50% full
      compression: true,
      maxTokens: 200000,

      // Context management strategies
      management: {
        strategy: 'adaptive', // adaptive, aggressive, conservative
        targetUtilization: 0.7, // Target 70% context utilization

        // Automatic compaction
        compaction: {
          enabled: true,
          triggerThreshold: 0.8, // Compact at 80%
          compressionRatio: 0.5, // Target 50% reduction
          preserveRecent: 10 // Keep last 10 messages uncompressed
        },

        // Context prioritization
        prioritization: {
          enabled: true,
          rules: [
            { type: 'system', weight: 1.0 },
            { type: 'validation-results', weight: 0.9 },
            { type: 'agent-output', weight: 0.7 },
            { type: 'debug-info', weight: 0.3 }
          ]
        }
      },

      // Token optimization
      tokenOptimization: {
        enabled: true,
        removeRedundancy: true,
        summarizeOldContent: true,
        thresholdAge: 300000 // 5 minutes
      }
    };
  }

  getValidationConfig() {
    const baseConfig = {
      confidence: {
        development: 0.7,
        staging: 0.8,
        production: 0.85
      }[this.environment],

      coverage: {
        minimum: 80,
        target: 90,
        strict: this.environment === 'production'
      },

      maxRetries: 3,
      retryDelay: 1000, // 1 second base delay
      retryBackoff: 'exponential', // exponential, linear, constant

      // Quality gates
      qualityGates: {
        syntax: {
          enabled: true,
          blocking: true
        },
        tests: {
          enabled: true,
          blocking: true,
          minimumPassRate: 0.95
        },
        coverage: {
          enabled: true,
          blocking: this.environment === 'production',
          threshold: this.environment === 'production' ? 85 : 80
        },
        security: {
          enabled: true,
          blocking: true,
          maxSeverity: 'medium' // block high/critical
        },
        performance: {
          enabled: true,
          blocking: false,
          maxResponseTime: 5000 // 5 seconds
        }
      },

      // Learning configuration
      learning: {
        enabled: true,
        windowSize: 100, // Last 100 validations
        adaptThreshold: 10, // Adapt after 10 similar failures
        shareWithSwarm: true
      }
    };

    return baseConfig;
  }

  getParallelizationConfig() {
    // Calculate optimal concurrency based on system resources
    const optimalConcurrency = Math.max(
      2,
      Math.min(
        Math.floor(this.systemResources.cpuCount * 0.75),
        10
      )
    );

    return {
      maxAgents: this.environment === 'production' ? 20 : 10,
      maxConcurrent: optimalConcurrency,
      queueSize: 100,

      // Agent pooling
      pooling: {
        enabled: true,
        minPoolSize: 2,
        maxPoolSize: optimalConcurrency,
        idleTimeout: 300000 // 5 minutes
      },

      // Load balancing
      loadBalancing: {
        strategy: 'round-robin', // round-robin, least-busy, weighted
        healthCheck: true,
        healthCheckInterval: 30000 // 30 seconds
      },

      // Rate limiting
      rateLimiting: {
        enabled: true,
        maxRequestsPerMinute: 100,
        burstSize: 20
      }
    };
  }

  getMonitoringConfig() {
    return {
      enabled: true,

      // Metrics collection
      metrics: {
        interval: 60000, // 1 minute
        retention: 604800000, // 7 days

        categories: {
          performance: {
            responseTime: true,
            throughput: true,
            errorRate: true,
            cacheHitRate: true
          },
          cost: {
            tokenUsage: true,
            cacheUtilization: true,
            apiCalls: true,
            estimatedCost: true
          },
          quality: {
            validationSuccess: true,
            testPassRate: true,
            coverageMetrics: true,
            securityIssues: true
          },
          system: {
            cpuUsage: true,
            memoryUsage: true,
            diskIO: false,
            networkIO: false
          }
        }
      },

      // Alerting
      alerts: {
        enabled: true,
        channels: ['console', 'file', 'webhook'],

        rules: [
          {
            name: 'high-error-rate',
            metric: 'errorRate',
            threshold: 0.05, // 5%
            window: 300000, // 5 minutes
            severity: 'critical'
          },
          {
            name: 'low-cache-hit-rate',
            metric: 'cacheHitRate',
            threshold: 0.5, // 50%
            window: 600000, // 10 minutes
            severity: 'warning'
          },
          {
            name: 'high-token-usage',
            metric: 'tokenUsage',
            threshold: 100000, // per hour
            window: 3600000, // 1 hour
            severity: 'warning'
          },
          {
            name: 'validation-failure-spike',
            metric: 'validationFailureRate',
            threshold: 0.2, // 20%
            window: 300000, // 5 minutes
            severity: 'high'
          }
        ]
      },

      // Dashboard
      dashboard: {
        enabled: true,
        port: 3000,
        updateInterval: 5000, // 5 seconds
        authentication: this.environment === 'production'
      },

      // Logging
      logging: {
        level: this.environment === 'production' ? 'info' : 'debug',
        format: 'json',
        destination: this.environment === 'production' ? 'file' : 'console',
        rotation: {
          enabled: true,
          maxSize: '100m',
          maxFiles: 10
        }
      }
    };
  }

  getRolloutConfig() {
    return {
      strategy: 'gradual', // gradual, blue-green, canary

      // Gradual rollout phases
      phases: [
        {
          name: 'initial',
          percentage: 5,
          duration: 86400000, // 1 day
          successCriteria: {
            errorRate: { max: 0.01 },
            validationSuccess: { min: 0.95 },
            performance: { p95: 2000 }
          }
        },
        {
          name: 'expansion',
          percentage: 25,
          duration: 172800000, // 2 days
          successCriteria: {
            errorRate: { max: 0.01 },
            validationSuccess: { min: 0.95 },
            cacheHitRate: { min: 0.6 }
          }
        },
        {
          name: 'majority',
          percentage: 75,
          duration: 259200000, // 3 days
          successCriteria: {
            errorRate: { max: 0.005 },
            validationSuccess: { min: 0.97 },
            costSavings: { min: 0.75 }
          }
        },
        {
          name: 'complete',
          percentage: 100,
          duration: null,
          successCriteria: {
            errorRate: { max: 0.001 },
            validationSuccess: { min: 0.98 },
            costSavings: { min: 0.85 }
          }
        }
      ],

      // Automatic rollback
      rollback: {
        enabled: true,
        automatic: true,

        triggers: [
          {
            metric: 'errorRate',
            threshold: 0.05,
            window: 300000 // 5 minutes
          },
          {
            metric: 'validationFailureRate',
            threshold: 0.3,
            window: 600000 // 10 minutes
          },
          {
            metric: 'performance.p95',
            threshold: 10000, // 10 seconds
            window: 300000
          }
        ],

        procedure: {
          immediate: true,
          notification: true,
          preserveMetrics: true,
          postmortemRequired: true
        }
      },

      // Feature flags
      featureFlags: {
        enabled: true,

        flags: {
          extendedCaching: true,
          contextEditing: true,
          selfValidation: true,
          parallelExecution: true,
          advancedMonitoring: true
        }
      }
    };
  }

  getOptimizationConfig() {
    return {
      // Performance optimizations
      performance: {
        enableV8Flags: true,
        v8Flags: [
          '--max-old-space-size=4096',
          '--max-semi-space-size=128'
        ],

        // Worker threads
        workers: {
          enabled: true,
          count: Math.min(4, this.systemResources.cpuCount),
          taskTypes: ['validation', 'testing', 'analysis']
        }
      },

      // Memory optimizations
      memory: {
        aggressive: this.environment === 'production',
        gcSchedule: '0 */2 * * *', // Every 2 hours
        heapSnapshot: this.environment !== 'production',

        limits: {
          maxHeapSize: '4GB',
          warningThreshold: 0.8,
          criticalThreshold: 0.95
        }
      },

      // Network optimizations
      network: {
        keepAlive: true,
        keepAliveTimeout: 30000,
        maxSockets: 50,
        compression: true
      }
    };
  }

  getCompleteConfig() {
    return {
      environment: this.environment,
      systemResources: this.systemResources,
      caching: this.getCachingConfig(),
      context: this.getContextConfig(),
      validation: this.getValidationConfig(),
      parallelization: this.getParallelizationConfig(),
      monitoring: this.getMonitoringConfig(),
      rollout: this.getRolloutConfig(),
      optimization: this.getOptimizationConfig(),

      // Metadata
      version: '1.0.0',
      generated: new Date().toISOString()
    };
  }

  exportConfig(format = 'json') {
    const config = this.getCompleteConfig();

    if (format === 'json') {
      return JSON.stringify(config, null, 2);
    } else if (format === 'env') {
      return this.toEnvFormat(config);
    } else if (format === 'yaml') {
      return this.toYamlFormat(config);
    }

    return config;
  }

  toEnvFormat(config, prefix = 'SDK_') {
    const flatten = (obj, parentKey = '') => {
      return Object.keys(obj).reduce((acc, key) => {
        const fullKey = parentKey ? `${parentKey}_${key}` : key;
        const value = obj[key];

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          Object.assign(acc, flatten(value, fullKey));
        } else {
          acc[fullKey.toUpperCase()] = Array.isArray(value)
            ? JSON.stringify(value)
            : String(value);
        }

        return acc;
      }, {});
    };

    const flattened = flatten(config, prefix);
    return Object.entries(flattened)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }

  toYamlFormat(config, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n${this.toYamlFormat(value, indent + 1)}`;
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        value.forEach(item => {
          yaml += `${spaces}  - ${JSON.stringify(item)}\n`;
        });
      } else {
        yaml += `${spaces}${key}: ${JSON.stringify(value)}\n`;
      }
    }

    return yaml;
  }
}

// Export singleton instance
const defaultConfig = new PerformanceConfig(process.env.NODE_ENV || 'production');

module.exports = {
  PerformanceConfig,
  defaultConfig,
  getConfig: (env) => new PerformanceConfig(env).getCompleteConfig(),
  exportConfig: (env, format) => new PerformanceConfig(env).exportConfig(format)
};