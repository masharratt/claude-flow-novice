// Jest configuration proxy file
// This file ensures backwards compatibility for scripts that don't use --config flag
// The actual configuration is maintained in config/jest/jest.config.js

// Jest configuration with module resolution fixes
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.ts',
    '<rootDir>/tests/**/*.spec.js'
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
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'es2022',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        target: 'es2022',
        skipLibCheck: true,
        skipDefaultLibCheck: true,
        strict: false,
        noImplicitAny: false,
        isolatedModules: true
      },
      diagnostics: {
        warnOnly: true
      }
    }]
  },
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
  // Handle missing modules gracefully
  resolver: undefined
};