/**
 * Conversation Fork Cleanup Utilities
 *
 * Provides memory leak prevention for Task Mode by:
 * 1. Setting TTL on message lists (24h default)
 * 2. Cleaning up completed task messages
 * 3. Limiting message history size
 * 4. Auto-cleanup of orphaned forks
 */

import { execSync } from 'child_process';

// FIX: Default to 'localhost' for CLI mode (host execution), not 'cfn-redis' (Docker)
const redisHost = process.env.CFN_REDIS_HOST || 'localhost';
const redisPort = process.env.CFN_REDIS_PORT || '6379';

export interface CleanupOptions {
  messageTTL?: number;        // TTL for message lists (seconds, default: 86400 = 24h)
  maxMessagesPerAgent?: number; // Max messages to keep per agent (default: 100)
  autoCleanupForks?: boolean;  // Auto-cleanup orphaned forks (default: true)
}

const DEFAULT_OPTIONS: Required<CleanupOptions> = {
  messageTTL: 86400,           // 24 hours
  maxMessagesPerAgent: 100,    // 100 messages = ~50 iterations
  autoCleanupForks: true,
};

/**
 * Set TTL on message list to prevent indefinite accumulation
 */
export function setMessageListTTL(
  taskId: string,
  agentId: string,
  ttlSeconds: number = DEFAULT_OPTIONS.messageTTL
): void {
  const key = `swarm:${taskId}:${agentId}:messages`;

  try {
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} expire "${key}" ${ttlSeconds}`, {
      encoding: 'utf8'
    });
    console.log(`[conversation-cleanup] Set TTL ${ttlSeconds}s on ${key}`);
  } catch (error) {
    console.error(`[conversation-cleanup] Failed to set TTL:`, error);
  }
}

/**
 * Trim message list to max size (FIFO - keep recent messages)
 */
export function trimMessageList(
  taskId: string,
  agentId: string,
  maxMessages: number = DEFAULT_OPTIONS.maxMessagesPerAgent
): void {
  const key = `swarm:${taskId}:${agentId}:messages`;

  try {
    // Keep only the last N messages (0 = oldest, -N = keep last N)
    const start = -maxMessages;
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} ltrim "${key}" ${start} -1`, {
      encoding: 'utf8'
    });
    console.log(`[conversation-cleanup] Trimmed ${key} to ${maxMessages} messages`);
  } catch (error) {
    console.error(`[conversation-cleanup] Failed to trim messages:`, error);
  }
}

/**
 * Clean up all messages and forks for a completed task
 */
export function cleanupTaskMessages(taskId: string, agentId: string): void {
  try {
    // Delete main message list
    const messagesKey = `swarm:${taskId}:${agentId}:messages`;
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} del "${messagesKey}"`, {
      encoding: 'utf8'
    });

    // Delete all fork message lists
    const forkPattern = `swarm:${taskId}:${agentId}:fork:*:messages`;
    const forkKeys = execSync(`redis-cli -h ${redisHost} -p ${redisPort} keys "${forkPattern}"`, {
      encoding: 'utf8'
    }).trim().split('\n').filter(k => k);

    if (forkKeys.length > 0) {
      execSync(`redis-cli -h ${redisHost} -p ${redisPort} del ${forkKeys.join(' ')}`, {
        encoding: 'utf8'
      });
    }

    // Delete all fork metadata
    const forkMetaPattern = `swarm:${taskId}:${agentId}:fork:*:meta`;
    const metaKeys = execSync(`redis-cli -h ${redisHost} -p ${redisPort} keys "${forkMetaPattern}"`, {
      encoding: 'utf8'
    }).trim().split('\n').filter(k => k);

    if (metaKeys.length > 0) {
      execSync(`redis-cli -h ${redisHost} -p ${redisPort} del ${metaKeys.join(' ')}`, {
        encoding: 'utf8'
      });
    }

    // Delete current fork pointer
    const currentForkKey = `swarm:${taskId}:${agentId}:current-fork`;
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} del "${currentForkKey}"`, {
      encoding: 'utf8'
    });

    console.log(`[conversation-cleanup] Cleaned up task ${taskId} agent ${agentId}`);
    console.log(`[conversation-cleanup] Removed: 1 message list, ${forkKeys.length} fork snapshots, ${metaKeys.length} fork metadata`);
  } catch (error) {
    console.error(`[conversation-cleanup] Failed to cleanup task messages:`, error);
  }
}

/**
 * Clean up orphaned forks (metadata expired but messages remain)
 */
export function cleanupOrphanedForks(taskId: string, agentId: string): void {
  try {
    // Find all fork message keys
    const forkPattern = `swarm:${taskId}:${agentId}:fork:*:messages`;
    const forkMessageKeys = execSync(`redis-cli -h ${redisHost} -p ${redisPort} keys "${forkPattern}"`, {
      encoding: 'utf8'
    }).trim().split('\n').filter(k => k);

    if (forkMessageKeys.length === 0) {
      return;
    }

    const orphanedKeys: string[] = [];

    for (const messageKey of forkMessageKeys) {
      // Extract fork ID from key: swarm:task:agent:fork:FORK_ID:messages
      const parts = messageKey.split(':');
      const forkId = parts[parts.length - 2];

      // Check if metadata exists
      const metaKey = `swarm:${taskId}:${agentId}:fork:${forkId}:meta`;
      const metaExists = execSync(`redis-cli -h ${redisHost} -p ${redisPort} exists "${metaKey}"`, {
        encoding: 'utf8'
      }).trim();

      if (metaExists === '0') {
        // Metadata expired but messages remain = orphaned
        orphanedKeys.push(messageKey);
      }
    }

    if (orphanedKeys.length > 0) {
      execSync(`redis-cli -h ${redisHost} -p ${redisPort} del ${orphanedKeys.join(' ')}`, {
        encoding: 'utf8'
      });
      console.log(`[conversation-cleanup] Removed ${orphanedKeys.length} orphaned fork snapshots`);
    }
  } catch (error) {
    console.error(`[conversation-cleanup] Failed to cleanup orphaned forks:`, error);
  }
}

/**
 * Get memory usage statistics for a task
 */
export function getTaskMemoryStats(taskId: string, agentId: string): {
  messageCount: number;
  forkCount: number;
  estimatedSizeKB: number;
} {
  try {
    // Count messages in main list
    const messagesKey = `swarm:${taskId}:${agentId}:messages`;
    const messageCount = parseInt(execSync(`redis-cli -h ${redisHost} -p ${redisPort} llen "${messagesKey}"`, {
      encoding: 'utf8'
    }).trim(), 10);

    // Count forks
    const forkPattern = `swarm:${taskId}:${agentId}:fork:*:messages`;
    const forkKeys = execSync(`redis-cli -h ${redisHost} -p ${redisPort} keys "${forkPattern}"`, {
      encoding: 'utf8'
    }).trim().split('\n').filter(k => k);

    // Estimate size (average message ~5KB)
    const estimatedSizeKB = messageCount * 5;

    return {
      messageCount,
      forkCount: forkKeys.length,
      estimatedSizeKB,
    };
  } catch (error) {
    console.error(`[conversation-cleanup] Failed to get memory stats:`, error);
    return {
      messageCount: 0,
      forkCount: 0,
      estimatedSizeKB: 0,
    };
  }
}

/**
 * Configure automatic cleanup options for a task
 */
export function configureAutoCleanup(
  taskId: string,
  agentId: string,
  options: CleanupOptions = {}
): void {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Set TTL on message list
  setMessageListTTL(taskId, agentId, config.messageTTL);

  // Trim to max size
  trimMessageList(taskId, agentId, config.maxMessagesPerAgent);

  // Cleanup orphaned forks
  if (config.autoCleanupForks) {
    cleanupOrphanedForks(taskId, agentId);
  }

  console.log(`[conversation-cleanup] Auto-cleanup configured for ${taskId}/${agentId}`);
  console.log(`[conversation-cleanup] - TTL: ${config.messageTTL}s`);
  console.log(`[conversation-cleanup] - Max messages: ${config.maxMessagesPerAgent}`);
  console.log(`[conversation-cleanup] - Auto-cleanup forks: ${config.autoCleanupForks}`);
}

/**
 * Emergency cleanup - remove all conversation data for all tasks
 * USE WITH CAUTION: This will delete ALL conversation history
 */
export function emergencyCleanupAll(): void {
  try {
    const patterns = [
      'swarm:*:*:messages',
      'swarm:*:*:fork:*:messages',
      'swarm:*:*:fork:*:meta',
      'swarm:*:*:current-fork',
    ];

    let totalDeleted = 0;

    for (const pattern of patterns) {
      const keys = execSync(`redis-cli -h ${redisHost} -p ${redisPort} keys "${pattern}"`, {
        encoding: 'utf8'
      }).trim().split('\n').filter(k => k);

      if (keys.length > 0) {
        execSync(`redis-cli -h ${redisHost} -p ${redisPort} del ${keys.join(' ')}`, {
          encoding: 'utf8'
        });
        totalDeleted += keys.length;
      }
    }

    console.log(`[conversation-cleanup] EMERGENCY CLEANUP: Deleted ${totalDeleted} conversation keys`);
  } catch (error) {
    console.error(`[conversation-cleanup] Failed emergency cleanup:`, error);
  }
}
