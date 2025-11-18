/**
 * Conversation Fork Management
 *
 * Implements application-level conversation forking for CFN Loop iterations.
 * Stores conversation history in Redis and allows branching at specific points.
 *
 * Sprint 4: Conversation Forking (v2.7.0)
 */

import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

// Bug #6 Fix: Read Redis connection parameters from process.env
const redisHost = process.env.CFN_REDIS_HOST || 'cfn-redis';
const redisPort = process.env.CFN_REDIS_PORT || '6379';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  iteration: number;
  timestamp: string;
}

export interface ForkMetadata {
  forkId: string;
  taskId: string;
  agentId: string;
  createdAt: string;
  parentIteration: number;
  messageCount: number;
}

/**
 * Store a message in conversation history
 * MEMORY LEAK FIX: Now sets TTL on message list to prevent indefinite accumulation
 */
export async function storeMessage(
  taskId: string,
  agentId: string,
  message: Message
): Promise<void> {
  const key = `swarm:${taskId}:${agentId}:messages`;
  const messageJson = JSON.stringify(message);

  try {
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} rpush "${key}" '${messageJson.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8'
    });

    // MEMORY LEAK FIX: Set TTL on message list (24h default)
    // This prevents messages from accumulating indefinitely across multiple tasks
    const messageTTL = parseInt(process.env.CFN_MESSAGE_TTL || '86400', 10); // 24 hours
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} expire "${key}" ${messageTTL}`, {
      encoding: 'utf8'
    });
  } catch (error) {
    console.error(`[conversation-fork] Failed to store message:`, error);
    throw error;
  }
}

/**
 * Load all messages from conversation history
 */
export async function loadMessages(
  taskId: string,
  agentId: string,
  forkId?: string
): Promise<Message[]> {
  const key = forkId
    ? `swarm:${taskId}:${agentId}:fork:${forkId}:messages`
    : `swarm:${taskId}:${agentId}:messages`;

  try {
    const output = execSync(`redis-cli -h ${redisHost} -p ${redisPort} lrange "${key}" 0 -1`, {
      encoding: 'utf8'
    }).trim();

    if (!output || output === '(empty array)') {
      return [];
    }

    // Redis returns each message on a new line
    const lines = output.split('\n');
    return lines.map(line => JSON.parse(line));
  } catch (error) {
    console.error(`[conversation-fork] Failed to load messages:`, error);
    return [];
  }
}

/**
 * Create a fork from current conversation state
 * Copies all messages up to current iteration
 * MEMORY LEAK FIX: Now sets TTL on fork message list matching metadata TTL
 */
export async function createFork(
  taskId: string,
  agentId: string,
  currentIteration: number
): Promise<string> {
  // Generate unique fork ID
  const forkId = `fork-${currentIteration}-${randomBytes(4).toString('hex')}`;

  // Load messages up to current iteration
  const messages = await loadMessages(taskId, agentId);
  const forkMessages = messages.filter(m => m.iteration <= currentIteration);

  if (forkMessages.length === 0) {
    throw new Error(`No messages found for iteration ${currentIteration}`);
  }

  // Store fork snapshot
  const forkKey = `swarm:${taskId}:${agentId}:fork:${forkId}:messages`;
  const forkTTL = parseInt(process.env.CFN_FORK_TTL || '86400', 10); // 24 hours

  for (const message of forkMessages) {
    const messageJson = JSON.stringify(message);
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} rpush "${forkKey}" '${messageJson.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8'
    });
  }

  // MEMORY LEAK FIX: Set TTL on fork messages (was missing before)
  execSync(`redis-cli -h ${redisHost} -p ${redisPort} expire "${forkKey}" ${forkTTL}`, {
    encoding: 'utf8'
  });

  // Store fork metadata
  const metadata: ForkMetadata = {
    forkId,
    taskId,
    agentId,
    createdAt: new Date().toISOString(),
    parentIteration: currentIteration,
    messageCount: forkMessages.length
  };

  const metaKey = `swarm:${taskId}:${agentId}:fork:${forkId}:meta`;
  execSync(`redis-cli -h ${redisHost} -p ${redisPort} setex "${metaKey}" ${forkTTL} '${JSON.stringify(metadata)}'`, {
    encoding: 'utf8'
  });

  // Set as current fork
  const currentForkKey = `swarm:${taskId}:${agentId}:current-fork`;
  execSync(`redis-cli -h ${redisHost} -p ${redisPort} setex "${currentForkKey}" ${forkTTL} "${forkId}"`, {
    encoding: 'utf8'
  });

  console.log(`[conversation-fork] Created fork ${forkId} with ${forkMessages.length} messages (TTL: ${forkTTL}s)`);

  return forkId;
}

/**
 * Get current active fork ID
 */
export async function getCurrentFork(
  taskId: string,
  agentId: string
): Promise<string | null> {
  const key = `swarm:${taskId}:${agentId}:current-fork`;

  try {
    const forkId = execSync(`redis-cli -h ${redisHost} -p ${redisPort} get "${key}"`, {
      encoding: 'utf8'
    }).trim();

    if (forkId === '(nil)' || !forkId) {
      return null;
    }

    return forkId;
  } catch (error) {
    return null;
  }
}

/**
 * Get fork metadata
 */
export async function getForkMetadata(
  taskId: string,
  agentId: string,
  forkId: string
): Promise<ForkMetadata | null> {
  const key = `swarm:${taskId}:${agentId}:fork:${forkId}:meta`;

  try {
    const metaJson = execSync(`redis-cli -h ${redisHost} -p ${redisPort} get "${key}"`, {
      encoding: 'utf8'
    }).trim();

    if (metaJson === '(nil)' || !metaJson) {
      return null;
    }

    return JSON.parse(metaJson);
  } catch (error) {
    return null;
  }
}

/**
 * List all forks for an agent
 */
export async function listForks(
  taskId: string,
  agentId: string
): Promise<ForkMetadata[]> {
  const pattern = `swarm:${taskId}:${agentId}:fork:*:meta`;

  try {
    const keys = execSync(`redis-cli -h ${redisHost} -p ${redisPort} keys "${pattern}"`, {
      encoding: 'utf8'
    }).trim().split('\n').filter(k => k);

    const forks: ForkMetadata[] = [];

    for (const key of keys) {
      const metaJson = execSync(`redis-cli -h ${redisHost} -p ${redisPort} get "${key}"`, {
        encoding: 'utf8'
      }).trim();

      if (metaJson && metaJson !== '(nil)') {
        forks.push(JSON.parse(metaJson));
      }
    }

    return forks.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error(`[conversation-fork] Failed to list forks:`, error);
    return [];
  }
}

/**
 * Delete a fork and its messages
 */
export async function deleteFork(
  taskId: string,
  agentId: string,
  forkId: string
): Promise<void> {
  const messagesKey = `swarm:${taskId}:${agentId}:fork:${forkId}:messages`;
  const metaKey = `swarm:${taskId}:${agentId}:fork:${forkId}:meta`;

  try {
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} del "${messagesKey}" "${metaKey}"`, {
      encoding: 'utf8'
    });

    console.log(`[conversation-fork] Deleted fork ${forkId}`);
  } catch (error) {
    console.error(`[conversation-fork] Failed to delete fork:`, error);
    throw error;
  }
}

/**
 * Clear current fork (start fresh conversation)
 */
export async function clearCurrentFork(
  taskId: string,
  agentId: string
): Promise<void> {
  const key = `swarm:${taskId}:${agentId}:current-fork`;

  try {
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} del "${key}"`, {
      encoding: 'utf8'
    });
  } catch (error) {
    console.error(`[conversation-fork] Failed to clear current fork:`, error);
  }
}

/**
 * Format messages for Anthropic API
 */
export function formatMessagesForAPI(messages: Message[]): Array<{role: string, content: string}> {
  return messages.map(m => ({
    role: m.role,
    content: m.content
  }));
}

/**
 * Get conversation statistics
 */
export async function getConversationStats(
  taskId: string,
  agentId: string,
  forkId?: string
): Promise<{
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  iterations: number;
  firstMessage: string | null;
  lastMessage: string | null;
}> {
  const messages = await loadMessages(taskId, agentId, forkId);

  if (messages.length === 0) {
    return {
      messageCount: 0,
      userMessages: 0,
      assistantMessages: 0,
      iterations: 0,
      firstMessage: null,
      lastMessage: null
    };
  }

  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;
  const iterations = Math.max(...messages.map(m => m.iteration));

  return {
    messageCount: messages.length,
    userMessages,
    assistantMessages,
    iterations,
    firstMessage: messages[0].timestamp,
    lastMessage: messages[messages.length - 1].timestamp
  };
}
