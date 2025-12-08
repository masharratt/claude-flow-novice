export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000, // Global timeout of 30 seconds for all tests
  testMatch: ['**/*.test.ts', '**/*.test.cjs'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/legacy/',
    '.backups',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'commonjs',
        target: 'es2020',
      },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup-cleanup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
};
