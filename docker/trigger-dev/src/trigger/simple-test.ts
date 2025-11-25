/**
 * Simple Trigger.dev v4 Task for Testing
 *
 * Minimal task to verify Trigger.dev registration and execution.
 */

import { task } from "@trigger.dev/sdk/v3";

/**
 * Simple test task that just returns a greeting
 */
export const simpleTestTask = task({
  id: "simple-test",
  run: async (payload: { name: string }) => {
    console.log(`Hello, ${payload.name}!`);
    return {
      success: true,
      message: `Hello, ${payload.name}!`,
      timestamp: new Date().toISOString(),
    };
  },
});
