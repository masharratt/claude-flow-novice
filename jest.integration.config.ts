/**
 * Jest Configuration for Integration Tests
 * 
 * Integration tests have longer timeouts due to:
 * - Multiple database operations (Redis + SQLite + Postgres)
 * - Docker container operations
 * - End-to-end workflow simulations
 * - Coordination protocol tests with actual delays
 * 
 * Timeout Rationale:
 * - 60s for complex multi-database transactions
 * - 90s for end-to-end workflow tests
 * - 120s for load/performance tests
 * 
 * Usage:
 *   npm test -- --config=jest.integration.config.ts
 *   npm run test:integration
 */

export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Extended timeout for integration tests (was 30s, now 60s)
  testTimeout: 60000,
  
  // Test discovery
  testMatch: [
    '**/tests/integration/**/*.test.ts',
    '**/tests/integration/**/*.test.js',
  ],
  
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/legacy/',
    '.backups',
    '/phase-1/', // Legacy phase tests with separate config
    '/claude-assets/', // Ignore duplicates
    '/web-portal/', // Separate package
  ],
  
  // Ignore duplicate packages
  modulePathIgnorePatterns: [
    '<rootDir>/claude-assets/',
    '<rootDir>/legacy/',
    '<rootDir>/web-portal/node_modules/',
  ],
  
  // TypeScript transformation
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'commonjs',
        target: 'es2020',
      },
    }],
  },
  
  // Module resolution
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup-cleanup.ts',
    '<rootDir>/tests/integration/setup.ts',
  ],
  
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  
  // Verbose output for debugging timeout issues
  verbose: true,
  
  // Prevent interference between tests
  clearMocks: true,
  restoreMocks: true,
  resetMocks: false,
  
  // Global setup/teardown (optional, uncomment if files exist)
  // globalSetup: '<rootDir>/tests/integration/global-setup.ts',
  // globalTeardown: '<rootDir>/tests/integration/global-teardown.ts',
  
  // Max workers for parallel execution
  maxWorkers: '50%', // Limit parallelism to avoid resource contention
};
