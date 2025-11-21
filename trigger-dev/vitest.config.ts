/**
 * Vitest Configuration
 * Test runner for CFN Loop trigger.dev workflow
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global test setup
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },

    // Include/exclude patterns
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],

    // Timeout for each test
    testTimeout: 10000,

    // Hook timeout
    hookTimeout: 10000,

    // Reporters
    reporters: ['default'],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@workflows': path.resolve(__dirname, 'src/workflows'),
      '@jobs': path.resolve(__dirname, 'src/jobs'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
});
