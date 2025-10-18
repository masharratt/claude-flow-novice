/**
 * Unit Tests for TodoWrite Batching Validator
 *
 * Tests validation of TodoWrite call patterns to detect anti-patterns
 * where multiple small calls are made instead of single batched calls.
 *
 * Test Categories:
 * 1. Single batched call (PASS) - ≥5 items in one call
 * 2. Multiple calls in window (WARN) - ≥2 calls within 5 minutes
 * 3. Calls outside window (PASS) - Calls >5 minutes apart
 * 4. Strict mode enforcement (ERROR) - Throw error on anti-pattern
 * 5. Configuration customization - Custom thresholds and windows
 *
 * @module tests/validators/todowrite-batching-validator
 */

import {
  TodoWriteValidator,
  getGlobalValidator,
  resetGlobalValidator,
  type Todo,
  type ValidationResult,
} from "../../src/validators/todowrite-batching-validator";

describe("TodoWriteValidator", () => {
  let validator: TodoWriteValidator;

  // Helper to create test todos
  const createTodos = (count: number): Todo[] => {
    return Array.from({ length: count }, (_, i) => ({
      content: `Task ${i + 1}`,
      status: "pending" as const,
      activeForm: `Doing task ${i + 1}`,
    }));
  };

  beforeEach(() => {
    validator = new TodoWriteValidator();
  });

  describe("Single Batched Call (Best Practice)", () => {
    it("should pass validation for single call with 5+ items", () => {
      const todos = createTodos(5);
      const result = validator.validateBatching(todos);

      expect(result.isValid).toBe(true);
      expect(result.callCount).toBe(1);
      expect(result.totalItems).toBe(5);
      expect(result.warnings).toHaveLength(0);
    });

    it("should pass validation for single call with 10+ items", () => {
      const todos = createTodos(10);
      const result = validator.validateBatching(todos);

      expect(result.isValid).toBe(true);
      expect(result.callCount).toBe(1);
      expect(result.totalItems).toBe(10);
      expect(result.warnings).toHaveLength(0);
    });

    it("should provide recommendation for single call with <5 items", () => {
      const todos = createTodos(3);
      const result = validator.validateBatching(todos);

      expect(result.isValid).toBe(true);
      expect(result.callCount).toBe(1);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain("Consider adding more todos");
    });
  });

  describe("Multiple Calls Anti-Pattern Detection", () => {
    it("should detect anti-pattern with 2 calls in 5-minute window", () => {
      // First call
      const result1 = validator.validateBatching(createTodos(1));
      expect(result1.isValid).toBe(true); // First call is fine

      // Second call triggers anti-pattern
      const result2 = validator.validateBatching(createTodos(1));
      expect(result2.isValid).toBe(false);
      expect(result2.callCount).toBe(2);
      expect(result2.warnings.length).toBeGreaterThan(0);
      expect(result2.warnings[0]).toContain(
        "TODOWRITE BATCHING ANTI-PATTERN DETECTED",
      );
    });

    it("should detect anti-pattern with 3+ calls in window", () => {
      validator.validateBatching(createTodos(1));
      validator.validateBatching(createTodos(2));
      const result3 = validator.validateBatching(createTodos(1));

      expect(result3.isValid).toBe(false);
      expect(result3.callCount).toBe(3);
      expect(result3.totalItems).toBe(4);
      expect(result3.averageItemsPerCall).toBeCloseTo(1.33, 2);
    });

    it("should include detailed recommendations in warnings", () => {
      validator.validateBatching(createTodos(1));
      const result = validator.validateBatching(createTodos(1));

      expect(result.recommendations).toContain(
        "Batch ALL todos in SINGLE TodoWrite call with 5+ items",
      );
      expect(result.recommendations.some((r) => r.includes("CLAUDE.md"))).toBe(
        true,
      );
      expect(result.recommendations.some((r) => r.includes("Example:"))).toBe(
        true,
      );
    });
  });

  describe("Time Window Management", () => {
    it("should clear calls outside 5-minute window", async () => {
      // Use short time window for testing (1 second)
      const shortWindowValidator = new TodoWriteValidator({
        timeWindowMs: 1000,
      });

      shortWindowValidator.validateBatching(createTodos(1));
      const stats1 = shortWindowValidator.getStatistics();
      expect(stats1.callsInWindow).toBe(1);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      shortWindowValidator.validateBatching(createTodos(1));
      const stats2 = shortWindowValidator.getStatistics();
      expect(stats2.callsInWindow).toBe(1); // Old call cleaned up
    });

    it("should track multiple calls within window", () => {
      validator.validateBatching(createTodos(2));
      validator.validateBatching(createTodos(3));
      validator.validateBatching(createTodos(1));

      const stats = validator.getStatistics();
      expect(stats.callsInWindow).toBe(3);
      expect(stats.totalCalls).toBe(3);
    });
  });

  describe("Strict Mode", () => {
    it("should throw error in strict mode when anti-pattern detected", () => {
      const strictValidator = new TodoWriteValidator({ strictMode: true });

      strictValidator.validateBatching(createTodos(1));

      expect(() => {
        strictValidator.validateBatching(createTodos(1));
      }).toThrow("TodoWrite Batching Violation");
    });

    it("should include recommendations in error message", () => {
      const strictValidator = new TodoWriteValidator({ strictMode: true });

      strictValidator.validateBatching(createTodos(1));

      try {
        strictValidator.validateBatching(createTodos(1));
        fail("Should have thrown error");
      } catch (error) {
        expect((error as Error).message).toContain("Recommendations:");
        expect((error as Error).message).toContain("Batch ALL todos");
      }
    });

    it("should not throw in strict mode when following best practices", () => {
      const strictValidator = new TodoWriteValidator({ strictMode: true });

      expect(() => {
        strictValidator.validateBatching(createTodos(7));
      }).not.toThrow();
    });
  });

  describe("Configuration Customization", () => {
    it("should respect custom time window", async () => {
      const customValidator = new TodoWriteValidator({ timeWindowMs: 500 });

      customValidator.validateBatching(createTodos(1));
      await new Promise((resolve) => setTimeout(resolve, 600));
      const result = customValidator.validateBatching(createTodos(1));

      expect(result.isValid).toBe(true); // Old call outside window
    });

    it("should respect custom call threshold", () => {
      const customValidator = new TodoWriteValidator({ callThreshold: 3 });

      customValidator.validateBatching(createTodos(1));
      const result2 = customValidator.validateBatching(createTodos(1));
      expect(result2.isValid).toBe(true); // Still under threshold

      const result3 = customValidator.validateBatching(createTodos(1));
      expect(result3.isValid).toBe(false); // Threshold reached
    });

    it("should respect custom minimum items recommendation", () => {
      const customValidator = new TodoWriteValidator({
        minRecommendedItems: 10,
      });

      const result = customValidator.validateBatching(createTodos(7));
      expect(result.recommendations.some((r) => r.includes("10+"))).toBe(true);
    });

    it("should allow updating configuration after creation", () => {
      validator.updateConfig({ callThreshold: 5 });

      // Make 4 calls - should still be valid
      for (let i = 0; i < 4; i++) {
        const result = validator.validateBatching(createTodos(1));
        expect(result.isValid).toBe(true);
      }

      // 5th call triggers threshold
      const result5 = validator.validateBatching(createTodos(1));
      expect(result5.isValid).toBe(false);
    });
  });

  describe("Statistics and State Management", () => {
    it("should track accurate statistics", () => {
      validator.validateBatching(createTodos(5));
      validator.validateBatching(createTodos(3));
      validator.validateBatching(createTodos(2));

      const stats = validator.getStatistics();
      expect(stats.totalCalls).toBe(3);
      expect(stats.callsInWindow).toBe(3);
    });

    it("should reset state correctly", () => {
      validator.validateBatching(createTodos(1));
      validator.validateBatching(createTodos(1));

      expect(validator.isCurrentlyValid()).toBe(false);

      validator.reset();
      expect(validator.isCurrentlyValid()).toBe(true);
      expect(validator.getStatistics().totalCalls).toBe(0);
    });

    it("should check current validity status", () => {
      expect(validator.isCurrentlyValid()).toBe(true);

      validator.validateBatching(createTodos(1));
      expect(validator.isCurrentlyValid()).toBe(true);

      validator.validateBatching(createTodos(1));
      expect(validator.isCurrentlyValid()).toBe(false);
    });
  });

  describe("Global Validator Singleton", () => {
    afterEach(() => {
      resetGlobalValidator();
    });

    it("should create global validator instance", () => {
      const global1 = getGlobalValidator();
      const global2 = getGlobalValidator();

      expect(global1).toBe(global2); // Same instance
    });

    it("should maintain state across global calls", () => {
      const global1 = getGlobalValidator();
      global1.validateBatching(createTodos(1));

      const global2 = getGlobalValidator();
      global2.validateBatching(createTodos(1));

      expect(global2.getStatistics().callsInWindow).toBe(2);
    });

    it("should allow updating global config", () => {
      const global1 = getGlobalValidator({ callThreshold: 5 });
      expect(global1.getStatistics().threshold).toBe(5);

      const global2 = getGlobalValidator({ callThreshold: 3 });
      expect(global2.getStatistics().threshold).toBe(3);
    });

    it("should reset global validator state", () => {
      const global = getGlobalValidator();
      global.validateBatching(createTodos(1));

      resetGlobalValidator();

      const newGlobal = getGlobalValidator();
      expect(newGlobal.getStatistics().totalCalls).toBe(0);
    });
  });

  describe("Verbose Mode Logging", () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it("should log detailed statistics in verbose mode", () => {
      const verboseValidator = new TodoWriteValidator({ verbose: true });

      verboseValidator.validateBatching(createTodos(1));
      verboseValidator.validateBatching(createTodos(2));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("TodoWrite Call Statistics"),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Total calls in window: 2"),
      );
    });

    it("should not log in non-verbose mode", () => {
      const quietValidator = new TodoWriteValidator({ verbose: false });

      quietValidator.validateBatching(createTodos(1));
      quietValidator.validateBatching(createTodos(1));

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe("Warning Message Format", () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it("should display formatted warning with call details", () => {
      validator.validateBatching(createTodos(2));
      validator.validateBatching(createTodos(3));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("TODOWRITE BATCHING ANTI-PATTERN DETECTED"),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Call #1: 2 items"),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Call #2: 3 items"),
      );
    });

    it("should show time window in minutes", () => {
      validator.validateBatching(createTodos(1));
      validator.validateBatching(createTodos(1));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("5 minutes"),
      );
    });

    it("should include statistics in warning", () => {
      validator.validateBatching(createTodos(2));
      validator.validateBatching(createTodos(3));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Total calls: 2"),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Total items: 5"),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Average items per call: 2.50"),
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty todo array", () => {
      const result = validator.validateBatching([]);
      expect(result.isValid).toBe(true);
      expect(result.totalItems).toBe(0);
    });

    it("should handle rapid consecutive calls", () => {
      for (let i = 0; i < 5; i++) {
        validator.validateBatching(createTodos(1));
      }

      const stats = validator.getStatistics();
      expect(stats.callsInWindow).toBe(5);
      expect(stats.totalCalls).toBe(5);
    });

    it("should maintain accuracy with large batches", () => {
      const result = validator.validateBatching(createTodos(100));

      expect(result.isValid).toBe(true);
      expect(result.totalItems).toBe(100);
      expect(result.callCount).toBe(1);
    });

    it("should handle threshold edge case (exactly at threshold)", () => {
      validator.validateBatching(createTodos(1));
      const result = validator.validateBatching(createTodos(1));

      // Exactly at threshold (2) should trigger warning
      expect(result.isValid).toBe(false);
      expect(result.callCount).toBe(2);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should detect incremental todo additions (bad pattern)", () => {
      // Developer adds todos one by one instead of batching
      validator.validateBatching([
        { content: "Task 1", status: "pending", activeForm: "Doing task 1" },
      ]);

      validator.validateBatching([
        { content: "Task 2", status: "pending", activeForm: "Doing task 2" },
      ]);

      const result3 = validator.validateBatching([
        { content: "Task 3", status: "pending", activeForm: "Doing task 3" },
      ]);

      expect(result3.isValid).toBe(false);
      expect(result3.recommendations).toContain(
        "Batch ALL todos in SINGLE TodoWrite call with 5+ items",
      );
    });

    it("should approve proper batch workflow (good pattern)", () => {
      // Developer creates all todos at once
      const result = validator.validateBatching([
        {
          content: "Analyze requirements",
          status: "pending",
          activeForm: "Analyzing requirements",
        },
        {
          content: "Design architecture",
          status: "pending",
          activeForm: "Designing architecture",
        },
        {
          content: "Implement features",
          status: "pending",
          activeForm: "Implementing features",
        },
        {
          content: "Write tests",
          status: "pending",
          activeForm: "Writing tests",
        },
        {
          content: "Review code",
          status: "pending",
          activeForm: "Reviewing code",
        },
        {
          content: "Deploy to staging",
          status: "pending",
          activeForm: "Deploying to staging",
        },
        {
          content: "Run integration tests",
          status: "pending",
          activeForm: "Running integration tests",
        },
      ]);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.totalItems).toBe(7);
    });

    it("should handle status updates correctly", () => {
      // Initial batch (good)
      validator.validateBatching(createTodos(5));

      // Wait a bit
      jest.useFakeTimers();
      jest.advanceTimersByTime(60000); // 1 minute

      // Status update batch (should still pass)
      const result = validator.validateBatching([
        {
          content: "Task 1",
          status: "completed",
          activeForm: "Completing task 1",
        },
        {
          content: "Task 2",
          status: "completed",
          activeForm: "Completing task 2",
        },
      ]);

      expect(result.isValid).toBe(false); // 2 calls within window
      jest.useRealTimers();
    });
  });
});
