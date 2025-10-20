module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/api/phase-1/**/*.test.js'],
  setupFilesAfterEnv: ['./jest.setup.js'],
  verbose: true,
  collectCoverage: true,
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!**/node_modules/**',
    '!**/test/**'
  ],
  globalSetup: './jest.global-setup.js',
  globalTeardown: './jest.global-teardown.js'
};