/**
 * Iteration History Management
 *
 * Loads and formats iteration history from Redis for CLI-spawned agents.
 * Enables agents to learn from previous attempts and feedback.
 *
 * Storage Pattern:
 *   swarm:${TASK_ID}:${AGENT_ID}:result:iteration-${N} → Result text + confidence
 *   swarm:${TASK_ID}:${AGENT_ID}:feedback:iteration-${N} → Validator feedback
 *
 * Sprint 3 - Phase 2 Implementation
 */

import { execSync } from 'child_process';

// Bug #6 Fix: Read Redis connection parameters from process.env
const redisHost = process.env.CFN_REDIS_HOST || 'cfn-redis';
const redisPort = process.env.CFN_REDIS_PORT || '6379';

export interface IterationResult {
  iteration: number;
  result: string;
  confidence: number;
  timestamp: string;
  feedback?: string;
}

/**
 * Load iteration history for an agent from Redis
 *
 * @param taskId - Task identifier
 * @param agentId - Agent identifier
 * @param currentIteration - Current iteration number (loads 1 to N-1)
 * @returns Array of iteration results
 */
export async function loadIterationHistory(
  taskId: string,
  agentId: string,
  currentIteration: number
): Promise<IterationResult[]> {
  const history: IterationResult[] = [];

  // Load previous iterations (1 to currentIteration - 1)
  for (let i = 1; i < currentIteration; i++) {
    try {
      // Load result data
      const resultKey = `swarm:${taskId}:${agentId}:result:iteration-${i}`;
      const resultJson = execSync(`redis-cli -h ${redisHost} -p ${redisPort} get "${resultKey}"`, { encoding: 'utf8' }).trim();

      if (resultJson === '(nil)' || !resultJson) {
        // No result for this iteration (shouldn't happen in normal flow)
        continue;
      }

      const resultData = JSON.parse(resultJson);

      // Load feedback data (may not exist for all iterations)
      const feedbackKey = `swarm:${taskId}:${agentId}:feedback:iteration-${i}`;
      let feedback: string | undefined;

      try {
        const feedbackJson = execSync(`redis-cli -h ${redisHost} -p ${redisPort} get "${feedbackKey}"`, { encoding: 'utf8' }).trim();
        if (feedbackJson !== '(nil)' && feedbackJson) {
          const feedbackData = JSON.parse(feedbackJson);
          feedback = feedbackData.feedback || feedbackData.comments;
        }
      } catch (err) {
        // Feedback may not exist for this iteration
        feedback = undefined;
      }

      history.push({
        iteration: i,
        result: resultData.result || resultData.output || '',
        confidence: resultData.confidence || 0,
        timestamp: resultData.timestamp || new Date().toISOString(),
        feedback
      });
    } catch (err) {
      console.error(`[iteration-history] Failed to load iteration ${i}:`, err);
      // Continue loading other iterations
    }
  }

  return history;
}

/**
 * Store iteration result in Redis
 *
 * @param taskId - Task identifier
 * @param agentId - Agent identifier
 * @param iteration - Iteration number
 * @param result - Result text/output
 * @param confidence - Confidence score (0.0-1.0)
 */
export async function storeIterationResult(
  taskId: string,
  agentId: string,
  iteration: number,
  result: string,
  confidence: number
): Promise<void> {
  const resultKey = `swarm:${taskId}:${agentId}:result:iteration-${iteration}`;
  const resultData = {
    result,
    confidence,
    timestamp: new Date().toISOString(),
    iteration
  };

  const resultJson = JSON.stringify(resultData);

  try {
    // Store with 24 hour TTL
    execSync(`redis-cli -h ${redisHost} -p ${redisPort} setex "${resultKey}" 86400 '${resultJson.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf8'
    });
    console.log(`[iteration-history] Stored result for iteration ${iteration}`);
  } catch (err) {
    console.error(`[iteration-history] Failed to store result:`, err);
    throw err;
  }
}

/**
 * Format iteration history as markdown for system prompt
 *
 * @param history - Array of iteration results
 * @param currentIteration - Current iteration number
 * @returns Formatted markdown string
 */
export function formatIterationHistory(
  history: IterationResult[],
  currentIteration: number
): string {
  if (history.length === 0) {
    return `## Current Iteration: ${currentIteration}

This is your first attempt at this task. No previous iteration history available.
`;
  }

  const sections: string[] = [];

  sections.push('## Iteration History');
  sections.push('');
  sections.push('Learn from your previous attempts and feedback:');
  sections.push('');

  // Format each iteration
  for (const iter of history) {
    sections.push(`### Iteration ${iter.iteration}`);
    sections.push('');

    sections.push('**Result:**');
    sections.push(iter.result.substring(0, 500)); // Truncate to 500 chars
    if (iter.result.length > 500) {
      sections.push('... (truncated)');
    }
    sections.push('');

    if (iter.feedback) {
      sections.push('**Feedback from Validators:**');
      sections.push(iter.feedback);
      sections.push('');
    }

    sections.push(`**Confidence:** ${iter.confidence.toFixed(2)}`);
    sections.push(`**Timestamp:** ${iter.timestamp}`);
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  // Add current iteration context
  sections.push(`## Current Iteration: ${currentIteration}`);
  sections.push('');

  if (history.length > 0) {
    const lastIteration = history[history.length - 1];
    if (lastIteration.feedback) {
      sections.push('**Your Task:** Address the feedback from the previous iteration:');
      sections.push('');
      sections.push(lastIteration.feedback);
      sections.push('');
    } else {
      sections.push(`**Your Task:** Improve upon iteration ${lastIteration.iteration} (confidence: ${lastIteration.confidence.toFixed(2)})`);
      sections.push('');
    }
  }

  return sections.join('\n');
}

/**
 * Check if iteration history exists for an agent
 *
 * @param taskId - Task identifier
 * @param agentId - Agent identifier
 * @returns True if any iteration history exists
 */
export async function hasIterationHistory(
  taskId: string,
  agentId: string
): Promise<boolean> {
  try {
    const pattern = `swarm:${taskId}:${agentId}:result:iteration-*`;
    const keys = execSync(`redis-cli -h ${redisHost} -p ${redisPort} --scan --pattern "${pattern}"`, { encoding: 'utf8' }).trim();
    return keys.length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Get the latest iteration number for an agent
 *
 * @param taskId - Task identifier
 * @param agentId - Agent identifier
 * @returns Latest iteration number (0 if no history)
 */
export async function getLatestIteration(
  taskId: string,
  agentId: string
): Promise<number> {
  try {
    const pattern = `swarm:${taskId}:${agentId}:result:iteration-*`;
    const keys = execSync(`redis-cli -h ${redisHost} -p ${redisPort} --scan --pattern "${pattern}"`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter((k) => k.length > 0);

    if (keys.length === 0) return 0;

    // Extract iteration numbers and find max
    const iterations = keys.map((key) => {
      const match = key.match(/iteration-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });

    return Math.max(...iterations);
  } catch (err) {
    return 0;
  }
}
