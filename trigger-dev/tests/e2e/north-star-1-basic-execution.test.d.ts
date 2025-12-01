/**
 * North Star Test 1: trigger.dev Basic Execution
 *
 * Purpose: Validates complete trigger.dev CFN Loop execution pipeline
 * Replaces CLI mode test: test-cfn-loop-cli-real-execution.sh
 *
 * What It Validates:
 * 1. Event triggering via sendEvent('cfn.loop.start', payload)
 * 2. Workflow registration and execution
 * 3. Loop 3 agent spawning via cfn.agent.run events
 * 4. Gate check via cfn.gate.check events
 * 5. Loop 2 validator execution
 * 6. Product Owner decision (PROCEED/ITERATE/ABORT)
 * 7. REAL deliverable file creation at /tmp/trigger-dev-deliverables/{taskId}/
 *
 * Configuration:
 * - Mode: Standard (gate ≥0.95, consensus ≥0.90)
 * - Max Iterations: 2
 * - Timeout: 180 seconds
 */
export {};
//# sourceMappingURL=north-star-1-basic-execution.test.d.ts.map