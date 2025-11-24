/**
 * Trigger.dev Client Configuration
 *
 * Initializes the trigger.dev SDK client for CFN Loop agent orchestration
 * with comprehensive environment validation and error handling.
 */

import { TriggerClient } from "@trigger.dev/sdk";
import { validateEnvironment, getValidatedConfig, validateDockerConfig } from "./config";
import { EnvironmentValidationError } from "./types";

/**
 * Initialize and validate environment before creating client
 */
function initializeClient(): TriggerClient {
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

    // Initialize trigger.dev client with validated configuration
    const client = new TriggerClient({
      id: config.triggerProjectSlug,
      apiKey: config.triggerApiKey,
      apiUrl: config.triggerApiUrl,
    });

    return client;
  } catch (error) {
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

// Create and export configured client
export const client = initializeClient();

// Export configuration for job access
export { getValidatedConfig };

// Import and register all jobs
import "./jobs";
