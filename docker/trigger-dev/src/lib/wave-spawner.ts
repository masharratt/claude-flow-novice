/**
 * Wave Spawner - Task Count Validation and Wave-Based Spawning
 *
 * Security Fix sec-1.7: Validates task count before Redis queue creation
 * to prevent resource exhaustion attacks and system overload.
 *
 * Features:
 * - Task count validation with configurable limits
 * - Early rejection of oversized batches
 * - Warning thresholds for near-limit conditions
 * - Comprehensive error messages
 * - Type-safe task definitions
 *
 * Security Properties:
 * - Validates array type before processing
 * - Rejects empty task arrays
 * - Enforces maximum task count (1000)
 * - Warning at 800 tasks (80% threshold)
 * - Clear, actionable error messages
 *
 * References:
 * - Security Audit: SECURITY_FINDINGS.json (sec-1.7)
 * - Docker coordination: docker/CLAUDE.md (wave-based spawning)
 * - Validation patterns: src/lib/validation-schemas.ts
 * - Coordinator integration: src/trigger/cfn-coordinator.ts
 *
 * @module wave-spawner
 * @version 1.0.0
 */

/**
 * Task definition interface for wave spawner
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  /** Task type/category */
  type: string;
  /** Task payload (any structure) */
  payload: unknown;
  /** Optional memory requirement */
  memory?: string;
  /** Optional priority (1-10, default 5) */
  priority?: number;
}

/**
 * Result of wave spawning operation
 */
export interface WaveResult {
  /** Number of waves created */
  waveCount: number;
  /** Tasks per wave (may vary by wave) */
  tasksPerWave: number[];
  /** Total memory required */
  totalMemory: string;
  /** Execution status */
  status: 'pending' | 'running' | 'completed';
}

/**
 * Validation error for task count issues
 *
 * Thrown when task validation fails due to invalid input,
 * empty array, or exceeding maximum count.
 *
 * @example
 * ```typescript
 * try {
 *   validateTaskCount(tasks);
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.error(`Validation failed: ${error.message}`);
 *   }
 * }
 * ```
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when task limit is exceeded
 *
 * Indicates that the number of tasks exceeds the maximum allowed (1000).
 * Provides actionable guidance for batching work into smaller groups.
 *
 * @example
 * ```typescript
 * try {
 *   validateTaskCount(tasks);
 * } catch (error) {
 *   if (error instanceof TaskLimitError) {
 *     // Batch tasks into multiple waves
 *   }
 * }
 * ```
 */
export class TaskLimitError extends ValidationError {
  /** Actual task count that caused the error */
  readonly taskCount: number;

  /** Maximum allowed task count */
  readonly maxLimit: number;

  constructor(message: string, taskCount: number, maxLimit: number) {
    super(message);
    this.name = 'TaskLimitError';
    this.taskCount = taskCount;
    this.maxLimit = maxLimit;
    Object.setPrototypeOf(this, TaskLimitError.prototype);
  }
}

/**
 * Maximum number of tasks allowed in a single spawn wave
 *
 * Based on Redis performance characteristics and Docker resource constraints:
 * - Redis can handle large lists efficiently
 * - Docker network can sustain ~1000 concurrent connections
 * - Memory overhead scales with task count
 * - Prevents cascading failures from oversized operations
 *
 * History:
 * - 1000: Current limit (established security fix sec-1.7)
 * - Rationale: Balances throughput with resource safety
 */
export const MAX_TASKS = 1000;

/**
 * Warning threshold for task count
 *
 * When task count exceeds this threshold, a warning is logged
 * to encourage proactive batching before hitting the hard limit.
 *
 * Threshold: 80% of MAX_TASKS
 * Rationale: Provides buffer for graceful degradation
 */
export const TASK_WARNING_THRESHOLD = 800;

/**
 * Validates task count and array structure
 *
 * Security Properties:
 * 1. Type validation: ensures input is an array
 * 2. Non-empty validation: rejects empty arrays
 * 3. Count validation: rejects arrays exceeding MAX_TASKS
 * 4. Warning threshold: logs warning at 80% capacity
 *
 * Error Handling:
 * - TypeError for non-array input
 * - ValidationError for empty array
 * - TaskLimitError for exceeding maximum
 *
 * @param tasks - Array of tasks to validate
 * @throws {TypeError} If tasks is not an array
 * @throws {ValidationError} If tasks array is empty
 * @throws {TaskLimitError} If tasks count exceeds MAX_TASKS
 *
 * @example
 * ```typescript
 * // Valid: moderate task count
 * validateTaskCount(tasks);  // 50 tasks - passes silently
 *
 * // Warning: approaching limit
 * validateTaskCount(tasks);  // 850 tasks - logs warning
 *
 * // Error: exceeds limit
 * validateTaskCount(tasks);  // 1500 tasks - throws TaskLimitError
 * ```
 */
export function validateTaskCount(tasks: unknown): asserts tasks is Task[] {
  // Type check: ensure input is an array
  if (!Array.isArray(tasks)) {
    throw new TypeError(
      '[wave-spawner] Tasks must be an array. ' +
      `Received: ${typeof tasks === 'object' ? tasks?.constructor.name : typeof tasks}`
    );
  }

  // Empty check: ensure array has at least one task
  if (tasks.length === 0) {
    throw new ValidationError(
      '[wave-spawner] Tasks array cannot be empty. ' +
      'At least one task is required to start spawning.'
    );
  }

  // Count check: enforce maximum task limit
  if (tasks.length > MAX_TASKS) {
    throw new TaskLimitError(
      `[wave-spawner] Task count ${tasks.length} exceeds maximum allowed (${MAX_TASKS}). ` +
      `Please break work into smaller batches. ` +
      `Recommended batch size: ${Math.ceil(tasks.length / Math.ceil(tasks.length / MAX_TASKS))} tasks.`,
      tasks.length,
      MAX_TASKS
    );
  }

  // Warning threshold: log if approaching capacity
  if (tasks.length > TASK_WARNING_THRESHOLD) {
    const utilization = Math.round((tasks.length / MAX_TASKS) * 100);
    const remaining = MAX_TASKS - tasks.length;
    console.warn(
      `[wave-spawner] High task count: ${tasks.length}/${MAX_TASKS} (${utilization}% utilization). ` +
      `${remaining} tasks remaining before limit. Consider batching for future operations.`
    );
  }
}

/**
 * Spawns tasks in waves, respecting memory budget
 *
 * Wave-based spawning algorithm:
 * 1. Validates task count
 * 2. Partitions tasks into waves based on memory allocation
 * 3. Respects configured memory budget (default: 40GB)
 * 4. Returns wave metadata for monitoring
 *
 * Memory Calculation:
 * - Default memory per task: 512MB
 * - Customizable per task via task.memory field
 * - Budget exhaustion: starts next wave automatically
 *
 * @param tasks - Array of tasks to spawn in waves
 * @param memoryBudget - Total memory budget in bytes (default: 40GB)
 * @returns WaveResult with spawning metadata
 * @throws {ValidationError} If task validation fails
 * @throws {TaskLimitError} If task count exceeds limit
 *
 * @example
 * ```typescript
 * const tasks = [
 *   { id: 'task-1', type: 'compute', payload: {}, memory: '512m' },
 *   { id: 'task-2', type: 'compute', payload: {}, memory: '1g' },
 *   { id: 'task-3', type: 'compute', payload: {}, memory: '512m' },
 * ];
 *
 * try {
 *   const result = await spawnWave(tasks, 40 * 1024 * 1024 * 1024);
 *   console.log(`${result.waveCount} waves created`);
 *   console.log(`Tasks per wave: ${result.tasksPerWave.join(', ')}`);
 * } catch (error) {
 *   if (error instanceof TaskLimitError) {
 *     console.error('Too many tasks, please batch them');
 *   }
 * }
 * ```
 */
export async function spawnWave(
  tasks: unknown,
  memoryBudget: number = 40 * 1024 * 1024 * 1024 // 40GB default
): Promise<WaveResult> {
  // Validate task count and type
  validateTaskCount(tasks);

  // Calculate total memory required
  const DEFAULT_TASK_MEMORY = 512 * 1024 * 1024; // 512MB
  let totalMemoryRequired = 0;
  const tasksPerWave: number[] = [];
  let currentWaveSize = 0;
  let currentWaveMemory = 0;

  // Partition tasks into waves
  for (const task of tasks) {
    // Parse memory from task or use default
    const taskMemoryStr = task.memory || '512m';
    const taskMemory = parseMemoryValue(taskMemoryStr);

    // Check if task exceeds budget (warn but don't reject single task)
    if (taskMemory > memoryBudget) {
      console.warn(
        `[wave-spawner] Task ${task.id} memory (${taskMemoryStr}) exceeds budget. ` +
        `This may cause resource issues during execution.`
      );
    }

    // Start new wave if adding this task would exceed budget
    if (currentWaveMemory + taskMemory > memoryBudget && currentWaveSize > 0) {
      tasksPerWave.push(currentWaveSize);
      totalMemoryRequired += currentWaveMemory;
      currentWaveSize = 0;
      currentWaveMemory = 0;
    }

    // Add task to current wave
    currentWaveSize++;
    currentWaveMemory += taskMemory;
  }

  // Add final wave if it has tasks
  if (currentWaveSize > 0) {
    tasksPerWave.push(currentWaveSize);
    totalMemoryRequired += currentWaveMemory;
  }

  // Format total memory for readability
  const totalMemoryFormatted = formatMemoryValue(totalMemoryRequired);

  return {
    waveCount: tasksPerWave.length,
    tasksPerWave,
    totalMemory: totalMemoryFormatted,
    status: 'pending',
  };
}

/**
 * Parse memory string to bytes
 *
 * Supports: b, k/kb, m/mb, g/gb (case-insensitive)
 * Examples: "512", "512b", "512kb", "1m", "2gb"
 *
 * @param memoryString - Memory specification string
 * @returns Memory in bytes
 * @throws Error if format is invalid
 */
function parseMemoryValue(memoryString: string): number {
  const match = memoryString
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);

  if (!match) {
    throw new Error(
      `[wave-spawner] Invalid memory format: "${memoryString}". ` +
      `Expected: "512", "512b", "512kb", "1m", "2gb", etc.`
    );
  }

  const [, valueStr, unit] = match;
  const value = parseFloat(valueStr);

  if (isNaN(value) || value <= 0) {
    throw new Error(
      `[wave-spawner] Memory value must be positive: "${valueStr}"`
    );
  }

  // Unit conversion
  const units: Record<string, number> = {
    'b': 1,
    'k': 1024,
    'kb': 1024,
    'm': 1024 * 1024,
    'mb': 1024 * 1024,
    'g': 1024 * 1024 * 1024,
    'gb': 1024 * 1024 * 1024,
  };

  const multiplier = units[unit] || 1;
  return Math.round(value * multiplier);
}

/**
 * Format bytes to human-readable memory string
 *
 * Converts bytes to the most appropriate unit (B, KB, MB, GB)
 * for readability.
 *
 * @param bytes - Memory in bytes
 * @returns Formatted memory string (e.g., "2.5g", "512m")
 */
function formatMemoryValue(bytes: number): string {
  const units = [
    { unit: 'b', threshold: 1024 },
    { unit: 'kb', threshold: 1024 * 1024 },
    { unit: 'mb', threshold: 1024 * 1024 * 1024 },
    { unit: 'gb', threshold: Infinity },
  ];

  for (const { unit, threshold } of units) {
    if (bytes < threshold) {
      const value = (bytes / (threshold / 1024)).toFixed(1);
      return `${value}${unit}`;
    }
  }

  return `${bytes}b`;
}

// Task and WaveResult interfaces are already exported above
