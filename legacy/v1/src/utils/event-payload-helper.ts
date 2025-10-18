/**
 * Event Payload Helper - Standardized Event Payload Creation
 *
 * Provides utility functions for creating consistent event payloads
 * across all hierarchical coordination components with caller metadata.
 *
 * @module utils/event-payload-helper
 */

import { generateId } from './helpers.js';
import type { CallerIdentityInput } from '../coordination/validation-schemas.js';

/**
 * Standard event payload structure with caller metadata
 */
export interface StandardEventPayload {
  timestamp: number;
  caller?: CallerIdentity;
  traceId?: string;
  [key: string]: any; // Allow event-specific fields
}

/**
 * Caller identity for event attribution
 */
export interface CallerIdentity {
  id: string;
  type: 'user' | 'agent' | 'system' | 'service';
  roles?: string[];
}

/**
 * Create a standardized event payload with caller metadata
 *
 * @param basePayload - Event-specific fields
 * @param caller - Optional caller identity for attribution
 * @param traceId - Optional trace ID for distributed tracing
 * @returns Standardized event payload
 *
 * @example
 * ```typescript
 * const payload = createEventPayload(
 *   { workerId: 'worker-1', status: 'spawned' },
 *   { id: 'queen-agent', type: 'agent', roles: ['coordinator'] },
 *   'trace-123'
 * );
 * // Result: {
 * //   timestamp: 1234567890,
 * //   caller: { id: 'queen-agent', type: 'agent', roles: ['coordinator'] },
 * //   traceId: 'trace-123',
 * //   workerId: 'worker-1',
 * //   status: 'spawned'
 * // }
 * ```
 */
export function createEventPayload<T extends Record<string, any>>(
  basePayload: T,
  caller?: CallerIdentityInput,
  traceId?: string
): StandardEventPayload & T {
  const payload: StandardEventPayload & T = {
    ...basePayload,
    timestamp: Date.now(),
  };

  if (caller) {
    payload.caller = {
      id: caller.id,
      type: caller.type,
      roles: caller.roles,
    };
  }

  if (traceId) {
    payload.traceId = traceId;
  } else {
    // Auto-generate trace ID if not provided for traceability
    payload.traceId = generateId('trace');
  }

  return payload;
}

/**
 * Extract caller identity from standardized payload
 *
 * @param payload - Standardized event payload
 * @returns Caller identity or undefined
 */
export function extractCaller(payload: StandardEventPayload): CallerIdentity | undefined {
  return payload.caller;
}

/**
 * Extract trace ID from standardized payload
 *
 * @param payload - Standardized event payload
 * @returns Trace ID or undefined
 */
export function extractTraceId(payload: StandardEventPayload): string | undefined {
  return payload.traceId;
}

/**
 * Create a child event payload that inherits trace context from parent
 *
 * @param parentPayload - Parent event payload
 * @param childPayload - Child event-specific fields
 * @returns Child payload with inherited trace context
 *
 * @example
 * ```typescript
 * const parentPayload = createEventPayload(
 *   { taskId: 'task-1', status: 'delegated' },
 *   systemCaller,
 *   'trace-123'
 * );
 *
 * const childPayload = createChildEventPayload(parentPayload, {
 *   workerId: 'worker-1',
 *   result: 'success'
 * });
 * // Child inherits traceId 'trace-123' for correlation
 * ```
 */
export function createChildEventPayload<T extends Record<string, any>>(
  parentPayload: StandardEventPayload,
  childPayload: T
): StandardEventPayload & T {
  return createEventPayload(
    childPayload,
    parentPayload.caller,
    parentPayload.traceId
  );
}

/**
 * Validate that payload contains required standard fields
 *
 * @param payload - Event payload to validate
 * @returns True if valid, throws error otherwise
 */
export function validateStandardPayload(payload: any): payload is StandardEventPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Event payload must be an object');
  }

  if (typeof payload.timestamp !== 'number') {
    throw new Error('Event payload missing required field: timestamp (number)');
  }

  if (payload.caller !== undefined) {
    if (typeof payload.caller !== 'object' || payload.caller === null) {
      throw new Error('Event payload.caller must be an object');
    }

    if (typeof payload.caller.id !== 'string') {
      throw new Error('Event payload.caller.id must be a string');
    }

    if (!['user', 'agent', 'system', 'service'].includes(payload.caller.type)) {
      throw new Error('Event payload.caller.type must be one of: user, agent, system, service');
    }
  }

  if (payload.traceId !== undefined && typeof payload.traceId !== 'string') {
    throw new Error('Event payload.traceId must be a string');
  }

  return true;
}
