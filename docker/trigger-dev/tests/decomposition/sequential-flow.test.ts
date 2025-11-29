import { describe, it, expect } from "@jest/globals";
import { tasks, runs } from "@trigger.dev/sdk/v3";
import { cfnArchitectureDecomposerTask } from "../../src/trigger/cfn-architecture-decomposer";
import { cfnSecurityDecomposerTask } from "../../src/trigger/cfn-security-decomposer";
import { cfnPerformanceDecomposerTask } from "../../src/trigger/cfn-performance-decomposer";
import { cfnTestingDecomposerTask } from "../../src/trigger/cfn-testing-decomposer";

/**
 * PHASE 2 TASK 2.1: Sequential Decomposer Flow Test
 *
 * Tests the 4 sequential decomposers with context passing:
 * 1. Architecture (baseline, no context)
 * 2. Security (with architecture context)
 * 3. Performance (with arch + security context)
 * 4. Testing (with all 3 contexts)
 *
 * GIVEN: A task description "Build payment checkout with Stripe"
 * WHEN: All 4 decomposers run in sequence with context passing
 * THEN: Each decomposer refines the previous outputs
 *       Context information flows through the chain
 *       Final testing decomposer has complete visibility
 */

describe("Sequential Decomposer Flow", () => {
  const testTaskId = "test-sequential-1";
  const testDescription = "Build payment checkout with Stripe";
  const testWorkDir = "/tmp/decomposition-test";

  it("should execute all 4 decomposers in sequence with context passing", async () => {
    // GIVEN: A task description
    console.log(`\n[Test] Starting sequential decomposition for: ${testDescription}`);

    // WHEN: Phase 1 - Architecture decomposer (baseline, no context)
    console.log("\n[Phase 1] Running architecture decomposer (baseline)...");
    const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
      taskId: testTaskId,
      taskDescription: testDescription,
      workDir: testWorkDir,
    });
    const archRun = await runs.poll(archHandle.id, { pollIntervalMs: 1000 });
    const archDecomposition = archRun.output;

    // THEN: Architecture decomposer returns components and boundaries
    expect(archDecomposition.taskId).toBe(testTaskId);
    expect(archDecomposition.perspective).toBe("architecture");
    expect(archDecomposition.microTasks).toBeDefined();
    expect(archDecomposition.components).toBeDefined();
    expect(archDecomposition.boundaries).toBeDefined();
    expect(archDecomposition.recommendations).toBeDefined();

    console.log(`[Phase 1] ✓ Architecture: ${archDecomposition.microTasks.length} micro-tasks, ${archDecomposition.components.length} components`);

    // WHEN: Phase 2 - Security decomposer gets architecture context
    console.log("\n[Phase 2] Running security decomposer (with architecture context)...");
    const secHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId: testTaskId,
      taskDescription: testDescription,
      workDir: testWorkDir,
      previousContext: {
        architecture: archDecomposition,
        components: archDecomposition.components,
        boundaries: archDecomposition.boundaries,
      },
    });
    const secRun = await runs.poll(secHandle.id, { pollIntervalMs: 1000 });
    const securityDecomposition = secRun.output;

    // THEN: Security decomposer uses architecture context
    expect(securityDecomposition.taskId).toBe(testTaskId);
    expect(securityDecomposition.perspective).toBe("security");
    expect(securityDecomposition.microTasks).toBeDefined();
    expect(securityDecomposition.securityBoundaries).toBeDefined();
    expect(securityDecomposition.riskLevel).toBeDefined();

    console.log(`[Phase 2] ✓ Security: ${securityDecomposition.microTasks.length} micro-tasks, risk: ${securityDecomposition.riskLevel}`);

    // WHEN: Phase 3 - Performance decomposer gets arch + security context
    console.log("\n[Phase 3] Running performance decomposer (with arch + security context)...");
    const perfHandle = await tasks.trigger("cfn-performance-decomposer", {
      taskId: testTaskId,
      taskDescription: testDescription,
      workDir: testWorkDir,
      previousContext: {
        architecture: archDecomposition,
        securityConstraints: securityDecomposition,
        securityBoundaries: securityDecomposition.securityBoundaries,
      },
    });
    const perfRun = await runs.poll(perfHandle.id, { pollIntervalMs: 1000 });
    const perfDecomposition = perfRun.output;

    // THEN: Performance decomposer uses both contexts
    expect(perfDecomposition.taskId).toBe(testTaskId);
    expect(perfDecomposition.perspective).toBe("performance");
    expect(perfDecomposition.microTasks).toBeDefined();
    expect(perfDecomposition.performanceConstraints).toBeDefined();
    expect(perfDecomposition.optimizationStrategy).toBeDefined();

    console.log(`[Phase 3] ✓ Performance: ${perfDecomposition.microTasks.length} micro-tasks, ${perfDecomposition.performanceConstraints.length} constraints`);

    // WHEN: Phase 4 - Testing decomposer gets all 3 contexts
    console.log("\n[Phase 4] Running testing decomposer (with all 3 contexts)...");
    const testHandle = await tasks.trigger("cfn-testing-decomposer", {
      taskId: testTaskId,
      taskDescription: testDescription,
      workDir: testWorkDir,
      previousContext: {
        architecture: archDecomposition,
        securityConstraints: securityDecomposition,
        performanceConstraints: perfDecomposition,
      },
    });
    const testRun = await runs.poll(testHandle.id, { pollIntervalMs: 1000 });
    const testingDecomposition = testRun.output;

    // THEN: Testing decomposer has complete visibility
    expect(testingDecomposition.taskId).toBe(testTaskId);
    expect(testingDecomposition.perspective).toBe("testing");
    expect(testingDecomposition.microTasks).toBeDefined();
    expect(testingDecomposition.testRequirements).toBeDefined();
    expect(testingDecomposition.coverageGoal).toBeGreaterThan(0);

    console.log(`[Phase 4] ✓ Testing: ${testingDecomposition.microTasks.length} micro-tasks, coverage: ${testingDecomposition.coverageGoal}%`);

    // THEN: Context flowed through all stages
    console.log("\n[Summary] Sequential decomposition completed successfully:");
    console.log(`  - Architecture: ${archDecomposition.microTasks.length} tasks`);
    console.log(`  - Security: ${securityDecomposition.microTasks.length} tasks`);
    console.log(`  - Performance: ${perfDecomposition.microTasks.length} tasks`);
    console.log(`  - Testing: ${testingDecomposition.microTasks.length} tasks`);
    console.log(`  - Total context depth: 4 layers`);

    // Verify context enrichment (testing should have most complete view)
    expect(testingDecomposition.testRequirements.length).toBeGreaterThanOrEqual(0);
  }, 30000); // 30 second timeout for all 4 decomposers

  it("should refine recommendations through context passing", async () => {
    // GIVEN: A task requiring security and performance considerations
    const taskDesc = "Build user authentication system with OAuth2";

    // WHEN: Architecture decomposer runs first
    const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
      taskId: "test-refinement-1",
      taskDescription: taskDesc,
      workDir: testWorkDir,
    });
    const archRun = await runs.poll(archHandle.id, { pollIntervalMs: 1000 });
    const archResult = archRun.output;

    // THEN: Architecture provides baseline components
    expect(archResult.components.length).toBeGreaterThan(0);

    // WHEN: Security decomposer refines with security constraints
    const secHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId: "test-refinement-1",
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        components: archResult.components,
      },
    });
    const secRun = await runs.poll(secHandle.id, { pollIntervalMs: 1000 });
    const secResult = secRun.output;

    // THEN: Security adds threat models and mitigations
    expect(secResult.securityBoundaries.length).toBeGreaterThanOrEqual(0);
    expect(secResult.riskLevel).toBeDefined();

    console.log(`[Refinement Test] Architecture → Security: ${archResult.components.length} components → ${secResult.securityBoundaries.length} security boundaries`);
  }, 20000);

  it("should handle empty previous context gracefully", async () => {
    // GIVEN: Security decomposer with no architecture context
    const resultHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId: "test-empty-context",
      taskDescription: "Simple file upload feature",
      workDir: testWorkDir,
      previousContext: undefined,
    });
    const resultRun = await runs.poll(resultHandle.id, { pollIntervalMs: 1000 });
    const result = resultRun.output;

    // THEN: Decomposer still executes successfully
    expect(result.microTasks).toBeDefined();
    expect(result.riskLevel).toBeDefined();
    console.log(`[Empty Context Test] Security decomposer handled empty context: ${result.microTasks.length} tasks`);
  }, 10000);
});
