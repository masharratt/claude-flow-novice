/**
 * Chaos Engineering Test Utilities - Sprint 3.4
 *
 * Provides helper functions for chaos engineering tests:
 * - Coordinator spawning with chaos configurations
 * - Process management (kill, restart)
 * - Redis server control
 * - Network partition simulation
 * - State capture and comparison
 * - Reconnection verification
 *
 * Epic: production-blocking-coordination
 * Sprint: 3.4 - Chaos Engineering Tests
 *
 * @module tests/chaos/utils/chaos-helpers
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import {
  BlockingCoordinationSignals,
  SignalType,
  type SignalPayload,
} from '../../../src/cfn-loop/blocking-coordination-signals.js';

const execAsync = promisify(exec);

// ===== TYPE DEFINITIONS =====

export interface CoordinatorConfig {
  coordinatorId: string;
  timeout: number;
  clockSkew?: string; // e.g., '+5m', '-5m'
  redis?: RedisOptions;
}

export interface CoordinatorInstance {
  id: string;
  pid: number;
  process: ReturnType<typeof spawn>;
  config: CoordinatorConfig;
  startTime: number;
  isAlive: boolean;
}

export interface CoordinatorState {
  coordinatorId: string;
  heartbeatTimestamp: number;
  signalsReceived: number;
  signalsSent: number;
  iteration: number;
  status: 'waiting' | 'completed' | 'timeout' | 'error';
}

export interface UptimeMetrics {
  totalDuration: number;
  aliveDuration: number;
  deadDuration: number;
  uptimePercent: number;
  coordinatorStates: Map<string, { alive: number; dead: number }>;
}

// ===== REDIS CONFIGURATION =====

export const DEFAULT_REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '15'), // Test database
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 50, 500);
  },
};

// ===== COORDINATOR MANAGEMENT =====

/**
 * Spawn a coordinator with chaos configuration
 */
export async function spawnCoordinator(config: CoordinatorConfig): Promise<CoordinatorInstance> {
  const { coordinatorId, timeout, clockSkew, redis } = config;

  // Build coordinator spawn command
  const args = [
    '--coordinator-id', coordinatorId,
    '--timeout', timeout.toString(),
  ];

  if (clockSkew) {
    args.push('--clock-skew', clockSkew);
  }

  if (redis) {
    args.push('--redis-host', redis.host as string);
    args.push('--redis-port', (redis.port as number).toString());
    args.push('--redis-db', (redis.db as number).toString());
  }

  // Spawn coordinator process
  const coordinatorProcess = spawn('node', [
    'tests/chaos/fixtures/coordinator-runner.js',
    ...args,
  ], {
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const instance: CoordinatorInstance = {
    id: coordinatorId,
    pid: coordinatorProcess.pid!,
    process: coordinatorProcess,
    config,
    startTime: Date.now(),
    isAlive: true,
  };

  // Handle process exit
  coordinatorProcess.on('exit', (code) => {
    instance.isAlive = false;
  });

  return instance;
}

/**
 * Spawn multiple coordinators
 */
export async function spawnCoordinators(
  count: number,
  baseConfig?: Partial<CoordinatorConfig>
): Promise<CoordinatorInstance[]> {
  const coordinators: CoordinatorInstance[] = [];

  for (let i = 0; i < count; i++) {
    const config: CoordinatorConfig = {
      coordinatorId: `chaos-coordinator-${i}`,
      timeout: baseConfig?.timeout || 10 * 60 * 1000, // 10 min default
      ...baseConfig,
    };

    const instance = await spawnCoordinator(config);
    coordinators.push(instance);
  }

  return coordinators;
}

/**
 * Kill a coordinator process
 */
export function killProcess(pid: number, signal: NodeJS.Signals = 'SIGKILL'): void {
  try {
    process.kill(pid, signal);
  } catch (error) {
    // Process already dead
    console.warn(`Failed to kill process ${pid}:`, error);
  }
}

/**
 * Kill all coordinators
 */
export function killAllCoordinators(coordinators: CoordinatorInstance[]): void {
  for (const coordinator of coordinators) {
    if (coordinator.isAlive) {
      killProcess(coordinator.pid);
    }
  }
}

/**
 * Get random coordinator from list
 */
export function randomCoordinator(coordinators: CoordinatorInstance[]): CoordinatorInstance {
  const aliveCoordinators = coordinators.filter(c => c.isAlive);
  if (aliveCoordinators.length === 0) {
    throw new Error('No alive coordinators available');
  }
  const index = Math.floor(Math.random() * aliveCoordinators.length);
  return aliveCoordinators[index];
}

// ===== REDIS MANAGEMENT =====

/**
 * Restart Redis server
 */
export async function restartRedis(): Promise<void> {
  try {
    // Try systemd first (Linux)
    await execAsync('sudo systemctl restart redis-server');
  } catch (error) {
    try {
      // Try Homebrew (macOS)
      await execAsync('brew services restart redis');
    } catch (error2) {
      try {
        // Try docker (if Redis is in container)
        await execAsync('docker restart redis');
      } catch (error3) {
        console.error('Failed to restart Redis with all methods');
        throw new Error('Redis restart failed');
      }
    }
  }

  // Wait for Redis to be ready
  await waitForRedis(5000); // 5 second timeout
}

/**
 * Wait for Redis to be ready
 */
export async function waitForRedis(timeout: number = 10000): Promise<void> {
  const redis = new Redis(DEFAULT_REDIS_CONFIG);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await redis.ping();
      await redis.quit();
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw new Error('Redis not ready within timeout');
}

/**
 * Wait for coordinators to reconnect to Redis
 */
export async function waitForReconnection(
  coordinators: CoordinatorInstance[],
  timeout: number
): Promise<void> {
  const redis = new Redis(DEFAULT_REDIS_CONFIG);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    let allReconnected = true;

    for (const coordinator of coordinators) {
      if (!coordinator.isAlive) continue;

      const heartbeatKey = `blocking:heartbeat:${coordinator.id}`;
      const heartbeat = await redis.get(heartbeatKey);

      if (!heartbeat) {
        allReconnected = false;
        break;
      }
    }

    if (allReconnected) {
      await redis.quit();
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await redis.quit();
  throw new Error('Coordinators did not reconnect within timeout');
}

// ===== NETWORK PARTITION =====

/**
 * Create network partition using iptables (Linux only)
 *
 * WARNING: Requires root/sudo privileges
 */
export async function createNetworkPartition(port: string): Promise<void> {
  try {
    // Block incoming connections to Redis port
    await execAsync(`sudo iptables -A INPUT -p tcp --dport ${port} -j DROP`);

    // Block outgoing connections to Redis port
    await execAsync(`sudo iptables -A OUTPUT -p tcp --dport ${port} -j DROP`);

    console.log(`Network partition created for port ${port}`);
  } catch (error) {
    throw new Error(`Failed to create network partition: ${error}`);
  }
}

/**
 * Heal network partition (remove iptables rules)
 *
 * WARNING: Requires root/sudo privileges
 */
export async function healNetworkPartition(port: string): Promise<void> {
  try {
    // Remove blocking rules
    await execAsync(`sudo iptables -D INPUT -p tcp --dport ${port} -j DROP`);
    await execAsync(`sudo iptables -D OUTPUT -p tcp --dport ${port} -j DROP`);

    console.log(`Network partition healed for port ${port}`);
  } catch (error) {
    throw new Error(`Failed to heal network partition: ${error}`);
  }
}

/**
 * Check if network partition is supported (Linux with iptables)
 */
export async function isNetworkPartitionSupported(): Promise<boolean> {
  try {
    await execAsync('which iptables');
    await execAsync('which sudo');
    return true;
  } catch {
    return false;
  }
}

// ===== STATE MANAGEMENT =====

/**
 * Capture coordinator state from Redis
 */
export async function captureState(
  coordinators: CoordinatorInstance[]
): Promise<Map<string, CoordinatorState>> {
  const redis = new Redis(DEFAULT_REDIS_CONFIG);
  const states = new Map<string, CoordinatorState>();

  for (const coordinator of coordinators) {
    const heartbeatKey = `blocking:heartbeat:${coordinator.id}`;
    const heartbeatData = await redis.get(heartbeatKey);

    if (!heartbeatData) {
      states.set(coordinator.id, {
        coordinatorId: coordinator.id,
        heartbeatTimestamp: 0,
        signalsReceived: 0,
        signalsSent: 0,
        iteration: 0,
        status: 'error',
      });
      continue;
    }

    try {
      const heartbeat = JSON.parse(heartbeatData);
      states.set(coordinator.id, {
        coordinatorId: coordinator.id,
        heartbeatTimestamp: heartbeat.timestamp,
        signalsReceived: heartbeat.signalsReceived || 0,
        signalsSent: heartbeat.signalsSent || 0,
        iteration: heartbeat.iteration || 0,
        status: heartbeat.status || 'waiting',
      });
    } catch (error) {
      states.set(coordinator.id, {
        coordinatorId: coordinator.id,
        heartbeatTimestamp: 0,
        signalsReceived: 0,
        signalsSent: 0,
        iteration: 0,
        status: 'error',
      });
    }
  }

  await redis.quit();
  return states;
}

/**
 * Compare coordinator states for equality
 */
export function compareStates(
  state1: Map<string, CoordinatorState>,
  state2: Map<string, CoordinatorState>
): boolean {
  if (state1.size !== state2.size) {
    return false;
  }

  for (const [id, s1] of state1) {
    const s2 = state2.get(id);
    if (!s2) return false;

    // Compare critical fields (allow timestamp drift)
    if (
      s1.signalsReceived !== s2.signalsReceived ||
      s1.signalsSent !== s2.signalsSent ||
      s1.iteration !== s2.iteration ||
      s1.status !== s2.status
    ) {
      return false;
    }
  }

  return true;
}

// ===== UPTIME CALCULATION =====

/**
 * Calculate coordinator uptime percentage
 */
export function calculateUptime(coordinators: CoordinatorInstance[]): number {
  if (coordinators.length === 0) return 0;

  const now = Date.now();
  let totalAliveDuration = 0;
  let totalPossibleDuration = 0;

  for (const coordinator of coordinators) {
    const duration = now - coordinator.startTime;
    totalPossibleDuration += duration;

    if (coordinator.isAlive) {
      totalAliveDuration += duration;
    }
  }

  if (totalPossibleDuration === 0) return 0;

  return totalAliveDuration / totalPossibleDuration;
}

/**
 * Calculate detailed uptime metrics
 */
export function calculateUptimeMetrics(
  coordinators: CoordinatorInstance[],
  startTime: number,
  endTime: number
): UptimeMetrics {
  const totalDuration = endTime - startTime;
  const coordinatorStates = new Map<string, { alive: number; dead: number }>();

  let totalAliveDuration = 0;
  let totalDeadDuration = 0;

  for (const coordinator of coordinators) {
    const aliveDuration = coordinator.isAlive
      ? endTime - coordinator.startTime
      : 0;
    const deadDuration = totalDuration - aliveDuration;

    totalAliveDuration += aliveDuration;
    totalDeadDuration += deadDuration;

    coordinatorStates.set(coordinator.id, {
      alive: aliveDuration,
      dead: deadDuration,
    });
  }

  return {
    totalDuration,
    aliveDuration: totalAliveDuration,
    deadDuration: totalDeadDuration,
    uptimePercent: totalDuration > 0 ? (totalAliveDuration / (totalDuration * coordinators.length)) : 0,
    coordinatorStates,
  };
}

// ===== DEAD COORDINATOR DETECTION =====

/**
 * Check if dead coordinator was detected
 */
export async function deadCoordinatorDetected(
  coordinatorId: string,
  timeout: number = 2 * 60 * 1000 // 2 minutes
): Promise<boolean> {
  const redis = new Redis(DEFAULT_REDIS_CONFIG);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    // Check for escalation record
    const escalationKey = `coordinator:escalation:${coordinatorId}`;
    const escalation = await redis.get(escalationKey);

    if (escalation) {
      await redis.quit();
      return true;
    }

    // Check for dead notification
    const deadKey = `coordinator:dead:${coordinatorId}`;
    const dead = await redis.get(deadKey);

    if (dead) {
      await redis.quit();
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  await redis.quit();
  return false;
}

/**
 * Check if circuit breaker is open (Redis connection failed)
 */
export async function circuitBreakerOpen(
  coordinators: CoordinatorInstance[]
): Promise<boolean> {
  const redis = new Redis(DEFAULT_REDIS_CONFIG);

  for (const coordinator of coordinators) {
    const circuitKey = `coordinator:circuit:${coordinator.id}`;
    const circuitState = await redis.get(circuitKey);

    if (circuitState === 'open') {
      await redis.quit();
      return true;
    }
  }

  await redis.quit();
  return false;
}

// ===== SIGNAL HELPERS =====

/**
 * Send signal to random coordinator
 */
export async function sendSignal(
  senderId: string,
  receiverId: string,
  signalType: SignalType = SignalType.WAKE
): Promise<void> {
  const signals = new BlockingCoordinationSignals({
    redisHost: DEFAULT_REDIS_CONFIG.host as string,
    redisPort: DEFAULT_REDIS_CONFIG.port as number,
    redisDatabase: DEFAULT_REDIS_CONFIG.db as number,
  });

  await signals.connect();
  await signals.sendSignal(senderId, receiverId, signalType, 1, {
    timestamp: Date.now(),
  });
  await signals.disconnect();
}

// ===== UTILITIES =====

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Cleanup all Redis test data
 */
export async function cleanupRedis(): Promise<void> {
  const redis = new Redis(DEFAULT_REDIS_CONFIG);

  const patterns = [
    'blocking:*',
    'coordinator:*',
    'chaos:*',
  ];

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  await redis.quit();
}

/**
 * Verify all coordinators have completed or timed out (no hung coordinators)
 */
export async function verifyNoHungCoordinators(
  coordinators: CoordinatorInstance[]
): Promise<boolean> {
  const states = await captureState(coordinators);

  for (const [id, state] of states) {
    if (state.status === 'waiting') {
      // Still waiting - check if it should have timed out
      const coordinator = coordinators.find(c => c.id === id);
      if (!coordinator) continue;

      const elapsed = Date.now() - coordinator.startTime;
      if (elapsed > coordinator.config.timeout + 60000) { // 1 minute grace period
        return false; // Hung coordinator detected
      }
    }
  }

  return true;
}

// ===== EXPORTS =====

export default {
  spawnCoordinator,
  spawnCoordinators,
  killProcess,
  killAllCoordinators,
  randomCoordinator,
  restartRedis,
  waitForRedis,
  waitForReconnection,
  createNetworkPartition,
  healNetworkPartition,
  isNetworkPartitionSupported,
  captureState,
  compareStates,
  calculateUptime,
  calculateUptimeMetrics,
  deadCoordinatorDetected,
  circuitBreakerOpen,
  sendSignal,
  sleep,
  randomInt,
  cleanupRedis,
  verifyNoHungCoordinators,
  DEFAULT_REDIS_CONFIG,
};
