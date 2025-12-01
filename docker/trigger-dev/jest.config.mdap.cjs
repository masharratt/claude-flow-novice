/**
 * Jest Configuration for MDAP Analytics Tests
 *
 * Separate config for running MDAP analytics tests which don't require
 * native RuVector modules.
 *
 * Usage: npm test -- --config jest.config.mdap.cjs
 */
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
  // Only run MDAP analytics tests
  testMatch: [
    '**/ruvector/mdap-analytics.test.ts',
    '**/integration/ruvector-mdap-integration.test.ts'
  ],
  // Mock the RuVector native modules
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mock @ruvector/core to avoid native module issues
    '@ruvector/core': '<rootDir>/tests/__mocks__/@ruvector/core.ts'
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  testTimeout: 30000,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
