# Claude Flow Novice Test Suite

## Overview

This test suite validates the core functionality and resilience of the Claude Flow Novice system across multiple layers and scenarios.

## Test Layers

### Layer 0: Agent Tooling Validation
- Verifies individual tool functionality
- Ensures tools can be instantiated and used
- Tests error handling and coordination

### Layer 1: Mesh Coordination
- Redis pub/sub integration tests
- Validates agent communication patterns
- Checks distributed messaging reliability

### Layer 2: Review Handoff
- Dynamic reviewer pool testing
- Validates context transfer mechanisms
- Ensures smooth agent transitions

### Layer 3: Error Handling
- 50% error injection scenarios
- Circuit breaker and fallback mechanisms
- Resilience and recovery validation

## Running Tests

### Prerequisites
- Node.js 18+
- Redis
- Docker (optional, for containerized testing)

### Commands
```bash
# Run all tests
npm test

# Run specific test layer
npm test -- --testNamePattern="Layer 0"

# Generate coverage report
npm run test:coverage
```

## Coverage Requirements

| Layer | Branches | Functions | Lines | Statements |
|-------|----------|-----------|-------|------------|
| Layer 0 | 90% | 85% | 95% | 90% |
| Layer 1 | 85% | 80% | 90% | 85% |
| Layer 2 | 80% | 75% | 85% | 80% |
| Layer 3 | 75% | 70% | 80% | 75% |

## Chaos Testing

Includes resilience tests for:
- Redis connection failures
- SQLite data corruption
- Coordinator process termination

## Best Practices

- All tests use TypeScript
- Strict mode enforcement
- Clear, descriptive assertions
- Proper resource cleanup
- Deterministic test environments

## Troubleshooting

1. Ensure Redis is running
2. Check network configurations
3. Verify dependency versions
4. Run with increased verbosity: `npm test -- --verbose`

## Contributing

- Add new tests in respective layer directories
- Follow existing patterns
- Update coverage documentation
- Write clear, concise test descriptions