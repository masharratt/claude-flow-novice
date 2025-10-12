# Test Sharding Implementation Guide

## Quick Start

### Run Individual Test Groups
```bash
# Fast tests (15-20s each)
npm run test:stores      # 115 tests - Zustand stores
npm run test:services    # 60 tests - API/WebSocket services  
npm run test:hooks       # 9 tests - React hooks
npm run test:components  # Component tests

# Slower tests (may timeout, needs fixes)
npm run test:server      # Server integration tests
npm run test:views       # View component tests  
npm run test:integration # Full integration tests

# Specialized tests
npm run test:performance # Performance benchmarks
npm run test:a11y        # Accessibility tests
npm run test:minimal     # Smoke tests

# Run all (sequential, may take 7+ minutes)
npm run test:all

# With coverage
npm run test:coverage
```

### Why Sharding?

**Problem**: Running all 48 test files together caused >5 minute timeouts and memory issues.

**Solution**: Domain-based sharding with sequential execution.

**Benefits**:
- Predictable execution time per group
- Isolated memory spaces prevent leaks
- Easier to identify failing test domains
- Can run specific test groups during development

## Architecture

### Test Groups by Domain

```
stores/          → Business logic state management
services/        → API clients and WebSocket handling
hooks/           → React custom hooks  
components/      → UI component tests
server/          → Backend API and middleware
views/           → Full page view components
integration/     → Cross-system integration
performance/     → Benchmark and load tests
a11y/            → Accessibility compliance
minimal/         → Smoke and sanity tests
```

### Execution Strategy

```
Sequential Execution (No Parallelism)
├── Single Fork Process
├── Full Isolation Between Test Files
├── 15s Timeout Per Test
├── 10s Timeout for Hooks
└── Memory Cleanup After Each File
```

### Configuration

**vite.config.ts**:
```typescript
test: {
  pool: 'forks',              // Use fork pool for isolation
  poolOptions: {
    forks: {
      singleFork: true,       // One fork = sequential
      isolate: true           // Full isolation
    }
  },
  maxConcurrency: 1,          // One file at a time
  fileParallelism: false,     // No parallel files
  testTimeout: 15000,         // 15s per test
  hookTimeout: 10000,         // 10s for hooks
  isolate: true               // Enforce isolation
}
```

## Troubleshooting

### Test Hangs/Timeouts

**Symptoms**: Test group runs for 120s then times out

**Common Causes**:
1. `waitFor()` waiting for element that never renders
2. Async operations not cleaned up in `afterEach`
3. WebSocket connections left open
4. Timers not cleared

**Fix**:
```typescript
// Add explicit timeouts
await waitFor(() => {
  expect(screen.getByTestId('element')).toBeInTheDocument();
}, { timeout: 5000 });

// Clean up in afterEach
afterEach(() => {
  vi.clearAllTimers();
  cleanup();
  // Close connections
});
```

### Mock Not Working

**Symptoms**: `expected "spy" to be called but got 0 times`

**Common Causes**:
1. Mock defined after import
2. Mock not properly chained
3. Mock reset between tests

**Fix**:
```typescript
// Define mocks in setup.ts BEFORE imports
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket)
}));

// Ensure chainable mocks
const mockSocket = {
  on: vi.fn(function(this: any) { return this; }),
  emit: vi.fn(function(this: any) { return this; })
};
```

### Component Export Errors

**Symptoms**: `Missing "./Component" specifier in package`

**Fix**: Update `packages/web-components/package.json`:
```json
{
  "exports": {
    "./AgentHierarchyTree": "./src/AgentHierarchyTree.tsx",
    "./StatusMonitor": "./src/StatusMonitor.tsx"
  }
}
```

## Performance Benchmarks

| Test Group | Files | Tests | Duration | Status |
|------------|-------|-------|----------|--------|
| Stores | 4 | 115 | 19.65s | ✅ PASS |
| Services | 2 | 61 | 17.80s | ⚠️ 1 FAIL |
| Hooks | 1 | 9 | 24.07s | ❌ 7 FAIL |
| Components | 4 | - | 23.65s | ❌ IMPORT |
| Server | ~10 | - | >120s | ⏸️ TIMEOUT |
| Views | ~6 | - | >120s | ⏸️ TIMEOUT |
| Integration | 5 | - | >120s | ⏸️ TIMEOUT |

**Total Passing**: 175 tests  
**Average Speed**: ~20s per passing group

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

jobs:
  test-shards:
    strategy:
      matrix:
        shard: [stores, services, hooks, components, server, views, integration]
    steps:
      - run: npm run test:${{ matrix.shard }}
      - uses: codecov/codecov-action@v3
        if: matrix.shard == 'stores'  # Only upload once
```

### Local Development

```bash
# Watch mode for specific group
npm run test:watch -- src/shared/stores

# Quick smoke test
npm run test:minimal

# Full suite before commit
npm run test:all
```

## Known Issues

1. **Views tests timeout** - Need to fix `waitFor` usage and add cleanup
2. **Server tests timeout** - Long-running integration tests need refactor
3. **WebSocket mocks** - Chain methods not properly returning `this`
4. **Memory leak tests** - Subscription tracking not working with mocks
5. **Coverage incomplete** - Can't generate until all tests pass

## Next Steps

1. Fix WebSocket mocks in setup.ts
2. Add exports to web-components package.json
3. Debug views test timeouts
4. Add cleanup hooks to server tests
5. Run full suite with coverage

---

**Last Updated**: 2025-10-12  
**Maintainer**: Tester Agent (Backlog-1)
