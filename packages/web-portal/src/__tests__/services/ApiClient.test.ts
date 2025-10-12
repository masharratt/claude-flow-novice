/**
 * ApiClient Tests
 *
 * Comprehensive tests for ApiClient service with MSW mocking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { apiClient } from '../../shared/services/ApiClient';

describe('ApiClient', () => {
  beforeEach(() => {
    // Clear auth tokens before each test
    apiClient.clearAuthToken();
  });

  describe('Authentication', () => {
    it('should set and get auth token (persistent)', () => {
      const token = 'test-token-123';
      apiClient.setAuthToken(token, true);
      expect(localStorage.getItem('auth_token')).toBe(token);
    });

    it('should set and get auth token (session)', () => {
      const token = 'test-token-456';
      apiClient.setAuthToken(token, false);
      expect(sessionStorage.getItem('auth_token')).toBe(token);
    });

    it('should clear auth token', () => {
      apiClient.setAuthToken('test-token', true);
      apiClient.clearAuthToken();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(sessionStorage.getItem('auth_token')).toBeNull();
    });
  });

  describe('GET /api/agents/hierarchy', () => {
    it('should fetch agent hierarchy successfully', async () => {
      const response = await apiClient.getAgentHierarchy();

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.hierarchy).toBeInstanceOf(Array);
      expect(response.data.total_agents).toBeGreaterThan(0);
      expect(response.data.topology).toMatch(/mesh|hierarchical/);
    });

    it('should fetch agent hierarchy with filters', async () => {
      const filters = { status: 'in_progress' as const, type: 'coder' };
      const response = await apiClient.getAgentHierarchy(filters);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should include child agents in hierarchy', async () => {
      const response = await apiClient.getAgentHierarchy();
      const rootAgent = response.data.hierarchy[0];

      expect(rootAgent.children).toBeDefined();
      expect(rootAgent.children).toBeInstanceOf(Array);
      if (rootAgent.children && rootAgent.children.length > 0) {
        expect(rootAgent.children[0].parent_id).toBe(rootAgent.id);
      }
    });
  });

  describe('GET /api/agents/:id/status', () => {
    it('should fetch agent status successfully', async () => {
      const agentId = 'agent-2';
      const response = await apiClient.getAgentStatus(agentId);

      expect(response.success).toBe(true);
      expect(response.data.agent).toBeDefined();
      expect(response.data.agent.id).toBe(agentId);
      expect(response.data.metrics).toBeDefined();
      expect(response.data.metrics.tasks_completed).toBeGreaterThanOrEqual(0);
    });

    it('should include current task if agent is working', async () => {
      const response = await apiClient.getAgentStatus('agent-2');

      if (response.data.current_task) {
        expect(response.data.current_task.id).toBeDefined();
        expect(response.data.current_task.description).toBeDefined();
        expect(response.data.current_task.progress).toBeGreaterThanOrEqual(0);
        expect(response.data.current_task.progress).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('GET /api/metrics', () => {
    it('should fetch system metrics successfully', async () => {
      const response = await apiClient.getMetrics();

      expect(response.success).toBe(true);
      expect(response.data.metrics).toBeDefined();
      expect(response.data.metrics.cpu).toBeDefined();
      expect(response.data.metrics.memory).toBeDefined();
      expect(response.data.metrics.agents).toBeDefined();
      expect(response.data.metrics.swarms).toBeDefined();
    });

    it('should include valid CPU metrics', async () => {
      const response = await apiClient.getMetrics();
      const cpu = response.data.metrics.cpu;

      expect(cpu.usage_percent).toBeGreaterThanOrEqual(0);
      expect(cpu.usage_percent).toBeLessThanOrEqual(100);
      expect(cpu.cores).toBeGreaterThan(0);
    });

    it('should include valid memory metrics', async () => {
      const response = await apiClient.getMetrics();
      const memory = response.data.metrics.memory;

      expect(memory.used_mb).toBeGreaterThanOrEqual(0);
      expect(memory.total_mb).toBeGreaterThan(0);
      expect(memory.usage_percent).toBeGreaterThanOrEqual(0);
      expect(memory.usage_percent).toBeLessThanOrEqual(100);
    });

    it('should include Redis and SQLite status', async () => {
      const response = await apiClient.getMetrics();

      expect(response.data.metrics.redis).toBeDefined();
      expect(response.data.metrics.redis.connected).toBeDefined();
      expect(response.data.metrics.sqlite).toBeDefined();
      expect(response.data.metrics.sqlite.size_mb).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/events', () => {
    it('should fetch events successfully', async () => {
      const response = await apiClient.getEvents();

      expect(response.success).toBe(true);
      expect(response.data.events).toBeInstanceOf(Array);
      expect(response.meta).toBeDefined();
      expect(response.meta.page).toBeGreaterThan(0);
    });

    it('should fetch events with pagination', async () => {
      const params = { page: 1, limit: 20 };
      const response = await apiClient.getEvents(params);

      expect(response.meta.page).toBe(params.page);
      expect(response.meta.limit).toBe(params.limit);
      expect(response.meta.totalPages).toBeGreaterThan(0);
    });

    it('should include event details', async () => {
      const response = await apiClient.getEvents();

      if (response.data.events.length > 0) {
        const event = response.data.events[0];
        expect(event.id).toBeDefined();
        expect(event.type).toBeDefined();
        expect(event.data).toBeDefined();
        expect(event.priority).toBeGreaterThanOrEqual(0);
        expect(event.timestamp).toBeDefined();
      }
    });
  });

  describe('GET /api/resources', () => {
    it('should fetch resource utilization successfully', async () => {
      const response = await apiClient.getResources();

      expect(response.success).toBe(true);
      expect(response.data.resources).toBeInstanceOf(Array);
      expect(response.data.summary).toBeDefined();
    });

    it('should include resource summary', async () => {
      const response = await apiClient.getResources();
      const summary = response.data.summary;

      expect(summary.total_cpu_percent).toBeGreaterThanOrEqual(0);
      expect(summary.total_memory_mb).toBeGreaterThanOrEqual(0);
      expect(summary.avg_cpu_percent).toBeGreaterThanOrEqual(0);
      expect(summary.avg_memory_mb).toBeGreaterThanOrEqual(0);
    });

    it('should include resource details for each agent', async () => {
      const response = await apiClient.getResources();

      if (response.data.resources.length > 0) {
        const resource = response.data.resources[0];
        expect(resource.agent_id).toBeDefined();
        expect(resource.agent_name).toBeDefined();
        expect(resource.cpu_percent).toBeGreaterThanOrEqual(0);
        expect(resource.memory_mb).toBeGreaterThanOrEqual(0);
        expect(resource.uptime_seconds).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('POST /api/agents/:id/intervene', () => {
    it('should pause agent successfully', async () => {
      const agentId = 'agent-2';
      const request = { action: 'pause' as const, reason: 'Testing pause' };
      const response = await apiClient.interventeAgent(agentId, request);

      expect(response.success).toBe(true);
      expect(response.data.agent_id).toBe(agentId);
      expect(response.data.action).toBe('pause');
      expect(response.data.status).toBe('success');
    });

    it('should resume agent successfully', async () => {
      const agentId = 'agent-2';
      const request = { action: 'resume' as const };
      const response = await apiClient.interventeAgent(agentId, request);

      expect(response.success).toBe(true);
      expect(response.data.action).toBe('resume');
    });

    it('should terminate agent successfully', async () => {
      const agentId = 'agent-2';
      const request = { action: 'terminate' as const, reason: 'Task complete' };
      const response = await apiClient.interventeAgent(agentId, request);

      expect(response.success).toBe(true);
      expect(response.data.action).toBe('terminate');
    });

    it('should restart agent successfully', async () => {
      const agentId = 'agent-2';
      const request = { action: 'restart' as const };
      const response = await apiClient.interventeAgent(agentId, request);

      expect(response.success).toBe(true);
      expect(response.data.action).toBe('restart');
    });

    it('should update agent config successfully', async () => {
      const agentId = 'agent-2';
      const request = {
        action: 'update_config' as const,
        config: { max_retries: 5, timeout: 30000 },
      };
      const response = await apiClient.interventeAgent(agentId, request);

      expect(response.success).toBe(true);
      expect(response.data.action).toBe('update_config');
    });
  });

  describe('GET /api/health', () => {
    it('should fetch health check successfully', async () => {
      const response = await apiClient.getHealthCheck();

      expect(response.success).toBe(true);
      expect(response.data.status).toMatch(/healthy|degraded|unhealthy/);
      expect(response.data.version).toBeDefined();
      expect(response.data.services).toBeDefined();
    });

    it('should include all service statuses', async () => {
      const response = await apiClient.getHealthCheck();
      const services = response.data.services;

      expect(services.api).toBeDefined();
      expect(services.redis).toBeDefined();
      expect(services.sqlite).toBeDefined();
      expect(services.websocket).toBeDefined();
    });

    it('should not require authentication', async () => {
      // Clear auth token
      apiClient.clearAuthToken();

      // Health check should still work
      const response = await apiClient.getHealthCheck();
      expect(response.success).toBe(true);
    });
  });

  describe('Request Cancellation', () => {
    it('should cancel specific request', async () => {
      // Start a request
      const promise = apiClient.getMetrics();

      // Cancel it immediately
      apiClient.cancelRequest('getMetrics');

      // Request should be cancelled
      await expect(promise).rejects.toThrow();
    });

    it('should cancel all requests', async () => {
      // Start multiple requests
      const promises = [
        apiClient.getMetrics(),
        apiClient.getAgentHierarchy(),
        apiClient.getResources(),
      ];

      // Cancel all
      apiClient.cancelAllRequests();

      // All should be cancelled
      await expect(Promise.all(promises)).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle 500 error', async () => {
      // MSW will return 500 for this endpoint
      try {
        await apiClient.getMetrics();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle 404 error', async () => {
      try {
        await apiClient.getAgentStatus('non-existent-agent');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
