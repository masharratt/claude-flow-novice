/**
 * Jest configuration for SEO ResearchService testing
 *
 * @module planning/seo/jest.config
 * @description Configures Jest for TypeScript testing with coverage thresholds
 */

module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Node environment for testing (not browser)
  testEnvironment: 'node',

  // Use modern ts-jest transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }]
  },

  // Test file locations
  roots: ['<rootDir>/lib', '<rootDir>/types'],

  // Test file patterns
  testMatch: ['**/__tests__/**/*.test.ts'],

  // Coverage collection configuration
  collectCoverageFrom: [
    'lib/**/*.ts',
    'types/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!lib/__tests__/**',
    '!lib/example-usage.ts'
  ],

  // Coverage thresholds (Standard mode requirements: >80%)
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
      lines: 80
    }
  },

  // Coverage output directory
  coverageDirectory: '<rootDir>/coverage',

  // Coverage reporters
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  // Module path aliases (if needed)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },

  // Test timeout (5 seconds for integration tests)
  testTimeout: 5000,

  // Verbose output for better debugging
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks between tests
  restoreMocks: true,

  // Setup files (if needed for global test configuration)
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
