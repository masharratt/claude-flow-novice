/**
 * Trigger.dev Client Configuration
 *
 * Initializes the trigger.dev SDK client for CFN Loop agent orchestration
 * with comprehensive environment validation and error handling.
 */

import { validateEnvironment, getValidatedConfig, validateDockerConfig } from "./config.js";
import { EnvironmentValidationError } from "./types.js";
import type { ValidatedEnvironment } from "./types.js";

/**
 * Initialize and validate environment before creating client
 */
function initializeClient(): ValidatedEnvironment {
  try {
    // Validate all required environment variables
    const config = validateEnvironment();

    // Validate Docker configuration
    if (!validateDockerConfig(config)) {
      throw new Error(
        "Docker configuration is invalid. Check DOCKER_HOST or DOCKER_SOCKET."
      );
    }

    // Log successful validation
    console.log(
      `[Trigger.dev] Environment validated successfully (${config.validationTime.toISOString()})`
    );
    console.log(
      `[Trigger.dev] Project: ${config.triggerProjectSlug}, Workspace: ${config.workspacePath}`
    );

    return config;
  } catch (error: unknown) {
    if (error instanceof EnvironmentValidationError) {
      console.error("[Trigger.dev] Environment validation failed:");
      error.errors.forEach((err) => {
        console.error(`  - ${err}`);
      });
      process.exit(1);
    } else {
      console.error("[Trigger.dev] Initialization failed:", error);
      process.exit(1);
    }
  }
}

// Create and export validated configuration
export const validatedConfig = initializeClient();

// Export configuration helper
export { getValidatedConfig };

// Export types
export type { ValidatedEnvironment };

// Import and register all jobs
import "./jobs/index.js";
