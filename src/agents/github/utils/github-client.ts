/**
 * GitHub Client Utilities
 * Centralized GitHub API client with caching and error handling
 */

import { GitHubConfig, GitHubError, CacheEntry, GitHubMetrics } from '../types';

export class GitHubClient {
  private config: GitHubConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private metrics: GitHubMetrics = {
    api_calls: 0,
    rate_limit_remaining: 5000,
    cache_hits: 0,
    errors: 0,
    response_time_avg: 0
  };

  constructor(config: GitHubConfig) {
    this.config = {
      baseUrl: 'https://api.github.com',
      timeout: 30000,
      retries: 3,
      ...config
    };
  }

  async request(endpoint: string, options: any = {}): Promise<any> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(endpoint, options);

    // Check cache first
    if (options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.metrics.cache_hits++;
        return cached;
      }
    }

    try {
      this.metrics.api_calls++;

      const url = `${this.config.baseUrl}${endpoint}`;
      const requestOptions = {
        method: 'GET',
        headers: {
          'Authorization': `token ${this.config.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'claude-flow-github-agent',
          ...options.headers
        },
        timeout: this.config.timeout,
        ...options
      };

      const response = await fetch(url, requestOptions);

      // Update rate limit info
      const remaining = response.headers.get('x-ratelimit-remaining');
      if (remaining) {
        this.metrics.rate_limit_remaining = parseInt(remaining);
      }

      if (!response.ok) {
        throw this.createError(response, endpoint);
      }

      const data = await response.json();

      // Cache successful GET requests
      if (options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
        this.setCache(cacheKey, data, 300); // 5 minute TTL
      }

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.metrics.response_time_avg =
        (this.metrics.response_time_avg + responseTime) / 2;

      return data;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  private getCacheKey(endpoint: string, options: any): string {
    return `${endpoint}:${JSON.stringify(options.params || {})}`;
  }

  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.timestamp + entry.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      key,
      data,
      timestamp: Date.now(),
      ttl
    });

    // Cleanup old entries
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl * 1000) {
        this.cache.delete(key);
      }
    }
  }

  private createError(response: Response, endpoint: string): GitHubError {
    return {
      code: `GITHUB_API_${response.status}`,
      message: `GitHub API request failed: ${response.statusText}`,
      status: response.status,
      context: { endpoint }
    };
  }

  getMetrics(): GitHubMetrics {
    return { ...this.metrics };
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Batch request utility for multiple operations
  async batchRequest(requests: Array<{endpoint: string, options?: any}>): Promise<any[]> {
    const promises = requests.map(req =>
      this.request(req.endpoint, req.options).catch(error => ({ error }))
    );

    return Promise.all(promises);
  }
}

export class ConnectionPool {
  private clients: Map<string, GitHubClient> = new Map();
  private maxClients: number = 5;

  getClient(config: GitHubConfig): GitHubClient {
    const key = `${config.token.slice(-8)}:${config.baseUrl || 'default'}`;

    if (!this.clients.has(key)) {
      if (this.clients.size >= this.maxClients) {
        // Remove oldest client
        const firstKey = this.clients.keys().next().value;
        this.clients.delete(firstKey);
      }

      this.clients.set(key, new GitHubClient(config));
    }

    return this.clients.get(key)!;
  }

  getMetrics(): Record<string, GitHubMetrics> {
    const metrics: Record<string, GitHubMetrics> = {};

    for (const [key, client] of this.clients.entries()) {
      metrics[key] = client.getMetrics();
    }

    return metrics;
  }

  clearAllCaches(): void {
    for (const client of this.clients.values()) {
      client.clearCache();
    }
  }
}

export const githubConnectionPool = new ConnectionPool();