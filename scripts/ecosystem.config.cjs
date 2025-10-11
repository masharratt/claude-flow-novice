/**
 * PM2 Ecosystem Configuration - Production High-Availability
 *
 * Cluster mode configuration for hierarchical coordination system (Phase 5).
 * Implements process monitoring, auto-restart, and graceful shutdown for queen agent.
 *
 * @see docs/deployment/pm2-setup.md for deployment guide
 */

module.exports = {
  apps: [
    {
      // Application name
      name: 'claude-flow-queen',

      // Entry point for queen agent server
      script: './dist/src/coordination/queen-agent.js',

      // Cluster mode configuration
      instances: 'max', // Use all CPU cores (recommended: 2-4 for PM failover)
      exec_mode: 'cluster',

      // Memory management
      max_memory_restart: '2G', // Auto-restart if memory exceeds 2GB

      // Production environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080,

        // Distributed logging
        LOG_LEVEL: 'info',
        LOG_FORMAT: 'json',

        // Cluster coordination
        CLUSTER_MODE: 'true',
        PM_FAILOVER_ENABLED: 'true',

        // Memory limits
        NODE_OPTIONS: '--max-old-space-size=2048'
      },

      // Graceful shutdown (SIGTERM → SIGKILL)
      kill_timeout: 5000, // 5s SIGTERM timeout before SIGKILL
      wait_ready: true, // Wait for process.send('ready')
      listen_timeout: 10000, // Max wait time for ready signal

      // Auto-restart configuration
      max_restarts: 10, // Maximum restarts within min_uptime window
      min_uptime: 60000, // Process must run 60s to be considered stable
      autorestart: true, // Auto-restart on crash

      // Restart on file changes (disabled in production)
      watch: false,

      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true, // Merge cluster logs into single file

      // Process management
      cron_restart: '0 3 * * *', // Daily restart at 3 AM (optional)

      // Health monitoring integration
      instance_var: 'INSTANCE_ID', // Expose instance ID to process

      // Advanced cluster options
      increment_var: 'PORT', // Auto-increment PORT for each instance

      // Post-deployment scripts (optional)
      post_update: ['npm install', 'npm run build'],

      // Error handling
      exp_backoff_restart_delay: 100 // Exponential backoff: 100ms, 200ms, 400ms...
    }
  ],

  // Deployment configuration (optional - for PM2 deploy)
  deploy: {
    production: {
      user: 'deploy',
      host: 'production-server',
      ref: 'origin/main',
      repo: 'git@github.com:masharratt/claude-flow-novice.git',
      path: '/var/www/claude-flow',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
};
