/**
 * TodoWrite Batching Validator
 *
 * Detects and warns about TodoWrite anti-patterns where multiple small calls
 * are made instead of a single batched call with 5-10+ items.
 *
 * Anti-pattern example (bad):
 *   TodoWrite([{...}])  // Call 1: 1 item
 *   TodoWrite([{...}])  // Call 2: 1 item
 *   TodoWrite([{...}])  // Call 3: 1 item
 *
 * Best practice (good):
 *   TodoWrite([{...}, {...}, {...}, {...}, {...}])  // Single call: 5+ items
 *
 * @module validators/todowrite-batching-validator
 */

export interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

export interface TodoWriteCallLog {
  timestamp: number;
  count: number;
  callIndex: number;
}

export interface TodoWriteValidatorConfig {
  /** Time window in milliseconds for detecting batching anti-patterns (default: 5 minutes) */
  timeWindowMs?: number;

  /** Threshold for number of calls within time window before warning (default: 2) */
  callThreshold?: number;

  /** If true, throw error instead of warning (default: false) */
  strictMode?: boolean;

  /** Minimum recommended items per TodoWrite call (default: 5) */
  minRecommendedItems?: number;

  /** Enable detailed logging for debugging (default: false) */
  verbose?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  callCount: number;
  totalItems: number;
  averageItemsPerCall: number;
  warnings: string[];
  recommendations: string[];
}

/**
 * Validates TodoWrite call patterns to ensure proper batching behavior
 *
 * Tracks call frequency within a sliding time window and detects anti-patterns
 * where multiple small calls are made instead of a single batched call.
 *
 * @example
 * ```typescript
 * const validator = new TodoWriteValidator({ strictMode: false });
 *
 * // Good: Single batched call
 * validator.validateBatching([
 *   { content: "Task 1", status: "pending", activeForm: "Doing task 1" },
 *   { content: "Task 2", status: "pending", activeForm: "Doing task 2" },
 *   { content: "Task 3", status: "pending", activeForm: "Doing task 3" },
 *   { content: "Task 4", status: "pending", activeForm: "Doing task 4" },
 *   { content: "Task 5", status: "pending", activeForm: "Doing task 5" }
 * ]); // ✅ No warning
 *
 * // Bad: Multiple small calls
 * validator.validateBatching([{ content: "Task 1", status: "pending", activeForm: "Doing task 1" }]);
 * validator.validateBatching([{ content: "Task 2", status: "pending", activeForm: "Doing task 2" }]);
 * // ⚠️ Warning: Batching anti-pattern detected
 * ```
 */
export class TodoWriteValidator {
  private callLog: TodoWriteCallLog[] = [];
  private totalCallCount = 0;

  private config: Required<TodoWriteValidatorConfig>;

  constructor(config: TodoWriteValidatorConfig = {}) {
    this.config = {
      timeWindowMs: config.timeWindowMs ?? 300000, // 5 minutes default
      callThreshold: config.callThreshold ?? 2,
      strictMode: config.strictMode ?? false,
      minRecommendedItems: config.minRecommendedItems ?? 5,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Validates a TodoWrite call and checks for batching anti-patterns
   *
   * @param todos - Array of todos being written
   * @throws Error if strictMode is enabled and anti-pattern detected
   * @returns ValidationResult with detailed analysis
   */
  validateBatching(todos: Todo[]): ValidationResult {
    const now = Date.now();
    this.totalCallCount++;

    // Log this call
    this.callLog.push({
      timestamp: now,
      count: todos.length,
      callIndex: this.totalCallCount,
    });

    // Clean old entries outside time window
    this.callLog = this.callLog.filter(
      (entry) => now - entry.timestamp < this.config.timeWindowMs,
    );

    // Calculate statistics
    const totalItems = this.callLog.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    const averageItemsPerCall = totalItems / this.callLog.length;

    const warnings: string[] = [];
    const recommendations: string[] = [];
    let isValid = true;

    // Check for anti-pattern: too many calls in time window
    if (this.callLog.length >= this.config.callThreshold) {
      isValid = false;

      const warningMessage = this.buildWarningMessage(
        totalItems,
        averageItemsPerCall,
      );
      warnings.push(warningMessage);

      // Generate specific recommendations
      recommendations.push(
        `Batch ALL todos in SINGLE TodoWrite call with ${this.config.minRecommendedItems}+ items`,
      );
      recommendations.push(
        `See CLAUDE.md: "TodoWrite batching requirement" and "1 MESSAGE = ALL RELATED OPERATIONS"`,
      );
      recommendations.push(
        `Example: TodoWrite([todo1, todo2, todo3, todo4, todo5]) instead of multiple calls`,
      );

      if (this.config.verbose) {
        console.log("\n📊 TodoWrite Call Statistics:");
        console.log(`   Total calls in window: ${this.callLog.length}`);
        console.log(`   Total items: ${totalItems}`);
        console.log(
          `   Average items per call: ${averageItemsPerCall.toFixed(2)}`,
        );
        console.log(`   Time window: ${this.config.timeWindowMs / 1000}s`);
      }

      // In strict mode, throw error
      if (this.config.strictMode) {
        throw new Error(
          `TodoWrite Batching Violation: ${warningMessage}\n\n` +
            `Recommendations:\n${recommendations.map((r) => `  - ${r}`).join("\n")}`,
        );
      }

      // Otherwise, log warning
      console.warn(warningMessage);
    }

    // Additional check: warn if single call has too few items (informational only)
    if (
      todos.length < this.config.minRecommendedItems &&
      this.callLog.length === 1
    ) {
      recommendations.push(
        `Consider adding more todos to this batch (current: ${todos.length}, recommended: ${this.config.minRecommendedItems}+)`,
      );
    }

    return {
      isValid,
      callCount: this.callLog.length,
      totalItems,
      averageItemsPerCall,
      warnings,
      recommendations,
    };
  }

  /**
   * Builds a detailed warning message for batching anti-patterns
   * @private
   */
  private buildWarningMessage(
    totalItems: number,
    averageItemsPerCall: number,
  ): string {
    const timeWindowMinutes = this.config.timeWindowMs / 60000;

    return `
⚠️ TODOWRITE BATCHING ANTI-PATTERN DETECTED

You have made ${this.callLog.length} TodoWrite calls in the last ${timeWindowMinutes} minutes.

Best Practice: Batch ALL todos in SINGLE TodoWrite call with ${this.config.minRecommendedItems}-10+ items.

Current calls (within ${timeWindowMinutes}min window):
${this.callLog
  .map(
    (entry, i) =>
      `  ${i + 1}. Call #${entry.callIndex}: ${entry.count} item${entry.count !== 1 ? "s" : ""} (${this.formatTimestamp(entry.timestamp)})`,
  )
  .join("\n")}

Statistics:
  - Total calls: ${this.callLog.length}
  - Total items: ${totalItems}
  - Average items per call: ${averageItemsPerCall.toFixed(2)}
  - Recommended: 1 call with ${this.config.minRecommendedItems}+ items

Impact:
  - Multiple calls waste API resources
  - Harder to track task relationships
  - Violates "1 MESSAGE = ALL RELATED OPERATIONS" principle

See CLAUDE.md: "TodoWrite batching requirement"
    `.trim();
  }

  /**
   * Formats timestamp for display in warning messages
   * @private
   */
  private formatTimestamp(timestamp: number): string {
    const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    const minutesAgo = Math.floor(secondsAgo / 60);
    return `${minutesAgo}m ago`;
  }

  /**
   * Gets current validation statistics
   */
  getStatistics(): {
    totalCalls: number;
    callsInWindow: number;
    timeWindowMs: number;
    threshold: number;
  } {
    return {
      totalCalls: this.totalCallCount,
      callsInWindow: this.callLog.length,
      timeWindowMs: this.config.timeWindowMs,
      threshold: this.config.callThreshold,
    };
  }

  /**
   * Resets the validator state (useful for testing)
   */
  reset(): void {
    this.callLog = [];
    this.totalCallCount = 0;
  }

  /**
   * Updates validator configuration
   */
  updateConfig(config: Partial<TodoWriteValidatorConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Checks if validation is currently passing (no anti-patterns detected)
   */
  isCurrentlyValid(): boolean {
    return this.callLog.length < this.config.callThreshold;
  }
}

/**
 * Global singleton instance for use across the application
 */
let globalValidator: TodoWriteValidator | null = null;

/**
 * Gets the global TodoWrite validator instance
 * Creates one if it doesn't exist
 */
export function getGlobalValidator(
  config?: TodoWriteValidatorConfig,
): TodoWriteValidator {
  if (!globalValidator) {
    globalValidator = new TodoWriteValidator(config);
  } else if (config) {
    globalValidator.updateConfig(config);
  }
  return globalValidator;
}

/**
 * Resets the global validator instance
 * Useful for testing and cleanup
 */
export function resetGlobalValidator(): void {
  if (globalValidator) {
    globalValidator.reset();
  }
  globalValidator = null;
}
