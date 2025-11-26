/**
 * Trigger.dev v4 Configuration
 *
 * Configuration file for self-hosted Trigger.dev instance.
 */

import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  project: "proj_uuvpcrkpfruhlpbpzlov",
  // Self-hosted configuration - Trigger.dev v4 on port 8030
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",
  // Required: max task duration (in seconds)
  maxDuration: 600, // 10 minutes (allows time for CLI + post-edit validation)
  // Retry configuration
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
    },
  },
  // Task directories
  dirs: ["./src/trigger"],
};
