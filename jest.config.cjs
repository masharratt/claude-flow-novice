module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts', '**/*.test.cjs'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        target: 'es2020',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
      },
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Memory leak prevention (ANTI-024)
  maxWorkers: 4,                    // Limit parallel workers
  testTimeout: 30000,               // 30s per test max
  forceExit: true,                  // Kill orphaned handles
  detectOpenHandles: true,          // Warn on leaked handles
  workerIdleMemoryLimit: '512MB',   // Kill workers exceeding memory
};
