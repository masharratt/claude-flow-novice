/**
 * Event Payload Helper - Unit Tests
 *
 * Tests for standardized event payload creation
 */

import { describe, it, expect } from '@jest/globals';
import {
  createEventPayload,
  createChildEventPayload,
  extractCaller,
  extractTraceId,
  validateStandardPayload,
  type StandardEventPayload,
  type CallerIdentity
} from '../../../src/utils/event-payload-helper.js';

describe('Event Payload Helper', () => {
  describe('createEventPayload', () => {
    it('should create payload with timestamp and auto-generated traceId', () => {
      const payload = createEventPayload({ taskId: 'task-1', status: 'delegated' });

      expect(payload.timestamp).toBeGreaterThan(0);
      expect(payload.traceId).toBeDefined();
      expect(payload.traceId).toMatch(/^trace_/); // generateId uses underscores
      expect(payload.taskId).toBe('task-1');
      expect(payload.status).toBe('delegated');
    });

    it('should include caller metadata when provided', () => {
      const caller: CallerIdentity = {
        id: 'queen-agent',
        type: 'agent',
        roles: ['coordinator']
      };

      const payload = createEventPayload(
        { workerId: 'worker-1', status: 'spawned' },
        caller
      );

      expect(payload.caller).toEqual({
        id: 'queen-agent',
        type: 'agent',
        roles: ['coordinator']
      });
      expect(payload.workerId).toBe('worker-1');
      expect(payload.status).toBe('spawned');
    });

    it('should use provided traceId instead of auto-generating', () => {
      const payload = createEventPayload(
        { taskId: 'task-1' },
        undefined,
        'custom-trace-123'
      );

      expect(payload.traceId).toBe('custom-trace-123');
    });

    it('should merge base payload with standard fields without conflicts', () => {
      const caller: CallerIdentity = {
        id: 'system',
        type: 'system',
        roles: ['admin']
      };

      const payload = createEventPayload(
        {
          workerId: 'worker-1',
          type: 'backend-dev',
          capabilities: { skills: ['node', 'api'] }
        },
        caller,
        'trace-456'
      );

      expect(payload.timestamp).toBeDefined();
      expect(payload.caller?.id).toBe('system');
      expect(payload.traceId).toBe('trace-456');
      expect(payload.workerId).toBe('worker-1');
      expect(payload.type).toBe('backend-dev');
      expect(payload.capabilities).toEqual({ skills: ['node', 'api'] });
    });
  });

  describe('createChildEventPayload', () => {
    it('should inherit traceId and caller from parent', () => {
      const parentCaller: CallerIdentity = {
        id: 'parent-agent',
        type: 'agent',
        roles: ['coordinator']
      };

      const parentPayload = createEventPayload(
        { taskId: 'task-1', status: 'delegated' },
        parentCaller,
        'trace-parent-123'
      );

      const childPayload = createChildEventPayload(parentPayload, {
        workerId: 'worker-1',
        result: 'success'
      });

      expect(childPayload.traceId).toBe('trace-parent-123');
      expect(childPayload.caller?.id).toBe('parent-agent');
      expect(childPayload.workerId).toBe('worker-1');
      expect(childPayload.result).toBe('success');
      expect(childPayload.timestamp).toBeGreaterThanOrEqual(parentPayload.timestamp);
    });
  });

  describe('extractCaller', () => {
    it('should extract caller from payload', () => {
      const caller: CallerIdentity = {
        id: 'test-agent',
        type: 'agent',
        roles: ['worker']
      };

      const payload = createEventPayload({ test: true }, caller);
      const extracted = extractCaller(payload);

      expect(extracted).toEqual(caller);
    });

    it('should return undefined if no caller present', () => {
      const payload = createEventPayload({ test: true });
      const extracted = extractCaller(payload);

      expect(extracted).toBeUndefined();
    });
  });

  describe('extractTraceId', () => {
    it('should extract traceId from payload', () => {
      const payload = createEventPayload({ test: true }, undefined, 'trace-xyz');
      const traceId = extractTraceId(payload);

      expect(traceId).toBe('trace-xyz');
    });

    it('should return auto-generated traceId', () => {
      const payload = createEventPayload({ test: true });
      const traceId = extractTraceId(payload);

      expect(traceId).toBeDefined();
      expect(traceId).toMatch(/^trace_/); // generateId uses underscores
    });
  });

  describe('validateStandardPayload', () => {
    it('should validate correct payload', () => {
      const payload = createEventPayload({ test: true });

      expect(() => validateStandardPayload(payload)).not.toThrow();
      expect(validateStandardPayload(payload)).toBe(true);
    });

    it('should reject non-object payload', () => {
      expect(() => validateStandardPayload(null)).toThrow('Event payload must be an object');
      expect(() => validateStandardPayload('string')).toThrow('Event payload must be an object');
      expect(() => validateStandardPayload(123)).toThrow('Event payload must be an object');
    });

    it('should reject payload without timestamp', () => {
      const payload = { traceId: 'trace-123' };

      expect(() => validateStandardPayload(payload)).toThrow(
        'Event payload missing required field: timestamp (number)'
      );
    });

    it('should reject payload with invalid timestamp', () => {
      const payload = { timestamp: 'invalid' };

      expect(() => validateStandardPayload(payload)).toThrow(
        'Event payload missing required field: timestamp (number)'
      );
    });

    it('should reject payload with invalid caller object', () => {
      const payload = {
        timestamp: Date.now(),
        caller: 'invalid'
      };

      expect(() => validateStandardPayload(payload)).toThrow('Event payload.caller must be an object');
    });

    it('should reject payload with invalid caller.id', () => {
      const payload = {
        timestamp: Date.now(),
        caller: { id: 123, type: 'agent' }
      };

      expect(() => validateStandardPayload(payload)).toThrow('Event payload.caller.id must be a string');
    });

    it('should reject payload with invalid caller.type', () => {
      const payload = {
        timestamp: Date.now(),
        caller: { id: 'test', type: 'invalid' }
      };

      expect(() => validateStandardPayload(payload)).toThrow(
        'Event payload.caller.type must be one of: user, agent, system, service'
      );
    });

    it('should reject payload with invalid traceId type', () => {
      const payload = {
        timestamp: Date.now(),
        traceId: 123
      };

      expect(() => validateStandardPayload(payload)).toThrow('Event payload.traceId must be a string');
    });

    it('should accept valid payload with optional fields', () => {
      const payload = {
        timestamp: Date.now(),
        caller: {
          id: 'agent-1',
          type: 'agent' as const,
          roles: ['worker']
        },
        traceId: 'trace-123',
        customField: 'value'
      };

      expect(() => validateStandardPayload(payload)).not.toThrow();
      expect(validateStandardPayload(payload)).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should allow payload without caller (optional field)', () => {
      const payload = createEventPayload({ taskId: 'task-1' });

      expect(payload.caller).toBeUndefined();
      expect(validateStandardPayload(payload)).toBe(true);
    });

    it('should work with existing event structures', () => {
      // Simulate existing event that gets standardized
      const legacyEvent = { workerId: 'worker-1', status: 'idle' };
      const standardized = createEventPayload(legacyEvent);

      expect(standardized.workerId).toBe('worker-1');
      expect(standardized.status).toBe('idle');
      expect(standardized.timestamp).toBeDefined();
      expect(standardized.traceId).toBeDefined();
    });
  });
});
