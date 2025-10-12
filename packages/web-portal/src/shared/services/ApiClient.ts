/**
 * Unified API Client for Claude Flow Novice Web Portal
 *
 * This service provides a centralized HTTP client with:
 * - Axios-based requests with interceptors
 * - Authentication token handling
 * - Retry logic with exponential backoff
 * - Request cancellation support
 * - Comprehensive error handling
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosError,
  type CancelTokenSource,
} from 'axios';
import type {
  ApiResponse,
  PaginatedResponse,
  AgentHierarchyResponse,
  AgentStatusResponse,
  MetricsResponse,
  EventsResponse,
  EventsParams,
  ResourcesResponse,
  InterventionRequest,
  InterventionResponse,
  HealthCheckResponse,
  AgentFilters,
} from '../types/api';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const API_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Initial delay for exponential backoff

// ============================================================================
// Types
// ============================================================================

interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryableStatuses: number[];
}

interface RequestOptions extends AxiosRequestConfig {
  retry?: Partial<RetryConfig>;
  skipAuth?: boolean;
}

// ============================================================================
// API Client Class
// ============================================================================

class ApiClient {
  private client: AxiosInstance;
  private cancelTokens: Map<string, CancelTokenSource>;
  private retryConfig: RetryConfig;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.cancelTokens = new Map();

    this.retryConfig = {
      maxRetries: MAX_RETRIES,
      retryDelay: RETRY_DELAY_MS,
      retryableStatuses: [408, 429, 500, 502, 503, 504],
    };

    this.setupInterceptors();
  }

  // ==========================================================================
  // Setup Interceptors
  // ==========================================================================

  private setupInterceptors(): void {
    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken();
        if (token && !config.headers.skipAuth) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.config && this.shouldRetry(error)) {
          return this.retryRequest(error.config, error.config.retryCount || 0);
        }
        return Promise.reject(this.normalizeError(error));
      }
    );
  }

  // ==========================================================================
  // Auth Token Management
  // ==========================================================================

  private getAuthToken(): string | null {
    // Try to get token from localStorage or session storage
    return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
  }

  public setAuthToken(token: string, persistent = true): void {
    if (persistent) {
      localStorage.setItem('auth_token', token);
    } else {
      sessionStorage.setItem('auth_token', token);
    }
  }

  public clearAuthToken(): void {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
  }

  // ==========================================================================
  // Retry Logic
  // ==========================================================================

  private shouldRetry(error: AxiosError): boolean {
    if (!error.config || axios.isCancel(error)) {
      return false;
    }

    const retryCount = error.config.retryCount || 0;
    const status = error.response?.status;

    return (
      retryCount < this.retryConfig.maxRetries &&
      (!status || this.retryConfig.retryableStatuses.includes(status))
    );
  }

  private async retryRequest(
    config: AxiosRequestConfig & { retryCount?: number },
    retryCount: number
  ): Promise<any> {
    const delay = this.retryConfig.retryDelay * Math.pow(2, retryCount);
    await this.sleep(delay);

    config.retryCount = retryCount + 1;
    return this.client.request(config);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  private normalizeError(error: AxiosError): Error {
    if (axios.isCancel(error)) {
      return new Error('Request cancelled');
    }

    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const message = (error.response.data as any)?.message || error.message;
      return new Error(`API Error ${status}: ${message}`);
    }

    if (error.request) {
      // Request made but no response received
      return new Error('Network error: No response from server');
    }

    // Something else happened
    return new Error(error.message || 'Unknown error occurred');
  }

  // ==========================================================================
  // Request Cancellation
  // ==========================================================================

  private createCancelToken(key: string): CancelTokenSource {
    // Cancel previous request with same key if exists
    this.cancelRequest(key);

    const source = axios.CancelToken.source();
    this.cancelTokens.set(key, source);
    return source;
  }

  public cancelRequest(key: string): void {
    const source = this.cancelTokens.get(key);
    if (source) {
      source.cancel(`Request cancelled: ${key}`);
      this.cancelTokens.delete(key);
    }
  }

  public cancelAllRequests(): void {
    this.cancelTokens.forEach((source, key) => {
      source.cancel(`Request cancelled: ${key}`);
    });
    this.cancelTokens.clear();
  }

  // ==========================================================================
  // Generic Request Method
  // ==========================================================================

  private async request<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    url: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { data, params, retry, skipAuth, ...axiosConfig } = options;

    const config: AxiosRequestConfig = {
      method,
      url,
      data,
      params,
      ...axiosConfig,
      headers: {
        ...axiosConfig.headers,
        skipAuth: skipAuth ? 'true' : undefined,
      },
    };

    const response = await this.client.request<T>(config);
    return response.data;
  }

  // ==========================================================================
  // API Endpoints
  // ==========================================================================

  /**
   * GET /api/agents/hierarchy
   * Retrieve agent hierarchy tree with optional filters
   */
  public async getAgentHierarchy(
    filters?: AgentFilters
  ): Promise<ApiResponse<AgentHierarchyResponse>> {
    const cancelKey = 'getAgentHierarchy';
    const source = this.createCancelToken(cancelKey);

    try {
      return await this.request<ApiResponse<AgentHierarchyResponse>>('get', '/agents/hierarchy', {
        params: filters,
        cancelToken: source.token,
      });
    } finally {
      this.cancelTokens.delete(cancelKey);
    }
  }

  /**
   * GET /api/agents/:id/status
   * Retrieve individual agent status with metrics and current task
   */
  public async getAgentStatus(agentId: string): Promise<ApiResponse<AgentStatusResponse>> {
    const cancelKey = `getAgentStatus-${agentId}`;
    const source = this.createCancelToken(cancelKey);

    try {
      return await this.request<ApiResponse<AgentStatusResponse>>(
        'get',
        `/agents/${agentId}/status`,
        {
          cancelToken: source.token,
        }
      );
    } finally {
      this.cancelTokens.delete(cancelKey);
    }
  }

  /**
   * GET /api/metrics
   * Retrieve system-wide metrics (CPU, memory, agents, tasks, etc.)
   */
  public async getMetrics(): Promise<ApiResponse<MetricsResponse>> {
    const cancelKey = 'getMetrics';
    const source = this.createCancelToken(cancelKey);

    try {
      return await this.request<ApiResponse<MetricsResponse>>('get', '/metrics', {
        cancelToken: source.token,
      });
    } finally {
      this.cancelTokens.delete(cancelKey);
    }
  }

  /**
   * GET /api/events
   * Retrieve event history with pagination and filters
   */
  public async getEvents(params?: EventsParams): Promise<PaginatedResponse<EventsResponse>> {
    const cancelKey = 'getEvents';
    const source = this.createCancelToken(cancelKey);

    try {
      return await this.request<PaginatedResponse<EventsResponse>>('get', '/events', {
        params,
        cancelToken: source.token,
      });
    } finally {
      this.cancelTokens.delete(cancelKey);
    }
  }

  /**
   * GET /api/resources
   * Retrieve resource utilization for all agents
   */
  public async getResources(): Promise<ApiResponse<ResourcesResponse>> {
    const cancelKey = 'getResources';
    const source = this.createCancelToken(cancelKey);

    try {
      return await this.request<ApiResponse<ResourcesResponse>>('get', '/resources', {
        cancelToken: source.token,
      });
    } finally {
      this.cancelTokens.delete(cancelKey);
    }
  }

  /**
   * POST /api/agents/:id/intervene
   * Perform intervention action on specific agent (pause, resume, terminate, etc.)
   */
  public async interventeAgent(
    agentId: string,
    request: InterventionRequest
  ): Promise<ApiResponse<InterventionResponse>> {
    return await this.request<ApiResponse<InterventionResponse>>(
      'post',
      `/agents/${agentId}/intervene`,
      {
        data: request,
      }
    );
  }

  /**
   * GET /api/health
   * System health check with service status
   */
  public async getHealthCheck(): Promise<ApiResponse<HealthCheckResponse>> {
    const cancelKey = 'getHealthCheck';
    const source = this.createCancelToken(cancelKey);

    try {
      return await this.request<ApiResponse<HealthCheckResponse>>('get', '/health', {
        cancelToken: source.token,
        skipAuth: true, // Health check doesn't require auth
      });
    } finally {
      this.cancelTokens.delete(cancelKey);
    }
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

export const apiClient = new ApiClient();
export default apiClient;
