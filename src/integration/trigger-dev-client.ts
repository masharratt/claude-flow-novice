/**
 * TriggerDevClient - Type-safe wrapper for trigger.dev SDK
 * Handles CFN Loop orchestration via trigger.dev API
 *
 * Configuration via environment variables:
 * - TRIGGER_API_URL: Base URL for trigger.dev API
 * - TRIGGER_API_KEY: Authentication token
 * - TRIGGER_ENVIRONMENT_ID: Environment ID for deployments
 */

import {
  CFNLoopPayload,
  Run,
  RunStatusResponse,
  RunStatusType,
  AgentType,
} from '../types/trigger-dev-events.d.js';

/**
 * Typed error class for trigger.dev operations
 */
export class TriggerDevError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TriggerDevError';
  }
}

/**
 * Run filter options for querying runs
 */
export interface RunFilterOptions {
  taskId?: string;
  status?: RunStatusType;
  limit?: number;
  offset?: number;
  agentType?: AgentType;
}

/**
 * Configuration for TriggerDevClient
 */
export interface TriggerDevConfig {
  apiUrl: string;
  apiKey: string;
  environmentId: string;
  timeoutMs?: number;
  retryAttempts?: number;
}

/**
 * TriggerDevClient - Type-safe integration with trigger.dev
 *
 * Provides methods for:
 * - Triggering CFN Loop runs
 * - Monitoring run status
 * - Canceling runs
 * - Querying run history
 */
export class TriggerDevClient {
  private readonly config: TriggerDevConfig;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config?: Partial<TriggerDevConfig>) {
    const apiUrl = config?.apiUrl || process.env.TRIGGER_API_URL;
    const apiKey = config?.apiKey || process.env.TRIGGER_API_KEY;
    const environmentId = config?.environmentId || process.env.TRIGGER_ENVIRONMENT_ID;

    if (!apiUrl || !apiKey || !environmentId) {
      throw new TriggerDevError(
        'Missing trigger.dev configuration',
        'CONFIGURATION_ERROR',
        undefined,
        {
          apiUrl: Boolean(apiUrl),
          apiKey: Boolean(apiKey),
          environmentId: Boolean(environmentId),
        }
      );
    }

    this.config = {
      apiUrl,
      apiKey,
      environmentId,
      timeoutMs: config?.timeoutMs || 30000,
      retryAttempts: config?.retryAttempts || 3,
    };

    this.baseUrl = `${apiUrl}/v1`;
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Environment-Id': environmentId,
    };
  }

  /**
   * Trigger a CFN Loop run via trigger.dev
   *
   * TODO: RUNTIME_TEST: Verify webhook signature validation in trigger.dev
   * TODO: RUNTIME_TEST: Test retry logic with transient API failures
   *
   * @param payload CFN Loop trigger payload
   * @returns Promise resolving to run ID
   * @throws TriggerDevError on API failure
   */
  async triggerCFNLoop(payload: CFNLoopPayload): Promise<string> {
    const endpoint = `${this.baseUrl}/tasks/cfn-loop/runs`;

    try {
      const response = await this.makeRequest('POST', endpoint, {
        payload: {
          taskId: payload.taskId,
          description: payload.description,
          mode: payload.mode,
          successCriteria: payload.successCriteria,
          context: payload.context || {},
          webhookUrl: payload.webhookUrl,
        },
      });

      if (!response.id) {
        throw new TriggerDevError(
          'Invalid response format from trigger.dev',
          'INVALID_RESPONSE',
          undefined,
          { response }
        );
      }

      return response.id;
    } catch (error) {
      if (error instanceof TriggerDevError) {
        throw error;
      }

      throw new TriggerDevError(
        `Failed to trigger CFN Loop: ${error instanceof Error ? error.message : String(error)}`,
        'TRIGGER_FAILED',
        undefined,
        { originalError: error }
      );
    }
  }

  /**
   * Get run status from trigger.dev
   *
   * TODO: RUNTIME_TEST: Verify polling behavior matches trigger.dev API
   *
   * @param runId Run ID from trigger.dev
   * @returns Promise resolving to run status
   * @throws TriggerDevError if run not found
   */
  async getRunStatus(runId: string): Promise<RunStatusResponse> {
    if (!runId || typeof runId !== 'string') {
      throw new TriggerDevError(
        'Invalid run ID',
        'INVALID_RUN_ID',
        undefined,
        { runId }
      );
    }

    const endpoint = `${this.baseUrl}/runs/${runId}`;

    try {
      const response = await this.makeRequest('GET', endpoint);

      if (!response.status) {
        throw new TriggerDevError(
          'Invalid run response',
          'INVALID_RESPONSE',
          undefined,
          { response }
        );
      }

      return response;
    } catch (error) {
      if (error instanceof TriggerDevError) {
        throw error;
      }

      throw new TriggerDevError(
        `Failed to get run status: ${error instanceof Error ? error.message : String(error)}`,
        'STATUS_FETCH_FAILED',
        undefined,
        { runId, originalError: error }
      );
    }
  }

  /**
   * Cancel a trigger.dev run
   *
   * TODO: RUNTIME_TEST: Verify cancellation propagates to agent processes
   *
   * @param runId Run ID to cancel
   * @throws TriggerDevError on cancellation failure
   */
  async cancelRun(runId: string): Promise<void> {
    if (!runId || typeof runId !== 'string') {
      throw new TriggerDevError(
        'Invalid run ID',
        'INVALID_RUN_ID',
        undefined,
        { runId }
      );
    }

    const endpoint = `${this.baseUrl}/runs/${runId}/cancel`;

    try {
      await this.makeRequest('POST', endpoint);
    } catch (error) {
      if (error instanceof TriggerDevError) {
        throw error;
      }

      throw new TriggerDevError(
        `Failed to cancel run: ${error instanceof Error ? error.message : String(error)}`,
        'CANCEL_FAILED',
        undefined,
        { runId, originalError: error }
      );
    }
  }

  /**
   * List runs with optional filtering
   *
   * TODO: RUNTIME_TEST: Test pagination with large result sets
   *
   * @param filters Optional filter criteria
   * @returns Promise resolving to array of runs
   * @throws TriggerDevError on query failure
   */
  async listRuns(filters?: RunFilterOptions): Promise<Run[]> {
    const endpoint = `${this.baseUrl}/runs`;
    const params = new URLSearchParams();

    if (filters?.taskId) {
      params.append('taskId', filters.taskId);
    }
    if (filters?.status) {
      params.append('status', filters.status);
    }
    if (filters?.agentType) {
      params.append('agentType', filters.agentType);
    }
    if (filters?.limit) {
      params.append('limit', String(filters.limit));
    }
    if (filters?.offset) {
      params.append('offset', String(filters.offset));
    }

    const queryString = params.toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    try {
      const response = await this.makeRequest('GET', url);

      if (!Array.isArray(response)) {
        throw new TriggerDevError(
          'Invalid response format',
          'INVALID_RESPONSE',
          undefined,
          { response }
        );
      }

      return response;
    } catch (error) {
      if (error instanceof TriggerDevError) {
        throw error;
      }

      throw new TriggerDevError(
        `Failed to list runs: ${error instanceof Error ? error.message : String(error)}`,
        'LIST_FAILED',
        undefined,
        { filters, originalError: error }
      );
    }
  }

  /**
   * Internal HTTP request handler with retry logic
   *
   * @private
   * @param method HTTP method
   * @param url Full URL
   * @param body Optional request body
   * @returns Promise resolving to response data
   * @throws TriggerDevError on all retries exhausted
   */
  private async makeRequest(
    method: string,
    url: string,
    body?: Record<string, unknown>
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts!; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: this.headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.config.timeoutMs!),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new TriggerDevError(
            `HTTP ${response.status}: ${response.statusText}`,
            'HTTP_ERROR',
            response.status,
            {
              url,
              method,
              body: errorBody,
            }
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on validation errors
        if (error instanceof TriggerDevError && error.code === 'INVALID_RUN_ID') {
          throw error;
        }

        // Exponential backoff: 100ms * 2^attempt
        if (attempt < this.config.retryAttempts!) {
          const delayMs = 100 * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new TriggerDevError(
      `Request failed after ${this.config.retryAttempts! + 1} attempts`,
      'REQUEST_FAILED',
      undefined,
      { lastError: lastError?.message }
    );
  }
}

/**
 * Create and export singleton instance
 * Uses environment variable configuration
 */
export const createTriggerDevClient = (): TriggerDevClient => {
  return new TriggerDevClient();
};

export default TriggerDevClient;
