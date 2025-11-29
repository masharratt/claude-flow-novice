/**
 * Decomposition Merger Tests
 *
 * Tests the sequential context refinement approach:
 * 1. Natural deduplication (no explicit rules)
 * 2. Context flows through all 4 stages
 * 3. Final task count 12-16
 * 4. Each task includes all 4 perspectives
 * 5. Refinement history tracked correctly
 *
 * @module merger.test
 */

import { describe, it, expect } from "@jest/globals";
import { mergeSequentialDecompositions } from "../../src/lib/decomposition-merger.js";

describe("Decomposition Merger - Sequential Context Refinement", () => {
  // Test Case 1: Basic Refinement Flow
  it("should refine tasks sequentially through all 4 stages", () => {
    const architectureOutput = {
      taskId: "test-001",
      originalTask: "Build payment checkout with Stripe",
      perspective: "architecture",
      microTasks: [
        {
          id: "arch-1",
          title: "Design API gateway",
          description: "Create API gateway for payment service",
          priority: "high",
          rationale: "Entry point for all payment requests",
          dependencies: [],
          estimatedEffort: "medium",
        },
        {
          id: "arch-2",
          title: "Build auth service",
          description: "Implement authentication service",
          priority: "critical",
          rationale: "Required for secure payment processing",
          dependencies: [],
          estimatedEffort: "large",
        },
      ],
      recommendations: ["Use microservices architecture"],
    };

    const securityOutput = {
      taskId: "test-001",
      originalTask: "Build payment checkout with Stripe",
      perspective: "security",
      microTasks: [
        {
          id: "sec-1",
          title: "Design API gateway",
          description: "Add rate limiting and request validation to API gateway",
          priority: "critical",
          rationale: "Prevent DDoS and malicious requests",
          threatVectors: ["DDoS", "Injection attacks"],
          dependencies: [],
          estimatedEffort: "medium",
        },
        {
          id: "sec-2",
          title: "Implement inter-service mutual TLS",
          description: "Add mTLS between microservices",
          priority: "high",
          rationale: "Secure service-to-service communication",
          threatVectors: ["Man-in-the-middle"],
          dependencies: ["arch-1", "arch-2"],
          estimatedEffort: "medium",
        },
      ],
      securityRecommendations: ["Use PCI DSS compliance standards"],
    };

    const performanceOutput = {
      taskId: "test-001",
      originalTask: "Build payment checkout with Stripe",
      perspective: "performance",
      microTasks: [
        {
          id: "perf-1",
          title: "Build auth service",
          description: "Add token caching with 5min TTL",
          priority: "high",
          rationale: "Reduce auth latency",
          metrics: ["p95 latency < 100ms"],
          dependencies: ["arch-2"],
          estimatedEffort: "small",
        },
        {
          id: "perf-2",
          title: "Implement caching layer",
          description: "Add Redis caching for user permissions",
          priority: "medium",
          rationale: "Improve permission lookup performance",
          metrics: ["Cache hit rate > 90%"],
          dependencies: ["arch-2"],
          estimatedEffort: "medium",
        },
      ],
      performanceRecommendations: ["Use connection pooling"],
    };

    const testingOutput = {
      taskId: "test-001",
      originalTask: "Build payment checkout with Stripe",
      perspective: "testing",
      microTasks: [
        {
          id: "test-1",
          title: "Build auth service",
          description: "Test token expiry and refresh flow",
          priority: "critical",
          rationale: "Ensure auth security and reliability",
          testTypes: ["unit", "integration"],
          dependencies: ["arch-2"],
          estimatedEffort: "medium",
        },
        {
          id: "test-2",
          title: "Test API gateway rate limiting",
          description: "Verify rate limiting prevents abuse",
          priority: "high",
          rationale: "Validate DDoS protection",
          testTypes: ["load", "security"],
          dependencies: ["arch-1"],
          estimatedEffort: "small",
        },
      ],
      testingRecommendations: ["Achieve 80% code coverage"],
    };

    const result = mergeSequentialDecompositions(
      architectureOutput,
      securityOutput,
      performanceOutput,
      testingOutput
    );

    // Assertions
    expect(result.microTasks.length).toBeGreaterThanOrEqual(4);
    expect(result.microTasks.length).toBeLessThanOrEqual(6);

    // Check that "Design API gateway" was refined, not duplicated
    const apiGatewayTasks = result.microTasks.filter((t) =>
      t.title.includes("API gateway")
    );
    expect(apiGatewayTasks.length).toBe(1);

    const apiGatewayTask = apiGatewayTasks[0];
    expect(apiGatewayTask.constraints.architecture).toBeDefined();
    expect(apiGatewayTask.constraints.security).toBeDefined();
    expect(apiGatewayTask.refinementHistory.length).toBeGreaterThanOrEqual(2);

    // Check that "Build auth service" was refined with all perspectives
    const authTasks = result.microTasks.filter((t) => t.title.includes("auth service"));
    expect(authTasks.length).toBe(1);

    const authTask = authTasks[0];
    expect(authTask.constraints.architecture).toBeDefined();
    expect(authTask.constraints.performance).toBeDefined();
    expect(authTask.constraints.testing).toBeDefined();
    expect(authTask.refinementHistory.length).toBeGreaterThanOrEqual(3);

    // Check metrics
    expect(result.metrics.constraintCompleteness).toBeGreaterThan(0);
    expect(result.metrics.avgConstraintsPerTask).toBeGreaterThan(1);
  });

  // Test Case 2: New Tasks Added at Later Stages
  it("should add new tasks from later stages without duplicating existing ones", () => {
    const architectureOutput = {
      taskId: "test-002",
      originalTask: "Implement user dashboard",
      perspective: "architecture",
      microTasks: [
        {
          id: "arch-1",
          title: "Create dashboard layout",
          description: "Build React dashboard component",
          priority: "high",
          rationale: "Core UI structure",
          dependencies: [],
          estimatedEffort: "medium",
        },
      ],
      recommendations: [],
    };

    const securityOutput = {
      taskId: "test-002",
      originalTask: "Implement user dashboard",
      perspective: "security",
      microTasks: [
        {
          id: "sec-1",
          title: "Implement CSRF protection",
          description: "Add CSRF tokens to all forms",
          priority: "critical",
          rationale: "Prevent cross-site request forgery",
          threatVectors: ["CSRF"],
          dependencies: ["arch-1"],
          estimatedEffort: "small",
        },
      ],
      securityRecommendations: [],
    };

    const performanceOutput = {
      taskId: "test-002",
      originalTask: "Implement user dashboard",
      perspective: "performance",
      microTasks: [],
      performanceRecommendations: [],
    };

    const testingOutput = {
      taskId: "test-002",
      originalTask: "Implement user dashboard",
      perspective: "testing",
      microTasks: [],
      testingRecommendations: [],
    };

    const result = mergeSequentialDecompositions(
      architectureOutput,
      securityOutput,
      performanceOutput,
      testingOutput
    );

    // Should have 2 tasks: dashboard + CSRF
    expect(result.microTasks.length).toBe(2);

    const csrfTask = result.microTasks.find((t) => t.title.includes("CSRF"));
    expect(csrfTask).toBeDefined();
    expect(csrfTask!.constraints.security).toBeDefined();
    expect(csrfTask!.refinementHistory[0].stage).toBe("security");
  });

  // Test Case 3: Constraint Completeness Metric
  it("should calculate constraint completeness correctly", () => {
    const architectureOutput = {
      taskId: "test-003",
      originalTask: "Build feature X",
      perspective: "architecture",
      microTasks: [
        {
          id: "task-1",
          title: "Task 1",
          description: "Description",
          priority: "medium",
          dependencies: [],
          estimatedEffort: "small",
        },
        {
          id: "task-2",
          title: "Task 2",
          description: "Description",
          priority: "medium",
          dependencies: [],
          estimatedEffort: "small",
        },
      ],
      recommendations: [],
    };

    const securityOutput = {
      taskId: "test-003",
      originalTask: "Build feature X",
      perspective: "security",
      microTasks: [
        {
          id: "task-1",
          title: "Task 1",
          description: "Security constraint",
          priority: "medium",
          dependencies: [],
          estimatedEffort: "small",
        },
      ],
      securityRecommendations: [],
    };

    const performanceOutput = {
      taskId: "test-003",
      originalTask: "Build feature X",
      perspective: "performance",
      microTasks: [
        {
          id: "task-1",
          title: "Task 1",
          description: "Performance constraint",
          priority: "medium",
          dependencies: [],
          estimatedEffort: "small",
        },
      ],
      performanceRecommendations: [],
    };

    const testingOutput = {
      taskId: "test-003",
      originalTask: "Build feature X",
      perspective: "testing",
      microTasks: [
        {
          id: "task-1",
          title: "Task 1",
          description: "Testing constraint",
          priority: "medium",
          dependencies: [],
          estimatedEffort: "small",
        },
      ],
      testingRecommendations: [],
    };

    const result = mergeSequentialDecompositions(
      architectureOutput,
      securityOutput,
      performanceOutput,
      testingOutput
    );

    // Task 1 should have all 4 constraints (100% completeness)
    // Task 2 should have only architecture constraint (25% completeness)
    // Overall: 1/2 = 50% completeness
    expect(result.metrics.constraintCompleteness).toBeCloseTo(0.5, 1);
  });

  // Test Case 4: Refinement History Tracking
  it("should track refinement history with timestamps", () => {
    const architectureOutput = {
      taskId: "test-004",
      originalTask: "Task",
      perspective: "architecture",
      microTasks: [
        {
          id: "task-1",
          title: "Task 1",
          description: "Arch",
          priority: "medium",
          dependencies: [],
          estimatedEffort: "small",
        },
      ],
      recommendations: [],
    };

    const securityOutput = {
      taskId: "test-004",
      originalTask: "Task",
      perspective: "security",
      microTasks: [
        {
          id: "task-1",
          title: "Task 1",
          description: "Sec",
          priority: "medium",
          dependencies: [],
          estimatedEffort: "small",
        },
      ],
      securityRecommendations: [],
    };

    const performanceOutput = {
      taskId: "test-004",
      originalTask: "Task",
      perspective: "performance",
      microTasks: [],
      performanceRecommendations: [],
    };

    const testingOutput = {
      taskId: "test-004",
      originalTask: "Task",
      perspective: "testing",
      microTasks: [],
      testingRecommendations: [],
    };

    const result = mergeSequentialDecompositions(
      architectureOutput,
      securityOutput,
      performanceOutput,
      testingOutput
    );

    const task = result.microTasks[0];
    expect(task.refinementHistory.length).toBe(2);
    expect(task.refinementHistory[0].stage).toBe("architecture");
    expect(task.refinementHistory[1].stage).toBe("security");
    expect(task.refinementHistory[0].timestamp).toBeLessThanOrEqual(
      task.refinementHistory[1].timestamp
    );
  });

  // Test Case 5: No Explicit Deduplication Rules
  it("should naturally deduplicate through fuzzy matching (no explicit rules)", () => {
    const architectureOutput = {
      taskId: "test-005",
      originalTask: "Task",
      perspective: "architecture",
      microTasks: [
        {
          id: "arch-1",
          title: "Implement user authentication",
          description: "Create auth module",
          priority: "high",
          dependencies: [],
          estimatedEffort: "large",
        },
      ],
      recommendations: [],
    };

    const securityOutput = {
      taskId: "test-005",
      originalTask: "Task",
      perspective: "security",
      microTasks: [
        {
          id: "sec-1",
          title: "User authentication security",
          description: "Add security to auth",
          priority: "critical",
          dependencies: [],
          estimatedEffort: "medium",
        },
      ],
      securityRecommendations: [],
    };

    const performanceOutput = {
      taskId: "test-005",
      originalTask: "Task",
      perspective: "performance",
      microTasks: [],
      performanceRecommendations: [],
    };

    const testingOutput = {
      taskId: "test-005",
      originalTask: "Task",
      perspective: "testing",
      microTasks: [],
      testingRecommendations: [],
    };

    const result = mergeSequentialDecompositions(
      architectureOutput,
      securityOutput,
      performanceOutput,
      testingOutput
    );

    // Should match "user authentication" fuzzy
    expect(result.microTasks.length).toBe(1);
    expect(result.microTasks[0].constraints.architecture).toBeDefined();
    expect(result.microTasks[0].constraints.security).toBeDefined();
  });
});
