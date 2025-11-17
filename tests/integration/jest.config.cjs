/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Set root directory to project root (two levels up from this config file)
  rootDir: '../../',
  
  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  
  // Extensions to treat as ES modules
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
  // Roots for test discovery
  roots: [
    '<rootDir>/tests/integration',
    '<rootDir>/src'
  ],
  
  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      diagnostics: {
        ignoreCodes: [1343]
      },
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: 'node',
      }
    }]
  },
  
  // Module name mapping to handle .js imports in TypeScript
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  
  // Module paths for better resolution
  modulePaths: ['<rootDir>'],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Test match patterns
  testMatch: [
    '<rootDir>/tests/integration/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.test.js',
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.backups/',
  ],
  
  // Coverage configuration (disabled thresholds for now)
  collectCoverage: false, // Enable manually with --coverage flag
  coverageDirectory: '<rootDir>/tests/integration/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/dist/',
  ],
  
  // Verbose output
  verbose: true,
  
  // Timeout for tests
  testTimeout: 30000,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  resetMocks: false,
};
