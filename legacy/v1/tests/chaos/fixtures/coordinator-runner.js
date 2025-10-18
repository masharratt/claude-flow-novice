/**
 * Coordinator Runner for Chaos Tests
 *
 * Spawns a blocking coordinator process that can be killed/restarted
 * for chaos engineering tests.
 *
 * Usage:
 *   node coordinator-runner.js --coordinator-id <id> --timeout <ms> [--clock-skew <±Xm>]
 *
 * @module tests/chaos/fixtures/coordinator-runner
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const Redis = require('ioredis');
const minimist = require('minimist');

// ===== CLI ARGUMENTS =====

const args = minimist(process.argv.slice(2), {
  string: ['coordinator-id', 'redis-host', 'clock-skew'],
  number: ['timeout', 'redis-port', 'redis-db'],
  default: {
    'redis-host': 'localhost',
    'redis-port': 6379,
    'redis-db': 15,
    'timeout': 600000, // 10 minutes
  },
});

const COORDINATOR_ID = args['coordinator-id'];
const TIMEOUT = args['timeout'];
const CLOCK_SKEW = args['clock-skew']; // e.g., '+5m', '-5m'
const REDIS_HOST = args['redis-host'];
const REDIS_PORT = args['redis-port'];
const REDIS_DB = args['redis-db'];

if (!COORDINATOR_ID) {
  console.error('Error: --coordinator-id required');
  process.exit(1);
}

// ===== CLOCK SKEW SIMULATION =====

function parseClockSkew(skew) {
  if (!skew) return 0;

  const match = skew.match(/^([+-])(\d+)m$/);
  if (!match) {
    throw new Error(`Invalid clock skew format: ${skew}. Use ±Xm (e.g., +5m, -5m)`);
  }

  const sign = match[1] === '+' ? 1 : -1;
  const minutes = parseInt(match[2]);
  return sign * minutes * 60 * 1000; // Convert to milliseconds
}

const CLOCK_SKEW_MS = parseClockSkew(CLOCK_SKEW);

/**
 * Get current time with clock skew
 */
function getSkewedTime() {
  return Date.now() + CLOCK_SKEW_MS;
}

// ===== REDIS SETUP =====

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
  retryStrategy: (times) => {
    if (times > 10) {
      // Mark circuit breaker as open
      redis.setex(`coordinator:circuit:${COORDINATOR_ID}`, 300, 'open').catch(() => {});
      return null;
    }
    return Math.min(times * 100, 3000);
  },
});

redis.on('error', (error) => {
  console.error(`[${COORDINATOR_ID}] Redis error:`, error.message);
});

redis.on('connect', () => {
  console.log(`[${COORDINATOR_ID}] Redis connected`);
  // Close circuit breaker on reconnect
  redis.setex(`coordinator:circuit:${COORDINATOR_ID}`, 300, 'closed').catch(() => {});
});

// ===== COORDINATOR STATE =====

let iteration = 0;
let signalsReceived = 0;
let signalsSent = 0;
let status = 'waiting';
let heartbeatInterval;

// ===== HEARTBEAT =====

async function sendHeartbeat() {
  try {
    const heartbeat = {
      coordinatorId: COORDINATOR_ID,
      timestamp: getSkewedTime(),
      iteration,
      signalsReceived,
      signalsSent,
      status,
      clockSkew: CLOCK_SKEW_MS,
    };

    await redis.setex(
      `blocking:heartbeat:${COORDINATOR_ID}`,
      90, // 90 second TTL
      JSON.stringify(heartbeat)
    );

    iteration++;
  } catch (error) {
    console.error(`[${COORDINATOR_ID}] Heartbeat failed:`, error.message);
  }
}

// ===== BLOCKING LOOP =====

async function blockingLoop() {
  console.log(`[${COORDINATOR_ID}] Starting blocking loop (timeout: ${TIMEOUT}ms, clock skew: ${CLOCK_SKEW_MS}ms)`);

  // Start heartbeat
  heartbeatInterval = setInterval(sendHeartbeat, 5000); // Every 5 seconds
  await sendHeartbeat(); // Initial heartbeat

  const startTime = getSkewedTime();

  // Blocking loop
  while (true) {
    // Check for signal
    try {
      const signalKey = `blocking:signal:${COORDINATOR_ID}`;
      const signal = await redis.get(signalKey);

      if (signal) {
        signalsReceived++;
        status = 'completed';

        console.log(`[${COORDINATOR_ID}] Signal received:`, signal);
        await sendHeartbeat(); // Final heartbeat

        clearInterval(heartbeatInterval);
        await cleanup();
        process.exit(0);
      }
    } catch (error) {
      console.error(`[${COORDINATOR_ID}] Signal check failed:`, error.message);
    }

    // Check for timeout
    const elapsed = getSkewedTime() - startTime;
    if (elapsed > TIMEOUT) {
      status = 'timeout';
      console.log(`[${COORDINATOR_ID}] Timeout after ${elapsed}ms`);

      await sendHeartbeat(); // Final heartbeat
      clearInterval(heartbeatInterval);
      await cleanup();
      process.exit(1);
    }

    // Sleep 500ms
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ===== CLEANUP =====

async function cleanup() {
  console.log(`[${COORDINATOR_ID}] Cleanup started`);

  try {
    // Remove heartbeat
    await redis.del(`blocking:heartbeat:${COORDINATOR_ID}`);

    // Remove signal
    await redis.del(`blocking:signal:${COORDINATOR_ID}`);

    // Remove ACKs
    const ackKeys = await redis.keys(`blocking:ack:${COORDINATOR_ID}:*`);
    if (ackKeys.length > 0) {
      await redis.del(...ackKeys);
    }

    // Remove idempotency records
    const idempotencyKeys = await redis.keys(`blocking:idempotency:*${COORDINATOR_ID}*`);
    if (idempotencyKeys.length > 0) {
      await redis.del(...idempotencyKeys);
    }

    console.log(`[${COORDINATOR_ID}] Cleanup complete`);
  } catch (error) {
    console.error(`[${COORDINATOR_ID}] Cleanup failed:`, error.message);
  } finally {
    await redis.quit();
  }
}

// ===== SIGNAL HANDLERS =====

process.on('SIGTERM', async () => {
  console.log(`[${COORDINATOR_ID}] SIGTERM received`);
  status = 'terminated';
  clearInterval(heartbeatInterval);
  await cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log(`[${COORDINATOR_ID}] SIGINT received`);
  status = 'interrupted';
  clearInterval(heartbeatInterval);
  await cleanup();
  process.exit(0);
});

process.on('SIGKILL', async () => {
  console.log(`[${COORDINATOR_ID}] SIGKILL received (ungraceful)`);
  // Cannot cleanup on SIGKILL - process is killed immediately
  process.exit(137);
});

// ===== MAIN =====

async function main() {
  try {
    await blockingLoop();
  } catch (error) {
    console.error(`[${COORDINATOR_ID}] Fatal error:`, error);
    status = 'error';
    clearInterval(heartbeatInterval);
    await cleanup();
    process.exit(1);
  }
}

main();
