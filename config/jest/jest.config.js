export default {
  rootDir: '../../',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.ts',
    '<rootDir>/tests/**/*.spec.js',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.js',
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/src/**/*.spec.js'
  ],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/bin/',
    '<rootDir>/tests/.*\\.broken$',
    '<rootDir>/tests/integration/phase2/',
    '<rootDir>/tests/archived/'
  ],
  transform: {
    // Transform TypeScript files with ts-jest for ES modules support
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ESNext',
        moduleResolution: 'node',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  preset: 'ts-jest/presets/default-esm',
  moduleNameMapper: {
    // Handle missing modules by providing mock paths
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^~/(.*)$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    // Mock missing coordination modules
    '^../../../src/coordination/v2/truth/truth-config-manager.js$': '<rootDir>/config/jest/mocks/truth-config-manager.js',
    '^../../../src/coordination/v2/truth/truth-validator.js$': '<rootDir>/config/jest/mocks/truth-validator.js',
    '^../../../src/coordination/v2/framework/framework-registry.js$': '<rootDir>/config/jest/mocks/framework-registry.js',
    // Handle other missing modules
    '^../../../src/coordination/v2/(.*)$': '<rootDir>/config/jest/mocks/coordination-mock.js',
    '^../../../src/wizard/(.*)$': '<rootDir>/config/jest/mocks/wizard-mock.js'
  },
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/bin/',
    '<rootDir>/node_modules/'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|ora|inquirer|nanoid|fs-extra|ansi-styles|ruv-swarm|@modelcontextprotocol)/)'
  ],
  resolver: undefined,
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.js',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.test.js',
    '!src/**/*.spec.ts',
    '!src/**/*.spec.js',
    '!src/coordination/archives/**/*',
    '!src/**/archives/**/*'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/config/jest/jest.setup.cjs'],
  testTimeout: 30000,
  verbose: true,
  // Enhanced error handling
  errorOnDeprecated: false,
  // Better module resolution
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  // Remove deprecated globals configuration
  // ts-jest configuration moved to transform options above
};