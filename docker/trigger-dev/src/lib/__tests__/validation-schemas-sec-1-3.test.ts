/**
 * Security Validation Tests for SEC-1.3: Missing Input Validation in Decomposer Outputs
 *
 * Tests validate:
 * 1. Decomposer output type validation (Zod schema)
 * 2. Dependency graph cycle detection (DFS)
 * 3. Missing task reference detection
 * 4. Field length and format validation
 * 5. Error message clarity and actionability
 *
 * @module validation-schemas-sec-1-3.test
 */

import {
  validateDecomposerOutput,
  validateDependencyGraph,
  validateMultipleDecomposerOutputs,
  decomposerOutputSchema,
  DecomposerOutput,
} from "../validation-schemas.js";

describe("SEC-1.3: Decomposer Output Validation", () => {
  // =============================================
  // Test Suite 1: Valid Outputs (Should Pass)
  // =============================================

  describe("Valid Decomposer Outputs", () => {
    test("accepts valid architecture decomposer output", () => {
      const validOutput = {
        taskId: "task-123",
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1",
            title: "Design Database Schema",
            description: "Create normalized database schema for user management system",
            priority: "critical",
            rationale: "Core data layer foundation",
            dependencies: [],
          },
          {
            id: "arch-2",
            title: "Design API Contracts",
            description: "Define REST API contracts and endpoints for authentication flow",
            priority: "high",
            dependencies: ["arch-1"],
          },
        ],
        recommendations: ["Use PostgreSQL for relational data", "Implement connection pooling"],
      };

      expect(() => validateDecomposerOutput(validOutput, "test")).not.toThrow();
      const result = validateDecomposerOutput(validOutput, "test");
      expect(result.microTasks).toHaveLength(2);
      expect(result.perspective).toBe("architecture");
    });

    test("accepts minimal valid output", () => {
      const minimalOutput = {
        taskId: "task-1",
        perspective: "security",
        microTasks: [
          {
            id: "sec-1",
            title: "Security Review",
            description: "Conduct security vulnerability assessment",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(minimalOutput, "test")).not.toThrow();
    });

    test("accepts output with optional fields", () => {
      const outputWithOptionals = {
        taskId: "task-1",
        perspective: "performance",
        microTasks: [
          {
            id: "perf-1",
            title: "Optimize Database Queries",
            description: "Add indexes and optimize slow queries identified in profiling",
            priority: "high",
            rationale: "Improve query response time",
            dependencies: [],
          },
        ],
        recommendations: ["Consider caching layer"],
      };

      expect(() => validateDecomposerOutput(outputWithOptionals, "test")).not.toThrow();
    });
  });

  // =============================================
  // Test Suite 2: Invalid Outputs (Should Fail)
  // =============================================

  describe("Invalid Decomposer Outputs", () => {
    test("rejects non-object input", () => {
      expect(() => validateDecomposerOutput("not an object", "test")).toThrow(
        /Expected object/i
      );
      expect(() => validateDecomposerOutput(null, "test")).toThrow(/Expected object/i);
      expect(() => validateDecomposerOutput(123, "test")).toThrow(/Expected object/i);
    });

    test("rejects empty taskId", () => {
      const invalidOutput = {
        taskId: "", // ❌ Too short
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1",
            title: "Design Database",
            description: "Create database schema",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /Task ID/i
      );
    });

    test("rejects oversized taskId", () => {
      const invalidOutput = {
        taskId: "x".repeat(101), // ❌ Exceeds 100 char limit
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1",
            title: "Design Database",
            description: "Create database schema",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /Task ID/i
      );
    });

    test("rejects invalid perspective", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "invalid-perspective", // ❌ Invalid enum
        microTasks: [
          {
            id: "arch-1",
            title: "Design Database",
            description: "Create database schema",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /perspective/i
      );
    });

    test("rejects invalid task ID format (special chars)", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1; rm -rf /", // ❌ Invalid: contains special chars and semicolon
            title: "Design Database",
            description: "Create database schema",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /lowercase alphanumerics and hyphens/i
      );
    });

    test("rejects task ID with uppercase (injection vector)", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: "ARCH-1", // ❌ Invalid: uppercase
            title: "Design Database",
            description: "Create database schema",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /lowercase/i
      );
    });

    test("rejects too-short title", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1",
            title: "Bad", // ❌ Only 3 chars, min 5
            description: "Create database schema",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /Title too short/i
      );
    });

    test("rejects oversized title", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1",
            title: "x".repeat(201), // ❌ Exceeds 200 char limit
            description: "Create database schema",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /Title too long/i
      );
    });

    test("rejects too-short description", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1",
            title: "Design Database",
            description: "Short", // ❌ Only 5 chars, min 10
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /Description too short/i
      );
    });

    test("rejects invalid priority enum", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1",
            title: "Design Database",
            description: "Create database schema",
            priority: "CRITICAL", // ❌ Invalid: uppercase
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /Priority must be/i
      );
    });

    test("rejects empty microTasks array", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [], // ❌ Empty array
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow(
        /at least 1 micro-task/i
      );
    });

    test("rejects missing required fields", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: "arch-1",
            title: "Design Database",
            // ❌ Missing description
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow();
    });

    test("rejects invalid field types (numeric ID)", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: 123, // ❌ Should be string
            title: "Design Database",
            description: "Create database schema",
            priority: "critical",
          },
        ],
      };

      expect(() => validateDecomposerOutput(invalidOutput, "test")).toThrow();
    });
  });

  // =============================================
  // Test Suite 3: Dependency Graph Validation
  // =============================================

  describe("Dependency Graph Validation", () => {
    test("accepts valid DAG (no cycles)", () => {
      const microTasks = [
        { id: "task-1", dependencies: [] },
        { id: "task-2", dependencies: ["task-1"] },
        { id: "task-3", dependencies: ["task-1", "task-2"] },
      ];

      expect(() => validateDependencyGraph(microTasks, "test")).not.toThrow();
    });

    test("accepts disconnected components", () => {
      const microTasks = [
        { id: "task-1", dependencies: [] },
        { id: "task-2", dependencies: [] },
        { id: "task-3", dependencies: ["task-2"] },
      ];

      expect(() => validateDependencyGraph(microTasks, "test")).not.toThrow();
    });

    test("rejects simple cycle (A -> B -> A)", () => {
      const microTasks = [
        { id: "task-1", dependencies: ["task-2"] },
        { id: "task-2", dependencies: ["task-1"] },
      ];

      expect(() => validateDependencyGraph(microTasks, "test")).toThrow(
        /circular dependency/i
      );
    });

    test("rejects complex cycle (A -> B -> C -> A)", () => {
      const microTasks = [
        { id: "task-1", dependencies: ["task-2"] },
        { id: "task-2", dependencies: ["task-3"] },
        { id: "task-3", dependencies: ["task-1"] },
      ];

      expect(() => validateDependencyGraph(microTasks, "test")).toThrow(
        /circular dependency/i
      );
    });

    test("rejects self-loop (A -> A)", () => {
      const microTasks = [{ id: "task-1", dependencies: ["task-1"] }];

      expect(() => validateDependencyGraph(microTasks, "test")).toThrow(
        /circular dependency/i
      );
    });

    test("rejects missing task reference", () => {
      const microTasks = [
        { id: "task-1", dependencies: ["task-99"] }, // task-99 doesn't exist
      ];

      expect(() => validateDependencyGraph(microTasks, "test")).toThrow(
        /missing task/i
      );
    });

    test("rejects multiple missing references", () => {
      const microTasks = [
        { id: "task-1", dependencies: ["task-99", "task-100"] },
        { id: "task-2", dependencies: ["task-200"] },
      ];

      expect(() => validateDependencyGraph(microTasks, "test")).toThrow(
        /missing task/i
      );
    });
  });

  // =============================================
  // Test Suite 4: Batch Validation
  // =============================================

  describe("Multiple Decomposer Outputs Validation", () => {
    test("accepts valid outputs from all perspectives", () => {
      const outputs = {
        architecture: {
          taskId: "task-1",
          perspective: "architecture",
          microTasks: [
            {
              id: "arch-1",
              title: "Design Database",
              description: "Create database schema",
              priority: "critical",
            },
          ],
        },
        security: {
          taskId: "task-1",
          perspective: "security",
          microTasks: [
            {
              id: "sec-1",
              title: "Security Review",
              description: "Conduct security assessment",
              priority: "critical",
            },
          ],
        },
        performance: {
          taskId: "task-1",
          perspective: "performance",
          microTasks: [
            {
              id: "perf-1",
              title: "Performance Testing",
              description: "Create performance test suite",
              priority: "high",
            },
          ],
        },
        testing: {
          taskId: "task-1",
          perspective: "testing",
          microTasks: [
            {
              id: "test-1",
              title: "Unit Testing",
              description: "Write unit test cases",
              priority: "high",
            },
          ],
        },
      };

      expect(() => validateMultipleDecomposerOutputs(outputs)).not.toThrow();
      const result = validateMultipleDecomposerOutputs(outputs);
      expect(Object.keys(result)).toHaveLength(4);
    });

    test("rejects batch if any output is invalid", () => {
      const outputs = {
        architecture: {
          taskId: "task-1",
          perspective: "architecture",
          microTasks: [
            {
              id: "arch-1",
              title: "Design Database",
              description: "Create database schema",
              priority: "critical",
            },
          ],
        },
        security: {
          taskId: "task-1",
          perspective: "security",
          microTasks: [
            {
              id: "sec@1", // ❌ Invalid ID
              title: "Security Review",
              description: "Conduct security assessment",
              priority: "critical",
            },
          ],
        },
      };

      expect(() => validateMultipleDecomposerOutputs(outputs)).toThrow(
        /Multiple decomposer outputs failed/i
      );
    });
  });

  // =============================================
  // Test Suite 5: Error Message Quality
  // =============================================

  describe("Error Message Clarity", () => {
    test("provides actionable error messages with field paths", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [
          {
            id: "arch@1", // Invalid format
            title: "Bad", // Too short
            description: "x", // Too short
            priority: "CRITICAL", // Invalid enum
          },
        ],
      };

      try {
        validateDecomposerOutput(invalidOutput, "test-decomposer");
        fail("Should have thrown validation error");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("test-decomposer");
        expect(message).toContain("validation failed");
      }
    });

    test("includes remediation guidance in error messages", () => {
      const invalidOutput = {
        taskId: "task-1",
        perspective: "architecture",
        microTasks: [],
      };

      try {
        validateDecomposerOutput(invalidOutput, "test");
        fail("Should have thrown validation error");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("micro-task");
      }
    });
  });
});
