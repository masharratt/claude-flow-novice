module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageThresholds: {
    global: {
      statements: 90,
      branches: 80,
      functions: 90,
      lines: 90
    }
  },
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 30000,
  maxWorkers: '50%'
};
