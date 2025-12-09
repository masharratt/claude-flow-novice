// ============================================================================
// DEPRECATION NOTICE
// ============================================================================
// Trigger.dev has been removed from the CFN Loop architecture
// This file is kept for backward compatibility with the SEO platform
// The SEO functionality will be refactored to use local execution
// The configuration is no longer used for trigger.dev deployment
// ============================================================================

// Trigger.dev configuration - placeholder implementation
// This file will be fully functional once @trigger.dev/sdk/v3 is installed

export interface TriggerConfig {
  project: string;
  maxDuration: number;
  retries?: {
    enabledInDev?: boolean;
    default?: {
      maxAttempts: number;
      factor: number;
      minTimeoutInMs: number;
      maxTimeoutInMs: number;
      randomize: boolean;
    };
  };
  dirs?: string[];
}

export const config: TriggerConfig = {
  project: process.env.TRIGGER_PROJECT_ID || "proj_uuvpcrkpfruhlpbpzlov",
  maxDuration: 600, // 10 minutes in seconds (required)
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
};

// Note: When @trigger.dev/sdk/v3 is installed, update the import to:
// import type { TriggerConfig } from "@trigger.dev/sdk/v3";
// Also remove the local interface definition above