# TypeScript Project Setup with Claude Flow

Complete guide to setting up TypeScript projects with claude-flow-novice agent coordination for maximum type safety and development efficiency.

## 🚀 Quick Setup

### Prerequisites
```bash
# Ensure Node.js 18+ and npm/yarn are installed
node --version  # Should be 18.0.0 or higher
npm --version   # Latest stable

# Install claude-flow-novice globally (recommended)
npm install -g claude-flow@alpha
```

### Initialize TypeScript Project
```bash
# Create new TypeScript project with claude-flow
npx claude-flow@alpha init --template typescript-enterprise
cd my-typescript-project

# Or initialize in existing directory
npx claude-flow@alpha init --language typescript --framework express
```

## 📋 Project Templates

### Available TypeScript Templates
```bash
# Enterprise-grade TypeScript setup
npx claude-flow@alpha init --template typescript-enterprise
# Includes: NestJS, TypeORM, Jest, ESLint, Prettier, strict tsconfig

# Full-stack TypeScript application
npx claude-flow@alpha init --template typescript-fullstack
# Includes: React frontend, Express backend, shared types

# TypeScript library/package
npx claude-flow@alpha init --template typescript-library
# Includes: Library build setup, declaration files, publishing config

# Microservices TypeScript setup
npx claude-flow@alpha init --template typescript-microservices
# Includes: Multiple services, shared contracts, Docker configs
```

### Framework-Specific Templates
```bash
# React TypeScript application
npx claude-flow@alpha init --template react-typescript
# Advanced React setup with TypeScript, testing, and Storybook

# NestJS API project
npx claude-flow@alpha init --template nestjs-typescript
# Complete NestJS setup with TypeORM, authentication, and validation

# Next.js TypeScript application
npx claude-flow@alpha init --template nextjs-typescript
# Next.js with TypeScript, API routes, and optimized configuration

# Express TypeScript API
npx claude-flow@alpha init --template express-typescript
# Express with TypeScript, middleware, error handling, and validation
```

## ⚙️ Configuration Setup

### TypeScript Configuration
```json
// tsconfig.json - Optimized for agent coordination
{
  "compilerOptions": {
    // Strict type checking
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,

    // Module resolution
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,

    // Output settings
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",

    // Declaration files for agent type awareness
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    // Path mapping for clean imports
    "baseUrl": "./",
    "paths": {
      "@/*": ["src/*"],
      "@types/*": ["src/types/*"],
      "@utils/*": ["src/utils/*"],
      "@services/*": ["src/services/*"]
    },

    // Additional checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "src/**/*",
    "tests/**/*",
    "*.config.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "build",
    "coverage"
  ]
}
```

### Claude Flow Configuration
```bash
# Configure TypeScript-specific settings
npx claude-flow@alpha config set language.primary typescript
npx claude-flow@alpha config set language.typescript.strict true
npx claude-flow@alpha config set language.typescript.version "5.0"

# Enable TypeScript-specific agent features
npx claude-flow@alpha config set agents.typescript.typeAware true
npx claude-flow@alpha config set agents.typescript.generateTypes true
npx claude-flow@alpha config set agents.typescript.validateRuntime true

# Build tool preferences
npx claude-flow@alpha config set build.typescript.compiler "tsc"
npx claude-flow@alpha config set build.typescript.bundler "esbuild"
npx claude-flow@alpha config set build.typescript.checker "tsc"
```

### Package.json Scripts
```json
{
  "scripts": {
    // Development
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "dev:debug": "ts-node-dev --inspect --respawn --transpile-only src/index.ts",

    // Building
    "build": "tsc && npx claude-flow@alpha hooks post-build --validate-types",
    "build:watch": "tsc --watch",
    "build:production": "tsc --project tsconfig.prod.json",

    // Testing
    "test": "jest && npx claude-flow@alpha hooks post-test --coverage-check",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:types": "tsc --noEmit",

    // Linting and formatting
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",

    // Claude Flow integration
    "claude:setup": "npx claude-flow@alpha project setup --language typescript",
    "claude:validate": "npx claude-flow@alpha project validate --strict-types",
    "claude:agents": "npx claude-flow@alpha agents list --language typescript"
  }
}
```

## 🔧 Development Environment Setup

### VS Code Configuration
```json
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "claude-flow.language": "typescript",
  "claude-flow.autoValidate": true,
  "claude-flow.strictMode": true
}
```

### ESLint Configuration
```javascript
// .eslintrc.js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'error',
  },
};
```

### Prettier Configuration
```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

## 🏗️ Project Structure

### Recommended Directory Structure
```
src/
├── types/              # Type definitions
│   ├── api.ts         # API-related types
│   ├── database.ts    # Database model types
│   ├── common.ts      # Common utility types
│   └── index.ts       # Type exports
├── interfaces/         # Interface definitions
│   ├── services/      # Service interfaces
│   ├── repositories/  # Repository interfaces
│   └── controllers/   # Controller interfaces
├── models/            # Data models
├── services/          # Business logic
├── controllers/       # Request handlers
├── middleware/        # Express middleware
├── utils/             # Utility functions
├── config/            # Configuration files
└── index.ts          # Application entry point

tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── e2e/              # End-to-end tests
├── fixtures/         # Test data
└── helpers/          # Test utilities

docs/
├── api/              # API documentation
└── types/            # Type documentation
```

## 📦 Essential Dependencies

### Core TypeScript Dependencies
```bash
# Install TypeScript and core tools
npm install -D typescript @types/node ts-node ts-node-dev

# Install ESLint and TypeScript rules
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# Install Prettier for code formatting
npm install -D prettier eslint-config-prettier

# Install Jest for testing
npm install -D jest @types/jest ts-jest

# Install additional type checking tools
npm install -D type-coverage @typescript-eslint/typescript-estree
```

### Runtime Dependencies (Example Express API)
```bash
# Express with TypeScript support
npm install express
npm install -D @types/express

# Validation and transformation
npm install class-validator class-transformer zod

# Environment and configuration
npm install dotenv
npm install -D @types/dotenv

# Database (example with TypeORM)
npm install typeorm pg
npm install -D @types/pg
```

## 🤖 Agent Integration Setup

### Initialize Agent Coordination
```bash
# Setup TypeScript-aware agents
npx claude-flow@alpha agents setup --language typescript

# Configure type-safe agent communication
npx claude-flow@alpha config set agents.communication.typed true
npx claude-flow@alpha config set agents.validation.runtime true

# Enable automatic type generation
npx claude-flow@alpha config set generators.types.enabled true
npx claude-flow@alpha config set generators.interfaces.enabled true
```

### Agent Hooks Configuration
```bash
# Configure TypeScript-specific hooks
npx claude-flow@alpha hooks setup --language typescript

# Pre-commit hooks for type checking
npx claude-flow@alpha hooks add pre-commit "npm run test:types"
npx claude-flow@alpha hooks add pre-commit "npm run lint"

# Post-edit hooks for validation
npx claude-flow@alpha hooks add post-edit "tsc --noEmit --incremental"

# Build hooks for type generation
npx claude-flow@alpha hooks add pre-build "npm run generate:types"
npx claude-flow@alpha hooks add post-build "npm run validate:coverage"
```

## 🔍 Type Coverage and Validation

### Type Coverage Configuration
```bash
# Install type coverage tools
npm install -D type-coverage typescript-coverage-report

# Add to package.json scripts
{
  "type-coverage": "type-coverage --detail --strict",
  "type-coverage:report": "typescript-coverage-report"
}

# Configure minimum type coverage
npx claude-flow@alpha config set validation.typeCoverage.minimum 95
npx claude-flow@alpha config set validation.typeCoverage.strict true
```

### Runtime Type Validation Setup
```bash
# Install runtime validation libraries
npm install zod io-ts runtypes

# Configure agent integration for runtime validation
npx claude-flow@alpha config set validation.runtime.library "zod"
npx claude-flow@alpha config set validation.runtime.generateSchemas true
```

## 🚦 Development Workflow

### Initial Project Setup Flow
```javascript
// Complete TypeScript project setup with agents
[Single Message - Project Initialization]:
  Task("Project Architect", "Setup TypeScript project structure with best practices", "system-architect")
  Task("Configuration Manager", "Configure TypeScript, ESLint, Prettier, and Jest", "coder")
  Task("Type Safety Engineer", "Implement strict type checking and validation", "reviewer")
  Task("Development Environment Setup", "Configure VS Code, scripts, and tooling", "coder")

  // Batch all setup operations
  Bash("mkdir -p src/{types,interfaces,models,services,controllers,middleware,utils,config}")
  Bash("mkdir -p tests/{unit,integration,e2e,fixtures,helpers}")
  Bash("mkdir -p docs/{api,types}")

  Write("tsconfig.json")
  Write(".eslintrc.js")
  Write(".prettierrc")
  Write("jest.config.js")
  Write("src/types/index.ts")
  Write("src/interfaces/index.ts")
```

### Continuous Development Flow
```bash
# Start development with agent coordination
npx claude-flow@alpha dev start --language typescript

# Agents automatically:
# - Monitor file changes for type errors
# - Validate type coverage on saves
# - Generate type definitions as needed
# - Run incremental type checks
# - Coordinate between related files
```

## 🛡️ Type Safety Best Practices

### Strict Type Configuration
```typescript
// Enable all strict checks in tsconfig.json
{
  "compilerOptions": {
    "strict": true,                           // Enable all strict checks
    "noImplicitAny": true,                   // Error on implicit any
    "strictNullChecks": true,                // Strict null/undefined checks
    "strictFunctionTypes": true,             // Strict function type checks
    "strictBindCallApply": true,             // Strict bind/call/apply
    "strictPropertyInitialization": true,   // Strict class property init
    "noImplicitThis": true,                  // Error on implicit this
    "noImplicitReturns": true,              // Error on missing returns
    "noFallthroughCasesInSwitch": true,     // Error on switch fallthrough
    "noUncheckedIndexedAccess": true,       // Strict index access
    "exactOptionalPropertyTypes": true       // Exact optional properties
  }
}
```

### Type-Safe Environment Variables
```typescript
// src/config/environment.ts
interface EnvironmentVariables {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  API_VERSION: string;
}

// Runtime validation with zod
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().int().min(1).max(65535),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  API_VERSION: z.string().regex(/^v\d+$/),
});

export const environment: EnvironmentVariables = environmentSchema.parse(process.env);
```

## 🔧 Troubleshooting

### Common Setup Issues

#### TypeScript Compiler Errors
```bash
# Clear TypeScript cache
npx tsc --build --clean

# Rebuild with fresh cache
npx tsc --build --force

# Validate configuration
npx claude-flow@alpha validate typescript-config
```

#### Agent Coordination Issues
```bash
# Reset agent configuration
npx claude-flow@alpha agents reset --language typescript

# Verify agent communication
npx claude-flow@alpha agents test --communication-check

# Re-initialize agent hooks
npx claude-flow@alpha hooks reset && npx claude-flow@alpha hooks setup
```

#### Type Coverage Problems
```bash
# Generate detailed type coverage report
npm run type-coverage -- --detail

# Fix common type issues with agents
npx claude-flow@alpha agents spawn reviewer "fix type coverage issues in src/"
```

## 🎯 Next Steps

Once your TypeScript project is set up:

1. **[Learn Development Workflows](workflows.md)** - Master type-safe development patterns
2. **[Explore Advanced Patterns](patterns.md)** - Implement complex TypeScript architectures
3. **[Framework Integration](frameworks.md)** - Connect with React, Node.js, NestJS, and more
4. **[Automation Setup](automation.md)** - Configure CI/CD and automated type checking

---

**Ready to start coding?**
- Run `npm run dev` to start development with agent coordination
- Use `npx claude-flow@alpha agents spawn coder "implement user authentication"` to begin development
- Check out [Development Workflows](workflows.md) for type-safe coding patterns