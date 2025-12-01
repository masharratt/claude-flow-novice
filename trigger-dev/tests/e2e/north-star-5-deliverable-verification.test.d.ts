/**
 * North Star Test 5: Deliverable Verification
 *
 * Purpose: Verify that CFN Loop jobs produce REAL deliverables (files)
 * This test FAILS if no deliverable is created, PASSES if deliverable exists.
 *
 * The cfn-loop-workflow job writes to: /tmp/trigger-dev-deliverables/{taskId}/hello-world.txt
 * Since taskId is generated dynamically, we check for ANY new directory after triggering.
 */
export {};
//# sourceMappingURL=north-star-5-deliverable-verification.test.d.ts.map