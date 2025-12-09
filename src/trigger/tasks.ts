// Trigger.dev tasks - placeholder implementation
// This file will be fully functional once @trigger.dev/sdk/v3 is installed

export interface TestTaskPayload {
  message: string;
}

export interface TestTaskResult {
  success: boolean;
  message: string;
  timestamp: string;
}

// Placeholder function for the actual task implementation
export const testTask = async (payload: TestTaskPayload): Promise<TestTaskResult> => {
  return {
    success: true,
    message: `Received: ${payload.message}`,
    timestamp: new Date().toISOString(),
  };
};

// Note: When @trigger.dev/sdk/v3 is installed, this file should be updated to:
// import { task } from "@trigger.dev/sdk/v3";
// And export the actual task definition