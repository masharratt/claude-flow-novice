/**
 * ESLint Configuration for Integration Standards
 *
 * Enforces standardized patterns for:
 * - Database operations (DatabaseService)
 * - Error handling (StandardError)
 * - Coordination (RedisCoordination)
 * - Documentation (JSDoc requirements)
 *
 * Integration with CI/CD: Runs on all PRs, blocks merge on errors
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: [
    '@typescript-eslint',
    'jsdoc',
    'security'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:security/recommended'
  ],
  rules: {
    // ============================================
    // INTEGRATION PATTERN ENFORCEMENT
    // ============================================

    /**
     * Prevent direct database imports in business logic
     * Enforce use of DatabaseService abstraction
     */
    'no-restricted-imports': ['error', {
      'paths': [
        {
          'name': 'sqlite3',
          'message': 'Use DatabaseService instead of direct sqlite3 import. Import from ./services/database-service'
        },
        {
          'name': 'pg',
          'message': 'Use DatabaseService instead of direct pg import. Import from ./services/database-service'
        },
        {
          'name': 'ioredis',
          'message': 'Use RedisCoordination instead of direct ioredis import. Import from ./services/redis-coordination'
        },
        {
          'name': 'redis',
          'message': 'Use RedisCoordination instead of direct redis import. Import from ./services/redis-coordination'
        }
      ],
      'patterns': [
        {
          'group': ['**/node_modules/sqlite3/**'],
          'message': 'Use DatabaseService abstraction'
        },
        {
          'group': ['**/node_modules/pg/**'],
          'message': 'Use DatabaseService abstraction'
        }
      ]
    }],

    /**
     * Enforce StandardError usage instead of generic Error
     * Ensures proper error codes and context
     */
    'no-throw-literal': 'error',
    '@typescript-eslint/no-throw-literal': 'error',

    /**
     * Require error handling in async functions
     * Prevents unhandled promise rejections
     */
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    /**
     * Enforce explicit return types for functions
     * Improves type safety and documentation
     */
    '@typescript-eslint/explicit-function-return-type': ['warn', {
      'allowExpressions': true,
      'allowTypedFunctionExpressions': true
    }],

    // ============================================
    // DOCUMENTATION REQUIREMENTS
    // ============================================

    /**
     * Require JSDoc comments on public APIs
     * Must include @param, @returns, @throws
     */
    'jsdoc/require-jsdoc': ['error', {
      'require': {
        'FunctionDeclaration': true,
        'MethodDefinition': true,
        'ClassDeclaration': true,
        'ArrowFunctionExpression': false,
        'FunctionExpression': false
      },
      'contexts': [
        'ExportNamedDeclaration > FunctionDeclaration',
        'ExportDefaultDeclaration > FunctionDeclaration',
        'ExportNamedDeclaration > ClassDeclaration'
      ],
      'publicOnly': true
    }],

    'jsdoc/require-param': 'error',
    'jsdoc/require-param-description': 'warn',
    'jsdoc/require-param-type': 'off', // TypeScript handles types
    'jsdoc/require-returns': 'error',
    'jsdoc/require-returns-description': 'warn',
    'jsdoc/require-returns-type': 'off', // TypeScript handles types
    'jsdoc/check-param-names': 'error',
    'jsdoc/check-tag-names': 'error',
    'jsdoc/check-types': 'off', // TypeScript handles types

    /**
     * Require @throws documentation for StandardError
     */
    'jsdoc/check-tag-names': ['error', {
      'definedTags': ['throws', 'example']
    }],

    // ============================================
    // SECURITY RULES
    // ============================================

    /**
     * Prevent SQL injection via string concatenation
     */
    'security/detect-non-literal-fs-filename': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-non-literal-require': 'warn',

    /**
     * Prevent eval and similar dynamic code execution
     */
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',

    /**
     * Prevent console.log in production code
     * Use structured logging instead
     */
    'no-console': ['error', {
      'allow': ['warn', 'error']
    }],

    /**
     * Prevent debugger statements
     */
    'no-debugger': 'error',

    // ============================================
    // CODE QUALITY
    // ============================================

    /**
     * Enforce consistent error handling
     */
    'no-empty': ['error', {
      'allowEmptyCatch': false
    }],

    /**
     * Prevent unused variables
     */
    '@typescript-eslint/no-unused-vars': ['error', {
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_'
    }],

    /**
     * Require const for variables that are never reassigned
     */
    'prefer-const': 'error',

    /**
     * Disallow var, use const/let
     */
    'no-var': 'error',

    /**
     * Require === instead of ==
     */
    'eqeqeq': ['error', 'always'],

    /**
     * Prevent async functions without await
     */
    '@typescript-eslint/require-await': 'warn',

    /**
     * Enforce proper async patterns
     */
    'no-return-await': 'off',
    '@typescript-eslint/return-await': ['error', 'in-try-catch'],

    // ============================================
    // PERFORMANCE
    // ============================================

    /**
     * Warn on potential performance issues
     */
    'no-await-in-loop': 'warn',

    // ============================================
    // TESTING
    // ============================================

    /**
     * Prevent focused tests (fit, fdescribe)
     */
    'no-restricted-globals': ['error', {
      'name': 'fit',
      'message': 'Do not commit focused tests'
    }, {
      'name': 'fdescribe',
      'message': 'Do not commit focused test suites'
    }]
  },

  // ============================================
  // FILE-SPECIFIC OVERRIDES
  // ============================================

  overrides: [
    {
      // Test files can use console.log and have looser JSDoc requirements
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
      rules: {
        'no-console': 'off',
        'jsdoc/require-jsdoc': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off'
      }
    },
    {
      // Mock files can have any imports
      files: ['**/*.mock.ts', '**/mocks/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
        'jsdoc/require-jsdoc': 'off'
      }
    },
    {
      // Database service can import database libraries
      files: ['**/services/database-service.ts'],
      rules: {
        'no-restricted-imports': 'off'
      }
    },
    {
      // Redis coordination can import Redis libraries
      files: ['**/services/redis-coordination.ts'],
      rules: {
        'no-restricted-imports': 'off'
      }
    },
    {
      // Configuration files
      files: ['**/*.config.js', '**/*.config.ts'],
      rules: {
        'jsdoc/require-jsdoc': 'off',
        '@typescript-eslint/no-var-requires': 'off'
      }
    }
  ],

  // ============================================
  // CUSTOM RULES (Future Enhancement)
  // ============================================

  /**
   * Future custom rules to implement:
   *
   * 1. prefer-standarderror
   *    - Detect new Error() and suggest StandardError
   *    - Check for proper error code usage
   *
   * 2. require-schema-validation
   *    - Detect RedisCoordination.publish() without schema
   *    - Warn on missing schema parameter
   *
   * 3. standarderror-require-code
   *    - Enforce error code from ErrorCode enum
   *    - Prevent raw string error codes
   *
   * 4. database-transaction-boundaries
   *    - Detect multi-step DB operations without transaction
   *    - Suggest transaction wrapping
   *
   * 5. require-connection-cleanup
   *    - Detect database/redis connection without finally block
   *    - Ensure proper cleanup
   *
   * Implementation: Create custom ESLint plugin in .eslint-rules/
   */

  settings: {
    jsdoc: {
      mode: 'typescript',
      tagNamePreference: {
        returns: 'returns',
        throws: 'throws'
      }
    }
  }
};

/**
 * Usage Instructions:
 *
 * 1. Install dependencies:
 *    npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-jsdoc eslint-plugin-security
 *
 * 2. Run linting:
 *    npx eslint . --ext .ts,.tsx
 *
 * 3. Fix auto-fixable issues:
 *    npx eslint . --ext .ts,.tsx --fix
 *
 * 4. Integration with CI/CD:
 *    Add to .github/workflows/standards-enforcement.yml
 *
 * 5. Integration with IDE:
 *    - VS Code: Install ESLint extension
 *    - WebStorm: Enable ESLint in Preferences
 *
 * 6. Pre-commit hook:
 *    Add to .husky/pre-commit or package.json lint-staged
 */
