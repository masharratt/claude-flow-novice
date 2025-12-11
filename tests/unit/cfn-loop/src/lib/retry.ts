// Stub: retry utilities
// Created to satisfy test imports

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: 'linear' | 'exponential';
  onRetry?: (attempt: number, error: Error) => void;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts || 3;
  const delayMs = options.delayMs || 1000;
  const backoff = options.backoff || 'linear';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      if (options.onRetry) {
        options.onRetry(attempt, error as Error);
      }

      const delay = backoff === 'exponential'
        ? delayMs * Math.pow(2, attempt - 1)
        : delayMs * attempt;

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Retry failed');
}
