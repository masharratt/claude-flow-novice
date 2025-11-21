/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.integration.test.ts'],
  testTimeout: 120000, // 2 minutes for container startup
  verbose: true,
  setupFilesAfterEnv: ['./setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../../../src/$1',
  },
};
