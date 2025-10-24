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
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Single Batched Call (Best Practice)", () => {
    it("should pass validation for single call with 5+ items", () => {
      const todos = createTodos(5);
      const result = validator.validateBatching(todos);

      expect(result.isValid).toBe(true);
      expect(result.callCount).toBe(1);
      expect(result.totalItems).toBe(5);
      expect(result.warnings).toHaveLength(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should pass validation for single call with 10+ items", () => {
      const todos = createTodos(10);
      const result = validator.validateBatching(todos);

      expect(result.isValid).toBe(true);
      expect(result.callCount).toBe(1);
      expect(result.totalItems).toBe(10);
      expect(result.warnings).toHaveLength(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should provide recommendation for single call with <5 items", () => {
      const todos = createTodos(3);
      const result = validator.validateBatching(todos);

      expect(result.isValid).toBe(true);
      expect(result.callCount).toBe(1);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain("Consider adding more todos");
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should detect anti-pattern with 3+ calls in window", () => {
      validator.validateBatching(createTodos(1));
      validator.validateBatching(createTodos(2));
      const result3 = validator.validateBatching(createTodos(1));

      expect(result3.isValid).toBe(false);
      expect(result3.callCount).toBe(3);
      expect(result3.totalItems).toBe(4);
      expect(result3.averageItemsPerCall).toBeCloseTo(1.33, 2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Time Window Management", () => {
    it("should clear calls outside 5-minute window", async () => { try {
      // Use short time window for testing (1 second)
      const shortWindowValidator = new TodoWriteValidator({
        timeWindowMs: 1000,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      shortWindowValidator.validateBatching(createTodos(1));
      const stats1 = shortWindowValidator.getStatistics();
      expect(stats1.callsInWindow).toBe(1);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      shortWindowValidator.validateBatching(createTodos(1));
      const stats2 = shortWindowValidator.getStatistics();
      expect(stats2.callsInWindow).toBe(1); // Old call cleaned up
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should track multiple calls within window", () => {
      validator.validateBatching(createTodos(2));
      validator.validateBatching(createTodos(3));
      validator.validateBatching(createTodos(1));

      const stats = validator.getStatistics();
      expect(stats.callsInWindow).toBe(3);
      expect(stats.totalCalls).toBe(3);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Strict Mode", () => {
    it("should throw error in strict mode when anti-pattern detected", () => {
      const strictValidator = new TodoWriteValidator({ strictMode: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      strictValidator.validateBatching(createTodos(1));

      expect(() => {
        strictValidator.validateBatching(createTodos(1));
      }).toThrow("TodoWrite Batching Violation");
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should include recommendations in error message", () => {
      const strictValidator = new TodoWriteValidator({ strictMode: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      strictValidator.validateBatching(createTodos(1));

      try {
        strictValidator.validateBatching(createTodos(1));
        fail("Should have thrown error");
      } catch (error) {
        expect((error as Error).message).toContain("Recommendations:");
        expect((error as Error).message).toContain("Batch ALL todos");
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should not throw in strict mode when following best practices", () => {
      const strictValidator = new TodoWriteValidator({ strictMode: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(() => {
        strictValidator.validateBatching(createTodos(7));
      }).not.toThrow();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Configuration Customization", () => {
    it("should respect custom time window", async () => { try {
      const customValidator = new TodoWriteValidator({ timeWindowMs: 500 } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      customValidator.validateBatching(createTodos(1));
      await new Promise((resolve) => setTimeout(resolve, 600));
      const result = customValidator.validateBatching(createTodos(1));

      expect(result.isValid).toBe(true); // Old call outside window
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should respect custom call threshold", () => {
      const customValidator = new TodoWriteValidator({ callThreshold: 3 } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      customValidator.validateBatching(createTodos(1));
      const result2 = customValidator.validateBatching(createTodos(1));
      expect(result2.isValid).toBe(true); // Still under threshold

      const result3 = customValidator.validateBatching(createTodos(1));
      expect(result3.isValid).toBe(false); // Threshold reached
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should respect custom minimum items recommendation", () => {
      const customValidator = new TodoWriteValidator({
        minRecommendedItems: 10,
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const result = customValidator.validateBatching(createTodos(7));
      expect(result.recommendations.some((r) => r.includes("10+"))).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should allow updating configuration after creation", () => {
      validator.updateConfig({ callThreshold: 5 } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Make 4 calls - should still be valid
      for (let i = 0; i < 4; i++) {
        const result = validator.validateBatching(createTodos(1));
        expect(result.isValid).toBe(true);
      }

      // 5th call triggers threshold
      const result5 = validator.validateBatching(createTodos(1));
      expect(result5.isValid).toBe(false);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Statistics and State Management", () => {
    it("should track accurate statistics", () => {
      validator.validateBatching(createTodos(5));
      validator.validateBatching(createTodos(3));
      validator.validateBatching(createTodos(2));

      const stats = validator.getStatistics();
      expect(stats.totalCalls).toBe(3);
      expect(stats.callsInWindow).toBe(3);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should reset state correctly", () => {
      validator.validateBatching(createTodos(1));
      validator.validateBatching(createTodos(1));

      expect(validator.isCurrentlyValid()).toBe(false);

      validator.reset();
      expect(validator.isCurrentlyValid()).toBe(true);
      expect(validator.getStatistics().totalCalls).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should check current validity status", () => {
      expect(validator.isCurrentlyValid()).toBe(true);

      validator.validateBatching(createTodos(1));
      expect(validator.isCurrentlyValid()).toBe(true);

      validator.validateBatching(createTodos(1));
      expect(validator.isCurrentlyValid()).toBe(false);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Global Validator Singleton", () => {
    afterEach(() => {
      resetGlobalValidator();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should create global validator instance", () => {
      const global1 = getGlobalValidator();
      const global2 = getGlobalValidator();

      expect(global1).toBe(global2); // Same instance
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should maintain state across global calls", () => {
      const global1 = getGlobalValidator();
      global1.validateBatching(createTodos(1));

      const global2 = getGlobalValidator();
      global2.validateBatching(createTodos(1));

      expect(global2.getStatistics().callsInWindow).toBe(2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should allow updating global config", () => {
      const global1 = getGlobalValidator({ callThreshold: 5 } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(global1.getStatistics().threshold).toBe(5);

      const global2 = getGlobalValidator({ callThreshold: 3 } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(global2.getStatistics().threshold).toBe(3);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should reset global validator state", () => {
      const global = getGlobalValidator();
      global.validateBatching(createTodos(1));

      resetGlobalValidator();

      const newGlobal = getGlobalValidator();
      expect(newGlobal.getStatistics().totalCalls).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Verbose Mode Logging", () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    afterEach(() => {
      consoleLogSpy.mockRestore();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should log detailed statistics in verbose mode", () => {
      const verboseValidator = new TodoWriteValidator({ verbose: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      verboseValidator.validateBatching(createTodos(1));
      verboseValidator.validateBatching(createTodos(2));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("TodoWrite Call Statistics"),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Total calls in window: 2"),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should not log in non-verbose mode", () => {
      const quietValidator = new TodoWriteValidator({ verbose: false } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      quietValidator.validateBatching(createTodos(1));
      quietValidator.validateBatching(createTodos(1));

      expect(consoleLogSpy).not.toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Warning Message Format", () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should show time window in minutes", () => {
      validator.validateBatching(createTodos(1));
      validator.validateBatching(createTodos(1));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("5 minutes"),
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe("Edge Cases", () => {
    it("should handle empty todo array", () => {
      const result = validator.validateBatching([]);
      expect(result.isValid).toBe(true);
      expect(result.totalItems).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle rapid consecutive calls", () => {
      for (let i = 0; i < 5; i++) {
        validator.validateBatching(createTodos(1));
      }

      const stats = validator.getStatistics();
      expect(stats.callsInWindow).toBe(5);
      expect(stats.totalCalls).toBe(5);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should maintain accuracy with large batches", () => {
      const result = validator.validateBatching(createTodos(100));

      expect(result.isValid).toBe(true);
      expect(result.totalItems).toBe(100);
      expect(result.callCount).toBe(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it("should handle threshold edge case (exactly at threshold)", () => {
      validator.validateBatching(createTodos(1));
      const result = validator.validateBatching(createTodos(1));

      // Exactly at threshold (2) should trigger warning
      expect(result.isValid).toBe(false);
      expect(result.callCount).toBe(2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

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
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
