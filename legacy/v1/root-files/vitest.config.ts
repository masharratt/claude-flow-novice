import { defineConfig } from 'vitest/config';
import path from 'path';

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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        '.claude-flow-novice/**',
        'bin/**',
        '**/*.test.ts',
        '**/*.test.js',
        '**/*.spec.ts',
        '**/*.spec.js',
        '**/tests/**',
        '**/archived/**',
        '**/*.d.ts',
        'config/**',
        'scripts/**'
      ],
      include: [
        'src/**/*.ts',
        'src/**/*.js'
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
      thresholdAutoUpdate: false
    },
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.js',
      'tests/**/*.spec.ts',
      'tests/**/*.spec.js'
    ],
    exclude: [
      'tests/archived/**',
      'tests/chaos/**',
      'tests/benchmarks/**',
      'node_modules/**'
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~': path.resolve(__dirname, './')
    }
  }
});
