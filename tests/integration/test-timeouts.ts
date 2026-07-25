/**
 * Test Timeout Utilities for Integration Tests
 *
 * Provides helpers for managing timeouts in complex integration tests.
 * Use these when specific tests need longer timeouts than the default.
 */

/**
 * Timeout constants for different test categories
 */
export const TIMEOUTS = {
  // Standard integration test (default)
  STANDARD: 60000, // 60 seconds

  // Database operations (multiple queries, transactions)
  DATABASE: 90000, // 90 seconds

  // End-to-end workflows (full system simulation)
  E2E: 120000, // 120 seconds

  // Load/Performance tests
  LOAD: 180000, // 180 seconds (3 minutes)

  // Docker operations (container startup/teardown)
  DOCKER: 120000, // 120 seconds
} as const;

/**
 * Creates a test wrapper with custom timeout
 *
 * @example
 * withTimeout(TIMEOUTS.E2E)('should complete full workflow', async () => {
 *   // test implementation
 * });
 */
export function withTimeout(timeout: number) {
  return (name: string, fn: () => Promise<void>) => {
    it(name, fn, timeout);
  };
}

/**
 * Retry helper for flaky integration tests
 *
 * @param fn - Function to retry
 * @param maxAttempts - Maximum number of attempts
 * @param delayMs - Delay between attempts
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        console.warn(`Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

/**
 * Waits for a condition to be true with timeout
 *
 * @param condition - Function that returns true when condition is met
 * @param timeoutMs - Maximum time to wait
 * @param intervalMs - Check interval
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 30000,
  intervalMs = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Parallel execution helper with timeout
 *
 * @param tasks - Array of async functions
 * @param timeoutMs - Timeout for all tasks
 */
export async function parallelWithTimeout<T>(
  tasks: (() => Promise<T>)[],
  timeoutMs: number
): Promise<T[]> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Parallel tasks exceeded ${timeoutMs}ms`)), timeoutMs)
  );

  const tasksPromise = Promise.all(tasks.map(task => task()));

  return Promise.race([tasksPromise, timeoutPromise]);
}
