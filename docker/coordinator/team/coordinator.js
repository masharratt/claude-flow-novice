// CFN Docker Team Coordinator
// Manages team-specific agent lifecycle and resource tracking

const redis = require('redis');
const { Pool } = require('pg');

// Configuration from environment
const config = {
  teamId: process.env.TEAM_ID,
  teamName: process.env.TEAM_NAME || process.env.TEAM_ID,
  budgetAllocated: process.env.BUDGET_ALLOCATED,
  maxAgents: parseInt(process.env.MAX_AGENTS || '5'),
  redis: {
    host: process.env.REDIS_HOST || `cfn-redis-${process.env.TEAM_ID}`,
    port: parseInt(process.env.REDIS_PORT || '6379')
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'cfn-postgres',
    database: process.env.POSTGRES_DB || 'cfn_corporate',
    user: process.env.POSTGRES_USER || 'cfn_admin',
    password: process.env.POSTGRES_PASSWORD
  },
  mainCoordinator: process.env.MAIN_COORDINATOR_HOST || 'cfn-docker-main-coordinator',
  coordinatorId: process.env.COORDINATOR_ID || `team-${process.env.TEAM_ID}-${process.pid}`,
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Validate required environment variables
if (!config.teamId) {
  console.error('ERROR: TEAM_ID environment variable is required');
  process.exit(1);
}
if (!config.budgetAllocated) {
  console.error('ERROR: BUDGET_ALLOCATED environment variable is required');
  process.exit(1);
}

// Initialize clients
let redisClient;
let pgPool;

// Tracking
let activeAgents = 0;
let currentMemoryUsage = 0;

// Logging helper
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    team_id: config.teamId,
    coordinator_id: config.coordinatorId,
    message,
    ...meta
  };
  console.log(JSON.stringify(logEntry));
}

// Initialize connections
async function initialize() {
  log('info', 'Initializing CFN Docker Team Coordinator...', {
    team: config.teamName,
    budget: config.budgetAllocated,
    max_agents: config.maxAgents
  });

  // Connect to Redis
  redisClient = redis.createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port
    }
  });

  redisClient.on('error', (err) => log('error', 'Redis error', { error: err.message }));
  redisClient.on('ready', () => log('info', 'Redis connection established'));

  await redisClient.connect();

  // Connect to PostgreSQL
  pgPool = new Pool(config.postgres);
  pgPool.on('error', (err) => log('error', 'PostgreSQL error', { error: err.message }));

  const pgClient = await pgPool.connect();
  log('info', 'PostgreSQL connection established');
  pgClient.release();

  log('info', 'Team Coordinator initialized', {
    redis: `${config.redis.host}:${config.redis.port}`,
    postgres: `${config.postgres.host}/${config.postgres.database}`
  });
}

// Send heartbeat to main coordinator
async function sendHeartbeat() {
  setInterval(async () => {
    try {
      const heartbeat = {
        timestamp: new Date().toISOString(),
        team_id: config.teamId,
        coordinator_id: config.coordinatorId,
        active_agents: activeAgents,
        memory_used: currentMemoryUsage,
        memory_budget: config.budgetAllocated,
        max_agents: config.maxAgents
      };

      await redisClient.setEx(
        `team:${config.teamId}:coordinator:heartbeat`,
        90, // 90 second TTL
        JSON.stringify(heartbeat)
      );

      log('debug', 'Heartbeat sent', { active_agents: activeAgents });

    } catch (err) {
      log('error', 'Failed to send heartbeat', { error: err.message });
    }
  }, 30000); // Every 30 seconds
}

// Monitor agent heartbeats
async function monitorAgents() {
  setInterval(async () => {
    try {
      // Find all agent heartbeats for this team
      const heartbeatKeys = await redisClient.keys(`team:${config.teamId}:agent:*:heartbeat`);

      const now = Date.now();
      let liveAgents = 0;

      for (const key of heartbeatKeys) {
        const heartbeat = await redisClient.get(key);
        if (heartbeat) {
          const data = JSON.parse(heartbeat);
          const age = now - new Date(data.timestamp).getTime();

          if (age < 90000) { // Less than 90 seconds old
            liveAgents++;
          } else {
            // Agent is stuck or failed
            log('warn', 'Agent heartbeat timeout', {
              agent_id: data.agent_id,
              last_heartbeat_age_ms: age
            });

            // TODO: Implement agent recovery
            // - Mark agent as failed in database
            // - Clean up agent container
            // - Escalate to main coordinator if needed
          }
        }
      }

      activeAgents = liveAgents;

    } catch (err) {
      log('error', 'Agent monitoring failed', { error: err.message });
    }
  }, 60000); // Every 60 seconds
}

// Handle resource exhaustion
async function checkResourceLimits() {
  setInterval(async () => {
    try {
      // TODO: Implement actual resource tracking
      // For now, estimate based on active agents
      const avgMemoryPerAgent = 2048; // 2GB per agent (estimate)
      currentMemoryUsage = activeAgents * avgMemoryPerAgent;

      const budgetMB = parseInt(config.budgetAllocated.replace(/[^0-9]/g, '')) * 1024;
      const usagePercent = (currentMemoryUsage / budgetMB) * 100;

      if (usagePercent > 90) {
        log('warn', 'Memory budget exceeded', {
          usage_mb: currentMemoryUsage,
          budget_mb: budgetMB,
          usage_percent: usagePercent.toFixed(1)
        });

        // Escalate to main coordinator
        const escalation = {
          message_type: 'escalation',
          from: { type: 'team_coordinator', team: config.teamId },
          to: { type: 'main_coordinator' },
          payload: {
            escalation_type: 'resource_exceeded',
            severity: 'warning',
            context: {
              memory_used_mb: currentMemoryUsage,
              memory_limit_mb: budgetMB,
              active_agents: activeAgents
            },
            requested_action: 'allocate_more_memory'
          }
        };

        await redisClient.publish('main:escalations', JSON.stringify(escalation));
        log('info', 'Escalation sent to main coordinator');
      }

    } catch (err) {
      log('error', 'Resource limit check failed', { error: err.message });
    }
  }, 60000); // Every 60 seconds
}

// Main coordinator loop
async function main() {
  try {
    await initialize();
    await sendHeartbeat();
    await monitorAgents();
    await checkResourceLimits();

    log('info', 'Team Coordinator running', {
      team: config.teamName,
      max_agents: config.maxAgents
    });

    // Keep process alive
    process.on('SIGTERM', async () => {
      log('info', 'Received SIGTERM, shutting down gracefully...');
      await redisClient.quit();
      await pgPool.end();
      process.exit(0);
    });

  } catch (err) {
    log('error', 'Fatal error in team coordinator', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Start coordinator
main();
