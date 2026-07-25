# Integration Test Quick Reference

**Quick access guide for fixing and running integration tests**

---

## Quick Commands

### Run All Integration Tests
```bash
cd /home/user/claude-flow-novice/tests/integration
./run-all-tests.sh
```

### Run Only TypeScript Tests
```bash
npm test -- --config=tests/integration/jest.config.cjs --testPathPattern="\.test\.ts$"
```

### Run Only Shell Tests
```bash
cd /home/user/claude-flow-novice/tests/integration
./run-shell-tests.sh
```

### Run Single Test
```bash
# TypeScript
npm test -- --config=tests/integration/jest.config.cjs backup-recovery.test.ts

# Shell
cd /home/user/claude-flow-novice/tests/integration
./test-connectivity.sh
```

---

## Fix Status

### ✅ FIXED (Infrastructure Complete)
- DatabaseService mocking
- Redis client mocking
- Logging mocking
- Error class mocking
- Jest configuration
- Module resolution
- Global test setup

### ⏳ IN PROGRESS (Test File Updates)
- TypeScript test files: 1/13 updated
- Shell test files: 0/19 updated

---

## How to Fix a TypeScript Test

1. **Add import:**
   ```typescript
   import { createMockDatabaseService } from './test-helpers';
   ```

2. **Create mock in beforeAll:**
   ```typescript
   let mockDb: any;

   beforeAll(async () => {
     mockDb = createMockDatabaseService();
     // ... rest of setup
   });
   ```

3. **Pass mock to constructors:**
   ```typescript
   // Instead of:
   const manager = new Manager(config);

   // Use:
   const manager = new Manager(mockDb, config);
   ```

4. **Run test:**
   ```bash
   npm test -- --config=tests/integration/jest.config.cjs your-test.test.ts
   ```

---

## How to Fix a Shell Test

1. **Update environment loading:**
   ```bash
   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   if [ -f "$SCRIPT_DIR/.env" ]; then
     set -a
     source "$SCRIPT_DIR/.env"
     set +a
   fi
   ```

2. **Fix PROJECT_ROOT:**
   ```bash
   PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
   ```

3. **Run test:**
   ```bash
   cd /home/user/claude-flow-novice/tests/integration
   ./your-test.sh
   ```

---

## Common Issues

### Issue: "dbService.getAdapter is not a function"
**Solution:** Update test file to use createMockDatabaseService() (see above)

### Issue: Environment variables not loaded
**Solution:** Update shell test to load from tests/integration/.env (see above)

### Issue: Module not found
**Solution:** Check Jest config rootDir is set to '../../'

### Issue: sqlite3 binary missing
**Solution:** `npm install better-sqlite3`

---

## Test Files That Need Updates

### TypeScript (Remaining 12 files)
1. coordination-protocols.test.ts
2. data-formats.test.ts
3. database-handoffs.test.ts
4. end-to-end-workflows.test.ts
5. redis-failure.test.ts
6. schema-validation-complete.test.ts
7. skill-lifecycle.test.ts
8. phase-1/agents.test.js
9. phase-1/decisions.test.js
10. phase-1/filters.test.js
11. phase-1/messages.test.js
12. phase-1/websocket.test.js

### Shell (All 19 files)
- Apply environment loading fix to all
- Apply PROJECT_ROOT fix to all
- Install sqlite3 for test-standard-handoffs.sh

---

## Documentation

- **Comprehensive Guide:** `docs/INTEGRATION_TEST_FIXES.md`
- **Execution Summary:** `docs/INTEGRATION_TEST_EXECUTION_SUMMARY.md`
- **Original Results:** `docs/INTEGRATION_TEST_RESULTS.md`

---

## Key Files Created

### Mocks
- `tests/integration/mocks/database-service.mock.ts`
- `tests/integration/mocks/redis-client.mock.ts`
- `tests/integration/mocks/logging.mock.ts`
- `tests/integration/mocks/transaction-manager.mock.ts`
- `tests/integration/mocks/error-mocks.ts`

### Configuration
- `tests/integration/jest.config.cjs` (updated)
- `tests/integration/setup.ts` (global mocks)
- `tests/integration/.env` (test variables)

### Utilities
- `tests/integration/test-helpers.ts`

---

## Estimated Effort

| Task | Time | Priority |
|------|------|----------|
| Update 12 TypeScript files | 3-4h | P1 |
| Fix 19 shell tests | 2-3h | P2 |
| Verify pass rate | 30min | P3 |
| **TOTAL TO 100%** | **5-7h** | - |

---

**Last Updated:** November 17, 2025
