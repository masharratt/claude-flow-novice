/**
 * trigger.dev Configuration
 * CFN Loop Workflow Project Configuration
 */

import { defineConfig } from '@trigger.dev/sdk/v3';

export default defineConfig({
  project: 'cfn-loop-workflow',

  /**
   * Execution environment configuration
   */
  runtime: {
    // Use Node.js v20 LTS
    node: '20',

    // Disk space for temporary files and caching
    diskSizeMb: 2048,

    // Memory allocation per workflow execution
    memoryMb: 2048,

    // Maximum execution timeout (30 minutes for complex loops)
    maxDurationSeconds: 1800,
  },

  /**
   * Logging configuration
   */
  logging: {
    level: 'info',

    // Log to trigger.dev dashboard
    destination: 'dashboard',

    // Also log to stdout
    stdout: true,

    // Include timestamps in logs
    timestamps: true,

    // Include workflow context in logs
    contextInfo: true,
  },

  /**
   * Job concurrency limits
   */
  concurrency: {
    // Max concurrent Loop 3 agents
    loop3Agents: 5,

    // Max concurrent Loop 2 validators
    loop2Validators: 5,

    // Total concurrent tasks
    maxConcurrentTasks: 10,
  },

  /**
   * Error handling and retry configuration
   */
  errorHandling: {
    // Retry failed tasks once
    maxRetries: 1,

    // Backoff strategy
    backoffStrategy: 'exponential',

    // Initial backoff delay (milliseconds)
    backoffInitialDelayMs: 1000,

    // Max backoff delay
    backoffMaxDelayMs: 30000,
  },

  /**
   * Timeout configuration (seconds)
   * Maps to individual job timeouts
   */
  timeouts: {
    loop3Agent: 1800, // 30 minutes for implementation
    loop2Validator: 1200, // 20 minutes for validation
    gateCheck: 300, // 5 minutes for gate check
    productOwnerDecision: 300, // 5 minutes for decision
    cfnLoopWorkflow: 3600, // 1 hour max for complete loop
  },

  /**
   * Integration configuration
   */
  integrations: {
    // Redis coordination
    redis: {
      enabled: true,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      tls: process.env.REDIS_TLS === 'true',
    },

    // Observability
    observability: {
      enabled: true,
      provider: 'trigger.dev',
    },

    // Slack notifications (optional)
    slack: {
      enabled: process.env.SLACK_WEBHOOK_URL !== undefined,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
    },
  },

  /**
   * CFN-specific configuration
   */
  cfnLoop: {
    // Default execution mode
    defaultMode: 'standard' as const,

    // Maximum iterations per loop
    maxIterations: 10,

    // Whether to preserve execution history
    preserveHistory: true,

    // Execution context storage path
    contextPath: '.trigger-context',

    // Enable debug logging for troubleshooting
    debugMode: process.env.DEBUG_CFN_LOOP === 'true',

    // Redis coordination settings
    coordination: {
      // Redis key prefix for task coordination
      keyPrefix: 'cfn:loop',

      // TTL for coordination data (1 hour)
      ttlSeconds: 3600,

      // Polling interval for waiting on completions (milliseconds)
      pollingIntervalMs: 1000,

      // Max polling attempts before timeout
      maxPollingAttempts: 1800, // 30 minutes with 1s intervals
    },

    // Agent spawning configuration
    agentSpawning: {
      // CFN CLI path for agent spawning
      cfnCliPath: 'npx claude-flow-novice',

      // Timeout for individual agent spawn (seconds)
      spawnTimeoutSeconds: 30,

      // Whether to spawn agents sequentially or parallel
      parallelSpawning: true,
    },
  },

  /**
   * Development configuration
   */
  dev: {
    // Port for local development server
    port: 3000,

    // Watch for file changes
    watch: true,

    // Hot reload on changes
    hotReload: true,

    // Show detailed error messages
    verboseErrors: true,
  },

  /**
   * Production deployment configuration
   */
  production: {
    // Build optimization
    optimize: true,

    // Minify code
    minify: true,

    // Source maps in production
    sourceMaps: true,

    // Environment
    environment: 'production',
  },

  /**
   * Path configuration
   */
  paths: {
    // Source directory
    src: 'src',

    // Build output directory
    dist: 'dist',

    // Tests directory
    tests: 'tests',

    // Artifacts directory
    artifacts: '.artifacts',

    // Trigger.dev internal directory
    internal: '.trigger',
  },

  /**
   * Type checking configuration
   */
  typeCheck: {
    // Enable TypeScript strict mode
    strict: true,

    // Report unused variables
    noUnusedLocals: true,

    // Report unused parameters
    noUnusedParameters: true,

    // Require explicit return types
    explicitReturnTypes: true,
  },
});
