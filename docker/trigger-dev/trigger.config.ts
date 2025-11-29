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
  // Cerebras: 5-30s per task
  // Sonnet fallback: ~10s per task
  // CFN Loop validation: ~15s per task
  maxDuration: 120, // 2 minutes (covers all providers + iteration + validation)
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

