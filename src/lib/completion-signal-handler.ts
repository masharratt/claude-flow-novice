/**
 * Completion Signal Handler
 *
 * Provides reliable completion signaling for agent-coordinator communication.
 * Part of Task 2.1: Persistent Agent Output Workspace (Integration)
 *
 * Signal File Format:
 *   COMPLETION_SIGNAL.json
 *   {
 *     "success": true,
 *     "confidence": 0.85,
 *     "deliverables": ["file1.ts", "file2.ts"],
 *     "errors": [],
 *     "metrics": { "executionTimeMs": 5420 },
 *     "timestamp": "2025-01-15T10:30:00.000Z",
 *     "agentId": "agent-123",
 *     "taskId": "task-456"
 *   }
 *
 * Usage:
 *   // Agent writes completion signal
 *   await writeCompletionSignal(workspace, {
 *     success: true,
 *     confidence: 0.85,
 *     deliverables: ['file.ts'],
 *     taskId: 'task-123',
 *     agentId: 'agent-456',
 *     timestamp: new Date()
 *   });
 *
 *   // Coordinator polls for completion
 *   const signal = await pollForCompletion(workspace, 300000);
 */

import * as path from 'path';
import { atomicWrite } from './file-operations';
import { createLogger } from './logging';
import { createError, ErrorCode, createTimeoutError } from './errors';
import { WorkspacePath } from './agent-workspace';

const logger = createLogger('completion-signal-handler');

/**
 * Completion signal file name
 */
const COMPLETION_SIGNAL_FILE = 'COMPLETION_SIGNAL.json';

/**
 * Completion metadata (partial, provided by caller)
 */
export interface CompletionMetadata {
  /** Whether the task completed successfully */
  success: boolean;
  /** Agent confidence score (0.0 - 1.0) */
  confidence: number;
  /** List of deliverable file paths */
  deliverables: string[];
  /** List of errors encountered (optional) */
  errors?: string[];
  /** Performance metrics (optional) */
  metrics?: {
    executionTimeMs?: number;
    tokensUsed?: number;
    costUsd?: number;
    [key: string]: any;
  };
}

/**
 * Complete completion signal (written to file)
 */
export interface CompletionSignal extends CompletionMetadata {
  /** Task ID */
  taskId: string;
  /** Agent ID */
  agentId: string;
  /** Signal timestamp */
  timestamp: Date;
}

/**
 * Poll options
 */
export interface PollOptions {
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeoutMs?: number;
  /** Poll interval in milliseconds (default: 500) */
  intervalMs?: number;
}

/**
 * Default poll options
 */
const DEFAULT_POLL_OPTIONS: Required<PollOptions> = {
  timeoutMs: 300000, // 5 minutes
  intervalMs: 500, // 500ms
};

/**
 * Write completion signal to workspace
 *
 * Pattern: Atomic write ensures signal is never partially written
 *
 * @param workspace - Workspace path information
 * @param signal - Completion signal data
 * @returns Promise that resolves when signal is written
 * @throws FILE_WRITE_FAILED if write fails
 */
export async function writeCompletionSignal(
  workspace: WorkspacePath,
  signal: CompletionSignal
): Promise<void> {
  // Validate signal
  validateSignal(signal);

  const signalPath = path.join(workspace.path, COMPLETION_SIGNAL_FILE);

  // Prepare signal data (convert Date to ISO string for JSON)
  const signalData = {
    ...signal,
    timestamp: signal.timestamp.toISOString(),
  };

  try {
    await atomicWrite(signalPath, JSON.stringify(signalData, null, 2));
    logger.info('Completion signal written', {
      taskId: workspace.taskId,
      agentId: workspace.agentId,
      success: signal.success,
      confidence: signal.confidence,
    });
  } catch (error) {
    throw createError(
      ErrorCode.FILE_WRITE_FAILED,
      'Failed to write completion signal',
      {
        taskId: workspace.taskId,
        agentId: workspace.agentId,
        error: (error as Error).message,
      }
    );
  }
}

/**
 * Read completion signal from workspace
 *
 * @param workspace - Workspace path information
 * @returns Completion signal data or null if not found
 * @throws FILE_READ_FAILED if read fails (other than ENOENT)
 */
export async function readCompletionSignal(
  workspace: WorkspacePath
): Promise<CompletionSignal | null> {
  const signalPath = path.join(workspace.path, COMPLETION_SIGNAL_FILE);

  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(signalPath, 'utf8');
    const signalData = JSON.parse(content);

    // Convert ISO string back to Date
    return {
      ...signalData,
      timestamp: new Date(signalData.timestamp),
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      // Signal file doesn't exist yet
      return null;
    }
    throw createError(
      ErrorCode.FILE_READ_FAILED,
      'Failed to read completion signal',
      {
        taskId: workspace.taskId,
        agentId: workspace.agentId,
        error: (error as Error).message,
      }
    );
  }
}

/**
 * Poll for completion signal with timeout
 *
 * Pattern: Non-blocking polling with configurable interval and timeout
 *
 * @param workspace - Workspace path information
 * @param timeoutMs - Timeout in milliseconds (default: 300000 = 5 minutes)
 * @param options - Poll options
 * @returns Completion signal data
 * @throws TIMEOUT if signal not received within timeout
 * @throws FILE_READ_FAILED if read fails
 */
export async function pollForCompletion(
  workspace: WorkspacePath,
  timeoutMs?: number,
  options: PollOptions = {}
): Promise<CompletionSignal> {
  const pollOptions = {
    ...DEFAULT_POLL_OPTIONS,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...options,
  };

  const startTime = Date.now();
  const endTime = startTime + pollOptions.timeoutMs;

  logger.debug('Starting completion polling', {
    taskId: workspace.taskId,
    agentId: workspace.agentId,
    timeoutMs: pollOptions.timeoutMs,
    intervalMs: pollOptions.intervalMs,
  });

  while (Date.now() < endTime) {
    // Try to read signal
    const signal = await readCompletionSignal(workspace);
    if (signal) {
      const elapsedMs = Date.now() - startTime;
      logger.info('Completion signal received', {
        taskId: workspace.taskId,
        agentId: workspace.agentId,
        success: signal.success,
        confidence: signal.confidence,
        elapsedMs,
      });
      return signal;
    }

    // Wait before next poll
    await sleep(pollOptions.intervalMs);
  }

  // Timeout reached
  const elapsedMs = Date.now() - startTime;
  throw createTimeoutError(
    'Completion signal timeout',
    pollOptions.timeoutMs,
    {
      taskId: workspace.taskId,
      agentId: workspace.agentId,
      elapsedMs,
    }
  );
}

/**
 * Check if completion signal exists
 *
 * @param workspace - Workspace path information
 * @returns True if signal exists, false otherwise
 */
export async function hasCompletionSignal(
  workspace: WorkspacePath
): Promise<boolean> {
  const signal = await readCompletionSignal(workspace);
  return signal !== null;
}

/**
 * Delete completion signal
 *
 * Useful for resetting workspace state.
 *
 * @param workspace - Workspace path information
 * @returns Promise that resolves when signal is deleted
 */
export async function deleteCompletionSignal(
  workspace: WorkspacePath
): Promise<void> {
  const signalPath = path.join(workspace.path, COMPLETION_SIGNAL_FILE);

  try {
    const fs = await import('fs/promises');
    await fs.unlink(signalPath);
    logger.debug('Completion signal deleted', {
      taskId: workspace.taskId,
      agentId: workspace.agentId,
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      // Signal file doesn't exist, nothing to delete
      return;
    }
    throw error;
  }
}

/**
 * Validate completion signal data
 *
 * @param signal - Completion signal to validate
 * @throws INVALID_INPUT if signal is invalid
 */
function validateSignal(signal: CompletionSignal): void {
  if (typeof signal.success !== 'boolean') {
    throw createError(
      ErrorCode.INVALID_INPUT,
      'Signal success must be a boolean',
      { signal }
    );
  }

  if (
    typeof signal.confidence !== 'number' ||
    signal.confidence < 0 ||
    signal.confidence > 1
  ) {
    throw createError(
      ErrorCode.INVALID_INPUT,
      'Signal confidence must be a number between 0 and 1',
      { signal }
    );
  }

  if (!Array.isArray(signal.deliverables)) {
    throw createError(
      ErrorCode.INVALID_INPUT,
      'Signal deliverables must be an array',
      { signal }
    );
  }

  if (!signal.taskId || typeof signal.taskId !== 'string') {
    throw createError(
      ErrorCode.INVALID_INPUT,
      'Signal taskId must be a non-empty string',
      { signal }
    );
  }

  if (!signal.agentId || typeof signal.agentId !== 'string') {
    throw createError(
      ErrorCode.INVALID_INPUT,
      'Signal agentId must be a non-empty string',
      { signal }
    );
  }

  if (!(signal.timestamp instanceof Date)) {
    throw createError(
      ErrorCode.INVALID_INPUT,
      'Signal timestamp must be a Date object',
      { signal }
    );
  }
}

/**
 * Sleep for specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
