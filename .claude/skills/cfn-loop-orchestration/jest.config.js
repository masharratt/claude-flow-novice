module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@orchestrator/(.*)$': '<rootDir>/src/orchestrator/$1',
    '^@gate-checker/(.*)$': '<rootDir>/src/gate-checker/$1',
    '^@agent-spawner/(.*)$': '<rootDir>/src/agent-spawner/$1',
    '^@redis/(.*)$': '<rootDir>/src/redis/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/orchestrator/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/gate-checker/': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    './src/agent-spawner/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/utils/': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  collectCoverage: false,
};
