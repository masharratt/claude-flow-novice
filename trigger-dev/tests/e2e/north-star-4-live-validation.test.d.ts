/**
 * North Star Test 4: Live Agent Validation
 *
 * Purpose: Validates live agent execution with file-based deliverable verification
 * This test triggers real workflows and validates output files are created.
 *
 * Requirements:
 * - trigger.dev server running at localhost:3040
 * - Worker endpoint responding at localhost:3000/api/trigger
 * - TRIGGER_API_KEY set
 *
 * Validation Strategy:
 * 1. Send cfn.loop.start event
 * 2. Poll trigger.dev dashboard API for run status
 * 3. Verify deliverable files created
 */
export {};
//# sourceMappingURL=north-star-4-live-validation.test.d.ts.map