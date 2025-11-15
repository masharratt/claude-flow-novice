// CFN Docker Main Coordinator
// Manages cross-team resource allocation and escalations

const redis = require('redis');
const { Pool } = require('pg');

// Configuration from environment
const config = {
  redis: {
    host: process.env.REDIS_HOST || 'cfn-redis-shared',
    port: parseInt(process.env.REDIS_PORT || '6379')
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'cfn-postgres',
    database: process.env.POSTGRES_DB || 'cfn_corporate',
    user: process.env.POSTGRES_USER || 'cfn_admin',
    password: process.env.POSTGRES_PASSWORD
  },
  coordinatorId: process.env.COORDINATOR_ID || `main-${process.pid}`,
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Initialize clients
let redisClient;
let pgPool;

// Logging helper
function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    coordinator_id: config.coordinatorId,
    message,
    ...meta
  };
  console.log(JSON.stringify(logEntry));
}

// Initialize connections
async function initialize() {
  log('info', 'Initializing CFN Docker Main Coordinator...');

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

  log('info', 'Main Coordinator initialized', {
    redis: `${config.redis.host}:${config.redis.port}`,
    postgres: `${config.postgres.host}/${config.postgres.database}`
  });
}

// Handle escalations from team coordinators
async function handleEscalations() {
  log('info', 'Listening for escalations...');

  const subscriber = redisClient.duplicate();
  await subscriber.connect();

  await subscriber.subscribe('main:escalations', async (message) => {
    try {
      const escalation = JSON.parse(message);
      log('info', 'Received escalation', escalation);

      // TODO: Implement escalation handling logic
      // - Resource exceeded: Approve temporary budget increase
      // - Agent failures: Investigate and restart
      // - Queue overload: Redistribute tasks

    } catch (err) {
      log('error', 'Failed to process escalation', { error: err.message });
    }
  });
}

// Monitor system health
async function monitorHealth() {
  setInterval(async () => {
    try {
      // Check team coordinator heartbeats
      const teams = await redisClient.keys('team:*:coordinator:heartbeat');

      const health = {
        timestamp: new Date().toISOString(),
        active_teams: teams.length,
        redis_connected: redisClient.isOpen,
        postgres_connected: pgPool.totalCount > 0
      };

      log('debug', 'Health check', health);

      // Store health metrics
      await redisClient.setEx(
        `main:health`,
        60,
        JSON.stringify(health)
      );

    } catch (err) {
      log('error', 'Health check failed', { error: err.message });
    }
  }, 30000); // Every 30 seconds
}

// Main coordinator loop
async function main() {
  try {
    await initialize();
    await handleEscalations();
    await monitorHealth();

    log('info', 'Main Coordinator running');

    // Keep process alive
    process.on('SIGTERM', async () => {
      log('info', 'Received SIGTERM, shutting down gracefully...');
      await redisClient.quit();
      await pgPool.end();
      process.exit(0);
    });

  } catch (err) {
    log('error', 'Fatal error in main coordinator', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Start coordinator
main();
