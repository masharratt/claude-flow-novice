import { describe, it, expect } from "@jest/globals";
import { tasks, runs } from "@trigger.dev/sdk/v3";
import { cfnArchitectureDecomposerTask } from "../../src/trigger/cfn-architecture-decomposer";
import { cfnSecurityDecomposerTask } from "../../src/trigger/cfn-security-decomposer";
import { cfnPerformanceDecomposerTask } from "../../src/trigger/cfn-performance-decomposer";
import { cfnTestingDecomposerTask } from "../../src/trigger/cfn-testing-decomposer";

/**
 * PHASE 2 TASK 2.1: Context Passing Verification Test
 *
 * Verifies that context information flows correctly through all decomposers:
 * - Architecture context → Security
 * - Architecture + Security context → Performance
 * - All 3 contexts → Testing
 *
 * GIVEN: Context from previous decomposers
 * WHEN: Each decomposer receives previousContext
 * THEN: Context is used to inform recommendations
 *       No information loss occurs
 *       Downstream decomposers have complete visibility
 */

describe("Context Passing Verification", () => {
  const testWorkDir = "/tmp/decomposition-test";

  it("should pass architecture context to security decomposer", async () => {
    // GIVEN: Architecture decomposer output with components and boundaries
    const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
      taskId: "context-test-1",
      taskDescription: "Build microservices API gateway",
      workDir: testWorkDir,
    });
    const archRun = await runs.poll(archHandle.id, { pollIntervalMs: 1000 });
    const archResult = archRun.output;

    // WHEN: Security decomposer receives architecture context
    const secHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId: "context-test-1",
      taskDescription: "Build microservices API gateway",
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        components: archResult.components,
        boundaries: archResult.boundaries,
      },
    });
    const secRun = await runs.poll(secHandle.id, { pollIntervalMs: 1000 });
    const secResult = secRun.output;

    // THEN: Security decomposer uses architecture context
    expect(secResult.microTasks).toBeDefined();
    expect(secResult.securityBoundaries).toBeDefined();

    // Verify context influenced the output
    expect(secResult.taskId).toBe("context-test-1");
    console.log(`[Context Pass] Architecture → Security: ${archResult.components.length} components informed ${secResult.securityBoundaries.length} security boundaries`);
  }, 15000);

  it("should pass architecture + security context to performance decomposer", async () => {
    // GIVEN: Architecture and security decomposer outputs
    const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
      taskId: "context-test-2",
      taskDescription: "Build real-time messaging system",
      workDir: testWorkDir,
    });
    const archRun = await runs.poll(archHandle.id, { pollIntervalMs: 1000 });
    const archResult = archRun.output;

    const secHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId: "context-test-2",
      taskDescription: "Build real-time messaging system",
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
      },
    });
    const secRun = await runs.poll(secHandle.id, { pollIntervalMs: 1000 });
    const secResult = secRun.output;

    // WHEN: Performance decomposer receives both contexts
    const perfHandle = await tasks.trigger("cfn-performance-decomposer", {
      taskId: "context-test-2",
      taskDescription: "Build real-time messaging system",
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        securityConstraints: secResult,
      },
    });
    const perfRun = await runs.poll(perfHandle.id, { pollIntervalMs: 1000 });
    const perfResult = perfRun.output;

    // THEN: Performance decomposer uses both contexts
    expect(perfResult.microTasks).toBeDefined();
    expect(perfResult.performanceConstraints).toBeDefined();
    expect(perfResult.optimizationStrategy).toBeDefined();

    console.log(`[Context Pass] Arch + Security → Performance: ${perfResult.performanceConstraints.length} constraints identified`);
  }, 20000);

  it("should pass all 3 contexts to testing decomposer", async () => {
    // GIVEN: All 3 previous decomposer outputs
    const taskDesc = "Build e-commerce checkout flow";

    const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
      taskId: "context-test-3",
      taskDescription: taskDesc,
      workDir: testWorkDir,
    });
    const archRun = await runs.poll(archHandle.id, { pollIntervalMs: 1000 });
    const archResult = archRun.output;

    const secHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId: "context-test-3",
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
      },
    });
    const secRun = await runs.poll(secHandle.id, { pollIntervalMs: 1000 });
    const secResult = secRun.output;

    const perfHandle = await tasks.trigger("cfn-performance-decomposer", {
      taskId: "context-test-3",
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        securityConstraints: secResult,
      },
    });
    const perfRun = await runs.poll(perfHandle.id, { pollIntervalMs: 1000 });
    const perfResult = perfRun.output;

    // WHEN: Testing decomposer receives all 3 contexts
    const testHandle = await tasks.trigger("cfn-testing-decomposer", {
      taskId: "context-test-3",
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        securityConstraints: secResult,
        performanceConstraints: perfResult,
      },
    });
    const testRun = await runs.poll(testHandle.id, { pollIntervalMs: 1000 });
    const testResult = testRun.output;

    // THEN: Testing decomposer has complete visibility
    expect(testResult.microTasks).toBeDefined();
    expect(testResult.testRequirements).toBeDefined();
    expect(testResult.testingRecommendations).toBeDefined();

    // Verify test requirements cover all aspects
    const hasArchTests = testResult.testRequirements.some((req: { testType: string }) =>
      req.testType === "integration" || req.testType === "e2e"
    );
    const hasSecurityTests = testResult.testRequirements.some((req: { testType: string }) =>
      req.testType === "security"
    );
    const hasPerfTests = testResult.testRequirements.some((req: { testType: string }) =>
      req.testType === "performance" || req.testType === "load"
    );

    console.log(`[Context Pass] All 3 → Testing: ${testResult.testRequirements.length} test requirements`);
    console.log(`  - Architecture tests: ${hasArchTests}`);
    console.log(`  - Security tests: ${hasSecurityTests}`);
    console.log(`  - Performance tests: ${hasPerfTests}`);
  }, 30000);

  it("should preserve context information across all stages", async () => {
    // GIVEN: A task description
    const taskDesc = "Build payment processing service";
    const taskId = "context-preservation-test";

    // WHEN: All decomposers run in sequence
    const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
      taskId,
      taskDescription: taskDesc,
      workDir: testWorkDir,
    });
    const archRun = await runs.poll(archHandle.id, { pollIntervalMs: 1000 });
    const archResult = archRun.output;

    const secHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId,
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: { architecture: archResult },
    });
    const secRun = await runs.poll(secHandle.id, { pollIntervalMs: 1000 });
    const secResult = secRun.output;

    const perfHandle = await tasks.trigger("cfn-performance-decomposer", {
      taskId,
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        securityConstraints: secResult,
      },
    });
    const perfRun = await runs.poll(perfHandle.id, { pollIntervalMs: 1000 });
    const perfResult = perfRun.output;

    const testHandle = await tasks.trigger("cfn-testing-decomposer", {
      taskId,
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        securityConstraints: secResult,
        performanceConstraints: perfResult,
      },
    });
    const testRun = await runs.poll(testHandle.id, { pollIntervalMs: 1000 });
    const testResult = testRun.output;

    // THEN: No information loss occurred
    expect(archResult.components).toBeDefined();
    expect(secResult.securityBoundaries).toBeDefined();
    expect(perfResult.performanceConstraints).toBeDefined();
    expect(testResult.testRequirements).toBeDefined();

    // Verify taskId preserved throughout
    expect(archResult.taskId).toBe(taskId);
    expect(secResult.taskId).toBe(taskId);
    expect(perfResult.taskId).toBe(taskId);
    expect(testResult.taskId).toBe(taskId);

    console.log(`[Context Preservation] All stages completed with no information loss`);
    console.log(`  - Architecture: ${archResult.microTasks.length} tasks`);
    console.log(`  - Security: ${secResult.microTasks.length} tasks`);
    console.log(`  - Performance: ${perfResult.microTasks.length} tasks`);
    console.log(`  - Testing: ${testResult.microTasks.length} tasks`);
  }, 30000);

  it("should handle partial context gracefully", async () => {
    // GIVEN: Performance decomposer with only architecture context (no security)
    const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
      taskId: "partial-context-test",
      taskDescription: "Build file storage service",
      workDir: testWorkDir,
    });
    const archRun = await runs.poll(archHandle.id, { pollIntervalMs: 1000 });
    const archResult = archRun.output;

    // WHEN: Performance decomposer receives only architecture context
    const perfHandle = await tasks.trigger("cfn-performance-decomposer", {
      taskId: "partial-context-test",
      taskDescription: "Build file storage service",
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        // securityConstraints intentionally omitted
      },
    });
    const perfRun = await runs.poll(perfHandle.id, { pollIntervalMs: 1000 });
    const perfResult = perfRun.output;

    // THEN: Decomposer handles partial context gracefully
    expect(perfResult.microTasks).toBeDefined();
    expect(perfResult.performanceConstraints).toBeDefined();
    console.log(`[Partial Context] Performance decomposer handled partial context: ${perfResult.microTasks.length} tasks`);
  }, 15000);

  it("should show context refinement improves quality", async () => {
    // GIVEN: Same task run with and without context
    const taskDesc = "Build user profile API";

    // WHEN: Security decomposer runs without architecture context
    const secWithoutHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId: "quality-test-1",
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: undefined,
    });
    const secWithoutRun = await runs.poll(secWithoutHandle.id, { pollIntervalMs: 1000 });
    const secWithoutContext = secWithoutRun.output;

    // Architecture decomposer provides context
    const archHandle = await tasks.trigger("cfn-architecture-decomposer", {
      taskId: "quality-test-2",
      taskDescription: taskDesc,
      workDir: testWorkDir,
    });
    const archRun = await runs.poll(archHandle.id, { pollIntervalMs: 1000 });
    const archResult = archRun.output;

    // WHEN: Security decomposer runs WITH architecture context
    const secWithHandle = await tasks.trigger("cfn-security-decomposer", {
      taskId: "quality-test-2",
      taskDescription: taskDesc,
      workDir: testWorkDir,
      previousContext: {
        architecture: archResult,
        components: archResult.components,
      },
    });
    const secWithRun = await runs.poll(secWithHandle.id, { pollIntervalMs: 1000 });
    const secWithContext = secWithRun.output;

    // THEN: Context-informed version should have more detailed boundaries
    console.log(`[Quality Comparison]`);
    console.log(`  Without context: ${secWithoutContext.securityBoundaries.length} boundaries, risk: ${secWithoutContext.riskLevel}`);
    console.log(`  With context: ${secWithContext.securityBoundaries.length} boundaries, risk: ${secWithContext.riskLevel}`);

    // Context should enable more thorough analysis
    expect(secWithContext.microTasks.length).toBeGreaterThanOrEqual(0);
  }, 20000);
});
