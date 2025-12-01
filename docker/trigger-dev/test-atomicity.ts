/**
 * MDAP Atomicity Analyzer Test
 *
 * Tests the atomicity detection and decomposition logic.
 * Run with: npx tsx test-atomicity.ts
 */

import {
  analyzeAtomicity,
  enforceAtomicity,
  getAtomicitySummary,
} from "./src/lib/mdap-atomicity.js";

import {
  processTaskWithAtomicity,
  needsDecomposition,
  getAtomicityScore,
} from "./src/lib/mdap-config.js";

// =============================================
// Test Cases
// =============================================

const TEST_CASES = {
  // Atomic tasks (should pass)
  atomic: [
    "Create TypeScript interface for User props",
    "Add email validation to the signup form",
    "Fix missing return type on getUser function",
    "Remove unused import from utils.ts",
    "Update button color to primary blue",
    "Add loading spinner to AgentStatusGrid component",
  ],

  // Non-atomic tasks (should be decomposed)
  nonAtomic: [
    "Build a dashboard component",
    "Create the user authentication system",
    "Build AgentStatusGrid component and add real-time updates",
    "Implement login form with validation and error handling",
    "Add user registration, email verification, and password reset",
    "Set up the API endpoints for the dashboard",
    "Create multiple components for the admin panel",
    "Handle all form submissions across the application",
    "Integrate with the backend API and update the UI",
  ],

  // Edge cases
  edgeCases: [
    "Fix bug", // Too vague
    "Add feature", // Too vague
    "Create AgentStatusGrid.tsx", // File mention but no action
    "Add prop and update tests", // Multiple actions
    "Refactor the entire module", // Vague scope
  ],
};

// =============================================
// Test Runner
// =============================================

function runTests() {
  console.log("=".repeat(80));
  console.log("MDAP Atomicity Analyzer Test Suite");
  console.log("=".repeat(80));

  let passed = 0;
  let failed = 0;

  // Test atomic tasks
  console.log("\n## Testing Atomic Tasks (should all be atomic)\n");
  for (const task of TEST_CASES.atomic) {
    const analysis = analyzeAtomicity(task);
    const status = analysis.isAtomic ? "✅ PASS" : "❌ FAIL";

    if (analysis.isAtomic) passed++;
    else failed++;

    console.log(`${status}: "${task.slice(0, 50)}..."`);
    console.log(`       Score: ${(analysis.confidence * 100).toFixed(0)}%, Lines: ~${analysis.estimatedLines}`);

    if (!analysis.isAtomic) {
      console.log(`       Violations: ${analysis.violationDetails.join("; ")}`);
    }
    console.log();
  }

  // Test non-atomic tasks
  console.log("\n## Testing Non-Atomic Tasks (should all be decomposed)\n");
  for (const task of TEST_CASES.nonAtomic) {
    const analysis = analyzeAtomicity(task);
    const status = !analysis.isAtomic ? "✅ PASS" : "❌ FAIL";

    if (!analysis.isAtomic) passed++;
    else failed++;

    console.log(`${status}: "${task.slice(0, 50)}..."`);
    console.log(`       ${getAtomicitySummary(analysis)}`);

    if (!analysis.isAtomic && analysis.suggestedDecomposition.length > 0) {
      console.log(`       Suggested micro-tasks:`);
      analysis.suggestedDecomposition.slice(0, 3).forEach((mt, i) => {
        console.log(`         ${i + 1}. ${mt.description.slice(0, 60)}...`);
      });
      if (analysis.suggestedDecomposition.length > 3) {
        console.log(`         ... and ${analysis.suggestedDecomposition.length - 3} more`);
      }
    }
    console.log();
  }

  // Test edge cases
  console.log("\n## Testing Edge Cases\n");
  for (const task of TEST_CASES.edgeCases) {
    const analysis = analyzeAtomicity(task);
    const score = getAtomicityScore(task);

    console.log(`Task: "${task}"`);
    console.log(`  Atomic: ${analysis.isAtomic}, Score: ${(score * 100).toFixed(0)}%`);
    console.log(`  Violations: ${analysis.violations.length > 0 ? analysis.violations.join(", ") : "none"}`);
    console.log(`  Summary: ${getAtomicitySummary(analysis)}`);
    console.log();
  }

  // Test full decomposition pipeline
  console.log("\n## Testing Full Decomposition Pipeline\n");
  const complexTask = "Build an AgentStatusGrid component with real-time updates and filtering";
  console.log(`Input: "${complexTask}"\n`);

  const decomposition = processTaskWithAtomicity(complexTask, 'zai', false);

  console.log(`Was Decomposed: ${decomposition.wasDecomposed}`);
  console.log(`Original Atomicity: ${decomposition.analysis.isAtomic ? "atomic" : "non-atomic"}`);
  console.log(`Violations: ${decomposition.analysis.violationDetails.join("; ") || "none"}`);
  console.log(`\nMicro-Tasks (${decomposition.microTasks.length}):`);

  decomposition.microTasks.forEach((mt, i) => {
    const tier = decomposition.recommendedTiers.get(mt.id);
    console.log(`  ${i + 1}. [${mt.action}] ${mt.description}`);
    console.log(`     File: ${mt.targetFile}`);
    console.log(`     Complexity: ${mt.complexity}, Tier: T${tier?.tier || 1}`);
    console.log(`     Est. Lines: ${mt.estimatedLines}`);
    if (mt.dependsOn.length > 0) {
      console.log(`     Depends on: ${mt.dependsOn.join(", ")}`);
    }
  });

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("Test Summary");
  console.log("=".repeat(80));
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log("=".repeat(80));

  return failed === 0;
}

// Run tests
const success = runTests();
process.exit(success ? 0 : 1);
