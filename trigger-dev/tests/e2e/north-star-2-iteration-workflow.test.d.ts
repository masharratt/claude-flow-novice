/**
 * North Star Test 2: trigger.dev 5-Iteration Workflow
 *
 * Purpose: Validates complete CFN Loop iteration workflow via trigger.dev
 * Replaces CLI mode test: test-cfn-loop-5-iteration-real-execution.sh
 *
 * Test Strategy:
 * - Each iteration is a SEPARATE test case
 * - Tests simulate different failure scenarios at each iteration
 * - Tests verify deliverable creation at correct iteration
 * - Tests validate timeout handling for async job execution
 *
 * Validates 5 Iterations with REAL Deliverable Tracking:
 * Iteration 1: Gate failure (test pass rate < 0.95) → ITERATE
 * Iteration 2: Gate pass, Loop 2 consensus failure (< 0.90) → ITERATE
 * Iteration 3: Gate + Loop 2 pass, Product Owner decides ITERATE (refinement needed)
 * Iteration 4: Gate + Loop 2 pass, Product Owner decides ITERATE (polish needed)
 * Iteration 5: All pass, Product Owner decides PROCEED ✅
 *
 * Configuration:
 * - Mode: Standard (gate ≥0.95, consensus ≥0.90)
 * - Max Iterations: 5
 * - Job Timeout: 30 seconds per iteration
 * - Deliverable: /tmp/trigger-dev-deliverables/{taskId}/hello-world.txt
 */
export {};
//# sourceMappingURL=north-star-2-iteration-workflow.test.d.ts.map