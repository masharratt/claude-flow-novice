import js from '@eslint/js';
import typescript from 'typescript-eslint';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...typescript.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: typescript.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
      },
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',

      // Import path standardization (prevent module resolution errors)
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['../src/*', '../../src/*', '../../../src/*'],
            message: 'Use absolute imports from src root instead of relative src/ imports'
          },
          {
            group: ['../**/node_modules/*'],
            message: 'Do not import directly from node_modules subdirectories'
          }
        ]
      }]
    }
  },
  {
    ignores: [
      'dist/**',
      'bin/**',
      'node_modules/**',
      'coverage/**',
      '**/*.js',
      'src/web/frontend/**',
      'src/migration/**',
      'src/templates/**',
      'package/**',
      'examples/**',
      'monitor/**',
      'tests/**',
      'archive/**',
      'src/__tests__/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      'src/cli/commands/swarm-new.ts'
    ]
  }
];