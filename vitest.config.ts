import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000, // 60 seconds per test
    hookTimeout: 30000, // 30 seconds for beforeEach/afterEach
    teardownTimeout: 10000,
    globals: true,
    environment: 'node',
    pool: 'forks', // Use forks instead of threads for better isolation
    poolOptions: {
      forks: {
        singleFork: true, // Run tests in a single process for Redis connection stability
      },
    },
  },
});
