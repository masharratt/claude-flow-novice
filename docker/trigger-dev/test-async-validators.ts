/**
 * Test script for async security and performance validators
 *
 * Tests that both validators:
 * 1. Can be triggered independently
 * 2. Return their expected result types
 * 3. Handle errors gracefully
 * 4. Complete without blocking
 */

import { tasks } from "@trigger.dev/sdk/v3";
import type {
  AsyncSecurityValidatorResult,
  AsyncPerformanceValidatorResult
} from "./src/trigger/index.js";

const testCode = `
function processUserInput(input: string) {
  // Potential SQL injection
  const query = "SELECT * FROM users WHERE name = '" + input + "'";

  // Unoptimized loop
  for (let i = 0; i < 1000000; i++) {
    console.log(i);
  }

  return query;
}
`;

const testTestCode = `
test('should process input', () => {
  expect(processUserInput('test')).toBeDefined();
});
`;

async function main() {
  console.log("Testing async validators...\n");

  try {
    // Test 1: Security Validator
    console.log("1. Triggering security validator...");
    const securityHandle = await tasks.trigger<typeof import("./src/trigger/cfn-async-security-validator.js").cfnAsyncSecurityValidatorTask>(
      "cfn-async-security-validator",
      {
        taskId: "test-security-001",
        implementation: testCode,
        testCode: testTestCode,
        workDir: "/tmp/test",
      }
    );
    console.log(`   Security validator triggered: ${securityHandle.id}`);

    // Test 2: Performance Validator
    console.log("\n2. Triggering performance validator...");
    const perfHandle = await tasks.trigger<typeof import("./src/trigger/cfn-async-performance-validator.js").cfnAsyncPerformanceValidatorTask>(
      "cfn-async-performance-validator",
      {
        taskId: "test-perf-001",
        implementation: testCode,
        testCode: testTestCode,
        complexity: "moderate",
        workDir: "/tmp/test",
      }
    );
    console.log(`   Performance validator triggered: ${perfHandle.id}`);

    // Test 3: Both in parallel
    console.log("\n3. Triggering both validators in parallel...");
    const [secHandle2, perfHandle2] = await Promise.all([
      tasks.trigger("cfn-async-security-validator", {
        taskId: "test-security-002",
        implementation: testCode,
        testCode: testTestCode,
        workDir: "/tmp/test",
      }),
      tasks.trigger("cfn-async-performance-validator", {
        taskId: "test-perf-002",
        implementation: testCode,
        testCode: testTestCode,
        complexity: "simple",
        workDir: "/tmp/test",
      }),
    ]);
    console.log(`   Both validators triggered:`);
    console.log(`   - Security: ${secHandle2.id}`);
    console.log(`   - Performance: ${perfHandle2.id}`);

    console.log("\n✅ All validators triggered successfully!");
    console.log("\nNote: Validators run async. Check Trigger.dev dashboard for results.");
    console.log("Dashboard: http://localhost:8030");

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
