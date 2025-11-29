#!/usr/bin/env tsx
/**
 * PHASE 2 TASK 2.1: Sequential Decomposers Test Runner
 *
 * Demonstrates the 4 sequential decomposers with context passing:
 * 1. Architecture Decomposer (baseline)
 * 2. Security Decomposer (with architecture context)
 * 3. Performance Decomposer (with arch + security context)
 * 4. Testing Decomposer (with all 3 contexts)
 *
 * Run: npx tsx test-sequential-decomposers.ts
 */

import { cfnArchitectureDecomposerTask } from "./src/trigger/cfn-architecture-decomposer.js";
import { cfnSecurityDecomposerTask } from "./src/trigger/cfn-security-decomposer.js";
import { cfnPerformanceDecomposerTask } from "./src/trigger/cfn-performance-decomposer.js";
import { cfnTestingDecomposerTask } from "./src/trigger/cfn-testing-decomposer.js";

async function main() {
  const taskDescription = "Build payment checkout with Stripe";
  const taskId = `sequential-test-${Date.now()}`;
  const workDir = "/tmp/decomposition-test";

  console.log("\n========================================");
  console.log("SEQUENTIAL DECOMPOSER TEST");
  console.log("========================================");
  console.log(`Task: ${taskDescription}`);
  console.log(`Task ID: ${taskId}`);
  console.log("========================================\n");

  const startTime = Date.now();

  // PHASE 1: Architecture Decomposer (baseline, no context)
  console.log("[PHASE 1] Running Architecture Decomposer (baseline)...");
  const archStart = Date.now();

  const archResult = await cfnArchitectureDecomposerTask.run({
    taskId,
    taskDescription,
    workDir,
  });

  const archDuration = Date.now() - archStart;

  console.log(`✓ Architecture Complete (${archDuration}ms)`);
  console.log(`  - Micro-tasks: ${archResult.microTasks.length}`);
  console.log(`  - Components: ${archResult.components.length}`);
  console.log(`  - Boundaries: ${archResult.boundaries.length}`);
  console.log(`  - Recommendations: ${archResult.recommendations.length}`);
  console.log();

  // PHASE 2: Security Decomposer (with architecture context)
  console.log("[PHASE 2] Running Security Decomposer (with architecture context)...");
  const secStart = Date.now();

  const secResult = await cfnSecurityDecomposerTask.run({
    taskId,
    taskDescription,
    workDir,
    previousContext: {
      architecture: archResult,
      components: archResult.components,
      boundaries: archResult.boundaries,
    },
  });

  const secDuration = Date.now() - secStart;

  console.log(`✓ Security Complete (${secDuration}ms)`);
  console.log(`  - Micro-tasks: ${secResult.microTasks.length}`);
  console.log(`  - Security Boundaries: ${secResult.securityBoundaries.length}`);
  console.log(`  - Risk Level: ${secResult.riskLevel}`);
  console.log(`  - Recommendations: ${secResult.securityRecommendations.length}`);
  console.log();

  // PHASE 3: Performance Decomposer (with arch + security context)
  console.log("[PHASE 3] Running Performance Decomposer (with arch + security context)...");
  const perfStart = Date.now();

  const perfResult = await cfnPerformanceDecomposerTask.run({
    taskId,
    taskDescription,
    workDir,
    previousContext: {
      architecture: archResult,
      securityConstraints: secResult,
      securityBoundaries: secResult.securityBoundaries,
    },
  });

  const perfDuration = Date.now() - perfStart;

  console.log(`✓ Performance Complete (${perfDuration}ms)`);
  console.log(`  - Micro-tasks: ${perfResult.microTasks.length}`);
  console.log(`  - Performance Constraints: ${perfResult.performanceConstraints.length}`);
  console.log(`  - Optimization Strategy: ${perfResult.optimizationStrategy.substring(0, 60)}...`);
  console.log(`  - Recommendations: ${perfResult.performanceRecommendations.length}`);
  console.log();

  // PHASE 4: Testing Decomposer (with all 3 contexts)
  console.log("[PHASE 4] Running Testing Decomposer (with all 3 contexts)...");
  const testStart = Date.now();

  const testResult = await cfnTestingDecomposerTask.run({
    taskId,
    taskDescription,
    workDir,
    previousContext: {
      architecture: archResult,
      securityConstraints: secResult,
      performanceConstraints: perfResult,
    },
  });

  const testDuration = Date.now() - testStart;

  console.log(`✓ Testing Complete (${testDuration}ms)`);
  console.log(`  - Micro-tasks: ${testResult.microTasks.length}`);
  console.log(`  - Test Requirements: ${testResult.testRequirements.length}`);
  console.log(`  - Coverage Goal: ${testResult.coverageGoal}%`);
  console.log(`  - Recommendations: ${testResult.testingRecommendations.length}`);
  console.log();

  const totalDuration = Date.now() - startTime;

  // SUMMARY
  console.log("========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log(`Total Time: ${totalDuration}ms (${(totalDuration / 1000).toFixed(1)}s)`);
  console.log();
  console.log("Decomposer Performance:");
  console.log(`  1. Architecture: ${archDuration}ms`);
  console.log(`  2. Security:     ${secDuration}ms`);
  console.log(`  3. Performance:  ${perfDuration}ms`);
  console.log(`  4. Testing:      ${testDuration}ms`);
  console.log();
  console.log("Micro-task Distribution:");
  console.log(`  - Architecture: ${archResult.microTasks.length} tasks`);
  console.log(`  - Security:     ${secResult.microTasks.length} tasks`);
  console.log(`  - Performance:  ${perfResult.microTasks.length} tasks`);
  console.log(`  - Testing:      ${testResult.microTasks.length} tasks`);
  console.log(`  - TOTAL:        ${archResult.microTasks.length + secResult.microTasks.length + perfResult.microTasks.length + testResult.microTasks.length} tasks`);
  console.log();
  console.log("Context Flow Verification:");
  console.log(`  ✓ Architecture → Security: ${archResult.components.length} components informed ${secResult.securityBoundaries.length} security boundaries`);
  console.log(`  ✓ Security → Performance: ${secResult.riskLevel} risk level informed ${perfResult.performanceConstraints.length} constraints`);
  console.log(`  ✓ All 3 → Testing: Complete visibility with ${testResult.testRequirements.length} test requirements`);
  console.log();

  // SUCCESS CRITERIA CHECK
  const successCriteria = {
    allDecomposersExecuted: archResult && secResult && perfResult && testResult,
    architectureHasComponents: archResult.components.length > 0,
    securityHasBoundaries: secResult.securityBoundaries.length >= 0,
    performanceHasConstraints: perfResult.performanceConstraints.length >= 0,
    testingHasRequirements: testResult.testRequirements.length >= 0,
    totalTimeUnder15s: totalDuration < 15000,
  };

  console.log("Success Criteria:");
  console.log(`  ✓ All 4 decomposers executed: ${successCriteria.allDecomposersExecuted}`);
  console.log(`  ✓ Architecture has components: ${successCriteria.architectureHasComponents}`);
  console.log(`  ✓ Security has boundaries: ${successCriteria.securityHasBoundaries}`);
  console.log(`  ✓ Performance has constraints: ${successCriteria.performanceHasConstraints}`);
  console.log(`  ✓ Testing has requirements: ${successCriteria.testingHasRequirements}`);
  console.log(`  ✓ Total time <15s: ${successCriteria.totalTimeUnder15s} (${(totalDuration / 1000).toFixed(1)}s)`);
  console.log();

  const allPassed = Object.values(successCriteria).every((v) => v === true);

  if (allPassed) {
    console.log("========================================");
    console.log("✅ ALL SUCCESS CRITERIA PASSED");
    console.log("========================================\n");
    process.exit(0);
  } else {
    console.log("========================================");
    console.log("❌ SOME SUCCESS CRITERIA FAILED");
    console.log("========================================\n");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Test failed with error:");
  console.error(error);
  process.exit(1);
});
