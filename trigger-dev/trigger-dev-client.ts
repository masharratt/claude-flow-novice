/**
 * Trigger.dev v2 API Client
 * SDK: @trigger.dev/sdk@2.3.18
 *
 * v2 uses TriggerClient.sendEvent() for job triggering (event-based)
 */

import { TriggerClient } from '@trigger.dev/sdk';

export interface TriggerJobPayload {
  taskId: string;
  agentType: string;
  context?: Record<string, unknown>;
}

export interface RunStatus {
  id: string;
  status: 'PENDING' | 'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  output?: unknown;
  error?: string;
  completedAt?: string;
}

export interface EventResult {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export class TriggerDevClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'TriggerDevClientError';
  }
}

let _client: TriggerClient | null = null;

/**
 * Get or create TriggerClient singleton
 */
function getClient(): TriggerClient {
  if (_client) return _client;

  const apiUrl = process.env.TRIGGER_API_URL || 'http://localhost:3040';
  const apiKey = process.env.TRIGGER_API_KEY;
  if (!apiKey) {
    throw new TriggerDevClientError('TRIGGER_API_KEY environment variable not set');
  }

  _client = new TriggerClient({
    id: 'cfn-loop-client',
    apiKey,
    apiUrl,
  });

  return _client;
}

/**
 * Get API configuration from environment
 */
function getConfig() {
  const apiUrl = process.env.TRIGGER_API_URL || 'http://localhost:3040';
  const apiKey = process.env.TRIGGER_API_KEY;
  if (!apiKey) {
    throw new TriggerDevClientError('TRIGGER_API_KEY environment variable not set');
  }
  return { apiUrl, apiKey };
}

/**
 * Sleep for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make API request with retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return response;
      }

      // Don't retry client errors (4xx) except 429
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new TriggerDevClientError(
          `API error: ${response.status} ${response.statusText}`,
          response.status,
          false
        );
      }

      lastError = new TriggerDevClientError(
        `API error: ${response.status}`,
        response.status,
        true
      );
    } catch (err) {
      if (err instanceof TriggerDevClientError && !err.retryable) {
        throw err;
      }
      lastError = err as Error;
    }

    // Exponential backoff: 1s, 2s, 4s
    if (attempt < maxRetries - 1) {
      await sleep(1000 * Math.pow(2, attempt));
    }
  }

  throw lastError || new TriggerDevClientError('Request failed after retries');
}

/**
 * Trigger a job via event (v2 SDK pattern)
 * @param eventName - Event name that triggers the job (e.g., 'cfn.loop.start')
 * @param payload - Event payload
 * @returns Event ID
 */
export async function sendEvent(
  eventName: string,
  payload: Record<string, unknown>
): Promise<EventResult> {
  const client = getClient();

  try {
    const result = await client.sendEvent({
      name: eventName,
      payload,
    });

    return {
      id: result.id,
      name: result.name,
      payload: result.payload as Record<string, unknown>,
      timestamp: result.timestamp,
    };
  } catch (err) {
    throw new TriggerDevClientError(
      `Failed to send event: ${(err as Error).message}`,
      undefined,
      true
    );
  }
}

/**
 * Trigger a job execution (wrapper for sendEvent)
 * @param jobId - Maps to event name (e.g., 'cfn-loop-workflow' -> 'cfn.loop.start')
 * @param payload - Job payload with taskId, agentType, and optional context
 * @returns Event ID for tracking
 */
export async function triggerJob(
  jobId: string,
  payload: TriggerJobPayload
): Promise<string> {
  // Map job IDs to event names
  const eventMap: Record<string, string> = {
    'cfn-loop-workflow': 'cfn.loop.start',
    'cfn-agent': 'cfn.agent.run',
    'cfn-gate-check': 'cfn.gate.check',
  };

  const eventName = eventMap[jobId] || jobId;
  const result = await sendEvent(eventName, payload);
  return result.id;
}

/**
 * Get run status with exponential backoff polling
 * @param runId - The run ID to check
 * @param maxAttempts - Maximum polling attempts (default 10)
 * @returns Run status object
 */
export async function getRunStatus(
  runId: string,
  maxAttempts = 10
): Promise<RunStatus> {
  const { apiUrl, apiKey } = getConfig();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetchWithRetry(
      `${apiUrl}/api/v1/runs/${runId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    const status = await response.json() as RunStatus;

    // Return immediately if terminal state
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status.status)) {
      return status;
    }

    // Exponential backoff for polling: 1s, 2s, 4s...
    if (attempt < maxAttempts - 1) {
      await sleep(1000 * Math.pow(2, Math.min(attempt, 4)));
    }
  }

  throw new TriggerDevClientError(`Run ${runId} did not complete within polling attempts`);
}

/**
 * Cancel a running job
 * @param runId - The run ID to cancel
 */
export async function cancelRun(runId: string): Promise<void> {
  const { apiUrl, apiKey } = getConfig();

  await fetchWithRetry(
    `${apiUrl}/api/v1/runs/${runId}/cancel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }
  );
}
