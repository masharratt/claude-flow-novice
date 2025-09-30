/**
 * TodoWrite Validator Integration
 *
 * Provides CLI flag support and tool integration for the TodoWrite batching validator.
 * Can be enabled via --validate-batching flag or VALIDATE_TODOWRITE_BATCHING env var.
 *
 * @module validators/todowrite-integration
 */

import { getGlobalValidator, type Todo } from "./todowrite-batching-validator";

/**
 * Environment variables for controlling validation
 */
const ENV_VALIDATE_BATCHING = "VALIDATE_TODOWRITE_BATCHING";
const ENV_STRICT_MODE = "TODOWRITE_STRICT_MODE";
const ENV_VERBOSE = "TODOWRITE_VERBOSE";

/**
 * Integration configuration
 */
export interface TodoWriteIntegrationConfig {
  enabled?: boolean;
  strictMode?: boolean;
  verbose?: boolean;
  timeWindowMs?: number;
  callThreshold?: number;
  minRecommendedItems?: number;
}

/**
 * Checks if validation is enabled via environment or config
 */
export function isValidationEnabled(
  config?: TodoWriteIntegrationConfig,
): boolean {
  // Check environment variable first
  if (process.env[ENV_VALIDATE_BATCHING] === "true") {
    return true;
  }

  // Check config
  return config?.enabled ?? false;
}

/**
 * Gets integration config from environment and explicit config
 */
export function getIntegrationConfig(
  explicitConfig?: TodoWriteIntegrationConfig,
): TodoWriteIntegrationConfig {
  return {
    enabled: isValidationEnabled(explicitConfig),
    strictMode:
      process.env[ENV_STRICT_MODE] === "true" || explicitConfig?.strictMode,
    verbose: process.env[ENV_VERBOSE] === "true" || explicitConfig?.verbose,
    timeWindowMs: explicitConfig?.timeWindowMs,
    callThreshold: explicitConfig?.callThreshold,
    minRecommendedItems: explicitConfig?.minRecommendedItems,
  };
}

/**
 * Validates a TodoWrite call with integrated configuration
 *
 * @param todos - Array of todos being written
 * @param config - Optional configuration override
 * @returns Validation result if enabled, null if disabled
 */
export function validateTodoWrite(
  todos: Todo[],
  config?: TodoWriteIntegrationConfig,
) {
  const integrationConfig = getIntegrationConfig(config);

  // Skip validation if not enabled
  if (!integrationConfig.enabled) {
    return null;
  }

  // Get global validator and update config
  const validator = getGlobalValidator({
    strictMode: integrationConfig.strictMode,
    verbose: integrationConfig.verbose,
    timeWindowMs: integrationConfig.timeWindowMs,
    callThreshold: integrationConfig.callThreshold,
    minRecommendedItems: integrationConfig.minRecommendedItems,
  });

  // Validate and return result
  return validator.validateBatching(todos);
}

/**
 * CLI argument parser for validation flags
 */
export function parseValidationFlags(
  args: string[],
): TodoWriteIntegrationConfig {
  const config: TodoWriteIntegrationConfig = {
    enabled: false,
    strictMode: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--validate-batching":
        config.enabled = true;
        break;

      case "--strict":
      case "--strict-mode":
        config.strictMode = true;
        break;

      case "--verbose":
      case "-v":
        config.verbose = true;
        break;

      case "--time-window":
        config.timeWindowMs = parseInt(args[++i], 10);
        break;

      case "--threshold":
        config.callThreshold = parseInt(args[++i], 10);
        break;

      case "--min-items":
        config.minRecommendedItems = parseInt(args[++i], 10);
        break;
    }
  }

  return config;
}

/**
 * Helper to display usage information
 */
export function displayValidationHelp(): void {
  console.log(
    `
TodoWrite Batching Validator - Usage

Detects anti-patterns where multiple small TodoWrite calls are made
instead of a single batched call with 5-10+ items.

CLI Flags:
  --validate-batching         Enable TodoWrite batching validation
  --strict, --strict-mode     Throw error on anti-pattern (default: warn)
  --verbose, -v               Show detailed statistics
  --time-window <ms>          Time window for detection (default: 300000 = 5min)
  --threshold <count>         Number of calls before warning (default: 2)
  --min-items <count>         Minimum recommended items (default: 5)

Environment Variables:
  VALIDATE_TODOWRITE_BATCHING=true    Enable validation globally
  TODOWRITE_STRICT_MODE=true          Enable strict mode globally
  TODOWRITE_VERBOSE=true              Enable verbose logging globally

Examples:
  # Enable validation with defaults
  npx claude-flow-novice task --validate-batching

  # Enable strict mode (throw error on anti-pattern)
  npx claude-flow-novice task --validate-batching --strict

  # Custom thresholds
  npx claude-flow-novice task --validate-batching --threshold 3 --time-window 600000

  # Via environment
  export VALIDATE_TODOWRITE_BATCHING=true
  npx claude-flow-novice task

Best Practice:
  Always batch ALL todos in SINGLE TodoWrite call with 5-10+ items.
  See CLAUDE.md: "TodoWrite batching requirement"
  `.trim(),
  );
}

/**
 * Example integration with TodoWrite tool
 * This function wraps the actual TodoWrite implementation
 */
export function todoWriteWithValidation(
  todos: Todo[],
  config?: TodoWriteIntegrationConfig,
): void {
  // Validate first if enabled
  const validationResult = validateTodoWrite(todos, config);

  if (validationResult && !validationResult.isValid) {
    console.warn("\n⚠️ TodoWrite Batching Issue Detected\n");
    console.warn("Recommendations:");
    validationResult.recommendations.forEach((rec, i) => {
      console.warn(`  ${i + 1}. ${rec}`);
    });
    console.warn("");
  }

  // Proceed with actual TodoWrite implementation
  // (This would call the real TodoWrite tool)
  // For now, just log what would be written
  if (config?.verbose) {
    console.log(`\n✅ Writing ${todos.length} todos...`);
  }
}

/**
 * Express middleware for validation (if using HTTP API)
 */
export function createValidationMiddleware(
  config?: TodoWriteIntegrationConfig,
) {
  return (req: any, res: any, next: any) => {
    if (req.body && Array.isArray(req.body.todos)) {
      try {
        validateTodoWrite(req.body.todos, config);
      } catch (error) {
        // In strict mode, validation errors become HTTP errors
        if (config?.strictMode) {
          return res.status(400).json({
            error: "TodoWrite Batching Violation",
            message: (error as Error).message,
          });
        }
      }
    }
    next();
  };
}

/**
 * Integration status checker
 */
export function getValidationStatus(): {
  enabled: boolean;
  strictMode: boolean;
  verbose: boolean;
  statistics: any;
} {
  const config = getIntegrationConfig();
  const validator = getGlobalValidator();

  return {
    enabled: config.enabled,
    strictMode: config.strictMode ?? false,
    verbose: config.verbose ?? false,
    statistics: validator.getStatistics(),
  };
}
