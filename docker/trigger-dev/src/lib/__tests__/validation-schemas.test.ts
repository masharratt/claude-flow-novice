/**
 * Unit Tests for P0 Hardening - Validation Schemas
 *
 * Purpose: Comprehensive test coverage for all validation schemas and helper functions.
 * Tests positive cases, negative cases, and edge cases for input validation,
 * API response validation, and decomposition output validation.
 *
 * @module validation-schemas.test
 * @version 1.0.0
 */

// Using Jest (already configured in package.json)
import {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
  validateMergerInput,
  validateTaskCount,
} from "../validation-schemas.js";

// =============================================
// Task 1 Tests: Decomposer Input Validation
// =============================================

describe("validateDecomposerInput", () => {
  describe("Positive Cases", () => {
    it("should validate valid input with all required fields", () => {
      const validInput = {
        taskId: "task-123",
        taskDescription: "Implement user authentication with OAuth 2.0 and JWT tokens",
        workDir: "/workspace/project",
      };

      expect(() => validateDecomposerInput(validInput, "test-decomposer")).not.toThrow();
    });

    it("should validate input with optional previousContext", () => {
      const validInput = {
        taskId: "task-456",
        taskDescription: "Add security headers to API responses",
        workDir: "/workspace",
        previousContext: {
          microTasks: [{ id: "arch-1", title: "Setup API Gateway" }],
          recommendations: ["Use HTTPS only"],
        },
      };

      expect(() => validateDecomposerInput(validInput, "test-decomposer")).not.toThrow();
    });

    it("should validate minimum length task description (10 chars)", () => {
      const validInput = {
        taskId: "t1",
        taskDescription: "Do this now", // Exactly 11 chars
        workDir: "/workspace",
      };

      expect(() => validateDecomposerInput(validInput, "test-decomposer")).not.toThrow();
    });

    it("should validate maximum length task description (5000 chars)", () => {
      const validInput = {
        taskId: "task-large",
        taskDescription: "A".repeat(5000),
        workDir: "/workspace",
      };

      expect(() => validateDecomposerInput(validInput, "test-decomposer")).not.toThrow();
    });
  });

  describe("Negative Cases - Prompt Injection Prevention", () => {
    it("should reject task description with null bytes", () => {
      const maliciousInput = {
        taskId: "task-123",
        taskDescription: "Normal text\0with null byte injection",
        workDir: "/workspace",
      };

      expect(() => validateDecomposerInput(maliciousInput, "test-decomposer")).toThrow(
        /contains null bytes/
      );
    });

    it("should reject workDir with null bytes", () => {
      const maliciousInput = {
        taskId: "task-123",
        taskDescription: "Valid description here",
        workDir: "/workspace\0/etc/passwd",
      };

      expect(() => validateDecomposerInput(maliciousInput, "test-decomposer")).toThrow(
        /contains null bytes/
      );
    });

    it("should reject workDir with parent directory references", () => {
      const maliciousInput = {
        taskId: "task-123",
        taskDescription: "Valid description",
        workDir: "/workspace/../../../etc/passwd",
      };

      expect(() => validateDecomposerInput(maliciousInput, "test-decomposer")).toThrow(
        /cannot contain parent directory references/
      );
    });

    it("should reject non-absolute workDir paths", () => {
      const invalidInput = {
        taskId: "task-123",
        taskDescription: "Valid description",
        workDir: "relative/path/to/workspace",
      };

      expect(() => validateDecomposerInput(invalidInput, "test-decomposer")).toThrow(
        /must be an absolute path/
      );
    });

    it("should reject task description shorter than 10 chars", () => {
      const invalidInput = {
        taskId: "task-123",
        taskDescription: "Too short",
        workDir: "/workspace",
      };

      expect(() => validateDecomposerInput(invalidInput, "test-decomposer")).toThrow(
        /too short/
      );
    });

    it("should reject task description longer than 5000 chars", () => {
      const invalidInput = {
        taskId: "task-123",
        taskDescription: "A".repeat(5001),
        workDir: "/workspace",
      };

      expect(() => validateDecomposerInput(invalidInput, "test-decomposer")).toThrow(
        /too long/
      );
    });

    it("should reject empty taskId", () => {
      const invalidInput = {
        taskId: "",
        taskDescription: "Valid description here",
        workDir: "/workspace",
      };

      expect(() => validateDecomposerInput(invalidInput, "test-decomposer")).toThrow(
        /cannot be empty/
      );
    });

    it("should reject taskId longer than 100 chars", () => {
      const invalidInput = {
        taskId: "t".repeat(101),
        taskDescription: "Valid description",
        workDir: "/workspace",
      };

      expect(() => validateDecomposerInput(invalidInput, "test-decomposer")).toThrow(/too long/);
    });
  });

  describe("Edge Cases", () => {
    it("should reject missing taskId", () => {
      const invalidInput = {
        taskDescription: "Valid description",
        workDir: "/workspace",
      } as any;

      expect(() => validateDecomposerInput(invalidInput, "test-decomposer")).toThrow();
    });

    it("should reject missing taskDescription", () => {
      const invalidInput = {
        taskId: "task-123",
        workDir: "/workspace",
      } as any;

      expect(() => validateDecomposerInput(invalidInput, "test-decomposer")).toThrow();
    });

    it("should reject missing workDir", () => {
      const invalidInput = {
        taskId: "task-123",
        taskDescription: "Valid description",
      } as any;

      expect(() => validateDecomposerInput(invalidInput, "test-decomposer")).toThrow();
    });
  });
});

// =============================================
// Task 3 Tests: Cerebras API Response Validation
// =============================================

describe("validateCerebrasResponse", () => {
  describe("Positive Cases", () => {
    it("should validate valid API response structure", () => {
      const validResponse = {
        choices: [
          {
            message: {
              content: '{"microTasks": [{"id": "1", "title": "Task 1"}]}',
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      };

      expect(() => validateCerebrasResponse(validResponse, "test-decomposer")).not.toThrow();
    });

    it("should validate response with multiple choices", () => {
      const validResponse = {
        choices: [
          { message: { content: "content1" } },
          { message: { content: "content2" } },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 100,
        },
      };

      expect(() => validateCerebrasResponse(validResponse, "test-decomposer")).not.toThrow();
    });

    it("should validate response with zero token usage", () => {
      const validResponse = {
        choices: [{ message: { content: "{}" } }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
        },
      };

      expect(() => validateCerebrasResponse(validResponse, "test-decomposer")).not.toThrow();
    });
  });

  describe("Negative Cases - Malformed API Responses", () => {
    it("should reject response with empty choices array", () => {
      const invalidResponse = {
        choices: [],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      };

      expect(() => validateCerebrasResponse(invalidResponse, "test-decomposer")).toThrow(
        /returned no choices/
      );
    });

    it("should reject response with missing choices", () => {
      const invalidResponse = {
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      } as any;

      expect(() => validateCerebrasResponse(invalidResponse, "test-decomposer")).toThrow();
    });

    it("should reject response with missing usage", () => {
      const invalidResponse = {
        choices: [{ message: { content: "content" } }],
      } as any;

      expect(() => validateCerebrasResponse(invalidResponse, "test-decomposer")).toThrow();
    });

    it("should reject response with negative token counts", () => {
      const invalidResponse = {
        choices: [{ message: { content: "content" } }],
        usage: {
          prompt_tokens: -1,
          completion_tokens: 50,
        },
      };

      expect(() => validateCerebrasResponse(invalidResponse, "test-decomposer")).toThrow();
    });

    it("should reject response with missing message.content", () => {
      const invalidResponse = {
        choices: [{ message: {} }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      } as any;

      expect(() => validateCerebrasResponse(invalidResponse, "test-decomposer")).toThrow();
    });
  });
});

// =============================================
// Task 3 Tests: Decomposition Output Validation
// =============================================

describe("validateDecompositionOutput", () => {
  describe("Positive Cases", () => {
    it("should validate valid decomposition with 1 task", () => {
      const validOutput = {
        microTasks: [
          {
            id: "task-1",
            title: "Implement authentication",
            description: "Add OAuth 2.0",
            priority: "high" as const,
            rationale: "Security requirement",
            dependencies: [],
          },
        ],
        recommendations: ["Use JWT tokens", "Enable 2FA"],
      };

      expect(() => validateDecompositionOutput(validOutput, "test-decomposer")).not.toThrow();
    });

    it("should validate decomposition with multiple tasks", () => {
      const validOutput = {
        microTasks: [
          {
            id: "task-1",
            title: "Setup database",
            description: "Configure PostgreSQL",
            priority: "critical" as const,
          },
          {
            id: "task-2",
            title: "Create API",
            description: "Build REST endpoints",
            priority: "medium" as const,
          },
        ],
      };

      expect(() => validateDecompositionOutput(validOutput, "test-decomposer")).not.toThrow();
    });

    it("should validate decomposition without recommendations", () => {
      const validOutput = {
        microTasks: [
          {
            id: "task-1",
            title: "Minimal task",
            description: "Simple task",
            priority: "low" as const,
          },
        ],
      };

      expect(() => validateDecompositionOutput(validOutput, "test-decomposer")).not.toThrow();
    });
  });

  describe("Negative Cases - Empty or Invalid Tasks", () => {
    it("should reject decomposition with 0 tasks", () => {
      const invalidOutput = {
        microTasks: [],
        recommendations: ["Some recommendations"],
      };

      expect(() => validateDecompositionOutput(invalidOutput, "test-decomposer")).toThrow(
        /returned 0 tasks/
      );
    });

    it("should reject decomposition with missing microTasks", () => {
      const invalidOutput = {
        recommendations: ["Some recommendations"],
      } as any;

      expect(() => validateDecompositionOutput(invalidOutput, "test-decomposer")).toThrow();
    });

    it("should reject task with invalid priority", () => {
      const invalidOutput = {
        microTasks: [
          {
            id: "task-1",
            title: "Task",
            description: "Description",
            priority: "urgent", // Invalid priority
          },
        ],
      } as any;

      expect(() => validateDecompositionOutput(invalidOutput, "test-decomposer")).toThrow();
    });

    it("should reject task with missing required fields", () => {
      const invalidOutput = {
        microTasks: [
          {
            id: "task-1",
            title: "Task",
            // Missing description and priority
          },
        ],
      } as any;

      expect(() => validateDecompositionOutput(invalidOutput, "test-decomposer")).toThrow();
    });
  });
});

// =============================================
// Task 5 Tests: Task Count Validation
// =============================================

describe("validateTaskCount", () => {
  describe("Positive Cases", () => {
    it("should accept task count of 1", () => {
      expect(() => validateTaskCount(1, "test-decomposer")).not.toThrow();
    });

    it("should accept task count in optimal range (12-16)", () => {
      expect(() => validateTaskCount(12, "test-decomposer")).not.toThrow();
      expect(() => validateTaskCount(14, "test-decomposer")).not.toThrow();
      expect(() => validateTaskCount(16, "test-decomposer")).not.toThrow();
    });

    it("should accept task count below warning threshold (<=50)", () => {
      expect(() => validateTaskCount(25, "test-decomposer")).not.toThrow();
      expect(() => validateTaskCount(50, "test-decomposer")).not.toThrow();
    });
  });

  describe("Negative Cases - Critical Failures", () => {
    it("should reject task count of 0", () => {
      expect(() => validateTaskCount(0, "test-decomposer")).toThrow(
        /returned 0 tasks - cannot proceed/
      );
    });

    it("should reject negative task count", () => {
      expect(() => validateTaskCount(-1, "test-decomposer")).toThrow();
    });
  });

  describe("Warning Cases - High Task Counts", () => {
    it("should warn for task count above 50", () => {
      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      validateTaskCount(51, "test-decomposer");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("produced 51 tasks")
      );

      validateTaskCount(100, "test-decomposer");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("produced 100 tasks")
      );

      consoleWarnSpy.mockRestore();
    });
  });
});

// =============================================
// Integration Tests - Full Validation Flow
// =============================================

describe("Integration: Full Validation Flow", () => {
  it("should validate complete decomposer workflow", () => {
    // Step 1: Validate input
    const input = {
      taskId: "integration-test-1",
      taskDescription: "Build complete authentication system with OAuth",
      workDir: "/workspace/auth-service",
    };
    expect(() => validateDecomposerInput(input, "architecture-decomposer")).not.toThrow();

    // Step 2: Validate API response
    const apiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              microTasks: [
                {
                  id: "auth-1",
                  title: "Setup OAuth provider",
                  description: "Configure Google OAuth",
                  priority: "critical",
                  rationale: "Core auth requirement",
                  dependencies: [],
                },
                {
                  id: "auth-2",
                  title: "Implement JWT tokens",
                  description: "Create token generation logic",
                  priority: "high",
                  rationale: "Session management",
                  dependencies: ["auth-1"],
                },
              ],
              recommendations: ["Use refresh tokens", "Implement rate limiting"],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 250, completion_tokens: 150 },
    };
    expect(() => validateCerebrasResponse(apiResponse, "architecture-decomposer")).not.toThrow();

    // Step 3: Parse and validate decomposition output
    const parsedContent = JSON.parse(apiResponse.choices[0].message.content);
    expect(() =>
      validateDecompositionOutput(parsedContent, "architecture-decomposer")
    ).not.toThrow();

    // Step 4: Validate task count
    expect(() =>
      validateTaskCount(parsedContent.microTasks.length, "architecture-decomposer")
    ).not.toThrow();
  });
});
