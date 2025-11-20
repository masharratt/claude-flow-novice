# Phase 1 Implementation Guide: Parse & Gate Functions
## Duration: 4 hours | LOC: 500 | Modules: 3 + 1 wrapper

This guide provides concrete code examples and step-by-step instructions for Phase 1 of the migration.

---

## Overview

Phase 1 migrates two critical functions that are used by the orchestrator to validate Loop 3 results:

1. **parse-test-results.ts** - Parse npm test JSON output
2. **gate-check.ts** - Compare pass rate vs threshold
3. **invoke-redis.sh wrapper** - Unified entry point for TS modules
4. **Unit tests** - Validation fixtures

---

## Step 1: Create parse-test-results.ts (240 LOC)

### File Location
```
.claude/skills/cfn-loop-orchestration/src/parse-test-results.ts
```

### Implementation

```typescript
// parse-test-results.ts
// Parse npm test JSON output and calculate pass rate

export interface TestResults {
  passed: number;
  total: number;
  passRate: number;
  failed: Array<{
    name: string;
    error: string;
  }>;
  duration: number;
  summary: string;
}

export interface JestTestResult {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults?: Array<{
    name: string;
    numFailingTests?: number;
    failureMessage?: string;
  }>;
  testDuration?: number;
}

/**
 * Parse npm test JSON output and extract pass rate
 * Supports:
 * - Jest JSON reporter (--json --outputFile=)
 * - TAP reporter (--json)
 * - Default npm test output
 */
export function parseTestResults(jsonOutput: string): TestResults {
  try {
    const data = JSON.parse(jsonOutput) as JestTestResult;

    const passed = data.numPassedTests || 0;
    const total = data.numTotalTests || 0;
    const failed = data.numFailedTests || 0;
    const duration = data.testDuration || 0;

    if (total === 0) {
      return {
        passed: 0,
        total: 0,
        passRate: 0,
        failed: [],
        duration,
        summary: "No tests found",
      };
    }

    const passRate = Math.round((passed / total) * 1000) / 1000; // 3 decimal places

    const failedTests = (data.testResults || [])
      .filter((t) => (t.numFailingTests || 0) > 0)
      .map((t) => ({
        name: t.name || "unknown",
        error: t.failureMessage || "Unknown error",
      }));

    return {
      passed,
      total,
      passRate,
      failed: failedTests,
      duration,
      summary: `${passed}/${total} tests passed (${(passRate * 100).toFixed(2)}%)`,
    };
  } catch (error) {
    // Fallback: try parsing as TAP format or string output
    return parseTAPFormat(jsonOutput);
  }
}

/**
 * Fallback: Parse TAP (Test Anything Protocol) format
 */
function parseTAPFormat(output: string): TestResults {
  const passMatch = output.match(/^ok\s+/gm);
  const failMatch = output.match(/^not ok\s+/gm);

  const passed = passMatch ? passMatch.length : 0;
  const failed = failMatch ? failMatch.length : 0;
  const total = passed + failed;

  if (total === 0) {
    return {
      passed: 0,
      total: 0,
      passRate: 0,
      failed: [],
      duration: 0,
      summary: "Could not parse test output",
    };
  }

  const passRate = Math.round((passed / total) * 1000) / 1000;

  return {
    passed,
    total,
    passRate,
    failed: [],
    duration: 0,
    summary: `${passed}/${total} tests passed (${(passRate * 100).toFixed(2)}%)`,
  };
}

/**
 * CLI entry point
 * Usage: node dist/parse-test-results.js "$(npm test --json)"
 */
if (require.main === module) {
  const jsonOutput = process.argv[2];

  if (!jsonOutput) {
    console.error("Usage: node parse-test-results.js <json-output>");
    process.exit(1);
  }

  const results = parseTestResults(jsonOutput);
  console.log(JSON.stringify(results, null, 2));
}
```

### Unit Tests

```typescript
// src/__tests__/parse-test-results.test.ts

import { parseTestResults, TestResults } from "../parse-test-results";

describe("parseTestResults", () => {
  it("should parse Jest JSON format correctly", () => {
    const jestOutput = JSON.stringify({
      success: true,
      numTotalTests: 10,
      numPassedTests: 9,
      numFailedTests: 1,
      numPendingTests: 0,
      testDuration: 2345,
    });

    const result = parseTestResults(jestOutput);

    expect(result.passed).toBe(9);
    expect(result.total).toBe(10);
    expect(result.passRate).toBe(0.9);
    expect(result.duration).toBe(2345);
  });

  it("should calculate passRate with 3 decimal places", () => {
    const output = JSON.stringify({
      numTotalTests: 7,
      numPassedTests: 3,
    });

    const result = parseTestResults(output);
    expect(result.passRate).toBe(0.429); // 3/7 = 0.428571...
  });

  it("should handle all tests passing", () => {
    const output = JSON.stringify({
      success: true,
      numTotalTests: 5,
      numPassedTests: 5,
      numFailedTests: 0,
    });

    const result = parseTestResults(output);

    expect(result.passRate).toBe(1.0);
    expect(result.summary).toContain("5/5");
  });

  it("should handle all tests failing", () => {
    const output = JSON.stringify({
      success: false,
      numTotalTests: 5,
      numPassedTests: 0,
      numFailedTests: 5,
    });

    const result = parseTestResults(output);

    expect(result.passRate).toBe(0);
    expect(result.summary).toContain("0/5");
  });

  it("should handle no tests found", () => {
    const output = JSON.stringify({
      numTotalTests: 0,
      numPassedTests: 0,
    });

    const result = parseTestResults(output);

    expect(result.passRate).toBe(0);
    expect(result.summary).toContain("No tests");
  });

  it("should extract failed test details", () => {
    const output = JSON.stringify({
      numTotalTests: 10,
      numPassedTests: 8,
      numFailedTests: 2,
      testResults: [
        {
          name: "src/auth.test.ts",
          numFailingTests: 1,
          failureMessage: "Expected true, got false",
        },
        {
          name: "src/database.test.ts",
          numFailingTests: 1,
          failureMessage: "Connection timeout",
        },
      ],
    });

    const result = parseTestResults(output);

    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].name).toContain("auth");
    expect(result.failed[1].error).toContain("timeout");
  });

  it("should gracefully handle invalid JSON", () => {
    const result = parseTestResults("invalid json");

    expect(result.passRate).toBe(0);
    expect(result.summary).toContain("Could not parse");
  });

  it("should parse TAP format as fallback", () => {
    const tapOutput = `1..5
ok 1 - test passes
ok 2 - another passes
not ok 3 - this fails
ok 4 - continues
not ok 5 - another fails`;

    const result = parseTestResults(tapOutput);

    expect(result.passed).toBe(3);
    expect(result.total).toBe(5);
    expect(result.passRate).toBe(0.6);
  });

  it("should handle empty TAP output", () => {
    const result = parseTestResults("");

    expect(result.passRate).toBe(0);
    expect(result.total).toBe(0);
  });
});
```

---

## Step 2: Create gate-check.ts (245 LOC)

### File Location
```
.claude/skills/cfn-loop-orchestration/src/gate-check.ts
```

### Implementation

```typescript
// gate-check.ts
// Validate Loop 3 pass rate against threshold and decide gate status

import { parseTestResults } from "./parse-test-results";

export interface GateCheckInput {
  passRate: number;
  threshold: number;
  mode: "mvp" | "standard" | "enterprise";
}

export interface GateCheckResult {
  passed: boolean;
  passRate: number;
  threshold: number;
  decision: "PROCEED" | "ITERATE";
  reason: string;
  metrics: {
    gap: number; // passRate - threshold (can be negative)
    percentageAboveThreshold: number; // (passRate / threshold - 1) * 100
  };
}

// Gate thresholds for different modes
const GATE_THRESHOLDS = {
  mvp: 0.7,
  standard: 0.95,
  enterprise: 0.98,
} as const;

/**
 * Validate pass rate against mode threshold
 * PROCEED: passRate >= threshold
 * ITERATE: passRate < threshold (send agents back for another iteration)
 */
export function checkGate(
  passRate: number,
  mode: "mvp" | "standard" | "enterprise"
): GateCheckResult {
  const threshold = GATE_THRESHOLDS[mode];

  const passed = passRate >= threshold;
  const gap = passRate - threshold;
  const percentageAboveThreshold = ((passRate / threshold - 1) * 100).toFixed(2);

  const decision = passed ? "PROCEED" : "ITERATE";

  let reason = "";
  if (passed) {
    reason = `Pass rate ${(passRate * 100).toFixed(2)}% meets ${mode} threshold of ${(threshold * 100).toFixed(2)}%`;
  } else {
    reason = `Pass rate ${(passRate * 100).toFixed(2)}% below ${mode} threshold of ${(threshold * 100).toFixed(2)}%. Gap: ${(Math.abs(gap) * 100).toFixed(2)}%`;
  }

  return {
    passed,
    passRate,
    threshold,
    decision,
    reason,
    metrics: {
      gap,
      percentageAboveThreshold: parseFloat(percentageAboveThreshold),
    },
  };
}

/**
 * Full gate check from JSON test results
 */
export function gateCheckFromJSON(
  jsonOutput: string,
  mode: "mvp" | "standard" | "enterprise"
): GateCheckResult {
  const testResults = parseTestResults(jsonOutput);
  return checkGate(testResults.passRate, mode);
}

/**
 * CLI entry point
 * Usage: node dist/gate-check.js standard "$(npm test --json)"
 */
if (require.main === module) {
  const [mode, jsonOutput] = process.argv.slice(2);

  if (!mode || !jsonOutput) {
    console.error(
      "Usage: node gate-check.js <mode: mvp|standard|enterprise> <json-output>"
    );
    process.exit(1);
  }

  if (!["mvp", "standard", "enterprise"].includes(mode)) {
    console.error("Invalid mode. Must be mvp, standard, or enterprise");
    process.exit(1);
  }

  const result = gateCheckFromJSON(
    jsonOutput,
    mode as "mvp" | "standard" | "enterprise"
  );

  console.log(JSON.stringify(result, null, 2));

  // Exit with code 0 for PROCEED, 1 for ITERATE
  process.exit(result.passed ? 0 : 1);
}
```

### Unit Tests

```typescript
// src/__tests__/gate-check.test.ts

import { checkGate, gateCheckFromJSON } from "../gate-check";

describe("checkGate", () => {
  describe("MVP mode (70% threshold)", () => {
    it("should PROCEED when pass rate meets threshold", () => {
      const result = checkGate(0.75, "mvp");

      expect(result.passed).toBe(true);
      expect(result.decision).toBe("PROCEED");
      expect(result.threshold).toBe(0.7);
    });

    it("should ITERATE when pass rate below threshold", () => {
      const result = checkGate(0.65, "mvp");

      expect(result.passed).toBe(false);
      expect(result.decision).toBe("ITERATE");
    });

    it("should exactly match threshold", () => {
      const result = checkGate(0.7, "mvp");

      expect(result.passed).toBe(true);
      expect(result.decision).toBe("PROCEED");
    });
  });

  describe("Standard mode (95% threshold)", () => {
    it("should PROCEED when pass rate meets threshold", () => {
      const result = checkGate(0.96, "standard");

      expect(result.passed).toBe(true);
      expect(result.threshold).toBe(0.95);
    });

    it("should ITERATE when pass rate below threshold", () => {
      const result = checkGate(0.90, "standard");

      expect(result.passed).toBe(false);
    });
  });

  describe("Enterprise mode (98% threshold)", () => {
    it("should require very high pass rate", () => {
      const result = checkGate(0.975, "enterprise");

      expect(result.passed).toBe(false);
      expect(result.threshold).toBe(0.98);
    });

    it("should PROCEED at 98%", () => {
      const result = checkGate(0.98, "enterprise");
      expect(result.passed).toBe(true);
    });
  });

  describe("Metrics calculation", () => {
    it("should calculate positive gap for passing threshold", () => {
      const result = checkGate(0.96, "standard");

      expect(result.metrics.gap).toBe(0.01);
      expect(result.metrics.percentageAboveThreshold).toBeGreaterThan(0);
    });

    it("should calculate negative gap for failing threshold", () => {
      const result = checkGate(0.90, "standard");

      expect(result.metrics.gap).toBe(-0.05);
      expect(result.metrics.percentageAboveThreshold).toBeLessThan(0);
    });

    it("should calculate percentage above threshold correctly", () => {
      const result = checkGate(0.95, "standard");

      // 0.95 / 0.95 = 1.0, (1.0 - 1) * 100 = 0%
      expect(result.metrics.percentageAboveThreshold).toBe(0);
    });
  });

  describe("Reason messages", () => {
    it("should provide actionable message for PROCEED", () => {
      const result = checkGate(0.96, "standard");

      expect(result.reason).toContain("96");
      expect(result.reason).toContain("95");
      expect(result.reason).toContain("meets");
    });

    it("should provide actionable message for ITERATE", () => {
      const result = checkGate(0.90, "standard");

      expect(result.reason).toContain("90");
      expect(result.reason).toContain("below");
      expect(result.reason).toContain("5");
    });
  });
});

describe("gateCheckFromJSON", () => {
  it("should parse test JSON and perform gate check", () => {
    const jsonOutput = JSON.stringify({
      numTotalTests: 10,
      numPassedTests: 10,
      numFailedTests: 0,
    });

    const result = gateCheckFromJSON(jsonOutput, "standard");

    expect(result.passRate).toBe(1.0);
    expect(result.passed).toBe(true);
    expect(result.decision).toBe("PROCEED");
  });

  it("should handle malformed JSON", () => {
    const result = gateCheckFromJSON("invalid", "standard");

    // Should fall back to 0% pass rate
    expect(result.passRate).toBe(0);
    expect(result.passed).toBe(false);
  });
});
```

---

## Step 3: Create invoke-redis.sh Wrapper (50 LOC)

### File Location
```
.claude/skills/cfn-loop-orchestration/invoke-redis.sh
```

### Implementation

```bash
#!/bin/bash
# Unified bash wrapper for TypeScript Redis coordination modules
# Bridges shell scripts to compiled Node.js modules

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
REDIS_COORD_DIST="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/dist"

# Verify compiled modules exist
if [[ ! -f "$REDIS_COORD_DIST/index.js" ]]; then
  echo "ERROR: Redis coordination modules not compiled" >&2
  echo "Run: npm run build --prefix '$PROJECT_ROOT/.claude/skills/cfn-redis-coordination'" >&2
  exit 1
fi

# Command routing
COMMAND="${1:?ERROR: Missing command: get-context|store-context|invoke-waiting-mode|report-completion}"
shift

case "$COMMAND" in
  get-context)
    # Get value from Redis context
    # Usage: invoke-redis.sh get-context --task-id X --key Y
    node "$REDIS_COORD_DIST/context-manager.js" get "$@"
    ;;

  store-context)
    # Store value in Redis context
    # Usage: invoke-redis.sh store-context --task-id X --key Y --value Z
    node "$REDIS_COORD_DIST/context-manager.js" store "$@"
    ;;

  invoke-waiting-mode)
    # Collect agent signals or wait for completion
    # Usage: invoke-redis.sh invoke-waiting-mode collect --task-id X --timeout 120
    node "$REDIS_COORD_DIST/waiting-coordinator.js" "$@"
    ;;

  report-completion)
    # Report agent completion status
    # Usage: invoke-redis.sh report-completion --task-id X --agent-id Y --status complete
    node "$REDIS_COORD_DIST/completion-reporter.js" "$@"
    ;;

  *)
    echo "ERROR: Unknown command: $COMMAND" >&2
    echo "Available commands: get-context, store-context, invoke-waiting-mode, report-completion" >&2
    exit 1
    ;;
esac
```

Make it executable:
```bash
chmod +x .claude/skills/cfn-loop-orchestration/invoke-redis.sh
```

---

## Step 4: Update package.json

### File Location
```
.claude/skills/cfn-loop-orchestration/package.json
```

### Changes

```json
{
  "name": "cfn-loop-orchestration",
  "version": "1.0.0",
  "description": "CFN Loop orchestration engine with TypeScript modules",
  "main": "dist/orchestrator.js",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:parse": "jest --testMatch='**/parse-test-results.test.ts'",
    "test:gate": "jest --testMatch='**/gate-check.test.ts'",
    "test:phase1": "jest --testMatch='**/{parse-test-results,gate-check}.test.ts'",
    "lint": "eslint src --ext .ts",
    "clean": "rm -rf dist coverage"
  },
  "dependencies": {
    "redis": "^4.6.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^18.0.0",
    "@typescript-eslint/eslint-plugin": "^5.0.0",
    "@typescript-eslint/parser": "^5.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0"
  }
}
```

---

## Step 5: Update tsconfig.json

### File Location
```
.claude/skills/cfn-loop-orchestration/tsconfig.json
```

### Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

---

## Step 6: Update jest.config.js

### File Location
```
.claude/skills/cfn-loop-orchestration/jest.config.js
```

### Configuration

```javascript
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**",
    "!src/types.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testTimeout: 10000,
  globals: {
    "ts-jest": {
      tsconfig: {
        strict: true,
      },
    },
  },
};
```

---

## Phase 1 Execution Checklist

### Setup (0.5 hours)
- [ ] Create directory structure
  ```bash
  mkdir -p .claude/skills/cfn-loop-orchestration/src/__tests__
  ```
- [ ] Create TypeScript configuration files
  - [ ] Copy tsconfig.json
  - [ ] Copy jest.config.js
  - [ ] Update package.json

### Implementation (2.5 hours)
- [ ] Create parse-test-results.ts (240 LOC)
  - [ ] Type definitions
  - [ ] Jest parser
  - [ ] TAP fallback
  - [ ] CLI entry point
- [ ] Create gate-check.ts (245 LOC)
  - [ ] Type definitions
  - [ ] Mode thresholds
  - [ ] Decision logic
  - [ ] CLI entry point

### Testing (1 hour)
- [ ] Write unit tests for parse-test-results
  - [ ] Fixtures for pass/fail/timeout cases
  - [ ] Edge cases (empty, no tests)
  - [ ] Both Jest and TAP formats
- [ ] Write unit tests for gate-check
  - [ ] All modes (mvp, standard, enterprise)
  - [ ] Boundary conditions
  - [ ] Metrics calculation

### Integration (0.5 hours)
- [ ] Create invoke-redis.sh wrapper
- [ ] Verify it can call compiled TS modules
- [ ] Test from orchestrate.sh

### Validation (0.5 hours)
```bash
# Build
cd .claude/skills/cfn-loop-orchestration
npm install
npm run build

# Test
npm run test:phase1

# Verify output
npm test -- --verbose

# Check wrapper
./invoke-redis.sh get-context --help 2>&1 || echo "Wrapper works (expected error)"
```

---

## Expected Output After Phase 1

### Terminal Output
```
PASS  src/__tests__/parse-test-results.test.ts
  parseTestResults
    ✓ should parse Jest JSON format correctly (15ms)
    ✓ should calculate passRate with 3 decimal places (5ms)
    ✓ should handle all tests passing (3ms)
    ✓ should handle all tests failing (2ms)
    ✓ should handle no tests found (2ms)
    ✓ should extract failed test details (8ms)
    ✓ should gracefully handle invalid JSON (12ms)
    ✓ should parse TAP format as fallback (4ms)

PASS  src/__tests__/gate-check.test.ts
  checkGate
    MVP mode (70% threshold)
      ✓ should PROCEED when pass rate meets threshold (4ms)
      ✓ should ITERATE when pass rate below threshold (2ms)
    Standard mode (95% threshold)
      ✓ should PROCEED when pass rate meets threshold (2ms)
    Enterprise mode (98% threshold)
      ✓ should require very high pass rate (2ms)
    Metrics calculation
      ✓ should calculate positive gap for passing threshold (1ms)
    Reason messages
      ✓ should provide actionable message for PROCEED (2ms)
      ✓ should provide actionable message for ITERATE (1ms)

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
Time:        2.345 s
```

### File Structure
```
.claude/skills/cfn-loop-orchestration/
├── src/
│   ├── parse-test-results.ts         ✅ CREATED
│   ├── gate-check.ts                 ✅ CREATED
│   ├── types.ts                      ✅ (types used by above)
│   └── __tests__/
│       ├── parse-test-results.test.ts ✅ CREATED
│       └── gate-check.test.ts        ✅ CREATED
├── dist/
│   ├── parse-test-results.js         ✅ COMPILED
│   ├── parse-test-results.d.ts       ✅ COMPILED
│   ├── gate-check.js                 ✅ COMPILED
│   ├── gate-check.d.ts               ✅ COMPILED
│   └── ...
├── invoke-redis.sh                   ✅ CREATED
├── package.json                      ✅ UPDATED
├── tsconfig.json                     ✅ CREATED
├── jest.config.js                    ✅ CREATED
└── orchestrate.sh                    (unchanged, calls new wrapper in Phase 3)
```

---

## Next Steps After Phase 1

1. **Verify Integration:**
   ```bash
   # Test that orchestrate.sh can use new modules
   ./invoke-redis.sh get-context --task-id test-001 --key "iteration" 2>&1
   ```

2. **Review for Phase 2:**
   - gate-check.ts is solid
   - spawn-agents.ts depends on nothing (can start immediately)
   - iteration-manager.ts depends on context manager (already TS)

3. **Document Learnings:**
   - Any TypeScript compilation issues
   - Performance characteristics
   - Integration points with orchestrate.sh

---

**Estimated Time: 4 hours**
**Lines of Code: 500**
**Test Coverage: 80%+**
**Next Phase Blocker:** None (can start Phase 2 immediately)
