/**
 * Jest configuration specifically for MCP Configuration Manager tests
 * Enhanced with security, performance, and reliability testing setup
 */

export default {
  // Inherit from main config but customize for MCP tests
  ...{
    preset: 'ts-jest/presets/default-esm',
    extensionsToTreatAsEsm: ['.ts'],
    testEnvironment: 'node',
    rootDir: '../../',
  },

  // Test discovery specific to MCP tests
  testMatch: [
    '<rootDir>/tests/mcp/**/*.test.ts',
    '<rootDir>/tests/mcp/**/*.test.js',
    '<rootDir>/tests/mcp/**/*.spec.ts',
    '<rootDir>/tests/mcp/**/*.spec.js'
  ],

  // Module resolution for MCP tests
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^~/(.*)$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^@mcp-tests/(.*)$': '<rootDir>/tests/mcp/$1',
    '^@fixtures/(.*)$': '<rootDir>/tests/mcp/fixtures/$1',
    '^@mocks/(.*)$': '<rootDir>/tests/mcp/mocks/$1'
  },

  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'es2022',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        target: 'es2022'
      }
    }],
    '^.+\\.js$': ['babel-jest', {
      configFile: '<rootDir>/config/build/babel.config.cjs'
    }]
  },

  // Test environment setup
  setupFilesAfterEnv: [
    '<rootDir>/tests/mcp/setup/test-setup.js',
    '<rootDir>/tests/mcp/setup/security-setup.js',
    '<rootDir>/tests/mcp/setup/performance-setup.js'
  ],

  // Global test configuration
  testTimeout: 30000, // 30 seconds for integration tests
  maxWorkers: 1, // Sequential execution for file system tests

  // Coverage configuration
  collectCoverageFrom: [
    'src/mcp/**/*.ts',
    'src/mcp/**/*.js',
    'src/cli/mcp-*.js',
    '!src/mcp/**/*.d.ts',
    '!src/mcp/**/*.test.ts',
    '!src/mcp/**/*.test.js'
  ],

  coverageDirectory: 'coverage/mcp',
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // Coverage thresholds for bulletproof reliability
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85
    },
    'src/mcp/mcp-config-manager.js': {
      branches: 90,
      functions: 95,
      lines: 90,
      statements: 90
    }
  },

  // Enhanced error handling
  verbose: true,
  errorOnDeprecated: false,
  bail: false, // Continue running tests even if some fail

  // Clear mocks between tests for isolation
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,

  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    CLAUDE_FLOW_NOVICE_MODE: 'test'
  },

  // Global variables for tests
  globals: {
    'ts-jest': {
      useESM: true
    }
  },

  // Test patterns to ignore
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/bin/',
    '<rootDir>/tests/mcp/fixtures/',
    '<rootDir>/tests/mcp/temp/'
  ],

  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|ora|inquirer|fs-extra|@modelcontextprotocol)/)'
  ],

  // Watch mode configuration
  watchPathIgnorePatterns: [
    '<rootDir>/tests/mcp/temp/',
    '<rootDir>/tests/mcp/fixtures/temp/',
    '<rootDir>/coverage/'
  ],

  // Reporter configuration for CI/CD
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './test-results/mcp',
      outputName: 'mcp-test-results.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],

  // Custom test sequences for different test types
  testSequencer: '<rootDir>/tests/mcp/utils/test-sequencer.js'
};