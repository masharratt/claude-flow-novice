// Global test cleanup to prevent process leaks
import { afterAll, beforeAll } from '@jest/globals';
import { globalCleanup } from './utils/cleanup';

beforeAll(() => {
  // Increase max listeners to prevent warnings
  if (process.setMaxListeners) {
    process.setMaxListeners(50);
  }

  // Set shorter timeouts for hung processes
  jest.setTimeout(30000);

  // Suppress MaxListenersExceededWarning during tests
  process.removeAllListeners('warning');
});

afterAll(async () => {
  // Clean up all tracked resources globally
  await globalCleanup.cleanupAll({
    timeout: 5000,
    suppressErrors: true,
    forceClose: true,
  });

  // Clear all timers and intervals
  jest.clearAllTimers();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Give async operations time to cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
});

export {};
