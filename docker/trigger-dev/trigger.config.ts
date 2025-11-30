/**
 * Trigger.dev v4 Configuration
 *
 * Configuration file for self-hosted Trigger.dev instance with MDAP v2 Cerebras/Sonnet providers.
 */

import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  project: "proj_uuvpcrkpfruhlpbpzlov",
  // Self-hosted configuration - Trigger.dev v4 on port 8030
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",
  // Required: max task duration (in seconds)
  // Coordinator: spawns decomposers + implementers + validators (~10-15 min for full loop)
  // Implementers: Claude Code CLI execution (~2-3 min each)
  // Decomposers/Validators: Cerebras API calls (~30s each)
  maxDuration: 900, // 15 minutes (covers coordinator orchestrating full CFN Loop)
  // Retry configuration
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 5000,
    },
  },
  // Task directories
  dirs: ["./src/trigger"],
  // Build configuration - externalize native modules and AI SDKs
  build: {
    external: [
      "cpu-features",
      "ssh2",
      "dockerode",
      "@anthropic-ai/sdk", // Sonnet provider
      "axios", // HTTP requests for Cerebras
    ],
  },
};

