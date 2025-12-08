import { task } from "@trigger.dev/sdk/v3";

export const testTask = task({
  id: "test-task",
  run: async (payload: { message: string }) => {
    return {
      success: true,
      message: `Received: ${payload.message}`,
      timestamp: new Date().toISOString(),
    };
  },
});