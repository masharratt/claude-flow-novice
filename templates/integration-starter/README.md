# Integration Starter Template

Pre-configured template for building CFN integrations following standardized patterns.

## Features

- ✅ TypeScript with strict mode
- ✅ ESLint with integration rules
- ✅ Jest with coverage reporting
- ✅ Pre-configured DatabaseService
- ✅ Pre-configured RedisCoordination
- ✅ Pre-configured SkillLoader
- ✅ StandardError implementation
- ✅ Example integration tests
- ✅ Documentation templates

## Quick Start

```bash
# Copy template to new project
cp -r templates/integration-starter my-integration
cd my-integration

# Install dependencies
npm install

# Start development
npm run dev

# Run tests
npm test

# Build
npm run build
```

## Project Structure

```
integration-starter/
├── src/
│   ├── services/          # Service layer (DatabaseService, etc.)
│   ├── lib/               # Shared libraries (errors, validation)
│   └── index.ts           # Entry point
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
├── docs/
│   └── README.md          # Documentation
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── .gitignore             # Git ignore
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm test` - Run all tests
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix linting issues

## Standards Enforced

- Database operations use DatabaseService
- Errors use StandardError with error codes
- Coordination uses RedisCoordination
- All public APIs documented with JSDoc
- Test coverage ≥85%
- Integration tests for critical paths

## Next Steps

1. Update `package.json` with your project details
2. Implement your integration in `src/`
3. Add tests in `tests/`
4. Update documentation in `docs/`
5. Run `npm run lint` before committing

## Resources

- [Integration Standards](/docs/INTEGRATION_STANDARDIZATION_OVERVIEW.md)
- [Code Review Guidelines](/CODE_REVIEW_GUIDELINES.md)
- [Training Materials](/training/TRAINING_PRESENTATION.md)
