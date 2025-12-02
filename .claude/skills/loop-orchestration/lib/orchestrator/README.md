# CFN Loop Orchestration Engine - TypeScript v3.0

Type-safe implementation of the CFN Loop orchestration system with test-driven validation.

## Overview

This is the TypeScript migration of the CFN Loop orchestration system, replacing the bash-based implementation with a fully type-safe, well-tested TypeScript codebase.

**Key Features:**
- Full type safety with TypeScript strict mode
- Test-driven validation (≥95% pass rate gates)
- Mode-specific execution (MVP, Standard, Enterprise)
- Redis-based agent coordination
- Comprehensive test coverage (80-100% per module)

## Project Structure

```
src/
├── orchestrator/       # Main orchestration engine
├── gate-checker/       # Test result validation
├── agent-spawner/      # Agent spawning and coordination
├── redis/             # Redis coordination layer
├── utils/             # Utilities and helpers
└── types.ts           # Core type definitions

tests/
├── orchestrator/       # Orchestrator tests
├── gate-checker/       # Gate checker tests
└── agent-spawner/      # Agent spawner tests

bash-wrappers/         # Shell wrappers for CLI compatibility
```

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run type-check

# Lint
npm run lint
```

## Development

```bash
# Watch mode for development
npm run build:watch

# Watch mode for tests
npm run test:watch

# Format code
npm run format

# Fix linting issues
npm run lint:fix
```

## Configuration

### tsconfig.json
Strict TypeScript configuration with:
- ES2022 target
- CommonJS module format
- Path mapping for clean imports
- All strict compiler options enabled

### jest.config.js
Test configuration with:
- ts-jest preset for TypeScript support
- Coverage thresholds (80-100% per module)
- Path mapping for imports
- 30-second test timeout

### .eslintrc.js
Linting configuration with:
- TypeScript-specific rules
- Strict null checking
- No implicit any
- Prefer const and proper variable declarations

## Test Coverage

Target coverage per module:
- `src/orchestrator/`: 100%
- `src/gate-checker/`: 100%
- `src/agent-spawner/`: 90%
- `src/utils/`: 80%
- Global minimum: 80%

## Type Definitions

Core types are defined in `src/types.ts`:

- `ExecutionMode` - 'mvp' | 'standard' | 'enterprise'
- `OrchestrationConfig` - Task configuration
- `AgentSpec` - Agent specification with resources
- `TestResult` - Test execution results
- `GateResult` - Gate check results
- `ProductOwnerDecision` - 'PROCEED' | 'ITERATE' | 'ABORT'
- `OrchestrationResult` - Final result

## Mode Configuration

| Mode | Test Gate | Consensus | Max Iterations | Validators |
|------|-----------|-----------|----------------|------------|
| mvp | 70% | 80% | 5 | 2 |
| standard | 95% | 90% | 10 | 3 |
| enterprise | 98% | 95% | 15 | 5 |

## Migration Plan

See `docs/migration/BASH_TO_TYPESCRIPT_MIGRATION_PLAN.md` for the complete migration strategy from bash to TypeScript.

## Building and Deployment

```bash
# Production build
npm run build

# Distribution files are in dist/
# Include in packages: dist/, package.json, README.md
```

## Environment Variables

```
CFN_REDIS_HOST=localhost (default)
CFN_REDIS_PORT=6379 (default)
NODE_ENV=test|development|production
```

## License

MIT
