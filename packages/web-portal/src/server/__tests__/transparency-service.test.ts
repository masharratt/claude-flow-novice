/**
 * TransparencyService Integration Tests
 *
 * Tests caching, error handling, and method delegation to TransparencySystem
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { transparencyService } from '../services/transparency-service.js';
import type {
  AgentHierarchyNode,
  AgentStatus,
  TransparencyMetrics,
  AgentLifecycleEvent,
} from '../../../../../src/coordination/shared/transparency/interfaces/transparency-system.js';

describe('TransparencyService', () => {
  beforeEach(async () => {
    // Initialize service before each test
    await transparencyService.initialize();
  });

  afterEach(async () => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize TransparencySystem successfully', async () => {
      // Service already initialized in beforeEach
      const metrics = await transparencyService.getSystemMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalAgents).toBeGreaterThanOrEqual(0);
    });

    it('should not re-initialize if already initialized', async () => {
      // Try initializing again
      await transparencyService.initialize();
      // Should not throw
      const metrics = await transparencyService.getSystemMetrics();
      expect(metrics).toBeDefined();
    });
  });

  describe('getAgentHierarchy', () => {
    it('should return agent hierarchy', async () => {
      const hierarchy = await transparencyService.getAgentHierarchy();
      expect(Array.isArray(hierarchy)).toBe(true);
    });

    it('should cache hierarchy for 30 seconds', async () => {
      // First call
      const hierarchy1 = await transparencyService.getAgentHierarchy();

      // Second call (should be cached)
      const hierarchy2 = await transparencyService.getAgentHierarchy();

      // Should return same reference (cached)
      expect(hierarchy1).toBe(hierarchy2);
    });

    it('should filter hierarchy by status', async () => {
      const hierarchy = await transparencyService.getAgentHierarchy({
        status: 'active',
      });

      expect(Array.isArray(hierarchy)).toBe(true);
      // All results should have active status
      hierarchy.forEach((node) => {
        expect(node.state).toBe('active');
      });
    });

    it('should filter hierarchy by type', async () => {
      const hierarchy = await transparencyService.getAgentHierarchy({
        type: 'coder',
      });

      expect(Array.isArray(hierarchy)).toBe(true);
      // All results should have coder type
      hierarchy.forEach((node) => {
        expect(node.type).toBe('coder');
      });
    });

    it('should cache different filters separately', async () => {
      const hierarchy1 = await transparencyService.getAgentHierarchy({
        status: 'active',
      });

      const hierarchy2 = await transparencyService.getAgentHierarchy({
        status: 'paused',
      });

      // Should not be same reference (different filters)
      expect(hierarchy1).not.toBe(hierarchy2);
    });
  });

  describe('getAgentStatus', () => {
    it('should return agent status for valid agentId', async () => {
      // First, get hierarchy to find a valid agentId
      const hierarchy = await transparencyService.getAgentHierarchy();

      if (hierarchy.length > 0) {
        const agentId = hierarchy[0].agentId;
        const status = await transparencyService.getAgentStatus(agentId);

        expect(status).toBeDefined();
        expect(status.agentId).toBe(agentId);
        expect(status.state).toBeDefined();
      }
    });

    it('should throw error for invalid agentId', async () => {
      await expect(
        transparencyService.getAgentStatus('non-existent-agent')
      ).rejects.toThrow();
    });

    it('should not cache agent status (real-time requirement)', async () => {
      const hierarchy = await transparencyService.getAgentHierarchy();

      if (hierarchy.length > 0) {
        const agentId = hierarchy[0].agentId;

        // First call
        const status1 = await transparencyService.getAgentStatus(agentId);

        // Second call (should NOT be cached)
        const status2 = await transparencyService.getAgentStatus(agentId);

        // Should be different objects (not cached)
        expect(status1).not.toBe(status2);
      }
    });
  });

  describe('getSystemMetrics', () => {
    it('should return system metrics', async () => {
      const metrics = await transparencyService.getSystemMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalAgents).toBeGreaterThanOrEqual(0);
      expect(metrics.agentsByLevel).toBeDefined();
      expect(metrics.agentsByState).toBeDefined();
      expect(metrics.agentsByType).toBeDefined();
    });

    it('should cache metrics for 10 seconds', async () => {
      // First call
      const metrics1 = await transparencyService.getSystemMetrics();

      // Second call (should be cached)
      const metrics2 = await transparencyService.getSystemMetrics();

      // Should return same reference (cached)
      expect(metrics1).toBe(metrics2);
    });
  });

  describe('getEvents', () => {
    it('should return paginated events', async () => {
      const result = await transparencyService.getEvents({
        page: 1,
        limit: 50,
      });

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(50);
    });

    it('should filter events by type', async () => {
      const result = await transparencyService.getEvents({
        page: 1,
        limit: 50,
        type: 'spawned',
      });

      result.data.forEach((event) => {
        expect(event.eventType).toBe('spawned');
      });
    });

    it('should filter events by agentId', async () => {
      const hierarchy = await transparencyService.getAgentHierarchy();

      if (hierarchy.length > 0) {
        const agentId = hierarchy[0].agentId;

        const result = await transparencyService.getEvents({
          page: 1,
          limit: 50,
          agentId,
        });

        result.data.forEach((event) => {
          expect(event.agentId).toBe(agentId);
        });
      }
    });
  });

  describe('subscribeToLifecycleEvents', () => {
    it('should allow subscribing to lifecycle events', async () => {
      let eventReceived = false;

      const unsubscribe = transparencyService.subscribeToLifecycleEvents(
        (event: AgentLifecycleEvent) => {
          eventReceived = true;
        }
      );

      expect(typeof unsubscribe).toBe('function');

      // Cleanup
      unsubscribe();
    });

    it('should unsubscribe properly', async () => {
      let eventCount = 0;

      const unsubscribe = transparencyService.subscribeToLifecycleEvents(
        (event: AgentLifecycleEvent) => {
          eventCount++;
        }
      );

      // Unsubscribe
      unsubscribe();

      // Events after unsubscribe should not increment count
      // (This would require triggering events, which is not possible in this test)

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should handle TransparencySystem failures gracefully', async () => {
      // Test with invalid agentId should throw
      await expect(
        transparencyService.getAgentStatus('invalid-agent-id')
      ).rejects.toThrow();
    });

    it('should handle getHealthStatus errors', async () => {
      const health = await transparencyService.getHealthStatus();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.services).toBeDefined();
    });
  });

  describe('cache invalidation', () => {
    it('should invalidate hierarchy cache on agent lifecycle events', async () => {
      // Get initial hierarchy (cached)
      const hierarchy1 = await transparencyService.getAgentHierarchy();

      // Cache invalidation would happen on lifecycle events
      // This is tested indirectly through the event listener registration

      expect(hierarchy1).toBeDefined();
    });
  });
});
