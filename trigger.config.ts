import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  project: process.env.TRIGGER_PROJECT_ID || "proj_uuvpcrkpfruhlpbpzlov",
  triggerUrl: process.env.TRIGGER_ENDPOINT || "http://localhost:8030",
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