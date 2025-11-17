// Global test cleanup to prevent process leaks
import { afterAll, beforeAll } from '@jest/globals';

beforeAll(() => {
  // Increase max listeners to prevent warnings
  if (process.setMaxListeners) {
    process.setMaxListeners(50);
  }

  // Set shorter timeouts for hung processes
  jest.setTimeout(30000);
});

afterAll(async () => {
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
