import { Redis } from 'ioredis';

let redis: Redis | null = null;
let blockingRedis: Redis | null = null; // Separate connection for blocking operations

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.CFN_REDIS_URL || 'redis://localhost:6390');
  }
  return redis;
}

function getBlockingRedis(): Redis {
  if (!blockingRedis) {
    blockingRedis = new Redis(process.env.CFN_REDIS_URL || 'redis://localhost:6390');
  }
  return blockingRedis;
}

// =============================================
// Completion Signaling
// =============================================

export interface CompletionSignal {
  agentId: string;
  status: 'completed' | 'failed';
  success: boolean;
  testsPassed?: boolean;
  confidence?: number;
  filesModified?: string[];
  errorMessage?: string;
  durationMs: number;
  completedAt: number;
}

export async function signalCompletion(
  taskId: string,
  signal: CompletionSignal
): Promise<void> {
  const redis = getRedis();
  await redis.lpush(`cfn:complete:${taskId}`, JSON.stringify(signal));
}

export async function waitForCompletions(
  taskId: string,
  expectedCount: number,
  timeoutSeconds: number = 600
): Promise<CompletionSignal[]> {
  // Use separate blocking connection to avoid blocking the main connection
  const blockingClient = getBlockingRedis();
  const completions: CompletionSignal[] = [];

  while (completions.length < expectedCount) {
    // Use BRPOP to pop from the right (tail) for FIFO order with LPUSH
    const result = await blockingClient.brpop(`cfn:complete:${taskId}`, timeoutSeconds);

    if (!result) {
      throw new Error(`Timeout waiting for completions. Got ${completions.length}/${expectedCount}`);
    }

    const [, message] = result;
    completions.push(JSON.parse(message));
  }

  return completions;
}

// =============================================
// Agent Status Tracking
// =============================================

export async function setAgentStatus(
  agentId: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  metadata?: object
): Promise<void> {
  const redis = getRedis();
  await redis.hset(`cfn:agent:${agentId}`, {
    status,
    updatedAt: Date.now(),
    ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
  });
}

export async function getAgentStatus(agentId: string): Promise<{
  status: string;
  updatedAt: number;
  metadata?: object;
} | null> {
  const redis = getRedis();
  const data = await redis.hgetall(`cfn:agent:${agentId}`);

  if (!data || !data.status) {
    return null;
  }

  return {
    status: data.status,
    updatedAt: parseInt(data.updatedAt),
    metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
  };
}

// =============================================
// Task State (for coordinator re-spawn)
// =============================================

export interface TaskState {
  iteration: number;
  phase: string;
  completedPhases: string[];
  coordinatorContext?: object;
}

export async function saveTaskState(taskId: string, state: TaskState): Promise<void> {
  const redis = getRedis();
  await redis.hset(`cfn:state:${taskId}`, {
    iteration: state.iteration.toString(),
    phase: state.phase,
    completedPhases: JSON.stringify(state.completedPhases),
    coordinatorContext: state.coordinatorContext ? JSON.stringify(state.coordinatorContext) : '',
    updatedAt: Date.now().toString(),
  });
}

export async function getTaskState(taskId: string): Promise<TaskState | null> {
  const redis = getRedis();
  const data = await redis.hgetall(`cfn:state:${taskId}`);

  if (!data || !data.iteration) {
    return null;
  }

  return {
    iteration: parseInt(data.iteration),
    phase: data.phase,
    completedPhases: JSON.parse(data.completedPhases),
    coordinatorContext: data.coordinatorContext ? JSON.parse(data.coordinatorContext) : undefined,
  };
}

// =============================================
// Cleanup
// =============================================

export async function cleanupTask(taskId: string): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys(`cfn:*:${taskId}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function close(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  if (blockingRedis) {
    await blockingRedis.quit();
    blockingRedis = null;
  }
}
