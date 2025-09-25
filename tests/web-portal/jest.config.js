/**
 * @file Jest Configuration for Web Portal Integration Tests
 * @description Test configuration with error scenarios and comprehensive coverage
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/web-portal/**/*.test.ts',
    '<rootDir>/tests/web-portal/**/*.spec.ts'
  ],

  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/web-portal/setup/test-setup.ts'
  ],

  // Module resolution
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },

  // TypeScript handling
  preset: 'ts-jest',
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage/web-portal',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/components/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Test timeout
  testTimeout: 30000,

  // Verbose output for debugging
  verbose: true,

  // Error handling
  errorOnDeprecated: true,

  // Mock configuration
  clearMocks: true,
  restoreMocks: true,

  // Test execution
  maxWorkers: 4,

  // Global variables for tests
  globals: {
    'ts-jest': {
      tsconfig: {
        compilerOptions: {
          module: 'commonjs',
          target: 'es2020',
          lib: ['es2020', 'dom'],
          allowJs: true,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true
        }
      }
    }
  }
};