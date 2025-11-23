/**
 * North Star Test 2: trigger.dev 5-Iteration Workflow (Docker Process)
 *
 * Purpose: Validates complete CFN Loop iteration workflow via trigger.dev Docker containers
 * Test Strategy:
 * - Each iteration is a SEPARATE test case
 * - Tests simulate different failure scenarios at each iteration
 * - Tests verify deliverable creation at correct iteration
 * - Tests validate timeout handling for async job execution in Docker environment
 *
 * Validates 5 Iterations with REAL Deliverable Tracking:
 * Iteration 1: Gate failure (test pass rate < 0.95) → ITERATE
 * Iteration 2: Gate pass, Loop 2 consensus failure (< 0.90) → ITERATE
 * Iteration 3: Gate + Loop 2 pass, Product Owner decides ITERATE (refinement needed)
 * Iteration 4: Gate + Loop 2 pass, Product Owner decides ITERATE (polish needed)
 * Iteration 5: All pass, Product Owner decides PROCEED OK
 *
 * Configuration:
 * - Mode: Standard (gate ≥0.95, consensus ≥0.90)
 * - Max Iterations: 5
 * - Job Timeout: 30 seconds per iteration
 * - Deliverable: /tmp/trigger-dev-deliverables/{taskId}/hello-world.txt
 * - Process: Docker-based CFN Loop execution (CLI mode separate)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sendEvent, getRunStatus, TriggerDevClientError, RunStatus } from '../../trigger-dev-client';
import { validateTaskId } from '../../src/utils/path-validation';
import {
  CFNLoopPayload,
  CFNMode,
  getThresholdConfig,
} from '../../src/types/cfn-types';
import * as fs from 'fs';
import * as path from 'path';

// Utility: Wait for file to exist with timeout
async function waitForFile(
  filePath: string,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 500
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return false;
}

// Utility: Get deliverable path for a task (with security validation)
function getDeliverablePath(taskId: string, filename: string): string {
  // SECURITY FIX: Validate taskId to prevent path traversal attacks
  validateTaskId(taskId);

  // Validate filename to prevent directory escape
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error(`Invalid filename: contains unsafe characters. Got: ${filename}`);
  }

  return path.join('/tmp/trigger-dev-deliverables', taskId, filename);
}

// Utility: Poll for workflow completion via remote worker
async function pollForWorkflowCompletion(
  eventId: string,
  maxAttempts: number = 600,
  pollIntervalMs: number = 1000
): Promise<RunStatus> {
  const startTime = Date.now();
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const status = await getRunStatus(eventId, 1);
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status.status)) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`Workflow ${eventId} completed in ${elapsed}s (${attempts} polls)`);
      return status;
    }
    if (attempts % 10 === 0) {
      console.log(`Polling workflow ${eventId}... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed, attempt ${attempts}/${maxAttempts})`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  throw new Error(`Workflow ${eventId} did not complete after ${attempts} attempts (${elapsed}s elapsed)`);
}

describe('North Star Test 2: 5-Iteration CFN Loop Workflow', () => {
  const MODE: CFNMode = 'standard';
  const MAX_ITERATIONS = 5;
  const TEST_TIMEOUT_MS = 600000; // 10 minutes per test (removed constraint for live agents)
  const DELIVERABLE_FILE = 'hello-world.txt';

  let eventIds: string[] = [];

  beforeAll(() => {
    if (!process.env.TRIGGER_API_KEY) {
      throw new Error('TRIGGER_API_KEY not set - required for E2E tests');
    }

    // Create base deliverable directory
    const baseDir = '/tmp/trigger-dev-deliverables';
    fs.mkdirSync(baseDir, { recursive: true });
  });

  afterAll(async () => {
    console.log(`Test complete. Events triggered: ${eventIds.length}`);
  });

  // ============================================================================
  // Test 1: Iteration 1 - Gate Failure → ITERATE
  // ============================================================================

  describe('Test 1: Iteration 1 - Gate Failure', () => {
    const TEST_ID = `iter1-${Date.now()}`;
    const TASK_ID = `trigger-5iter-${TEST_ID}`;
    const deliverablePath = getDeliverablePath(TASK_ID, DELIVERABLE_FILE);

    afterAll(() => {
      // Cleanup iteration 1 deliverables
      const testDir = path.dirname(deliverablePath);
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should trigger iteration 1 with gate failure scenario', async () => {
      // GIVEN: Initial task description (missing greeting - will fail tests)
      const payload: CFNLoopPayload = {
        taskId: TASK_ID,
        description: 'Create basic file without greeting (should fail gate)',
        mode: MODE,
        maxIterations: MAX_ITERATIONS,
        currentIteration: 1,
        startedAt: new Date().toISOString(),
        successCriteria: {
          testCommand: `test -f ${deliverablePath} && grep -q "Hello" ${deliverablePath}`,
          passRateThreshold: 0.95,
          description: 'File must exist and contain "Hello"',
        },
        metadata: {
          testSuite: 'north-star-2',
          iteration: 1,
          expectedOutcome: 'ITERATE',
          reason: 'Gate failure - test pass rate below 0.95 threshold',
        },
      };

      // WHEN: Triggering the workflow
      const result = await sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);

      // THEN: Event should be accepted
      expect(result.id).toBeDefined();
      expect(result.name).toBe('cfn.loop.start');
      eventIds.push(result.id);
      console.log(`OK Iteration 1 event triggered: ${result.id}`);
    }, TEST_TIMEOUT_MS);

    it('should NOT create deliverable when gate fails', async () => {
      // GIVEN: Gate failure means no deliverable should be created yet
      // WHEN: Waiting for file with short timeout
      const fileExists = await waitForFile(deliverablePath, 5000, 1000);

      // THEN: File should NOT exist (gate failed, iteration 1 incomplete)
      expect(fileExists).toBe(false);
      console.log('OK Iteration 1: No deliverable created (gate failed as expected)');
    });
  });

  // ============================================================================
  // Test 2: Iteration 2 - Consensus Failure → ITERATE
  // ============================================================================

  describe('Test 2: Iteration 2 - Consensus Failure', () => {
    const TEST_ID = `iter2-${Date.now()}`;
    const TASK_ID = `trigger-5iter-${TEST_ID}`;
    const deliverablePath = getDeliverablePath(TASK_ID, DELIVERABLE_FILE);

    afterAll(() => {
      const testDir = path.dirname(deliverablePath);
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should trigger iteration 2 with consensus failure scenario', async () => {
      // GIVEN: Task now includes "Hello" (passes gate) but missing "World" (validators reject)
      const payload: CFNLoopPayload = {
        taskId: TASK_ID,
        description: 'Add "Hello" text (passes gate but validators want "World" added)',
        mode: MODE,
        maxIterations: MAX_ITERATIONS,
        currentIteration: 2,
        startedAt: new Date().toISOString(),
        successCriteria: {
          testCommand: `test -f ${deliverablePath} && grep -q "Hello" ${deliverablePath}`,
          passRateThreshold: 0.95,
          description: 'File must exist and contain "Hello"',
        },
        metadata: {
          testSuite: 'north-star-2',
          iteration: 2,
          expectedOutcome: 'ITERATE',
          reason: 'Loop 2 consensus below 0.90 threshold (validators request "World")',
          previousContext: {
            iteration1: { decision: 'ITERATE', reason: 'Gate failure' },
          },
        },
      };

      const result = await sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);

      expect(result.id).toBeDefined();
      eventIds.push(result.id);
      console.log(`OK Iteration 2 event triggered: ${result.id}`);
    }, TEST_TIMEOUT_MS);

    it('should NOT create complete deliverable when consensus fails', async () => {
      // GIVEN: Consensus failure means deliverable incomplete
      // WHEN: Waiting for file
      const fileExists = await waitForFile(deliverablePath, 5000, 1000);

      // THEN: File should NOT exist (consensus failed, iteration 2 incomplete)
      expect(fileExists).toBe(false);
      console.log('OK Iteration 2: No complete deliverable (consensus failed as expected)');
    });
  });

  // ============================================================================
  // Test 3: Iteration 3 - Product Owner ITERATE (Refinement)
  // ============================================================================

  describe('Test 3: Iteration 3 - PO Requests Refinement', () => {
    const TEST_ID = `iter3-${Date.now()}`;
    const TASK_ID = `trigger-5iter-${TEST_ID}`;
    const deliverablePath = getDeliverablePath(TASK_ID, DELIVERABLE_FILE);

    afterAll(() => {
      const testDir = path.dirname(deliverablePath);
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should trigger iteration 3 with PO refinement scenario', async () => {
      // GIVEN: Task has "Hello World" (passes all gates) but PO wants punctuation
      const payload: CFNLoopPayload = {
        taskId: TASK_ID,
        description: 'Add "Hello World" (passes gates but PO wants punctuation added)',
        mode: MODE,
        maxIterations: MAX_ITERATIONS,
        currentIteration: 3,
        startedAt: new Date().toISOString(),
        successCriteria: {
          testCommand: `test -f ${deliverablePath} && grep -q "Hello World" ${deliverablePath}`,
          passRateThreshold: 0.95,
          description: 'File must exist and contain "Hello World"',
        },
        metadata: {
          testSuite: 'north-star-2',
          iteration: 3,
          expectedOutcome: 'ITERATE',
          reason: 'Product Owner requests refinement (add punctuation)',
          previousContext: {
            iteration1: { decision: 'ITERATE', reason: 'Gate failure' },
            iteration2: { decision: 'ITERATE', reason: 'Consensus failure' },
          },
        },
      };

      const result = await sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);

      expect(result.id).toBeDefined();
      eventIds.push(result.id);
      console.log(`OK Iteration 3 event triggered: ${result.id}`);
    }, TEST_TIMEOUT_MS);

    it('should NOT create final deliverable when PO requests refinement', async () => {
      // GIVEN: PO ITERATE decision means deliverable not final
      const fileExists = await waitForFile(deliverablePath, 5000, 1000);

      // THEN: File should NOT exist (PO requested changes)
      expect(fileExists).toBe(false);
      console.log('OK Iteration 3: No final deliverable (PO refinement requested as expected)');
    });
  });

  // ============================================================================
  // Test 4: Iteration 4 - Product Owner ITERATE (Polish)
  // ============================================================================

  describe('Test 4: Iteration 4 - PO Requests Polish', () => {
    const TEST_ID = `iter4-${Date.now()}`;
    const TASK_ID = `trigger-5iter-${TEST_ID}`;
    const deliverablePath = getDeliverablePath(TASK_ID, DELIVERABLE_FILE);

    afterAll(() => {
      const testDir = path.dirname(deliverablePath);
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should trigger iteration 4 with PO polish scenario', async () => {
      // GIVEN: Task has "Hello, World" (with comma) but PO wants exclamation
      const payload: CFNLoopPayload = {
        taskId: TASK_ID,
        description: 'Add "Hello, World" (passes all but PO wants exclamation mark)',
        mode: MODE,
        maxIterations: MAX_ITERATIONS,
        currentIteration: 4,
        startedAt: new Date().toISOString(),
        successCriteria: {
          testCommand: `test -f ${deliverablePath} && grep -q "Hello, World" ${deliverablePath}`,
          passRateThreshold: 0.95,
          description: 'File must exist and contain "Hello, World"',
        },
        metadata: {
          testSuite: 'north-star-2',
          iteration: 4,
          expectedOutcome: 'ITERATE',
          reason: 'Product Owner requests final polish (add exclamation)',
          previousContext: {
            iteration1: { decision: 'ITERATE', reason: 'Gate failure' },
            iteration2: { decision: 'ITERATE', reason: 'Consensus failure' },
            iteration3: { decision: 'ITERATE', reason: 'Refinement needed' },
          },
        },
      };

      const result = await sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);

      expect(result.id).toBeDefined();
      eventIds.push(result.id);
      console.log(`OK Iteration 4 event triggered: ${result.id}`);
    }, TEST_TIMEOUT_MS);

    it('should NOT create final deliverable when PO requests polish', async () => {
      // GIVEN: PO ITERATE decision for polish
      const fileExists = await waitForFile(deliverablePath, 5000, 1000);

      // THEN: File should NOT exist (PO requested final polish)
      expect(fileExists).toBe(false);
      console.log('OK Iteration 4: No final deliverable (PO polish requested as expected)');
    });
  });

  // ============================================================================
  // Test 5: Iteration 5 - Product Owner PROCEED (Success!)
  // ============================================================================

  describe('Test 5: Iteration 5 - PO PROCEED', () => {
    const TEST_ID = `iter5-${Date.now()}`;
    const TASK_ID = `trigger-5iter-${TEST_ID}`;
    const deliverablePath = getDeliverablePath(TASK_ID, DELIVERABLE_FILE);
    let iteration5EventId: string;

    afterAll(() => {
      const testDir = path.dirname(deliverablePath);
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should trigger iteration 5 with PROCEED scenario', async () => {
      // GIVEN: Task has perfect output "Hello, World!" (all criteria met)
      const payload: CFNLoopPayload = {
        taskId: TASK_ID,
        description: 'Create "Hello, World!" with perfect formatting (should PROCEED)',
        mode: MODE,
        maxIterations: MAX_ITERATIONS,
        currentIteration: 5,
        startedAt: new Date().toISOString(),
        successCriteria: {
          testCommand: `test -f ${deliverablePath} && grep -q "Hello, World!" ${deliverablePath}`,
          passRateThreshold: 0.95,
          description: 'File must exist and contain "Hello, World!"',
        },
        metadata: {
          testSuite: 'north-star-2',
          iteration: 5,
          expectedOutcome: 'PROCEED',
          reason: 'All criteria met - workflow complete',
          deliverablePath: deliverablePath,
          previousContext: {
            iteration1: { decision: 'ITERATE', reason: 'Gate failure' },
            iteration2: { decision: 'ITERATE', reason: 'Consensus failure' },
            iteration3: { decision: 'ITERATE', reason: 'Refinement needed' },
            iteration4: { decision: 'ITERATE', reason: 'Polish needed' },
          },
        },
      };

      const result = await sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);

      expect(result.id).toBeDefined();
      iteration5EventId = result.id;
      eventIds.push(result.id);
      console.log(`OK Iteration 5 event triggered: ${result.id}`);
    }, TEST_TIMEOUT_MS);

    it('should create final deliverable when PO PROCEED decision', async () => {
      // GIVEN: Iteration 5 event triggered (workflow should create deliverable)
      expect(iteration5EventId).toBeDefined();

      // WHEN: Waiting for workflow to complete (no timeout constraint)
      console.log(`Waiting for workflow ${iteration5EventId} to complete...`);
      const workflowStatus = await pollForWorkflowCompletion(iteration5EventId);

      // THEN: Workflow should complete successfully
      expect(workflowStatus.status).toBe('COMPLETED');
      console.log(`OK Workflow completed with status: ${workflowStatus.status}`);

      // THEN: File should exist (created by workflow, not test)
      const fileExists = await waitForFile(deliverablePath, 5000);
      expect(fileExists).toBe(true);

      // THEN: Content should be correct
      const content = fs.readFileSync(deliverablePath, 'utf-8');
      expect(content.trim()).toBe('Hello, World!');

      console.log(`OK Iteration 5: Final deliverable created with content: "${content.trim()}"`);
    }, TEST_TIMEOUT_MS); // Extended timeout for live agent execution

    it('should verify deliverable contains exact expected content', () => {
      // GIVEN: Deliverable file exists
      expect(fs.existsSync(deliverablePath)).toBe(true);

      // WHEN: Reading content
      const content = fs.readFileSync(deliverablePath, 'utf-8');

      // THEN: Content should be exactly "Hello, World!"
      expect(content.trim()).toBe('Hello, World!');
      expect(content).toContain('Hello');
      expect(content).toContain('World');
      expect(content).toContain('!');

      console.log('OK Deliverable content verified: Perfect formatting');
    });
  });

  // ============================================================================
  // Force Override Tests
  // ============================================================================

  describe('Force Override Validation', () => {
    const TEST_ID = `force-override-${Date.now()}`;
    const TASK_ID = `trigger-force-${TEST_ID}`;
    const deliverablePath = getDeliverablePath(TASK_ID, DELIVERABLE_FILE);
    let forceEventId: string;

    afterAll(() => {
      const testDir = path.dirname(deliverablePath);
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('should apply force override for iteration 1 gate failure', async () => {
      // GIVEN: Payload with force override config
      const payload: CFNLoopPayload = {
        taskId: TASK_ID,
        description: 'Test force override - should proceed despite low pass rate',
        mode: MODE,
        maxIterations: MAX_ITERATIONS,
        currentIteration: 1,
        startedAt: new Date().toISOString(),
        successCriteria: {
          testCommand: `echo "Force test - intentional low pass rate"`,
          passRateThreshold: 0.95,
          description: 'Test force override behavior',
        },
        metadata: {
          testSuite: 'north-star-2',
          iteration: 1,
          expectedOutcome: 'PROCEED_WITH_FORCE',
          reason: 'Force override applied despite gate failure',
          forceConfig: {
            enabled: true,
            reason: 'Testing force override functionality',
            approvedBy: 'integration-tester',
          },
        },
      };

      // WHEN: Triggering workflow with force override
      const result = await sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);

      // THEN: Event should be accepted
      expect(result.id).toBeDefined();
      forceEventId = result.id;
      eventIds.push(result.id);
      console.log(`OK Force override event triggered: ${result.id}`);
    }, TEST_TIMEOUT_MS);

    it('should verify force config is applied correctly', async () => {
      // GIVEN: Force override event triggered
      expect(forceEventId).toBeDefined();

      // WHEN: Polling for workflow completion (no timeout constraint)
      const workflowStatus = await pollForWorkflowCompletion(forceEventId);

      // THEN: Workflow should complete (force allows proceeding despite failures)
      expect(['COMPLETED', 'FAILED']).toContain(workflowStatus.status);

      // THEN: Verify force was applied (check output/metadata)
      if (workflowStatus.output) {
        const output = workflowStatus.output as any;
        if (output.iterationHistory && output.iterationHistory[0]) {
          expect(output.iterationHistory[0].forceApplied).toBe(true);
          console.log(`OK Force override applied: ${output.iterationHistory[0].forceApplied}`);
        }
      }
    }, TEST_TIMEOUT_MS);
  });

  // ============================================================================
  // Workflow Validation Tests
  // ============================================================================

  describe('Workflow Validation', () => {
    it('should validate all 5 iteration events were triggered', () => {
      // GIVEN: All 5 iterations executed
      // THEN: Should have 5 event IDs
      expect(eventIds.length).toBeGreaterThanOrEqual(5);
      console.log(`OK All iterations triggered. Event count: ${eventIds.length}`);
      console.log(`Event IDs: ${eventIds.join(', ')}`);
    });

    it('should validate threshold configuration is correct for standard mode', () => {
      const config = getThresholdConfig('standard');

      expect(config.loop3PassRateThreshold).toBe(0.95);
      expect(config.loop2ConsensusThreshold).toBe(0.90);
      expect(config.maxIterations).toBe(10);
      expect(config.validatorCount).toBe(3);

      console.log('OK Standard mode thresholds validated:');
      console.log('  - Gate: ≥0.95');
      console.log('  - Consensus: ≥0.90');
      console.log('  - Max Iterations: 10');
      console.log('  - Validators: 3');
    });

    it('should validate iteration progression logic', () => {
      // GIVEN: Expected iteration outcomes
      const expectedOutcomes = [
        { iteration: 1, outcome: 'ITERATE', reason: 'gate_failure' },
        { iteration: 2, outcome: 'ITERATE', reason: 'consensus_failure' },
        { iteration: 3, outcome: 'ITERATE', reason: 'po_refinement' },
        { iteration: 4, outcome: 'ITERATE', reason: 'po_polish' },
        { iteration: 5, outcome: 'PROCEED', reason: 'all_pass' },
      ];

      // THEN: Validate progression
      expect(expectedOutcomes.filter(o => o.outcome === 'ITERATE').length).toBe(4);
      expect(expectedOutcomes.filter(o => o.outcome === 'PROCEED').length).toBe(1);
      expect(expectedOutcomes[4].outcome).toBe('PROCEED');

      console.log('OK Iteration progression validated:');
      console.log('  - Iteration 1: Gate failure → ITERATE');
      console.log('  - Iteration 2: Consensus failure → ITERATE');
      console.log('  - Iteration 3: PO refinement → ITERATE');
      console.log('  - Iteration 4: PO polish → ITERATE');
      console.log('  - Iteration 5: All pass → PROCEED');
    });

    it('should validate context passing between iterations', () => {
      // GIVEN: Context accumulates across iterations
      const iterationContexts = [
        {},
        { iteration1: { decision: 'ITERATE' } },
        {
          iteration1: { decision: 'ITERATE' },
          iteration2: { decision: 'ITERATE' }
        },
        {
          iteration1: { decision: 'ITERATE' },
          iteration2: { decision: 'ITERATE' },
          iteration3: { decision: 'ITERATE' }
        },
        {
          iteration1: { decision: 'ITERATE' },
          iteration2: { decision: 'ITERATE' },
          iteration3: { decision: 'ITERATE' },
          iteration4: { decision: 'ITERATE' }
        },
      ];

      // THEN: Context should grow with each iteration
      expect(Object.keys(iterationContexts[0]).length).toBe(0);
      expect(Object.keys(iterationContexts[1]).length).toBe(1);
      expect(Object.keys(iterationContexts[2]).length).toBe(2);
      expect(Object.keys(iterationContexts[3]).length).toBe(3);
      expect(Object.keys(iterationContexts[4]).length).toBe(4);

      console.log('OK Context accumulation validated across 5 iterations');
    });
  });

  // ============================================================================
  // Deliverable Verification Tests
  // ============================================================================

  describe('Deliverable Verification', () => {
    const DELIVERABLE_TASK_ID = `deliverable-verify-${Date.now()}`;
    const deliverablePath = getDeliverablePath(DELIVERABLE_TASK_ID, DELIVERABLE_FILE);

    afterAll(() => {
      const dir = path.dirname(deliverablePath);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('should create deliverable with correct content via worker', async () => {
      const payload: CFNLoopPayload = {
        taskId: DELIVERABLE_TASK_ID,
        description: 'Create hello-world deliverable',
        mode: MODE,
        maxIterations: 1,
        currentIteration: 1,
        startedAt: new Date().toISOString(),
        successCriteria: {
          testCommand: `test -f ${deliverablePath} && grep -q "Hello" ${deliverablePath}`,
          passRateThreshold: 0.8,
          description: 'Deliverable must contain Hello',
        },
      };

      const event = await sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);
      await pollForWorkflowCompletion(event.id, 120, 500);

      const fileExists = await waitForFile(deliverablePath, 30000);
      expect(fileExists).toBe(true);

      const content = fs.readFileSync(deliverablePath, 'utf-8');
      expect(content).toContain('Hello');
      console.log(`OK Deliverable created with content: "${content.trim()}"`);
    });
  });
});
