/**
 * Unit Tests for P0 Hardening - Decomposition Merger
 *
 * Purpose: Test error handling in merger functions (findMatchingTask, extractKeyWords).
 * Validates that null/undefined/wrong-type inputs are caught with clear error messages.
 *
 * @module decomposition-merger.test
 * @version 1.0.0
 */

// Using Jest (already configured in package.json)
import { mergeSequentialDecompositions } from "../decomposition-merger.js";

// Mock decomposer outputs for testing
const createValidArchitectureOutput = (taskCount: number = 2) => ({
  taskId: "task-123",
  perspective: "architecture" as const,
  microTasks: Array.from({ length: taskCount }, (_, i) => ({
    id: `arch-${i + 1}`,
    title: `Architecture Task ${i + 1}`,
    description: `Description ${i + 1}`,
    priority: "high" as const,
    rationale: "Architectural concern",
    dependencies: [],
  })),
  recommendations: ["Use microservices", "Implement API gateway"],
  components: [],
  boundaries: [],
});

const createValidSecurityOutput = () => ({
  taskId: "task-123",
  perspective: "security" as const,
  microTasks: [
    {
      id: "sec-1",
      title: "Implement authentication",
      description: "Add OAuth 2.0",
      priority: "critical" as const,
      rationale: "Security requirement",
      threatVectors: ["unauthorized access"],
    },
  ],
  securityRecommendations: ["Use HTTPS", "Enable 2FA"],
  securityBoundaries: [],
  riskLevel: "high" as const,
});

const createValidPerformanceOutput = () => ({
  taskId: "task-123",
  perspective: "performance" as const,
  microTasks: [
    {
      id: "perf-1",
      title: "Optimize database queries",
      description: "Add indexes",
      priority: "medium" as const,
      rationale: "Performance optimization",
      metrics: ["latency"],
    },
  ],
  performanceRecommendations: ["Use caching", "Connection pooling"],
  performanceConstraints: [],
  optimizationStrategy: "Reduce latency",
});

const createValidTestingOutput = () => ({
  taskId: "task-123",
  perspective: "testing" as const,
  microTasks: [
    {
      id: "test-1",
      title: "Write unit tests",
      description: "Test authentication flow",
      priority: "high" as const,
      rationale: "Test coverage",
      testTypes: ["unit", "integration"],
    },
  ],
  testingRecommendations: ["Achieve 80% coverage", "Add e2e tests"],
  testRequirements: [],
  coverageGoal: 85,
});

// =============================================
// Task 5 Tests: Task Count Validation in Merger
// =============================================

describe("mergeSequentialDecompositions - Task Count Validation", () => {
  it("should throw error when architecture returns 0 tasks", () => {
    const emptyArchOutput = createValidArchitectureOutput(0);
    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(emptyArchOutput, secOutput, perfOutput, testOutput)
    ).toThrow(/Architecture decomposer returned 0 tasks - cannot proceed/);
  });

  it("should warn when architecture returns > 50 tasks", () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const largeArchOutput = createValidArchitectureOutput(51);
    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    mergeSequentialDecompositions(largeArchOutput, secOutput, perfOutput, testOutput);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("produced 51 tasks")
    );

    consoleWarnSpy.mockRestore();
  });

  it("should succeed with valid task count (1-50)", () => {
    const validArchOutput = createValidArchitectureOutput(12);
    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(validArchOutput, secOutput, perfOutput, testOutput)
    ).not.toThrow();
  });
});

// =============================================
// Task 2 Tests: Merger Error Handling
// =============================================

describe("mergeSequentialDecompositions - Input Validation", () => {
  it("should handle null architecture output", () => {
    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(null as any, secOutput, perfOutput, testOutput)
    ).toThrow();
  });

  it("should handle undefined architecture output", () => {
    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(undefined as any, secOutput, perfOutput, testOutput)
    ).toThrow();
  });

  it("should handle architecture output with missing microTasks field", () => {
    const invalidArchOutput = {
      taskId: "task-123",
      perspective: "architecture",
      recommendations: [],
      components: [],
      boundaries: [],
      // Missing microTasks
    } as any;

    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(invalidArchOutput, secOutput, perfOutput, testOutput)
    ).toThrow();
  });

  it("should handle architecture output with non-array microTasks", () => {
    const invalidArchOutput = {
      taskId: "task-123",
      perspective: "architecture",
      microTasks: "not an array", // Wrong type
      recommendations: [],
      components: [],
      boundaries: [],
    } as any;

    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(invalidArchOutput, secOutput, perfOutput, testOutput)
    ).toThrow(/must be an array/);
  });
});

describe("mergeSequentialDecompositions - Task Structure Validation", () => {
  it("should handle task with missing title", () => {
    const invalidArchOutput = {
      taskId: "task-123",
      perspective: "architecture" as const,
      microTasks: [
        {
          id: "arch-1",
          // Missing title
          description: "Description",
          priority: "high" as const,
          rationale: "Reason",
          dependencies: [],
        },
      ],
      recommendations: [],
      components: [],
      boundaries: [],
    };

    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(invalidArchOutput as any, secOutput, perfOutput, testOutput)
    ).toThrow(/missing title/);
  });

  it("should handle task with null title", () => {
    const invalidArchOutput = {
      taskId: "task-123",
      perspective: "architecture" as const,
      microTasks: [
        {
          id: "arch-1",
          title: null, // Null title
          description: "Description",
          priority: "high" as const,
          rationale: "Reason",
          dependencies: [],
        },
      ],
      recommendations: [],
      components: [],
      boundaries: [],
    };

    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(invalidArchOutput as any, secOutput, perfOutput, testOutput)
    ).toThrow(/title must be a string/);
  });

  it("should handle task with non-string title", () => {
    const invalidArchOutput = {
      taskId: "task-123",
      perspective: "architecture" as const,
      microTasks: [
        {
          id: "arch-1",
          title: 12345, // Number instead of string
          description: "Description",
          priority: "high" as const,
          rationale: "Reason",
          dependencies: [],
        },
      ],
      recommendations: [],
      components: [],
      boundaries: [],
    };

    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    expect(() =>
      mergeSequentialDecompositions(invalidArchOutput as any, secOutput, perfOutput, testOutput)
    ).toThrow(/title must be a string/);
  });

  it("should handle task with empty title", () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    const validArchOutput = {
      taskId: "task-123",
      perspective: "architecture" as const,
      microTasks: [
        {
          id: "arch-1",
          title: "", // Empty title
          description: "Description",
          priority: "high" as const,
          rationale: "Reason",
          dependencies: [],
        },
      ],
      recommendations: [],
      components: [],
      boundaries: [],
    };

    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    // Should not throw, but should warn
    mergeSequentialDecompositions(validArchOutput, secOutput, perfOutput, testOutput);

    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });
});

describe("mergeSequentialDecompositions - Positive Cases", () => {
  it("should successfully merge all 4 decomposer outputs", () => {
    const archOutput = createValidArchitectureOutput(3);
    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    const result = mergeSequentialDecompositions(archOutput, secOutput, perfOutput, testOutput);

    expect(result).toHaveProperty("taskId", "task-123");
    expect(result).toHaveProperty("microTasks");
    expect(result.microTasks.length).toBeGreaterThan(0);
    expect(result).toHaveProperty("metrics");
    expect(result).toHaveProperty("recommendations");
  });

  it("should preserve all recommendations from all stages", () => {
    const archOutput = createValidArchitectureOutput(2);
    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    const result = mergeSequentialDecompositions(archOutput, secOutput, perfOutput, testOutput);

    expect(result.recommendations.architecture).toEqual(archOutput.recommendations);
    expect(result.recommendations.security).toEqual(secOutput.securityRecommendations);
    expect(result.recommendations.performance).toEqual(perfOutput.performanceRecommendations);
    expect(result.recommendations.testing).toEqual(testOutput.testingRecommendations);
  });

  it("should calculate quality metrics", () => {
    const archOutput = createValidArchitectureOutput(5);
    const secOutput = createValidSecurityOutput();
    const perfOutput = createValidPerformanceOutput();
    const testOutput = createValidTestingOutput();

    const result = mergeSequentialDecompositions(archOutput, secOutput, perfOutput, testOutput);

    expect(result.metrics).toHaveProperty("totalTasks");
    expect(result.metrics).toHaveProperty("constraintCompleteness");
    expect(result.metrics).toHaveProperty("avgConstraintsPerTask");
    expect(result.metrics).toHaveProperty("refinementDepth");
    expect(result.metrics.totalTasks).toBeGreaterThan(0);
  });
});
