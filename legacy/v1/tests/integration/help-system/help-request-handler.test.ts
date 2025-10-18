/**
 * Integration tests for HelpRequestHandler with MessageBroker
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MessageBroker } from '../../../src/coordination/v2/core/message-broker.js';
import { HelpCoordinator } from '../../../src/coordination/v2/help-system/help-coordinator.js';
import {
  HelpRequestHandler,
  HelpRequestPayload
} from '../../../src/coordination/v2/help-system/help-request-handler.js';
import { HelpRequestPriority } from '../../../src/coordination/v2/help-system/help-request.js';
import { AgentProfile } from '../../../src/coordination/v2/help-system/help-matcher.js';
import { AgentState } from '../../../src/coordination/v2/core/agent-state.js';
import { MessagePriority } from '../../../src/coordination/v2/core/message.js';

describe('HelpRequestHandler - MessageBroker Integration', () => {
  let broker: MessageBroker;
  let coordinator: HelpCoordinator;
  let handler: HelpRequestHandler;

  beforeEach(() => {
    broker = new MessageBroker();
    coordinator = new HelpCoordinator({ messageBroker: broker });
    handler = new HelpRequestHandler({ broker, coordinator });
  });

  afterEach(async () => {
    await handler.stop();
    await broker.shutdown(1000);
  });

  describe('Subscription Management', () => {
    it('should start and subscribe to help topics', async () => {
      await handler.start();

      expect(handler.isStarted()).toBe(true);

      const subscriptions = broker.getSubscriptions();
      const helpTopics = subscriptions.filter(sub => sub.topic.startsWith('help.'));

      // Should have subscriptions for all priority levels + wildcards + events
      expect(helpTopics.length).toBeGreaterThan(0);
    });

    it('should stop and unsubscribe from all topics', async () => {
      await handler.start();
      const beforeCount = broker.getSubscriptions().length;

      await handler.stop();
      const afterCount = broker.getSubscriptions().length;

      expect(handler.isStarted()).toBe(false);
      expect(afterCount).toBeLessThan(beforeCount);
    });
  });

  describe('Help Request Routing', () => {
    beforeEach(async () => {
      // Register test agent
      const profile: AgentProfile = {
        agentId: 'helper-agent-1',
        state: AgentState.IDLE,
        capabilities: [
          { name: 'api-design', proficiency: 0.9 }
        ],
        workload: 0.2,
        lastActive: new Date()
      };

      handler.registerAgent(profile);
      await handler.start();
    });

    it('should route help request via MessageBroker with HIGH priority', async () => {
      const payload: HelpRequestPayload = {
        requesterId: 'requester-1',
        description: 'Need help with API design',
        capabilities: [
          { capability: 'api-design', minProficiency: 0.8, required: true }
        ],
        priority: HelpRequestPriority.HIGH
      };

      const reply = await broker.request(
        'help.request.HIGH',
        payload,
        { timeout: 5000, priority: MessagePriority.HIGH }
      );

      expect(reply.success).toBe(true);
      expect(reply.payload).toBeDefined();
      expect(reply.payload.requestId).toBeDefined();
      expect(reply.payload.status).toBe('success');
      expect(reply.payload.match).toBeDefined();
      expect(reply.payload.match.agentId).toBe('helper-agent-1');
    });

    it('should handle no match scenario', async () => {
      const payload: HelpRequestPayload = {
        requesterId: 'requester-2',
        description: 'Need help with quantum computing',
        capabilities: [
          { capability: 'quantum-computing', minProficiency: 0.9, required: true }
        ],
        priority: HelpRequestPriority.NORMAL
      };

      const reply = await broker.request(
        'help.request.NORMAL',
        payload,
        { timeout: 5000 }
      );

      expect(reply.success).toBe(false);
      expect(reply.payload.status).toBe('no_match');
      expect(reply.payload.match).toBeNull();
    });

    it('should route via wildcard topic', async () => {
      const payload: HelpRequestPayload = {
        requesterId: 'requester-3',
        description: 'API design assistance',
        capabilities: [
          { capability: 'api-design', required: true }
        ],
        priority: HelpRequestPriority.CRITICAL
      };

      const reply = await broker.request(
        'help.request.CRITICAL',
        payload,
        { timeout: 5000 }
      );

      expect(reply.success).toBe(true);
      expect(reply.payload.match).toBeDefined();
    });
  });

  describe('Help Acceptance Flow', () => {
    beforeEach(async () => {
      const profile: AgentProfile = {
        agentId: 'helper-2',
        state: AgentState.IDLE,
        capabilities: [
          { name: 'testing', proficiency: 0.85 }
        ],
        workload: 0.1,
        lastActive: new Date()
      };

      handler.registerAgent(profile);
      await handler.start();
    });

    it('should handle help acceptance notification', async () => {
      // Create help request first
      const requestPayload: HelpRequestPayload = {
        requesterId: 'requester-4',
        description: 'Need testing help',
        capabilities: [
          { capability: 'testing', required: true }
        ],
        priority: HelpRequestPriority.HIGH
      };

      const routingReply = await broker.request(
        'help.request.HIGH',
        requestPayload,
        { timeout: 5000 }
      );

      expect(routingReply.success).toBe(true);
      const requestId = routingReply.payload.requestId;

      // Publish acceptance
      await broker.publish({
        topic: `help.accepted.${requestId}`,
        payload: {
          requestId,
          helperId: 'helper-2',
          timestamp: new Date()
        },
        priority: MessagePriority.HIGH
      });

      // Small delay for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = handler.getMetrics();
      expect(metrics.acceptedRequests).toBeGreaterThan(0);
    });
  });

  describe('Help Completion Flow', () => {
    beforeEach(async () => {
      const profile: AgentProfile = {
        agentId: 'helper-3',
        state: AgentState.IDLE,
        capabilities: [
          { name: 'code-review', proficiency: 0.9 }
        ],
        workload: 0.15,
        lastActive: new Date()
      };

      handler.registerAgent(profile);
      await handler.start();
    });

    it('should handle successful help completion', async () => {
      // Create and route help request
      const requestPayload: HelpRequestPayload = {
        requesterId: 'requester-5',
        description: 'Code review needed',
        capabilities: [
          { capability: 'code-review', required: true }
        ],
        priority: HelpRequestPriority.NORMAL
      };

      const routingReply = await broker.request(
        'help.request.NORMAL',
        requestPayload,
        { timeout: 5000 }
      );

      const requestId = routingReply.payload.requestId;

      // Start help
      await broker.publish({
        topic: `help.accepted.${requestId}`,
        payload: {
          requestId,
          helperId: 'helper-3',
          timestamp: new Date()
        },
        priority: MessagePriority.HIGH
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Complete help successfully
      await broker.publish({
        topic: `help.completed.${requestId}`,
        payload: {
          requestId,
          helperId: 'helper-3',
          success: true,
          result: { reviewScore: 95, comments: ['Great code!'] },
          timestamp: new Date()
        },
        priority: MessagePriority.HIGH
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = handler.getMetrics();
      expect(metrics.completedRequests).toBeGreaterThan(0);
      expect(metrics.coordinatorMetrics.resolvedRequests).toBeGreaterThan(0);
    });

    it('should handle failed help completion', async () => {
      const requestPayload: HelpRequestPayload = {
        requesterId: 'requester-6',
        description: 'Review assistance',
        capabilities: [
          { capability: 'code-review', required: true }
        ],
        priority: HelpRequestPriority.LOW
      };

      const routingReply = await broker.request(
        'help.request.LOW',
        requestPayload,
        { timeout: 5000 }
      );

      const requestId = routingReply.payload.requestId;

      // Accept and then fail
      await broker.publish({
        topic: `help.accepted.${requestId}`,
        payload: {
          requestId,
          helperId: 'helper-3',
          timestamp: new Date()
        },
        priority: MessagePriority.HIGH
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      await broker.publish({
        topic: `help.completed.${requestId}`,
        payload: {
          requestId,
          helperId: 'helper-3',
          success: false,
          error: 'Agent unavailable',
          timestamp: new Date()
        },
        priority: MessagePriority.HIGH
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = handler.getMetrics();
      expect(metrics.completedRequests).toBeGreaterThan(0);
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      const profile: AgentProfile = {
        agentId: 'metrics-helper',
        state: AgentState.IDLE,
        capabilities: [
          { name: 'monitoring', proficiency: 0.95 }
        ],
        workload: 0.05,
        lastActive: new Date()
      };

      handler.registerAgent(profile);
      await handler.start();
    });

    it('should track routing metrics', async () => {
      const payload: HelpRequestPayload = {
        requesterId: 'requester-metrics',
        description: 'Monitoring help',
        capabilities: [
          { capability: 'monitoring', required: true }
        ],
        priority: HelpRequestPriority.HIGH
      };

      await broker.request('help.request.HIGH', payload, { timeout: 5000 });

      const metrics = handler.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.successfulRoutes).toBeGreaterThan(0);
      expect(metrics.avgRoutingLatencyMs).toBeGreaterThan(0);
    });

    it('should emit monitoring events', async () => {
      const events: any[] = [];

      await broker.subscribe({
        topic: 'help.event.*',
        handler: async (msg) => {
          events.push(msg.payload);
        }
      });

      const payload: HelpRequestPayload = {
        requesterId: 'requester-events',
        description: 'Event monitoring test',
        capabilities: [
          { capability: 'monitoring', required: true }
        ],
        priority: HelpRequestPriority.NORMAL
      };

      await broker.request('help.request.NORMAL', payload, { timeout: 5000 });

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(events.length).toBeGreaterThan(0);
      expect(events.some(e => e.requesterId === 'requester-events')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await handler.start();
    });

    it('should handle invalid payload gracefully', async () => {
      const invalidPayload: any = {
        requesterId: 'invalid-requester'
        // Missing required fields
      };

      const reply = await broker.request(
        'help.request.NORMAL',
        invalidPayload,
        { timeout: 5000 }
      );

      expect(reply.success).toBe(false);
      expect(reply.error).toBeDefined();
    });

    it('should track failed requests', async () => {
      const invalidPayload: any = {
        description: 'Missing requester ID'
      };

      await broker.request('help.request.HIGH', invalidPayload, { timeout: 5000 });

      const metrics = handler.getMetrics();
      expect(metrics.failedRequests).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      // Register multiple helpers
      for (let i = 0; i < 5; i++) {
        const profile: AgentProfile = {
          agentId: `perf-helper-${i}`,
          state: AgentState.IDLE,
          capabilities: [
            { name: 'performance-test', proficiency: 0.8 + (i * 0.02) }
          ],
          workload: i * 0.1,
          lastActive: new Date()
        };
        handler.registerAgent(profile);
      }

      await handler.start();
    });

    it('should route requests within latency target (<200ms p95)', async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 20; i++) {
        const payload: HelpRequestPayload = {
          requesterId: `perf-requester-${i}`,
          description: `Performance test ${i}`,
          capabilities: [
            { capability: 'performance-test', required: true }
          ],
          priority: HelpRequestPriority.NORMAL
        };

        const startTime = performance.now();
        const reply = await broker.request('help.request.NORMAL', payload, { timeout: 5000 });
        const latency = performance.now() - startTime;

        if (reply.success) {
          latencies.push(latency);
        }
      }

      latencies.sort((a, b) => a - b);
      const p95 = latencies[Math.floor(latencies.length * 0.95)];

      expect(p95).toBeLessThan(200); // Target: <200ms p95
    });
  });
});
