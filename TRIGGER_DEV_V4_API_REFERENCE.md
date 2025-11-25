# Trigger.dev v4 SDK API Reference

Comprehensive API reference for Trigger.dev v4 with emphasis on breaking changes from v3.

## Core Task API

### task() - Define a Task

Creates a new task definition.

```typescript
import { task } from "@trigger.dev/sdk/v3";

const myTask = task({
  id: "unique-task-id",           // Required: unique identifier
  retry?: {                        // Optional: retry configuration
    maxAttempts?: number;          // Default: 3
    factor?: number;               // Exponential backoff factor (default: 2)
    minTimeoutInMs?: number;       // Minimum retry delay (default: 1000ms)
    maxTimeoutInMs?: number;       // Maximum retry delay (default: 30000ms)
  };
  run: async (payload: T) => Result; // Main task function
});
```

**Example**:
```typescript
export const helloTask = task({
  id: "hello",
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: { name: string }) => {
    console.log(`Hello ${payload.name}`);
    return { message: `Greeted ${payload.name}` };
  },
});
```

## Invocation API

### tasks.invoke() - Trigger a Single Task

Invokes a task and waits for completion.

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

const result = await tasks.invoke<typeof myTask>(
  "task-id",
  { /* payload */ }
);
```

**Example**:
```typescript
const result = await tasks.invoke<typeof helloTask>(
  "hello",
  { name: "World" }
);

console.log(result); // { message: "Greeted World" }
```

### tasks.batchTrigger() - Trigger Multiple Tasks

Triggers multiple tasks in a batch. **BREAKING CHANGE IN V4**: `runs` may be undefined.

```typescript
const batchHandle = await tasks.batchTrigger<typeof myTask>(
  "task-id",
  [payload1, payload2, payload3]
);

// V4: ALWAYS use nullish coalescing!
const runs = batchHandle.runs ?? [];           // Safe
const batchId = batchHandle.batchId ?? "unknown"; // Safe
```

**Full Example**:
```typescript
import { tasks } from "@trigger.dev/sdk/v3";

const payloads = [
  { name: "Alice" },
  { name: "Bob" },
  { name: "Charlie" },
];

try {
  const batchHandle = await tasks.batchTrigger<typeof helloTask>(
    "hello",
    payloads
  );

  // CORRECT: Handle undefined runs
  const runs = batchHandle.runs ?? [];
  const batchId = batchHandle.batchId ?? "unknown";

  console.log(`Batch ${batchId} triggered ${runs.length} tasks`);

  // Wait for completion (optional)
  const statuses = runs.map(run => run.status);
  console.log(`Statuses: ${statuses.join(", ")}`);
} catch (error) {
  console.error("Batch failed:", error);
}
```

**Batch Handle Response**:
```typescript
interface BatchHandle<T> {
  // Nullable in v4 (was always present in v3)
  batchId: string | null;

  // OPTIONAL: May not be included in v4 response
  runs?: Array<{
    id: string;
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
    createdAt: Date;
    output?: any;
    error?: string;
  }>;
}
```

**Migration from v3**:
```typescript
// V3 code (BREAKS in v4)
const runs = batchHandle.runs;          // May be undefined!
const batchId = batchHandle.batchId;    // May be null!

// V4 code (SAFE)
const runs = batchHandle.runs ?? [];
const batchId = batchHandle.batchId ?? "unknown";
```

## Configuration API

### TriggerConfig - Project Configuration

Configure your Trigger.dev project in `trigger.config.ts`:

```typescript
import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  // Project identifier (format: proj_xxx)
  // Obtain from: webapp UI → Settings → Projects
  project: "proj_uuvpcrkpfruhlpbpzlov",

  // API endpoint for self-hosted
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",

  // Maximum task execution duration (seconds)
  maxDuration: 300,

  // Global retry configuration
  retries: {
    // Enable retries in development
    enabledInDev: true,

    // Default retry policy for all tasks
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
    },
  },

  // Directories containing task definitions
  dirs: ["./src/trigger"],
};
```

## Error Handling

### Task Error Handling

```typescript
export const errorHandlingTask = task({
  id: "error-handling",
  retry: { maxAttempts: 3 },
  run: async (payload: { url: string }) => {
    try {
      const response = await fetch(payload.url, { timeout: 5000 });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error("[ERROR]", error);
      // Will retry based on retry configuration
      throw error;
    }
  },
});
```

### Batch Error Handling

```typescript
const payloads = [
  { name: "Alice" },
  { name: "Bob" },
];

try {
  const batchHandle = await tasks.batchTrigger<typeof helloTask>(
    "hello",
    payloads
  );

  // Handle both null responses
  if (!batchHandle.batchId) {
    console.error("Batch ID is null");
  }

  const runs = batchHandle.runs ?? [];
  if (runs.length === 0) {
    console.error("No runs returned");
  }

  // Check for failed runs
  const failed = runs.filter(r => r.status === "FAILED");
  if (failed.length > 0) {
    console.warn(`${failed.length} tasks failed`);
  }
} catch (error) {
  // Network or API error
  console.error("Batch trigger failed:", error);
}
```

## Logging and Debugging

### Structured Logging

```typescript
export const loggingTask = task({
  id: "logging-example",
  run: async (payload: { step: number }) => {
    console.log("[INFO]", `Starting step ${payload.step}`);
    console.log("[DEBUG]", "Payload:", JSON.stringify(payload));

    try {
      // Do work...
      console.log("[INFO]", "Step completed");
      return { success: true };
    } catch (error) {
      console.error("[ERROR]", error instanceof Error ? error.message : String(error));
      throw error;
    }
  },
});
```

### Debugging with Environment Variables

```typescript
export const debugTask = task({
  id: "debug-example",
  run: async (payload: any) => {
    const isDev = process.env.NODE_ENV === "development";
    const triggerUrl = process.env.TRIGGER_API_URL;

    if (isDev) {
      console.log("[DEBUG] Development mode enabled");
      console.log("[DEBUG] Trigger URL:", triggerUrl);
    }

    return {
      environment: process.env.NODE_ENV,
      apiUrl: triggerUrl,
    };
  },
});
```

## Performance Patterns

### Efficient Batch Processing

```typescript
// GOOD: Use batchTrigger
const batchHandle = await tasks.batchTrigger<typeof myTask>(
  "my-task",
  largePayloadArray
);
// Duration: ~1.5s for 5 tasks

// BAD: Loop and invoke individually
for (const payload of largePayloadArray) {
  await tasks.invoke<typeof myTask>("my-task", payload);
}
// Duration: ~3s for 5 tasks (2x slower!)
```

### Payload Size Optimization

```typescript
// BAD: Large nested objects
const payload = {
  user: { /* entire user object */ },
  profile: { /* entire profile */ },
  history: { /* full history */ },
};
await tasks.invoke(myTask, payload);

// GOOD: Just the ID
const payload = { userId: "user_123" };
await tasks.invoke(myTask, payload);
// Inside task, fetch the user if needed
```

### Timeout Configuration

```typescript
export const timeoutTask = task({
  id: "timeout-example",
  run: async (payload: { url: string }) => {
    // Set explicit timeout for network operations
    const response = await fetch(payload.url, {
      timeout: 5000,  // 5 second timeout
    });
    return response.json();
  },
});
```

## v4 Type System

### Payload and Result Types

```typescript
// Strongly typed payload
type HelloPayload = { name: string; greeting?: string };

// Strongly typed result
type HelloResult = { message: string; timestamp: Date };

export const helloTask = task<HelloPayload, HelloResult>({
  id: "hello",
  run: async (payload) => {
    // payload is typed as HelloPayload
    // TypeScript validates payload structure
    return {
      message: `${payload.greeting || "Hello"} ${payload.name}`,
      timestamp: new Date(),
    };
  },
});
```

### Generic Task Type Preservation

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

// Preserve task type for type-safe invocation
const result = await tasks.invoke<typeof helloTask>(
  "hello",
  { name: "Alice" }  // TypeScript validates payload shape
);

// result type is inferred from helloTask's return type
console.log(result.message);      // OK
console.log(result.timestamp);    // OK
// console.log(result.invalid);   // TypeScript error!
```

## CLI Commands Reference

### Login

```bash
# Login to self-hosted instance
npx trigger.dev@latest login \
  -a http://localhost:8030 \
  --profile self-hosted-v4

# Output:
# Opening browser to http://localhost:8030/auth/cli/request
# [Waiting for authentication...]
# Login successful
```

### Dev Server

```bash
# Start development server
npx trigger.dev@latest dev \
  --profile self-hosted-v4 \
  --dir ./src/trigger

# Output:
# [trigger.dev] Login successful
# [trigger.dev] Connected to API: http://localhost:8030
# [trigger.dev] Watching for tasks in: ./src/trigger
# [trigger.dev] Local dev server listening on http://localhost:3001
```

### Manage Profiles

```bash
# List profiles
cat ~/.trigger/profiles.json

# Output format:
# {
#   "self-hosted-v4": {
#     "apiUrl": "http://localhost:8030",
#     "accessToken": "[REDACTED]"
#   }
# }
```

## HTTP API Endpoints

### Health Check

```bash
curl http://localhost:8030/health
```

Response:
```json
{
  "status": "healthy",
  "version": "4.0.0",
  "services": {
    "database": "ok",
    "redis": "ok",
    "storage": "ok"
  }
}
```

### Get Run Details

```bash
curl http://localhost:8030/api/runs/{runId}
```

### Get Run Logs

```bash
curl http://localhost:8030/api/runs/{runId}/logs
```

## Common Patterns

### Task with Retries

```typescript
export const resilientTask = task({
  id: "resilient",
  retry: {
    maxAttempts: 5,           // Try 5 times
    factor: 2,                // Double wait between attempts
    minTimeoutInMs: 1000,     // Start at 1 second
    maxTimeoutInMs: 30000,    // Cap at 30 seconds
  },
  run: async (payload: { url: string }) => {
    // Attempt 1: wait 1s before retry
    // Attempt 2: wait 2s before retry
    // Attempt 3: wait 4s before retry
    // Attempt 4: wait 8s before retry
    // Attempt 5: final attempt
    const response = await fetch(payload.url);
    return response.json();
  },
});
```

### Conditional Task Execution

```typescript
export const conditionalTask = task({
  id: "conditional",
  run: async (payload: { shouldProcess: boolean; data: string }) => {
    if (!payload.shouldProcess) {
      return { skipped: true, reason: "Processing disabled" };
    }

    // Process data
    return { processed: true, length: payload.data.length };
  },
});
```

### Task Composition

```typescript
const step1Task = task({
  id: "step1",
  run: async (payload: { input: string }) => {
    return { step1Output: payload.input.toUpperCase() };
  },
});

const step2Task = task({
  id: "step2",
  run: async (payload: { input: string }) => {
    return { step2Output: payload.input.split("").reverse().join("") };
  },
});

export const orchestratorTask = task({
  id: "orchestrator",
  run: async (payload: { initialData: string }) => {
    const step1 = await tasks.invoke<typeof step1Task>(
      "step1",
      { input: payload.initialData }
    );

    const step2 = await tasks.invoke<typeof step2Task>(
      "step2",
      { input: step1.step1Output }
    );

    return {
      initial: payload.initialData,
      afterStep1: step1.step1Output,
      final: step2.step2Output,
    };
  },
});
```

## Troubleshooting

### Task Not Found

**Error**:
```
TaskNotFoundError: Task "my-task" not found
```

**Fix**:
```typescript
// Ensure task is exported
export const myTask = task({  // Must be named export
  id: "my-task",
  run: async (payload) => { /* ... */ },
});

// Ensure file is in dirs specified in trigger.config.ts
// dirs: ["./src/trigger"]
// File should be: ./src/trigger/my-task.ts
```

### Type Mismatch in Batch

**Error**:
```
Argument of type 'Payload' is not assignable to parameter of type 'OtherPayload'
```

**Fix**:
```typescript
// Ensure payloads match task's expected type
const correctPayloads: typeof helloTask extends Task<infer P> ? P[] : never = [
  { name: "Alice" },    // Matches HelloPayload
  { name: "Bob" },
];
```

### undefined runs in Batch

**Error**:
```
Cannot read property 'length' of undefined
```

**Fix**:
```typescript
// WRONG
const runs = batchHandle.runs;

// CORRECT
const runs = batchHandle.runs ?? [];
```

## Resources and Links

- v4 Docs: https://trigger.dev/docs/v4
- SDK Reference: https://trigger.dev/docs/v4/sdk
- API Reference: https://trigger.dev/docs/v4/api
- GitHub: https://github.com/triggerdotdev/trigger.dev
- Migration Guide: https://trigger.dev/docs/v4/migration
