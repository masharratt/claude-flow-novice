/**
 * Coordination Validator Tests
 *
 * Tests Redis pub/sub coordination validation for CFN Loop epic execution.
 *
 * @module cfn-loop/__tests__/coordination-validator
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Redis from 'ioredis';
import { CoordinationValidator } from '../../src/cfn-loop/coordination-validator.js';

describe('CoordinationValidator', () => {
  let redis: Redis;
  let validator: CoordinationValidator;
  const testEpicId = 'epic-test-123';

  beforeEach(async () => { try {
    redis = new Redis();
    validator = new CoordinationValidator({
      redis,
      requiredChannels: ['sprint:coordination', 'agent:lifecycle', 'interface:ready'],
      minMessages: 10,
    });

    // Clear test data
    const keys = await redis.keys(`coordination:messages:${testEpicId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterEach(async () => { try {
    // Cleanup
    const keys = await redis.keys(`coordination:messages:${testEpicId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  describe('validateEpicCoordination', () => {
    it('should validate epic with complete coordination', async () => { try {
      // Setup: Create complete coordination messages
      const messages = [
        {
          timestamp: Date.now() - 5000,
          channel: 'sprint:coordination',
          type: 'claim',
          coordinatorId: 'coordinator-1',
          data: { sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 4000,
          channel: 'sprint:coordination',
          type: 'sprint:start',
          coordinatorId: 'coordinator-1',
          data: { sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 3000,
          channel: 'agent:lifecycle',
          type: 'agent:spawned',
          coordinatorId: 'coordinator-1',
          data: { agentId: 'agent-1', sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 2000,
          channel: 'interface:ready',
          type: 'interface:published',
          coordinatorId: 'coordinator-1',
          data: { interface: 'api-spec', sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 1000,
          channel: 'sprint:coordination',
          type: 'waiting:dependency',
          coordinatorId: 'coordinator-2',
          data: { sprintId: 'sprint-2', dependsOn: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 500,
          channel: 'agent:lifecycle',
          type: 'agent:completed',
          coordinatorId: 'coordinator-1',
          data: { agentId: 'agent-1', sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 400,
          channel: 'sprint:coordination',
          type: 'sprint:complete',
          coordinatorId: 'coordinator-1',
          data: { sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 300,
          channel: 'test:coordination',
          type: 'test:start',
          coordinatorId: 'test-coordinator',
          data: { testSuite: 'integration' },
        },
        {
          timestamp: Date.now() - 200,
          channel: 'test:coordination',
          type: 'test:complete',
          coordinatorId: 'test-coordinator',
          data: { testSuite: 'integration', passed: true },
        },
        {
          timestamp: Date.now() - 100,
          channel: 'sprint:coordination',
          type: 'sprint:start',
          coordinatorId: 'coordinator-2',
          data: { sprintId: 'sprint-2' },
        },
      ];

      // Store messages in Redis
      for (let i = 0; i < messages.length; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify(messages[i])
        );
      }

      // Run validation
      const result = await validator.validateEpicCoordination(testEpicId);

      // Assertions
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThan(0.9);
      expect(result.metrics.totalMessages).toBe(10);
      expect(result.metrics.coordinators).toContain('coordinator-1');
      expect(result.metrics.coordinators).toContain('coordinator-2');
      expect(result.metrics.channelsUsed).toContain('sprint:coordination');
      expect(result.metrics.channelsUsed).toContain('agent:lifecycle');
      expect(result.metrics.channelsUsed).toContain('interface:ready');
      expect(result.metrics.dependencyWaiting).toBe(true);
      expect(result.metrics.interfacePublishing).toBe(true);
      expect(result.metrics.agentLifecycleTracking).toBe(true);
      expect(result.metrics.testCoordination).toBe(true);
      expect(result.issues.length).toBe(0);
    });

    it('should fail epic with no pub/sub messages', async () => { try {
      // No messages in Redis

      // Run validation
      const result = await validator.validateEpicCoordination(testEpicId);

      // Assertions
      expect(result.valid).toBe(false);
      expect(result.score).toBeLessThan(0.5);
      expect(result.metrics.totalMessages).toBe(0);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          issue: 'No Redis pub/sub messages found',
        })
      );
    });

    it('should detect missing required channels', async () => { try {
      // Setup: Create messages but skip interface:ready channel
      const messages = [
        {
          timestamp: Date.now() - 3000,
          channel: 'sprint:coordination',
          type: 'claim',
          coordinatorId: 'coordinator-1',
          data: { sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 2000,
          channel: 'agent:lifecycle',
          type: 'agent:spawned',
          coordinatorId: 'coordinator-1',
          data: { agentId: 'agent-1' },
        },
        // Missing: interface:ready channel
      ];

      for (let i = 0; i < messages.length; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify(messages[i])
        );
      }

      // Add more messages to pass min threshold
      for (let i = 3; i < 12; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify({
            timestamp: Date.now() - i * 100,
            channel: 'sprint:coordination',
            type: 'update',
            coordinatorId: 'coordinator-1',
            data: {},
          })
        );
      }

      // Run validation
      const result = await validator.validateEpicCoordination(testEpicId);

      // Assertions
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'high',
          issue: 'Missing channel: interface:ready',
        })
      );
    });

    it('should detect invalid timeline (spawn before claim)', async () => { try {
      // Setup: Create messages with invalid order
      const messages = [
        {
          timestamp: Date.now() - 2000,
          channel: 'sprint:coordination',
          type: 'sprint:start', // Spawned first (invalid)
          coordinatorId: 'coordinator-1',
          data: { sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 3000,
          channel: 'sprint:coordination',
          type: 'claim', // Claimed after spawn (invalid)
          coordinatorId: 'coordinator-1',
          data: { sprintId: 'sprint-1' },
        },
      ];

      for (let i = 0; i < messages.length; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify(messages[i])
        );
      }

      // Add more messages to pass min threshold
      for (let i = 2; i < 12; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify({
            timestamp: Date.now() - i * 100,
            channel: 'agent:lifecycle',
            type: 'update',
            coordinatorId: 'coordinator-1',
            data: {},
          })
        );
      }

      // Run validation
      const result = await validator.validateEpicCoordination(testEpicId);

      // Assertions
      expect(result.valid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'high',
          issue: 'Invalid coordination timeline',
        })
      );
    });

    it('should detect missing dependency waiting', async () => { try {
      // Setup: Complete coordination but no dependency waiting
      const messages = [];
      for (let i = 0; i < 15; i++) {
        messages.push({
          timestamp: Date.now() - i * 100,
          channel: i % 3 === 0 ? 'sprint:coordination' : i % 3 === 1 ? 'agent:lifecycle' : 'interface:ready',
          type: 'update',
          coordinatorId: 'coordinator-1',
          data: {},
        });
      }

      for (let i = 0; i < messages.length; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify(messages[i])
        );
      }

      // Run validation
      const result = await validator.validateEpicCoordination(testEpicId);

      // Assertions
      expect(result.metrics.dependencyWaiting).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'medium',
          issue: 'No dependency waiting detected',
        })
      );
    });

    it('should calculate correct score with bonuses', async () => { try {
      // Setup: Very active coordination (>100 messages)
      const messages = [];
      for (let i = 0; i < 150; i++) {
        messages.push({
          timestamp: Date.now() - i * 10,
          channel: i % 5 === 0 ? 'sprint:coordination' :
                   i % 5 === 1 ? 'agent:lifecycle' :
                   i % 5 === 2 ? 'interface:ready' :
                   i % 5 === 3 ? 'test:coordination' : 'other',
          type: i % 10 === 0 ? 'waiting:dependency' :
                i % 10 === 1 ? 'interface:published' : 'update',
          coordinatorId: `coordinator-${i % 7}`, // 7 coordinators
          data: { sprintId: `sprint-${i % 5}` },
        });
      }

      for (let i = 0; i < messages.length; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify(messages[i])
        );
      }

      // Run validation
      const result = await validator.validateEpicCoordination(testEpicId);

      // Assertions
      expect(result.score).toBeGreaterThan(0.95);
      expect(result.metrics.totalMessages).toBe(150);
      expect(result.metrics.coordinators.length).toBeGreaterThanOrEqual(5);
      expect(result.metrics.channelsUsed.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('getCoordinationSummary', () => {
    it('should generate human-readable summary', async () => { try {
      // Setup: Create sample messages
      const messages = [
        {
          timestamp: Date.now() - 1000,
          channel: 'sprint:coordination',
          type: 'claim',
          coordinatorId: 'coordinator-1',
          data: { sprintId: 'sprint-1' },
        },
        {
          timestamp: Date.now() - 500,
          channel: 'agent:lifecycle',
          type: 'agent:spawned',
          coordinatorId: 'coordinator-1',
          data: { agentId: 'agent-1' },
        },
      ];

      for (let i = 0; i < messages.length; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify(messages[i])
        );
      }

      // Add more to pass threshold
      for (let i = 2; i < 12; i++) {
        await redis.setex(
          `coordination:messages:${testEpicId}:${i}`,
          3600,
          JSON.stringify({
            timestamp: Date.now() - i * 100,
            channel: 'interface:ready',
            type: 'update',
            coordinatorId: 'coordinator-1',
            data: {},
          })
        );
      }

      // Get summary
      const summary = await validator.getCoordinationSummary(testEpicId);

      // Assertions
      expect(summary).toContain('Coordination Validation');
      expect(summary).toContain('Epic: epic-test-123');
      expect(summary).toContain('Messages:');
      expect(summary).toContain('Coordinators:');
      expect(summary).toContain('Channels:');
    });
  });
});
