module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        diagnostics: {
          ignoreCodes: [151002]
        }
      },
    ],
  },
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Exclude tests that require external services or have ESM incompatibilities:
  // - E2E: require Trigger.dev server
  // - integration: require Trigger.dev SDK runtime
  // - decomposition: require Trigger.dev SDK runtime
  // - ruvector: require native modules with CommonJS/ESM conflicts
  // - security/auth.test.ts, security/sla-enforcement.test.ts: ESM module linking conflicts
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/',
    '/tests/integration/',
    '/tests/decomposition/',
    '/tests/ruvector/',
    '/tests/security/auth.test.ts',
    '/tests/security/sla-enforcement.test.ts',
    '/tests/performance/decomposition-benchmark.test.ts'
  ],
  collectCoverageFrom: [
    'src/lib/ruvector-*.ts',
    '!src/lib/**/*.d.ts',
    '!**node_modules/**'
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70
    }
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  testTimeout: 30000,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
